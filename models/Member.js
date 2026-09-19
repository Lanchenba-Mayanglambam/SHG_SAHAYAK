const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true
    },
    joinDate: {
      type: Date,
      default: Date.now
    },
    totalSavings: {
      type: Number,
      default: 0,
      min: [0, 'Savings cannot be negative']
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    address: {
      type: String,
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Prevent duplicate active membership of the same user in the same group
memberSchema.index({ userId: 1, groupId: 1 }, { unique: true });

const Member = mongoose.model('Member', memberSchema);
module.exports = Member;
