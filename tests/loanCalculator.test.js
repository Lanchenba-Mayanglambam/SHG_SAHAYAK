const assert = require('assert');
const { calculateLoanDetails, generateInstalmentSchedule, computeRepaymentStats } = require('../utils/loanCalculator');

console.log('Running Loan Calculator unit tests...');

// Test 1: Simple Interest formula calculation
// Principal: 10,000, Rate: 12% p.a., Tenure: 6 months
// Interest = 10000 * 12 * (6 / 12) / 100 = 600
// TotalPayable = 10600
// MonthlyInstalment = 10600 / 6 = 1766.67
const details1 = calculateLoanDetails(10000, 12, 6);
assert.strictEqual(details1.totalInterest, 600, 'Total interest should be 600');
assert.strictEqual(details1.totalPayable, 10600, 'Total payable should be 10600');
assert.strictEqual(details1.monthlyInstalment, 1766.67, 'Monthly instalment should be 1766.67');

// Test 2: Schedule generation and exact sum reconciliation
const schedule = generateInstalmentSchedule('dummyLoanId', 10000, 12, 6, new Date('2026-01-01'));
assert.strictEqual(schedule.length, 6, 'Should generate 6 instalments');
const sumDue = schedule.reduce((sum, inst) => sum + inst.amountDue, 0);
assert.strictEqual(Math.round(sumDue * 100) / 100, 10600, 'Sum of instalments must strictly equal total payable');

// Test 3: Repayment stats
schedule[0].amountPaid = schedule[0].amountDue;
schedule[0].status = 'paid';
schedule[1].amountPaid = schedule[1].amountDue;
schedule[1].status = 'paid';

const stats = computeRepaymentStats(10600, schedule);
assert.strictEqual(stats.paidCount, 2, '2 instalments paid');
assert.strictEqual(stats.outstandingBalance, Math.round((10600 - schedule[0].amountPaid - schedule[1].amountPaid) * 100) / 100);

console.log('✅ All loan calculator unit tests passed!');
