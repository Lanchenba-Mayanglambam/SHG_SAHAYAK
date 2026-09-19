const User = require('../models/User');
const Group = require('../models/Group');
const Member = require('../models/Member');

const isLoggedIn = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.flash('error', 'Please log in to access this page.');
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.session.userId).select('-passwordHash');
    if (!user) {
      req.session.destroy();
      req.flash('error', 'User account not found. Please log in again.');
      return res.redirect('/login');
    }

    req.currentUser = user;
    res.locals.currentUser = user;

    // Attach user group if exists
    if (user.groupId) {
      const group = await Group.findById(user.groupId);
      req.currentGroup = group;
      res.locals.currentGroup = group;
    }

    // Attach member record if user is a member
    if (user.role === 'member') {
      const member = await Member.findOne({ userId: user._id });
      req.currentMember = member;
      res.locals.currentMember = member;
    }

    next();
  } catch (error) {
    next(error);
  }
};

const isGuest = (req, res, next) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = {
  isLoggedIn,
  isGuest
};
