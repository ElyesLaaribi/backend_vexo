const express = require("express");
const multer = require("multer");

const authorize = require("../utils/authorization.js");
const checkBan = require("../utils/isBanned/isBanned.js");
const requireAdmin = require("../utils/requireAdmin.js");
const {
  submitVerification,
  getVerificationStatus,
  adminReviewVerification,
  listVerificationRequests,
} = require("../controllers/verification.controller.js");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/submit_verification",
  authorize,
  checkBan,
  upload.fields([
    { name: "document_image", maxCount: 1 },
    { name: "selfie_image", maxCount: 1 },
  ]),
  submitVerification,
);

router.get("/status", authorize, getVerificationStatus);

router.get(
  "/admin/requests",
  authorize,
  requireAdmin,
  listVerificationRequests,
);

router.patch(
  "/admin/review/:verificationId",
  authorize,
  requireAdmin,
  adminReviewVerification,
);

module.exports = router;
