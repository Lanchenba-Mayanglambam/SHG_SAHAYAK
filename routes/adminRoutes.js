const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const paymentVerificationController = require('../controllers/paymentVerificationController');
const { isLoggedIn } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');
const { addMemberValidation, createGroupValidation } = require('../utils/validators');

// Guard all admin routes with authentication and admin role check
router.use(isLoggedIn, isAdmin);

// Member management
router.get('/members', adminController.getMembers);
router.post('/members', addMemberValidation, adminController.postAddMember);
router.post('/members/:id/toggle', adminController.toggleMemberStatus);

// Group management
router.get('/group', adminController.getGroupSettings);
router.post('/group', createGroupValidation, adminController.updateGroupSettings);

// Defaulters list
router.get('/defaulters', adminController.getDefaulters);

// Payment Verifications (UPI Payments approval/rejection)
router.get('/payments', paymentVerificationController.getPendingPayments);
router.post('/payments/loan/:instalmentId/verify', paymentVerificationController.verifyLoanPayment);
router.post('/payments/savings/:entryId/verify', paymentVerificationController.verifySavingsPayment);

module.exports = router;
