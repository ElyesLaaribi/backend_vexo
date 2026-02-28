const asyncHandler = require("../utils/errors/asyncHandler.js")
const CustomError = require("../utils/errors/CustomError.js")
const Stripe = require('stripe');
const Media = require("../models/media.model.js")
const User = require("../models/user.model.js")
const Sale = require("../models/sale.model.js")
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);



const createCheckoutSession = asyncHandler(async (req, res, next) => {
  try {
    const { uuid } = req.body;


    const media = await Media.findOne({ uuid: uuid });
    if (!media) {
      return next(new CustomError("Media not found!", 404));
    }

    const user = await User.findOne({ _id: media.user });
    if (!user || !user.stripeAccountId) {
      return next(new CustomError("User or Stripe account not found!", 400));
    }


    const amount = media.priceSet * 100;
    const feeAmount = Math.trunc((amount * 10) / 100);

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Unlock your media.',
            },
            unit_amount: Math.trunc(amount + feeAmount),
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        transfer_data: {
          destination: user.stripeAccountId,
          amount: Math.trunc(amount - feeAmount)
        },
      },
      mode: 'payment',
      metadata: {
        mediaId: media._id.toString(),
        userId: media.user.toString(),
      },
      success_url: "https://admez.fun/payment/success?session_id={CHECKOUT_SESSION_ID}",
    });


    res.status(200).json({
      status: 200,
      success: true,
      data: { url: session.url }
    });
  }
  catch (error) {
    return next(new CustomError("Error creating checkout session", 500));
  }
});



const successPaymentUrl = asyncHandler(async (req, res, next) => {

  const session_id = req.query.session_id
  if (!session_id) return next(new CustomError("no session created !"))

  // ── Retrieve session from Stripe ──
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(session_id);
  } catch (err) {
    return next(new CustomError('Link may be expired or does not exist', 303))
  }

  // ── SECURITY: Verify payment was actually completed ──
  if (session.payment_status !== 'paid') {
    return next(new CustomError('Payment has not been completed', 403))
  }

  // ── SECURITY: Verify Sale record exists for this session (proves webhook processed it) ──
  const saleExists = await Sale.findOne({ stripeSessionId: session_id });
  if (!saleExists) {
    return next(new CustomError('Payment verification pending — please wait a moment and try again', 403))
  }

  const mediaId = session.metadata.mediaId
  const media = await Media.findOne({ _id: mediaId })
    .select({
      "mediaPath": 1,
      "NumberOfMedia": 1,
      "fileNames": 1,
      "expired": 1
    })

  if (!media) return next(new CustomError('Media not found', 404))
  if (media.expired == true) return next(new CustomError('Link may be expired or does not exist', 303))

  res.status(200).json(
    {
      status: 200,
      success: true,
      data: media
    }
  )

})




module.exports = { createCheckoutSession, successPaymentUrl }
