'use strict';

const { deflateRawSync } = require('node:zlib');

const currencyKeys = /^(?:purchase_price|repair_cost|other_cost|total_cost|asking_price|expected_margin|sale_amount|actual_margin|sell_price|cost_at_sale|profit|qist_balance|expected_profit|outstanding_balance|total_purchases|amount|revenue|gross_profit|net_profit|expenses)$/;
const worksheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const packageNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
const documentNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);

function csvValue(value) {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(text) && !/^-\d+(?:\.\d+)?$/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
}

function csv(sheets) {
    const content = sheets.map(sheet => [
        ...(sheets.length > 1 ? [csvValue(sheet.name)] : []),
        sheet.columns.map(([, label]) => csvValue(label)).join(','),
        ...sheet.rows.map(row => sheet.columns.map(([key]) => csvValue(row[key])).join(','))
    ].join('\r\n')).join('\r\n\r\n');
    return { extension: 'csv', mime: 'text/csv; charset=utf-8', content: '\ufeff' + content + '\r\n' };
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
    const entries = [];
    const directory = [];
    let offset = 0;
    for (const [path, source] of files) {
        const filename = Buffer.from(path);
        const body = Buffer.from(source);
        const compressed = deflateRawSync(body);
        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(8, 8);
        header.writeUInt16LE(33, 12); // 1 January 1980 in DOS date format
        header.writeUInt32LE(crc32(body), 14);
        header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(body.length, 22);
        header.writeUInt16LE(filename.length, 26);
        entries.push(header, filename, compressed);

        const record = Buffer.alloc(46);
        record.writeUInt32LE(0x02014b50);
        record.writeUInt16LE(20, 4);
        header.copy(record, 6, 4, 30);
        record.writeUInt32LE(offset, 42);
        directory.push(record, filename);
        offset += header.length + filename.length + compressed.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.reduce((size, block) => size + block.length, 0), 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...entries, ...directory, end]);
}

function worksheet(sheet) {
    function cell(value, key) {
        const numeric = value !== null && value !== '' && value !== undefined &&
            (typeof value === 'number' || currencyKeys.test(key)) && Number.isFinite(Number(value));
        return numeric ? `<c><v>${xml(value)}</v></c>` : `<c t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }
    const headings = sheet.columns.map(([, label]) => cell(label, '')).join('');
    const rows = sheet.rows.map(row => `<row>${sheet.columns.map(([key]) => cell(row[key], key)).join('')}</row>`).join('');
    return `<worksheet xmlns="${worksheetNs}"><sheetData><row>${headings}</row>${rows}</sheetData></worksheet>`;
}

function excel(sheets) {
    const prefix = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
    const files = [
        ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/xl/workbook.xml" ContentType="${prefix}.sheet.main+xml"/>
            ${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="${prefix}.worksheet+xml"/>`).join('')}
            </Types>`],
        ['_rels/.rels', `<Relationships xmlns="${packageNs}">
            <Relationship Id="rId1" Type="${documentNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
        ['xl/workbook.xml', `<workbook xmlns="${worksheetNs}" xmlns:r="${documentNs}"><sheets>
            ${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
            </sheets></workbook>`],
        ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="${packageNs}">
            ${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${documentNs}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
            </Relationships>`],
        ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet)])
    ];
    return { extension: 'xlsx', mime: prefix + '.sheet', content: zip(files) };
}

function spreadsheet(sheets, format) {
    return format === 'excel' ? excel(sheets) : csv(sheets);
}

module.exports = { spreadsheet };
