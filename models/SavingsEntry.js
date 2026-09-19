const mongoose = require('mongoose');

const savingsEntrySchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member reference is required']
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: [true, 'Group reference is required']
    },
    month: {
      type: String,
      required: [true, 'Contribution month is required (YYYY-MM)'],
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format (e.g., 2026-09)']
    },
    amount: {
      type: Number,
      required: [true, 'Savings amount is required'],
      min: [1, 'Savings amount must be at least 1']
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who recorded the entry is required']
    },
    paymentMode: {
      type: String,
      enum: ['Cash', 'UPI', 'Bank Transfer'],
      default: 'Cash'
    },
    transactionId: {
      type: String,
      trim: true,
      default: ''
    },
    date: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['verified', 'pending_verification', 'failed'],
      default: 'verified'
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    verifiedDate: {
      type: Date,
      default: null
    },
    verificationRemark: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Prevent double contribution for the same member in the same month
savingsEntrySchema.index({ memberId: 1, month: 1 }, { unique: true });

const SavingsEntry = mongoose.model('SavingsEntry', savingsEntrySchema);
module.exports = SavingsEntry;
