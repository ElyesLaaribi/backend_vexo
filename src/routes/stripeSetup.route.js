const express = require ("express") 
const { setupStripeConnect , setupStripeBanking, createStripeAccountLink  } = require("../controllers/stripeSetup.controller.js")
const router = express.Router() 
const authorize = require("../utils/authorization.js") 


// USED ...
router.post("/connect" , authorize   , setupStripeConnect )


// USED ...
router.post("/banking" , authorize  , setupStripeBanking )

router.post("/account-link", authorize, createStripeAccountLink)
 

module.exports = router

