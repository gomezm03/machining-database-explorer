// Spectrum of the steady second half of a record: Hann window, zero-padded radix-2 FFT.

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Single-sided amplitude spectrum of x[start..] up to fmax. */
export function spectrum(x, fs, fmax) {
  const start = Math.floor(x.length / 2);
  const m = x.length - start;
  let n = 1;
  while (n < m) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < m; i++) mean += x[start + i];
  mean /= m;
  let wsum = 0;
  for (let i = 0; i < m; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1));
    re[i] = (x[start + i] - mean) * w;
    wsum += w;
  }
  fft(re, im);
  const df = fs / n;
  const kmax = Math.min(n / 2, Math.floor(fmax / df));
  const f = new Float64Array(kmax + 1), a = new Float64Array(kmax + 1);
  for (let k = 0; k <= kmax; k++) {
    f[k] = k * df;
    a[k] = (2 * Math.hypot(re[k], im[k])) / wsum;
  }
  return { f, a, df };
}

/**
 * Local maxima above `rel` of the largest peak, labelled as tooth-passing harmonics or other (chatter).
 * Peaks within 1.5 % of a multiple of ftp count as harmonics.
 */
export function peaks(spec, ftp, rel = 0.02, maxPeaks = 12) {
  const { f, a } = spec;
  let top = 0;
  for (let k = 1; k < a.length; k++) top = Math.max(top, a[k]);
  const out = [];
  for (let k = 2; k < a.length - 1; k++) {
    if (a[k] > a[k - 1] && a[k] >= a[k + 1] && a[k] >= rel * top) out.push({ hz: f[k], amp: a[k] / top });
  }
  out.sort((p, q) => q.amp - p.amp);
  return out.slice(0, maxPeaks).map(p => {
    const h = Math.round(p.hz / ftp);
    return { ...p, tooth: h >= 1 && Math.abs(p.hz - h * ftp) <= Math.max(0.015 * h * ftp, 2 * spec.df) };
  });
}
