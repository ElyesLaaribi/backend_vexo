const mongoose = require("mongoose");
const Media = require("../../../models/media.model");
const Sale = require("../../../models/sale.model");
const FCM = require("../../../models/fcmToken.model");
const sendNotification = require("./notification");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const attemptManualTransfer = async (session, saleDoc) => {
  const manualTransferAmount = parseInt(session?.metadata?.manualTransferAmount || "0", 10);
  const sellerStripeAccountId = session?.metadata?.sellerStripeAccountId;
  const transferGroup = session?.metadata?.transferGroup;
  const creatorCountry = (session?.metadata?.creatorCountry || "").toUpperCase();

  // Countries where Stripe transfers are not supported — mark for manual payout
  const unsupportedCountries = (process.env.STRIPE_DESTINATION_UNSUPPORTED || "TH")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  if (unsupportedCountries.includes(creatorCountry)) {
    console.log(
      `[Checkout] transfer skipped for sale ${saleDoc._id}: creator country ${creatorCountry} requires manual payout`
    );
    await Sale.findByIdAndUpdate(saleDoc._id, {
      transferStatus: "manual_payout_required",
      manualPayoutAmount: manualTransferAmount,
    });
    return;
  }

  if (!manualTransferAmount || manualTransferAmount <= 0) {
    console.warn(`[Checkout] manual transfer skipped: invalid amount for session ${session.id}`);
    return;
  }

  if (!session?.currency) {
    console.warn(`[Checkout] manual transfer skipped: missing currency for session ${session.id}`);
    return;
  }

  if (!sellerStripeAccountId) {
    console.warn(`[Checkout] manual transfer skipped: missing destination account for session ${session.id}`);
    return;
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: manualTransferAmount,
      currency: session.currency,
      destination: sellerStripeAccountId,
      transfer_group: transferGroup,
      metadata: {
        mediaId: session.metadata?.mediaId || "",
        sessionId: session.id,
      },
    });

    await Sale.findByIdAndUpdate(saleDoc._id, {
      stripeTransferId: transfer.id,
      transferStatus: transfer.status || "succeeded",
    });
    saleDoc.stripeTransferId = transfer.id;
    saleDoc.transferStatus = transfer.status || "succeeded";
    console.log(`[Checkout] manual transfer ${transfer.id} created for sale ${saleDoc._id}`);
  } catch (error) {
    console.error(
      `[Checkout] manual transfer failed for sale ${saleDoc?._id || "unknown"}: ${error.message}`,
    );
    await Sale.findByIdAndUpdate(
      saleDoc._id,
      { transferStatus: "failed" },
      { new: false },
    );
  }
};

const updateSales = async (session) => {
  try {
    if (!session?.metadata?.mediaId) {
      console.error("Missing mediaId in session metadata");
      return;
    }

    const sessionId = session.id;
    const mediaId = session.metadata.mediaId;

    // ── Idempotency check: skip if this session was already processed ──
    let saleDoc = await Sale.findOne({ stripeSessionId: sessionId });
    if (saleDoc) {
      console.log(`Sale already recorded for session ${sessionId} — checking transfer state`);
    }

    // ── Derive seller userId from Media, NOT from session.metadata ──
    // Metadata can be spoofed if the checkout session creation endpoint
    // is compromised. The Media document is the source of truth.
    const media = await Media.findOne({ _id: mediaId });
    if (!media) {
      console.error(`No media found with ID ${mediaId} — aborting sale`);
      return;
    }
    const sellerUserId = media.user.toString();

    if (!saleDoc) {
      // ── MongoDB transaction: Sale creation + Media increment are atomic ──
      const dbSession = await mongoose.startSession();
      dbSession.startTransaction();

      try {
        let createdSaleDoc;
        // Create Sale record (unique index on stripeSessionId prevents duplicates)
        const created = await Sale.create(
          [
            {
              amount: session.amount_total,
              user: sellerUserId,
              mediaId: mediaId,
              status: session.payment_status,
              stripeSessionId: sessionId,
            },
          ],
          { session: dbSession }
        );
        createdSaleDoc = created?.[0];

        // Increment media sales count
        await Media.findOneAndUpdate(
          { _id: mediaId },
          { $inc: { sales: 1 } },
          { new: true, session: dbSession }
        );

        // Both operations succeeded — commit
        await dbSession.commitTransaction();
        saleDoc = createdSaleDoc;
      } catch (e) {
        await dbSession.abortTransaction();

        if (e.code === 11000) {
          console.log(`Duplicate sale prevented for session ${sessionId}`);
          saleDoc = await Sale.findOne({ stripeSessionId: sessionId });
        } else {
          throw e;
        }
      } finally {
        dbSession.endSession();
      }
    }

    // ── Send push notification to seller (outside transaction — non-critical) ──
    try {
      const token = await FCM.findOne({ user: sellerUserId });
      const total = session.amount_subtotal;
      const feeAmount = Math.trunc((total * 10) / 100);
      const salePrice = total - feeAmount * 2;
      const message = `You've just received $${(salePrice / 100).toFixed(2)}!`;

      if (token?.fcmToken) {
        await sendNotification(token.fcmToken, "New Sale !", message);
      } else {
        console.log("No FCM token available to send notification");
      }

      console.log(`Media ${mediaId} sale processed successfully`);
    } catch (e) {
      console.log(`Media ${mediaId} sale processed but notification failed`);
    }

    const manualTransferRequired =
      session?.metadata?.manualTransferRequired === "true";
    if (manualTransferRequired && saleDoc && !saleDoc.stripeTransferId) {
      await attemptManualTransfer(session, saleDoc);
    }
  } catch (e) {
    console.error(`Failed to process sale for session:`, e.message);
  }
};

module.exports = updateSales;
