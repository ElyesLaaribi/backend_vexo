const mongoose = require("mongoose");

const salesSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: () => new Date(),
  },
  status: {
    type: String,
    required: true,
  },
  mediaId: {
    type: String,
    required: true,
  },
  user: {
    type: String,
    required: true,
  },
  stripeSessionId: {
    type: String,
    required: true,
    unique: true,
  },
  stripeTransferId: {
    type: String,
    default: null,
  },
  transferStatus: {
    type: String,
    enum: ["pending", "succeeded", "failed", null],
    default: null,
  },
});

// Enforce unique index at schema level — prevents duplicate sales on retry
salesSchema.index({ stripeSessionId: 1 }, { unique: true });

const Sale = mongoose.model('Sale', salesSchema);
module.exports = Sale;
