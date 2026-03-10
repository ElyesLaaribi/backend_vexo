const path = require("path");
const { S3Client } = require("@aws-sdk/client-s3");

const Verification = require("../models/verification.model.js");
const asyncHandler = require("../utils/errors/asyncHandler.js");
const CustomError = require("../utils/errors/CustomError.js");
const {
  uploadToCloud,
  deleteFolderFromCloud,
} = require("../utils/aws/upload.js");

const s3Config = {
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION,
};
if (process.env.AWS_ENDPOINT) {
  s3Config.endpoint = process.env.AWS_ENDPOINT;
  s3Config.forcePathStyle = true;
}
const s3 = new S3Client(s3Config);

const allowedStatuses = new Set([
  "unverified",
  "pending_verification",
  "verified",
  "rejected",
]);

const documentTypes = new Set(["passport", "id", "driving_license"]);

const buildS3Url = (key) => {
  if (process.env.AWS_PUBLIC_BASE_URL) {
    return `${process.env.AWS_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }

  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const normalizeStatusResponse = (verification) => {
  if (!verification) {
    return {
      verification_status: "unverified",
      document_type: null,
      document_image_url: null,
      selfie_image_url: null,
      created_at: null,
      reviewed_at: null,
      rejection_reason: null,
    };
  }

  return {
    verification_status: verification.status,
    document_type: verification.documentType,
    document_image_url: verification.documentImageUrl,
    selfie_image_url: verification.selfieImageUrl,
    created_at: verification.createdAt,
    reviewed_at: verification.reviewedAt,
    rejection_reason: verification.rejectionReason,
  };
};

const submitVerification = asyncHandler(async (req, res, next) => {
  const { document_type: documentType } = req.body;
  const documentFile = req.files?.document_image?.[0];
  const selfieFile = req.files?.selfie_image?.[0];

  if (!documentTypes.has(documentType)) {
    return next(new CustomError("Invalid document type provided.", 400));
  }

  if (!documentFile || !selfieFile) {
    return next(
      new CustomError(
        "Both a document image and a selfie image are required.",
        400,
      ),
    );
  }

  // ── Guard: block verified and already-pending resubmissions ──
  const existingVerification = await Verification.findOne({
    user: req.user._id,
  });
  if (existingVerification?.status === "verified") {
    return next(new CustomError("Your identity is already verified.", 400));
  }
  if (existingVerification?.status === "pending_verification") {
    return next(
      new CustomError(
        "Your documents are already under review. Please wait for a decision before resubmitting.",
        400,
      ),
    );
  }

  // ── Derive old S3 folder path for cleanup after successful resubmission ──
  // Only relevant when status is "rejected" and old files exist.
  const oldFolderPath = (() => {
    if (!existingVerification?.documentImageUrl) return null;
    try {
      const match = existingVerification.documentImageUrl.match(
        /(verifications\/[^/]+\/\d+)\/.+$/,
      );
      return match ? match[1] : null;
    } catch {
      return null;
    }
  })();

  // ── Build new S3 keys ──
  const timestamp = Date.now();
  const baseFolder = `verifications/${req.user._id}/${timestamp}`;

  const documentExtension = path.extname(documentFile.originalname) || ".jpg";
  const selfieExtension = path.extname(selfieFile.originalname) || ".jpg";
  const documentKey = `${baseFolder}/document${documentExtension.toLowerCase()}`;
  const selfieKey = `${baseFolder}/selfie${selfieExtension.toLowerCase()}`;

  // ── Upload document — fail fast if S3 is unreachable ──
  try {
    await uploadToCloud(
      s3,
      {
        ...documentFile,
        originalname: `document${documentExtension.toLowerCase()}`,
      },
      baseFolder,
    );
  } catch (err) {
    console.error("[Verification] Document upload failed:", err.message);
    return next(
      new CustomError(
        "Failed to upload identity document. Please try again.",
        500,
      ),
    );
  }

  // ── Upload selfie — roll back the document upload if this fails ──
  try {
    await uploadToCloud(
      s3,
      { ...selfieFile, originalname: `selfie${selfieExtension.toLowerCase()}` },
      baseFolder,
    );
  } catch (err) {
    console.error(
      "[Verification] Selfie upload failed, rolling back document:",
      err.message,
    );
    deleteFolderFromCloud(s3, baseFolder).catch((e) =>
      console.error(
        "[Verification] Rollback of document upload failed:",
        e.message,
      ),
    );
    return next(
      new CustomError("Failed to upload selfie photo. Please try again.", 500),
    );
  }

  // ── Persist to DB — roll back both uploads if the write fails ──
  let verification;
  try {
    verification = await Verification.findOneAndUpdate(
      { user: req.user._id },
      {
        user: req.user._id,
        documentType,
        documentImageUrl: buildS3Url(documentKey),
        selfieImageUrl: buildS3Url(selfieKey),
        status: "pending_verification",
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  } catch (err) {
    console.error(
      "[Verification] DB write failed after S3 uploads, rolling back:",
      err.message,
    );
    deleteFolderFromCloud(s3, baseFolder).catch((e) =>
      console.error(
        "[Verification] Rollback of new uploads failed:",
        e.message,
      ),
    );
    return next(
      new CustomError(
        "Failed to save verification request. Please try again.",
        500,
      ),
    );
  }

  // ── Clean up old rejected files (fire-and-forget — never blocks the response) ──
  if (oldFolderPath && oldFolderPath !== baseFolder) {
    deleteFolderFromCloud(s3, oldFolderPath).catch((err) =>
      console.error(
        `[Verification] Non-critical: could not delete old S3 folder "${oldFolderPath}":`,
        err.message,
      ),
    );
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Verification documents submitted successfully.",
    verification: normalizeStatusResponse(verification),
  });
});

const getVerificationStatus = asyncHandler(async (req, res) => {
  const verification = await Verification.findOne({ user: req.user._id });

  res.status(200).json({
    status: 200,
    success: true,
    verification: normalizeStatusResponse(verification),
  });
});

const adminReviewVerification = asyncHandler(async (req, res, next) => {
  const { verificationId } = req.params;
  const { status, rejection_reason: rejectionReason } = req.body;

  if (!allowedStatuses.has(status)) {
    return next(new CustomError("Invalid verification status.", 400));
  }

  const verification = await Verification.findById(verificationId);
  if (!verification) {
    return next(new CustomError("Verification request not found.", 404));
  }

  verification.status = status;
  verification.reviewedAt = new Date();
  verification.reviewedBy = req.user.email;
  verification.rejectionReason =
    status === "rejected" ? rejectionReason || "Rejected by admin." : null;

  await verification.save();

  res.status(200).json({
    status: 200,
    success: true,
    message: "Verification request reviewed successfully.",
    verification: normalizeStatusResponse(verification),
  });
});

const listVerificationRequests = asyncHandler(async (req, res, next) => {
  const {
    status = "pending_verification",
    page = "1",
    limit = "20",
  } = req.query;
  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const limitNumber = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  if (status !== "all" && !allowedStatuses.has(status)) {
    return next(new CustomError("Invalid verification status filter.", 400));
  }

  const filter = status === "all" ? {} : { status };

  const [items, total] = await Promise.all([
    Verification.find(filter)
      .populate("user", "email firstName lastName country")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber),
    Verification.countDocuments(filter),
  ]);

  res.status(200).json({
    status: 200,
    success: true,
    page: pageNumber,
    limit: limitNumber,
    total,
    items: items.map((item) => ({
      id: item._id,
      user: item.user
        ? {
            id: item.user._id,
            email: item.user.email,
            first_name: item.user.firstName,
            last_name: item.user.lastName,
            country: item.user.country,
          }
        : null,
      verification: normalizeStatusResponse(item),
    })),
  });
});

module.exports = {
  submitVerification,
  getVerificationStatus,
  adminReviewVerification,
  listVerificationRequests,
};
