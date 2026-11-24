'use strict';

const arabicFont = require.resolve('@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff');

let documentModule;
function loadPdfDocument() {
    documentModule ||= Promise.all([import('pdfkit'),import('pdfkit/standard-fonts/Helvetica'),import('pdfkit/standard-fonts/HelveticaBold')])
        .then(([pdf,regular,bold]) => {
            pdf.registerStdFonts(regular.default,bold.default);
            return pdf.default;
        }).catch(error => { documentModule = undefined; throw error; });
    return documentModule;
}

async function pdfReport(name, date, sheets, shopName) {
    const PDFDocument = await loadPdfDocument();
    return new Promise((resolve,reject) => {
        const pdf = new PDFDocument({size:'A4',layout:'landscape',margin:30,info:{Title:name,Author:shopName}});
        const chunks=[];
        pdf.on('data',chunk=>chunks.push(chunk));
        pdf.on('error',reject);
        pdf.on('end',()=>resolve({extension:'pdf',mime:'application/pdf',content:Buffer.concat(chunks)}));

        pdf.registerFont('Arabic',arabicFont);
        const selectFont=(value,bold=false)=>{
            const string=String(value ?? '—');
            return pdf.font(/[\u0600-\u06ff]/.test(string) ? 'Arabic' : bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#182631');
        };
        sheets.forEach((sheet,index)=>{
            if (index) pdf.addPage();
            const pageHeading=()=>{
                selectFont(shopName,true).fontSize(18).text(shopName,30,27,{align:'left'});
                selectFont(name,true).fontSize(11).text(name+' · '+date,30,53);
                selectFont(sheet.name).fontSize(10).text(sheet.name,30,70);
            };
            const width=(pdf.page.width-60)/sheet.columns.length;
            let y=94;
            pageHeading();
            function row(cells,heading=false,total=false) {
                const lineHeight=Math.max(24,...cells.map(value=>{
                    selectFont(value,heading||total).fontSize(9);
                    return pdf.heightOfString(String(value ?? '—'),{width:width-10})+9;
                }));
                const height=Math.min(lineHeight,100);
                pdf.rect(30,y,pdf.page.width-60,height).fill(heading?'#e1c181':total?'#dcece6':'#f3f5f6');
                cells.forEach((value,i)=>{
                    const label=String(value ?? '—');
                    selectFont(label,heading||total).fontSize(9);
                    pdf.text(label,35+i*width,y+5,{width:width-10,height:height-8,ellipsis:true});
                });
                y+=height+1;
            }
            const headings=sheet.columns.map(([,label])=>label);
            row(headings,true);
            for (const entry of [...sheet.rows,...(sheet.total ? [sheet.total] : [])]) {
                if (y+105>pdf.page.height-30) {
                    pdf.addPage();
                    pageHeading();
                    y=94;
                    row(headings,true);
                }
                row(sheet.columns.map(([key])=>entry[key]),false,entry===sheet.total);
            }
        });
        pdf.end();
    });
}

module.exports={pdfReport};
