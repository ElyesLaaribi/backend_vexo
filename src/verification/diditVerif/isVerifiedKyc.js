const asyncHandler = require("../../utils/errors/asyncHandler");
const CustomError = require("../../utils/errors/CustomError");
const Verification = require("../../models/verification.model")

const isVerifiedMiddleWare = asyncHandler(async (req, res, next) => {

  // TODO: REMOVE FOR PRODUCTION — temporary KYC bypass for testing
  if (process.env.SKIP_KYC === 'true') {
    console.log('⚠️  KYC check SKIPPED (SKIP_KYC=true)');
    req.kycOnboardRequired = false;
    return next();
  }
  // END TODO

  try {
    userId = req.user._id

    const verif = await Verification.findOne({ user: userId })

    if (!verif) {
      return next(new CustomError("We need to verify your identity before allowing any actions! Go to settings and finish Your account Setup.", 400))
    }

    if (verif.status.toLowerCase() == 'approved' || verif.status.toLowerCase() == 'in review') {
      req.kycOnboardRequired = false
      next()
    }
    else {
      return next(new CustomError("Verification process has been failed, We ask you to verify again or contact us for further help", 400))
    }

  }
  catch (e) {
    return next(new CustomError("Something went wrong please try again later !", 400))
  }


})

module.exports = isVerifiedMiddleWare