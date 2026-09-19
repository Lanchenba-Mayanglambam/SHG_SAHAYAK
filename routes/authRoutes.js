const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginValidation, registerValidation } = require('../utils/validators');
const { isGuest, isLoggedIn } = require('../middlewares/authMiddleware');

router.get('/login', isGuest, authController.getLogin);
router.post('/login', isGuest, loginValidation, authController.postLogin);

router.get('/register', isGuest, authController.getRegister);
router.post('/register', isGuest, registerValidation, authController.postRegister);

router.get('/logout', isLoggedIn, authController.logout);
router.post('/logout', isLoggedIn, authController.logout);

module.exports = router;
