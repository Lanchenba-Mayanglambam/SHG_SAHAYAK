const dayjs = require('dayjs');
const Member = require('../models/Member');
const SavingsEntry = require('../models/SavingsEntry');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');
const Group = require('../models/Group');

/**
 * Main dashboard router dispatcher (renders admin or member dashboard based on role)
 */
const getDashboard = async (req, res, next) => {
  try {
    const user = req.currentUser;

    if (user.role === 'admin') {
      return renderAdminDashboard(req, res, next);
    } else {
      return renderMemberDashboard(req, res, next);
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Render Admin Dashboard
 */
const renderAdminDashboard = async (req, res, next) => {
  try {
    const group = req.currentGroup;

    if (!group) {
      req.flash('error', 'Please configure an SHG group first.');
      return res.redirect('/admin/group');
    }

    const now = dayjs().startOf('day');

    // 1. Total Group Savings
    const members = await Member.find({ groupId: group._id }).populate('userId', 'name email');
    const totalGroupSavings = members.reduce((sum, m) => sum + (m.totalSavings || 0), 0);
    const activeMemberCount = members.filter((m) => m.status === 'active').length;

    // 2. Loans Disbursed & Active Loans
    const allLoans = await Loan.find({ groupId: group._id });
    const approvedOrClosedLoans = allLoans.filter((l) => ['approved', 'closed'].includes(l.status));
    const activeLoans = allLoans.filter((l) => l.status === 'approved');
    const pendingLoans = allLoans.filter((l) => l.status === 'pending');

    const totalLoansDisbursed = approvedOrClosedLoans.reduce((sum, l) => sum + l.amountRequested, 0);
    const totalPrincipalActive = activeLoans.reduce((sum, l) => sum + l.amountRequested, 0);
    const totalOutstanding = activeLoans.reduce((sum, l) => sum + (l.outstandingBalance || 0), 0);

    // 3. Total Amount Recovered (from instalments of group's loans)
    const approvedLoanIds = approvedOrClosedLoans.map((l) => l._id);
    const allInstalments = await Instalment.find({ loanId: { $in: approvedLoanIds } });
    const totalAmountRecovered = allInstalments.reduce((sum, inst) => sum + (inst.amountPaid || 0), 0);

    // 4. Defaulters Detection (members with >= 1 overdue instalment)
    // Auto-update pending past due to overdue
    await Instalment.updateMany(
      { loanId: { $in: approvedLoanIds }, dueDate: { $lt: now.toDate() }, status: 'pending' },
      { $set: { status: 'overdue' } }
    );

    const overdueInstalments = await Instalment.find({
      loanId: { $in: approvedLoanIds },
      status: 'overdue'
    }).populate({
      path: 'loanId',
      populate: { path: 'memberId', populate: { path: 'userId', select: 'name email' } }
    });

    const defaultersMap = {};
    for (const inst of overdueInstalments) {
      if (!inst.loanId || !inst.loanId.memberId) continue;
      const mem = inst.loanId.memberId;
      const mId = mem._id.toString();

      if (!defaultersMap[mId]) {
        defaultersMap[mId] = {
          member: mem,
          user: mem.userId,
          overdueCount: 0,
          totalOverdueAmount: 0,
          oldestDueDate: inst.dueDate
        };
      }
      defaultersMap[mId].overdueCount += 1;
      defaultersMap[mId].totalOverdueAmount += (inst.amountDue - (inst.amountPaid || 0));
      if (dayjs(inst.dueDate).isBefore(dayjs(defaultersMap[mId].oldestDueDate))) {
        defaultersMap[mId].oldestDueDate = inst.dueDate;
      }
    }

    const defaultersList = Object.values(defaultersMap);

    // 5. Recent Activity
    const recentSavings = await SavingsEntry.find({ groupId: group._id })
      .populate({ path: 'memberId', populate: { path: 'userId', select: 'name' } })
      .sort({ createdAt: -1 })
      .limit(5);

    const recentLoans = await Loan.find({ groupId: group._id })
      .populate({ path: 'memberId', populate: { path: 'userId', select: 'name' } })
      .sort({ createdAt: -1 })
      .limit(5);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard - SHG Tracker',
      group,
      metrics: {
        totalGroupSavings: Math.round(totalGroupSavings * 100) / 100,
        activeMemberCount,
        totalMemberCount: members.length,
        totalLoansDisbursed: Math.round(totalLoansDisbursed * 100) / 100,
        activeLoanCount: activeLoans.length,
        pendingLoanCount: pendingLoans.length,
        totalAmountRecovered: Math.round(totalAmountRecovered * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        defaultersCount: defaultersList.length
      },
      defaultersList,
      recentSavings,
      recentLoans,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Render Member Dashboard
 */
const renderMemberDashboard = async (req, res, next) => {
  try {
    const member = req.currentMember;
    const group = req.currentGroup;

    if (!member) {
      req.flash('error', 'Member profile not found.');
      return res.redirect('/login');
    }

    // 1. Savings Summary
    const totalSavings = member.totalSavings || 0;

    // 2. Active Loan Summary
    const activeLoan = await Loan.findOne({
      memberId: member._id,
      status: 'approved'
    });

    let nextInstalment = null;
    let instalmentStats = null;

    if (activeLoan) {
      const now = dayjs().startOf('day');

      // Refresh overdue
      await Instalment.updateMany(
        { loanId: activeLoan._id, dueDate: { $lt: now.toDate() }, status: 'pending' },
        { $set: { status: 'overdue' } }
      );

      const allLoanInstalments = await Instalment.find({ loanId: activeLoan._id }).sort({ instalmentNumber: 1 });

      nextInstalment = allLoanInstalments.find((i) => ['pending', 'overdue'].includes(i.status));

      const paidCount = allLoanInstalments.filter((i) => i.status === 'paid').length;
      const overdueCount = allLoanInstalments.filter((i) => i.status === 'overdue').length;
      const pendingCount = allLoanInstalments.filter((i) => i.status === 'pending').length;

      instalmentStats = {
        totalInstalments: allLoanInstalments.length,
        paidCount,
        overdueCount,
        pendingCount,
        percentComplete: Math.round((paidCount / allLoanInstalments.length) * 100)
      };
    }

    // Pending loan application (if any)
    const pendingLoan = await Loan.findOne({
      memberId: member._id,
      status: 'pending'
    });

    // Recent Passbook Deposits
    const recentDeposits = await SavingsEntry.find({ memberId: member._id })
      .populate('recordedBy', 'name')
      .sort({ date: -1 })
      .limit(5);

    res.render('member/dashboard', {
      title: 'Member Dashboard - SHG Tracker',
      member,
      group,
      totalSavings: Math.round(totalSavings * 100) / 100,
      activeLoan,
      pendingLoan,
      nextInstalment,
      instalmentStats,
      recentDeposits,
      dayjs
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDashboard
};
