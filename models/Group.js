const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      minlength: [3, 'Group name must be at least 3 characters'],
      maxlength: [120, 'Group name cannot exceed 120 characters']
    },
    villageOrArea: {
      type: String,
      trim: true,
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    defaultInterestRate: {
      type: Number,
      default: 12, // 12% per annum simple interest
      min: [0, 'Interest rate cannot be negative'],
      max: [100, 'Interest rate cannot exceed 100%']
    },
    monthlyContribution: {
      type: Number,
      default: 500, // standard monthly contribution in INR
      min: [10, 'Monthly contribution must be at least 10']
    },
    upiId: {
      type: String,
      trim: true,
      default: 'mahilashakti@upi'
    },
    upiPayeeName: {
      type: String,
      trim: true,
      default: 'Mahila Shakti SHG'
    },
    upiQrCodeUrl: {
      type: String,
      trim: true,
      default: ''
    },
    isOnlinePaymentEnabled: {
      type: Boolean,
      default: true
    },
    paymentInstructions: {
      type: String,
      trim: true,
      default: 'Scan using any UPI app (Google Pay, PhonePe, Paytm, BHIM). After completing the payment, please enter the 12-digit UPI UTR / Reference number below to confirm.'
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member'
      }
    ]
  },
  {
    timestamps: true
  }
);

const Group = mongoose.model('Group', groupSchema);
module.exports = Group;
