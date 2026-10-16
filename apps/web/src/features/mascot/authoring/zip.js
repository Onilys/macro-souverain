// Small, dependency-free ZIP writer (stored entries, UTF-8 names).
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (b) => {
  let n = 0xffffffff;
  for (const x of b) n = table[(n ^ x) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
};
export async function zip(entries) {
  const encoder = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0,
    size = 0;
  for (const [path, value] of Object.entries(entries)) {
    const name = encoder.encode(path),
      data =
        value instanceof Blob
          ? new Uint8Array(await value.arrayBuffer())
          : encoder.encode(value),
      checksum = crc(data);
    const local = new Uint8Array(30 + name.length),
      v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, checksum, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, data);
    const c = new Uint8Array(46 + name.length),
      w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x800, true);
    w.setUint32(16, checksum, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    size += c.length;
    offset += local.length + data.length;
  }
  const end = new Uint8Array(22),
    v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, central.length, true);
  v.setUint16(10, central.length, true);
  v.setUint32(12, size, true);
  v.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
