// Basit zip okuyucu/yazıcı: dil paketlerini (loc/*.zip) açıp yeniden paketlemek için.
// Girdi adları olduğu gibi korunur (tr.zip'te "/fonts/..." gibi baştaki "/" dahil).
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

// Dönen Map girdi sırasını korur: ad -> Buffer
export function zipOku(yol) {
  const b = fs.readFileSync(yol);
  let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error(`zip sonu bulunamadı: ${yol}`);
  const adet = b.readUInt16LE(e + 10);
  let p = b.readUInt32LE(e + 16);
  const girdiler = new Map();
  for (let i = 0; i < adet; i++) {
    if (b.readUInt32LE(p) !== 0x02014b50) throw new Error('bozuk merkez dizini');
    const yontem = b.readUInt16LE(p + 10), boy = b.readUInt32LE(p + 20), adBoy = b.readUInt16LE(p + 28);
    const ekBoy = b.readUInt16LE(p + 30), yorumBoy = b.readUInt16LE(p + 32), yerel = b.readUInt32LE(p + 42);
    const ad = b.toString('utf8', p + 46, p + 46 + adBoy);
    const veriBas = yerel + 30 + b.readUInt16LE(yerel + 26) + b.readUInt16LE(yerel + 28);
    const ham = b.subarray(veriBas, veriBas + boy);
    const veri = yontem === 0 ? Buffer.from(ham) : yontem === 8 ? zlib.inflateRawSync(ham) : null;
    if (!veri) throw new Error(`desteklenmeyen sıkıştırma ${yontem}: ${ad}`);
    girdiler.set(ad, veri);
    p += 46 + adBoy + ekBoy + yorumBoy;
  }
  return girdiler;
}

// Her girdinin başlık alanları (veri boyu, CRC ve konum hariç): yazılan paketin orijinalle
// aynı biçimde olduğunu denetlemek için. ad -> { yapan, gerek, bayrak, yontem, saat, tarih, ek, disOz }
export function zipBicim(yol) {
  const b = fs.readFileSync(yol);
  let e = b.length - 22;
  while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  const bicim = new Map();
  let p = b.readUInt32LE(e + 16);
  for (let i = 0; i < b.readUInt16LE(e + 10); i++) {
    const adBoy = b.readUInt16LE(p + 28), ekBoy = b.readUInt16LE(p + 30), y = b.readUInt32LE(p + 42);
    bicim.set(b.toString('utf8', p + 46, p + 46 + adBoy), {
      yapan: b.readUInt16LE(p + 4), gerek: b.readUInt16LE(p + 6), bayrak: b.readUInt16LE(p + 8), yontem: b.readUInt16LE(p + 10),
      saat: b.readUInt16LE(p + 12), tarih: b.readUInt16LE(p + 14), ek: ekBoy, disOz: b.readUInt32LE(p + 38),
      yerelBayrak: b.readUInt16LE(y + 6), yerelYontem: b.readUInt16LE(y + 8), yerelEk: b.readUInt16LE(y + 28),
    });
    p += 46 + adBoy + ekBoy + b.readUInt16LE(p + 32);
  }
  return bicim;
}

// Başlık biçimi orijinal paketinkinden farklı olan girdilerin adları (iki zipBicim çıktısı). Oyun sıkıştırılmış
// paketi sessizce reddedip İngilizceye dönüyordu; içerik doğru olsa da.
export const bicimFarklari = (orijinal, yeni) => [...orijinal].filter(([a, v]) => JSON.stringify(yeni.get(a)) !== JSON.stringify(v)).map(([a]) => a);

// Oyunun paketleri gibi yazar: sıkıştırmasız (yöntem 0), bayrak 0. Oyun zip'i Haxe'nin
// okuyucusuyla açıyor; sıkıştırılmış (deflate) paketi yükleyemedi, dil İngilizceye döndü.
// zamanlar: ad -> { saat, tarih } (DOS biçimi; zipBicim'in çıktısı verilebilir), yoksa 1980-01-01.
export function zipYaz(yol, girdiler, zamanlar = new Map()) {
  const yereller = [], merkez = [];
  let ofset = 0;
  for (const [ad, veri] of girdiler) {
    const adB = Buffer.from(ad, 'utf8'), c = crc32(veri), zaman = zamanlar.get(ad) ?? { saat: 0, tarih: 0x21 };
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(zaman.saat, 10); h.writeUInt16LE(zaman.tarih, 12);
    h.writeUInt32LE(c, 14); h.writeUInt32LE(veri.length, 18); h.writeUInt32LE(veri.length, 22); h.writeUInt16LE(adB.length, 26);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(0, 8); m.writeUInt16LE(0, 10);
    m.writeUInt16LE(zaman.saat, 12); m.writeUInt16LE(zaman.tarih, 14);
    m.writeUInt32LE(c, 16); m.writeUInt32LE(veri.length, 20); m.writeUInt32LE(veri.length, 24); m.writeUInt16LE(adB.length, 28);
    m.writeUInt32LE(ofset, 42);
    yereller.push(h, adB, veri); merkez.push(m, adB);
    ofset += 30 + adB.length + veri.length;
  }
  const md = Buffer.concat(merkez), son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(girdiler.size, 8); son.writeUInt16LE(girdiler.size, 10);
  son.writeUInt32LE(md.length, 12); son.writeUInt32LE(ofset, 16);
  fs.writeFileSync(yol, Buffer.concat([...yereller, md, son]));
}
