// ============================================
// HELPER UTILITIES
// ============================================

// Generate unique ID with prefix
function generateId(prefix = 'KB') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
}

// Generate invoice number
function generateInvoiceNumber() {
    return generateId('INV');
}

// Generate job card number
function generateJobCardNumber() {
    return generateId('JOB');
}

// Generate purchase order number
function generatePurchaseNumber() {
    return generateId('PO');
}

// Generate SKU
function generateSKU(category, brand) {
    const cat = (category || 'GEN').substring(0, 3).toUpperCase();
    const br = (brand || 'XX').substring(0, 2).toUpperCase();
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${cat}-${br}-${num}`;
}

// Format currency (PKR)
function formatCurrency(amount) {
    return `PKR ${parseFloat(amount || 0).toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// Calculate percentage
function calculatePercentage(part, total) {
    if (!total || total === 0) return 0;
    return ((part / total) * 100).toFixed(2);
}

// Paginate results
function paginate(page = 1, limit = 20) {
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (p - 1) * l;
    return { page: p, limit: l, offset };
}

// Build pagination response
function paginationResponse(data, total, page, limit) {
    return {
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
        }
    };
}

// Get today's date in SQL format
function todaySQL() {
    return new Date().toISOString().split('T')[0];
}

// Get current datetime in SQL format
function nowSQL() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

module.exports = {
    generateId,
    generateInvoiceNumber,
    generateJobCardNumber,
    generatePurchaseNumber,
    generateSKU,
    formatCurrency,
    calculatePercentage,
    paginate,
    paginationResponse,
    todaySQL,
    nowSQL
};
