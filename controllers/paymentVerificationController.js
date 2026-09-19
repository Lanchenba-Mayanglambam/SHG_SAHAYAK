const dayjs = require('dayjs');
const Instalment = require('../models/Instalment');
const SavingsEntry = require('../models/SavingsEntry');
const Loan = require('../models/Loan');
const Member = require('../models/Member');

/**
 * Render Admin Payment Verifications Dashboard
 */
const getPendingPayments = async (req, res, next) => {
  try {
    const group = req.currentGroup;
    if (!group) {
      req.flash('error', 'Please configure an SHG group first.');
      return res.redirect('/admin/group');
    }

    // 1. Fetch pending loan instalment payments for this group's loans
    const groupLoans = await Loan.find({ groupId: group._id }).select('_id');
    const groupLoanIds = groupLoans.map((l) => l._id);

    const pendingLoanPayments = await Instalment.find({
      loanId: { $in: groupLoanIds },
      verificationStatus: 'pending'
    })
      .populate({
        path: 'loanId',
        select: 'amountRequested purpose outstandingBalance memberId',
        populate: {
          path: 'memberId',
          select: 'phone userId',
          populate: {
            path: 'userId',
            select: 'name email'
          }
        }
      })
      .populate('recordedBy', 'name email')
      .sort({ submittedDate: -1, createdAt: -1 });

    // 2. Fetch pending monthly savings deposits for this group
    const pendingSavingsPayments = await SavingsEntry.find({
      groupId: group._id,
      status: 'pending_verification'
    })
      .populate({
        path: 'memberId',
        select: 'phone totalSavings userId',
        populate: {
          path: 'userId',
          select: 'name email'
        }
      })
      .populate('recordedBy', 'name email')
      .sort({ createdAt: -1 });

    // 3. Fetch recently verified / failed audit history (last 20 records)
    const recentLoanHistory = await Instalment.find({
      loanId: { $in: groupLoanIds },
      verificationStatus: { $in: ['verified', 'failed'] },
      verifiedDate: { $ne: null }
    })
      .populate({
        path: 'loanId',
        select: 'memberId',
        populate: {
          path: 'memberId',
          select: 'userId',
          populate: { path: 'userId', select: 'name email' }
        }
      })
      .populate('verifiedBy', 'name')
      .sort({ verifiedDate: -1 })
      .limit(15);

    const recentSavingsHistory = await SavingsEntry.find({
      groupId: group._id,
      status: { $in: ['verified', 'failed'] },
      verifiedDate: { $ne: null }
    })
      .populate({
        path: 'memberId',
        select: 'userId',
        populate: { path: 'userId', select: 'name email' }
      })
      .populate('verifiedBy', 'name')
      .sort({ verifiedDate: -1 })
      .limit(15);

    // Combine history for audit log
    const combinedHistory = [
      ...recentLoanHistory.map((item) => ({
        type: 'Loan Instalment',
        memberName: item.loanId?.memberId?.userId?.name || 'Unknown Member',
        memberEmail: item.loanId?.memberId?.userId?.email || '',
        reference: `Instalment #${item.instalmentNumber}`,
        amount: item.amountPaid || item.submittedAmount || item.amountDue,
        transactionId: item.transactionId || 'N/A',
        status: item.verificationStatus === 'verified' ? 'paid' : 'failed',
        verifiedBy: item.verifiedBy?.name || 'Admin',
        verifiedDate: item.verifiedDate,
        remark: item.verificationRemark || ''
      })),
      ...recentSavingsHistory.map((item) => ({
        type: 'Monthly Savings',
        memberName: item.memberId?.userId?.name || 'Unknown Member',
        memberEmail: item.memberId?.userId?.email || '',
        reference: `Month: ${item.month}`,
        amount: item.amount,
        transactionId: item.transactionId || 'N/A',
        status: item.status === 'verified' ? 'paid' : 'failed',
        verifiedBy: item.verifiedBy?.name || 'Admin',
        verifiedDate: item.verifiedDate,
        remark: item.verificationRemark || ''
      }))
    ].sort((a, b) => new Date(b.verifiedDate) - new Date(a.verifiedDate));

    // Stats
    const totalPending = pendingLoanPayments.length + pendingSavingsPayments.length;
    const totalVerifiedCount =
      (await Instalment.countDocuments({ loanId: { $in: groupLoanIds }, verificationStatus: 'verified' })) +
      (await SavingsEntry.countDocuments({ groupId: group._id, status: 'verified', paymentMode: 'UPI' }));
    const totalFailedCount =
      (await Instalment.countDocuments({ loanId: { $in: groupLoanIds }, verificationStatus: 'failed' })) +
      (await SavingsEntry.countDocuments({ groupId: group._id, status: 'failed' }));

    res.render('admin/payments', {
      title: 'Online Payment Verifications',
      group,
      pendingLoanPayments,
      pendingSavingsPayments,
      combinedHistory,
      totalPending,
      totalVerifiedCount,
      totalFailedCount,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verify / Mark Loan Instalment Payment (Approve or Reject)
 */
const verifyLoanPayment = async (req, res, next) => {
  try {
    const { instalmentId } = req.params;
    const { decision, remark = '' } = req.body;

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

    const confirmedAmount = instalment.submittedAmount || instalment.amountDue;
    const cleanRemark = (remark || '').trim();

    if (decision === 'approve') {
      // Mark as Paid
      instalment.status = 'paid';
      instalment.amountPaid = confirmedAmount;
      instalment.verificationStatus = 'verified';
      instalment.paidDate = new Date();
      instalment.verifiedBy = req.currentUser._id;
      instalment.verifiedDate = new Date();
      instalment.verificationRemark = cleanRemark || 'Payment verified and marked as Paid by admin';

      await instalment.save();
      await loan.recalculateBalance();

      req.flash(
        'success',
        `✓ Payment of ₹${confirmedAmount.toLocaleString('en-IN')} for Instalment #${instalment.instalmentNumber} (UTR: ${instalment.transactionId || 'N/A'}) has been verified and marked as PAID!`
      );
    } else if (decision === 'reject') {
      // Mark as Failed
      const now = dayjs().startOf('day');
      instalment.status = dayjs(instalment.dueDate).isBefore(now) ? 'overdue' : 'pending';
      instalment.amountPaid = 0;
      instalment.verificationStatus = 'failed';
      instalment.verifiedBy = req.currentUser._id;
      instalment.verifiedDate = new Date();
      instalment.verificationRemark = cleanRemark || 'Payment not verified (UTR invalid or not credited)';

      await instalment.save();
      await loan.recalculateBalance();

      req.flash(
        'warning',
        `✗ Payment for Instalment #${instalment.instalmentNumber} (UTR: ${instalment.transactionId || 'N/A'}) was marked as FAILED. The instalment status is ${instalment.status} and member can resubmit.`
      );
    } else {
      req.flash('error', 'Invalid verification decision.');
    }

    res.redirect(req.header('Referer') || '/admin/payments');
  } catch (error) {
    next(error);
  }
};

/**
 * Verify / Mark Monthly Savings Deposit (Approve or Reject)
 */
const verifySavingsPayment = async (req, res, next) => {
  try {
    const { entryId } = req.params;
    const { decision, remark = '' } = req.body;

    const entry = await SavingsEntry.findById(entryId);
    if (!entry) {
      req.flash('error', 'Savings entry not found.');
      return res.redirect('back');
    }

    const member = await Member.findById(entry.memberId);
    if (!member) {
      req.flash('error', 'Associated member not found.');
      return res.redirect('back');
    }

    const cleanRemark = (remark || '').trim();

    if (decision === 'approve') {
      // Mark as Paid & Credit Savings
      entry.status = 'verified';
      entry.verifiedBy = req.currentUser._id;
      entry.verifiedDate = new Date();
      entry.verificationRemark = cleanRemark || 'Savings deposit verified and approved by admin';
      await entry.save();

      // Credit member cumulative total savings
      member.totalSavings = (member.totalSavings || 0) + entry.amount;
      await member.save();

      req.flash(
        'success',
        `✓ Monthly savings deposit of ₹${entry.amount.toLocaleString('en-IN')} for ${entry.month} (UTR: ${entry.transactionId || 'N/A'}) has been verified and marked as PAID!`
      );
    } else if (decision === 'reject') {
      // Mark as Failed
      entry.status = 'failed';
      entry.verifiedBy = req.currentUser._id;
      entry.verifiedDate = new Date();
      entry.verificationRemark = cleanRemark || 'Deposit not received in bank account';
      await entry.save();

      req.flash(
        'warning',
        `✗ Monthly savings deposit of ₹${entry.amount.toLocaleString('en-IN')} for ${entry.month} (UTR: ${entry.transactionId || 'N/A'}) was marked as FAILED.`
      );
    } else {
      req.flash('error', 'Invalid verification decision.');
    }

    res.redirect(req.header('Referer') || '/admin/payments');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPendingPayments,
  verifyLoanPayment,
  verifySavingsPayment
};
