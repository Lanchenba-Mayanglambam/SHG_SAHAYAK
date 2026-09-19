const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const { isLoggedIn } = require('../middlewares/authMiddleware');
const { isMember } = require('../middlewares/roleMiddleware');

const { memberSavingsUpiValidation } = require('../utils/validators');

// Guard all member routes with login and member role check
router.use(isLoggedIn, isMember);

router.get('/passbook', memberController.getPassbook);
router.post('/savings/upi', memberSavingsUpiValidation, memberController.postMemberSavingsUpi);
router.get('/loans', memberController.getMemberLoans);

module.exports = router;
