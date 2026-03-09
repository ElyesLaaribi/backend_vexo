const asyncHandler = require("../../utils/errors/asyncHandler.js");
const CustomError = require("../../utils/errors/CustomError.js");
const Verification = require("../../models/verification.model.js");

const requireVerifiedForPayout = asyncHandler(async (req, res, next) => {
  const verification = await Verification.findOne({ user: req.user._id }).select(
    "status",
  );

  if (verification?.status !== "verified") {
    return next(
      new CustomError(
        "You must verify your identity before withdrawing funds.",
        403,
      ),
    );
  }

  next();
});

module.exports = requireVerifiedForPayout;
