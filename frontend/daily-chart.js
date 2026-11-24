'use strict';

(() => {
    const series = [
        { field:'sale', title:'Sale', color:'#28b779', dash:[] },
        { field:'expense', title:'Expense', color:'#e45d6a', dash:[7,4] },
        { field:'profit', title:'Profit', color:'#5c9ff9', dash:[2,4] },
        { field:'qist_collected', title:'Qist Collected', color:'#f5a34d', dash:[10,4,2,4] }
    ];
    let active;
    const observer = new ResizeObserver(redraw);

    function redraw() {
        if (!active?.canvas.isConnected) { observer.disconnect(); active = undefined; return; }
        const { canvas, rows } = active;
        const { width, height } = canvas.getBoundingClientRect();
        if (!width || !height || !rows.length) return;

        const scale = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(scale,scale);
        const dark = document.documentElement.dataset.theme !== 'light';
        const bounds = { top:18, right:width - 16, bottom:height - 31, left:width < 400 ? 54 : 62 };
        const amounts = rows.flatMap(row => series.map(item => Number(row[item.field])));
        const minimum = Math.min(0,...amounts);
        const maximum = Math.max(0,...amounts);
        const rawStep = (maximum - minimum) / 4 || 1;
        const unit = 10 ** Math.floor(Math.log10(rawStep));
        const step = [1,2,2.5,5,10].find(value => value >= rawStep / unit) * unit;
        const low = Math.floor(minimum / step);
        const high = Math.max(low + 1, Math.ceil(maximum / step));
        const x = index => bounds.left + index * (bounds.right - bounds.left) / Math.max(1,rows.length - 1);
        const y = amount => bounds.bottom - (amount / step - low) * (bounds.bottom - bounds.top) / (high - low);
        const amountLabel = new Intl.NumberFormat(document.documentElement.lang, { notation:'compact',maximumFractionDigits:1 });
        const dateLabel = new Intl.DateTimeFormat(document.documentElement.lang,{day:'numeric',month:'short',timeZone:'UTC'});

        ctx.font = '11px system-ui';
        ctx.fillStyle = dark ? '#c7bcab' : '#435b68';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let tick = low; tick <= high; tick++) {
            const line = y(tick * step);
            ctx.strokeStyle = tick === 0 ? (dark ? '#807369' : '#97a8b1') : (dark ? '#3d3630' : '#dce7ec');
            ctx.beginPath();
            ctx.moveTo(bounds.left,line);
            ctx.lineTo(bounds.right,line);
            ctx.stroke();
            ctx.fillText(amountLabel.format(tick * step),bounds.left - 7,line);
        }

        const tickCount = Math.min(rows.length, Math.max(2,Math.floor(width / 90)));
        ctx.textBaseline = 'top';
        for (let i = 0; i < tickCount; i++) {
            const index = Math.round(i * (rows.length - 1) / Math.max(1,tickCount - 1));
            ctx.textAlign = i === 0 ? 'left' : i === tickCount - 1 ? 'right' : 'center';
            ctx.fillText(dateLabel.format(new Date(rows[index].day + 'T00:00:00Z')),x(index),bounds.bottom + 10);
        }

        ctx.lineWidth = 2.3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const item of series) {
            ctx.strokeStyle = item.color;
            ctx.setLineDash(item.dash);
            ctx.beginPath();
            rows.forEach((row,index) => {
                const position = [x(index),y(Number(row[item.field]))];
                if (index === 0) ctx.moveTo(...position);
                else ctx.lineTo(...position);
            });
            ctx.stroke();
            ctx.fillStyle = item.color;
            ctx.beginPath();
            ctx.arc(x(rows.length - 1),y(Number(rows.at(-1)[item.field])),2.8,0,Math.PI * 2);
            ctx.fill();
        }
    }

    new MutationObserver(redraw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});
    window.kbDailyChart = {
        series,
        draw(canvas,rows) {
            observer.disconnect();
            active = {canvas,rows};
            observer.observe(canvas);
            redraw();
        }
    };
})();
