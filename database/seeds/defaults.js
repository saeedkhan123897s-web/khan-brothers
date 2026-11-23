'use strict';

const categories = [
    ['Engine Parts', 'Engine components and related parts'],
    ['Brake Parts', 'Brake shoes, cables, discs and components'],
    ['Electrical Parts', 'Batteries, lights, wiring and electrical'],
    ['Body Parts', 'Fairings, mudguards, seats and body panels'],
    ['Suspension', 'Shocks, forks and suspension parts'],
    ['Transmission', 'Chain, sprockets, clutch and gear parts'],
    ['Filters', 'Oil filters, air filters and fuel filters'],
    ['Oils & Lubricants', 'Engine oils, gear oils and lubricants'],
    ['Tires & Tubes', 'Tires, tubes and rim accessories'],
    ['Accessories', 'Helmets, gloves, covers and accessories']
];

const brands = [
    'Honda', 'Yamaha', 'Suzuki', 'United', 'Road Prince',
    'Super Power', 'Hi-Speed', 'Pak Hero', 'Ravi', 'Generic'
];

const services = [
    ['Engine Repair', 'Complete engine overhaul and repair', 3000],
    ['Oil Change', 'Engine oil replacement service', 500],
    ['Brake Service', 'Brake inspection, adjustment and replacement', 800],
    ['Electrical Repair', 'Battery, wiring and electrical diagnosis', 1000],
    ['Chain Adjustment', 'Chain tension and lubrication', 300],
    ['Tire Change', 'Tire and tube replacement', 400],
    ['General Tune-Up', 'Complete motorcycle tune-up service', 1500],
    ['Clutch Repair', 'Clutch plate and cable repair', 1200],
    ['Carburetor Service', 'Carburetor cleaning and tuning', 800],
    ['Suspension Service', 'Shock absorber and fork service', 1500]
];

const accounts = [
    ['1000', 'Cash', 'asset'],
    ['1100', 'Bank Account', 'asset'],
    ['1200', 'Accounts Receivable', 'asset'],
    ['1300', 'Inventory', 'asset'],
    ['2000', 'Accounts Payable', 'liability'],
    ['2100', 'Customer Deposits', 'liability'],
    ['3000', 'Owner Equity', 'equity'],
    ['3100', 'Retained Earnings', 'equity'],
    ['4000', 'Sales Revenue', 'income'],
    ['4100', 'Workshop Revenue', 'income'],
    ['4200', 'Other Income', 'income'],
    ['5000', 'Cost of Goods Sold', 'expense'],
    ['5100', 'Workshop Expenses', 'expense'],
    ['5200', 'Salaries & Wages', 'expense'],
    ['5300', 'Rent', 'expense'],
    ['5400', 'Utilities', 'expense'],
    ['5500', 'Transportation', 'expense'],
    ['5600', 'Office Supplies', 'expense'],
    ['5700', 'Miscellaneous Expenses', 'expense']
];

const settings = [
    ['business_name', 'Khan Brothers', 'business'],
    ['business_tagline', 'Motorcycle Workshop & Spare Parts', 'business'],
    ['business_address', 'Swat, Pakistan', 'business'],
    ['business_phone', '03001234567', 'business'],
    ['business_email', 'info@khanbros.pk', 'business'],
    ['currency', 'PKR', 'general'],
    ['currency_symbol', 'Rs.', 'general'],
    ['tax_enabled', 'false', 'general'],
    ['tax_rate', '0', 'general'],
    ['invoice_prefix', 'INV', 'general'],
    ['job_card_prefix', 'JOB', 'general'],
    ['low_stock_threshold', '5', 'inventory'],
    ['default_payment_method', 'cash', 'payment']
];

module.exports = { categories, brands, services, accounts, settings };
