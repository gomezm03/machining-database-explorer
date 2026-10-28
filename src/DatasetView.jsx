import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { GROUPS, VARIANT, loadDataset, fmt, family, immersionOf, dirOf, helixOf, pitchOf } from './data.js';

const W = 760, H = 360, OX = 56, OY = 16;  // plot area inside the 836×420 canvas

function niceStep(max) {
  for (const s of [1, 2, 4, 5, 10, 20]) if (max / s <= 9) return s;
  return 50;
}
function niceSpeedStep(span) {
  for (const s of [1000, 2000, 2500, 5000, 10000]) if (span / s <= 7) return s;
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
        <h2><Icon name="dynamics" size={20} color="#0057B8" stroke={1.8} />Structural dynamics</h2>
        <Kv rows={[
          ['Tool fn (x, y)', xy], ['Tool stiffness', kxy], ['Damping ratio ζ', String(m.zetatx)],
          ['Modes per direction', String(p.modes.length)],
          ...p.modes.slice(1).map((mm, i) => ['Mode ' + (i + 2), fmt(mm.fntx) + ' Hz · ' + n(mm.ktx / 1e6) + ' N/µm · ζ ' + mm.zetatx]),
          ['Workpiece', fmt(m.fnwx) + ' Hz · ' + fmt(m.kwx / 1e6) + ' N/µm'],
        ]} />
      </section>
      <section class="card">
        <h2><Icon name="force" size={20} color="#0057B8" stroke={1.8} />Force model</h2>
        <Kv rows={[
          ['ktc / knc', fmt(p.ktc / 1e6) + ' / ' + fmt(p.knc / 1e6) + ' N/mm²'],
          ['Edge kte / kne', fmt(p.kte / 1000) + ' / ' + fmt(p.kne / 1000) + ' N/mm'],
          ['Process damping Cn', p.cn ? fmt(p.cn) + ' N/m' : '0'],
        ]} />
        {p.ktc < 1e6 && <p class="note" style="margin:8px 0 0">ktc as listed in the xlsx (probable typo).</p>}
      </section>
      <section class="card">
        <h2><Icon name="tool" size={20} color="#0057B8" stroke={1.8} />Tool</h2>
        <Kv rows={[
          ['Diameter', n(p.d * 1000) + ' mm'], ['Teeth', p.teeth + ', square end'],
          ['Helix', [...new Set(p.beta)].join(' / ') + '°'],
          ['Tooth angles', p.angles.join(' / ') + '°' + (pitchOf(d) === 'variable' ? ' (variable)' : '')],
          ['Runout', p.ro.some(r => r) ? p.ro.map(r => n(r * 1e6)).join(' / ') + ' µm' : '0'],
        ]} />
      </section>
      <section class="card">
        <h2><Icon name="cut" size={20} color="#0057B8" stroke={1.8} />Cut</h2>
        <Kv rows={[
          ['Direction', dirOf(d) === 'up' ? 'Up (conventional)' : 'Down (climb)'],
          ['Radial depth', n(p.a * 1000) + ' mm (' + immersionOf(d) + '%)'],
          ['Feed per tooth', n(p.ft * 1000) + ' mm'],
          ['Speeds', fmt(p.omMin) + '–' + fmt(p.omMax) + ' rpm, step ' + fmt(p.omStep)],
          ['Depths', 'from ' + n(p.bMin * 1000) + ' mm, step ' + n(p.bStep * 1000) + ' mm'],
          ...(p.noise ? [['Noise', p.noise + '% of max |signal|']] : []),
        ]} />
        {p.aFixed && <p class="note" style="margin:8px 0 0">The xlsx lists a = 3000; read here as 3 mm.</p>}
      </section>
      {fam.length > 0 && (
        <section class="card">
          <h2>Same inputs in other groups</h2>
          <div class="gchips">
            {fam.map(x => {
              const o = index.datasets.find(e => e.n === x);
              const g = GROUPS[o.group];
              return <a href={'#/ds/' + x} style={{ background: g.bg, color: g.fg }}>{x} · {o.group === 'unique' ? 'clean' : g.label.toLowerCase()}</a>;
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

function GridPlot({ d, info, sel, onPick }) {
  const g = useMemo(() => {
    const om = info.grid.map(c => c[1]);
    const x0 = Math.min(om[0], info.boundary.om[0], ...om), x1 = Math.max(info.boundary.om[info.boundary.om.length - 1], ...om);
    const bmax = Math.max(...info.grid.map(c => c[2]));
    const lmax = Math.max(...info.boundary.b.filter((v, i) => info.boundary.om[i] >= x0 && info.boundary.om[i] <= x1));
    const ystep = niceStep(Math.max(bmax, Math.min(lmax, bmax * 1.6)));
    const top = Math.ceil(Math.max(bmax * 1.08, Math.min(lmax, bmax * 1.6)) / ystep) * ystep;
    const X = v => (v - x0) / (x1 - x0) * W;
    const Y = v => H - Math.min(v, top) / top * H;
    const path = 'M' + info.boundary.om.map((o, i) => X(o).toFixed(1) + ',' + Y(info.boundary.b[i]).toFixed(1)).join(' L');
    const speeds = [...new Set(om)].length;
    const depths = [...new Set(info.grid.map(c => c[2]))].length;
    const size = Math.max(6, Math.min(14, Math.floor(Math.min(W / speeds, H / Math.max(depths, 1)) * 0.75)));
    const yt = [];
    for (let v = 0; v <= top + 1e-9; v += ystep) yt.push(v);
    const xs = niceSpeedStep(x1 - x0), xt = [];
    for (let v = Math.ceil(x0 / xs) * xs; v <= x1; v += xs) xt.push(v);
    if (xt[0] - x0 > xs * 0.4) xt.unshift(x0);
    return { X, Y, path, size, yt, xt, x0, x1 };
  }, [info]);

  return (
    <div class="gridwrap">
      <div class="gridplot">
        <svg width="836" height="420" viewBox="0 0 836 420" role="img" aria-label={'Stability boundary of dataset ' + d.n + ' from ' + fmt(g.x0) + ' to ' + fmt(g.x1) + ' rpm'}>
          <defs><clipPath id="clip"><rect x="0" y="0" width={W} height={H} /></clipPath></defs>
          <g transform={'translate(' + OX + ' ' + OY + ')'}>
            <path d={g.path + ' L' + W + ',0 L0,0 Z'} fill="#FCEFE8" clip-path="url(#clip)" />
            <g stroke="#E6EAF2" stroke-width="1">{g.yt.slice(1).map(v => <path d={'M0 ' + g.Y(v) + 'H' + W} />)}</g>
            <path d={'M0 0V' + H + 'H' + W} fill="none" stroke="#8C96A8" stroke-width="1" />
            <path d={g.path} fill="none" stroke="#012169" stroke-width="2.2" clip-path="url(#clip)" />
            <g font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#4A5468" text-anchor="end">
              {g.yt.map(v => <text x="-8" y={g.Y(v) + 4}>{v}</text>)}
            </g>
            <g font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#4A5468" text-anchor="middle">
              {g.xt.map(v => <text x={g.X(v)} y={H + 20}>{fmt(v)}</text>)}
              <text x={W / 2} y={H + 40} fill="#1B2433">Spindle speed (rpm)</text>
            </g>
            <text x={W - 20} y="22" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#A8431A" text-anchor="end">Chatter predicted</text>
          </g>
          <text transform="translate(16 196) rotate(-90)" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#1B2433" text-anchor="middle">Axial depth b (mm)</text>
        </svg>
        {info.grid.map(([k, om, b, s]) => {
          const on = k === sel;
          const size = on ? g.size + 6 : g.size;
          return (
            <button type="button" class="pt" key={k} onClick={() => onPick(k)} aria-pressed={on ? 'true' : 'false'}
              aria-label={'Cut ' + k + ', ' + fmt(om) + ' rpm, ' + b + ' mm, ' + (s ? 'below' : 'above') + ' boundary'}
              title={'K' + k + ' · ' + fmt(om) + ' rpm · ' + b + ' mm'}
              style={{
                left: OX + g.X(om) - size / 2 + 'px', top: OY + g.Y(b) - size / 2 + 'px', width: size + 'px', height: size + 'px',
                border: (g.size < 10 ? '1.5px' : '2px') + ' solid ' + (s ? '#FFFFFF' : '#E0662E'), background: s ? '#0057B8' : '#FFFFFF',
                boxShadow: on ? '0 0 0 3px #012169' : 'none', zIndex: on ? 2 : 1,
              }} />
          );
        })}
      </div>
    </div>
  );
}

export function DatasetView({ index, d, k }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setInfo(null); loadDataset(d.n).then(setInfo, e => setError(e.message)); }, [d.n]);

  const g = GROUPS[d.group];
  const m = d.p.modes[0];
  const blurb = String(+(d.p.d * 1000).toPrecision(4)) + ' mm ' + d.p.teeth + '-tooth end mill, ' + immersionOf(d) + '% radial immersion, ' +
    dirOf(d) + ' milling, ' + fmt(m.fntx) + ' Hz tool mode, ' + String(+(m.ktx / 1e6).toPrecision(4)) + ' N/µm stiffness' +
    (d.p.cn ? ', process damping' : '') + (pitchOf(d) === 'variable' ? ', variable pitch' : '') + (d.p.noise ? ', ' + d.p.noise + '% noise' : '') + '.';

  const sel = info ? (info.grid.find(c => c[0] === k) || info.grid.find(c => !c[3]) || info.grid[0]) : null;
  const pick = kk => { history.replaceState(null, '', '#/ds/' + d.n + '?k=' + kk); dispatchEvent(new HashChangeEvent('hashchange')); };
  const nBelow = info ? info.grid.filter(c => c[3]).length : 0;
  const revs = d.group === 'sound' ? 500 : 60;

  return (
    <div class="page tight">
      <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Datasets</a> <span aria-hidden="true">/</span> Dataset {d.n}</nav>
      <div class="ds-head">
        <div style="flex:1 1 420px">
          <div style="display:flex;align-items:center;gap:12px">
            <h1>Dataset {d.n}</h1>
            <span class="pill" style={{ background: g.bg, color: g.fg, fontSize: '13px', padding: '4px 10px' }}>{g.label}{d.n === 1 ? ' · baseline' : d.base ? ' · copy of ' + d.base : ''}</span>
          </div>
          <p style="margin:6px 0 0;font-size:15px;color:#4A5468">{blurb}</p>
        </div>
        <div class="kpis">
          <div class="kpi"><b>{fmt(d.files)}</b><span>cuts (time files)</span></div>
          <div class="kpi"><b>{d.speeds}</b><span>spindle speeds</span></div>
          <div class="kpi"><b>{revs}</b><span>revolutions per cut</span></div>
          <div class="kpi"><b>~12.5 kHz</b><span>sampling</span></div>
        </div>
      </div>

      <div class="row">
        <Inputs d={d} index={index} />
        <main class="main">
          <section class="card" style="padding:18px 20px">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;margin-bottom:8px">
              <h2 style="margin:0;font-size:16px;color:#012169">Grid of cuts vs. stability boundary</h2>
              <div class="legend" style="margin-left:auto">
                <span><span style="width:12px;height:12px;border-radius:50%;background:#0057B8" />below boundary ({nBelow})</span>
                <span><span style="width:10px;height:10px;border-radius:50%;border:2px solid #E0662E;background:#fff" />above boundary ({info ? info.grid.length - nBelow : 0})</span>
                <span><span style="width:18px;height:0;border-top:2px solid #012169" />stability_boundary{d.n}.mat</span>
              </div>
            </div>
            {error ? <div class="err">{error}</div> : info ? <GridPlot d={d} info={info} sel={sel[0]} onPick={pick} /> : <div class="loading"><span class="spin" />Loading grid…</div>}
            <p class="note" style="margin:8px 0 0">Colors compare each cut with the analytical boundary. The files themselves are unlabelled, and the time-domain result can differ, especially with process damping or variable pitch.</p>
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
  if (snd) files.push({ n: snd, name: 'ForceR' + snd + '_' + k + '.wav', desc: 'sound of the resultant force', color: '#959595', href: '#/file/' + snd + '/' + k });
  files.push({ n: d.n, name: 'stability_boundary' + d.n + '.mat', desc: 'omega_vector, blim_vector', color: '#012169' });
  return (
    <section class="card" aria-live="polite" style="padding:18px 20px;display:flex;flex-wrap:wrap;gap:20px 32px">
      <div style="flex:1 1 260px">
        <div style="font-size:12px;font-weight:700;color:#0057B8;text-transform:uppercase;letter-spacing:0.8px">Selected cut · K = {k}</div>
        <div style="font-size:26px;font-weight:700;color:#012169;margin:6px 0 2px">{fmt(om)} rpm · {b} mm</div>
        <div style="font-size:14px;color:#4A5468">Boundary at this speed: {blimAt(info.boundary, om).toFixed(2)} mm · <strong style={{ color: s ? '#0057B8' : '#A8431A' }}>{s ? 'below boundary (stable predicted)' : 'above boundary (chatter predicted)'}</strong></div>
        <a class="btn" href={'#/file/' + d.n + '/' + k} style="margin-top:14px">Open in file viewer →</a>
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
