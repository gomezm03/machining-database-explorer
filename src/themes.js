// Colour themes, ported from the Tap Test app (Tap Testing/taptest/ui/colors.py) plus the Explorer's own
// default. Each theme is a small set: neutrals, one accent, an x/y data pair, the stability colours and
// five overlay colours for the dataset groups. Everything else is derived, so screens never pick hues.

const LIGHT_WARN = { warnText: '#8A4B00', warnBg: '#FFF4D6', warnBorder: '#F2B230' };
const DARK_WARN = { warnText: '#F5C26B', warnBg: '#3A2F1A', warnBorder: '#8A6A2A' };

export const THEMES = [
  { id: 'explorer', name: 'Explorer', description: 'Navy and blue from the database talk. The default.', dark: false,
    chrome: '#012169', window: '#F3F5F9', surface: '#FFFFFF', plot: '#F8FAFD', text: '#1B2433', muted: '#4A5468', subtle: '#8C96A8', border: '#DDE3EE',
    accent: '#0057B8', x: '#0057B8', y: '#1496A8', fit: '#012169', unstable: '#E0662E', unstableAlpha: 0.13, ...LIGHT_WARN,
    overlays: ['#0057B8', '#00A3E0', '#E0662E', '#012169', '#959595'] },
  { id: 'resonance', name: 'Resonance', description: 'Cool light greys with Resonance Teal, the colour of the app icons.', dark: false,
    window: '#F4F6F7', surface: '#FFFFFF', plot: '#FFFFFF', text: '#1A1D21', muted: '#5C6670', subtle: '#9AA3AB', border: '#D3D9DE',
    accent: '#1496A8', x: '#0E7C8C', y: '#E0692B', fit: '#1A1D21', unstable: '#D64545', unstableAlpha: 72 / 255, ...LIGHT_WARN,
    overlays: ['#0E7C8C', '#5B6CC2', '#E0692B', '#B0479A', '#6B7580'] },
  { id: 'resonance-dark', name: 'Resonance dark', description: 'The Resonance colours on a dark window and dark plots.', dark: true,
    chrome: '#0B0E10', window: '#111417', surface: '#1A1F24', plot: '#14181C', text: '#E7EAED', muted: '#96A0AA', subtle: '#5E6872', border: '#2F363E',
    accent: '#30A3B2', x: '#3FBACB', y: '#FF9A5C', fit: '#F0F2F4', unstable: '#FF5C5C', unstableAlpha: 80 / 255, ...DARK_WARN,
    overlays: ['#3FBACB', '#8C9BFF', '#FF9A5C', '#E58AD6', '#8B949D'] },
  { id: 'slate', name: 'Slate', description: 'Calm neutral greys with a blue accent.', dark: false,
    window: '#F1F3F5', surface: '#FFFFFF', plot: '#FFFFFF', text: '#1F2937', muted: '#4B5563', subtle: '#9CA3AF', border: '#D1D5DB',
    accent: '#2563EB', x: '#1D4ED8', y: '#EA580C', fit: '#111827', unstable: '#DC2626', unstableAlpha: 72 / 255, ...LIGHT_WARN,
    overlays: ['#1D4ED8', '#0891B2', '#EA580C', '#7C3AED', '#6B7280'] },
  { id: 'matlab', name: 'MATLAB classic', description: "MATLAB's default colours, as in the original app.", dark: false,
    window: '#F0F0F0', surface: '#FFFFFF', plot: '#FFFFFF', text: '#000000', muted: '#505050', subtle: '#A0A0A0', border: '#C8C8C8',
    accent: '#0072BD', x: '#0072BD', y: '#D95319', fit: '#000000', unstable: '#FF0000', unstableAlpha: 60 / 255, ...LIGHT_WARN,
    overlays: ['#0072BD', '#4DBEEE', '#D95319', '#7E2F8E', '#808080'] },
  { id: 'nord', name: 'Nord', description: 'Soft, low-glare blue-greys (the Nord palette).', dark: false,
    window: '#E5E9F0', surface: '#F8F9FB', plot: '#FBFCFD', text: '#2E3440', muted: '#4C566A', subtle: '#8C97AB', border: '#D0D6E1',
    accent: '#5E81AC', x: '#5E81AC', y: '#BF616A', fit: '#2E3440', unstable: '#BF616A', unstableAlpha: 95 / 255,
    warnText: '#7A5A14', warnBg: '#FBF3DC', warnBorder: '#EBCB8B',
    overlays: ['#5E81AC', '#88C0D0', '#D08770', '#B48EAD', '#4C566A'] },
  { id: 'cb-safe', name: 'Colour-blind safe', description: 'Okabe–Ito colours, distinguishable with every common colour vision deficiency.', dark: false,
    window: '#F6F8FA', surface: '#FFFFFF', plot: '#FFFFFF', text: '#1F2328', muted: '#57606A', subtle: '#8C959F', border: '#D0D7DE',
    accent: '#0072B2', x: '#0072B2', y: '#D55E00', fit: '#1F2328', unstable: '#D55E00', unstableAlpha: 90 / 255, ...LIGHT_WARN,
    overlays: ['#0072B2', '#56B4E9', '#D55E00', '#CC79A7', '#57606A'] },
  { id: 'graphite', name: 'Graphite (dark)', description: 'Dark window and plots, for dark rooms.', dark: true,
    chrome: '#141517', window: '#1E1F22', surface: '#2B2D30', plot: '#1B1C1F', text: '#DFE1E5', muted: '#A8ADB4', subtle: '#6F737A', border: '#3C3F44',
    accent: '#4FA3FF', x: '#4FA3FF', y: '#FF8F5A', fit: '#F2F2F2', unstable: '#FF5C5C', unstableAlpha: 80 / 255, ...DARK_WARN,
    overlays: ['#4FA3FF', '#7FDBFF', '#FF8F5A', '#C792EA', '#8B9097'] },
  { id: 'high-contrast', name: 'High contrast', description: 'Black on white, saturated colours, heavier lines.', dark: false,
    chrome: '#000000', window: '#FFFFFF', surface: '#FFFFFF', plot: '#FFFFFF', text: '#000000', muted: '#202020', subtle: '#5A5A5A', border: '#000000',
    accent: '#0000CC', x: '#0000CC', y: '#CC0000', fit: '#000000', unstable: '#CC0000', unstableAlpha: 110 / 255,
    warnText: '#000000', warnBg: '#FFE066', warnBorder: '#000000', lineWidth: 2.4,
    overlays: ['#0000CC', '#008B8B', '#CC0000', '#8000A0', '#404040'] },
  { id: 'print', name: 'Print (grayscale)', description: 'Greys only, for black-and-white printing and reports.', dark: false,
    chrome: '#262626', window: '#F2F2F2', surface: '#FFFFFF', plot: '#FFFFFF', text: '#111111', muted: '#4D4D4D', subtle: '#999999', border: '#CCCCCC',
    accent: '#404040', x: '#000000', y: '#7A7A7A', fit: '#000000', unstable: '#000000', unstableAlpha: 60 / 255,
    warnText: '#333333', warnBg: '#EDEDED', warnBorder: '#999999',
    overlays: ['#000000', '#555555', '#7A7A7A', '#222222', '#AAAAAA'] },
];

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
/** `a` moved a fraction `t` of the way toward `b` (Tap Test's mix). */
export const mix = (a, b, t) => { const p = hex(a), q = hex(b); return toHex(p.map((v, i) => v + (q[i] - v) * t)); };

const lum = c => hex(c).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** `fg` moved toward black (or white on dark backgrounds) just far enough to reach `target` contrast on `bg`. */
function readable(fg, bg, target = 4.5) {
  const to = lum(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0; t <= 1; t += 0.02) { const c = mix(fg, to, t); if (contrast(c, bg) >= target) return c; }
  return to;
}

/** Every CSS custom property the screens use, from one theme. */
export function tokens(t) {
  const strong = mix(t.accent, '#000000', 0.22);  // filled buttons: the accent darkened so white text reads
  const chrome = t.chrome || strong;
  return {
    '--chrome': chrome,
    '--chrome-fg': '#FFFFFF',
    '--chrome-muted': readable(mix(chrome, '#FFFFFF', 0.72), chrome),
    // Accent used as text (links, labels) keeps the hue but is darkened until it reads at 4.5:1.
    '--link': readable(t.accent, t.surface),
    '--bg': t.window, '--surface': t.surface, '--plot': t.plot,
    '--panel': mix(t.surface, t.text, t.dark ? 0.05 : 0.025),
    '--ink': t.text, '--muted': t.muted, '--subtle': t.subtle,
    '--line': t.border, '--line2': mix(t.border, t.surface, 0.5), '--field': mix(t.border, t.text, 0.12),
    '--grid': mix(t.plot, t.text, t.dark ? 0.12 : 0.07),
    '--accent': t.accent, '--accent-strong': t.dark ? t.accent : strong,
    '--on-accent': t.dark ? '#0B0E10' : '#FFFFFF',
    '--tint': mix(t.surface, t.accent, t.dark ? 0.22 : 0.1),
    '--tint-line': mix(t.surface, t.accent, t.dark ? 0.45 : 0.35),
    '--x': t.x, '--y': t.y, '--fit': t.fit,
    '--stable-fill': mix(t.plot, t.accent, t.dark ? 0.16 : 0.1),
    '--chatter': t.unstable,
    '--chatter-fill': mix(t.plot, t.unstable, t.unstableAlpha * (t.dark ? 0.28 : 0.55)),
    '--chatter-text': readable(t.dark ? mix(t.unstable, '#FFFFFF', 0.25) : mix(t.unstable, '#000000', 0.25), t.surface),
    '--muted-r': readable(t.muted, t.window),
    '--code-bg': t.dark ? mix(t.window, '#000000', 0.3) : mix(t.text, '#000000', 0.25),
    '--code-fg': '#E6ECF8',
    '--warn-text': t.warnText, '--warn-bg': t.warnBg, '--warn-border': t.warnBorder,
    '--g-unique': t.overlays[0], '--g-noise1': t.overlays[1], '--g-noise5': t.overlays[2], '--g-varpitch': t.overlays[3], '--g-sound': t.overlays[4],
    '--lw': String(t.lineWidth || 1.6),
  };
}

const KEY = 'mde-theme';
export function savedTheme() {
  try { return localStorage.getItem(KEY) || 'explorer'; } catch { return 'explorer'; }
}
export function applyTheme(id) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const root = document.documentElement;
  Object.entries(tokens(t)).forEach(([k, v]) => root.style.setProperty(k, v));
  root.style.colorScheme = t.dark ? 'dark' : 'light';
  try { localStorage.setItem(KEY, t.id); } catch { /* private mode: theme lasts this visit only */ }
  return t;
}

/** Resolved colour of a token, for canvas drawing (uPlot). */
export const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
