const User = require("../models/user.model.js")
const asyncHandler = require("../utils/errors/asyncHandler.js")
const CustomError = require("../utils/errors/CustomError.js")
const { generateAccesToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwtUtils.js")
const { sendEmail, sendOtpEmail } = require("../utils/emails/email.js")
const crypto = require("crypto")
const bcrypt = require("bcrypt")
const FCM = require("../models/fcmToken.model.js")

// ─── helpers ─────────────────────────────────────────────────────────────────

const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString()

// ─── REGISTER (new users) ─────────────────────────────────────────────────────
const register = asyncHandler(async (req, res, next) => {
  let { email, password } = req.body
  if (!email || !password) return next(new CustomError("Email and password are required", 400))
  email = email.toLowerCase().trim()

  // Block if already verified
  const existing = await User.findOne({ email })
  if (existing && existing.emailVerified) {
    return next(new CustomError("An account with this email already exists. Please sign in.", 409))
  }

  const otp = generateOtp()
  const hashedOtp = await bcrypt.hash(otp, 10)
  const expires = new Date(Date.now() + 15 * 60 * 1000) // 15 min

  if (existing && !existing.emailVerified) {
    // Resend new OTP to pending account
    existing.password = password  // Update password in case they changed it
    existing.emailOtp = hashedOtp
    existing.emailOtpExpires = expires
    existing.emailOtpSentAt = new Date()
    await existing.save()
  } else {
    await User.create({
      email,
      password,
      emailVerified: false,
      emailOtp: hashedOtp,
      emailOtpExpires: expires,
      emailOtpSentAt: new Date(),
    })
  }

  try {
    await sendOtpEmail(email, otp)
  } catch (e) {
    console.error("[register] Failed to send OTP email:", e.message)
    return next(new CustomError("Failed to send verification email. Try again.", 500))
  }

  res.status(200).json({
    status: 200,
    success: true,
    message: "Verification code sent to your email.",
  })
})

// ─── VERIFY OTP ───────────────────────────────────────────────────────────────
const verifyOtp = asyncHandler(async (req, res, next) => {
  let { email, otp } = req.body
  if (!email || !otp) return next(new CustomError("Email and OTP are required", 400))
  email = email.toLowerCase().trim()

  const user = await User.findOne({ email })
  if (!user) return next(new CustomError("No account found for this email.", 404))
  if (user.emailVerified) return next(new CustomError("Email is already verified. Please sign in.", 400))

  if (!user.emailOtp || !user.emailOtpExpires) {
    return next(new CustomError("No verification code found. Request a new one.", 400))
  }
  if (user.emailOtpExpires < Date.now()) {
    return next(new CustomError("Verification code has expired. Request a new one.", 400))
  }

  const isValid = await bcrypt.compare(otp.trim(), user.emailOtp)
  if (!isValid) return next(new CustomError("Invalid verification code.", 400))

  // Mark verified and clear OTP fields
  user.emailVerified = true
  user.emailOtp = undefined
  user.emailOtpExpires = undefined
  user.emailOtpSentAt = undefined
  await user.save({ validateBeforeSave: false })

  const access = generateAccesToken(user._id)
  const refresh = generateRefreshToken(user._id)

  res.status(200).json({
    status: 200,
    success: true,
    message: "Email verified successfully.",
    accessToken: access,
    refreshToken: refresh,
    user_id: user._id,
    user,
    setupComplete: false,
  })
})

// ─── RESEND OTP ───────────────────────────────────────────────────────────────
const resendOtp = asyncHandler(async (req, res, next) => {
  let { email } = req.body
  if (!email) return next(new CustomError("Email is required", 400))
  email = email.toLowerCase().trim()

  const user = await User.findOne({ email })
  if (!user) return next(new CustomError("No account found for this email.", 404))
  if (user.emailVerified) return next(new CustomError("Email is already verified.", 400))

  // Rate limit: 1 resend per 60 seconds
  if (user.emailOtpSentAt && Date.now() - user.emailOtpSentAt.getTime() < 60_000) {
    const waitSec = Math.ceil((60_000 - (Date.now() - user.emailOtpSentAt.getTime())) / 1000)
    return next(new CustomError(`Please wait ${waitSec} seconds before requesting a new code.`, 429))
  }

  const otp = generateOtp()
  const hashedOtp = await bcrypt.hash(otp, 10)
  user.emailOtp = hashedOtp
  user.emailOtpExpires = new Date(Date.now() + 15 * 60 * 1000)
  user.emailOtpSentAt = new Date()
  await user.save({ validateBeforeSave: false })

  try {
    await sendOtpEmail(email, otp)
  } catch (e) {
    console.error("[resendOtp] Failed to send OTP email:", e.message)
    return next(new CustomError("Failed to send verification email. Try again.", 500))
  }

  res.status(200).json({ status: 200, success: true, message: "New code sent." })
})

// ─── LOGIN (existing + verified users only) ───────────────────────────────────
const login = asyncHandler(async (req, res, next) => {
  try {
    let { email, password } = req.body
    if (!email || !password) return next(new CustomError("Enter your email and password", 400))
    email = email.toLowerCase().trim()

    var ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || null
    console.log(`[login] attempt — email: ${email} | ip: ${ip}`)

    const user = await User.findOne({ email })

    if (!user) {
      return next(new CustomError("No account found. Please create an account first.", 404))
    }

    if (!(await user.comparePasswords(password))) {
      return next(new CustomError("Incorrect password.", 401))
    }

    // Legacy accounts (created before email verification) default emailVerified to false
    // but we treat any account without the field as verified to avoid locking out old users.
    if (user.emailVerified === false && user.emailOtp) {
      return next(new CustomError("Please verify your email before signing in.", 403))
    }

    const access = generateAccesToken(user._id)
    const refresh = generateRefreshToken(user._id)

    res.status(200).json({
      status: 200,
      message: "success",
      accessToken: access,
      refreshToken: refresh,
      user_id: user._id,
      user,
      setupComplete: user.stripeAccountId == null ? false : true,
    })
  } catch (e) {
    console.error("[login] error:", e.message)
    return next(new CustomError("Connection lost! try again later.", 400))
  }
})

// ─── TOKEN REFRESH ────────────────────────────────────────────────────────────
const refresh_access_token = asyncHandler(async (req, res, next) => {
  const { reftoken } = req.body
  if (!reftoken) return next(new CustomError("You need to re-login again!"))

  const decoded = verifyRefreshToken(reftoken, next)
  const user = await User.findOne({ _id: decoded.id })
  if (!user) return next(new CustomError("You need to re-login again!"))

  const access_jwt = generateAccesToken(decoded.id)

  res.status(200).json({
    status: 200,
    message: "success",
    access_token: access_jwt,
    refresh_token: reftoken,
  })
})

// ─── VALIDATE TOKEN ───────────────────────────────────────────────────────────
const ValidateUserToken = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    message: "Token is valid",
    user: req.user,
    stripeSetup: req.StripeAccount == null ? false : true,
  })
})

// ─── DELETE ACCOUNT ───────────────────────────────────────────────────────────
const Media = require("../models/media.model.js")
const Bank = require("../models/bank.model.js")
const Payout = require("../models/payout.model.js")

const deleteAccount = asyncHandler(async (req, res, next) => {
  try {
    const id = req.user._id
    console.log(`[deleteAccount] email: ${req.user.email}`)
    await User.findOneAndDelete({ _id: id })
    await Media.deleteMany({ user: id })
    await Bank.deleteMany({ user: id })
    await Payout.deleteMany({ user: id })
    await FCM.findOneAndDelete({ user: id })

    res.status(200).json({ status: "success", statusCode: 200, message: "Account deleted." })
  } catch (e) {
    return next(new CustomError("Failed deleting this account! Contact us for help.", 400))
  }
})

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
const forgotPassword = asyncHandler(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email })
  if (!user) return next(new CustomError("No user registered with this email address.", 400))

  const resetToken = user.createResetPasswordToken()
  await user.save({ validateBeforeSave: false })

  const resetUrl = `${(process.env.FRONT_URL || "").replace(/\/$/, "")}/account/change-password/${resetToken}`
  const message = "We received your password reset request. Use the link below to set a new password."

  try {
    await sendEmail({ email: user.email, subject: "Reset your Vexo Password", message, url: resetUrl })
    res.status(200).json({ status: "success", success: true, msg: "Password reset email sent." })
  } catch (err) {
    user.passwordResetToken = undefined
    user.passwordResetTokenExpires = undefined
    await user.save({ validateBeforeSave: false })
    return next(new CustomError("Failed to send password reset email. Please try again later.", 400))
  }
})

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res, next) => {
  const token = crypto.createHash("sha256").update(req.params.token).digest("hex")
  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetTokenExpires: { $gt: Date.now() },
  })

  if (!user) return next(new CustomError("Token is invalid or expired.", 400))

  user.password = req.body.password
  user.passwordResetToken = undefined
  user.passwordResetTokenExpires = undefined
  await user.save()

  res.status(200).json({ status: "success", message: "Password has been changed." })
})

module.exports = {
  register,
  login,
  verifyOtp,
  resendOtp,
  refresh_access_token,
  deleteAccount,
  ValidateUserToken,
  forgotPassword,
  resetPassword,
}