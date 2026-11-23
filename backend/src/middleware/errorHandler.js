// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

// 404 Not Found handler
function notFound(req, res, next) {
    const error = new Error(`Route not found: ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
}

// Global error handler
function errorHandler(err, req, res, next) {
    const mysqlConflict = err.code === 'ER_DUP_ENTRY';
    const mysqlBadInput = ['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2', 'ER_BAD_NULL_ERROR', 'ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE'].includes(err.code);
    const databaseUnavailable = ['ECONNREFUSED', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR'].includes(err.code);
    const statusCode = err.statusCode || (mysqlConflict ? 409 : mysqlBadInput ? 400 : databaseUnavailable ? 503 : 500);
    const message = databaseUnavailable
        ? 'Database is unavailable. Check the MySQL service and DB_* settings.'
        : (err.message || 'Internal Server Error');

    console.error(`❌ [${statusCode}] ${message}`);
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}

module.exports = { notFound, errorHandler };
