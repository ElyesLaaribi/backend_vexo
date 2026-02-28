const express = require("express")
const { createCheckoutSession, successPaymentUrl } = require("../controllers/payment.controller.js")
const router = express.Router()
const authorize = require("../utils/authorization.js")

// USED ...
router.post('/create_checkout_session', authorize, createCheckoutSession)

// USED ...
router.get('/success', successPaymentUrl)



module.exports = router