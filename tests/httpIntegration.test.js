require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/User');
const Member = require('../models/Member');
const SavingsEntry = require('../models/SavingsEntry');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');

async function testHttpEndpoints() {
  console.log('Testing Live HTTP Endpoints against running server http://localhost:3000...');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shg_tracker';
  await mongoose.connect(mongoUri);

  const cleanCookie = (raw) => (raw ? raw.split(';')[0] : '');

  // 1. Admin Login
  const loginRes = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'admin@shg.org', password: 'Admin@123' }),
    redirect: 'manual'
  });
  assert.strictEqual(loginRes.status, 302, 'Admin login should redirect on success');
  const adminCookie = cleanCookie(loginRes.headers.get('set-cookie'));
  assert(adminCookie, 'Session cookie must be returned');

  // Allow cloud MongoDB Atlas session store write to complete
  await new Promise((r) => setTimeout(r, 400));

  // 2. Admin Payment Verifications Page
  const adminPaymentsRes = await fetch('http://localhost:3000/admin/payments', {
    headers: { Cookie: adminCookie }
  });
  const adminPaymentsHtml = await adminPaymentsRes.text();
  if (adminPaymentsRes.status !== 200) {
    console.error('Admin Payments 500 error:', adminPaymentsHtml);
  }
  assert.strictEqual(adminPaymentsRes.status, 200, 'Admin payments page should return 200');
  assert(adminPaymentsHtml.includes('Payment Verifications'), 'Must include title Payment Verifications');
  assert(adminPaymentsHtml.includes('Pending Verification'), 'Must include Pending Verification card');
  assert(adminPaymentsHtml.includes('Pending Micro-Loan Repayments'), 'Must include Pending Micro-Loan Repayments section');
  assert(adminPaymentsHtml.includes('Pending Monthly Savings Deposits'), 'Must include Pending Monthly Savings Deposits section');
  console.log('✅ Admin Payment Verifications page rendered successfully (200 OK)!');

  // 3. Member Login
  const memberLoginRes = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'anita@shg.org', password: 'Member@123' }),
    redirect: 'manual'
  });
  assert.strictEqual(memberLoginRes.status, 302, 'Member login should redirect');
  const memberCookie = cleanCookie(memberLoginRes.headers.get('set-cookie'));
  assert(memberCookie, 'Member session cookie must be returned');

  // Allow cloud MongoDB Atlas session store write to complete
  await new Promise((r) => setTimeout(r, 400));

  // 4. Member Passbook Page
  const passbookRes = await fetch('http://localhost:3000/member/passbook', {
    headers: { Cookie: memberCookie }
  });
  assert.strictEqual(passbookRes.status, 200, 'Member passbook should return 200');
  const passbookHtml = await passbookRes.text();
  assert(passbookHtml.includes('Member Savings Passbook'), 'Passbook title must be present');
  assert(passbookHtml.includes('Chronological Contribution Ledger'), 'Ledger must be present');
  assert(passbookHtml.includes('Status'), 'Status column header must be present');
  console.log('✅ Member Passbook page rendered successfully (200 OK)!');

  // 5. Member Loans Page
  const loansRes = await fetch('http://localhost:3000/member/loans', {
    headers: { Cookie: memberCookie }
  });
  assert.strictEqual(loansRes.status, 200, 'Member loans should return 200');
  const loansHtml = await loansRes.text();
  assert(loansHtml.includes('My Micro-Loans'), 'Loans page title must be present');
  console.log('✅ Member Loans page rendered successfully (200 OK)!');

  // 6. Test Live HTTP Lifecycle for Savings: Member Submit -> Admin Reject -> Member Resubmit -> Admin Approve
  console.log('Testing live HTTP lifecycle for member savings payment verification...');
  const anitaUser = await User.findOne({ email: 'anita@shg.org' });
  const anitaMember = await Member.findOne({ userId: anitaUser._id });

  const testMonth = '2027-02';
  await SavingsEntry.deleteMany({ memberId: anitaMember._id, month: testMonth });

  // 6a. Member submits savings deposit via HTTP POST
  const submitRes = await fetch('http://localhost:3000/member/savings/upi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: memberCookie
    },
    body: new URLSearchParams({
      month: testMonth,
      amount: '500',
      transactionId: 'HTTPTEST999901',
      notes: 'Test savings contribution'
    }),
    redirect: 'manual'
  });
  assert.strictEqual(submitRes.status, 302, 'Member savings submission should redirect');

  const pendingEntry = await SavingsEntry.findOne({ memberId: anitaMember._id, month: testMonth });
  assert(pendingEntry, 'Savings entry must exist in DB');
  assert.strictEqual(pendingEntry.status, 'pending_verification', 'Status must be pending_verification');

  // 6b. Admin views /admin/payments and verifies entry is listed
  const adminCheck1 = await fetch('http://localhost:3000/admin/payments', { headers: { Cookie: adminCookie } });
  const adminHtml1 = await adminCheck1.text();
  assert(adminHtml1.includes('HTTPTEST999901'), 'Admin verifications page must list member UTR');

  // 6c. Admin rejects entry via HTTP POST
  const rejectRes = await fetch(`http://localhost:3000/admin/payments/savings/${pendingEntry._id}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: adminCookie
    },
    body: new URLSearchParams({
      decision: 'reject',
      remark: 'UTR not found in bank ledger'
    }),
    redirect: 'manual'
  });
  assert.strictEqual(rejectRes.status, 302, 'Admin rejection should redirect');

  const rejectedEntry = await SavingsEntry.findById(pendingEntry._id);
  assert.strictEqual(rejectedEntry.status, 'failed', 'Status must now be failed');
  assert.strictEqual(rejectedEntry.verificationRemark, 'UTR not found in bank ledger');

  // 6d. Member views passbook and sees the failure status
  const passbookCheck = await fetch('http://localhost:3000/member/passbook', { headers: { Cookie: memberCookie } });
  const passbookHtml1 = await passbookCheck.text();
  assert(passbookHtml1.includes('Failed'), 'Passbook must show Failed status');
  assert(passbookHtml1.includes('UTR not found in bank ledger'), 'Passbook must display admin remark');

  // 6e. Admin approves entry via HTTP POST
  const approveRes = await fetch(`http://localhost:3000/admin/payments/savings/${pendingEntry._id}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: adminCookie
    },
    body: new URLSearchParams({
      decision: 'approve',
      remark: 'Manually verified with bank'
    }),
    redirect: 'manual'
  });
  assert.strictEqual(approveRes.status, 302, 'Admin approval should redirect');

  const approvedEntry = await SavingsEntry.findById(pendingEntry._id);
  assert.strictEqual(approvedEntry.status, 'verified', 'Status must now be verified');

  // Cleanup test entry
  await SavingsEntry.deleteMany({ memberId: anitaMember._id, month: testMonth });
  await SavingsEntry.deleteMany({ memberId: anitaMember._id, month: '2027-01' });

  await mongoose.disconnect();
  console.log('✅ End-to-end HTTP verification lifecycle passed successfully!');
  console.log('🎉 All live HTTP route tests passed flawlessly!');
}

testHttpEndpoints().catch((err) => {
  console.error('❌ HTTP test failed:', err);
  process.exit(1);
});
