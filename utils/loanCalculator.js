const dayjs = require('dayjs');

/**
 * Calculates loan financial details using Simple Interest:
 * Interest = (Principal * AnnualRate% * (TenureMonths / 12)) / 100
 * TotalPayable = Principal + Interest
 * MonthlyInstalment = TotalPayable / TenureMonths
 *
 * @param {number} principal - Loan amount requested
 * @param {number} annualRate - Annual interest rate in percent (e.g., 12 for 12% p.a.)
 * @param {number} tenureMonths - Loan duration in months
 * @returns {Object} Calculated loan metrics with 2-decimal precision
 */
function calculateLoanDetails(principal, annualRate, tenureMonths) {
  const p = Number(principal);
  const r = Number(annualRate);
  const t = Number(tenureMonths);

  if (isNaN(p) || p <= 0 || isNaN(r) || r < 0 || isNaN(t) || t <= 0) {
    throw new Error('Invalid loan calculation parameters');
  }

  // Simple Interest: (P * R * (T / 12)) / 100
  const interestRaw = (p * r * (t / 12)) / 100;
  const totalInterest = Math.round(interestRaw * 100) / 100;
  const totalPayable = Math.round((p + totalInterest) * 100) / 100;

  // Average monthly instalment
  const monthlyInstalment = Math.round((totalPayable / t) * 100) / 100;

  return {
    principal: p,
    annualRate: r,
    tenureMonths: t,
    totalInterest,
    totalPayable,
    monthlyInstalment
  };
}

/**
 * Generates an array of instalment schedule objects for a loan.
 * Sequential due dates are set 1 month apart starting from approval date.
 * Adjusts the final instalment so sum(amountDue) strictly equals totalPayable.
 *
 * @param {string|ObjectId} loanId
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} tenureMonths
 * @param {Date|string} approvalDate
 * @returns {Array<Object>} List of instalment document payloads
 */
function generateInstalmentSchedule(loanId, principal, annualRate, tenureMonths, approvalDate = new Date()) {
  const details = calculateLoanDetails(principal, annualRate, tenureMonths);
  const { totalPayable } = details;
  const t = Number(tenureMonths);

  const baseInstalment = Math.round((totalPayable / t) * 100) / 100;
  const schedule = [];
  let allocatedSoFar = 0;

  const baseDate = dayjs(approvalDate);

  for (let i = 1; i <= t; i++) {
    // Due date is i months after approval date
    const dueDate = baseDate.add(i, 'month').startOf('day').toDate();

    let amountDue;
    if (i === t) {
      // Final instalment absorbs any remainder cent difference
      amountDue = Math.round((totalPayable - allocatedSoFar) * 100) / 100;
    } else {
      amountDue = baseInstalment;
      allocatedSoFar = Math.round((allocatedSoFar + amountDue) * 100) / 100;
    }

    schedule.push({
      loanId,
      instalmentNumber: i,
      dueDate,
      amountDue,
      amountPaid: 0,
      status: 'pending',
      paidDate: null
    });
  }

  return schedule;
}

/**
 * Computes remaining outstanding balance and paid/pending counts from a list of instalments
 *
 * @param {number} totalPayable
 * @param {Array<Object>} instalments
 * @returns {Object} { totalPaid, outstandingBalance, paidCount, pendingCount, overdueCount }
 */
function computeRepaymentStats(totalPayable, instalments = []) {
  const totalPaid = instalments.reduce((sum, inst) => sum + (inst.amountPaid || 0), 0);
  const roundedPaid = Math.round(totalPaid * 100) / 100;
  const outstandingBalance = Math.max(0, Math.round((totalPayable - roundedPaid) * 100) / 100);

  const now = dayjs().startOf('day');
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  instalments.forEach((inst) => {
    if (inst.status === 'paid') {
      paidCount++;
    } else if (dayjs(inst.dueDate).isBefore(now)) {
      overdueCount++;
    } else {
      pendingCount++;
    }
  });

  return {
    totalPaid: roundedPaid,
    outstandingBalance,
    paidCount,
    pendingCount,
    overdueCount
  };
}

/**
 * Updates instalment statuses to 'overdue' if due date is in the past and status is not 'paid'
 *
 * @param {Array<Object>} instalments
 * @returns {Array<Object>}
 */
function refreshOverdueStatuses(instalments = []) {
  const now = dayjs().startOf('day');
  return instalments.map((inst) => {
    if (inst.status !== 'paid' && dayjs(inst.dueDate).isBefore(now)) {
      inst.status = 'overdue';
    }
    return inst;
  });
}

module.exports = {
  calculateLoanDetails,
  generateInstalmentSchedule,
  computeRepaymentStats,
  refreshOverdueStatuses
};
