const session = require('express-session');
const MongoStore = require('connect-mongo');

const getSessionConfig = () => {
  const mongoUrl = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shg_tracker';

  return session({
    secret: process.env.SESSION_SECRET || 'shg_super_secure_secret_key_2026_dev',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl,
      dbName: 'shg_tracker',
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60, // 14 days
      autoRemove: 'native'
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 1 day
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    }
  });
};

module.exports = getSessionConfig;
