const dayjs = require('dayjs');
const Member = require('../models/Member');
const SavingsEntry = require('../models/SavingsEntry');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');

const { validationResult } = require('express-validator');
const QRCode = require('qrcode');

/**
 * Member passbook view: chronological savings list with running total
 */
const getPassbook = async (req, res, next) => {
  try {
    const member = req.currentMember;
    const group = req.currentGroup;

    if (!member) {
      req.flash('error', 'Member profile not found.');
      return res.redirect('/dashboard');
    }

    // Chronological order (earliest first) to compute running balance
    const rawEntries = await SavingsEntry.find({ memberId: member._id })
      .populate('recordedBy', 'name')
      .sort({ date: 1, month: 1 });

    let runningBalance = 0;
    const passbookEntries = rawEntries.map((entry) => {
      const isVerified = !entry.status || entry.status === 'verified';
      if (isVerified) {
        runningBalance += entry.amount;
      }
      return {
        _id: entry._id,
        month: entry.month,
        amount: entry.amount,
        paymentMode: entry.paymentMode || 'Cash',
        transactionId: entry.transactionId || '',
        status: entry.status || 'verified',
        verificationRemark: entry.verificationRemark || '',
        date: entry.date,
        runningBalance: Math.round(runningBalance * 100) / 100,
        recordedBy: entry.recordedBy ? entry.recordedBy.name : 'System Admin',
        notes: entry.notes
      };
    });

    // Reverse for displaying newest first while preserving computed runningBalance
    const reversedPassbook = [...passbookEntries].reverse();

    // Check current month contribution status
    const currentMonth = dayjs().format('YYYY-MM');
    const currentMonthEntry = rawEntries.find((e) => e.month === currentMonth);
    const hasContributedThisMonth = Boolean(currentMonthEntry && currentMonthEntry.status !== 'failed');
    const currentMonthStatus = currentMonthEntry ? currentMonthEntry.status : null;
    const currentMonthFailedRemark = currentMonthEntry && currentMonthEntry.status === 'failed' ? currentMonthEntry.verificationRemark : '';

    // Generate monthly savings deposit QR code if online payments are enabled
    let savingsUpiQrCode = '';
    let savingsUpiUri = '';
    const depositAmount = group.monthlyContribution || 500;
    if (group && group.isOnlinePaymentEnabled && group.upiId) {
      const cleanUpiId = group.upiId.trim();
      const cleanPayee = (group.upiPayeeName || group.name).trim();
      savingsUpiUri = `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(cleanPayee)}&am=${depositAmount}&cu=INR&tn=${encodeURIComponent(`Monthly Savings ${currentMonth}`)}`;
      try {
        savingsUpiQrCode = await QRCode.toDataURL(savingsUpiUri, { width: 200, margin: 1 });
      } catch (err) {
        console.error('Savings QR code error:', err);
      }
    }

    res.render('member/passbook', {
      title: 'Savings Passbook - SHG Tracker',
      member,
      group,
      passbookEntries: reversedPassbook,
      totalSavings: Math.round(runningBalance * 100) / 100,
      currentMonth,
      hasContributedThisMonth,
      currentMonthStatus,
      currentMonthFailedRemark,
      depositAmount,
      savingsUpiQrCode,
      savingsUpiUri,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Member deposits monthly savings contribution online via UPI
 */
const postMemberSavingsUpi = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    const member = req.currentMember;
    const group = req.currentGroup;

    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map((e) => e.msg).join('. '));
      return res.redirect('/member/passbook');
    }

    const { month, amount, transactionId = '', notes = '' } = req.body;
    const depositAmount = Number(amount);

    // Check if entry for this month already exists
    const existing = await SavingsEntry.findOne({ memberId: member._id, month });
    if (existing) {
      if (existing.status === 'failed') {
        // Allow resubmission if previously marked failed by admin
        existing.amount = depositAmount;
        existing.transactionId = transactionId.trim();
        existing.status = 'pending_verification';
        existing.date = new Date();
        existing.verificationRemark = '';
        existing.notes = notes || 'Resubmitted monthly SHG contribution via online UPI';
        await existing.save();

        const txnNote = transactionId ? ` (UTR: ${transactionId})` : '';
        req.flash('success', `Online UPI savings deposit of ₹${depositAmount} for ${month} resubmitted successfully!${txnNote} Awaiting administrator verification.`);
        return res.redirect('/member/passbook');
      } else {
        req.flash('error', `Savings contribution for month ${month} has already been recorded or is currently awaiting administrator verification.`);
        return res.redirect('/member/passbook');
      }
    }

    const entry = new SavingsEntry({
      memberId: member._id,
      groupId: group._id,
      month,
      amount: depositAmount,
      recordedBy: req.currentUser._id,
      paymentMode: 'UPI',
      transactionId: transactionId.trim(),
      status: 'pending_verification',
      date: new Date(),
      notes: notes || 'Monthly SHG contribution paid via online UPI'
    });
    await entry.save();

    const txnNote = transactionId ? ` (UTR: ${transactionId})` : '';
    req.flash('success', `Online UPI savings deposit of ₹${depositAmount} for ${month} submitted successfully!${txnNote} Awaiting administrator verification.`);
    res.redirect('/member/passbook');
  } catch (error) {
    next(error);
  }
};

/**
 * Member loans list & active status
 */
const getMemberLoans = async (req, res, next) => {
  try {
    const member = req.currentMember;
    const group = req.currentGroup;

    if (!member) {
      req.flash('error', 'Member profile not found.');
      return res.redirect('/dashboard');
    }

    const loans = await Loan.find({ memberId: member._id })
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    // Active loan (approved)
    const activeLoan = loans.find((l) => l.status === 'approved');
    let nextInstalment = null;

    if (activeLoan) {
      nextInstalment = await Instalment.findOne({
        loanId: activeLoan._id,
        status: { $in: ['pending', 'overdue'] }
      }).sort({ dueDate: 1 });
    }

    res.render('member/loans', {
      title: 'My Micro-Loans - SHG Tracker',
      member,
      group,
      loans,
      activeLoan,
      nextInstalment,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPassbook,
  getMemberLoans,
  postMemberSavingsUpi
};
