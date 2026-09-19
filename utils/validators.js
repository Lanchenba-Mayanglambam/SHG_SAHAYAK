const { body } = require('express-validator');

const loginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password cannot be empty')
];

const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  body('role')
    .optional()
    .isIn(['admin', 'member'])
    .withMessage('Invalid role specified'),
  body('groupName')
    .if(body('role').equals('admin'))
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage('SHG Group Name must be between 3 and 120 characters')
];

const createGroupValidation = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage('Group Name must be between 3 and 120 characters'),
  body('villageOrArea')
    .optional()
    .trim(),
  body('defaultInterestRate')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Interest rate must be between 0% and 100%'),
  body('monthlyContribution')
    .optional()
    .isFloat({ min: 10 })
    .withMessage('Monthly contribution must be at least ₹10'),
  body('upiId')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[\w.-]+@[\w.-]+$/)
    .withMessage('Please enter a valid UPI ID (e.g. name@bank or phone@upi)'),
  body('upiPayeeName')
    .optional()
    .trim(),
  body('paymentInstructions')
    .optional()
    .trim()
];

const addMemberValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Member name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 6 })
    .withMessage('Default password must be at least 6 characters (defaults to Member@123 if blank)'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isMobilePhone('any')
    .withMessage('Please enter a valid phone number'),
  body('address')
    .optional()
    .trim()
];

const recordSavingsValidation = [
  body('memberId')
    .notEmpty()
    .withMessage('Please select a member'),
  body('month')
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage('Month must be in YYYY-MM format (e.g., 2026-09)'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Contribution amount must be greater than ₹0'),
  body('notes')
    .optional()
    .trim()
];

const loanApplicationValidation = [
  body('amountRequested')
    .isFloat({ min: 500, max: 200000 })
    .withMessage('Loan amount must be between ₹500 and ₹2,00,000'),
  body('purpose')
    .trim()
    .isLength({ min: 3, max: 250 })
    .withMessage('Loan purpose must be between 3 and 250 characters'),
  body('tenureMonths')
    .isInt({ min: 1, max: 60 })
    .withMessage('Tenure must be between 1 and 60 months')
];

const loanDecisionValidation = [
  body('decision')
    .isIn(['approved', 'rejected'])
    .withMessage('Decision must be either approved or rejected'),
  body('interestRate')
    .if(body('decision').equals('approved'))
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Interest rate must be between 0% and 100%'),
  body('rejectionReason')
    .if(body('decision').equals('rejected'))
    .trim()
    .isLength({ min: 3 })
    .withMessage('Please provide a reason for rejection')
];

const recordRepaymentValidation = [
  body('instalmentId')
    .notEmpty()
    .withMessage('Instalment ID is required'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Payment amount must be greater than ₹0'),
  body('paymentMode')
    .optional()
    .isIn(['Cash', 'UPI', 'Bank Transfer'])
    .withMessage('Invalid payment mode'),
  body('transactionId')
    .optional()
    .trim()
];

const memberSavingsUpiValidation = [
  body('month')
    .trim()
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage('Contribution month must be in YYYY-MM format'),
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Savings amount must be greater than ₹0'),
  body('transactionId')
    .optional()
    .trim()
];

module.exports = {
  loginValidation,
  registerValidation,
  createGroupValidation,
  addMemberValidation,
  recordSavingsValidation,
  loanApplicationValidation,
  loanDecisionValidation,
  recordRepaymentValidation,
  memberSavingsUpiValidation
};
