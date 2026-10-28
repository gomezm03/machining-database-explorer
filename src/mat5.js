// Minimal MATLAB v5 MAT-file reader: numeric, real, non-sparse arrays (what this database uses).
// Variables saved with compression are zlib streams, inflated with the browser's DecompressionStream.

const MI = { INT8: 1, UINT8: 2, INT16: 3, UINT16: 4, INT32: 5, UINT32: 6, SINGLE: 7, DOUBLE: 9, INT64: 12, UINT64: 13, MATRIX: 14, COMPRESSED: 15 };

const READERS = {
  [MI.INT8]: [1, (v, o) => v.getInt8(o)],
  [MI.UINT8]: [1, (v, o) => v.getUint8(o)],
  [MI.INT16]: [2, (v, o) => v.getInt16(o, true)],
  [MI.UINT16]: [2, (v, o) => v.getUint16(o, true)],
  [MI.INT32]: [4, (v, o) => v.getInt32(o, true)],
  [MI.UINT32]: [4, (v, o) => v.getUint32(o, true)],
  [MI.SINGLE]: [4, (v, o) => v.getFloat32(o, true)],
  [MI.DOUBLE]: [8, (v, o) => v.getFloat64(o, true)],
  [MI.INT64]: [8, (v, o) => Number(v.getBigInt64(o, true))],
  [MI.UINT64]: [8, (v, o) => Number(v.getBigUint64(o, true))],
};

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Reads one data element tag at `o`; handles the 4-byte "small element" form.
function tag(view, o) {
  const first = view.getUint32(o, true);
  if (first >>> 16) return { type: first & 0xffff, nbytes: first >>> 16, data: o + 4, next: o + 8 };
  const nbytes = view.getUint32(o + 4, true);
  return { type: first, nbytes, data: o + 8, next: o + 8 + Math.ceil(nbytes / 8) * 8 };
}

function toFloat64(view, t) {
  const [size, get] = READERS[t.type] || [];
  if (!get) throw new Error('Unsupported MAT data type ' + t.type);
  if (t.type === MI.DOUBLE && (view.byteOffset + t.data) % 8 === 0) {
    return new Float64Array(view.buffer.slice(view.byteOffset + t.data, view.byteOffset + t.data + t.nbytes));
  }
  const n = t.nbytes / size;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = get(view, t.data + i * size);
  return out;
}

function readMatrix(view, o, end) {
  const flags = tag(view, o);
  const cls = view.getUint32(flags.data, true) & 0xff;
  const complex = view.getUint32(flags.data, true) & 0x800;
  const dimsT = tag(view, flags.next);
  const dims = [];
  for (let i = 0; i < dimsT.nbytes / 4; i++) dims.push(view.getInt32(dimsT.data + i * 4, true));
  const nameT = tag(view, dimsT.next);
  let name = '';
  for (let i = 0; i < nameT.nbytes; i++) name += String.fromCharCode(view.getUint8(nameT.data + i));
  if (cls < 6 || cls > 15 || complex) return { name, skipped: true };  // cells, structs, chars, sparse, complex
  const re = tag(view, nameT.next);
  return { name, dims, data: toFloat64(view, re) };
}

/**
 * Parse a MAT v5 file. `wanted` (optional array of names) skips inflating nothing but
 * avoids converting variables you don't need.
 * @returns {Promise<Record<string, {dims:number[], data:Float64Array}>>}
 */
export async function readMat(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const head = String.fromCharCode(...bytes.subarray(0, 10));
  if (!head.startsWith('MATLAB 5.0')) throw new Error('Not a MAT v5 file (v7.3/HDF5 is not supported)');
  if (bytes[126] !== 0x49 || bytes[127] !== 0x4d) throw new Error('Big-endian MAT files are not supported');
  const vars = {};
  const view = new DataView(buffer);
  let o = 128;
  while (o + 8 <= bytes.length) {
    const type = view.getUint32(o, true);
    const nbytes = view.getUint32(o + 4, true);
    let elView, elStart;
    if (type === MI.COMPRESSED) {
      const inner = await inflate(bytes.subarray(o + 8, o + 8 + nbytes));
      elView = new DataView(inner.buffer);
      elStart = 0;
      o += 8 + nbytes;
    } else {
      elView = view;
      elStart = o;
      o += 8 + Math.ceil(nbytes / 8) * 8;
    }
    const t = tag(elView, elStart);
    if (t.type !== MI.MATRIX) continue;
    const m = readMatrix(elView, t.data, t.data + t.nbytes);
    if (!m.skipped && (!wanted || wanted.includes(m.name))) vars[m.name] = { dims: m.dims, data: m.data };
  }
  return vars;
}
