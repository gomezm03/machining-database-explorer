import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { FACETS, GROUPS, GroupPill, describe, subtitle, haystack, fmt, kfmt, pitchOf, immersionOf, dirOf } from './data.js';

const GROUP_BYS = [['group', 'Dataset group'], ['dyn', 'Dynamics'], ['force', 'Force model'], ['tool', 'Tool'], ['cut', 'Cut']];

function sectionKey(d, by) {
  const m = d.p.modes[0];
  if (by === 'group') return GROUPS[d.group].label;
  if (by === 'tool') return d.p.teeth + '-tooth end mill · ' + pitchOf(d) + ' pitch';
  if (by === 'dyn') return (d.p.modes.length > 1 ? d.p.modes.length + ' modes' : '1 mode') + ' · fn ' + fmt(m.fntx) + ' Hz';
  if (by === 'force') return (d.p.cn > 0 ? 'With process damping' : 'No process damping') + ' · ktc ' + fmt(d.p.ktc / 1e6);
  if (by === 'cut') return immersionOf(d) + '% immersion · ' + dirOf(d) + ' milling';
  return 'All';
}

// Card lobe in a 300×108 box: plot area x 34..292, y 8..86 (same geometry as the design).
function lobeGeom(d) {
  const b = d.lobe, om = d.lobeOm;
  const max = Math.max(...b);
  const step = max > 20 ? 10 : max > 8 ? 5 : 2;
  const top = Math.ceil(max / step) * step;
  const [o0, o1] = d.om;
  const path = 'M' + b.map((v, i) => (34 + (om[i] - o0) / (o1 - o0) * 258).toFixed(1) + ',' + (86 - v / top * 78).toFixed(1)).join(' L');
  return { path, top, max: max.toFixed(1), min: Math.min(...b).toFixed(2) };
}

const AXIS_TEXT = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '10px', fill: 'var(--muted)' };

function DatasetCard({ d }) {
  const lb = useMemo(() => lobeGeom(d), [d]);
  const t = describe(d);
  const speeds = fmt(d.om[0]) + '–' + fmt(d.om[1]) + ' rpm';
  return (
    <a class="ds" href={'#/ds/' + d.n} aria-label={'Open dataset ' + d.n}>
      <div class="ds-h">
        <span class="ds-n">Dataset {d.n}</span>
        <GroupPill group={d.group} />
        {d.wav > 0 && <span title="Has .wav sound" style="margin-left:auto;display:flex"><Icon name="sound" size={18} color="var(--subtle)" label="Has sound" /></span>}
      </div>
      <div class="ds-sub">{subtitle(d)}</div>
      <svg class="lobe" width="100%" viewBox="0 0 300 108" role="img" aria-label={'Stability lobes of dataset ' + d.n + ': ' + speeds + ', limiting depth ' + lb.min + '–' + lb.max + ' mm'}>
        <rect x="34" y="8" width="258" height="78" style={{ fill: 'var(--chatter-fill)' }} />
        <path d={lb.path + ' L292,86 L34,86 Z'} style={{ fill: 'var(--stable-fill)' }} />
        <path d={lb.path} fill="none" stroke-width="1.5" stroke-linejoin="round" style={{ stroke: 'var(--fit)' }} />
        <path d="M34 8V86H292" fill="none" stroke-width="1" style={{ stroke: 'var(--subtle)' }} />
        <g style={AXIS_TEXT}>
          <text x="30" y="12" text-anchor="end">{lb.top}</text>
          <text x="30" y="89" text-anchor="end">0</text>
          <text x="12" y="50" text-anchor="middle" transform="rotate(-90 12 50)">b mm</text>
          <text x="34" y="100">{kfmt(d.om[0])}</text>
          <text x="292" y="100" text-anchor="end">{kfmt(d.om[1])} rpm</text>
        </g>
      </svg>
      <div class="facts">
        <Icon name="dynamics" size={18} label="Dynamics" /><span>{t.dyn}</span>
        <Icon name="force" size={18} label="Force model" /><span>{t.force}</span>
        <Icon name="tool" size={18} label="Tool" /><span>{t.tool}</span>
        <Icon name="cut" size={18} label="Cut" /><span>{t.cut}</span>
      </div>
      <div class="ds-f">
        <span><strong class="num">{fmt(d.files)}</strong> cut files</span>
        <span class="open">Open grid →</span>
      </div>
    </a>
  );
}

export function Explorer({ index, state, setState }) {
  const { sel, groupBy, q } = state;
  const all = index.datasets;
  const [filtersOpen, setFiltersOpen] = useState(false);  // phones only; always shown from 900 px up
  // Below 900 px the open filters cover the screen, so the page behind must not scroll.
  useEffect(() => {
    if (!filtersOpen || !matchMedia('(max-width: 899px)').matches) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [filtersOpen]);

  const counts = useMemo(() => {
    const c = {};
    all.forEach(d => Object.entries(d.facets).forEach(([k, ids]) => ids.forEach(id => { c[k + ':' + id] = (c[k + ':' + id] || 0) + 1; })));
    return c;
  }, [all]);
  const hay = useMemo(() => new Map(all.map(d => [d.n, haystack(d)])), [all]);

  const toggle = (key, id) => {
    const s = { ...sel };
    const k = key + ':' + id;
    if (s[k]) delete s[k]; else s[k] = true;
    setState({ sel: s });
  };

  // OR within a facet, AND across facets; comma-separated search terms must all match.
  const terms = q.trim().toLowerCase().split(/\s*,\s*|\s{2,}/).filter(Boolean);
  const hits = all.filter(d => FACETS.every(f => {
    const act = f.options.filter(([id]) => sel[f.key + ':' + id]);
    return act.length === 0 || act.some(([id]) => d.facets[f.key].includes(id));
  }) && terms.every(t => /^\d+$/.test(t) ? d.n === +t : hay.get(d.n).includes(t)));

  const order = [], groups = {};
  hits.forEach(d => {
    const k = sectionKey(d, groupBy);
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(d);
  });

  const chips = [];
  FACETS.forEach(f => f.options.forEach(([id, label]) => { if (sel[f.key + ':' + id]) chips.push({ key: f.key, id, label }); }));
  const nSel = chips.length;
  const groupDot = label => Object.values(GROUPS).find(g => g.label === label)?.dot;

  return (
    <div class="page">
      <div class="toolbar">
        <label for="q" class="sr">Search datasets</label>
        <div class="search">
          <Icon name="search" size={20} />
          <input id="q" type="search" value={q} onInput={e => setState({ q: e.currentTarget.value })}
            placeholder={matchMedia('(max-width: 640px)').matches ? 'e.g. 25, 2 teeth, damping' : 'Search by dataset number, tool, dynamics… e.g. 25, 2 teeth, process damping'} />
        </div>
        <button type="button" class="filters-toggle" aria-expanded={filtersOpen ? 'true' : 'false'} aria-controls="filters" onClick={() => setFiltersOpen(o => !o)}>
          <Icon name="settings" size={18} />{filtersOpen ? 'Hide filters' : 'Filters'}
          {nSel > 0 && <span class="badge">{nSel}</span>}
        </button>
        <div class="seg" role="group" aria-label="Classify by">
          <span class="seg-l">Classify by</span>
          {GROUP_BYS.map(([id, label]) => (
            <button type="button" aria-pressed={groupBy === id ? 'true' : 'false'} onClick={() => setState({ groupBy: id })}>{label}</button>
          ))}
        </div>
      </div>

      <div class="row">
        <aside id="filters" class={'card filters' + (filtersOpen ? '' : ' collapsed')} aria-label="Filters">
          <div class="filters-h">
            <h2><Icon name="settings" size={18} color="var(--accent)" />Filters</h2>
            <span class="note">counts across all {all.length}</span>
            <button type="button" class="sheet-x" aria-label="Close filters" onClick={() => setFiltersOpen(false)}><Icon name="close" size={20} stroke={2.2} /></button>
          </div>
          {FACETS.map(f => (
            <section class="facet">
              <h3><Icon name={f.icon} size={20} />{f.title}</h3>
              {f.options.map(([id, label]) => {
                const on = !!sel[f.key + ':' + id];
                return (
                  <button type="button" class="opt" aria-pressed={on ? 'true' : 'false'} onClick={() => toggle(f.key, id)}>
                    <span class="box">{on && <Icon name="check" size={12} stroke={3.5} />}</span>
                    {f.key === 'group' && <span class="dot" style={{ background: GROUPS[id].dot }} />}
                    <span style="flex:1">{label}</span>
                    <span class="n">{counts[f.key + ':' + id] || 0}</span>
                  </button>
                );
              })}
            </section>
          ))}
          <div class="sheet-f">
            {nSel > 0 && <button type="button" class="tbtn" style="height:46px" onClick={() => setState({ sel: {} })}>Clear</button>}
            <button type="button" class="btn" style="flex:1;justify-content:center;height:46px" onClick={() => setFiltersOpen(false)}>
              Show {hits.length} {hits.length === 1 ? 'dataset' : 'datasets'}
            </button>
          </div>
        </aside>

        <main class="results">
          <div class="chips">
            <span><strong class="num">{hits.length}</strong> {hits.length === 1 ? 'dataset' : 'datasets'}</span>
            {chips.map(c => (
              <button type="button" class="chip" aria-label={'Remove filter ' + c.label} onClick={() => toggle(c.key, c.id)}>
                {c.label}<Icon name="close" size={14} stroke={2.4} />
              </button>
            ))}
            {(nSel > 0 || q) && <button type="button" class="linkbtn" onClick={() => setState({ sel: {}, q: '' })}>Clear all</button>}
          </div>
          {hits.length === 0 && (
            <div class="empty">
              No datasets match {q && nSel ? 'this search and these filters' : q ? 'this search' : 'these filters'}.
              <div style="margin-top:14px"><button type="button" class="tbtn" onClick={() => setState({ sel: {}, q: '' })}>Clear search and filters</button></div>
            </div>
          )}
          {order.map(k => (
            <section class="sec">
              <h2>{groupBy === 'group' && <span class="dot" style={{ background: groupDot(k) }} />}{k} <span class="c">{groups[k].length + (groups[k].length === 1 ? ' dataset' : ' datasets')}</span></h2>
              <div class="cards">{groups[k].map(d => <DatasetCard key={d.n} d={d} />)}</div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
