// Basit PNG okuyucu/yazıcı: yalnızca 8 bit RGBA, interlace yok (oyunun atlasları böyle).
import fs from 'node:fs';
import zlib from 'node:zlib';

export const oku = (yol) => coz(fs.readFileSync(yol));

export function coz(b) {
  let p = 8, w, h, renk, derinlik, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), tip = b.toString('ascii', p + 4, p + 8);
    const veri = b.subarray(p + 8, p + 8 + len);
    if (tip === 'IHDR') { w = veri.readUInt32BE(0); h = veri.readUInt32BE(4); derinlik = veri[8]; renk = veri[9]; if (veri[12]) throw new Error('interlace desteklenmiyor'); }
    else if (tip === 'IDAT') idat.push(veri);
    p += 12 + len;
  }
  if (derinlik !== 8 || renk !== 6) throw new Error(`desteklenmeyen PNG: derinlik ${derinlik} renk ${renk}`);
  const ham = zlib.inflateSync(Buffer.concat(idat)), bpp = 4, satir = w * bpp;
  const px = Buffer.alloc(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = ham[y * (satir + 1)], s = ham.subarray(y * (satir + 1) + 1, (y + 1) * (satir + 1));
    for (let x = 0; x < satir; x++) {
      const a = x >= bpp ? px[y * satir + x - bpp] : 0, u = y ? px[(y - 1) * satir + x] : 0, c = (x >= bpp && y) ? px[(y - 1) * satir + x - bpp] : 0;
      let v = s[x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? u : c; }
      px[y * satir + x] = v & 255;
    }
  }
  return { w, h, px };
}

const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const parca = (tip, veri) => { const l = Buffer.alloc(4); l.writeUInt32BE(veri.length); const t = Buffer.from(tip, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, veri]))); return Buffer.concat([l, t, veri, c]); };

export const yaz = (yol, img) => fs.writeFileSync(yol, kodla(img));

export function kodla({ w, h, px }) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const ham = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) px.copy(ham, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), parca('IHDR', ihdr), parca('IDAT', zlib.deflateSync(ham, { level: 9 })), parca('IEND', Buffer.alloc(0))]);
}

export const yeni = (w, h) => ({ w, h, px: Buffer.alloc(w * h * 4) });
