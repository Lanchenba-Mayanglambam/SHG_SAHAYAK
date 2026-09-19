const { validationResult } = require('express-validator');
const dayjs = require('dayjs');
const Member = require('../models/Member');
const SavingsEntry = require('../models/SavingsEntry');

/**
 * List all savings contributions and form to record new contribution
 */
const getSavings = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const currentMonth = dayjs().format('YYYY-MM');

    // Get active members for dropdown
    const members = await Member.find({ groupId: group._id, status: 'active' })
      .populate('userId', 'name email')
      .sort({ 'userId.name': 1 });

    // Get all savings history for this group
    const entries = await SavingsEntry.find({ groupId: group._id })
      .populate({
        path: 'memberId',
        populate: { path: 'userId', select: 'name email' }
      })
      .populate('recordedBy', 'name')
      .sort({ month: -1, date: -1 });

    // Aggregate savings summary per member
    const memberSavingsSummary = await Member.find({ groupId: group._id })
      .populate('userId', 'name email')
      .sort({ totalSavings: -1 });

    const totalGroupSavings = memberSavingsSummary.reduce((sum, m) => sum + (m.totalSavings || 0), 0);

    res.render('admin/savings', {
      title: 'Savings Management - SHG Tracker',
      group,
      members,
      entries,
      memberSavingsSummary,
      totalGroupSavings: Math.round(totalGroupSavings * 100) / 100,
      currentMonth,
      dayjs,
      formData: {
        month: currentMonth,
        amount: group.monthlyContribution || 500
      },
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record a monthly savings contribution for a member
 */
const postRecordSavings = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const currentMonth = dayjs().format('YYYY-MM');
      const members = await Member.find({ groupId: group._id, status: 'active' })
        .populate('userId', 'name email');
      const entries = await SavingsEntry.find({ groupId: group._id })
        .populate({
          path: 'memberId',
          populate: { path: 'userId', select: 'name email' }
        })
        .populate('recordedBy', 'name')
        .sort({ month: -1, date: -1 });
      const memberSavingsSummary = await Member.find({ groupId: group._id })
        .populate('userId', 'name email');
      const totalGroupSavings = memberSavingsSummary.reduce((sum, m) => sum + (m.totalSavings || 0), 0);

      return res.status(422).render('admin/savings', {
        title: 'Savings Management - SHG Tracker',
        group,
        members,
        entries,
        memberSavingsSummary,
        totalGroupSavings: Math.round(totalGroupSavings * 100) / 100,
        currentMonth,
        dayjs,
        formData: req.body,
        errors: errors.array()
      });
    }

    const { memberId, month, amount, notes } = req.body;

    // Check if entry already exists for this member & month
    const existing = await SavingsEntry.findOne({ memberId, month });
    if (existing) {
      req.flash('error', `A savings entry for this member for ${month} already exists (₹${existing.amount}).`);
      return res.redirect('/savings');
    }

    const member = await Member.findById(memberId).populate('userId', 'name');
    if (!member) {
      req.flash('error', 'Member not found.');
      return res.redirect('/savings');
    }

    // 1. Create savings entry
    const entry = new SavingsEntry({
      memberId,
      groupId: group._id,
      month,
      amount: Number(amount),
      recordedBy: req.currentUser._id,
      date: new Date(),
      notes: notes || ''
    });
    await entry.save();

    // 2. Update member totalSavings atomically
    member.totalSavings = Math.round(((member.totalSavings || 0) + Number(amount)) * 100) / 100;
    await member.save();

    req.flash('success', `Recorded savings contribution of ₹${amount} for ${member.userId.name} (${month}).`);
    res.redirect('/savings');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSavings,
  postRecordSavings
};
