const User = require("../models/user.model.js")
const Bank = require("../models/bank.model.js")
const asyncHandler = require("../utils/errors/asyncHandler.js")
const CustomError = require("../utils/errors/CustomError.js")
const getClientAddress = require("../utils/ipClient/ipgrabber.js")
const Stripe = require('stripe');
const { request } = require("https")

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const getReturnBaseUrl = () => {
  const raw =
    process.env.STRIPE_ONBOARD_RETURN_URL ||
    process.env.FRONT_URL ||
    "https://lumio-link-shop.vercel.app";
  return raw.replace(/\/$/, "");
};

const setupStripeConnect = asyncHandler(async (req, res, next) => {
  const {countryCode, currency ,street ,postal_code ,city ,day, month, year,first_name ,last_name} = req.body

 

  const user = req.user; 
  const ip = getClientAddress(req);
   

       //===================  LOGS
      console.log("==== user in stripe setup action ====")
      console.log(`with email of ${req.user.email}`) 

  try {

    const userCheck = await User.findOne({
      _id : user._id , 
      email : user.email
    });
    if (userCheck.stripeAccountId != null) return next(new CustomError("account Already set Up !" , 400))
    
    const account = await stripe.accounts.create({
      type: 'custom',
      email: user.email,
      business_type: "individual",
      country: countryCode.toUpperCase(),
      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: ip,
        service_agreement: 
        //countryCode.toLowerCase() == "us" || countryCode.toLowerCase() == "br"  ?
          "full"
          //"recipient",
      },
      settings: {
      payouts: {
        schedule: {
          interval: "manual"
            },
          },
        },
      individual: {
        political_exposure : "none" ,
        address: {
          country: countryCode,
          line1: street,
          postal_code: postal_code,
          city : city ,       
        },
        dob: {
          day: Number(day),
          month: Number(month),
          year: Number(year),
        },
        email: user.email,
        first_name: first_name,
        last_name: last_name,
      },
      business_profile : {
        support_email : user.email,
        url : process.env.FRONT_URL,
        mcc : "5815"
      },
      capabilities: { transfers: { requested: true } , card_payments : {requested : true} },
    }).catch((e) => { 
      console.log(e)
      return next(new CustomError(`${e}`,400))
    })

    if (!account) {
      return next(new CustomError("Stripe failed to connect this account!", 400));
    }

 
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, email: user.email },
      {
        stripeAccountId: account.id,
        country: countryCode,
        currency: currency,
        firstName: first_name,
        lastName: last_name,
        dob: day,
        mob: month,
        yob: year,
      },
      { new: true }  
    ).catch((e) => { 
      return next(new CustomError("Failed to update user with Stripe account info", 500));
    });

    if (!updatedUser) {
      return next(new CustomError("Failed to update user with Stripe account info", 500));
    }

    res.status(200).json({
      statusCode: 200,
      success: true,
      user: updatedUser,
    });
  } catch (e) { 
    return next(new CustomError("An error occurred while connecting to Stripe", 500));
  }
});
 

const setupStripeBanking = asyncHandler(async (req, res, next) => {
  const user = req.user; 

  
 

  try {
 
    if (user.bankId == null) { 

               //===================  LOGS
      console.log("==== user in stripe Banking action adding a bank for the first time ====")
      console.log(`with email of ${req.user.email}`) 


      if (req.body.route !="" && req.body.route != null){
      var externalAccount = await stripe.accounts.createExternalAccount(user.stripeAccountId, {
        external_account: {
          country: user.country.toUpperCase(),
          currency: user.currency.toLowerCase(),
          object: 'bank_account',
          account_holder_name: `${user.firstName} ${user.lastName}`,
          account_holder_type: 'individual',
          account_number: req.body.number ?? req.body.iban,
          routing_number : req.body.route
        },
      });
    }
    else {
          var externalAccount = await stripe.accounts.createExternalAccount(user.stripeAccountId, {
        external_account: {
          country: user.country.toUpperCase(),
          currency: user.currency.toLowerCase(),
          object: 'bank_account',
          account_holder_name: `${user.firstName} ${user.lastName}`,
          account_holder_type: 'individual',
          account_number: req.body.number ?? req.body.iban, 
        },
      });
    }

   
      await User.findOneAndUpdate({ _id: user._id }, { bankId: externalAccount.id });

 
      const bank = await Bank.create({
        bankId: externalAccount.id,
        country: user.country.toUpperCase(),
        last4: externalAccount.last4,
        status: externalAccount.status,
        bankName: externalAccount.bank_name,
        user: user._id,
      });

      return res.status(200).json({
        statusCode: 200,
        success: true,
        bank,
      });
    } else {

               //===================  LOGS
      console.log("==== user in stripe Banking action replacing their bank acc with a new one ====")
      console.log(`with email of ${req.user.email}`) 
 
     
  try {
    if (req.body.route !="" && req.body.route != null){
      var externalAccount = await stripe.accounts.createExternalAccount(user.stripeAccountId, {
        external_account: {
          country: user.country.toUpperCase(),
          currency: user.currency.toLowerCase(),
          object: 'bank_account',
          account_holder_name: `${user.firstName} ${user.lastName}`,
          account_holder_type: 'individual',
          account_number: req.body.number ?? req.body.iban,
          routing_number : req.body.route
        },
      });
    }
    else {
          var externalAccount = await stripe.accounts.createExternalAccount(user.stripeAccountId, {
        external_account: {
          country: user.country.toUpperCase(),
          currency: user.currency.toLowerCase(),
          object: 'bank_account',
          account_holder_name: `${user.firstName} ${user.lastName}`,
          account_holder_type: 'individual',
          account_number: req.body.number ?? req.body.iban, 
        },
      });
    }
  }
  catch (e) {
    console.log("error in create external")
  }

  try  {
      await stripe.accounts.deleteExternalAccount(user.stripeAccountId, user.bankId);
    }
    catch (e) {
      console.log("error in delete external")
    }

    
      await User.findOneAndUpdate(
        { _id: user._id, email: user.email },
        { bankId: externalAccount.id }
      );

 
      const bank = await Bank.findOneAndUpdate(
        { user: user._id },
        {
          bankId: externalAccount.id,
          last4: externalAccount.last4,
          status: externalAccount.status,
          bankName: externalAccount.bank_name,
        },
        { new: true }
      );
      
 
      return res.status(200).json({
        statusCode: 200,
        success: true,
        bank,
      });
    }
    
  } catch (e) { 
    console.log(e)
    return next(new CustomError(e.message, 400));
  }
});



const createStripeAccountLink = asyncHandler(async (req, res, next) => {
  try {
    const stripeAccountId = req.user?.stripeAccountId;
    if (!stripeAccountId) {
      return next(new CustomError("Stripe account has not been created yet", 400));
    }

    const persistStripeStatus = async (status) => {
      if (!status || req.user?.StripeAccountStatus === status) return;
      await User.findOneAndUpdate(
        { _id: req.user._id },
        { StripeAccountStatus: status },
        { new: false },
      );
      req.user.StripeAccountStatus = status;
    };

    const resolveStripeStatus = (capabilities = {}, requirements = {}) => {
      const transfersActive = capabilities.transfers === "active";
      const cardPaymentsActive = capabilities.card_payments === "active";
      const hasDue =
        (requirements.currently_due || []).length > 0 ||
        (requirements.past_due || []).length > 0;

      if (transfersActive && cardPaymentsActive && !hasDue) {
        return "verified";
      }
      if (hasDue) {
        return "pending";
      }
      return "pending";
    };

    let account;
    try {
      account = await stripe.accounts.retrieve(stripeAccountId);
    } catch (error) {
      console.error("[Stripe] retrieve account error:", error.message);
      return next(new CustomError("Failed to load Stripe account", 400));
    }

    const capabilities = account.capabilities || {};
    const requirements = account.requirements || {};
    const currentlyDue = requirements.currently_due || [];
    const pastDue = requirements.past_due || [];
    const transfersActive = capabilities.transfers === "active";
    const cardPaymentsActive = capabilities.card_payments === "active";
    const hasDueRequirements = currentlyDue.length > 0 || pastDue.length > 0;
    const needsOnboarding =
      !transfersActive || !cardPaymentsActive || hasDueRequirements;

    const statusFromStripe = resolveStripeStatus(capabilities, requirements);
    await persistStripeStatus(statusFromStripe);

    if (!needsOnboarding && !req.body?.force) {
      return res.status(200).json({
        status: 200,
        success: true,
        data: {
          alreadyOnboarded: true,
          stripeAccountStatus: statusFromStripe,
          requirements: {
            currentlyDue,
            pastDue,
            disabledReason: requirements.disabled_reason || null,
          },
          capabilities,
        },
      });
    }

    const baseUrl = getReturnBaseUrl();
    const refreshUrl = `${baseUrl}/stripe/onboarding/refresh`;
    const returnUrl = `${baseUrl}/stripe/onboarding/return`;

    const linkType =
      req.body?.link_type === "account_update"
        ? "account_update"
        : "account_onboarding";

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      type: linkType,
      refresh_url: refreshUrl,
      return_url: returnUrl,
    });

    if (statusFromStripe !== "verified") {
      await persistStripeStatus("pending");
    }

    res.status(200).json({
      status: 200,
      success: true,
      data: {
        url: accountLink.url,
        expiresAt: accountLink.expires_at,
        alreadyOnboarded: false,
        stripeAccountStatus: req.user.StripeAccountStatus,
        requirements: {
          currentlyDue,
          pastDue,
          disabledReason: requirements.disabled_reason || null,
        },
        capabilities,
      },
    });
  } catch (error) {
    console.error("[Stripe] account link error:", error.message);
    return next(new CustomError("Failed to start Stripe onboarding", 500));
  }
});

module.exports = {setupStripeConnect , setupStripeBanking, createStripeAccountLink }
