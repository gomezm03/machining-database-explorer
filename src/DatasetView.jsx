import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { GROUPS, GroupPill, VARIANT, loadDataset, fmt, fmtBytes, family, immersionOf, dirOf, pitchOf } from './data.js';

const M = { l: 56, r: 24, t: 16, b: 60 }, PH = 420;  // plot margins and total height
const TEXT = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '12px', fill: 'var(--muted)' };

function niceStep(max) {
  for (const s of [1, 2, 4, 5, 10, 20]) if (max / s <= 9) return s;
  return 50;
}
function niceSpeedStep(span, width) {
  const n = Math.max(3, Math.floor(width / 110));
  for (const s of [500, 1000, 2000, 2500, 5000, 10000]) if (span / s <= n) return s;
  return 20000;
}

export function blimAt(boundary, om) {
  const x = boundary.om, y = boundary.b;
  if (om <= x[0]) return y[0];
  if (om >= x[x.length - 1]) return y[y.length - 1];
  let i = 1;
  while (x[i] < om) i++;
  return y[i - 1] + (y[i] - y[i - 1]) * (om - x[i - 1]) / (x[i] - x[i - 1]);
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

function GridPlot({ d, info, sel, onPick }) {
  const wrap = useRef();
  const [width, setWidth] = useState(836);
  const [hover, setHover] = useState(null);
  const focusK = useRef(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    const ro = new ResizeObserver(() => setWidth(Math.max(560, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (focusK.current != null) { wrap.current.querySelector('[data-k="' + focusK.current + '"]')?.focus(); focusK.current = null; }
  });

  const W = width - M.l - M.r, H = PH - M.t - M.b;
  const g = useMemo(() => {
    const om = info.grid.map(c => c[1]);
    const bo = info.boundary;
    const x0 = Math.min(bo.om[0], ...om), x1 = Math.max(bo.om[bo.om.length - 1], ...om);
    const bmax = Math.max(...info.grid.map(c => c[2]));
    const lmax = Math.max(...bo.b.filter((v, i) => bo.om[i] >= x0 && bo.om[i] <= x1));
    const want = Math.max(bmax * 1.08, Math.min(lmax, bmax * 1.6));
    const ystep = niceStep(want);
    const top = Math.ceil(want / ystep) * ystep;
    const X = v => (v - x0) / (x1 - x0) * W;
    const Y = v => H - Math.min(v, top) / top * H;
    const path = 'M' + bo.om.map((o, i) => X(o).toFixed(1) + ',' + Y(bo.b[i]).toFixed(1)).join(' L');
    const speeds = new Set(om).size;
    const depths = new Set(info.grid.map(c => c[2])).size;
    const r = Math.max(2.6, Math.min(6.5, Math.min(W / speeds, H / Math.max(depths, 1)) * 0.36));
    const yt = [];
    for (let v = 0; v <= top + 1e-9; v += ystep) yt.push(v);
    const xs = niceSpeedStep(x1 - x0, W), xt = [];
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1 + 1e-9; v += xs) xt.push(v);
    return { X, Y, path, r, yt, xt, x0, x1 };
  }, [info, W, H]);

  const key = (e, c) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c[0]); return; }
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const nb = neighbour(info.grid, c, e.key);
    if (nb) { focusK.current = nb[0]; onPick(nb[0]); setHover(nb); }
  };
  const tip = hover && { left: M.l + g.X(hover[1]), top: M.t + g.Y(hover[2]) - g.r };

  return (
    <div class="gridwrap" ref={wrap}>
      <svg class="gridplot" width={width} height={PH} viewBox={'0 0 ' + width + ' ' + PH} role="group" aria-label={'Grid of cuts of dataset ' + d.n + ' over the stability boundary, ' + fmt(g.x0) + ' to ' + fmt(g.x1) + ' rpm. Use arrow keys to move between cuts.'}
        onMouseLeave={() => setHover(null)}>
        <defs><clipPath id="gclip"><rect x="0" y="0" width={W} height={H} /></clipPath></defs>
        <g transform={'translate(' + M.l + ' ' + M.t + ')'}>
          <rect x="0" y="0" width={W} height={H} style={{ fill: 'var(--stable-fill)' }} />
          <path d={g.path + ' L' + W + ',0 L0,0 Z'} clip-path="url(#gclip)" style={{ fill: 'var(--chatter-fill)' }} />
          <g stroke-width="1" style={{ stroke: 'var(--grid)' }}>{g.yt.slice(1).map(v => <path d={'M0 ' + g.Y(v) + 'H' + W} />)}</g>
          <path d={'M0 0V' + H + 'H' + W} fill="none" stroke-width="1" style={{ stroke: 'var(--subtle)' }} />
          <path d={g.path} fill="none" stroke-width="2.2" stroke-linejoin="round" clip-path="url(#gclip)" style={{ stroke: 'var(--fit)' }} />
          <g text-anchor="end" style={TEXT}>{g.yt.map(v => <text x="-8" y={g.Y(v) + 4}>{v}</text>)}</g>
          <g text-anchor="middle" style={TEXT}>
            {g.xt.map(v => <text x={g.X(v)} y={H + 20}>{fmt(v)}</text>)}
            <text x={W / 2} y={H + 42} style={{ fill: 'var(--ink)' }}>Spindle speed (rpm)</text>
          </g>
          <text x={W - 12} y="20" text-anchor="end" style={{ ...TEXT, fontSize: '13px', fontWeight: 700, fill: 'var(--chatter-text)' }}>Chatter predicted</text>
          {info.grid.map(c => {
            const [k, om, b, s] = c;
            const on = k === sel;
            const cx = g.X(om), cy = g.Y(b);
            return (
              <g class="pt" key={k} data-k={k} role="button" tabindex={on ? 0 : -1} aria-pressed={on ? 'true' : 'false'}
                aria-label={'Cut ' + k + ', ' + fmt(om) + ' rpm, ' + b + ' mm, ' + (s ? 'below' : 'above') + ' boundary'}
                onClick={() => onPick(k)} onKeyDown={e => key(e, c)} onMouseEnter={() => setHover(c)} onFocus={() => setHover(c)}>
                <circle cx={cx} cy={cy} r={g.r + 5} fill="transparent" />
                {on && <circle cx={cx} cy={cy} r={g.r + 4} fill="none" stroke-width="2.5" style={{ stroke: 'var(--ink)' }} />}
                <circle cx={cx} cy={cy} r={on ? g.r + 1.5 : g.r} stroke-width={s ? 1.2 : g.r < 4 ? 1.1 : 1.8}
                  style={s ? { fill: 'var(--accent)', stroke: 'var(--surface)' } : { fill: 'var(--surface)', stroke: 'var(--chatter)', strokeOpacity: g.r < 4 && !on ? 0.7 : 1 }} />
              </g>
            );
          })}
        </g>
        <text transform={'translate(16 ' + (M.t + H / 2) + ') rotate(-90)'} text-anchor="middle" style={{ ...TEXT, fill: 'var(--ink)' }}>Axial depth b (mm)</text>
      </svg>
      {tip && (
        <div class="hover-tip" style={{ left: tip.left + 'px', top: tip.top + 'px' }}>
          <b>K{hover[0]}</b> · {fmt(hover[1])} rpm · {hover[2]} mm<br />
          boundary {blimAt(info.boundary, hover[1]).toFixed(2)} mm · {hover[3] ? 'below' : 'above'}
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

  const sel = info ? (info.grid.find(c => c[0] === k) || info.grid.find(c => !c[3]) || info.grid[0]) : null;
  const pick = kk => { history.replaceState(null, '', '#/ds/' + d.n + '?k=' + kk); dispatchEvent(new HashChangeEvent('hashchange')); };
  const nBelow = info ? info.grid.filter(c => c[3]).length : 0;
  const revs = d.group === 'sound' ? 500 : 60;
  const bytes = info ? info.size.reduce((a, b) => a + b, 0) : 0;
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
        <div class="kpis">
          <div class="kpi"><b>{fmt(d.files)}</b><span>cuts (time files)</span></div>
          <div class="kpi"><b>{d.speeds}</b><span>spindle speeds</span></div>
          <div class="kpi"><b>{revs}</b><span>revolutions per cut</span></div>
          <div class="kpi"><b>{info ? fmtBytes(bytes) : '…'}</b><span>.mat files to download</span></div>
        </div>
      </div>

      <div class="row">
        <Inputs d={d} index={index} />
        <main class="main">
          <section class="card" style="padding:18px 20px">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 24px;margin-bottom:8px">
              <h2 class="h2" style="font-size:16px">Grid of cuts vs. stability boundary</h2>
              <div class="legend" style="margin-left:auto">
                <span><span class="dot" style="width:11px;height:11px;background:var(--accent)" />below boundary ({nBelow})</span>
                <span><span class="dot" style="width:11px;height:11px;border:2px solid var(--chatter);background:var(--surface);box-sizing:border-box" />above boundary ({info ? info.grid.length - nBelow : 0})</span>
                <span><span style="width:18px;height:0;border-top:2px solid var(--fit)" />stability_boundary{d.n}.mat</span>
              </div>
            </div>
            {error ? <div class="err">{error}</div> : info ? <GridPlot d={d} info={info} sel={sel[0]} onPick={pick} /> : <div class="skel" style={{ height: PH + 'px' }} />}
            <p class="note" style="margin:8px 0 0">Colors compare each cut with the analytical boundary. The files themselves are unlabelled, and the time-domain result can differ, especially with process damping or variable pitch. Click a cut, or use the arrow keys.</p>
          </section>
          {sel && <SelectedCut d={d} info={info} c={sel} index={index} />}
        </main>
      </div>
    </div>
  );
}

function SelectedCut({ d, info, c, index }) {
  const [k, om, b, s] = c;
  const fam = family(d);
  const files = fam.map(n => {
    const o = index.datasets.find(e => e.n === n);
    return { n, name: 'time' + n + '_' + k + '.mat', ...VARIANT[o.group], href: '#/file/' + n + '/' + k };
  });
  const snd = fam.find(n => n >= 126);
  if (snd) files.push({ n: snd, name: 'ForceR' + snd + '_' + k + '.wav', desc: 'sound of the resultant force', color: GROUPS.sound.dot, href: '#/file/' + snd + '/' + k });
  files.push({ n: d.n, name: 'stability_boundary' + d.n + '.mat', desc: 'omega_vector, blim_vector', color: 'var(--fit)' });
  const size = info.size[info.grid.indexOf(c)];
  return (
    <section class="card" aria-live="polite" style="padding:18px 20px;display:flex;flex-wrap:wrap;gap:20px 32px">
      <div style="flex:1 1 260px">
        <div class="cap" style="color:var(--link);letter-spacing:0.8px">Selected cut · K = {k}</div>
        <div class="num" style="font-size:26px;font-weight:700;color:var(--ink);margin:6px 0 4px">{fmt(om)} rpm · {b} mm</div>
        <div style="font-size:14px;color:var(--muted);line-height:1.45">Boundary at this speed: {blimAt(info.boundary, om).toFixed(2)} mm<br />
          <strong class={s ? 'stable-t' : 'chatter-t'}>{s ? 'Below boundary (stable predicted)' : 'Above boundary (chatter predicted)'}</strong></div>
        <a class="btn" href={'#/file/' + d.n + '/' + k} style="margin-top:14px">Open in file viewer →</a>
        {size && <div class="note" style="margin-top:8px">time{d.n}_{k}.mat · {fmtBytes(size)}</div>}
      </div>
      <div style="flex:2 1 420px">
        <div class="cap" style="letter-spacing:0.8px;margin-bottom:8px">Files for this speed and depth</div>
        <div class="files2">
          {files.map(f => {
            const inner = <><span class="bar" style={{ background: f.color }} /><div style="min-width:0"><div class="fname">{f.name}</div><div class="note">{f.desc}</div></div></>;
            return f.href ? <a class="fitem" href={f.href}>{inner}</a> : <div class="fitem">{inner}</div>;
          })}
        </div>
      </div>
    </section>
  );
}
