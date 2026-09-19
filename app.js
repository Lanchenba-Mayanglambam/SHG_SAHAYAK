require('dotenv').config();
const path = require('path');
const express = require('express');
const methodOverride = require('method-override');
const flash = require('connect-flash');

const connectDB = require('./config/db');
const getSessionConfig = require('./config/session');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const savingsRoutes = require('./routes/savingsRoutes');
const loanRoutes = require('./routes/loanRoutes');
const memberRoutes = require('./routes/memberRoutes');

// Initialize Express
const app = express();

// Connect to MongoDB
connectDB();

// View engine setup (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parser and static assets
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(getSessionConfig());

// Flash notifications
app.use(flash());

// Global template variables middleware
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.currentUser = null;
  res.locals.currentGroup = null;
  res.locals.currentMember = null;
  res.locals.currentPath = req.path;
  next();
});

// Mount Routes
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/admin', adminRoutes);
app.use('/savings', savingsRoutes);
app.use('/loans', loanRoutes);
app.use('/member', memberRoutes);

// Error Handling Middlewares
app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[SHG Tracker] Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
