const notFoundHandler = (req, res, next) => {
  res.status(404).render('errors/404', {
    title: 'Page Not Found (404)',
    path: req.originalUrl
  });
};

const errorHandler = (err, req, res, next) => {
  console.error('[Application Error]:', err);

  const statusCode = err.status || 500;
  res.status(statusCode).render('errors/500', {
    title: 'Server Error (500)',
    message: err.message || 'An unexpected internal server error occurred.',
    error: process.env.NODE_ENV === 'development' ? err : {},
    path: req.originalUrl
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
