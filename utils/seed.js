require('dotenv').config();
const mongoose = require('mongoose');
const dayjs = require('dayjs');
const User = require('../models/User');
const Group = require('../models/Group');
const Member = require('../models/Member');
const SavingsEntry = require('../models/SavingsEntry');
const Loan = require('../models/Loan');
const Instalment = require('../models/Instalment');
const { calculateLoanDetails, generateInstalmentSchedule } = require('./loanCalculator');

async function seedDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shg_tracker';
  console.log(`[Seed] Connecting to ${mongoUri}...`);

  await mongoose.connect(mongoUri);
  console.log('[Seed] Connected. Clearing existing collections...');

  await Promise.all([
    User.deleteMany({}),
    Group.deleteMany({}),
    Member.deleteMany({}),
    SavingsEntry.deleteMany({}),
    Loan.deleteMany({}),
    Instalment.deleteMany({})
  ]);

  console.log('[Seed] Database cleaned. Creating Demo Admin & Group...');

  // 1. Create Admin
  const adminPassword = await User.hashPassword('Admin@123');
  const admin = new User({
    name: 'Sunita Devi (SHG President)',
    email: 'admin@shg.org',
    passwordHash: adminPassword,
    role: 'admin'
  });
  await admin.save();

  // 2. Create Group
  const group = new Group({
    name: 'Mahila Shakti Swayam Sahayata Samuh',
    villageOrArea: 'Rampur Gram Panchayat, Ward 4',
    createdBy: admin._id,
    defaultInterestRate: 12,
    monthlyContribution: 500,
    upiId: 'mahilashakti@upi',
    upiPayeeName: 'Mahila Shakti SHG (Sunita Devi)',
    isOnlinePaymentEnabled: true,
    paymentInstructions: 'Scan using any UPI app (Google Pay, PhonePe, Paytm, BHIM). Enter your 12-digit UTR number after payment.',
    members: []
  });
  await group.save();

  admin.groupId = group._id;
  await admin.save();

  console.log('[Seed] Group created:', group.name);

  // 3. Create Members
  const memberPassword = await User.hashPassword('Member@123');

  const memberData = [
    {
      name: 'Anita Sharma',
      email: 'anita@shg.org',
      phone: '9876543211',
      address: 'House #12, North Lane, Rampur',
      monthsCount: 6
    },
    {
      name: 'Kavita Verma',
      email: 'kavita@shg.org',
      phone: '9876543212',
      address: 'House #45, Near Post Office, Rampur',
      monthsCount: 5
    },
    {
      name: 'Pooja Meena',
      email: 'pooja@shg.org',
      phone: '9876543213',
      address: 'House #78, East Ward, Rampur',
      monthsCount: 4
    }
  ];

  const createdMembers = [];

  for (const mData of memberData) {
    const user = new User({
      name: mData.name,
      email: mData.email,
      passwordHash: memberPassword,
      role: 'member',
      groupId: group._id
    });
    await user.save();

    const member = new Member({
      userId: user._id,
      groupId: group._id,
      joinDate: dayjs().subtract(mData.monthsCount, 'month').toDate(),
      totalSavings: 0,
      status: 'active',
      phone: mData.phone,
      address: mData.address
    });
    await member.save();

    group.members.push(member._id);

    // Add monthly savings contributions
    let totalSavings = 0;
    for (let i = mData.monthsCount; i >= 1; i--) {
      const monthStr = dayjs().subtract(i, 'month').format('YYYY-MM');
      const amount = 500;
      totalSavings += amount;

      const entry = new SavingsEntry({
        memberId: member._id,
        groupId: group._id,
        month: monthStr,
        amount,
        recordedBy: admin._id,
        date: dayjs().subtract(i, 'month').add(5, 'day').toDate(),
        notes: 'Monthly SHG cluster contribution'
      });
      await entry.save();
    }

    member.totalSavings = totalSavings;
    await member.save();

    createdMembers.push({ user, member });
  }

  await group.save();
  console.log(`[Seed] Created ${createdMembers.length} members with confirmed savings history.`);

  // 4. Create Loans
  // Member 1 (Anita Sharma): Active Loan with 2 Paid instalments, 1 Overdue (Defaulter!), 3 Pending
  const anita = createdMembers[0].member;
  const loan1Details = calculateLoanDetails(12000, 12, 6);
  const loan1ApprovalDate = dayjs().subtract(3, 'month').toDate();

  const loan1 = new Loan({
    memberId: anita._id,
    groupId: group._id,
    amountRequested: 12000,
    purpose: 'Dairy cattle feed and livestock shelter renovation',
    tenureMonths: 6,
    interestRate: 12,
    status: 'approved',
    approvedBy: admin._id,
    approvedDate: loan1ApprovalDate,
    totalInterest: loan1Details.totalInterest,
    totalPayable: loan1Details.totalPayable,
    outstandingBalance: loan1Details.totalPayable
  });
  await loan1.save();

  // Generate instalments for loan 1
  const schedule1 = generateInstalmentSchedule(loan1._id, 12000, 12, 6, loan1ApprovalDate);

  // Instalment 1: Paid on time
  schedule1[0].amountPaid = schedule1[0].amountDue;
  schedule1[0].status = 'paid';
  schedule1[0].paidDate = dayjs(schedule1[0].dueDate).subtract(2, 'day').toDate();
  schedule1[0].paymentMode = 'Cash';

  // Instalment 2: Paid on time
  schedule1[1].amountPaid = schedule1[1].amountDue;
  schedule1[1].status = 'paid';
  schedule1[1].paidDate = dayjs(schedule1[1].dueDate).subtract(1, 'day').toDate();
  schedule1[1].paymentMode = 'Cash';

  // Instalment 3: Due last month, NOT paid -> OVERDUE (marks Anita as defaulter)
  schedule1[2].amountPaid = 0;
  schedule1[2].status = 'overdue';

  // Instalments 4, 5, 6: Future dates, pending
  schedule1[3].status = 'pending';
  schedule1[4].status = 'pending';
  schedule1[5].status = 'pending';

  await Instalment.insertMany(schedule1);
  await loan1.recalculateBalance();
  console.log(`[Seed] Created Loan #1 (Active, 1 Overdue) for ${createdMembers[0].user.name}. Outstanding: ₹${loan1.outstandingBalance}`);

  // Member 2 (Kavita Verma): Pending Loan Application awaiting Admin approval
  const kavita = createdMembers[1].member;
  const loan2Details = calculateLoanDetails(8000, 12, 4);

  const loan2 = new Loan({
    memberId: kavita._id,
    groupId: group._id,
    amountRequested: 8000,
    purpose: 'Sewing machine & tailoring fabric inventory',
    tenureMonths: 4,
    interestRate: 12,
    status: 'pending',
    totalInterest: loan2Details.totalInterest,
    totalPayable: loan2Details.totalPayable,
    outstandingBalance: loan2Details.totalPayable
  });
  await loan2.save();
  console.log(`[Seed] Created Loan #2 (Pending Approval) for ${createdMembers[1].user.name}`);

  // Member 3 (Pooja Meena): Fully Repaid & Closed Loan
  const pooja = createdMembers[2].member;
  const loan3ApprovalDate = dayjs().subtract(5, 'month').toDate();
  const loan3Details = calculateLoanDetails(5000, 12, 3);

  const loan3 = new Loan({
    memberId: pooja._id,
    groupId: group._id,
    amountRequested: 5000,
    purpose: 'Handicraft raw materials & bamboo basketry',
    tenureMonths: 3,
    interestRate: 12,
    status: 'approved',
    approvedBy: admin._id,
    approvedDate: loan3ApprovalDate,
    totalInterest: loan3Details.totalInterest,
    totalPayable: loan3Details.totalPayable,
    outstandingBalance: loan3Details.totalPayable
  });
  await loan3.save();

  const schedule3 = generateInstalmentSchedule(loan3._id, 5000, 12, 3, loan3ApprovalDate);
  schedule3.forEach((inst, idx) => {
    inst.amountPaid = inst.amountDue;
    inst.status = 'paid';
    inst.paidDate = dayjs(inst.dueDate).subtract(1, 'day').toDate();
    inst.paymentMode = 'UPI';
    inst.transactionId = 'UPI42918291030' + (idx + 1);
  });
  await Instalment.insertMany(schedule3);
  await loan3.recalculateBalance(); // marks loan3 closed
  console.log(`[Seed] Created Loan #3 (Closed / Fully Repaid) for ${createdMembers[2].user.name}. Status: ${loan3.status}`);

  console.log('\n=========================================');
  console.log('🌱 Seed Data Population Complete!');
  console.log('=========================================');
  console.log('Admin Account:');
  console.log('  Email:    admin@shg.org');
  console.log('  Password: Admin@123');
  console.log('-----------------------------------------');
  console.log('Member Accounts:');
  console.log('  Email:    anita@shg.org  (Active loan + Overdue instalment)');
  console.log('  Email:    kavita@shg.org (Pending loan application)');
  console.log('  Email:    pooja@shg.org  (Completed / Closed loan)');
  console.log('  Password: Member@123');
  console.log('=========================================\n');

  await mongoose.disconnect();
}

seedDatabase().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
