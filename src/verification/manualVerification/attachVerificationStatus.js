const asyncHandler = require("../../utils/errors/asyncHandler.js");
const Verification = require("../../models/verification.model.js");

const attachVerificationStatus = asyncHandler(async (req, res, next) => {
  const verification = await Verification.findOne({ user: req.user._id }).select(
    "status",
  );

  req.verificationStatus = verification?.status || "unverified";
  req.kycOnboardRequired = req.verificationStatus !== "verified";

  next();
});

module.exports = attachVerificationStatus;
