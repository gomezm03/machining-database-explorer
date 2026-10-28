import { useMemo } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { FACETS, GROUPS, describe, subtitle, haystack, fmt, kfmt, pitchOf, immersionOf, dirOf } from './data.js';

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

function DatasetCard({ d }) {
  const g = GROUPS[d.group];
  const lb = useMemo(() => lobeGeom(d), [d]);
  const t = describe(d);
  const speeds = fmt(d.om[0]) + '–' + fmt(d.om[1]) + ' rpm';
  return (
    <a class="ds" href={'#/ds/' + d.n} aria-label={'Open dataset ' + d.n}>
      <div class="ds-h">
        <span class="ds-n">Dataset {d.n}</span>
        <span class="pill" style={{ background: g.bg, color: g.fg }}>{g.label}</span>
        {d.wav > 0 && <span title="Has .wav sound" style="margin-left:auto;display:flex"><Icon name="sound" size={18} color="#4A5468" label="Has sound" /></span>}
      </div>
      <div class="ds-sub">{subtitle(d)}</div>
      <svg class="lobe" width="100%" viewBox="0 0 300 108" role="img" aria-label={'Stability lobes of dataset ' + d.n + ': ' + speeds + ', limiting depth ' + lb.min + '–' + lb.max + ' mm'}>
        <rect x="34" y="8" width="258" height="78" fill="#FCEFE8" />
        <path d={lb.path + ' L292,86 L34,86 Z'} fill="#E3EDF9" />
        <path d={lb.path} fill="none" stroke="#012169" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M34 8V86H292" fill="none" stroke="#8C96A8" stroke-width="1" />
        <g font-family="Arial, Helvetica, sans-serif" font-size="10" fill="#4A5468">
          <text x="30" y="12" text-anchor="end">{lb.top}</text>
          <text x="30" y="89" text-anchor="end">0</text>
          <text x="12" y="50" text-anchor="middle" transform="rotate(-90 12 50)">b mm</text>
          <text x="34" y="100">{kfmt(d.om[0])}</text>
          <text x="292" y="100" text-anchor="end">{kfmt(d.om[1])} rpm</text>
        </g>
      </svg>
      <div class="facts">
        <Icon name="dynamics" size={18} color="#0057B8" label="Dynamics" /><span>{t.dyn}</span>
        <Icon name="force" size={18} color="#0057B8" label="Force model" /><span>{t.force}</span>
        <Icon name="tool" size={18} color="#0057B8" label="Tool" /><span>{t.tool}</span>
        <Icon name="cut" size={18} color="#0057B8" label="Cut" /><span>{t.cut}</span>
      </div>
      <div class="ds-f">
        <span style="color:#4A5468"><strong style="color:#1B2433">{fmt(d.files)}</strong> cut files</span>
        <span class="open">Open grid →</span>
      </div>
    </a>
  );
}

export function Explorer({ index, state, setState }) {
  const { sel, groupBy, q } = state;
  const all = index.datasets;

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

  // OR within a facet, AND across facets; search terms must all appear.
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

  return (
    <div class="page">
      <div class="toolbar">
        <label for="q" class="sr">Search datasets</label>
        <div class="search">
          <Icon name="search" size={20} color="#4A5468" />
          <input id="q" type="search" value={q} onInput={e => setState({ q: e.currentTarget.value })}
            placeholder="Search by dataset number, tool, dynamics… e.g. 25, 2 teeth, process damping" />
        </div>
        <div class="seg" role="group" aria-label="Classify by">
          <span class="seg-l">Classify by</span>
          {GROUP_BYS.map(([id, label]) => (
            <button type="button" aria-pressed={groupBy === id ? 'true' : 'false'} onClick={() => setState({ groupBy: id })}>{label}</button>
          ))}
        </div>
      </div>

      <div class="row">
        <aside class="card filters" aria-label="Filters">
          <div class="filters-h">
            <h2><Icon name="settings" size={18} color="#012169" />Filters</h2>
            <span class="note">counts across all {all.length}</span>
          </div>
          {FACETS.map(f => (
            <section class="facet">
              <h3><Icon name={f.icon} size={20} color="#0057B8" />{f.title}</h3>
              {f.options.map(([id, label]) => {
                const on = !!sel[f.key + ':' + id];
                return (
                  <button type="button" class="opt" aria-pressed={on ? 'true' : 'false'} onClick={() => toggle(f.key, id)}>
                    <span class="box">{on && <Icon name="check" size={12} color="#FFFFFF" stroke={3.5} />}</span>
                    {f.key === 'group' && <span class="dot" style={{ background: GROUPS[id].dot }} />}
                    <span style="flex:1">{label}</span>
                    <span class="n">{counts[f.key + ':' + id] || 0}</span>
                  </button>
                );
              })}
            </section>
          ))}
        </aside>

        <main class="results">
          <div class="chips">
            <span><strong>{hits.length}</strong> datasets</span>
            {chips.map(c => (
              <button type="button" class="chip" aria-label={'Remove filter ' + c.label} onClick={() => toggle(c.key, c.id)}>
                {c.label}<Icon name="close" size={14} color="#012169" stroke={2.4} />
              </button>
            ))}
            {(chips.length > 0 || q) && <button type="button" class="linkbtn" onClick={() => setState({ sel: {}, q: '' })}>Clear all</button>}
          </div>
          {hits.length === 0 && <div class="empty">No datasets match these filters.</div>}
          {order.map(k => (
            <section class="sec">
              <h2>{k} <span>{groups[k].length + (groups[k].length === 1 ? ' dataset' : ' datasets')}</span></h2>
              <div class="cards">{groups[k].map(d => <DatasetCard key={d.n} d={d} />)}</div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
