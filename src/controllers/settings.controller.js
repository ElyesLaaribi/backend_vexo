const asyncHandler = require("../utils/errors/asyncHandler.js");

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const settings = asyncHandler(async (req, res) => {
  const isAdmin = adminEmails.includes((req.user?.email || "").toLowerCase());

  res.status(200).json({
    status: 200,
    message: "success",
    kycOnboardRequired: req.kycOnboardRequired,
    bankSetupRequired: req.bankSetupRequired,
    hasPhoneNumber: req.hasPhoneNumber,
    verificationStatus: req.verificationStatus,
    country: req.user.country,
    isAdmin,
  });
});

module.exports = settings;


 
