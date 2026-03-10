const asyncHandler = require("../utils/errors/asyncHandler.js");

const adminEmails = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const settings = asyncHandler(async (req, res) => {
  const isAdmin = adminEmails.includes((req.user?.email || "").toLowerCase());
  const stripeAccountStatus = req.user?.StripeAccountStatus || "unverified";
  const stripeAccountId = req.user?.stripeAccountId || null;
  const stripeOnboardingRequired =
    !stripeAccountId || stripeAccountStatus !== "verified";
  const manualKycRequired = Boolean(req.kycOnboardRequired);

  res.status(200).json({
    status: 200,
    message: "success",
    kycOnboardRequired: manualKycRequired,
    bankSetupRequired: req.bankSetupRequired,
    hasPhoneNumber: req.hasPhoneNumber,
    verificationStatus: req.verificationStatus,
    country: req.user.country,
    stripeAccountStatus,
    stripeOnboardingRequired,
    stripeAccountId,
    isAdmin,
  });
});

module.exports = settings;


 
