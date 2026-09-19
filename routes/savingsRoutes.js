const express = require('express');
const router = express.Router();
const savingsController = require('../controllers/savingsController');
const { isLoggedIn } = require('../middlewares/authMiddleware');
const { isAdmin } = require('../middlewares/roleMiddleware');
const { recordSavingsValidation } = require('../utils/validators');

// Guard savings management with admin role
router.use(isLoggedIn, isAdmin);

router.get('/', savingsController.getSavings);
router.post('/', recordSavingsValidation, savingsController.postRecordSavings);

module.exports = router;
