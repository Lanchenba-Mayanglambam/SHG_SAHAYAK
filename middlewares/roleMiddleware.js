const isAdmin = (req, res, next) => {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    req.flash('error', 'Access denied. Administrator privileges required.');
    return res.redirect('/dashboard');
  }
  next();
};

const isMember = (req, res, next) => {
  if (!req.currentUser || req.currentUser.role !== 'member') {
    req.flash('error', 'Access denied. Member privileges required.');
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = {
  isAdmin,
  isMember
};
