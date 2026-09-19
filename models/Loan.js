const mongoose = require('mongoose');

const loanSchema = new mongoose.Schema(
  {
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: [true, 'Member is required']
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: [true, 'Group is required']
    },
    amountRequested: {
      type: Number,
      required: [true, 'Loan amount is required'],
      min: [500, 'Loan amount must be at least ₹500']
    },
    purpose: {
      type: String,
      required: [true, 'Loan purpose is required'],
      trim: true,
      minlength: [3, 'Purpose must be at least 3 characters'],
      maxlength: [250, 'Purpose cannot exceed 250 characters']
    },
    tenureMonths: {
      type: Number,
      required: [true, 'Tenure in months is required'],
      min: [1, 'Tenure must be at least 1 month'],
      max: [60, 'Tenure cannot exceed 60 months']
    },
    interestRate: {
      type: Number,
      required: [true, 'Interest rate is required'],
      min: [0, 'Interest rate cannot be negative'],
      default: 12 // 12% p.a. simple interest
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'closed'],
      default: 'pending'
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: ''
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    approvedDate: {
      type: Date,
      default: null
    },
    totalInterest: {
      type: Number,
      default: 0
    },
    totalPayable: {
      type: Number,
      default: 0
    },
    outstandingBalance: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Method to recalculate outstanding balance based on instalments
loanSchema.methods.recalculateBalance = async function () {
  const Instalment = mongoose.model('Instalment');
  const instalments = await Instalment.find({ loanId: this._id });
  const totalPaid = instalments.reduce((sum, inst) => sum + (inst.amountPaid || 0), 0);
  
  this.outstandingBalance = Math.max(0, Math.round((this.totalPayable - totalPaid) * 100) / 100);
  
  if (this.outstandingBalance === 0 && this.status === 'approved' && instalments.length > 0) {
    const allPaid = instalments.every((inst) => inst.status === 'paid');
    if (allPaid) {
      this.status = 'closed';
    }
  }
  
  await this.save();
  return this.outstandingBalance;
};

const Loan = mongoose.model('Loan', loanSchema);
module.exports = Loan;
