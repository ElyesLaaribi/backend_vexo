const asyncHandler = require("./errors/asyncHandler.js");
const CustomError = require("./errors/CustomError.js");

const requireAdmin = asyncHandler(async (req, res, next) => {
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes((req.user?.email || "").toLowerCase())) {
    return next(new CustomError("Admin access is required for this action.", 403));
  }

  next();
});

module.exports = requireAdmin;
