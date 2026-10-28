import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { Icon } from './icons.jsx';
import { readMat } from './mat5.js';
import { spectrum, peaks } from './dsp.js';
import { cssVar } from './themes.js';
import { getFile, prefetch, cacheStats, clearCache } from './filecache.js';
import { GroupPill, KAGGLE, fileUrl, repoPath, loadDataset, fmt, fmtBytes, family } from './data.js';

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
const tokenOf = name => ({ x: '--x', y: '--y', r: '--fit' })[meta(name).axis];

// Two cache levels: parsed files in memory (instant when switching back and forth), and the raw bytes on
// disk via filecache.js (fast on later visits). `source` says where this load came from.
const parsed = new Map();
async function fetchMat(n, name, onProgress) {
  const key = n + '/' + name;
  if (parsed.has(key)) return { ...parsed.get(key), source: 'memory', ms: 0 };
  const { buf, source, ms } = await getFile(n, name, onProgress);
  const out = { vars: await readMat(buf), bytes: buf.byteLength };
  parsed.set(key, out);
  if (parsed.size > 8) parsed.delete(parsed.keys().next().value);
  return { ...out, source, ms };
}

const fmtNum = v => {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000) return fmt(Math.round(v));
  if (a >= 1) return String(+v.toFixed(2));
  return String(+v.toPrecision(3));
};

// Time-domain panel: uPlot, x-zoom shared between all panels of the file. Rebuilt when the theme changes,
// because the canvas needs resolved colours.
// uPlot only listens to the mouse, so touch is handled here: pinch zooms time, a sideways drag pans, a
// double-tap goes back to the default window. touch-action: pan-y leaves vertical swipes to the page.
function TimePlot({ t, y, name, unit, token, win, onWin, minSpan, theme }) {
  const el = useRef(), plot = useRef(), readout = useRef();
  const live = useRef();
  live.current = { t, win, onWin, minSpan };
  useEffect(() => {
    const node = el.current;
    let g = null, lastTap = null;
    const rect = () => (plot.current?.over || node).getBoundingClientRect();
    const view = () => { const L = live.current; return L.win || [L.t[0], L.t[L.t.length - 1]]; };
    // Clamp a window to the record and the minimum span; the whole record is null (same as double-click).
    // Touch moves arrive about once per frame, so each one updates the window directly.
    const emit = (a, b) => {
      const L = live.current, t0 = L.t[0], t1 = L.t[L.t.length - 1];
      const span = Math.max(L.minSpan, Math.min(b - a, t1 - t0));
      if (span >= t1 - t0) return L.onWin(null);
      a = Math.max(t0, Math.min(a, t1 - span));
      L.onWin([a, a + span]);
    };
    const start = e => {
      const r = rect(), v = view(), toT = x => v[0] + (x - r.left) / r.width * (v[1] - v[0]);
      if (e.touches.length === 2) {
        const [p, q] = e.touches;
        g = { mode: 'pinch', dist: Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY) || 1, at: toT((p.clientX + q.clientX) / 2), v, r };
      } else if (e.touches.length === 1) {
        const p = e.touches[0];
        g = { mode: 'one', x: p.clientX, y: p.clientY, time: performance.now(), v, r, moved: false };
      }
    };
    const move = e => {
      if (!g) return;
      if (g.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const [p, q] = e.touches;
        const span = (g.v[1] - g.v[0]) * g.dist / Math.max(1, Math.hypot(p.clientX - q.clientX, p.clientY - q.clientY));
        const mid = (p.clientX + q.clientX) / 2;
        // Keep the instant that started under the fingers' midpoint under it.
        const a = g.at - (mid - g.r.left) / g.r.width * span;
        emit(a, a + span);
      } else if (g.mode === 'one' && e.touches.length === 1) {
        const p = e.touches[0], dx = p.clientX - g.x, dy = p.clientY - g.y;
        if (!g.moved && Math.hypot(dx, dy) > 8) { g.moved = true; g.pan = Math.abs(dx) > Math.abs(dy); }
        if (g.pan) {
          e.preventDefault();
          const shift = -dx / g.r.width * (g.v[1] - g.v[0]);
          emit(g.v[0] + shift, g.v[1] + shift);
        }
      }
    };
    const end = e => {
      if (g?.mode === 'one' && !g.moved && performance.now() - g.time < 300) {
        const p = e.changedTouches[0], now = performance.now();
        if (lastTap && now - lastTap.time < 320 && Math.hypot(p.clientX - lastTap.x, p.clientY - lastTap.y) < 30) {
          e.preventDefault();  // also stops the browser's synthetic dblclick, which would show the whole record
          lastTap = null;
          live.current.onWin(undefined);
        } else lastTap = { time: now, x: p.clientX, y: p.clientY };
      }
      // A pinch ending with one finger still down continues as a fresh one-finger gesture, not a jump.
      if (e.touches.length === 1) { start(e); g.moved = true; } else if (!e.touches.length) g = null;
    };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', end, { passive: false });
    const cancel = () => { g = null; };
    node.addEventListener('touchcancel', cancel);
    return () => {
      node.removeEventListener('touchstart', start); node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end); node.removeEventListener('touchcancel', cancel);
    };
  }, []);
  useEffect(() => {
    const ink = cssVar('--muted'), grid = cssVar('--grid'), tick = cssVar('--line');
    const axis = { stroke: ink, grid: { stroke: grid, width: 1 }, ticks: { stroke: tick, width: 1 }, font: '11px Arial' };
    const opts = {
      width: el.current.clientWidth || 600, height: 170,
      padding: [10, 10, 0, 0],
      legend: { show: false },
      cursor: { sync: { key: 'file' }, drag: { x: true, y: false }, points: { size: 7, fill: cssVar(token) } },
      scales: { x: { time: false } },
      axes: [
        { ...axis, size: 30, values: (u, v) => v.map(x => x.toFixed(3)) },
        { ...axis, size: 56, values: (u, v) => v.map(fmtNum) },
      ],
      series: [{}, { stroke: cssVar(token), width: +cssVar('--lw') || 1.6, points: { show: false } }],
      hooks: {
        // Value under the cursor (mouse hover or a tap), for this panel; the cursor is synced across panels.
        setCursor: [u => {
          const i = u.cursor.idx, r = readout.current;
          if (!r) return;
          if (i == null || u.cursor.left < 0) { r.hidden = true; return; }
          r.hidden = false;
          r.textContent = t[i].toFixed(4) + ' s · ' + fmtNum(y[i]) + ' ' + unit;
        }],
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
  }, [t, y, token, theme]);
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
  }, [win, t, y, theme]);
  return (
    <div class="plot-w">
      <div ref={el} class="plot" aria-label={name + ' time history'} role="img" />
      <div ref={readout} class="readout num" hidden aria-hidden="true" />
    </div>
  );
}

function freqStep(fmax) {
  for (const s of [250, 500, 1000, 2000, 5000]) if (fmax / s <= 5) return s;
  return 10000;
}
const fmtHz = v => v >= 1000 ? +(v / 1000).toFixed(2) + ' kHz' : Math.round(v) + ' Hz';

function SpecPlot({ spec, pk, fmax, fn }) {
  const a = spec.a;
  let amax = 0;
  for (let k = 1; k < a.length; k++) amax = Math.max(amax, a[k]);
  const X = hz => hz / fmax * 300;
  const line = 'M' + Array.from(spec.f, (f, k) => X(f).toFixed(1) + ',' + (100 - a[k] / amax * 92).toFixed(1)).join(' L');
  const stems = list => list.map(p => 'M' + X(p.hz).toFixed(1) + ' 100V' + (100 - Math.max(p.amp, 0.03) * 92).toFixed(1)).join(' ') || 'M0 100';
  const step = freqStep(fmax), ticks = [];
  for (let v = step; v < fmax; v += step) ticks.push(v);
  // Label the strongest tooth-passing line and the strongest other peak. When they are close, the lower
  // frequency's label hangs to the left of its stem and the higher one's to the right, so neither is hidden.
  const tooth = pk.filter(p => p.tooth).sort((p, q) => q.amp - p.amp)[0];
  const other = pk.filter(p => !p.tooth && p.amp >= 0.1).sort((p, q) => q.amp - p.amp)[0];
  const labels = [tooth, other].filter(Boolean).sort((p, q) => p.hz - q.hz);
  const close = labels.length === 2 && X(labels[1].hz) - X(labels[0].hz) < 40;
  const shift = i => !close ? 'translate(-50%, -100%)' : i === 0 ? 'translate(calc(-100% - 2px), -100%)' : 'translate(2px, -100%)';
  return (
    <>
      <div class="spec">
        <svg viewBox="0 0 300 100" preserveAspectRatio="none" role="img"
          aria-label={'Spectrum peaks at ' + pk.map(p => Math.round(p.hz)).join(', ') + ' Hz'}>
          {ticks.map(v => <path d={'M' + X(v) + ' 0V100'} stroke-width="1" vector-effect="non-scaling-stroke" style={{ stroke: 'var(--grid)' }} />)}
          {fn < fmax && <path d={'M' + X(fn) + ' 0V100'} stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" style={{ stroke: 'var(--subtle)' }} />}
          <path d={line} fill="none" stroke-width="1" vector-effect="non-scaling-stroke" style={{ stroke: 'var(--field)' }} />
          <path d={stems(pk.filter(p => p.tooth))} stroke-width="3.5" stroke-linecap="round" vector-effect="non-scaling-stroke" style={{ stroke: 'var(--fit)' }} />
          <path d={stems(pk.filter(p => !p.tooth))} stroke-width="3.5" stroke-linecap="round" vector-effect="non-scaling-stroke" style={{ stroke: 'var(--chatter)' }} />
        </svg>
        {labels.map((p, i) => (
          <span class="peak-l" style={{ left: X(p.hz) / 3 + '%', top: Math.max(14, 100 - Math.max(p.amp, 0.03) * 92) + '%', transform: shift(i), color: p.tooth ? 'var(--ink)' : 'var(--chatter-text)' }}>{Math.round(p.hz)}</span>
        ))}
      </div>
      <div class="spec-ticks">
        <span class="start" style="left:0">0</span>
        {ticks.map(v => Math.abs(v - fn) / fmax > 0.07 && <span style={{ left: X(v) / 3 + '%' }}>{v >= 1000 ? v / 1000 + 'k' : v}</span>)}
        {fn < fmax && <span style={{ left: X(fn) / 3 + '%', color: 'var(--ink)' }}>fn</span>}
        <span class="end" style="left:100%">{fmtHz(fmax)}</span>
      </div>
    </>
  );
}

function Panel({ name, t, raw, fs, ftp, fmax, fn, win, onWin, minSpan, caption, theme }) {
  const m = meta(name);
  const y = useMemo(() => { const o = new Float64Array(raw.length); for (let i = 0; i < raw.length; i++) o[i] = raw[i] * m.scale; return o; }, [raw, m.scale]);
  const spec = useMemo(() => spectrum(raw, fs, fmax), [raw, fs, fmax]);
  const pk = useMemo(() => peaks(spec, ftp), [spec, ftp]);
  const other = pk.filter(p => !p.tooth && p.amp >= 0.1).sort((p, q) => q.amp - p.amp);
  const token = tokenOf(name);
  return (
    <section class="card panel">
      <div class="panel-h">
        <span class="sw" style={{ background: 'var(' + token + ')' }} />
        <h2 class="h2">{m.title}</h2>
        <span class="unit">{m.unit}</span>
        <span class="tag">{name}</span>
        <span class={'verdict ' + (other.length ? 'chatter-t' : '')} style={other.length ? null : { color: 'var(--muted)', fontWeight: 400 }}>
          {other.length ? 'chatter peak ' + fmt(Math.round(other[0].hz)) + ' Hz' : 'tooth passing ' + fmt(Math.round(ftp)) + ' Hz only'}
        </span>
      </div>
      <div class="panel-b">
        <div class="tplot">
          <TimePlot t={t} y={y} name={name} unit={m.unit} token={token} win={win} onWin={onWin} minSpan={minSpan} theme={theme} />
          <div class="axis-c">{caption}</div>
        </div>
        <div class="splot"><SpecPlot spec={spec} pk={pk} fmax={fmax} fn={fn} /></div>
      </div>
    </section>
  );
}

function SkeletonPanel() {
  return (
    <section class="card panel" aria-hidden="true">
      <div class="panel-h"><span class="skel" style="width:220px;height:16px" /></div>
      <div class="panel-b">
        <div class="tplot"><div class="skel" style="height:170px" /><div class="axis-c">&nbsp;</div></div>
        <div class="splot"><div class="skel" style="height:170px" /><div class="spec-ticks" /></div>
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
      audio.current.onerror = () => { setErr('Not available yet'); setPlaying(false); };
    }
    if (playing) { audio.current.pause(); setPlaying(false); }
    else { setErr(null); audio.current.play().then(() => setPlaying(true), () => setErr('Could not play this file')); }
  };
  return (
    <section class="card" style="padding:16px 18px">
      <h2 class="t"><Icon name="sound" size={20} />Sound</h2>
      <div style="display:flex;align-items:center;gap:12px">
        <button type="button" class="play" aria-label={(playing ? 'Pause ' : 'Play ') + name} onClick={toggle}>
          <Icon name={playing ? 'pause' : 'run'} size={20} />
        </button>
        <div style="min-width:0">
          <div class="fname">{name}</div>
          <div class="note">{err || <>{rpm ? (500 * 60 / rpm).toFixed(1) + ' s' : '…'}{fs ? ' · ' + fmt(Math.round(fs)) + ' Hz' : ''}<br />16-bit mono, peak-normalized</>}</div>
        </div>
      </div>
    </section>
  );
}

export function FileView({ index, d, k, theme }) {
  const name = 'time' + d.n + '_' + k + '.mat';
  const resultant = d.group === 'sound';  // 126–155 store only timenew and ForceRnew
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [grid, setGrid] = useState(null);
  const [mode, setMode] = useState('quick');
  const [qty, setQty] = useState('pos');
  const [body, setBody] = useState('t');
  const [custom, setCustom] = useState(['xtpos', 'Forcey']);
  const [win, setWin] = useState(undefined);  // undefined = default (last 4 revs), null = whole record

  // Results are tagged with the file they belong to: while the next file loads, the component re-renders
  // with the new route before the effect runs, and must never pair the new dataset with the old data.
  const key = d.n + '/' + k;
  useEffect(() => {
    let live = true;
    setError(null); setProgress(null); setWin(undefined);
    fetchMat(d.n, name, (got, total) => live && setProgress([got, total]))
      .then(f => live && setFile({ ...f, key }), e => live && setError({ key, message: e.message }));
    loadDataset(d.n).then(g => live && setGrid(g));
    return () => { live = false; };
  }, [key]);

  const gridHere = grid && grid.n === d.n ? grid : null;
  const cut = gridHere?.grid.find(c => c[0] === k);
  const noCut = gridHere && !cut;
  const size = cut ? gridHere.size[gridHere.grid.indexOf(cut)] : 0;
  const cur = file && file.key === key ? file : null;
  const err = noCut ? 'nocut' : error && error.key === key ? error.message : null;
  const v = err ? null : cur?.vars;
  const t = v ? (v.time || v.timenew).data : null;
  const rpm = v ? v.omega.data[0] : cut?.[1];
  const b = v ? v.b.data[0] * 1000 : cut?.[2];
  const fs = t ? 1 / (t[1] - t[0]) : 0;
  const ftp = rpm * d.p.teeth / 60;
  const fn = d.p.modes[0].fntx;
  const fmax = fs ? Math.max(2000, Math.min(Math.floor(fs / 2 / 500) * 500, Math.ceil(3.5 * ftp / 500) * 500)) : 2000;
  const T = t ? t.length : 0;
  const dur = t ? t[T - 1] - t[0] + 1 / fs : 0;
  const revs = t ? Math.round(dur * rpm / 60) : resultant ? 500 : 60;
  const perRev = fs * 60 / rpm;

  const defWin = t ? [t[T - 1] - 4 * 60 / rpm, t[T - 1]] : null;
  const curWin = win === undefined ? defWin : win;
  // Preset windows for every panel: the last revolution, the default last 4, or the whole record.
  const rev = 60 / rpm;
  const minSpan = fs ? Math.max(20 / fs, rev / 8) : 0;
  const lastRev = t && Array.isArray(win) && Math.abs(win[1] - win[0] - rev) < rev * 0.01 && Math.abs(win[1] - t[T - 1]) < 2 / fs;
  const presets = [['1 rev', t ? [t[T - 1] - rev, t[T - 1]] : null, lastRev], ['4 revs', undefined, win === undefined], ['All', null, win === null]];
  const touch = matchMedia('(pointer: coarse)').matches;
  const what = win === undefined ? 'Last 4 of ' + revs + ' revolutions' : win === null ? 'All ' + revs + ' revolutions'
    : win ? ((win[1] - win[0]) * rpm / 60).toFixed(1) + ' revolutions' : '';
  const hint = touch ? ' · pinch to zoom, double-tap to reset' : win === null ? ' · drag to zoom' : ' · drag to zoom, double-click for the whole record';
  // The preset buttons sit under each time plot, beside the zoom they control (the toolbar stays one row).
  const caption = <>
    <span>{what}{hint}</span>
    {t && <span class="wins" role="group" aria-label="Time window">
      {presets.map(([label, w, on]) => <button type="button" aria-pressed={on ? 'true' : 'false'} onClick={() => setWin(w)}>{label}</button>)}
    </span>}
  </>;

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

  // Once this file is shown, quietly fetch the next shallower and deeper cut at the same speed, the files
  // someone exploring a speed column is most likely to open next.
  useEffect(() => {
    if (!cur || !cut) return;
    const same = gridHere.grid.filter(c => c[1] === cut[1]).sort((p, q) => p[2] - q[2]);
    const i = same.indexOf(cut);
    const id = setTimeout(() => prefetch(d.n, [same[i + 1], same[i - 1]].filter(Boolean).map(c => 'time' + d.n + '_' + c[0] + '.mat')), 600);
    return () => clearTimeout(id);
  }, [cur, cut]);
  const [stats, setStats] = useState(cacheStats);
  useEffect(() => { if (cur) setTimeout(() => setStats(cacheStats()), 300); }, [cur]);

  const snd = family(d).find(n => n >= 126);
  const deepest = cut && !cut[3];

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
    ctx.fillStyle = cssVar('--plot'); ctx.fillRect(0, 0, w, h);
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
  const pressed = on => ({ 'aria-pressed': on ? 'true' : 'false' });
  const sigBtn = (s, small) => (
    <button type="button" class={'sig' + (small ? ' sm' : '')} {...pressed(plotted.includes(s))} onClick={() => toggleSig(s)}>
      <span class="dot" style={{ background: 'var(' + tokenOf(s) + ')' }} />{s}
    </button>
  );
  const pct = progress && progress[1] ? Math.min(100, progress[0] / progress[1] * 100) : null;

  return (
    <div class="page tight">
      <nav class="crumb" aria-label="Breadcrumb"><a href="#/">Datasets</a> <span aria-hidden="true">/</span> <a href={'#/ds/' + d.n + '?k=' + k}>Dataset {d.n}</a> <span aria-hidden="true">/</span> {name}</nav>
      <div class="f-head">
        <div style="display:flex;align-items:center;gap:12px;flex:1 1 420px;min-width:0">
          <span class="ic"><Icon name="time" size={34} /></span>
          <div style="min-width:0">
            <h1>{name}</h1>
            <div class="num" style="font-size:14px;color:var(--muted);display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px">
              {rpm != null && <span>{fmt(rpm)} rpm · b = {+b.toFixed(3)} mm</span>}
              {stable != null && <span><strong class={stable ? 'stable-t' : 'chatter-t'}>{stable ? 'stable' : 'unstable'}</strong>{deepest ? ' (one of the two deepest cuts at this speed)' : ''}</span>}
              <GroupPill group={d.group} />
            </div>
          </div>
        </div>
        <a class="tbtn" href={'#/ds/' + d.n + '?k=' + k} style="text-decoration:none;height:40px;font-weight:700">
          <Icon name="grid" size={18} />Back to grid of cuts
        </a>
      </div>

      <div class="row">
        <main style="flex:999 1 720px;min-width:0;display:flex;flex-direction:column;gap:14px">
          <section class="card controls" aria-label="Plot controls">
            <div class="modes" role="group" aria-label="Plot mode">
              <button type="button" {...pressed(mode === 'quick')} onClick={() => setMode('quick')}>{resultant ? 'Resultant force' : 'X / Y panels'}</button>
              <button type="button" {...pressed(mode === 'custom')} onClick={() => setMode('custom')}>Custom</button>
            </div>
            {mode === 'quick' && !resultant && <>
              <div class="segpill" role="group" aria-label="Quantity">
                {[['pos', 'Displacement'], ['vel', 'Velocity'], ['acc', 'Acceleration'], ['force', 'Force']].map(([id, label]) =>
                  <button type="button" {...pressed(qty === id)} onClick={() => setQty(id)}>{label}</button>)}
              </div>
              <div class="segpill" role="group" aria-label="Body">
                {[['t', 'Tool', 'tool'], ['w', 'Workpiece', 'part']].map(([id, label, ic]) =>
                  <button type="button" {...pressed(effBody === id)} disabled={qty === 'force' && id === 'w'} title={qty === 'force' && id === 'w' ? 'Forces act on the tool' : undefined} onClick={() => setBody(id)}>
                    <Icon name={ic} size={16} />{label}</button>)}
              </div>
            </>}
            {mode === 'quick' && resultant && <span class="note" style="font-size:13px">Datasets 126–155 store only <code>timenew</code> and <code>ForceRnew</code> = √(Fx² + Fy²), over 500 revolutions.</span>}
            {mode === 'custom' && <span class="note" style="font-size:13px">Pick up to 4 signals below, or click a variable in the side panel.</span>}
            <div class="tools">
              <button type="button" class="tbtn" onClick={exportCsv} disabled={!v || !plotted.length}><Icon name="export" size={18} />Export CSV</button>
              <button type="button" class="tbtn" onClick={savePlot} disabled={!v || !plotted.length}><Icon name="save" size={18} />Save plot</button>
            </div>
          </section>

          {mode === 'custom' && (
            <section class="card" aria-label="Choose signals" style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px 28px">
              {(resultant ? [['Cutting force', ['ForceRnew']]] : [['Tool', ALL.slice(0, 6)], ['Workpiece', ALL.slice(6, 12)], ['Cutting force', ALL.slice(12)]]).map(([title, names]) => (
                <div>
                  <div class="cap" style="margin-bottom:6px">{title}</div>
                  <div class="pills">{names.map(s => sigBtn(s))}</div>
                </div>
              ))}
            </section>
          )}

          {err ? (
            <div class="err">
              {err === 'nocut'
                ? <>Dataset {d.n} has no file {k}: its files are numbered 1 to {fmt(d.files)}. <a href={'#/ds/' + d.n}>Pick one on the grid of cuts</a>.</>
                : err === 'missing'
                  ? <>This file is not available yet. Try <a href="#/file/1/34">time1_34.mat</a>, or get it from <a href={KAGGLE} target="_blank" rel="noopener">Kaggle</a>.</>
                  : <>Could not load {name}: {err}</>}
            </div>
          ) : !v ? (
            <>
              <div class="note" role="status" style="font-size:13px;padding:0 4px">
                Fetching {name}{progress ? ' · ' + (progress[0] / 1e6).toFixed(1) + (progress[1] ? ' / ' + (progress[1] / 1e6).toFixed(1) : '') + ' MB' : '…'}
                <div class="progress"><span style={{ width: (pct ?? 4) + '%' }} /></div>
              </div>
              {(plotted.length ? plotted : [0]).map(() => <SkeletonPanel />)}
            </>
          ) : plotted.length === 0 ? (
            <div class="empty" style="padding:40px">Pick a signal to plot.</div>
          ) : plotted.map(s => (
            <Panel key={s + name} name={s} t={t} raw={v[s].data} fs={fs} ftp={ftp} fmax={fmax} fn={fn} win={curWin} onWin={setWin} minSpan={minSpan} caption={caption} theme={theme} />
          ))}

          <div class="legend" style="padding:0 4px">
            <span><span class="sw" style="background:var(--fit)" />tooth passing ({rpm ? fmt(Math.round(ftp)) : '–'} Hz) and harmonics</span>
            <span><span class="sw" style="background:var(--chatter)" />other peaks (chatter)</span>
            <span><span style="width:14px;border-top:1.5px dashed var(--subtle)" />fn {fmt(fn)} Hz</span>
            <span>Spectra use the second half of the record ({Math.round(revs / 2)} revolutions), Hann window.</span>
          </div>

          <section class="card" style="padding:16px 18px">
            <h2 class="h2" style="margin-bottom:10px">Load in Python</h2>
            <pre class="code">{code}</pre>
          </section>
        </main>

        <aside class="side" aria-label="File details" style="gap:14px">
          <section class="card" style="padding:16px 18px">
            <h2 class="t">Sampling</h2>
            <dl class="kv">
              <dt>Samples (T)</dt><dd>{v ? fmt(T) : '…'}</dd>
              <dt>Sample rate</dt><dd>{v ? fmt(Math.round(fs)) + ' Hz' : '…'}</dd>
              <dt>Duration</dt><dd>{v ? dur.toFixed(3) + ' s · ' + revs + ' revs' : '…'}</dd>
              <dt>Per revolution</dt><dd>{v ? +perRev.toFixed(1) + ' samples (' + +(perRev / d.p.teeth).toFixed(1) + ' per tooth)' : '…'}</dd>
              <dt>File size</dt><dd>{cur ? fmtBytes(cur.bytes) : size ? fmtBytes(size) : '…'}</dd>
              <dt>Loaded from</dt><dd>{!cur ? '…' : cur.source === 'mirror' ? 'download · ' + (cur.ms / 1000).toFixed(1) + ' s' : cur.source === 'cache' ? 'browser cache · ' + Math.round(cur.ms) + ' ms' : 'memory'}</dd>
            </dl>
          </section>

          <section class="card" style="padding:16px 18px">
            <h2 class="t" style="margin-bottom:4px">Variables</h2>
            <p class="note" style="margin:0 0 10px">{resultant ? <><code>omega</code>, <code>b</code>, <code>timenew</code> and <code>ForceRnew</code>.</> : <><code>omega</code>, <code>b</code>, <code>time</code> and 14 signals.</>} Click one to plot it.</p>
            <div class="pills">{available.map(s => sigBtn(s, true))}</div>
          </section>

          {snd && <Sound key={snd + '_' + k} n={snd} k={k} fs={fs} rpm={rpm} />}

          <section class="card" style="padding:16px 18px">
            <h2 class="t">Source</h2>
            <p class="note" style="margin:0">Downloaded and parsed in your browser. The original is on <a href={KAGGLE} target="_blank" rel="noopener">Kaggle</a> (CC BY-ND 4.0). <a href={fileUrl(d.n, name)}>Download this file</a>.</p>
            {stats.files > 0 && (
              <p class="note" style="margin:8px 0 0">Files you open are kept in this browser so they load instantly next time: {stats.files} {stats.files === 1 ? 'file' : 'files'}, {fmtBytes(stats.bytes)} (up to 300 MB). <button type="button" class="linkbtn" style="height:auto;padding:0;font-size:12px" onClick={async () => { await clearCache(); setStats(cacheStats()); }}>Clear</button></p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
