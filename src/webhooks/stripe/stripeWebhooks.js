const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const StripeEvent = require("../../models/stripeEvent.model");
const updateSales = require("./wh_controllers/markSale");
const updatePayout = require("./wh_controllers/markpayoutStatus");
const updateBank = require("./wh_controllers/updateBank");
const markNewPayout = require("./wh_controllers/payoutCreated");
const updateStripeAccountStatus = require("./wh_controllers/updateAccStatus");


// ── Refund reversal handler ──
async function handleRefundReversal(refund) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(refund.payment_intent);

    if (paymentIntent && paymentIntent.latest_charge) {
      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);

      if (charge && charge.transfer) {
        const reversal = await stripe.transfers.createReversal(
          charge.transfer,
          {
            amount: refund.amount - (refund.amount * 20 / 100),
          }
        );
        console.log(`Reversal created for refund: ${refund.id}`);
        return reversal;
      }
    }
    console.log(`No transfer found for refund: ${refund.id}`);
    return null;
  } catch (error) {
    console.error(`Error processing refund reversal for ${refund.id}:`, error.message);
    // Do not throw — let webhook return 200
    return null;
  }
}

// ── Dispute reversal handler ──
async function handleDisputeReversal(dispute) {
  try {
    const charge = await stripe.charges.retrieve(dispute.charge);

    if (charge && charge.transfer) {
      const reversal = await stripe.transfers.createReversal(
        charge.transfer,
        {
          amount: dispute.amount - (dispute.amount * 20 / 100),
        }
      );
      console.log(`Reversal created for dispute: ${dispute.id}`);
      return reversal;
    }
    console.log(`No transfer found for dispute: ${dispute.id}`);
    return null;
  } catch (error) {
    console.error(`Error processing dispute reversal for ${dispute.id}:`, error.message);
    return null;
  }
}


// ── Main webhook handler ──
module.exports = stripe_webhook = async (request, response) => {
  const sig = request.headers["stripe-signature"];

  let event;

  // ── Step 1: Signature verification ──
  // This is the ONLY case where we return 400.
  // Stripe will NOT retry on 400 — it treats the event as rejected.
  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Step 2: Event-level idempotency ──
  // If we already processed this event.id, return 200 immediately.
  // This prevents duplicate processing when Stripe retries a delivery
  // that we already successfully handled but Stripe didn't receive our 200.
  try {
    await StripeEvent.create({ eventId: event.id });
  } catch (e) {
    if (e.code === 11000) {
      console.log(`Event ${event.id} already processed — skipping (idempotent)`);
      return response.json({ received: true });
    }
    // If StripeEvent insert fails for another reason, log but continue processing.
    // We'd rather process a potential duplicate than drop a real event.
    console.error("StripeEvent dedup insert error (non-critical):", e.message);
  }

  console.log(`Processing event: ${event.type}`);

  // ── Step 3: Event processing ──
  // ALL errors here return 200. Returning 500 causes Stripe to retry
  // the event up to ~16 times over 72 hours, creating a "retry storm"
  // that hammers your server with duplicate events.
  // Since we already have idempotency at both event and Sale level,
  // returning 200 is safe — if processing truly failed, you investigate
  // from logs, not from Stripe retries.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await updateSales(event.data.object);
        break;
      case "account.external_account.updated":
        await updateBank(event.data.object);
        break;
      case "payout.created":
        await markNewPayout(event.data.object);
        break;
      case "payout.updated":
        await updatePayout(event.data.object);
        break;
      case "payout.failed":
        await updatePayout(event.data.object);
        break;
      case "payout.paid":
        await updatePayout(event.data.object);
        break;
      case "person.updated":
        await updateStripeAccountStatus(event.data.object);
        break;

      case "charge.refunded":
        await handleRefundReversal(event.data.object);
        break;

      case "charge.dispute.created":
        await handleDisputeReversal(event.data.object);
        break;

      case "charge.dispute.closed":
        if (event.data.object.status === "lost") {
          console.log(`Dispute ${event.data.object.id} was lost`);
        } else {
          console.log(`Dispute ${event.data.object.id} was won or withdrawn`);
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (error) {
    // Log the error for investigation but ALWAYS return 200
    // to prevent Stripe retry storms.
    console.error(`Error processing webhook event ${event.id} (${event.type}):`, error.message);
  }

  // Always 200 after signature is verified — Stripe considers this "delivered"
  response.json({ received: true });
};
