const { validationResult } = require('express-validator');
const dayjs = require('dayjs');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');
const Member = require('../models/Member');
const Group = require('../models/Group');
const QRCode = require('qrcode');
const {
  calculateLoanDetails,
  generateInstalmentSchedule,
  computeRepaymentStats,
  refreshOverdueStatuses
} = require('../utils/loanCalculator');

/**
 * Admin view: List all loans (pending, approved, closed, rejected)
 */
const getAdminLoans = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const filter = req.query.status || 'all';

    const query = { groupId: group._id };
    if (filter !== 'all') {
      query.status = filter;
    }

    const loans = await Loan.find(query)
      .populate({
        path: 'memberId',
        populate: { path: 'userId', select: 'name email' }
      })
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });

    res.render('admin/loans', {
      title: 'Loan Applications & Approvals - SHG Tracker',
      loans,
      currentFilter: filter,
      defaultInterestRate: group.defaultInterestRate || 12,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Member view: Form to request a loan
 */
const getLoanRequestForm = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const member = req.currentMember;

    // Check if member already has an active pending or approved loan
    const existingActiveLoan = await Loan.findOne({
      memberId: member._id,
      status: { $in: ['pending', 'approved'] }
    });

    res.render('member/loan-request', {
      title: 'Request a Micro-Loan - SHG Tracker',
      group,
      member,
      existingActiveLoan,
      defaultInterestRate: group.defaultInterestRate || 12,
      formData: {},
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Member action: Submit loan request
 */
const postLoanRequest = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    const member = req.currentMember;
    const errors = validationResult(req);

    const existingActiveLoan = await Loan.findOne({
      memberId: member._id,
      status: { $in: ['pending', 'approved'] }
    });

    if (existingActiveLoan) {
      req.flash('error', 'You currently have an active or pending loan. You cannot apply for a new loan until it is settled.');
      return res.redirect('/loans/request');
    }

    if (!errors.isEmpty()) {
      return res.status(422).render('member/loan-request', {
        title: 'Request a Micro-Loan - SHG Tracker',
        group,
        member,
        existingActiveLoan: null,
        defaultInterestRate: group.defaultInterestRate || 12,
        formData: req.body,
        errors: errors.array()
      });
    }

    const { amountRequested, purpose, tenureMonths } = req.body;
    const interestRate = group.defaultInterestRate || 12;

    // Preview loan calculations
    const details = calculateLoanDetails(amountRequested, interestRate, tenureMonths);

    const loan = new Loan({
      memberId: member._id,
      groupId: group._id,
      amountRequested: Number(amountRequested),
      purpose,
      tenureMonths: Number(tenureMonths),
      interestRate,
      status: 'pending',
      totalInterest: details.totalInterest,
      totalPayable: details.totalPayable,
      outstandingBalance: details.totalPayable
    });
    await loan.save();

    req.flash('success', `Your micro-loan application for ₹${amountRequested} has been submitted for admin approval!`);
    res.redirect('/member/loans');
  } catch (error) {
    next(error);
  }
};

/**
 * Admin action: Approve or Reject a loan
 */
const postLoanDecision = async (req, res, next) => {
  try {
    const { id } = req.params;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map((e) => e.msg).join('. '));
      return res.redirect('/admin/loans');
    }

    const { decision, interestRate, rejectionReason } = req.body;
    const loan = await Loan.findById(id).populate({
      path: 'memberId',
      populate: { path: 'userId', select: 'name' }
    });

    if (!loan) {
      req.flash('error', 'Loan not found.');
      return res.redirect('/admin/loans');
    }

    if (loan.status !== 'pending') {
      req.flash('error', `Loan has already been ${loan.status}.`);
      return res.redirect('/admin/loans');
    }

    if (decision === 'rejected') {
      loan.status = 'rejected';
      loan.rejectionReason = rejectionReason || 'Rejected by administrator';
      await loan.save();

      req.flash('success', `Loan application for ${loan.memberId.userId.name} was rejected.`);
      return res.redirect('/admin/loans');
    }

    // Decision: APPROVED
    const effectiveRate = interestRate ? Number(interestRate) : (loan.interestRate || 12);
    const details = calculateLoanDetails(loan.amountRequested, effectiveRate, loan.tenureMonths);

    const approvalDate = new Date();

    loan.interestRate = effectiveRate;
    loan.totalInterest = details.totalInterest;
    loan.totalPayable = details.totalPayable;
    loan.outstandingBalance = details.totalPayable;
    loan.status = 'approved';
    loan.approvedBy = req.currentUser._id;
    loan.approvedDate = approvalDate;
    await loan.save();

    // Auto-generate instalment schedule
    const instalmentsData = generateInstalmentSchedule(
      loan._id,
      loan.amountRequested,
      effectiveRate,
      loan.tenureMonths,
      approvalDate
    );

    await Instalment.insertMany(instalmentsData);

    req.flash('success', `Loan for ${loan.memberId.userId.name} (₹${loan.amountRequested}) approved! Generated ${loan.tenureMonths} instalment schedule.`);
    res.redirect(`/loans/${loan._id}`);
  } catch (error) {
    next(error);
  }
};

/**
 * View Loan Details & Repayment Schedule (accessible by Admin or loan's Member)
 */
const getLoanDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    const loan = await Loan.findById(id)
      .populate({
        path: 'memberId',
        populate: { path: 'userId', select: 'name email' }
      })
      .populate('approvedBy', 'name')
      .populate('groupId', 'name');

    if (!loan) {
      req.flash('error', 'Loan not found.');
      return res.redirect('/dashboard');
    }

    // Authorization check: Admin or the owner Member
    if (
      req.currentUser.role !== 'admin' &&
      (!req.currentMember || loan.memberId._id.toString() !== req.currentMember._id.toString())
    ) {
      req.flash('error', 'Access denied to this loan record.');
      return res.redirect('/dashboard');
    }

    // Fetch instalments and refresh overdue statuses
    let instalments = await Instalment.find({ loanId: loan._id }).sort({ instalmentNumber: 1 });
    const now = dayjs().startOf('day');

    // Update any pending past-due instalments to overdue
    let hasOverdueUpdates = false;
    for (const inst of instalments) {
      if (inst.status === 'pending' && dayjs(inst.dueDate).isBefore(now)) {
        inst.status = 'overdue';
        await inst.save();
        hasOverdueUpdates = true;
      }
    }

    if (hasOverdueUpdates) {
      instalments = await Instalment.find({ loanId: loan._id }).sort({ instalmentNumber: 1 });
    }

    const group = await Group.findById(loan.groupId);

    // Generate UPI QR code and intent URI for any pending/overdue instalments
    if (group && group.isOnlinePaymentEnabled && group.upiId) {
      for (const inst of instalments) {
        if (inst.status !== 'paid') {
          const cleanUpiId = group.upiId.trim();
          const cleanPayee = (group.upiPayeeName || group.name).trim();
          const upiUri = `upi://pay?pa=${encodeURIComponent(cleanUpiId)}&pn=${encodeURIComponent(cleanPayee)}&am=${inst.amountDue}&cu=INR&tn=${encodeURIComponent(`Loan Repay Inst #${inst.instalmentNumber}`)}`;
          inst.upiUri = upiUri;
          try {
            inst.upiQrCode = await QRCode.toDataURL(upiUri, { width: 220, margin: 1 });
          } catch (qrErr) {
            console.error('QR generation error:', qrErr);
            inst.upiQrCode = '';
          }
        }
      }
    }

    const stats = computeRepaymentStats(loan.totalPayable, instalments);

    res.render(req.currentUser.role === 'admin' ? 'admin/loan-detail' : 'member/loan-detail', {
      title: `Loan #${loan._id.toString().slice(-6).toUpperCase()} - Details & Schedule`,
      loan,
      group,
      instalments,
      stats,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Record payment for an instalment
 */
const postRecordRepayment = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    const { instalmentId, amount, paymentMode = 'Cash', transactionId = '' } = req.body;

    if (!errors.isEmpty()) {
      req.flash('error', errors.array().map((e) => e.msg).join('. '));
      return res.redirect('back');
    }

    const instalment = await Instalment.findById(instalmentId);
    if (!instalment) {
      req.flash('error', 'Instalment record not found.');
      return res.redirect('back');
    }

    const loan = await Loan.findById(instalment.loanId);
    if (!loan) {
      req.flash('error', 'Associated loan not found.');
      return res.redirect('back');
    }

    // Permission check: if Member, must be the borrower
    if (req.currentUser.role === 'member') {
      if (!req.currentMember || loan.memberId.toString() !== req.currentMember._id.toString()) {
        req.flash('error', 'You can only pay instalments for your own active loans.');
        return res.redirect('/dashboard');
      }
    }

    const paymentAmount = Number(amount);
    const isMemberUpi = req.currentUser.role === 'member' && paymentMode === 'UPI';

    if (isMemberUpi) {
      // If already pending verification, prevent duplicate submission
      if (instalment.verificationStatus === 'pending') {
        req.flash('error', `A payment for Instalment #${instalment.instalmentNumber} is already under administrator review.`);
        return res.redirect(`/loans/${loan._id}`);
      }

      // Member submitted online UPI payment: enter pending verification state
      instalment.paymentMode = 'UPI';
      instalment.transactionId = (transactionId || '').trim();
      instalment.submittedAmount = paymentAmount;
      instalment.submittedDate = new Date();
      instalment.verificationStatus = 'pending';
      instalment.verificationRemark = '';
      instalment.recordedBy = req.currentUser._id;

      // Keep status as pending/overdue until admin approval
      const now = dayjs().startOf('day');
      instalment.status = dayjs(instalment.dueDate).isBefore(now) ? 'overdue' : 'pending';

      await instalment.save();

      const txnNote = instalment.transactionId ? ` (UTR: ${instalment.transactionId})` : '';
      req.flash(
        'success',
        `Online UPI payment of ₹${paymentAmount.toLocaleString('en-IN')} submitted successfully for Instalment #${instalment.instalmentNumber}!${txnNote} Awaiting administrator verification.`
      );

      return res.redirect(`/loans/${loan._id}`);
    }

    // Direct recording by Admin (Cash, Bank Transfer, or Admin direct UPI entry)
    instalment.amountPaid = paymentAmount;
    instalment.paidDate = new Date();
    instalment.paymentMode = paymentMode;
    instalment.transactionId = (transactionId || '').trim();
    instalment.recordedBy = req.currentUser._id;
    instalment.verificationStatus = 'verified';
    instalment.verifiedBy = req.currentUser._id;
    instalment.verifiedDate = new Date();

    if (paymentAmount >= instalment.amountDue) {
      instalment.status = 'paid';
    } else {
      // Partial payment keeps pending or overdue
      const now = dayjs().startOf('day');
      instalment.status = dayjs(instalment.dueDate).isBefore(now) ? 'overdue' : 'pending';
    }

    await instalment.save();

    // Recalculate loan outstanding balance
    await loan.recalculateBalance();

    const isUpi = paymentMode === 'UPI';
    const txnNote = instalment.transactionId ? ` (Ref/UTR: ${instalment.transactionId})` : '';
    req.flash(
      'success',
      isUpi
        ? `Online UPI payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded for Instalment #${instalment.instalmentNumber}!${txnNote}`
        : `Payment of ₹${paymentAmount.toLocaleString('en-IN')} recorded for Instalment #${instalment.instalmentNumber}.${txnNote} Remaining balance: ₹${loan.outstandingBalance.toLocaleString('en-IN')}.`
    );

    res.redirect(`/loans/${loan._id}`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminLoans,
  getLoanRequestForm,
  postLoanRequest,
  postLoanDecision,
  getLoanDetails,
  postRecordRepayment
};
