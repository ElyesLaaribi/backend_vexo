const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    documentType: {
      type: String,
      enum: ["passport", "id", "driving_license"],
      required: true,
    },
    documentImageUrl: {
      type: String,
      required: true,
    },
    selfieImageUrl: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["unverified", "pending_verification", "verified", "rejected"],
      default: "pending_verification",
      index: true,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: String,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  },
);

const Verification = mongoose.model("verification", verificationSchema);

module.exports = Verification;
