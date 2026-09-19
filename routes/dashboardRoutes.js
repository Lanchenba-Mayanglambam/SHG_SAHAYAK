const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { isLoggedIn } = require('../middlewares/authMiddleware');

// Home route redirects to dashboard if logged in, else login
router.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.redirect('/login');
});

router.get('/dashboard', isLoggedIn, dashboardController.getDashboard);

module.exports = router;
