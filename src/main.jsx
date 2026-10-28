import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { loadIndex, fmt } from './data.js';
import { THEMES, applyTheme, savedTheme } from './themes.js';
import { Explorer } from './Explorer.jsx';
import { DatasetView } from './DatasetView.jsx';
import { FileView } from './FileView.jsx';
import './styles.css';

applyTheme(savedTheme());  // before the first render, so there is no flash of the default colours

// Hash routes keep the site static: #/  ·  #/ds/1?k=34  ·  #/file/1/34
function parseRoute() {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query || '');
  if (parts[0] === 'ds' && parts[1]) return { page: 'ds', n: +parts[1], k: q.get('k') ? +q.get('k') : null };
  if (parts[0] === 'file' && parts[1] && parts[2]) return { page: 'file', n: +parts[1], k: +parts[2] };
  return { page: 'home' };
}

function ThemePicker({ theme, setTheme }) {
  const t = THEMES.find(x => x.id === theme);
  return (
    <label class="theme" title={t?.description}>
      <span class="sr">Colour theme</span>
      <span class="ic"><Icon name="palette" size={16} /></span>
      <select value={theme} onChange={e => setTheme(e.currentTarget.value)}>
        {THEMES.map(x => <option value={x.id}>{x.name}</option>)}
      </select>
      <span class="chev"><Icon name="chevron" size={14} stroke={2} /></span>
    </label>
  );
}

function Header({ route, index, last, theme, setTheme }) {
  const t = index?.totals;
  return (
    <header class="hdr">
      <div class="hdr-in">
        <a class="brand" href="#/">
          <div>
            <div class="brand-t">Machining Database Explorer</div>
            <div class="brand-s">Digital Machining Database · Kaggle v17</div>
          </div>
        </a>
        <nav class="nav" aria-label="Main">
          <a href="#/" aria-current={route.page === 'home' ? 'page' : undefined}>Datasets</a>
          <a href={'#/ds/' + last.n + '?k=' + last.k} aria-current={route.page === 'ds' ? 'page' : undefined}>Grid of cuts</a>
          <a href={'#/file/' + last.n + '/' + last.k} aria-current={route.page === 'file' ? 'page' : undefined}>Files</a>
        </nav>
        <div class="hdr-r">
          {t && route.page === 'home' && (
            <div class="stats num">
              <span><strong>{t.datasets}</strong> datasets</span>
              <span><strong>{fmt(t.cuts)}</strong> cuts</span>
              <span><strong>{fmt(t.wav)}</strong> sound files</span>
              <span><strong>60.4 GB</strong> of data</span>
            </div>
          )}
          <ThemePicker theme={theme} setTheme={setTheme} />
        </div>
      </div>
    </header>
  );
}

function App() {
  const [route, setRoute] = useState(parseRoute);
  const [index, setIndex] = useState(null);
  const [error, setError] = useState(null);
  const [explorer, setExplorer] = useState({ sel: {}, groupBy: 'group', q: '' });
  const [last, setLast] = useState({ n: 1, k: 34 });
  const [theme, setThemeState] = useState(savedTheme);
  const setTheme = id => { applyTheme(id); setThemeState(id); };

  useEffect(() => {
    // Scroll to the top only when the screen or dataset changes, not when a cut is picked.
    let prev = parseRoute();
    const on = () => {
      const r = parseRoute();
      if (r.page !== prev.page || r.n !== prev.n) window.scrollTo(0, 0);
      prev = r;
      setRoute(r);
    };
    addEventListener('hashchange', on);
    loadIndex().then(setIndex, e => setError(e.message));
    return () => removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (route.page === 'file') setLast({ n: route.n, k: route.k });
    else if (route.page === 'ds') setLast(l => ({ n: route.n, k: route.k || (l.n === route.n ? l.k : 1) }));
    const titles = { home: 'Datasets', ds: 'Dataset ' + route.n, file: 'time' + route.n + '_' + route.k + '.mat' };
    document.title = titles[route.page] + ' · Machining Database Explorer';
  }, [route]);

  const ds = index && route.n ? index.datasets.find(d => d.n === route.n) : null;
  let body;
  if (error) body = <div class="page"><div class="err">Could not load the index: {error}</div></div>;
  else if (!index) body = <div class="loading"><span class="spin" />Loading index…</div>;
  else if (route.page === 'ds' && ds) body = <DatasetView index={index} d={ds} k={route.k} />;
  else if (route.page === 'file' && ds) body = <FileView index={index} d={ds} k={route.k} theme={theme} />;
  else if (route.page !== 'home') body = <div class="page"><div class="err">Dataset {route.n} does not exist. <a href="#/">Back to datasets</a></div></div>;
  else body = <Explorer index={index} state={explorer} setState={s => setExplorer(o => ({ ...o, ...s }))} />;

  return <><Header route={route} index={index} last={last} theme={theme} setTheme={setTheme} />{body}</>;
}

render(<App />, document.getElementById('app'));
