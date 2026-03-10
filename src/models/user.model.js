const mongoose = require("mongoose")
const bcrypt = require('bcrypt')
const CustomError = require("../utils/errors/CustomError")
const crypto = require("crypto")


const userSchema = new mongoose.Schema({
  email: {
    type : String,
    unique : true ,
    required : true
  },
  password: 
     {
    type : String,
    required : true
  },
  stripeAccountId:  {
    type : String,
    default : null
  },
  country: {
    type : String,
    default : null,
  },
  currency:  {
    type : String,
    default : null,
  },
   phone:  {
    type : String,
    default : null,
  },
  firstName :  {
    type : String,
    default : null,
  },
  lastName: {
    type : String,
    default : null,
  },
  dob : {
    type : Number , 
    default : 0
  },
  mob :  {
    type : Number , 
    default : 0
  },
  yob : {
    type : Number , 
    default : 0
  },
  restricted: { 
    type: Boolean,
     default: false
     },
  bankId: {
      type: String,
      default :null,
     },
  StripeAccountStatus: { 
    type: String,
    default: null
   },
   passwordResetToken: String , 
   passwordResetTokenExpires : Date,

  // Email verification
  emailVerified: { type: Boolean, default: false },
  emailOtp: String,           // bcrypt-hashed 6-digit code
  emailOtpExpires: Date,      // 15 min window
  emailOtpSentAt: Date,       // for 60-s resend rate-limit

});


userSchema.pre("save" , async function (next) {

  try{
  if(!this.isModified("password")) {return next()}
  if (this.isNew || this.isModified("password")) {
    let pass = await bcrypt.hash(this.password , 10)
    this.password = pass
    next()
    }
  next() }
  catch (e) { return next(new CustomError("error saving new user !")) }
})

 

userSchema.methods.createResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex')
  this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex')
  this.passwordResetTokenExpires = Date.now() + 10 *60 * 1000

  return resetToken
}




//methods by schema password compare ....
userSchema.methods.comparePasswords =   async function comparePasswords(pwd) {
  return await bcrypt.compare(pwd , this.password)
}


const User = mongoose.model('User', userSchema);

module.exports = User 