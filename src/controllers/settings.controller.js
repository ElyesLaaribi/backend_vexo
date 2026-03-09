const asyncHandler = require("../utils/errors/asyncHandler.js")
 

const settings = asyncHandler (async (req ,res , next)=> {
 
 
      res.status(200).json(
        {
          status : 200 , 
          message : 'success',
          kycOnboardRequired : req.kycOnboardRequired,
          bankSetupRequired : req.bankSetupRequired ,
          hasPhoneNumber : req.hasPhoneNumber  ,
          verificationStatus : req.verificationStatus  ,
          country : req.user.country
        }
      )
    }
)


module.exports = settings


 
