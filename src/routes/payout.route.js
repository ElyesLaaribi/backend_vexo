const express = require ("express") 
const {requestPayout , getAllPayouts , getAllPayoutsForScreen } = require("../controllers/payout.controller.js")
const router = express.Router() 
const authorize = require("../utils/authorization.js")
const checkBankStatus = require("../utils/bankingUtils/bankStatus.js")
const requireVerifiedForPayout = require("../verification/manualVerification/requireVerifiedForPayout.js")
const checkBan = require("../utils/isBanned/isBanned.js")

// USED ...
router.post("/r-payout" , authorize , checkBan ,checkBankStatus , requireVerifiedForPayout   , requestPayout)

// USED ...
router.get("/payouts" , authorize  ,  getAllPayouts)

router.get("/payoutsAll" , authorize  ,  getAllPayoutsForScreen)

module.exports = router
