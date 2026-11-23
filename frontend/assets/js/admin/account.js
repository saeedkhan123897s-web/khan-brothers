(function (root, factory) {
    'use strict';

    const accounting = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = accounting;
    }

    if (root) {
        root.KHAN_ACCOUNTING = accounting;
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const accountTypes = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

    // Keep this chart aligned with the account codes created by the backend seed.
    const accounts = [
        { code: '1000', name: 'Cash in Hand', type: 'Asset', category: 'Current Assets', normalBalance: 'Debit' },
        { code: '1100', name: 'Bank Account', type: 'Asset', category: 'Current Assets', normalBalance: 'Debit' },
        { code: '1200', name: 'Accounts Receivable', type: 'Asset', category: 'Current Assets', normalBalance: 'Debit', controlAccount: true },
        { code: '1300', name: 'Inventory', type: 'Asset', category: 'Current Assets', normalBalance: 'Debit', controlAccount: true },
        { code: '2000', name: 'Accounts Payable', type: 'Liability', category: 'Current Liabilities', normalBalance: 'Credit', controlAccount: true },
        { code: '2100', name: 'Customer Deposits', type: 'Liability', category: 'Current Liabilities', normalBalance: 'Credit', controlAccount: true },
        { code: '3000', name: 'Owner Capital', type: 'Equity', category: 'Owner Equity', normalBalance: 'Credit' },
        { code: '3100', name: 'Retained Earnings', type: 'Equity', category: 'Owner Equity', normalBalance: 'Credit', controlAccount: true },
        { code: '4000', name: 'Sales Revenue', type: 'Income', category: 'Operating Revenue', normalBalance: 'Credit', controlAccount: true },
        { code: '4100', name: 'Workshop Revenue', type: 'Income', category: 'Operating Revenue', normalBalance: 'Credit', controlAccount: true },
        { code: '4200', name: 'Other Income', type: 'Income', category: 'Other Income', normalBalance: 'Credit' },
        { code: '5000', name: 'Cost of Goods Sold', type: 'Expense', category: 'Direct Costs', normalBalance: 'Debit', controlAccount: true },
        { code: '5100', name: 'Workshop Expenses', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' },
        { code: '5200', name: 'Salaries & Wages', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' },
        { code: '5300', name: 'Rent Expense', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' },
        { code: '5400', name: 'Utilities', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' },
        { code: '5500', name: 'Transportation', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' },
        { code: '5600', name: 'Office Supplies', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' },
        { code: '5700', name: 'Miscellaneous Expenses', type: 'Expense', category: 'Operating Expenses', normalBalance: 'Debit' }
    ];

    const byCode = new Map(accounts.map(account => [account.code, account]));
    const roundPaisa = value => Math.round(Number(value) || 0);

    function normalizeCode(code) {
        return String(code ?? '').trim();
    }

    function getAccountByCode(code) {
        return byCode.get(normalizeCode(code)) || null;
    }

    function getAllAccounts() {
        return accounts.map(account => ({ ...account }));
    }

    function getAccountsByType(type) {
        const normalizedType = String(type ?? '').trim().toLowerCase();
        return accounts
            .filter(account => account.type.toLowerCase() === normalizedType)
            .map(account => ({ ...account }));
    }

    function getAccountsByCategory(category) {
        const normalizedCategory = String(category ?? '').trim().toLowerCase();
        return accounts
            .filter(account => account.category.toLowerCase() === normalizedCategory)
            .map(account => ({ ...account }));
    }

    function searchAccounts(term) {
        const query = String(term ?? '').trim().toLowerCase();
        if (!query) return getAllAccounts();

        return accounts
            .filter(account => [account.code, account.name, account.type, account.category]
                .some(value => value.toLowerCase().includes(query)))
            .map(account => ({ ...account }));
    }

    function getAccountGroups() {
        return accountTypes.reduce((groups, type) => {
            groups[type] = getAccountsByType(type);
            return groups;
        }, {});
    }

    function isValidAccountType(type) {
        return accountTypes.includes(String(type ?? '').trim());
    }

    function validateJournal(journal) {
        const invalid = message => ({
            valid: false,
            message,
            totalDebit,
            totalCredit
        });
        let totalDebit = 0;
        let totalCredit = 0;

        if (!Array.isArray(journal) || journal.length < 2) {
            return invalid('A journal must contain at least two lines.');
        }

        for (let index = 0; index < journal.length; index += 1) {
            const line = journal[index] || {};
            const account = getAccountByCode(line.accountCode ?? line.account_code);
            const debit = Number(line.debitPaisa ?? 0);
            const credit = Number(line.creditPaisa ?? 0);

            if (!account) return invalid(`Unknown account on journal line ${index + 1}.`);
            if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0) {
                return invalid(`Debit and credit must be non-negative whole paisa on line ${index + 1}.`);
            }
            if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
                return invalid(`Enter either a debit or a credit on line ${index + 1}.`);
            }
            if (account.controlAccount) {
                return invalid(`${account.name} is system-controlled and cannot be used in a manual journal.`);
            }

            totalDebit += debit;
            totalCredit += credit;
        }

        if (totalDebit <= 0 || totalDebit !== totalCredit) {
            return invalid('Journal debits and credits must be equal and greater than zero.');
        }

        return { valid: true, message: 'Journal is balanced.', totalDebit, totalCredit };
    }

    function lineAmount(line, field) {
        const paisaKey = `${field}Paisa`;
        if (line[paisaKey] !== undefined) return roundPaisa(line[paisaKey]);
        if (line[field] !== undefined) return roundPaisa(Number(line[field]) * 100);
        return 0;
    }

    function lineAccountCode(line) {
        return normalizeCode(line.accountCode ?? line.account_code ?? line.code);
    }

    function calculateAccountBalance(accountCode, ledgerLines) {
        const account = getAccountByCode(accountCode);
        if (!account || !Array.isArray(ledgerLines)) return 0;

        const net = ledgerLines.reduce((balance, line) => {
            if (!line || lineAccountCode(line) !== account.code) return balance;
            return balance + lineAmount(line, 'debit') - lineAmount(line, 'credit');
        }, 0);

        return account.normalBalance === 'Debit' ? net : -net;
    }

    function calculateTrialBalance(ledgerLines) {
        const entries = Array.isArray(ledgerLines) ? ledgerLines : [];

        return accounts.map(account => {
            const balance = calculateAccountBalance(account.code, entries);
            const isDebitBalance = account.normalBalance === 'Debit' ? balance >= 0 : balance < 0;
            const amount = Math.abs(balance);

            return {
                ...account,
                balance,
                debitBalance: isDebitBalance ? amount : 0,
                creditBalance: isDebitBalance ? 0 : amount
            };
        });
    }

    function formatPKR(amountPaisa) {
        const rupees = Number(amountPaisa) / 100;
        if (!Number.isFinite(rupees)) return 'PKR 0.00';

        return `PKR ${new Intl.NumberFormat('en-PK', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(rupees)}`;
    }

    return {
        version: '1.0.0',
        currency: 'PKR',
        accounts,
        accountTypes: [...accountTypes],
        getAllAccounts,
        getAccountByCode,
        getAccountsByType,
        getAccountsByCategory,
        searchAccounts,
        getAccountGroups,
        isValidAccountType,
        validateJournal,
        calculateAccountBalance,
        calculateTrialBalance,
        formatPKR
    };
});
