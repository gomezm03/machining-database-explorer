// Persistent cache for files fetched from the Hugging Face mirror.
//
// The mirror answers each file request with a signed, `no-store` redirect that changes every time, so the
// browser's HTTP cache never reuses a download. Files in the database never change, so we keep them in
// Cache Storage (on disk, per browser) keyed by their stable mirror URL, capped at CAP bytes and evicting
// the least recently used. Everything degrades to plain fetches where Cache Storage is unavailable.

import { fileUrl } from './data.js';

const CACHE = 'mde-files-v1', META = 'mde-files-meta', CAP = 300e6;
const inflight = new Map();

const hasCache = () => typeof caches !== 'undefined';
function meta() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } }
function saveMeta(m) { try { localStorage.setItem(META, JSON.stringify(m)); } catch { /* storage full or blocked */ } }

async function remember(url, buf) {
  if (!hasCache()) return;
  try {
    const c = await caches.open(CACHE);
    await c.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(buf.byteLength) } }));
    const m = meta();
    m[url] = { b: buf.byteLength, t: Date.now() };
    let total = Object.values(m).reduce((s, e) => s + e.b, 0);
    for (const [u] of Object.entries(m).sort((p, q) => p[1].t - q[1].t)) {
      if (total <= CAP) break;
      await c.delete(u);
      total -= m[u].b;
      delete m[u];
    }
    saveMeta(m);
  } catch { /* quota exceeded or private mode: just don't cache */ }
}

async function fromCache(url) {
  if (!hasCache()) return null;
  try {
    const hit = await (await caches.open(CACHE)).match(url);
    if (!hit) return null;
    const buf = await hit.arrayBuffer();
    const m = meta();
    if (m[url]) { m[url].t = Date.now(); saveMeta(m); }
    return buf;
  } catch { return null; }
}

async function download(url, onProgress, priority) {
  const res = await fetch(url, { priority });
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
  return buf.buffer;
}

/** Bytes of one database file: from the on-disk cache when present, otherwise from the mirror (then cached). */
export async function getFile(n, name, onProgress) {
  const url = fileUrl(n, name);
  const t0 = performance.now();
  const cached = await fromCache(url);
  if (cached) return { buf: cached, source: 'cache', ms: performance.now() - t0 };
  let p = inflight.get(url);
  if (!p) {
    p = download(url, onProgress, 'high').then(buf => { remember(url, buf); return buf; }).finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  const buf = await p;
  return { buf, source: 'mirror', ms: performance.now() - t0 };
}

// Background prefetch: low priority, at most two at a time, skipped when the user asked to save data.
const queue = [];
let running = 0;
function pump() {
  while (running < 2 && queue.length) {
    const url = queue.shift();
    running++;
    fromCache(url)
      .then(hit => hit || inflight.get(url) || download(url, null, 'low').then(buf => remember(url, buf)))
      .catch(() => {})
      .finally(() => { running--; pump(); });
  }
}
export function prefetch(n, names) {
  if (!hasCache() || navigator.connection?.saveData) return;
  for (const name of names) {
    const url = fileUrl(n, name);
    if (!queue.includes(url) && !inflight.has(url)) queue.push(url);
  }
  queue.splice(0, Math.max(0, queue.length - 6));  // only the most recent requests matter
  pump();
}

/** Files and bytes currently kept, for the "cached in this browser" readout. */
export function cacheStats() {
  const v = Object.values(meta());
  return { files: v.length, bytes: v.reduce((s, e) => s + e.b, 0) };
}

export async function clearCache() {
  try { await caches.delete(CACHE); } catch { /* nothing cached */ }
  saveMeta({});
}
