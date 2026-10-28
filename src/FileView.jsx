import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Icon } from './icons.jsx';
import { readMat } from './mat5.js';
import { spectrum, peaks } from './dsp.js';
import { VARIANT, MIRROR, fileUrl, repoPath, loadDataset, fmt, family } from './data.js';

const ALL = ['xtpos', 'ytpos', 'xtvel', 'ytvel', 'xtacc', 'ytacc', 'xwpos', 'ywpos', 'xwvel', 'ywvel', 'xwacc', 'ywacc', 'Forcex', 'Forcey'];
// Display unit and scale from SI, per signal.
const META = {
  pos: { t: ['µm', 1e6], w: ['µm', 1e6], what: 'displacement' },
  vel: { t: ['m/s', 1], w: ['mm/s', 1e3], what: 'velocity' },
  acc: { t: ['m/s²', 1], w: ['m/s²', 1], what: 'acceleration' },
};
function meta(name) {
  if (name === 'ForceRnew') return { unit: 'N', scale: 1, title: 'Resultant cutting force', axis: 'r' };
  if (name.startsWith('Force')) return { unit: 'N', scale: 1, title: 'Cutting force ' + name.slice(-1), axis: name.slice(-1) };
  const axis = name[0], body = name[1], q = name.slice(2);
  const [unit, scale] = META[q][body];
  return { unit, scale, title: (body === 't' ? 'Tool ' : 'Workpiece ') + META[q].what + ' ' + axis, axis };
}
const colorOf = name => meta(name).axis === 'y' ? '#1496A8' : meta(name).axis === 'r' ? '#012169' : '#0057B8';

// Small LRU of parsed files so switching cuts back and forth is instant.
const fileCache = new Map();
async function fetchMat(n, name, onProgress) {
  const key = n + '/' + name;
  if (fileCache.has(key)) return fileCache.get(key);
  const res = await fetch(fileUrl(n, name));
  if (res.status === 404) throw new Error('missing');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(got, total);
  }
  const buf = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.length; }
  const vars = await readMat(buf.buffer);
  const out = { vars, bytes: got };
  fileCache.set(key, out);
  if (fileCache.size > 8) fileCache.delete(fileCache.keys().next().value);
  return out;
}

const fmtNum = v => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000) return fmt(Math.round(v));
  if (a >= 1) return String(+v.toFixed(2));
  return String(+v.toPrecision(3));
};

// Time-domain panel: uPlot, x-zoom shared between all panels of the file.
function TimePlot({ t, y, name, color, unit, win, onWin }) {
  const el = useRef(), plot = useRef();
  useEffect(() => {
    const opts = {
      width: el.current.clientWidth || 600, height: 170,
      padding: [10, 8, 0, 0],
      legend: { show: false },
      cursor: { sync: { key: 'file' }, drag: { x: true, y: false } },
      scales: { x: { time: false } },
      axes: [
        { stroke: '#4A5468', grid: { stroke: '#E6EAF2' }, ticks: { stroke: '#C9D2E3' }, font: '11px Arial', values: (u, v) => v.map(x => x.toFixed(3)) },
        { stroke: '#4A5468', grid: { stroke: '#E6EAF2' }, ticks: { stroke: '#C9D2E3' }, font: '11px Arial', size: 64, values: (u, v) => v.map(fmtNum), label: unit, labelSize: 14, labelFont: '11px Arial' },
      ],
      series: [{}, { stroke: color, width: 1.6, points: { show: false } }],
      hooks: {
        setSelect: [u => {
          if (u.select.width > 2) onWin([u.posToVal(u.select.left, 'x'), u.posToVal(u.select.left + u.select.width, 'x')]);
          u.setSelect({ left: 0, width: 0, top: 0, height: 0 }, false);
        }],
      },
    };
    plot.current = new uPlot(opts, [t, y], el.current);
    plot.current.over.addEventListener('dblclick', () => onWin(null));
    const node = el.current;
    const ro = new ResizeObserver(() => plot.current?.setSize({ width: node.clientWidth, height: 170 }));
    ro.observe(node);
    return () => { ro.disconnect(); plot.current.destroy(); plot.current = null; };
  }, [t, y, color, unit]);
  useEffect(() => {
    const u = plot.current;
    if (!u) return;
    const [a, b] = win || [t[0], t[t.length - 1]];
    u.batch(() => {
      u.setScale('x', { min: a, max: b });
      // Fit y to the visible window.
      let lo = Infinity, hi = -Infinity;
      const i0 = Math.max(0, Math.floor((a - t[0]) / (t[1] - t[0]))), i1 = Math.min(t.length - 1, Math.ceil((b - t[0]) / (t[1] - t[0])));
      for (let i = i0; i <= i1; i++) { if (y[i] < lo) lo = y[i]; if (y[i] > hi) hi = y[i]; }
      const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
      u.setScale('y', { min: lo - pad, max: hi + pad });
    });
  }, [win, t, y]);
  return <div ref={el} class="plot" aria-label={name + ' time history'} role="img" />;
}

function SpecPlot({ spec, pk, fmax, fn }) {
  const a = spec.a;
  let amax = 0;
  for (let k = 1; k < a.length; k++) amax = Math.max(amax, a[k]);
  const line = 'M' + Array.from(spec.f, (f, k) => (f / fmax * 300).toFixed(1) + ',' + (100 - a[k] / amax * 92).toFixed(1)).join(' L');
  const stems = list => list.map(p => 'M' + (p.hz / fmax * 300).toFixed(1) + ' 100V' + (100 - Math.max(p.amp, 0.03) * 92).toFixed(1)).join(' ') || 'M0 100';
  return (
    <svg width="100%" height="170" viewBox="0 0 300 100" preserveAspectRatio="none" role="img"
      aria-label={'Spectrum peaks at ' + pk.map(p => Math.round(p.hz)).join(', ') + ' Hz'} style="display:block;background:#F8FAFD;border-radius:6px">
      {fn < fmax && <path d={'M' + (fn / fmax * 300) + ' 0V100'} stroke="#8C96A8" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke="#C9D2E3" stroke-width="1" vector-effect="non-scaling-stroke" />
      <path d={stems(pk.filter(p => p.tooth))} stroke="#012169" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <path d={stems(pk.filter(p => !p.tooth))} stroke="#E0662E" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    </svg>
  );
}

function Panel({ name, t, raw, fs, ftp, fmax, fn, win, onWin, winLabel }) {
  const m = meta(name);
  const y = useMemo(() => { const o = new Float64Array(raw.length); for (let i = 0; i < raw.length; i++) o[i] = raw[i] * m.scale; return o; }, [raw, m.scale]);
  const spec = useMemo(() => spectrum(raw, fs, fmax), [raw, fs, fmax]);
  const pk = useMemo(() => peaks(spec, ftp), [spec, ftp]);
  const other = pk.filter(p => !p.tooth && p.amp >= 0.1).sort((p, q) => q.amp - p.amp);
  const color = colorOf(name);
  const fnPos = Math.min(Math.max(fn / fmax, 0.15), 0.85) * 100;
  return (
    <section class="card panel">
      <div class="panel-h">
        <span class="sw" style={{ background: color }} />
        <h2 class="h2">{m.title}</h2>
        <span class="tag">{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: other.length ? '#A8431A' : '#0057B8' }}>
          {other.length ? 'chatter peak ' + fmt(Math.round(other[0].hz)) + ' Hz' : 'tooth passing ' + fmt(Math.round(ftp)) + ' Hz'}
        </span>
      </div>
      <div class="panel-b">
        <div class="tplot">
          <TimePlot t={t} y={y} name={name} color={color} unit={m.unit} win={win} onWin={onWin} />
          <div class="axis-n"><span>{winLabel[0]}</span><span>{winLabel[1]}</span><span>{winLabel[2]}</span></div>
        </div>
        <div class="splot">
          <SpecPlot spec={spec} pk={pk} fmax={fmax} fn={fn} />
          <div class="axis-n" style="position:relative"><span>0</span>{fn < fmax && <span style={{ position: 'absolute', left: fnPos + '%', transform: 'translateX(-50%)' }}>{fmt(fn)} Hz fn</span>}<span>{fmax >= 1000 ? fmax / 1000 + ' kHz' : fmax + ' Hz'}</span></div>
        </div>
      </div>
    </section>
  );
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Sound({ n, k, fs, rpm }) {
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(null);
  const audio = useRef(null);
  const name = 'ForceR' + n + '_' + k + '.wav';
  useEffect(() => () => audio.current?.pause(), [name]);
  const toggle = () => {
    if (!audio.current) {
      audio.current = new Audio(fileUrl(n, name));
      audio.current.onended = () => setPlaying(false);
      audio.current.onerror = () => { setErr('Not on the mirror yet'); setPlaying(false); };
    }
    if (playing) { audio.current.pause(); setPlaying(false); }
    else { setErr(null); audio.current.play().then(() => setPlaying(true), () => setErr('Could not play')); }
  };
  return (
    <section class="card" style="padding:16px 18px">
      <h2 class="t"><Icon name="sound" size={20} color="#0057B8" />Sound</h2>
      <div style="display:flex;align-items:center;gap:12px">
        <button type="button" class="play" aria-label={(playing ? 'Pause ' : 'Play ') + name} onClick={toggle}>
          <Icon name={playing ? 'pause' : 'run'} size={20} color="#FFFFFF" />
        </button>
        <div style="min-width:0">
          <div class="fname">{name}</div>
          <div class="note">{err || (500 * 60 / rpm).toFixed(1) + ' s · ' + fmt(Math.round(fs)) + ' Hz · 16-bit mono · peak-normalized'}</div>
        </div>
      </div>
    </section>
  );
}

export function FileView({ index, d, k }) {
  const name = 'time' + d.n + '_' + k + '.mat';
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [grid, setGrid] = useState(null);
  const [mode, setMode] = useState('quick');
  const [qty, setQty] = useState('pos');
  const [body, setBody] = useState('t');
  const [custom, setCustom] = useState(['xtpos', 'Forcey']);
  const [win, setWin] = useState(undefined);  // undefined = default (last 4 revs), null = whole record

  useEffect(() => {
    let live = true;
    setFile(null); setError(null); setProgress(null); setWin(undefined);
    fetchMat(d.n, name, (got, total) => live && setProgress([got, total])).then(f => live && setFile(f), e => live && setError(e.message));
    loadDataset(d.n).then(g => live && setGrid(g));
    return () => { live = false; };
  }, [d.n, k]);

  const cut = grid?.grid.find(c => c[0] === k);
  const v = file?.vars;
  const resultant = v && !v.time && v.timenew;
  const t = v ? (v.time || v.timenew).data : null;
  const rpm = v ? v.omega.data[0] : cut?.[1];
  const b = v ? v.b.data[0] * 1000 : cut?.[2];
  const fs = t ? 1 / (t[1] - t[0]) : 0;
  const ftp = rpm * d.p.teeth / 60;
  const fn = d.p.modes[0].fntx;
  const fmax = Math.max(2000, Math.min(Math.floor(fs / 2 / 500) * 500, Math.ceil(3.5 * ftp / 500) * 500));
  const T = t ? t.length : 0;
  const dur = t ? t[T - 1] - t[0] + 1 / fs : 0;
  const revs = Math.round(dur * rpm / 60);
  const perRev = fs * 60 / rpm;

  const defWin = t ? [t[T - 1] - 4 * 60 / rpm, t[T - 1]] : null;
  const curWin = win === undefined ? defWin : win;
  const winLabel = t ? (win === undefined
    ? [curWin[0].toFixed(3) + ' s', 'last 4 of ' + revs + ' revolutions · drag to zoom, double-click for all', curWin[1].toFixed(3) + ' s']
    : win === null ? [t[0].toFixed(3) + ' s', 'all ' + revs + ' revolutions · drag to zoom', t[T - 1].toFixed(3) + ' s']
      : [win[0].toFixed(3) + ' s', ((win[1] - win[0]) * rpm / 60).toFixed(1) + ' revolutions · double-click for all', win[1].toFixed(3) + ' s']) : ['', '', ''];

  const effBody = qty === 'force' ? 't' : body;
  const quickNames = resultant ? ['ForceRnew'] : qty === 'force' ? ['Forcex', 'Forcey'] : ['x', 'y'].map(a => a + effBody + qty);
  const available = resultant ? ['ForceRnew'] : ALL;
  const plotted = (mode === 'quick' ? quickNames : custom).filter(s => available.includes(s));

  const toggleSig = s => {
    const c = mode === 'custom' ? custom.slice() : plotted.slice();
    const i = c.indexOf(s);
    if (i >= 0) c.splice(i, 1); else { c.push(s); if (c.length > 4) c.shift(); }
    setMode('custom'); setCustom(c);
  };

  // Compare-cut buttons: the deepest predicted-stable and shallowest predicted-chatter cut at this speed.
  const cuts = useMemo(() => {
    if (!grid || !cut) return [];
    const same = grid.grid.filter(c => c[1] === cut[1]).sort((p, q) => p[2] - q[2]);
    const st = same.filter(c => c[3]).pop(), ch = same.find(c => !c[3]);
    const list = [st, ch].filter(Boolean);
    if (!list.includes(cut)) list.push(cut);
    return list.sort((p, q) => p[2] - q[2]);
  }, [grid, cut]);

  const fam = family(d);
  const snd = fam.find(n => n >= 126);

  const exportCsv = () => {
    const cols = [resultant ? 'timenew' : 'time', ...plotted];
    const data = cols.map(c => v[c].data);
    const lines = [cols.join(',')];
    for (let i = 0; i < T; i++) lines.push(data.map(a => a[i]).join(','));
    download(name.replace('.mat', '') + '_' + plotted.join('_') + '.csv', new Blob([lines.join('\n')], { type: 'text/csv' }));
  };
  const savePlot = () => {
    const canv = [...document.querySelectorAll('.tplot canvas')];
    if (!canv.length) return;
    const w = Math.max(...canv.map(c => c.width)), h = canv.reduce((s, c) => s + c.height, 0);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
    let y = 0;
    canv.forEach(c => { ctx.drawImage(c, 0, y); y += c.height; });
    out.toBlob(bl => download(name.replace('.mat', '') + '_' + plotted.join('_') + '.png', bl));
  };

  const code = 'from huggingface_hub import hf_hub_download\nimport scipy.io as sio\n\n' +
    'path = hf_hub_download("gomezmfg/digital-machining-database",\n' +
    '                       "' + repoPath(d.n, name) + '", repo_type="dataset")\n' +
    'm = sio.loadmat(path, squeeze_me=True)\n' +
    't = m["' + (resultant ? 'timenew' : 'time') + '"]\n' +
    plotted.map(s => s + ' = m["' + s + '"]').join('\n') + (plotted.length ? '\n' : '') +
    'fs = 1 / (t[1] - t[0])' + (fs ? '   # ' + fmt(Math.round(fs)) + ' Hz at ' + fmt(rpm) + ' rpm' : '');

  const stable = cut ? cut[3] : null;
  const pill = on => ({ 'aria-pressed': on ? 'true' : 'false' });

  return (
    <div class="page tight">
      <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Datasets</a> <span aria-hidden="true">/</span> <a href={'#/ds/' + d.n + '?k=' + k}>Dataset {d.n}</a> <span aria-hidden="true">/</span> {name}</nav>
      <div class="f-head">
        <div style="display:flex;align-items:center;gap:12px;flex:1 1 420px">
          <Icon name="time" size={34} color="#012169" />
          <div>
            <h1>{name}</h1>
            <div style="font-size:14px;color:#4A5468">
              {rpm != null ? fmt(rpm) + ' rpm · b = ' + (+b.toFixed(3)) + ' mm · ' : ''}
              {stable != null && <strong style={{ color: stable ? '#0057B8' : '#A8431A' }}>{stable ? 'below boundary (stable predicted)' : 'above boundary (chatter predicted)'}</strong>}
            </div>
          </div>
        </div>
        {cuts.length > 1 && (
          <div class="seg" role="group" aria-label="Compare cut">
            {cuts.map(c => <button type="button" class="lg" {...pill(c[0] === k)} onClick={() => { location.hash = '#/file/' + d.n + '/' + c[0]; }}>
              K{c[0]} · {+c[2].toFixed(3)} mm · {c[3] ? 'stable' : 'chatter'}</button>)}
          </div>
        )}
      </div>

      <div class="row">
        <main style="flex:999 1 720px;min-width:0;display:flex;flex-direction:column;gap:14px">
          <section class="card controls" aria-label="Plot controls">
            <div class="modes" role="group" aria-label="Plot mode">
              <button type="button" {...pill(mode === 'quick')} onClick={() => setMode('quick')}>{resultant ? 'Resultant force' : 'X / Y panels'}</button>
              <button type="button" {...pill(mode === 'custom')} onClick={() => setMode('custom')}>Custom</button>
            </div>
            {mode === 'quick' && !resultant && (
              <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px">
                <div class="pills" role="group" aria-label="Quantity">
                  {[['pos', 'Displacement'], ['vel', 'Velocity'], ['acc', 'Acceleration'], ['force', 'Force']].map(([id, label]) =>
                    <button type="button" class="pillbtn" {...pill(qty === id)} onClick={() => setQty(id)}>{label}</button>)}
                </div>
                <div class="pills" role="group" aria-label="Body">
                  <span class="cap">Body</span>
                  {[['t', 'Tool', 'tool'], ['w', 'Workpiece', 'part']].map(([id, label, ic]) => {
                    const dis = qty === 'force' && id === 'w';
                    return <button type="button" class="pillbtn sq" {...pill(effBody === id)} disabled={dis} onClick={() => setBody(id)} style="display:flex;align-items:center;gap:6px">
                      <Icon name={ic} size={16} color={effBody === id ? '#FFFFFF' : '#012169'} />{label}</button>;
                  })}
                </div>
              </div>
            )}
            {mode === 'quick' && resultant && <span class="note" style="font-size:13px">Datasets 126–155 store only <code>timenew</code> and <code>ForceRnew</code> (√(Fx² + Fy²)), 500 revolutions.</span>}
            {mode === 'custom' && <span class="note" style="font-size:13px">Pick up to 4 signals below, or click a variable in the side panel.</span>}
            <div style="margin-left:auto;display:flex;gap:8px">
              <button type="button" class="tbtn" onClick={exportCsv} disabled={!v || !plotted.length}><Icon name="export" size={18} color="#012169" />Export CSV</button>
              <button type="button" class="tbtn" onClick={savePlot} disabled={!v || !plotted.length}><Icon name="save" size={18} color="#012169" />Save plot</button>
            </div>
          </section>

          {mode === 'custom' && (
            <section class="card" aria-label="Choose signals" style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px 28px">
              {(resultant ? [['Cutting force', ['ForceRnew']]] : [['Tool', ALL.slice(0, 6)], ['Workpiece', ALL.slice(6, 12)], ['Cutting force', ALL.slice(12)]]).map(([title, names]) => (
                <div>
                  <div class="cap" style="margin-bottom:6px">{title}</div>
                  <div class="pills">{names.map(s => <button type="button" class={'sig ' + (meta(s).axis === 'y' ? 'y' : 'x')} {...pill(plotted.includes(s))} onClick={() => toggleSig(s)}>{s}</button>)}</div>
                </div>
              ))}
            </section>
          )}

          {error ? (
            <div class="err">
              {error === 'missing'
                ? <>This file is not on the Hugging Face mirror yet: the full upload is still running. Try <a href="#/file/1/34">time1_34.mat</a>, or get it from <a href={'https://www.kaggle.com/datasets/tonylschmitz/digital-machining-database'} target="_blank" rel="noopener">Kaggle</a>.</>
                : <>Could not load {name}: {error}</>}
            </div>
          ) : !v ? (
            <div class="card loading"><span class="spin" />Fetching {name} from the Hugging Face mirror{progress && progress[1] ? ' · ' + (progress[0] / 1e6).toFixed(1) + ' / ' + (progress[1] / 1e6).toFixed(1) + ' MB' : progress ? ' · ' + (progress[0] / 1e6).toFixed(1) + ' MB' : '…'}</div>
          ) : plotted.length === 0 ? (
            <div class="empty" style="padding:40px">Pick a signal to plot.</div>
          ) : plotted.map(s => (
            <Panel key={s + name} name={s} t={t} raw={v[s].data} fs={fs} ftp={ftp} fmax={fmax} fn={fn} win={curWin} onWin={setWin} winLabel={winLabel} />
          ))}

          <div class="legend" style="padding:0 4px">
            <span><span class="sw" style="background:#012169" />spectrum: tooth passing ({rpm ? fmt(Math.round(ftp)) : '–'} Hz) and harmonics</span>
            <span><span class="sw" style="background:#E0662E" />spectrum: other peaks (chatter)</span>
            <span>Spectra use the second half of the record ({revs ? Math.round(revs / 2) : '–'} revolutions), Hann window.</span>
          </div>

          <section class="card" style="padding:16px 18px">
            <h2 class="h2" style="margin-bottom:10px">Load in Python</h2>
            <pre class="code">{code}</pre>
          </section>
        </main>

        <aside class="side" aria-label="File details" style="gap:14px">
          <section class="card" style="padding:16px 18px">
            <h2 class="t">Sampling</h2>
            {v ? <dl class="kv">
              <dt>Samples (T)</dt><dd>{fmt(T)}</dd>
              <dt>Sample rate</dt><dd>{fmt(Math.round(fs))} Hz</dd>
              <dt>Duration</dt><dd>{dur.toFixed(3)} s · {revs} revs</dd>
              <dt>Per revolution</dt><dd>{+perRev.toFixed(1)} samples ({+(perRev / d.p.teeth).toFixed(1)} per tooth)</dd>
              <dt>File size</dt><dd>{(file.bytes / 1e6).toFixed(2)} MB</dd>
            </dl> : <div class="note">Loading…</div>}
          </section>

          <section class="card" style="padding:16px 18px">
            <h2 class="t" style="margin-bottom:4px">Variables</h2>
            <p class="note" style="margin:0 0 10px">{resultant ? <><code>omega</code>, <code>b</code>, <code>timenew</code> + <code>ForceRnew</code>.</> : <><code>omega</code>, <code>b</code>, <code>time</code> + 14 signals.</>} Click one to plot it.</p>
            <div class="pills">{available.map(s => <button type="button" class={'sig sm ' + (meta(s).axis === 'y' ? 'y' : 'x')} {...pill(plotted.includes(s))} onClick={() => toggleSig(s)}>{s}</button>)}</div>
          </section>

          <section class="card" style="padding:16px 18px">
            <h2 class="t">Same cut in other datasets</h2>
            <div style="display:flex;flex-direction:column;gap:8px">
              {fam.map(n => {
                const o = index.datasets.find(e => e.n === n);
                const on = n === d.n;
                const va = VARIANT[o.group];
                return (
                  <a class={'fitem' + (on ? ' on' : '')} href={'#/file/' + n + '/' + k} aria-current={on ? 'page' : undefined}>
                    <span class="bar" style={{ background: va.color, height: '30px' }} />
                    <div style="flex:1;min-width:0"><div class="fname">time{n}_{k}.mat</div><div class="note">{va.desc}</div></div>
                    {on && <span style="font-size:12px;font-weight:700;color:#012169">Viewing</span>}
                  </a>
                );
              })}
            </div>
          </section>

          {snd && rpm && <Sound key={snd + '_' + k} n={snd} k={k} fs={fs} rpm={rpm} />}

          <section class="card" style="padding:16px 18px">
            <h2 class="t">Source</h2>
            <p class="note" style="margin:0;line-height:1.5">Streamed from the <a href={MIRROR} target="_blank" rel="noopener">Hugging Face mirror</a> and parsed in your browser. The original is on <a href="https://www.kaggle.com/datasets/tonylschmitz/digital-machining-database" target="_blank" rel="noopener">Kaggle</a> (CC BY-ND 4.0); <a href={fileUrl(d.n, name)}>download this file</a>.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
