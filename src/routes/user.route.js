const express = require("express")
const {
  register,
  login,
  verifyOtp,
  resendOtp,
  refresh_access_token,
  deleteAccount,
  ValidateUserToken,
  forgotPassword,
  resetPassword,
} = require("../controllers/user.controller.js")
const router = express.Router()
const { verifyTokenStartApp } = require("../utils/jwtUtils")
const authorize = require("../utils/authorization.js")

// ─── Public auth routes ───────────────────────────────────────────────────────
router.post("/register", register)            // new: sign up + send OTP
router.post("/verify-email", verifyOtp)       // new: confirm OTP → tokens
router.post("/resend-otp", resendOtp)         // new: resend OTP code
router.post("/login", login)                  // existing users only
router.post("/refresh", refresh_access_token)
router.post("/forgot-password", forgotPassword)
router.patch("/change-password/:token", resetPassword)

// ─── Protected routes ─────────────────────────────────────────────────────────
router.post("/validate", verifyTokenStartApp, ValidateUserToken)
router.delete("/delete", authorize, deleteAccount)

module.exports = router