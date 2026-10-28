// Index loading, Hugging Face URLs, facet definitions and label formatting shared by the screens.

export const MIRROR = 'https://huggingface.co/datasets/gomezmfg/digital-machining-database';
export const KAGGLE = 'https://www.kaggle.com/datasets/tonylschmitz/digital-machining-database';

const cache = {};
const json = url => (cache[url] ||= fetch(url).then(r => {
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  return r.json();
}));

export const loadIndex = () => json('data/index.json');
export const loadDataset = n => json('data/ds/' + n + '.json');

export const repoPath = (n, name) => {
  const folder = name.endsWith('.wav') ? 'Dataset ' + n + ' wav' : 'Dataset ' + n + ' mat';
  return 'data/' + folder + '/' + name;
};
export const fileUrl = (n, name) => MIRROR + '/resolve/main/' + repoPath(n, name).split('/').map(encodeURIComponent).join('/');

export const GROUPS = {
  unique: { label: 'Unique', bg: '#E3EDF9', fg: '#0057B8', dot: '#0057B8' },
  noise1: { label: '1% noise', bg: '#DDF2FA', fg: '#00618A', dot: '#00A3E0' },
  noise5: { label: '5% noise', bg: '#FCE8DD', fg: '#A8431A', dot: '#E0662E' },
  varpitch: { label: 'Variable pitch', bg: '#E2E6F0', fg: '#012169', dot: '#012169' },
  sound: { label: 'Sound', bg: '#ECECEC', fg: '#4D4D4D', dot: '#959595' },
};

// Filter ids match the facet keys written by scripts/build_index.py.
export const FACETS = [
  { key: 'group', title: 'Dataset group', icon: 'group', options: [
    ['unique', 'Unique conditions · 1–60'], ['noise1', '1% noise · 61–90'], ['noise5', '5% noise · 91–120'],
    ['varpitch', 'Variable pitch · 121–125'], ['sound', 'Sound · 126–155']] },
  { key: 'dyn', title: 'Structural dynamics', icon: 'dynamics', options: [
    ['fn500', 'fn 500 Hz'], ['fn1000', 'fn 1,000 Hz'], ['fn1500', 'fn 1,500 Hz'], ['fnother', 'fn other (600–2,000 Hz)'],
    ['multi', '2–3 modes'], ['xy', 'x ≠ y dynamics']] },
  { key: 'force', title: 'Force model', icon: 'force', options: [
    ['ktc700', 'ktc 700 N/mm²'], ['ktc2000', 'ktc 2,000 N/mm²'], ['edge', 'Edge coefficients'], ['cn', 'Process damping (Cn > 0)']] },
  { key: 'tool', title: 'Tool', icon: 'tool', options: [
    ['t2', '2 teeth'], ['t3', '3 teeth'], ['t4', '4 teeth'], ['t5', '5 teeth'], ['h45', 'Helix 38–45°'],
    ['varp', 'Variable pitch'], ['runout', 'Runout'], ['d19', 'Ø 19.05 mm']] },
  { key: 'cut', title: 'Cut', icon: 'cut', options: [
    ['i10', '10% immersion'], ['i25', '25% immersion'], ['i50', '50% immersion'], ['up', 'Up milling'], ['f02', 'Feed 0.2 mm/tooth']] },
  { key: 'sig', title: 'Signals', icon: 'measure', options: [['wav', 'Has .wav sound'], ['noisy', 'Noisy signals']] },
];

export const fmt = v => v.toLocaleString('en-US');
export const kfmt = v => (v / 1000) + 'k';
const num = v => String(+v.toPrecision(4));

export const pitchOf = d => d.facets.tool.includes('varp') ? 'variable' : 'uniform';
export const immersionOf = d => Math.round(d.p.a / d.p.d * 100);
export const dirOf = d => d.p.ud === 1 ? 'up' : 'down';
export const helixOf = d => Math.max(...d.p.beta);

export const fmtCn = c => c > 0 ? 'Cn ' + num(c / 1e5) + '×10⁵ N/m' : 'no process damping';

export function describe(d) {
  const m = d.p.modes[0];
  const nm = d.p.modes.length;
  return {
    dyn: fmt(m.fntx) + ' Hz · ' + num(m.ktx / 1e6) + ' N/µm · ζ ' + m.zetatx + ' · ' + nm + (nm > 1 ? ' modes' : ' mode'),
    force: 'ktc ' + fmt(d.p.ktc / 1e6) + ' N/mm² · ' + fmtCn(d.p.cn),
    tool: d.p.teeth + ' teeth · ' + helixOf(d) + '° helix · ' + pitchOf(d) + ' pitch',
    cut: immersionOf(d) + '% immersion · ' + dirOf(d) + ' milling · ' + num(d.p.ft * 1000) + ' mm/tooth',
  };
}

export function subtitle(d) {
  if (d.group === 'varpitch') return 'Tooth angles ' + d.p.angles.join(' / ') + '°, 5% noise';
  if (d.base) return 'Same inputs as dataset ' + d.base;
  return 'Unique input set';
}

/** Datasets that share this one's inputs (and so its grid and K numbering). */
export function family(d) {
  const b = d.base || d.n;
  if (b > 30) return [d.n];
  return [b, b + 60, b + 90, b + 125];
}

export const VARIANT = {
  unique: { desc: 'clean · 60 revs · 14 signals', color: '#0057B8' },
  noise1: { desc: '1% noise · same cut', color: '#00A3E0' },
  noise5: { desc: '5% noise · same cut', color: '#E0662E' },
  varpitch: { desc: 'variable pitch · 5% noise', color: '#012169' },
  sound: { desc: 'resultant force only · 500 revs', color: '#959595' },
};

/** Searchable text, same terms the design's search box hints at. */
export function haystack(d) {
  return ['dataset ' + d.n, String(d.n), GROUPS[d.group].label, d.p.teeth + ' teeth', pitchOf(d) + ' pitch',
    d.p.cn > 0 ? 'process damping' : '', d.p.modes.length + ' mode', d.wav ? 'sound wav' : '', dirOf(d) + ' milling',
    fmt(d.p.modes[0].fntx) + ' hz', d.p.modes[0].fntx + ' hz', immersionOf(d) + '% immersion', helixOf(d) + '° helix',
    d.p.noise ? d.p.noise + '% noise' : ''].join(' | ').toLowerCase();
}
