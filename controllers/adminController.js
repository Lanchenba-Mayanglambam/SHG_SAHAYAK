const { validationResult } = require('express-validator');
const dayjs = require('dayjs');
const User = require('../models/User');
const Group = require('../models/Group');
const Member = require('../models/Member');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');

/**
 * List members in the admin's group
 */
const getMembers = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    if (!group) {
      req.flash('error', 'Please create or configure a group first.');
      return res.redirect('/admin/group');
    }

    const members = await Member.find({ groupId: group._id })
      .populate('userId', 'name email role')
      .sort({ createdAt: -1 });

    res.render('admin/members', {
      title: 'Member Management - SHG Tracker',
      group,
      members,
      dayjs,
      formData: {},
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a new member to the admin's group
 */
const postAddMember = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const members = await Member.find({ groupId: group._id })
        .populate('userId', 'name email role')
        .sort({ createdAt: -1 });

      return res.status(422).render('admin/members', {
        title: 'Member Management - SHG Tracker',
        group,
        members,
        dayjs,
        formData: req.body,
        errors: errors.array()
      });
    }

    const { name, email, password = 'Member@123', phone, address } = req.body;

    // Check if user email is already registered
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      req.flash('error', 'A user with this email address already exists.');
      return res.redirect('/admin/members');
    }

    // Hash password (default or custom)
    const effectivePassword = password && password.trim() ? password.trim() : 'Member@123';
    const passwordHash = await User.hashPassword(effectivePassword);

    // 1. Create User
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: 'member',
      groupId: group._id
    });
    await newUser.save();

    // 2. Create Member
    const newMember = new Member({
      userId: newUser._id,
      groupId: group._id,
      joinDate: new Date(),
      totalSavings: 0,
      status: 'active',
      phone: phone || '',
      address: address || ''
    });
    await newMember.save();

    // 3. Add to Group's member list
    group.members.push(newMember._id);
    await group.save();

    req.flash('success', `Member "${name}" successfully added to the group! Default password is "${effectivePassword}".`);
    res.redirect('/admin/members');
  } catch (error) {
    next(error);
  }
};

/**
 * Remove or toggle active status of a member
 */
const toggleMemberStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const member = await Member.findById(id);

    if (!member) {
      req.flash('error', 'Member not found.');
      return res.redirect('/admin/members');
    }

    // Toggle status between active and inactive
    member.status = member.status === 'active' ? 'inactive' : 'active';
    await member.save();

    req.flash('success', `Member status updated to ${member.status}.`);
    res.redirect('/admin/members');
  } catch (error) {
    next(error);
  }
};

/**
 * Render group settings and details
 */
const getGroupSettings = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    res.render('admin/groups', {
      title: 'Group Settings - SHG Tracker',
      group,
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update group settings
 */
const updateGroupSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    const group = req.currentGroup;

    if (!errors.isEmpty()) {
      return res.status(422).render('admin/groups', {
        title: 'Group Settings - SHG Tracker',
        group,
        errors: errors.array()
      });
    }

    const {
      name,
      villageOrArea,
      defaultInterestRate,
      monthlyContribution,
      upiId,
      upiPayeeName,
      paymentInstructions
    } = req.body;

    group.name = name;
    group.villageOrArea = villageOrArea || '';
    if (defaultInterestRate !== undefined) group.defaultInterestRate = Number(defaultInterestRate);
    if (monthlyContribution !== undefined) group.monthlyContribution = Number(monthlyContribution);
    if (upiId !== undefined) group.upiId = upiId.trim();
    if (upiPayeeName !== undefined) group.upiPayeeName = upiPayeeName.trim();
    if (paymentInstructions !== undefined) group.paymentInstructions = paymentInstructions.trim();
    group.isOnlinePaymentEnabled = req.body.isOnlinePaymentEnabled === 'on' || req.body.isOnlinePaymentEnabled === true || req.body.isOnlinePaymentEnabled === 'true';

    await group.save();
    req.flash('success', 'Group and online UPI payment settings updated successfully.');
    res.redirect('/admin/group');
  } catch (error) {
    next(error);
  }
};

/**
 * View Defaulters list (members with overdue instalments)
 */
const getDefaulters = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const now = dayjs().startOf('day');

    // Find all overdue instalments for loans in this group
    // Also auto-refresh status of pending instalments where dueDate < now
    const loans = await Loan.find({ groupId: group._id, status: 'approved' })
      .populate({
        path: 'memberId',
        populate: { path: 'userId', select: 'name email' }
      });

    const loanIds = loans.map((l) => l._id);

    // Update instalments that are due before now and not paid to 'overdue'
    await Instalment.updateMany(
      { loanId: { $in: loanIds }, dueDate: { $lt: now.toDate() }, status: 'pending' },
      { $set: { status: 'overdue' } }
    );

    const overdueInstalments = await Instalment.find({
      loanId: { $in: loanIds },
      status: 'overdue'
    }).populate({
      path: 'loanId',
      populate: {
        path: 'memberId',
        populate: { path: 'userId', select: 'name email' }
      }
    }).sort({ dueDate: 1 });

    // Group overdue by member
    const defaultersMap = {};
    for (const inst of overdueInstalments) {
      const loan = inst.loanId;
      if (!loan || !loan.memberId) continue;

      const member = loan.memberId;
      const memId = member._id.toString();

      if (!defaultersMap[memId]) {
        defaultersMap[memId] = {
          member,
          user: member.userId,
          loansCount: new Set(),
          overdueInstalmentsCount: 0,
          totalOverdueAmount: 0,
          oldestDueDate: inst.dueDate,
          instalments: []
        };
      }

      defaultersMap[memId].loansCount.add(loan._id.toString());
      defaultersMap[memId].overdueInstalmentsCount += 1;
      defaultersMap[memId].totalOverdueAmount += (inst.amountDue - (inst.amountPaid || 0));
      defaultersMap[memId].instalments.push(inst);

      if (dayjs(inst.dueDate).isBefore(dayjs(defaultersMap[memId].oldestDueDate))) {
        defaultersMap[memId].oldestDueDate = inst.dueDate;
      }
    }

    const defaultersList = Object.values(defaultersMap).map((d) => ({
      ...d,
      loansCount: d.loansCount.size,
      totalOverdueAmount: Math.round(d.totalOverdueAmount * 100) / 100
    }));

    res.render('admin/defaulters', {
      title: 'Defaulters List - SHG Tracker',
      defaultersList,
      overdueInstalments,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMembers,
  postAddMember,
  toggleMemberStatus,
  getGroupSettings,
  updateGroupSettings,
  getDefaulters
};
