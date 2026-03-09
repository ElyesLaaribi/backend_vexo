const express = require("express")
const { createCheckoutSession, successPaymentUrl } = require("../controllers/payment.controller.js")
const router = express.Router()

// Public routes — buyers are NOT signed-in users
router.post('/create_checkout_session', createCheckoutSession)
router.get('/success', successPaymentUrl)

module.exports = router
