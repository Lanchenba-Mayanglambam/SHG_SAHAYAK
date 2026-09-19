const mongoose = require('mongoose');

const instalmentSchema = new mongoose.Schema(
  {
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Loan',
      required: [true, 'Loan reference is required']
    },
    instalmentNumber: {
      type: Number,
      required: [true, 'Instalment number is required'],
      min: 1
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required']
    },
    amountDue: {
      type: Number,
      required: [true, 'Amount due is required'],
      min: [0, 'Amount due cannot be negative']
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: [0, 'Amount paid cannot be negative']
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending'
    },
    paidDate: {
      type: Date,
      default: null
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
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    verificationStatus: {
      type: String,
      enum: ['none', 'pending', 'verified', 'failed'],
      default: 'none'
    },
    submittedAmount: {
      type: Number,
      default: 0,
      min: [0, 'Submitted amount cannot be negative']
    },
    submittedDate: {
      type: Date,
      default: null
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

// Compound index on loanId and instalmentNumber
instalmentSchema.index({ loanId: 1, instalmentNumber: 1 }, { unique: true });

const Instalment = mongoose.model('Instalment', instalmentSchema);
module.exports = Instalment;
