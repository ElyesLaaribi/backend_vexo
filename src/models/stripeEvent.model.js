const mongoose = require("mongoose");

const stripeEventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        unique: true,
    },
    createdAt: {
        type: Date,
        default: () => new Date(),
    },
});

stripeEventSchema.index({ eventId: 1 }, { unique: true });

// TTL index: auto-delete events older than 30 days to prevent unbounded growth
stripeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const StripeEvent = mongoose.model("StripeEvent", stripeEventSchema);
module.exports = StripeEvent;
