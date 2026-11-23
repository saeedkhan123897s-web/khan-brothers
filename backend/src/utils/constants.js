// ============================================
// APPLICATION CONSTANTS
// ============================================

module.exports = {

    // User Roles
    ROLES: {
        OWNER: 'owner',
        ADMIN: 'admin',
        MANAGER: 'manager',
        SALESMAN: 'salesman',
        MECHANIC: 'mechanic',
        ACCOUNTANT: 'accountant',
        CUSTOMER: 'customer'
    },

    // Order Status
    ORDER_STATUS: {
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        PROCESSING: 'processing',
        SHIPPED: 'shipped',
        DELIVERED: 'delivered',
        CANCELLED: 'cancelled'
    },

    // Payment Status
    PAYMENT_STATUS: {
        PENDING: 'pending',
        PARTIAL: 'partial',
        PAID: 'paid',
        REFUNDED: 'refunded',
        OVERDUE: 'overdue'
    },

    // Payment Methods
    PAYMENT_METHODS: {
        CASH: 'cash',
        BANK_TRANSFER: 'bank_transfer',
        CARD: 'card',
        DIGITAL_WALLET: 'digital_wallet',
        CREDIT: 'credit',
        SPLIT: 'split'
    },

    // Job Card Status
    JOB_STATUS: {
        RECEIVED: 'received',
        DIAGNOSING: 'diagnosing',
        WAITING_PARTS: 'waiting_parts',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        DELIVERED: 'delivered',
        CANCELLED: 'cancelled'
    },

    // Stock Movement Types
    STOCK_MOVEMENT: {
        PURCHASE: 'purchase',
        SALE: 'sale',
        RETURN_IN: 'return_in',
        RETURN_OUT: 'return_out',
        ADJUSTMENT: 'adjustment',
        WORKSHOP_USE: 'workshop_use',
        DAMAGE: 'damage'
    },

    // Account Types
    ACCOUNT_TYPES: {
        ASSET: 'asset',
        LIABILITY: 'liability',
        EQUITY: 'equity',
        INCOME: 'income',
        EXPENSE: 'expense'
    },

    // Audit Actions
    AUDIT_ACTIONS: {
        CREATE: 'create',
        UPDATE: 'update',
        DELETE: 'delete',
        LOGIN: 'login',
        LOGOUT: 'logout',
        SALE: 'sale',
        PURCHASE: 'purchase',
        PAYMENT: 'payment',
        REFUND: 'refund',
        STOCK_ADJUST: 'stock_adjust'
    }
};
