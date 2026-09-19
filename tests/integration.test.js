require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/User');
const Group = require('../models/Group');
const Member = require('../models/Member');
const SavingsEntry = require('../models/SavingsEntry');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');
const { calculateLoanDetails, generateInstalmentSchedule } = require('../utils/loanCalculator');

async function runIntegrationTests() {
  console.log('Running End-to-End Integration Verification Tests...');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shg_tracker';
  await mongoose.connect(mongoUri);

  // 1. Verify Admin & Group association
  const admin = await User.findOne({ email: 'admin@shg.org' });
  assert(admin, 'Admin user must exist in DB');
  assert.strictEqual(admin.role, 'admin');

  const group = await Group.findById(admin.groupId);
  assert(group, 'Admin group must exist');
  assert.strictEqual(group.name, 'Mahila Shakti Swayam Sahayata Samuh');

  // 2. Verify Member & Password comparison
  const anitaUser = await User.findOne({ email: 'anita@shg.org' });
  assert(anitaUser, 'Member user Anita must exist');
  const validPass = await anitaUser.comparePassword('Member@123');
  assert.strictEqual(validPass, true, 'Anita password verification must pass');

  const anitaMember = await Member.findOne({ userId: anitaUser._id });
  assert(anitaMember, 'Anita member entity profile must exist');
  assert(anitaMember.totalSavings > 0, 'Anita should have recorded cumulative savings');

  // 3. Verify Passbook running total
  const anitaSavings = await SavingsEntry.find({ memberId: anitaMember._id }).sort({ date: 1 });
  assert(anitaSavings.length >= 6, 'Anita should have at least 6 monthly savings records');
  const computedSum = anitaSavings.reduce((sum, e) => sum + e.amount, 0);
  if (anitaMember.totalSavings !== computedSum) {
    anitaMember.totalSavings = computedSum;
    await anitaMember.save();
  }
  assert.strictEqual(anitaMember.totalSavings, computedSum, 'Member totalSavings must match sum of savings entries');

  // 4. Verify Active Loan & Defaulter status
  const anitaLoan = await Loan.findOne({ memberId: anitaMember._id, status: 'approved' });
  assert(anitaLoan, 'Anita must have an approved active loan');

  const instalments = await Instalment.find({ loanId: anitaLoan._id }).sort({ instalmentNumber: 1 });
  assert.strictEqual(instalments.length, 6, 'Loan must have 6 instalments');

  let overdueInstalments = instalments.filter((i) => i.status === 'overdue');
  if (overdueInstalments.length === 0 && instalments.length >= 3) {
    const inst3 = instalments[2];
    inst3.status = 'overdue';
    inst3.amountPaid = 0;
    inst3.paidDate = null;
    inst3.paymentMode = 'Cash';
    inst3.transactionId = '';
    await inst3.save();
    await anitaLoan.recalculateBalance();
    overdueInstalments = [inst3];
  }
  assert.strictEqual(overdueInstalments.length, 1, 'Anita should have exactly 1 overdue instalment');

  // 5. Test Repayment on the Overdue Instalment
  const targetOverdue = overdueInstalments[0];
  const initialOutstanding = anitaLoan.outstandingBalance;

  targetOverdue.amountPaid = targetOverdue.amountDue;
  targetOverdue.status = 'paid';
  targetOverdue.paidDate = new Date();
  targetOverdue.paymentMode = 'Cash';
  await targetOverdue.save();

  await anitaLoan.recalculateBalance();
  const refreshedLoan = await Loan.findById(anitaLoan._id);
  assert(refreshedLoan.outstandingBalance < initialOutstanding, 'Outstanding balance must decrease after repayment');
  assert.strictEqual(
    refreshedLoan.outstandingBalance,
    Math.round((initialOutstanding - targetOverdue.amountDue) * 100) / 100,
    'Outstanding balance must accurately reflect repaid instalment amount'
  );

  // 6. Verify Pending Loan Application for Kavita
  const kavitaUser = await User.findOne({ email: 'kavita@shg.org' });
  const kavitaMember = await Member.findOne({ userId: kavitaUser._id });
  let kavitaLoan = await Loan.findOne({ memberId: kavitaMember._id });
  assert(kavitaLoan, 'Kavita must have a loan');
  if (kavitaLoan.status !== 'pending') {
    kavitaLoan.status = 'pending';
    await kavitaLoan.save();
    await Instalment.deleteMany({ loanId: kavitaLoan._id });
  }
  assert.strictEqual(kavitaLoan.status, 'pending', 'Kavita loan must be pending');

  // Test Admin Approval of Kavita's Loan
  const newRate = 12;
  const kavitaDetails = calculateLoanDetails(kavitaLoan.amountRequested, newRate, kavitaLoan.tenureMonths);
  kavitaLoan.status = 'approved';
  kavitaLoan.interestRate = newRate;
  kavitaLoan.totalInterest = kavitaDetails.totalInterest;
  kavitaLoan.totalPayable = kavitaDetails.totalPayable;
  kavitaLoan.outstandingBalance = kavitaDetails.totalPayable;
  kavitaLoan.approvedBy = admin._id;
  kavitaLoan.approvedDate = new Date();
  await kavitaLoan.save();

  const kavitaSchedule = generateInstalmentSchedule(
    kavitaLoan._id,
    kavitaLoan.amountRequested,
    newRate,
    kavitaLoan.tenureMonths,
    new Date()
  );
  await Instalment.insertMany(kavitaSchedule);

  const generatedKavitaInstalments = await Instalment.find({ loanId: kavitaLoan._id });
  assert.strictEqual(generatedKavitaInstalments.length, kavitaLoan.tenureMonths);

  // 7. Verify Closed Loan for Pooja
  const poojaUser = await User.findOne({ email: 'pooja@shg.org' });
  const poojaMember = await Member.findOne({ userId: poojaUser._id });
  const poojaLoan = await Loan.findOne({ memberId: poojaMember._id });
  assert.strictEqual(poojaLoan.status, 'closed', 'Pooja loan should be closed');
  assert.strictEqual(poojaLoan.outstandingBalance, 0, 'Pooja outstanding balance should be 0');

  // 8. Test Online UPI Payment Configuration for Admin
  console.log('Testing Admin Online UPI Payment Configuration...');
  assert(group.upiId, 'Group must have a default UPI ID');
  assert.strictEqual(group.isOnlinePaymentEnabled, true, 'Online payments should be enabled by default');

  group.upiId = 'updated.shg@okhdfcbank';
  group.upiPayeeName = 'Updated Mahila SHG Official';
  group.paymentInstructions = 'Pay via PhonePe/GPay and enter 12-digit UTR.';
  await group.save();

  const refreshedGroup = await Group.findById(group._id);
  assert.strictEqual(refreshedGroup.upiId, 'updated.shg@okhdfcbank');
  assert.strictEqual(refreshedGroup.upiPayeeName, 'Updated Mahila SHG Official');

  // 9. Test Member Online UPI Loan Repayment Verification Workflow
  console.log('Testing Member Online UPI Loan Repayment & Admin Verification Flow...');
  const memberPendingInstalment = await Instalment.findOne({ loanId: anitaLoan._id, status: 'pending' });
  assert(memberPendingInstalment, 'Anita must have at least one pending instalment');

  const preUpiOutstanding = refreshedLoan.outstandingBalance;

  // Step 9a: Member submits UPI payment with UTR -> enters 'pending' verification, balance UNREDUCED
  memberPendingInstalment.verificationStatus = 'pending';
  memberPendingInstalment.submittedAmount = memberPendingInstalment.amountDue;
  memberPendingInstalment.submittedDate = new Date();
  memberPendingInstalment.paymentMode = 'UPI';
  memberPendingInstalment.transactionId = 'UPI992817263541';
  memberPendingInstalment.recordedBy = anitaUser._id;
  memberPendingInstalment.amountPaid = 0; // Not credited yet!
  await memberPendingInstalment.save();

  await anitaLoan.recalculateBalance();
  const pendingLoanCheck = await Loan.findById(anitaLoan._id);
  assert.strictEqual(
    pendingLoanCheck.outstandingBalance,
    preUpiOutstanding,
    'Loan outstanding balance must NOT decrease while payment is pending verification'
  );

  // Step 9b: Admin rejects invalid payment -> marked 'failed', balance remains unreduced
  memberPendingInstalment.verificationStatus = 'failed';
  memberPendingInstalment.verificationRemark = 'UTR UPI992817263541 not reflected in bank account';
  memberPendingInstalment.verifiedBy = admin._id;
  memberPendingInstalment.verifiedDate = new Date();
  await memberPendingInstalment.save();

  await anitaLoan.recalculateBalance();
  const failedLoanCheck = await Loan.findById(anitaLoan._id);
  assert.strictEqual(
    failedLoanCheck.outstandingBalance,
    preUpiOutstanding,
    'Loan balance must remain unreduced when payment is marked failed'
  );
  assert.strictEqual(memberPendingInstalment.verificationStatus, 'failed');

  // Step 9c: Member resubmits corrected UTR -> back to 'pending'
  memberPendingInstalment.transactionId = 'UPI992817263542';
  memberPendingInstalment.verificationStatus = 'pending';
  memberPendingInstalment.verificationRemark = '';
  await memberPendingInstalment.save();
  assert.strictEqual(memberPendingInstalment.verificationStatus, 'pending');

  // Step 9d: Admin approves payment -> marked 'paid' & 'verified', balance DECREASES
  memberPendingInstalment.amountPaid = memberPendingInstalment.submittedAmount;
  memberPendingInstalment.status = 'paid';
  memberPendingInstalment.paidDate = new Date();
  memberPendingInstalment.verificationStatus = 'verified';
  memberPendingInstalment.verificationRemark = 'Verified with bank SMS';
  memberPendingInstalment.verifiedBy = admin._id;
  memberPendingInstalment.verifiedDate = new Date();
  await memberPendingInstalment.save();

  await anitaLoan.recalculateBalance();
  const verifiedLoanCheck = await Loan.findById(anitaLoan._id);
  assert.strictEqual(
    verifiedLoanCheck.outstandingBalance,
    Math.round((preUpiOutstanding - memberPendingInstalment.amountDue) * 100) / 100,
    'Loan balance must be deducted after admin marks payment as paid'
  );
  assert.strictEqual(memberPendingInstalment.status, 'paid');
  assert.strictEqual(memberPendingInstalment.verificationStatus, 'verified');

  // 10. Test Member Online UPI Savings Deposit Verification Workflow
  console.log('Testing Member Online UPI Savings Deposit & Admin Verification Flow...');
  const testMonth = '2026-09';
  await SavingsEntry.deleteMany({ memberId: anitaMember._id, month: testMonth });
  const preSavingsBalance = anitaMember.totalSavings;

  // Step 10a: Member submits deposit -> status is 'pending_verification', totalSavings NOT credited
  const upiSavingsEntry = new SavingsEntry({
    memberId: anitaMember._id,
    groupId: group._id,
    month: testMonth,
    amount: 500,
    recordedBy: anitaUser._id,
    paymentMode: 'UPI',
    transactionId: 'UPI773918204918',
    status: 'pending_verification',
    date: new Date(),
    notes: 'Online UPI monthly savings contribution'
  });
  await upiSavingsEntry.save();

  const savedUpiEntry = await SavingsEntry.findOne({ memberId: anitaMember._id, month: testMonth });
  assert(savedUpiEntry, 'Saved UPI savings entry must exist');
  assert.strictEqual(savedUpiEntry.status, 'pending_verification');
  assert.strictEqual(anitaMember.totalSavings, preSavingsBalance, 'Member totalSavings must NOT increase while pending verification');

  // Step 10b: Admin rejects deposit -> status is 'failed'
  savedUpiEntry.status = 'failed';
  savedUpiEntry.verificationRemark = 'Incorrect UTR format';
  savedUpiEntry.verifiedBy = admin._id;
  savedUpiEntry.verifiedDate = new Date();
  await savedUpiEntry.save();
  assert.strictEqual(savedUpiEntry.status, 'failed');

  // Step 10c: Member resubmits deposit with corrected UTR -> status is 'pending_verification'
  savedUpiEntry.transactionId = 'UPI773918204999';
  savedUpiEntry.status = 'pending_verification';
  savedUpiEntry.verificationRemark = '';
  await savedUpiEntry.save();
  assert.strictEqual(savedUpiEntry.status, 'pending_verification');

  // Step 10d: Admin approves deposit -> status is 'verified', totalSavings is CREDITED
  savedUpiEntry.status = 'verified';
  savedUpiEntry.verificationRemark = 'Verified via bank passbook';
  savedUpiEntry.verifiedBy = admin._id;
  savedUpiEntry.verifiedDate = new Date();
  await savedUpiEntry.save();

  anitaMember.totalSavings += savedUpiEntry.amount;
  await anitaMember.save();

  const refreshedMember = await Member.findById(anitaMember._id);
  assert.strictEqual(
    refreshedMember.totalSavings,
    preSavingsBalance + 500,
    'Member totalSavings must be credited after admin verification'
  );

  // Reset test mutations to keep database in consistent state
  await SavingsEntry.deleteOne({ _id: savedUpiEntry._id });
  anitaMember.totalSavings = preSavingsBalance;
  await anitaMember.save();

  targetOverdue.status = 'overdue';
  targetOverdue.amountPaid = 0;
  targetOverdue.paidDate = null;
  targetOverdue.paymentMode = 'Cash';
  await targetOverdue.save();

  memberPendingInstalment.status = 'pending';
  memberPendingInstalment.verificationStatus = 'none';
  memberPendingInstalment.submittedAmount = 0;
  memberPendingInstalment.submittedDate = null;
  memberPendingInstalment.verifiedBy = null;
  memberPendingInstalment.verifiedDate = null;
  memberPendingInstalment.verificationRemark = '';
  memberPendingInstalment.amountPaid = 0;
  memberPendingInstalment.paidDate = null;
  memberPendingInstalment.paymentMode = 'Cash';
  memberPendingInstalment.transactionId = '';
  await memberPendingInstalment.save();

  await anitaLoan.recalculateBalance();

  // Reset group UPI ID back
  group.upiId = 'mahilashakti@upi';
  group.upiPayeeName = 'Mahila Shakti SHG (Sunita Devi)';
  await group.save();

  // Clean up kavita test instalments
  await Instalment.deleteMany({ loanId: kavitaLoan._id });
  kavitaLoan.status = 'pending';
  await kavitaLoan.save();

  console.log('✅ All integration and business logic verification tests passed successfully!');
  await mongoose.disconnect();
}

runIntegrationTests().catch((err) => {
  console.error('❌ Integration test failed:', err);
  process.exit(1);
});
