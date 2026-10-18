// Görsellerdeki yazılar: kelimeyi yazı tipiyle harf harf maskeye çevirme ve görselde arama.
// Görseller çevirmenin metninden oyunun yazı tipleriyle basılmış (kayıtlarda capture/, css/fonts.css,
// tweak-* izleri): bir kelime aynı yazı tipiyle basılınca görseldeki yazıyla piksel piksel aynı çıkar.
// .fnt dosyalarında kerning yok, ama görseli basan program bazı harf çiftlerini 1 piksel yaklaştırmış
// (EndNews'te "Gr"); bu yüzden harfler ayrı ayrı, aralarında ±1 piksel payla eşleştirilir.

export function fntCoz(metin) {
  const harf = new Map();
  for (const m of metin.matchAll(/<char ([^>]*)\/>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
    harf.set(+a.id, { x: +a.x, y: +a.y, w: +a.width, h: +a.height, xo: +a.xoffset, yo: +a.yoffset, adv: +a.xadvance });
  }
  return { satirY: +(/lineHeight="(\d+)"/.exec(metin)?.[1] ?? 8), harf };
}

// Kelimenin harfleri, K ölçekli: her harfin dolu ve boş (glif kutusu içi) noktaları kalemine göre
// (kalem: harfin çizim noktası, satır üstü) ve ilerlemesi. Çizilemeyen harf varsa null.
export function kelimeMaskesi(font, kelime, K) {
  const harfler = [];
  for (const ch of kelime) {
    const g = font.harf.get(ch.codePointAt(0));
    if (!g) return null;
    if (ch !== ' ' && g.w * g.h === 0) return null;
    const dolu = [], bos = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const d = font.atlas.px[((g.y + y) * font.atlas.w + g.x + x) * 4 + 3] >= 128;
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) (d ? dolu : bos).push([(g.xo + x) * K + b, (g.yo + y) * K + a]);
    }
    harfler.push({ ch, dolu, bos, adv: g.adv * K });
  }
  const doluSayi = harfler.reduce((t, h) => t + h.dolu.length, 0);
  return doluSayi ? { harfler, doluSayi, K } : null;
}

// Kelime sınırı payı: kelimenin solunda ve sağında bu kadar sütunda aynı renk olmamalı. Harf arası en büyük
// boşluktan 1 fazla (kelimenin ortasında bulunmasın), ama kelime arası en küçük boşluğu geçmez.
export function sinirPayi(font) {
  const harfler = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÇĞÖŞÜçğöşü.,:;!?()-/\'"']
    .map(c => font.harf.get(c.codePointAt(0))).filter(g => g && g.w > 0);
  let enBuyuk = -Infinity, enKucuk = Infinity;
  for (const a of harfler) for (const b of harfler) { const ara = (a.adv - a.xo - a.w) + b.xo; enBuyuk = Math.max(enBuyuk, ara); enKucuk = Math.min(enKucuk, ara); }
  return Math.max(1, Math.min(enBuyuk + 1, enKucuk + (font.harf.get(32)?.adv ?? 0)));
}

// Görselin çevresine eklenen dolgu: saydam ve hiçbir yazı rengine eşit değil; dolgudaki nokta "bilinmiyor".
// Böylece kenardan taşan harf de bulunur (LoadDrag 8 piksel yüksek, Ç'nin çengelinin alt satırı kesik).
export const DOLGU = 0x00abcdef;
export function hazirla(img, T = 4) {
  const W = img.w + 2 * T, H = img.h + 2 * T, P = new Uint32Array(W * H).fill(DOLGU);
  const kaynak = new Uint32Array(img.px.buffer.slice(img.px.byteOffset, img.px.byteOffset + img.w * img.h * 4));
  for (let y = 0; y < img.h; y++) P.set(kaynak.subarray(y * img.w, (y + 1) * img.w), (y + T) * W + T);
  return { P, W, H, T };
}

// Kelimenin görseldeki bütün yerleri: [{ x, y, renk, kalemler }]; x, y ilk harfin kalemi, kalemler her
// harfin kalem x'i (görselin pikseli). Ölçüt: her harfin dolu noktaları tek renk, kutusundaki boş noktalar
// o renk değil; harf bir öncekinden ilerlemesi kadar sonra, ±K piksel; kelimenin iki yanında `pay`
// sütunda o renk yok (kelime başka bir kelimenin parçası değil).
export const ara = (G, M, pay) => tara(G, M, pay, null);
// Aynı ölçütle tek noktada: kalem (x, y)'de kelime tutuyorsa { renk, kalemler }, tutmuyorsa null.
export const tutar = (G, M, x, y, pay) => tara(G, M, pay, [x + G.T, y + G.T])[0] ?? null;

function tara({ P, W, H, T }, M, pay, tek) {
  const hs = M.harfler.map(h => {
    const xs = [...h.dolu, ...h.bos].map(p => p[0]);
    return { dolu: Int32Array.from(h.dolu, ([x, y]) => y * W + x), bos: Int32Array.from(h.bos, ([x, y]) => y * W + x),
      adv: h.adv, x0: Math.min(...xs), x1: Math.max(...xs), bosHarf: !xs.length };
  });
  const ys = M.harfler.flatMap(h => [...h.dolu, ...h.bos].map(p => p[1]));
  const y0 = Math.min(...ys), y1 = Math.max(...ys), h0 = hs[0], son = hs.findLastIndex(h => !h.bosHarf);
  const kalem = new Int32Array(hs.length), sonuc = [];
  if (!h0.dolu.length) return sonuc;

  const harfTutar = (h, t, c) => {
    for (let i = 0; i < h.dolu.length; i++) { const v = P[t + h.dolu[i]]; if (v !== c && v !== DOLGU) return false; }
    for (let i = 0; i < h.bos.length; i++) if (P[t + h.bos[i]] === c) return false;
    return true;
  };
  const sutunTemiz = (x, py, c) => {
    if (x < 0 || x >= W) return true;
    for (let y = py + y0; y <= py + y1; y++) if (P[y * W + x] === c) return false;
    return true;
  };
  const devam = (i, py, c) => {
    if (i === hs.length) {
      for (let k = 1; k <= pay; k++) if (!sutunTemiz(kalem[0] + h0.x0 - k, py, c) || !sutunTemiz(kalem[son] + hs[son].x1 + k, py, c)) return false;
      return true;
    }
    const h = hs[i], taban = kalem[i - 1] + hs[i - 1].adv;
    if (h.bosHarf) { kalem[i] = taban; return devam(i + 1, py, c); }
    for (const d of [0, -M.K, M.K]) {
      const px = taban + d;
      if (px + h.x0 < 0 || px + h.x1 >= W) continue;
      kalem[i] = px;
      if (harfTutar(h, py * W + px, c) && devam(i + 1, py, c)) return true;
    }
    return false;
  };

  for (let py = tek ? tek[1] : -y0; py <= (tek ? tek[1] : H - 1 - y1); py++) {
    if (py + y0 < 0 || py + y1 > H - 1) continue;
    for (let px = tek ? tek[0] : -h0.x0; px <= (tek ? tek[0] : W - 1 - h0.x1); px++) {
      if (px + h0.x0 < 0 || px + h0.x1 > W - 1) continue;
      const t = py * W + px;
      let c = P[t + h0.dolu[0]];
      for (let i = 1; c === DOLGU && i < h0.dolu.length; i++) c = P[t + h0.dolu[i]];
      if ((c >>> 24) === 0) continue;
      kalem[0] = px;
      if (!harfTutar(h0, t, c) || !devam(1, py, c)) continue;
      sonuc.push({ x: px - T, y: py - T, renk: c, kalemler: [...kalem].map(k => k - T) });
    }
  }
  return sonuc;
}

// Görselde bulunan yanlış kelimenin (Mo, tutar() sonucu s) yerine doğru kelimeyi (Md) basar; basılan harflerin
// kalemlerini döner, yapamazsa nedenini (görsele dokunmaz). Ana zemin: yanlış kelimenin glif kutularındaki boş
// noktaların en sık rengi.
// Varsayılan yol harf harf fark: eklenen nokta yazının rengi, silinen ana zemin. Nokta yalnızca temiz yere konur:
// görselin içinde, ana zeminde, 8 komşusu (doğru kelimenin kendi noktaları ve silinecekler hariç) ana zemin;
// değilse üst satırdaki harfe takılı çengel gibi görünür. Silinen noktanın 4 komşusu yazı ya da ana zemin olmalı.
// yol 'zorla': aynı fark, temizlik denetimi yok (gözle bakılıp kabul edilen yerler).
// yol 'yeniden': uzunluk değişiyorsa; kelime silinir, doğru kelime ilk harfin kaleminden (kayma kadar ötesinden)
// kendi ilerlemeleriyle basılır. Basılan glif kutuları ve 1 piksel çevresi silmeden sonra zemin olmalı (başka bir
// şeye taşmasın).
export function kelimeDegistir(img, Mo, Md, s, yol, kayma = 0) {
  const renk = (x, y) => x < 0 || y < 0 || x >= img.w || y >= img.h ? null : img.px.readUInt32LE((y * img.w + x) * 4);
  const boya = (x, y, c) => img.px.writeUInt32LE(c >>> 0, (y * img.w + x) * 4);
  const zemin = new Map();
  Mo.harfler.forEach((h, i) => { for (const [dx, dy] of h.bos) { const c = renk(s.kalemler[i] + dx, s.y + dy); if (c !== null) zemin.set(c, (zemin.get(c) ?? 0) + 1); } });
  const ana = [...zemin].sort((a, b) => b[1] - a[1])[0][0];
  if (yol === 'yeniden') {
    const kalemler = [], eski = new Set();
    Md.harfler.reduce((k, h) => { kalemler.push(k); return k + h.adv; }, s.kalemler[0] + kayma);
    Mo.harfler.forEach((h, i) => { for (const [dx, dy] of h.dolu) eski.add(String([s.kalemler[i] + dx, s.y + dy])); });
    const yeniDolu = Md.harfler.flatMap((h, i) => h.dolu.map(([dx, dy]) => [kalemler[i] + dx, s.y + dy]));
    const kutu = [...yeniDolu, ...Md.harfler.flatMap((h, i) => h.bos.map(([dx, dy]) => [kalemler[i] + dx, s.y + dy]))];
    if (yeniDolu.some(p => renk(...p) === null)) return 'görselin dışına taşıyor';
    const zeminMi = (x, y) => eski.has(String([x, y])) || [null, ana].includes(renk(x, y));
    if (kutu.some(([x, y]) => [-1, 0, 1].some(a => [-1, 0, 1].some(b => !zeminMi(x + a, y + b))))) return 'yeniden basılan kelime başka bir şeye taşıyor';
    for (const p of eski) boya(...p.split(',').map(Number), ana);
    for (const [x, y] of yeniDolu) boya(x, y, s.renk);
    return kalemler;
  }
  if (Mo.harfler.length !== Md.harfler.length || Mo.harfler.some((h, i) => h.adv !== Md.harfler[i].adv)) return 'uzunluk değişiyor';
  const ekle = [], sil = [], dogru = new Set(), silinen = new Set();
  Mo.harfler.forEach((h, i) => {
    const A = new Set(h.dolu.map(String)), B = new Set(Md.harfler[i].dolu.map(String));
    const yer = (p) => { const [dx, dy] = p.split(',').map(Number); return [s.kalemler[i] + dx, s.y + dy]; };
    for (const p of B) { dogru.add(String(yer(p))); if (!A.has(p)) ekle.push(yer(p)); }
    for (const p of A) if (!B.has(p)) { sil.push(yer(p)); silinen.add(String(yer(p))); }
  });
  const komsular = ([x, y], d) => d.map(([dx, dy]) => [x + dx, y + dy]).filter(k => !dogru.has(String(k)) && !silinen.has(String(k)));
  const sekiz = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  if (ekle.some(p => renk(...p) === null)) return 'görselin dışına taşıyor';
  if (yol !== 'zorla') {
    if (ekle.some(p => renk(...p) !== ana)) return 'nokta zeminde değil';
    if (ekle.some(p => komsular(p, sekiz).some(k => ![null, ana].includes(renk(...k))))) return 'komşu dolu';
    if (sil.some(p => komsular(p, sekiz.filter(([a, b]) => !a || !b)).some(k => ![null, ana, s.renk].includes(renk(...k))))) return 'silinen noktanın yanı başka renk';
  }
  for (const [x, y] of ekle) boya(x, y, s.renk);
  for (const [x, y] of sil) boya(x, y, ana);
  return s.kalemler;
}

// Dikdörtgendeki yazıyı (dikdörtgenin en sık rengi zemin, ondan farklı her nokta yazı) dx, dy kaydırır: noktası üst
// ya da alt satırın harfine değen kelimeye yer açmak için. Denetim, hepsi tutmazsa görsele dokunmaz ve nedenini
// döner: yazı dikdörtgenin dışındaki bir şeye bitişik değil (8 komşu; kesilip taşınmasın); kaydırma denetimleri
// yaziKaydir'de. Taşınan noktaları döner: "x,y" -> [x', y'].
export function satirKaydir(img, [x0, y0, x1, y1], dx, dy) {
  const renk = (x, y) => x < 0 || y < 0 || x >= img.w || y >= img.h ? null : img.px.readUInt32LE((y * img.w + x) * 4);
  const say = new Map();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) say.set(renk(x, y), (say.get(renk(x, y)) ?? 0) + 1);
  const zemin = [...say].sort((a, b) => b[1] - a[1])[0][0], icinde = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const yazi = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (renk(x, y) !== zemin) yazi.push([x, y]);
  const sekiz = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (const [x, y] of yazi) for (const [a, b] of sekiz) {
    if (!icinde(x + a, y + b) && ![null, zemin].includes(renk(x + a, y + b))) return `yazı (${x},${y}) dikdörtgenin dışındaki (${x + a},${y + b}) noktasına bitişik`;
  }
  return yaziKaydir(img, yazi, zemin, dx, dy);
}

// Verilen yazı noktalarını ([x, y]; zemin bir renk, readUInt32LE) dx, dy kaydırır. Denetim, hepsi tutmazsa görsele
// dokunmaz ve nedenini döner: yeni yeri görselin içinde ve zemin (ya da taşınan yazının eski yeri); kaydıktan sonra
// 8 komşusu, taşınan yazı dışında, zemin. Noktaların neye bitişik olduğuna bakmaz: yazıyı bitişik olduğu şeyden
// ayırmak, noktaları seçenin işi. Taşınan noktaları döner: "x,y" -> [x', y'].
export function yaziKaydir(img, noktalar, zemin, dx, dy) {
  const renk = (x, y) => x < 0 || y < 0 || x >= img.w || y >= img.h ? null : img.px.readUInt32LE((y * img.w + x) * 4);
  const boya = (x, y, c) => img.px.writeUInt32LE(c >>> 0, (y * img.w + x) * 4);
  const yazi = noktalar.map(([x, y]) => [x, y, renk(x, y)]);
  const eski = new Set(yazi.map(([x, y]) => `${x},${y}`)), yeniYer = new Set(yazi.map(([x, y]) => `${x + dx},${y + dy}`));
  const sekiz = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (const [x, y] of yazi) {
    const c = renk(x + dx, y + dy);
    if (c === null) return `yazı (${x},${y}) görselin dışına taşıyor`;
    if (c !== zemin && !eski.has(`${x + dx},${y + dy}`)) return `yazının (${x},${y}) yeni yeri (${x + dx},${y + dy}) boş değil`;
  }
  const sonra = (x, y) => eski.has(`${x},${y}`) ? zemin : renk(x, y);
  for (const [x, y] of yazi) for (const [a, b] of sekiz) {
    const nx = x + dx + a, ny = y + dy + b;
    if (!yeniYer.has(`${nx},${ny}`) && ![null, zemin].includes(sonra(nx, ny))) return `yazı (${x},${y}) kayınca (${nx},${ny}) noktasına bitişik`;
  }
  for (const [x, y] of yazi) boya(x, y, zemin);
  for (const [x, y, c] of yazi) boya(x + dx, y + dy, c);
  return new Map(yazi.map(([x, y]) => [`${x},${y}`, [x + dx, y + dy]]));
}

// Bulunan kelimenin dolu noktaları, görselin pikseli olarak (görselin dışında kalanlar hariç).
export function doluNoktalar(M, s, w, h) {
  const n = [];
  M.harfler.forEach((hf, i) => { for (const [dx, dy] of hf.dolu) { const x = s.kalemler[i] + dx, y = s.y + dy; if (x >= 0 && y >= 0 && x < w && y < h) n.push([x, y]); } });
  return n;
}
