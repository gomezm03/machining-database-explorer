import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { prefetch } from './filecache.js';
import { GROUPS, GroupPill, VARIANT, loadDataset, fmt, fmtBytes, family, immersionOf, dirOf, pitchOf } from './data.js';

const M = { l: 56, r: 24, t: 16, b: 60 }, PH = 420;  // plot margins and total height
const plotHeight = width => width < 500 ? 340 : PH;  // phones: shorter, so the selected cut stays close below
const coarse = () => matchMedia('(pointer: coarse)').matches;
const TEXT = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12px', fill: 'var(--muted)' };

function niceStep(max) {
  for (const s of [1, 2, 4, 5, 10, 20]) if (max / s <= 9) return s;
  return 50;
}

function Kv({ rows }) {
  return <dl class="kv">{rows.map(([k, v]) => <><dt>{k}</dt><dd>{v}</dd></>)}</dl>;
}

function Inputs({ d, index }) {
  const p = d.p, m = p.modes[0];
  const n = v => String(+v.toPrecision(4));
  const fam = family(d).filter(x => x !== d.n);
  const xy = m.fntx === m.fnty ? fmt(m.fntx) + ' Hz' : fmt(m.fntx) + ' / ' + fmt(m.fnty) + ' Hz';
  const kxy = m.ktx === m.kty ? n(m.ktx / 1e6) + ' N/µm' : n(m.ktx / 1e6) + ' / ' + n(m.kty / 1e6) + ' N/µm';
  return (
    <aside class="side" aria-label="Simulation inputs">
      <section class="card">
        <h2 class="t"><Icon name="dynamics" size={20} stroke={1.8} />Structural dynamics</h2>
        <Kv rows={[
          ['Tool fn (x, y)', xy], ['Tool stiffness', kxy], ['Damping ratio ζ', String(m.zetatx)],
          ['Modes per direction', String(p.modes.length)],
          ...p.modes.slice(1).map((mm, i) => ['Mode ' + (i + 2), fmt(mm.fntx) + ' Hz · ' + n(mm.ktx / 1e6) + ' N/µm · ζ ' + mm.zetatx]),
          ['Workpiece fn', fmt(m.fnwx) + ' Hz'],
          ['Workpiece stiffness', fmt(m.kwx / 1e6) + ' N/µm'],
        ]} />
      </section>
      <section class="card">
        <h2 class="t"><Icon name="force" size={20} stroke={1.8} />Force model</h2>
        <Kv rows={[
          ['ktc / knc', fmt(p.ktc / 1e6) + ' / ' + fmt(p.knc / 1e6) + ' N/mm²'],
          ['Edge kte / kne', fmt(p.kte / 1000) + ' / ' + fmt(p.kne / 1000) + ' N/mm'],
          ['Process damping Cn', p.cn ? fmt(p.cn) + ' N/m' : '0'],
        ]} />
        {p.ktc < 1e6 && <p class="note" style="margin:8px 0 0">ktc as listed in the xlsx (probable typo).</p>}
      </section>
      <section class="card">
        <h2 class="t"><Icon name="tool" size={20} stroke={1.8} />Tool</h2>
        <Kv rows={[
          ['Diameter', n(p.d * 1000) + ' mm'], ['Teeth', p.teeth + ', square end'],
          ['Helix', [...new Set(p.beta)].join(' / ') + '°'],
          ['Tooth angles', p.angles.join(' / ') + '°'],
          ['Pitch', pitchOf(d)],
          ['Runout', p.ro.some(r => r) ? p.ro.map(r => n(r * 1e6)).join(' / ') + ' µm' : '0'],
        ]} />
      </section>
      <section class="card">
        <h2 class="t"><Icon name="cut" size={20} stroke={1.8} />Cut</h2>
        <Kv rows={[
          ['Direction', dirOf(d) === 'up' ? 'Up (conventional)' : 'Down (climb)'],
          ['Radial depth', n(p.a * 1000) + ' mm (' + immersionOf(d) + '%)'],
          ['Feed per tooth', n(p.ft * 1000) + ' mm'],
          ['Speeds', fmt(p.omMin) + '–' + fmt(p.omMax) + ' rpm'],
          ['Speed step', fmt(p.omStep) + ' rpm'],
          ['Depths', 'from ' + n(p.bMin * 1000) + ', step ' + n(p.bStep * 1000) + ' mm'],
          ...(p.noise ? [['Noise', p.noise + '% of max |signal|']] : []),
        ]} />
        {p.aFixed && <p class="note" style="margin:8px 0 0">The xlsx lists a = 3000; read here as 3 mm.</p>}
      </section>
      {fam.length > 0 && (
        <section class="card">
          <h2 class="t">Same inputs in other groups</h2>
          <div class="gchips">
            {fam.map(x => {
              const o = index.datasets.find(e => e.n === x);
              return <a href={'#/ds/' + x}><span class="dot" style={{ background: GROUPS[o.group].dot }} />{x} · {o.group === 'unique' ? 'clean' : GROUPS[o.group].label.toLowerCase()}</a>;
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

// Arrow keys walk the grid: up/down change depth at this speed, left/right move to the nearest depth at the next speed.
function neighbour(grid, cur, key) {
  const [, om, b] = cur;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const same = grid.filter(c => c[1] === om).sort((p, q) => p[2] - q[2]);
    const i = same.indexOf(cur) + (key === 'ArrowUp' ? 1 : -1);
    return same[i];
  }
  const speeds = [...new Set(grid.map(c => c[1]))].sort((p, q) => p - q);
  const s = speeds[speeds.indexOf(om) + (key === 'ArrowRight' ? 1 : -1)];
  if (s == null) return undefined;
  return grid.filter(c => c[1] === s).reduce((best, c) => Math.abs(c[2] - b) < Math.abs(best[2] - b) ? c : best);
}

// Tick values from lo to hi at a 1/2/2.5/5 × 10^n step giving about `n` ticks.
function ticks(lo, hi, n) {
  const raw = (hi - lo) / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || 10 * p;
  const out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toPrecision(10));
  return out;
}
const tickLabel = v => Math.abs(v) >= 1000 ? fmt(Math.round(v)) : String(+v.toFixed(3));

function GridPlot({ d, info, sel, onPick }) {
  const wrap = useRef(), svg = useRef();
  const [width, setWidth] = useState(836);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(null);     // null = whole grid; else { x0, x1, y0, y1 } in rpm and mm
  const [drag, setDrag] = useState(null);     // box being drawn, in plot pixels
  const focusK = useRef(null);
  const pinch = useRef(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    // Floor the measured width: an SVG a fraction of a pixel wider than its box would overflow it.
    const ro = new ResizeObserver(() => setWidth(Math.max(280, Math.floor(el.getBoundingClientRect().width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setView(null); setHover(null); }, [info]);
  useEffect(() => {
    if (focusK.current != null) { wrap.current.querySelector('[data-k="' + focusK.current + '"]')?.focus(); focusK.current = null; }
  });

  const ph = plotHeight(width);
  const W = width - M.l - M.r, H = ph - M.t - M.b;
  // Full extent of the grid: every speed, and from 0 to a little above the deepest cut.
  const base = useMemo(() => {
    const om = info.grid.map(c => c[1]);
    const bo = info.boundary;
    // Half a speed step of room at each end, so the first and last columns of points are not cut in half.
    const pad = (d.p.omStep || 500) / 2;
    const x0 = Math.min(bo.om[0], ...om) - pad, x1 = Math.max(bo.om[bo.om.length - 1], ...om) + pad;
    const bmax = Math.max(...info.grid.map(c => c[2]));
    const lmax = Math.max(...bo.b.filter((v, i) => bo.om[i] >= x0 && bo.om[i] <= x1));
    const want = Math.max(bmax * 1.08, Math.min(lmax, bmax * 1.6));
    const ystep = niceStep(want);
    return { x0, x1, y0: 0, y1: Math.ceil(want / ystep) * ystep };
  }, [info]);
  // Zoom no tighter than about four speed steps by four depth steps (neighbours stay in view), never outside the grid.
  const minX = 4 * (d.p.omStep || 500), minY = 4 * (d.p.bStep || 0.001) * 1000;
  const clampView = v => {
    if (!v) return null;
    let { x0, x1, y0, y1 } = v;
    if (x1 - x0 < minX) { const c = (x0 + x1) / 2; x0 = c - minX / 2; x1 = c + minX / 2; }
    if (y1 - y0 < minY) { const c = (y0 + y1) / 2; y0 = c - minY / 2; y1 = c + minY / 2; }
    const bw = base.x1 - base.x0, bh = base.y1 - base.y0;
    if (x1 - x0 >= bw && y1 - y0 >= bh) return null;
    if (x1 - x0 > bw) { x0 = base.x0; x1 = base.x1; }
    if (y1 - y0 > bh) { y0 = base.y0; y1 = base.y1; }
    if (x0 < base.x0) { x1 += base.x0 - x0; x0 = base.x0; }
    if (x1 > base.x1) { x0 -= x1 - base.x1; x1 = base.x1; }
    if (y0 < base.y0) { y1 += base.y0 - y0; y0 = base.y0; }
    if (y1 > base.y1) { y0 -= y1 - base.y1; y1 = base.y1; }
    return { x0, x1, y0, y1 };
  };
  const cur = view || base;

  const g = useMemo(() => {
    const { x0, x1, y0, y1 } = cur;
    const X = v => (v - x0) / (x1 - x0) * W;
    const Y = v => H - (v - y0) / (y1 - y0) * H;
    const bo = info.boundary;
    const path = 'M' + bo.om.map((o, i) => X(o).toFixed(1) + ',' + Math.max(-50, Math.min(H + 50, Y(bo.b[i]))).toFixed(1)).join(' L');
    // Only points inside the view are drawn; their size follows how many speeds and depths are visible.
    const padX = (x1 - x0) * 0.01, padY = (y1 - y0) * 0.01;
    const vis = info.grid.filter(c => c[1] >= x0 - padX && c[1] <= x1 + padX && c[2] >= y0 - padY && c[2] <= y1 + padY);
    const speeds = new Set(vis.map(c => c[1])).size || 1;
    const depths = new Set(vis.map(c => c[2])).size || 1;
    const r = Math.max(2.6, Math.min(view ? 9 : 6.5, Math.min(W / speeds, H / depths) * 0.36));
    return { X, Y, path, r, vis, yt: ticks(y0, y1, 8), xt: ticks(x0, x1, Math.max(3, Math.floor(W / 110))) };
  }, [info, W, H, cur.x0, cur.x1, cur.y0, cur.y1]);

  const toData = (px, py) => ({ x: cur.x0 + px / W * (cur.x1 - cur.x0), y: cur.y0 + (H - py) / H * (cur.y1 - cur.y0) });
  const local = e => { const r = svg.current.getBoundingClientRect(); return { px: e.clientX - r.left - M.l, py: e.clientY - r.top - M.t }; };
  const zoomBy = (f, center) => {
    const c = center || (() => { const s = info.grid.find(p => p[0] === sel); return s && s[1] >= cur.x0 && s[1] <= cur.x1 && s[2] >= cur.y0 && s[2] <= cur.y1 ? { x: s[1], y: s[2] } : { x: (cur.x0 + cur.x1) / 2, y: (cur.y0 + cur.y1) / 2 }; })();
    const hw = (cur.x1 - cur.x0) / 2 / f, hh = (cur.y1 - cur.y0) / 2 / f;
    setView(clampView({ x0: c.x - hw, x1: c.x + hw, y0: c.y - hh, y1: c.y + hh }));
  };

  // Mouse and pen: drag a box to zoom (a flat box zooms speed only, a tall one depth only). Touch: pinch.
  // A drag may start on a point (dense grids are mostly points); only a real drag zooms, a plain click selects.
  const dragRef = useRef(null), justDragged = useRef(false);
  const finishDrag = dr => {
    const dx = Math.abs(dr.x1 - dr.x0), dy = Math.abs(dr.y1 - dr.y0);
    if (dx < 8 && dy < 8) return;
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 0);
    const a = toData(Math.min(dr.x0, dr.x1), Math.max(dr.y0, dr.y1)), b = toData(Math.max(dr.x0, dr.x1), Math.min(dr.y0, dr.y1));
    setView(clampView({
      x0: dx >= 8 ? a.x : cur.x0, x1: dx >= 8 ? b.x : cur.x1,
      y0: dy >= 8 ? a.y : cur.y0, y1: dy >= 8 ? b.y : cur.y1,
    }));
  };
  const onDown = e => {
    if (e.target.closest('.zoombar') || e.pointerType === 'touch') return;
    if (e.button !== 0) return;
    const p = local(e);
    if (p.px < 0 || p.px > W || p.py < 0 || p.py > H) return;
    e.preventDefault();  // no text selection or native drag while drawing the box
    // Track the drag on the window (not with pointer capture), so a click on a point still reaches the point.
    dragRef.current = { x0: p.px, y0: p.py, x1: p.px, y1: p.py };
    const move = ev => {
      const q = local(ev);
      dragRef.current = { ...dragRef.current, x1: Math.max(0, Math.min(W, q.px)), y1: Math.max(0, Math.min(H, q.py)) };
      const dr = dragRef.current;
      if (Math.abs(dr.x1 - dr.x0) >= 4 || Math.abs(dr.y1 - dr.y0) >= 4) { setDrag(dr); setHover(null); }
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      const dr = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (dr) finishDrag(dr);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };
  // Pinch uses touch events, not pointer events: with two fingers down we call preventDefault so the browser
  // does not turn the gesture into a page scroll (which would cancel pointer events). One finger still scrolls.
  const live = useRef();
  live.current = { cur, toData, clampView, W, H };
  useEffect(() => {
    const el = svg.current;
    const pts = t => { const r = el.getBoundingClientRect(); return [...t].slice(0, 2).map(p => ({ px: p.clientX - r.left - M.l, py: p.clientY - r.top - M.t })); };
    const start = e => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = pts(e.touches), L = live.current;
      pinch.current = { dist: Math.hypot(a.px - b.px, a.py - b.py) || 1, mid: L.toData((a.px + b.px) / 2, (a.py + b.py) / 2), view: L.cur };
    };
    const move = e => {
      const pc = pinch.current;
      if (!pc || e.touches.length !== 2) return;
      e.preventDefault();
      const [a, b] = pts(e.touches), L = live.current;
      const f = Math.hypot(a.px - b.px, a.py - b.py) / pc.dist;
      const v = pc.view, mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
      const sx = (v.x1 - v.x0) / f, sy = (v.y1 - v.y0) / f;
      // Keep the data point that started under the fingers' midpoint under it as they move.
      const x0 = pc.mid.x - mx / L.W * sx, y0 = pc.mid.y - (L.H - my) / L.H * sy;
      setView(L.clampView({ x0, x1: x0 + sx, y0, y1: y0 + sy }));
    };
    const end = e => { if (e.touches.length < 2) pinch.current = null; };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end);
    };
  }, []);

  const key = (e, c) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c[0]); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(2, { x: c[1], y: c[2] }); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(0.5, { x: c[1], y: c[2] }); return; }
    if (e.key === '0') { e.preventDefault(); setView(null); return; }
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const nb = neighbour(info.grid, c, e.key);
    if (!nb) return;
    // Walking off the edge of a zoomed view pans it to keep the new cut in sight.
    if (view && (nb[1] < cur.x0 || nb[1] > cur.x1 || nb[2] < cur.y0 || nb[2] > cur.y1)) {
      const hw = (cur.x1 - cur.x0) / 2, hh = (cur.y1 - cur.y0) / 2;
      setView(clampView({ x0: nb[1] - hw, x1: nb[1] + hw, y0: nb[2] - hh, y1: nb[2] + hh }));
    }
    focusK.current = nb[0]; onPick(nb[0]); setHover(nb);
  };
  const inView = c => c && c[1] >= cur.x0 && c[1] <= cur.x1 && c[2] >= cur.y0 && c[2] <= cur.y1;
  const tip = hover && inView(hover) && !drag && { left: M.l + g.X(hover[1]), top: M.t + g.Y(hover[2]) - g.r };
  const selCut = info.grid.find(c => c[0] === sel);
  // The selected cut stays focusable even when zoomed out of view, so keyboard users never lose their place.
  const drawn = selCut && !g.vis.includes(selCut) ? [...g.vis, selCut] : g.vis;

  return (
    <div class="gridwrap" ref={wrap}>
      <div class="zoombar" role="group" aria-label="Zoom" style={{ right: M.r + 6 + 'px', top: M.t + 6 + 'px' }}>
        <button type="button" onClick={() => zoomBy(2)} aria-label="Zoom in" title="Zoom in (+)">+</button>
        <button type="button" onClick={() => zoomBy(0.5)} disabled={!view} aria-label="Zoom out" title="Zoom out (−)">−</button>
        {view && <button type="button" class="reset" onClick={() => setView(null)} title="Show the whole grid (0)">Reset zoom</button>}
      </div>
      <svg ref={svg} class={'gridplot' + (drag ? ' dragging' : '')} width={width} height={ph} viewBox={'0 0 ' + width + ' ' + ph} role="group"
        aria-label={'Grid of cuts of dataset ' + d.n + ', ' + fmt(Math.round(cur.x0)) + ' to ' + fmt(Math.round(cur.x1)) + ' rpm' + (view ? ' (zoomed)' : '') + '. Use arrow keys to move between cuts, plus and minus to zoom.'}
        onMouseLeave={() => setHover(null)} onPointerDown={onDown}
        onDblClick={e => { if (!e.target.closest('.zoombar')) setView(null); }}>
        <defs><clipPath id="gclip"><rect x="0" y="0" width={W} height={H} /></clipPath></defs>
        <g transform={'translate(' + M.l + ' ' + M.t + ')'}>
          <rect x="0" y="0" width={W} height={H} style={{ fill: 'var(--plot)' }} />
          <g stroke-width="1" style={{ stroke: 'var(--grid)' }}>{g.yt.filter(v => v > cur.y0).map(v => <path d={'M0 ' + g.Y(v) + 'H' + W} />)}</g>
          <path d={'M0 0V' + H + 'H' + W} fill="none" stroke-width="1" style={{ stroke: 'var(--subtle)' }} />
          {/* Reference only: the stability labels come from the grid rule, not from this line. */}
          <path d={g.path} fill="none" stroke-width="1.6" stroke-linejoin="round" clip-path="url(#gclip)" style={{ stroke: 'var(--subtle)' }} />
          <g text-anchor="end" style={TEXT}>{g.yt.map(v => <text x="-8" y={g.Y(v) + 4}>{tickLabel(v)}</text>)}</g>
          <g text-anchor="middle" style={TEXT}>
            {g.xt.map(v => <text x={g.X(v)} y={H + 20}>{tickLabel(v)}</text>)}
            <text x={W / 2} y={H + 42} style={{ fill: 'var(--ink)' }}>Spindle speed (rpm)</text>
          </g>
          {drag && <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)}
            stroke-width="1" style={{ fill: 'color-mix(in srgb, var(--accent) 12%, transparent)', stroke: 'var(--accent)' }} />}
          <g clip-path="url(#gclip)">
          {drawn.map(c => {
            const [k, om, b, s] = c;
            const on = k === sel;
            const cx = g.X(om), cy = g.Y(b);
            return (
              <g class="pt" key={k} data-k={k} role="button" tabindex={on ? 0 : -1} aria-pressed={on ? 'true' : 'false'}
                aria-label={'File ' + k + ', ' + fmt(om) + ' rpm, ' + b + ' mm, ' + (s ? 'stable' : 'unstable')}
                onClick={() => { if (!justDragged.current) onPick(k); }} onKeyDown={e => key(e, c)} onMouseEnter={() => setHover(c)} onFocus={() => setHover(c)}>
                <circle cx={cx} cy={cy} r={g.r + 5} fill="transparent" />
                {on && <circle cx={cx} cy={cy} r={g.r + 4} fill="none" stroke-width="2.5" style={{ stroke: 'var(--ink)' }} />}
                <circle cx={cx} cy={cy} r={on ? g.r + 1.5 : g.r} stroke-width={s ? 1.2 : g.r < 4 ? 1.1 : 1.8}
                  style={s ? { fill: 'var(--accent)', stroke: 'var(--surface)' } : { fill: 'var(--surface)', stroke: 'var(--chatter)', strokeOpacity: g.r < 4 && !on ? 0.7 : 1 }} />
              </g>
            );
          })}
          </g>
        </g>
        <text transform={'translate(16 ' + (M.t + H / 2) + ') rotate(-90)'} text-anchor="middle" style={{ ...TEXT, fill: 'var(--ink)' }}>Axial depth b (mm)</text>
      </svg>
      {tip && (
        <div class="hover-tip" style={{ left: tip.left + 'px', top: tip.top + 'px' }}>
          <b>File {hover[0]}</b> · {fmt(hover[1])} rpm · {hover[2]} mm<br />
          {hover[3] ? 'stable' : 'unstable'}
        </div>
      )}
    </div>
  );
}

export function DatasetView({ index, d, k }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setInfo(null); setError(null); loadDataset(d.n).then(setInfo, e => setError(e.message)); }, [d.n]);

  const m = d.p.modes[0];
  const blurb = String(+(d.p.d * 1000).toPrecision(4)) + ' mm ' + d.p.teeth + '-tooth end mill, ' + immersionOf(d) + '% radial immersion, ' +
    dirOf(d) + ' milling, ' + fmt(m.fntx) + ' Hz tool mode, ' + String(+(m.ktx / 1e6).toPrecision(4)) + ' N/µm stiffness' +
    (d.p.cn ? ', process damping' : '') + (pitchOf(d) === 'variable' ? ', variable pitch' : '') + (d.p.noise ? ', ' + d.p.noise + '% noise' : '') + '.';

  const sel = info ? (info.grid.find(c => c[0] === k) || info.grid[0]) : null;
  // Fetch the selected cut's file in the background once the selection settles, so opening it is instant.
  useEffect(() => {
    if (!sel) return;
    const id = setTimeout(() => prefetch(d.n, ['time' + d.n + '_' + sel[0] + '.mat']), 700);
    return () => clearTimeout(id);
  }, [d.n, sel && sel[0]]);
  const pick = kk => { history.replaceState(null, '', '#/ds/' + d.n + '?k=' + kk); dispatchEvent(new HashChangeEvent('hashchange')); };
  const nBelow = info ? info.grid.filter(c => c[3]).length : 0;
  const tag = d.n === 1 ? 'Unique · baseline' : d.base ? GROUPS[d.group].label + ' · copy of ' + d.base : null;

  return (
    <div class="page tight">
      <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Datasets</a> <span aria-hidden="true">/</span> Dataset {d.n}</nav>
      <div class="ds-head">
        <div style="flex:1 1 420px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <h1>Dataset {d.n}</h1>
            <GroupPill group={d.group}>{tag}</GroupPill>
          </div>
          <p class="lead">{blurb}</p>
        </div>
        <SelectedFile d={d} info={info} c={sel} />
      </div>

      <div class="row ds-row">
        <Inputs d={d} index={index} />
        <main class="main">
          <section class="card gcard">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 24px;margin-bottom:8px">
              <h2 class="h2" style="font-size:16px">Grid of cuts <span class="num" style="font-weight:400;color:var(--muted)">· {fmt(d.files)} points</span></h2>
              <div class="legend" style="margin-left:auto">
                <span><span class="dot" style="width:11px;height:11px;background:var(--accent)" />stable ({nBelow})</span>
                <span><span class="dot" style="width:11px;height:11px;border:2px solid var(--chatter);background:var(--surface);box-sizing:border-box" />unstable ({info ? info.grid.length - nBelow : 0})</span>
                <span><span style="width:18px;height:0;border-top:1.6px solid var(--subtle)" />analytical boundary (reference)</span>
              </div>
            </div>
            {error ? <div class="err">{error}</div> : info ? <GridPlot d={d} info={info} sel={sel[0]} onPick={pick} /> : <div class="skel" style={{ height: plotHeight(innerWidth - 72) + 'px' }} />}
            <p class="note" style="margin:8px 0 0">The files carry no stability label. Following the dataset documentation, the grid at each spindle speed runs to about two unstable cuts, so the two deepest cuts at each speed are marked unstable. The line is the analytical boundary from stability_boundary{d.n}.mat, shown for reference only.</p>
            <p class="note" style="margin:4px 0 0">{coarse()
              ? 'Tap a cut to select it. Pinch or use + and − to zoom; Reset zoom shows the whole grid.'
              : 'Drag a box to zoom (drag flat to zoom speed only, tall to zoom depth only), or use + and −. Double-click or Reset zoom to see the whole grid. Click a cut to select it; arrow keys move between cuts.'}</p>
          </section>
          {sel && <CutFiles d={d} k={sel[0]} index={index} />}
        </main>
      </div>
    </div>
  );
}

// Top of the page, just above the grid: what is selected and the way into the file viewer.
function SelectedFile({ d, info, c }) {
  if (!c) return <div class="card selfile" aria-hidden="true"><span class="skel" style="height:44px;flex:1" /></div>;
  const [k, om, b, s] = c;
  const size = info.size[info.grid.indexOf(c)];
  return (
    <section class="card selfile" aria-live="polite" aria-label="Selected file">
      <div style="min-width:0">
        <div class="num sf-n"><b>File {k}</b> · {fmt(om)} rpm · {b} mm</div>
        <div class="note"><strong class={s ? 'stable-t' : 'chatter-t'}>{s ? 'Stable' : 'Unstable'}</strong> · time{d.n}_{k}.mat{size ? ' · ' + fmtBytes(size) : ''}</div>
      </div>
      <a class="btn" href={'#/file/' + d.n + '/' + k}>Open file →</a>
    </section>
  );
}

function CutFiles({ d, k, index }) {
  const fam = family(d);
  const files = fam.map(n => {
    const o = index.datasets.find(e => e.n === n);
    return { n, name: 'time' + n + '_' + k + '.mat', ...VARIANT[o.group], href: '#/file/' + n + '/' + k };
  });
  const snd = fam.find(n => n >= 126);
  if (snd) files.push({ n: snd, name: 'ForceR' + snd + '_' + k + '.wav', desc: 'sound of the resultant force', color: GROUPS.sound.dot, href: '#/file/' + snd + '/' + k });
  files.push({ n: d.n, name: 'stability_boundary' + d.n + '.mat', desc: 'omega_vector, blim_vector', color: 'var(--fit)' });
  return (
    <section class="card" style="padding:16px 20px">
      <div class="cap" style="letter-spacing:0.8px;margin-bottom:8px">File {k} in every version</div>
      <div class="files2">
        {files.map(f => {
          const inner = <><span class="bar" style={{ background: f.color }} /><div style="min-width:0"><div class="fname">{f.name}</div><div class="note">{f.desc}</div></div></>;
          return f.href ? <a class="fitem" href={f.href}>{inner}</a> : <div class="fitem">{inner}</div>;
        })}
      </div>
    </section>
  );
}
