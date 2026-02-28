const mongoose = require("mongoose");
const Media = require("../../../models/media.model");
const Sale = require("../../../models/sale.model");
const FCM = require("../../../models/fcmToken.model");
const sendNotification = require("./notification");

const updateSales = async (session) => {
  try {
    if (!session?.metadata?.mediaId) {
      console.error("Missing mediaId in session metadata");
      return;
    }

    const sessionId = session.id;
    const mediaId = session.metadata.mediaId;

    // ── Idempotency check: skip if this session was already processed ──
    const existingSale = await Sale.findOne({ stripeSessionId: sessionId });
    if (existingSale) {
      console.log(`Sale already recorded for session ${sessionId} — skipping (idempotent)`);
      return;
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

    // ── MongoDB transaction: Sale creation + Media increment are atomic ──
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
      // Create Sale record (unique index on stripeSessionId prevents duplicates)
      await Sale.create(
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

      // Increment media sales count
      await Media.findOneAndUpdate(
        { _id: mediaId },
        { $inc: { sales: 1 } },
        { new: true, session: dbSession }
      );

      // Both operations succeeded — commit
      await dbSession.commitTransaction();
    } catch (e) {
      await dbSession.abortTransaction();

      if (e.code === 11000) {
        // Duplicate key — another concurrent request already created this Sale
        console.log(`Duplicate sale prevented for session ${sessionId}`);
        return;
      }
      throw e;
    } finally {
      dbSession.endSession();
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
  } catch (e) {
    console.error(`Failed to process sale for session:`, e.message);
  }
};

module.exports = updateSales;
