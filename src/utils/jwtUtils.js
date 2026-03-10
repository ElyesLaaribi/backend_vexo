const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const CustomError = require("./errors/CustomError")
const User = require("../models/user.model");
const asyncHandler = require('./errors/asyncHandler');
dotenv.config();

const generateAccesToken = (userId)=> { 
  return jwt.sign({id : userId} , process.env.JWT_SECRET , {expiresIn : process.env.JWT_ACCESS_EXPIRATION || '15m'})
}

const generateRefreshToken = (userId) => { 
  return jwt.sign({id : userId} , process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET , {expiresIn : '30d'})
}

const verifyAccessToken = (token , next) => {
  try{
    return jwt.verify(token , process.env.JWT_SECRET)
  }
  catch(e) { 
    return next(new CustomError('access token! expired #needRefresh' , 488))
  }
}

const verifyRefreshToken = (token , next) => {
  try{
    return jwt.verify(token , process.env.JWT_REFRESH_SECRET)
  }
  catch(e) {  
    return next(new CustomError('refresh token! expired #needNewRefreshToken' , 599))
  }
}


const verifyTokenStartApp =  asyncHandler(async(req, res, next) => {
   try {
    
    const token = req.headers['authorization'];  
    if (!token) {
      return next(new CustomError('No token provided',500));
    }
   
    const tokenWithoutBearer = token.startsWith('Bearer ') ? token.split(" ")[1] : token;
   
    const decoded =  verifyAccessToken(tokenWithoutBearer , next)
 
    const user = await User.findOne({_id : decoded.id})
    if(!user) return next(new CustomError("no user with these data",500))
    req.user = user;
    req.StripeAccount = user.stripeAccountId
  
    next();
   }
   catch(e){
    console.log("error in verify token start app error is : ")
    console.log(e)
   }
})

module.exports = {generateAccesToken ,generateRefreshToken  , verifyAccessToken , verifyRefreshToken , verifyTokenStartApp}



