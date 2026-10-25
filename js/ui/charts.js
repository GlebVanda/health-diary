// Простые SVG-графики без библиотек: столбцы, линии (с разрывами там, где нет данных), ступенчатые линии, маркеры.
(function (HD) {
  const esc = HD.util.esc;

  function niceRange(min, max) {
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    const step = Math.pow(10, Math.floor(Math.log10(span / 4)));
    const err = span / 4 / step;
    const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    const s = step * mult;
    return { min: Math.floor(min / s) * s, max: Math.ceil(max / s) * s, step: s };
  }

  /**
   * opts: {
   *   xMin, xMax — числовая ось X (например, номер дня от начала периода)
   *   bars: [{ x, y, color?, title? }], barWidth? (в единицах x, по умолчанию 0.7)
   *   lines: [{ points: [{x, y}], color, step?, dashed?, dots?, width? }]
   *   markers: [{ x, label }]
   *   xTicks: [{ x, label }], yFormat(v), yMin?, yMax?, height?
   * }
   */
  function chart(opts) {
    // Ширина в единицах SVG ≈ ширине карточки, чтобы подписи не мельчали на телефоне
    const vw = window.innerWidth || 640;
    const W = Math.round(Math.max(300, Math.min(opts.wide ? 1000 : 640, vw >= 900 ? (opts.wide ? vw - 160 : (Math.min(vw, 1168) - 88 - 60) / 2) : vw - 64)));
    const H = opts.height || 200;
    const pad = { l: 44, r: 10, t: 12, b: 26 };
    const xs = [];
    const ys = [];
    (opts.bars || []).forEach((b) => {
      xs.push(b.x);
      if (b.y != null) ys.push(b.y);
    });
    (opts.lines || []).forEach((l) =>
      l.points.forEach((p) => {
        xs.push(p.x);
        if (p.y != null) ys.push(p.y);
      }),
    );
    if (!ys.length) return `<div class="muted small center" style="padding:32px 0">Нет данных за период</div>`;
    const xMin = opts.xMin != null ? opts.xMin : Math.min(...xs);
    const xMax = opts.xMax != null ? opts.xMax : Math.max(...xs);
    let yMin = opts.yMin != null ? opts.yMin : Math.min(...ys);
    let yMax = opts.yMax != null ? opts.yMax : Math.max(...ys);
    if (opts.bars && opts.bars.length && opts.yMin == null) yMin = Math.min(0, yMin);
    const r = niceRange(yMin, yMax);
    const bw = opts.barWidth || 0.7;
    const xPad = opts.bars && opts.bars.length ? 0.5 : 0;
    const sx = (x) => pad.l + ((x - xMin + xPad) / Math.max(1e-9, xMax - xMin + 2 * xPad)) * (W - pad.l - pad.r);
    const sy = (y) => pad.t + (1 - (y - r.min) / (r.max - r.min)) * (H - pad.t - pad.b);
    const fmt = opts.yFormat || ((v) => HD.util.num(v));
    let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
    out += '<g class="grid">';
    for (let v = r.min; v <= r.max + 1e-9; v += r.step) {
      out += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${pad.l - 6}" y="${sy(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`;
    }
    out += '</g>';
    (opts.xTicks || []).forEach((t) => {
      out += `<text x="${sx(t.x)}" y="${H - 8}" text-anchor="middle">${esc(t.label)}</text>`;
    });
    const unitW = (W - pad.l - pad.r) / Math.max(1, xMax - xMin + 2 * xPad);
    (opts.bars || []).forEach((b) => {
      if (b.y == null) return;
      const x = sx(b.x) - (unitW * bw) / 2;
      const y0 = sy(Math.max(r.min, 0));
      const y1 = sy(b.y);
      out += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${Math.max(1, unitW * bw)}" height="${Math.abs(y0 - y1)}" rx="2" fill="${b.color || 'var(--chart-1)'}" opacity="${b.opacity || 0.85}"><title>${esc(b.title || fmt(b.y))}</title></rect>`;
    });
    (opts.lines || []).forEach((l) => {
      let d = '';
      let prev = null;
      const pts = l.points.slice().sort((a, b) => a.x - b.x);
      for (const p of pts) {
        if (p.y == null) {
          prev = null;
          continue;
        }
        if (prev == null) d += `M${sx(p.x)},${sy(p.y)}`;
        else if (l.step) d += `H${sx(p.x)}V${sy(p.y)}`;
        else d += `L${sx(p.x)},${sy(p.y)}`;
        prev = p;
      }
      if (l.step && prev && l.extendTo != null) d += `H${sx(l.extendTo)}`;
      out += `<path d="${d}" fill="none" stroke="${l.color || 'var(--chart-1)'}" stroke-width="${l.width || 2.2}" ${l.dashed ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
      if (l.dots) pts.filter((p) => p.y != null).forEach((p) => (out += `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="3" fill="${l.color || 'var(--chart-1)'}"><title>${esc(p.title || fmt(p.y))}</title></circle>`));
    });
    (opts.markers || []).forEach((m) => {
      out += `<line x1="${sx(m.x)}" x2="${sx(m.x)}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--warn)" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><circle cx="${sx(m.x)}" cy="${pad.t + 4}" r="4" fill="var(--warn)"><title>${esc(m.label)}</title></circle>`;
    });
    out += '</svg>';
    return out;
  }

  function legend(items) {
    return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}${i.dashed ? ';opacity:.6' : ''}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  }

  // Кольцо прогресса
  function ring(pct, size, label, sub) {
    size = size || 104;
    const sw = 10;
    const rad = (size - sw) / 2;
    const c = 2 * Math.PI * rad;
    const v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
    return `<div class="ring" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${rad}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>
        ${v > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${rad}" fill="none" stroke="var(--ring)" stroke-width="${sw}" stroke-linecap="butt"
          stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
      </svg>
      <div class="ring-label"><b class="num">${label != null ? esc(label) : pct == null ? '—' : Math.round(pct) + '%'}</b>${sub ? `<span class="tiny muted">${esc(sub)}</span>` : ''}</div>
    </div>`;
  }

  HD.charts = { chart, legend, ring };
})(window.HD);
