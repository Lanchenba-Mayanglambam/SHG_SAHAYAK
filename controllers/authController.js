const { validationResult } = require('express-validator');
const User = require('../models/User');
const Group = require('../models/Group');
const Member = require('../models/Member');

/**
 * Render login page
 */
const getLogin = (req, res) => {
  res.render('auth/login', {
    title: 'Login - SHG Tracker',
    formData: {},
    errors: []
  });
};

/**
 * Handle user login
 */
const postLogin = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render('auth/login', {
        title: 'Login - SHG Tracker',
        formData: req.body,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      req.flash('error', 'Invalid email or password.');
      return res.status(401).render('auth/login', {
        title: 'Login - SHG Tracker',
        formData: req.body,
        errors: [{ msg: 'Invalid email or password.' }]
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.flash('error', 'Invalid email or password.');
      return res.status(401).render('auth/login', {
        title: 'Login - SHG Tracker',
        formData: req.body,
        errors: [{ msg: 'Invalid email or password.' }]
      });
    }

    // Set user session
    req.session.userId = user._id;
    req.session.userRole = user.role;

    req.flash('success', `Welcome back, ${user.name}!`);
    return res.redirect('/dashboard');
  } catch (error) {
    next(error);
  }
};

/**
 * Render registration page
 */
const getRegister = async (req, res, next) => {
  try {
    const groups = await Group.find().select('name villageOrArea');
    res.render('auth/register', {
      title: 'Register - SHG Tracker',
      groups,
      formData: { role: 'admin' },
      errors: []
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle registration for both Admin and Member
 */
const postRegister = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    const groups = await Group.find().select('name villageOrArea');

    if (!errors.isEmpty()) {
      return res.status(422).render('auth/register', {
        title: 'Register - SHG Tracker',
        groups,
        formData: req.body,
        errors: errors.array()
      });
    }

    const { name, email, password, role = 'member', groupName, groupId, villageOrArea } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(422).render('auth/register', {
        title: 'Register - SHG Tracker',
        groups,
        formData: req.body,
        errors: [{ msg: 'An account with this email address already exists.' }]
      });
    }

    const passwordHash = await User.hashPassword(password);

    if (role === 'admin') {
      // 1. Create the new user as admin
      const newUser = new User({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: 'admin'
      });
      await newUser.save();

      // 2. Create the primary SHG group for this admin
      const newGroup = new Group({
        name: groupName || `${name}'s SHG Group`,
        villageOrArea: villageOrArea || '',
        createdBy: newUser._id,
        defaultInterestRate: 12,
        monthlyContribution: 500,
        members: []
      });
      await newGroup.save();

      // 3. Link group to user
      newUser.groupId = newGroup._id;
      await newUser.save();

      req.session.userId = newUser._id;
      req.session.userRole = 'admin';
      req.flash('success', `Welcome! Group "${newGroup.name}" created successfully.`);
      return res.redirect('/dashboard');
    } else {
      // Member registration
      let targetGroupId = groupId;
      if (!targetGroupId && groups.length > 0) {
        targetGroupId = groups[0]._id;
      }

      if (!targetGroupId) {
        return res.status(422).render('auth/register', {
          title: 'Register - SHG Tracker',
          groups,
          formData: req.body,
          errors: [{ msg: 'No SHG group is available yet. An Admin must register first to create a group.' }]
        });
      }

      const targetGroup = await Group.findById(targetGroupId);
      if (!targetGroup) {
        return res.status(422).render('auth/register', {
          title: 'Register - SHG Tracker',
          groups,
          formData: req.body,
          errors: [{ msg: 'Selected SHG group does not exist.' }]
        });
      }

      // 1. Create member user
      const newUser = new User({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role: 'member',
        groupId: targetGroup._id
      });
      await newUser.save();

      // 2. Create Member entity profile
      const newMember = new Member({
        userId: newUser._id,
        groupId: targetGroup._id,
        joinDate: new Date(),
        totalSavings: 0,
        status: 'active'
      });
      await newMember.save();

      // 3. Add to Group's members array
      targetGroup.members.push(newMember._id);
      await targetGroup.save();

      req.session.userId = newUser._id;
      req.session.userRole = 'member';
      req.flash('success', `Welcome ${newUser.name}! You have joined "${targetGroup.name}".`);
      return res.redirect('/dashboard');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Handle user logout
 */
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
    res.redirect('/login');
  });
};

module.exports = {
  getLogin,
  postLogin,
  getRegister,
  postRegister,
  logout
};
