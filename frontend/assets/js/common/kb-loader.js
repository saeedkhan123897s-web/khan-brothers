'use strict';

function showKBLoader() {
    const body = document.body;
    if (!body || body.querySelector('.kb-loader')) return;

    const loader = document.createElement('div');
    loader.className = 'kb-loader';
    loader.setAttribute('aria-busy', 'true');
    loader.innerHTML = `
        <div class="kb-loader-brand">
            <img alt="KB">
            <strong>KHAN BROTHERS</strong>
        </div>
        <canvas class="kb-loader-bike" width="620" height="284" aria-hidden="true"></canvas>
        <div class="kb-loader-progress">
            <p>SPEED • POWER • PERFORMANCE</p>
            <div role="progressbar" aria-label="Loading Khan Brothers" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
        </div>`;
    loader.querySelector('img').src = body.dataset.loaderLogo || '/assets/icons/image.png';
    body.prepend(loader);

    const canvas = loader.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const track = loader.querySelector('[role="progressbar"]');
    const bar = track.querySelector('span');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 100 : 475;
    const start = performance.now();

    function wheel(x, y, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.arc(0, 0, 58, 0, Math.PI * 2);
        ctx.moveTo(47, 0);
        ctx.arc(0, 0, 47, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        for (let index = 0; index < 8; index++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(8, 0);
            ctx.lineTo(43, 0);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    function bike(elapsed) {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#efc46c';
        ctx.lineWidth = 4;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = '#efb75080';
        ctx.shadowBlur = 8;
        const angle = reducedMotion ? 0 : elapsed / 62;
        wheel(183, 184, angle);
        wheel(470, 184, angle);
        const outline = new Path2D(`
            M 183 183 L 250 137 L 298 181 L 183 183
            M 250 137 L 280 101 L 381 103 L 420 130 L 470 184
            M 420 130 L 404 75 L 433 55 L 460 55
            M 406 81 L 444 81 Q 459 81 460 97 L 418 103
            M 253 135 Q 217 112 176 108 L 145 96 Q 148 89 162 91
            L 237 91 Q 251 89 265 88 L 284 99
            M 265 88 Q 290 59 342 70 Q 373 73 390 99 L 381 103
            M 293 128 L 365 130 L 378 168 L 338 197 L 274 193 L 259 163 Z
            M 290 142 L 351 147 M 284 159 L 359 164
            M 338 196 L 378 203 Q 397 198 405 184
            M 137 143 Q 182 107 222 139 M 432 147 Q 469 112 509 147
            M 143 207 L 312 209 Q 329 207 338 197
        `);
        ctx.stroke(outline);
        ctx.lineWidth = 2;
        for (let index = 0; index < 5; index++) {
            const offset = reducedMotion ? 0 : (elapsed / 9 + index * 9) % 30;
            const x = 20 + index * 12 - offset;
            const y = 99 + index * 22;
            ctx.globalAlpha = 1 - index * .13;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 32 + index * 6, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function frame(now) {
        const elapsed = now - start;
        const percent = Math.min(100, Math.floor(elapsed * 100 / duration));
        bar.style.width = percent + '%';
        track.setAttribute('aria-valuenow', percent);
        bike(elapsed);
        if (percent < 100) requestAnimationFrame(frame);
        else setTimeout(() => loader.remove(), reducedMotion ? 20 : 55);
    }
    requestAnimationFrame(frame);
}

window.showKBLoader = showKBLoader;
showKBLoader();
