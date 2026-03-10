const asyncHandler = require("../utils/errors/asyncHandler.js")
const CustomError = require("../utils/errors/CustomError.js")
const Stripe = require('stripe');
const Payout = require('../models/payout.model.js')
const Verification = require('../models/verification.model.js')
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const ban = require("../utils/isBanned/ban.js")

const normalizeCurrencyCode = (value, fallback = null) => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.toLowerCase();
  }
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.toLowerCase();
  }
  return fallback;
};

const pickBalanceBucket = (entries = [], preferredCurrency, fallbackCurrency = "usd") => {
  const normalizedPreferred = normalizeCurrencyCode(preferredCurrency);
  const normalizedFallback = normalizeCurrencyCode(fallbackCurrency, "usd");

  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      amount: 0,
      currency: normalizedPreferred || normalizedFallback,
    };
  }

  if (normalizedPreferred) {
    const matches = entries.filter(
      (entry) => normalizeCurrencyCode(entry.currency) === normalizedPreferred
    );
    if (matches.length > 0) {
      const amount = matches.reduce(
        (sum, entry) => sum + (entry.amount || 0),
        0
      );
      return {
        amount,
        currency: normalizedPreferred,
      };
    }
  }

  const nonZero = entries.find((entry) => (entry.amount || 0) > 0);
  if (nonZero) {
    return {
      amount: nonZero.amount || 0,
      currency:
        normalizeCurrencyCode(nonZero.currency) ||
        normalizedPreferred ||
        normalizedFallback,
    };
  }

  const fallback = entries[0];
  return {
    amount: fallback?.amount || 0,
    currency:
      normalizeCurrencyCode(fallback?.currency) ||
      normalizedPreferred ||
      normalizedFallback,
  };
};

const requestPayout = asyncHandler(async (req , res , next)=> {
 
 
           //===================  LOGS
      console.log("==== user requested payout ====")
      console.log(`with email of ${req.user.email}`) 

  if ( !req.user) return next(new CustomError("sign in to see your balance."))
    const stripeId = req.user.stripeAccountId
    if (!stripeId) return next(new CustomError("Stripe account not found.", 400))

    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeId,
    });

    const preferredCurrency =
      req.user?.currency ||
      balance?.available?.[0]?.currency ||
      balance?.pending?.[0]?.currency ||
      "usd";

    const availableBucket = pickBalanceBucket(
      balance?.available,
      preferredCurrency
    );
    const pendingBucket = pickBalanceBucket(
      balance?.pending,
      availableBucket.currency || preferredCurrency
    );

    const amount = availableBucket.amount
    const pendingAmount = pendingBucket.amount
    if (amount<0 || pendingAmount<0) {
      await ban(user.id)
      return next(new CustomError("You are restricted from doing this action",400))
    }
    if (amount == 0  ) return next(new CustomError("insufisant funds!",400))
     
      
    const curr = normalizeCurrencyCode(
      availableBucket.currency || preferredCurrency || "usd",
      "usd"
    )
    // change it to request all amount as a payout currently only  *** 500 cents ***
    const payout = await stripe.payouts.create(
      {
        amount: amount,
        //amount ,
        currency: curr,
        destination : req.user.bankId , 
        metadata : {
          user : req.user._id.toString()
        }
      },
      {
        stripeAccount: stripeId,
      }
    );
 
    res.status(200).json(
      {
        status: 200 ,
        success : true , 
        data : {
          amount : amount ,
          date : `${new Date(Date.now()).toLocaleString().split(' ')[0]}`,
          status : payout.status,
          arriveBy : `${ new Date(payout.arrival_date * 1000).toLocaleString()}`
        } 
      }
    )

})


const getAllPayouts = asyncHandler(async (req, res, next) => {
  try {
    const stripeId = req.user.stripeAccountId;
    if (!stripeId) return next(new CustomError("Stripe account not found.", 400))
    const verification = await Verification.findOne({ user: req.user._id }).select(
      "status",
    );
 
    const balance = await stripe.balance.retrieve({
      stripeAccount: stripeId,
    });

    const preferredCurrency =
      req.user?.currency ||
      balance?.available?.[0]?.currency ||
      balance?.pending?.[0]?.currency ||
      "usd";

    const availableBucket = pickBalanceBucket(
      balance?.available,
      preferredCurrency
    );
    const pendingBucket = pickBalanceBucket(
      balance?.pending,
      availableBucket.currency || preferredCurrency
    );
 
    const payouts = await Payout.find({ user: req.user._id })
    .select({
        "amount": 1,
        "date": 1,
        "status": 1,
        "arriveBy": 1
    })
    .sort({ date: -1 }) // Sort by date descending (newest first)
    .limit(4); // Limit to only 4 documents
   
    const responseCurrency = normalizeCurrencyCode(
      availableBucket.currency ||
      pendingBucket.currency ||
      preferredCurrency ||
      "usd",
      "usd"
    )
 
    res.status(200).json({
      status: 200,
      success: true,
      balance: {
        currency: responseCurrency,
        available: availableBucket.amount  ,
        pending: pendingBucket.amount  ,
      },
      verificationStatus: verification?.status || "unverified",
      canWithdraw: verification?.status === "verified",
      payouts,
    });
  } catch (error) { 
    next(new CustomError('Failed to retrieve payouts and balance', 400));
  }
});



const getAllPayoutsForScreen = asyncHandler(async (req, res, next) => {
  try {
   
 
 
    const payouts = await Payout.find({ user: req.user._id })
    .select({
      "amount" : 1 , 
      "date" : 1 ,
      "status" : 1 ,
    })
    .sort({ date: -1 });

 
 
    res.status(200).json({
      status: 200,
      success: true, 
      payouts,
    });
  } catch (error) { 
    next(new CustomError('Failed to retrieve payouts and balance', 400));
  }
});

module.exports = {requestPayout , getAllPayouts , getAllPayoutsForScreen}
