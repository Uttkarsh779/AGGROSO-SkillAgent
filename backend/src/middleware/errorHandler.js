/**
 * Central error handling middleware.
 * Catches all errors thrown in route handlers (using express-async-errors).
 * Returns structured JSON errors — never exposes stack traces in production.
 */
function errorHandler(err, req, res, next) {
  const isDev = process.env.NODE_ENV !== 'production';

  // Log all errors server-side
  console.error(`[Error] ${err.message}`);
  if (isDev) console.error(err.stack);

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(422).json({ error: 'Validation failed', errors });
  }

  // Mongoose cast error (invalid ObjectId etc.)
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      error: `Duplicate value for field: ${field}`,
    });
  }

  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = errorHandler;
