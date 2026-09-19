# Self-Help Group (SHG) Savings & Micro-Loan Tracker

A full-stack, session-based web application built with **strict MVC architecture** using Node.js, Express.js, MongoDB Atlas (via Mongoose), and server-side rendered EJS templates. Designed to empower rural Self-Help Groups (SHGs) to transparently record member monthly savings contributions, disburse and schedule micro-loans, track repayments, and monitor defaulters.

---

## 🌟 Key Features

### 1. Robust Role-Based Session Authentication
- Dual-role authentication (`admin` and `member`) powered by `express-session` and `connect-mongo` session storage in MongoDB.
- Secure password hashing using `bcryptjs`.
- Route guards: `isLoggedIn`, `isAdmin`, `isMember`.
- Flash message notifications for success, warnings, and input validation feedback.

### 2. SHG Group & Member Management
- Admin onboarding initializes a primary SHG group with configurable rules (village/area, default interest rate % p.a., standard monthly savings deposit).
- Member management allows registering members directly or via open registration with group selection.
- Distinct `User` (authentication identity) and `Member` (financial entity) schemas.

### 3. Transparent Monthly Savings Module
- Admin records monthly savings contributions per member (`YYYY-MM` format).
- Compound database index on `(memberId, month)` prevents duplicate deposits for the same period.
- Member `totalSavings` is updated atomically.
- Dedicated **Member Savings Passbook** with chronological contribution ledger and computed running total balance.

### 4. Micro-Loan Disbursement & Repayment Lifecycle
- **Member Loan Application:** Members can apply with requested amount (₹500 - ₹2,00,000), tenure (1-60 months), and purpose. Includes a live real-time loan repayment calculator preview.
- **Admin Review & Decision:** Admin reviews pending applications and either approves with group interest rate or rejects with documented reason.
- **Automated Instalment Generation:** On loan approval, the system auto-generates sequential monthly instalment documents.
- **Repayment Tracking:** Admin can record payments against individual instalments (Cash, UPI, Bank Transfer). The system recalculates `outstandingBalance` and automatically marks loans `closed` when fully settled.
- **Defaulters Tracking:** Automatically detects and displays members with overdue instalments (`dueDate < today` and `status !== 'paid'`).

### 5. Role-Aware Dashboards
- **Admin Dashboard:** Total group savings corpus, total loans disbursed, total amount recovered, active loan count, defaulter alerts, and recent transaction feeds.
- **Member Dashboard:** Personal cumulative savings, active loan summary, upcoming instalment due alert, repayment completion progress bar, and recent passbook deposits.

---

## 📐 Loan Calculation Logic (`utils/loanCalculator.js`)

The application calculates micro-loan interest and schedules using the **Simple Interest Formula**:

$$\text{Interest} = \frac{\text{Principal} \times \text{Annual Rate (\%)} \times \left(\frac{\text{Tenure (Months)}}{12}\right)}{100}$$

$$\text{Total Payable} = \text{Principal} + \text{Interest}$$

$$\text{Monthly Instalment} = \frac{\text{Total Payable}}{\text{Tenure (Months)}}$$

### Precision & Rounding
- All financial calculations are rounded to 2 decimal places.
- When generating instalments, the final instalment absorbs any floating-point remainder cent difference, ensuring that:
  $$\sum \text{amountDue} \equiv \text{Total Payable}$$
- **Outstanding Balance:**
  $$\text{Outstanding Balance} = \text{Total Payable} - \sum \text{amountPaid}$$
- **Overdue Check:**
  If $\text{dueDate} < \text{today}$ and $\text{status} \neq \text{'paid'}$, instalment is classified as `overdue`.

---

## 🏗️ Architecture & Folder Structure

```
shg-tracker/
├── config/
│   ├── db.js                 # MongoDB Atlas / local connection
│   └── session.js            # MongoStore session store configuration
├── models/
│   ├── User.js                # Auth credentials & role ('admin' | 'member')
│   ├── Group.js               # SHG cluster profile, policies, interest rate
│   ├── Member.js              # Profile linking User and Group, total savings
│   ├── SavingsEntry.js         # Monthly savings contribution records
│   ├── Loan.js                 # Micro-loan application, status, totals, balance
│   └── Instalment.js           # Sequential monthly repayment schedule
├── controllers/
│   ├── authController.js      # Login, registration, session destruction
│   ├── adminController.js     # Members, group settings, defaulter tracking
│   ├── memberController.js    # Savings passbook, personal loan overview
│   ├── savingsController.js   # Record savings, group savings history
│   ├── loanController.js      # Apply, approve/reject, record instalment repayment
│   └── dashboardController.js # Role-aware dashboard dispatcher
├── routes/
│   ├── authRoutes.js          # /login, /register, /logout
│   ├── adminRoutes.js         # /admin/members, /admin/group, /admin/defaulters
│   ├── memberRoutes.js        # /member/passbook, /member/loans
│   ├── savingsRoutes.js       # /savings (record & history)
│   ├── loanRoutes.js          # /loans/* (request, decision, repay, schedule)
│   └── dashboardRoutes.js     # /dashboard
├── middlewares/
│   ├── authMiddleware.js      # isLoggedIn, isGuest
│   ├── roleMiddleware.js      # isAdmin, isMember
│   └── errorHandler.js        # Centralized 404 & 500 handlers
├── views/
│   ├── layouts/
│   ├── partials/               # navbar, header, footer, flash alerts
│   ├── auth/                   # login.ejs, register.ejs
│   ├── admin/                  # dashboard, members, groups, savings, loans, loan-detail, defaulters
│   ├── member/                 # dashboard, passbook, loan-request, loans, loan-detail
│   └── errors/                 # 404.ejs, 500.ejs
├── public/
│   ├── css/
│   │   └── style.css          # Custom rich micro-finance theme (emerald/gold/slate)
│   └── js/
│       └── main.js            # Clientside live loan preview & modal invokers
├── utils/
│   ├── loanCalculator.js      # Mathematical interest & instalment generator
│   ├── validators.js          # Express-validator schemas
│   └── seed.js                # Demo database seeder
├── tests/
│   ├── loanCalculator.test.js # Financial math unit tests
│   └── integration.test.js    # End-to-end flow test
├── .env.example
├── .env
├── app.js                     # Express application entrypoint
├── package.json
└── README.md
```

---

## 🚀 Quickstart & Setup

### Prerequisites
- **Node.js**: v18+ (tested on Node v26)
- **MongoDB**: Local MongoDB instance (`mongodb://127.0.0.1:27017`) or MongoDB Atlas cluster URI.

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your settings:
```bash
cp .env.example .env
```
Default `.env` values:
```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/shg_tracker
SESSION_SECRET=shg_super_secure_secret_key_2026_dev
NODE_ENV=development
```

*(For MongoDB Atlas, set `MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/shg_tracker?retryWrites=true&w=majority`)*

### 3. Populate Demo Seed Data
Run the built-in database seed script:
```bash
npm run seed
```

### 4. Run Automated Test Suite
Verify loan calculations and database integration:
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
# or
npm start
```
Visit **`http://localhost:3000`** in your browser.

---

## 🔑 Demo Login Credentials

The seed script creates a complete SHG ecosystem with ready-to-test scenarios:

| Role | Name | Email | Password | Scenario / Testing Purpose |
|---|---|---|---|---|
| **Admin** | Sunita Devi (President) | `admin@shg.org` | `Admin@123` | Full administrative control: manage members, record savings, approve loans, track defaulters |
| **Member** | Anita Sharma | `anita@shg.org` | `Member@123` | 6 months savings history, active ₹12,000 loan with **1 Overdue instalment** (Defaulter) |
| **Member** | Kavita Verma | `kavita@shg.org` | `Member@123` | 5 months savings history, **Pending micro-loan application** awaiting admin approval |
| **Member** | Pooja Meena | `pooja@shg.org` | `Member@123` | 4 months savings history, **Fully repaid & closed loan** |

---

## 🧪 Testing Scenarios to Try

1. **Defaulter Tracking & Repayment**:
   - Log in as `admin@shg.org`.
   - Go to **Defaulters** (`/admin/defaulters`) to see Anita Sharma listed with 1 overdue instalment.
   - Click **Collect Payment**, record payment for Instalment #3.
   - Return to Defaulters page: Anita is automatically cleared from the list!
2. **Loan Application & Approval**:
   - Log in as `kavita@shg.org`. Notice pending loan status on dashboard.
   - Log in as `admin@shg.org`, navigate to **Loan Approvals** (`/loans/admin/list`).
   - Click **Review & Decide**, approve Kavita's loan. Notice the 4-month instalment schedule generated automatically.
3. **Savings Passbook**:
   - Log in as `anita@shg.org`, click **Savings Passbook** (`/member/passbook`).
   - Observe chronological ledger entries with confirmed running totals.
