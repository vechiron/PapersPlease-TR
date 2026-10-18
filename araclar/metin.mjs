// Metin düzeltmeleri: duzeltmeler.tsv'deki kurallar ve dil paketinin metin dosyaları (Loc.csv, Text.xml).
// tr-yama.mjs (metni düzeltir) ve gorsel-ara.mjs (görsellerdeki aynı kelimeleri arar) birlikte kullanır.
import fs from 'node:fs';

export const HARF = 'A-Za-zÇĞİIıÖŞÜçğiöşüâîû';
const kacis = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const duzeltmeler = (dosya) => duzeltmelerMetinden(fs.readFileSync(dosya, 'utf8'));

// duzeltmeler.tsv: yanlış<TAB>doğru. duzelt etiketlerin (<br>, <span>) dışındaki metinde tam kelime değiştirir;
// sayim hangi kuralın kaç yerde uygulandığını tutar.
export function duzeltmelerMetinden(metin) {
  const harita = new Map();
  for (const satir of metin.split(/\r?\n/)) {
    if (!satir || satir.startsWith('#')) continue;
    const [yanlis, dogru, ...fazla] = satir.split('\t');
    if (!dogru || fazla.length) throw new Error(`duzeltmeler.tsv: iki sütun olmalı: ${satir}`);
    if (harita.has(yanlis)) throw new Error(`duzeltmeler.tsv: yinelenen satır: ${yanlis}`);
    harita.set(yanlis, dogru);
  }
  const desen = new RegExp(`(?<![${HARF}])(?:${[...harita.keys()].sort((a, b) => b.length - a.length).map(kacis).join('|')})(?![${HARF}])`, 'g');
  const sayim = new Map();
  const duzelt = (s) => s.split(/(<[^>]*>)/).map((p, i) => i % 2 ? p : p.replace(desen, (m) => { sayim.set(m, (sayim.get(m) ?? 0) + 1); return harita.get(m); })).join('');
  return { harita, duzelt, sayim };
}

// Loc.csv: "bağlam","kimlik","metin" kayıtları; yalnızca üçüncü alan (Türkçe metin) değişir: f(metin, bağlam, kimlik).
// Görsellerin metni, bağlamı görselin adı olan kayıtlarda.
export function csvIsle(metin, f) {
  let i = metin.indexOf('\n') + 1, cikti = metin.slice(0, i), kayit = 0;
  while (i < metin.length) {
    const alanlar = [];
    for (let alan = 0; alan < 3; alan++) {
      if (metin[i] !== '"') throw new Error(`Loc.csv: ${i}. karakterde tırnak bekleniyordu`);
      let j = i + 1;
      for (;;) { j = metin.indexOf('"', j); if (j < 0) throw new Error('Loc.csv: kapanmayan tırnak'); if (metin[j + 1] === '"') { j += 2; continue; } break; }
      const ic = metin.slice(i + 1, j);
      alanlar.push(ic);
      cikti += '"' + (alan === 2 ? f(ic, alanlar[0], alanlar[1]) : ic) + '"';
      i = j + 1;
      if (alan < 2) { if (metin[i] !== ',') throw new Error(`Loc.csv: ${i}. karakterde virgül bekleniyordu`); cikti += ','; i++; }
    }
    while (metin[i] === '\r' || metin[i] === '\n') cikti += metin[i++];
    kayit++;
  }
  return { cikti, kayit };
}

export const xmlIsle = (metin, f) => metin.replace(/<t>([\s\S]*?)<\/t>/g, (t, ic) => '<t>' + f(ic) + '</t>');
