const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');
const { isLoggedIn } = require('../middlewares/authMiddleware');
const { isAdmin, isMember } = require('../middlewares/roleMiddleware');
const {
  loanApplicationValidation,
  loanDecisionValidation,
  recordRepaymentValidation
} = require('../utils/validators');

// All loan routes require login
router.use(isLoggedIn);

// Member loan application
router.get('/request', isMember, loanController.getLoanRequestForm);
router.post('/request', isMember, loanApplicationValidation, loanController.postLoanRequest);

// Admin loan management & decision
router.get('/admin/list', isAdmin, loanController.getAdminLoans);
router.post('/:id/decision', isAdmin, loanDecisionValidation, loanController.postLoanDecision);

// Repayment recording
router.post('/repayment', recordRepaymentValidation, loanController.postRecordRepayment);

// Shared: View loan details & repayment schedule
router.get('/:id', loanController.getLoanDetails);

module.exports = router;
