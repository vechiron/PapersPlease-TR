// Türkçe paketin (loc/tr.zip) yaması: orijinal paketten yamalı paketi üretir, dosya sistemine dokunmaz.
// Yazı tipi sorunu: pixelplay'de ı noktalı i'nin kopyası, altı yazı tipinde İ boş, resource'ta ı da boş.
// Çözüm: her yazı tipinde ı = kendi i'sinin noktasız gövdesi, İ = kendi I'sı + i'nin noktası
// (noktanın I'ya uzaklığı Ü'deki noktalarla aynı). Oyunun piksel tarzı korunur.
// Metin sorunu: çevirmen İ ve ı görünmediği için I/i yazmış; düzeltmeler araclar/duzeltmeler.tsv'de.
// Kullananlar: tr-yama.mjs (geliştiricinin aracı) ve kurucu.mjs (oyuncunun programı).
import path from 'node:path';
import crypto from 'node:crypto';
import { coz, kodla, yeni } from './png.mjs';
import { csvIsle, duzeltmelerMetinden, xmlIsle } from './metin.mjs';
import { doluNoktalar, fntCoz, hazirla, kelimeDegistir, kelimeMaskesi, satirKaydir, sinirPayi, tutar, yaziKaydir } from './gorsel.mjs';

// Oyunun 1.4.11.124 sürümüyle gelen tr.zip (17.10.2026'da ölçüldü)
export const ORIJINAL_SHA = '32331dab193613a01c9016947814d72b20da86b956d03548ac7e2f19a9c21e6c';

// Paketin içerik parmak izi (sha256): girdi adları sırayla; görsellerin boyutu ve pikselleri, öteki dosyaların
// baytları. Yamalı paketi tanımak için (kurucu.mjs): görselin sıkıştırılmış baytları zlib'e bağlı, pikselleri değil.
export function icerikIzi(paket) {
  const iz = crypto.createHash('sha256');
  for (const [ad, b] of paket) {
    const png = ad.endsWith('.png') ? coz(b) : null, veri = png ? png.px : b;
    iz.update(`${ad}\0${png ? `${png.w}x${png.h}` : '-'}\0${veri.length}\0`).update(veri);
  }
  return iz.digest('hex');
}

// --- .fnt yazma ---
function fntGuncelle(metin, id, g) {
  const yeniDeger = { x: g.x, y: g.y, width: g.w, height: g.h, xoffset: g.xo, yoffset: g.yo, xadvance: g.adv };
  let bulundu = false;
  const sonuc = metin.replace(/<char ([^>]*)\/>/g, (tum, ic) => {
    if (!new RegExp(`\\bid="${id}"`).test(ic)) return tum;
    bulundu = true;
    return '<char ' + ic.replace(/(\w+)="([^"]*)"/g, (t, k, v) => k in yeniDeger ? `${k}="${yeniDeger[k]}"` : t) + '/>';
  });
  if (!bulundu) throw new Error(`.fnt içinde id=${id} yok`);
  return sonuc;
}

// --- glif yardımcıları ---
export const dolu = (atlas, x, y) => atlas.px[(y * atlas.w + x) * 4 + 3] >= 128;
const satirDolu = (atlas, g, r) => { for (let c = 0; c < g.w; c++) if (dolu(atlas, g.x + c, g.y + r)) return true; return false; };

// Glifin üstteki nokta(lar)ını bulur: [nokta başı, nokta sonu, gövde başı] (glif satırı olarak)
function noktaSatirlari(atlas, g, ad) {
  let r = 0;
  while (r < g.h && !satirDolu(atlas, g, r)) r++;
  const bas = r;
  while (r < g.h && satirDolu(atlas, g, r)) r++;
  const son = r;
  while (r < g.h && !satirDolu(atlas, g, r)) r++;
  if (bas === g.h || son === g.h || r === g.h) throw new Error(`${ad}: nokta ile gövde ayrılamadı`);
  return [bas, son, r];
}

function bosYerBul(atlas, kutular, w, h) {
  for (let y = 1; y + h + 1 <= atlas.h; y++) {
    for (let x = 1; x + w + 1 <= atlas.w; x++) {
      if (kutular.some(k => x - 1 < k.x + k.w && x + w + 1 > k.x && y - 1 < k.y + k.h && y + h + 1 > k.y)) continue;
      let temiz = true;
      for (let yy = y - 1; temiz && yy <= y + h; yy++) for (let xx = x - 1; xx <= x + w; xx++) if (atlas.px[(yy * atlas.w + xx) * 4 + 3]) { temiz = false; break; }
      if (temiz) return { x, y };
    }
  }
  return null;
}

function fontOnar(ad, fnt, atlas) {
  const { harf } = fnt, i = harf.get(105), I = harf.get(73), U = harf.get(220);

  // ı: i'nin gövdesi (atlasta aynı yeri gösterir, nokta ve boşluk satırları atlanır)
  const [, , iGovde] = noktaSatirlari(atlas, i, `${ad} i`);
  const yeniI = { ...i, y: i.y + iGovde, h: i.h - iGovde, yo: i.yo + iGovde };

  // İ: I + i'nin noktası; nokta ile gövde arası boşluk Ü'deki gibi
  const [iNb, iNs] = noktaSatirlari(atlas, i, `${ad} i`);
  const [uNb, uNs, uGovde] = noktaSatirlari(atlas, U, `${ad} Ü`);
  const bosluk = uGovde - uNs, noktaH = iNs - iNb;
  let nSol = i.w, nSag = -1;
  for (let r = iNb; r < iNs; r++) for (let c = 0; c < i.w; c++) if (dolu(atlas, i.x + c, i.y + r)) { nSol = Math.min(nSol, c); nSag = Math.max(nSag, c); }
  const noktaW = nSag - nSol + 1;
  // I'nın sapı: orta satırdaki dolu sütunlar
  const orta = Math.floor(I.h / 2);
  let sSol = I.w, sSag = -1;
  for (let c = 0; c < I.w; c++) if (dolu(atlas, I.x + c, I.y + orta)) { sSol = Math.min(sSol, c); sSag = Math.max(sSag, c); }
  const noktaX = Math.floor((sSol + sSag + 1 - noktaW) / 2);
  if (noktaX < 0 || noktaX + noktaW > I.w) throw new Error(`${ad}: İ noktası I'nın dışına taşıyor`);
  const ust = noktaH + bosluk;
  // Oyunun Ü'sü (Çekçe paketin Í'si de) gövdeyi kısaltıp işareti büyük harfin üstüne sığdırıyor; İ de Ü'nün
  // işaretinden yukarı çıkmasın (görsellerde nokta yazının içinde kalır). Çıkarsa I'nın gövdesinden, ortadan
  // başlayarak bir öncekinin aynısı olan satırlar atılır; üst ve alt çizgi kalır.
  const satir = (r) => atlas.px.subarray(((I.y + r) * atlas.w + I.x) * 4, ((I.y + r) * atlas.w + I.x + I.w) * 4);
  let fazla = U.yo + uNb - (I.yo - ust);
  const atilan = new Set();
  for (const r of [...Array(I.h).keys()].slice(1).sort((a, b) => Math.abs(a - orta) - Math.abs(b - orta))) {
    if (fazla <= 0) break;
    if (!atilan.has(r - 1) && satir(r).equals(satir(r - 1))) { atilan.add(r); fazla--; }
  }
  if (fazla > 0) throw new Error(`${ad}: İ Ü'nün hizasına sığmıyor (I'da atılacak aynı satır yok)`);
  const govde = [...Array(I.h).keys()].filter(r => !atilan.has(r));
  const yeniBuyukI = { w: I.w, h: ust + govde.length, xo: I.xo, yo: I.yo - ust + atilan.size, adv: I.adv };

  // atlasta yer: bütün görünür glif kutularından ve piksellerden uzak
  const kutular = [...harf.values()].filter(g => g.w > 0 && g.h > 0);
  let yer = bosYerBul(atlas, kutular, yeniBuyukI.w, yeniBuyukI.h);
  if (!yer) {
    const buyuk = yeni(atlas.w, atlas.h * 2);
    atlas.px.copy(buyuk.px);
    yer = { x: 1, y: atlas.h + 1 };
    atlas = buyuk;
  }
  govde.forEach((r, j) => { for (let c = 0; c < I.w; c++) {
    const s = ((I.y + r) * atlas.w + I.x + c) * 4;
    atlas.px.copy(atlas.px, ((yer.y + ust + j) * atlas.w + yer.x + c) * 4, s, s + 4);
  } });
  for (let r = 0; r < noktaH; r++) for (let c = 0; c < noktaW; c++) {
    const s = ((i.y + iNb + r) * atlas.w + i.x + nSol + c) * 4;
    atlas.px.copy(atlas.px, ((yer.y + r) * atlas.w + yer.x + noktaX + c) * 4, s, s + 4);
  }
  harf.set(305, yeniI);
  harf.set(304, { ...yeniBuyukI, ...yer });
  return { atlas, yeniI, yeniBuyukI: harf.get(304), yerAtlasta: yer, atilan: atilan.size };
}

export const yaziTipi = (kume, ad) => { const f = { harf: kume.get(ad).fnt.harf, atlas: kume.get(ad).atlas }; return { ...f, pay: sinirPayi(f) }; };

// kaynak: orijinal paket (zipOku'nun Map'i); tablolar dosya metni olarak. Dönen cikti yamalı paket (değişmeyen
// dosyalar kaynaktaki Buffer'ların kendisi), sorun düzeltilemeyen yer sayısı (0 değilse paket eksik yamalı),
// once / sonra yazı tipleri (pafta ve önizleme için).
export function yamaUret(kaynak, { duzeltmelerMetni, yerlerMetni, log = console.log }) {
  // --- metin düzeltmeleri (araclar/duzeltmeler.tsv) ---
  const { harita, duzelt, sayim } = duzeltmelerMetinden(duzeltmelerMetni);
  // Çeviri hataları: anlamı ya da hitabı yanlış, kelime kuralıyla düzeltilemeyen (aynı kelime başka yerde doğru)
  // görsel satırları. Görselin Loc.csv kaydı ve görseldeki satır birlikte değişir (görsel o kayıttan basılmış; satır
  // elle bölümde yeniden basılır). [görsel, İngilizce kayıt, yanlış, doğru, yazı tipi, kalem x, kalem y]
  // Silah sayfası: İngilizcesi "silahın kilidini açmak için anahtarı kilide bırak", resimde de anahtar kilide gidiyor.
  // Eğitim sayfalarının bütün talimatları "siz" diye hitap ediyor (doğrulayın, koyun, dikkat edin), yalnızca bu "sen".
  const satirDuzeltmeleri = [
    ['BulletinInnerGunTut', 'Drop key on tumbler to unlock weapon.', 'Silahı kilide sürükleyin.', 'Anahtarı kilide sürükleyin.', 'bmmini_u_regular_8', 29, 87],
    ['BulletinInnerGunTut', 'Time is short. Act fast.', 'Zaman kısa. Hızlı hareket et.', 'Zaman kısa. Hızlı hareket edin.', 'bmmini_u_regular_8', 18, 179],
  ];

  // --- çalıştır ---
  const cikti = new Map(kaynak);
  const csvHam = kaynak.get('/data/Loc.csv').toString('utf8'), xmlHam = kaynak.get('/data/Text.xml').toString('utf8');
  // karşı test: değiştirmeden geçirince dosya birebir aynı çıkmalı (ayrıştırıcı bozmuyor)
  const kimlik = csvIsle(csvHam, (s) => s);
  if (kimlik.cikti !== csvHam || xmlIsle(xmlHam, (s) => s) !== xmlHam) throw new Error('ayrıştırıcı metni değiştirmeden geri üretemedi');
  const satirUygulanan = new Set();
  const satirDuzelt = (m, baglam, en) => {
    const d = satirDuzeltmeleri.find(s => s[0] === baglam && s[1] === en && s[2] === m);
    if (d) satirUygulanan.add(d);
    return duzelt(d ? d[3] : m);
  };
  const csvYeni = csvIsle(csvHam, satirDuzelt).cikti, xmlYeni = xmlIsle(xmlHam, duzelt);
  cikti.set('/data/Loc.csv', Buffer.from(csvYeni, 'utf8'));
  cikti.set('/data/Text.xml', Buffer.from(xmlYeni, 'utf8'));
  const toplam = [...sayim.values()].reduce((a, b) => a + b, 0);
  const eslesmeyen = [...harita.keys()].filter(k => !sayim.has(k)), satirEksik = satirDuzeltmeleri.filter(d => !satirUygulanan.has(d));
  log(`Metin: ${kimlik.kayit} CSV kaydı; ${harita.size} düzeltme kuralından ${sayim.size} tanesi ${toplam} yerde uygulandı; ` +
    `${satirDuzeltmeleri.length} çeviri hatasından ${satirUygulanan.size} tanesi Loc.csv'de düzeltildi.`);
  if (eslesmeyen.length) log(`  UYARI: metinde bulunamayan kurallar (metin değişmiş olabilir): ${eslesmeyen.join(' ')}`);
  if (satirEksik.length) log(`  UYARI: Loc.csv'de bulunamayan çeviri hataları: ${satirEksik.map(d => `${d[0]} "${d[2]}"`).join(' · ')}`);
  const metinler = csvYeni + xmlYeni;
  const kullanilan = [...new Set(metinler)].filter(ch => ch.codePointAt(0) > 32);
  const once = new Map(), sonra = new Map();
  let sorun = 0;

  for (const ad of [...kaynak.keys()].filter(a => a.endsWith('.fnt'))) {
    const pngAd = ad.replace(/\.fnt$/, '.png'), kisa = path.basename(ad, '.fnt');
    const metin = kaynak.get(ad).toString('utf8');
    const fnt = fntCoz(metin), atlas = coz(kaynak.get(pngAd));
    once.set(kisa, { fnt: fntCoz(metin), atlas: coz(kaynak.get(pngAd)) });
    const r = fontOnar(kisa, fnt, atlas);
    let yeniMetin = fntGuncelle(metin, 305, r.yeniI);
    yeniMetin = fntGuncelle(yeniMetin, 304, r.yeniBuyukI);
    cikti.set(ad, Buffer.from(yeniMetin, 'utf8'));
    cikti.set(pngAd, kodla(r.atlas));
    sonra.set(kisa, { fnt: fntCoz(yeniMetin), atlas: r.atlas });

    // denetim: metinde geçen her harf bu yazı tipinde var ve görünür mü
    const eksik = kullanilan.filter(ch => { const g = fnt.harf.get(ch.codePointAt(0)); return !g || g.h === 0 || g.w === 0; });
    const atlasNot = r.atlas.h !== once.get(kisa).atlas.h ? ` (atlas ${once.get(kisa).atlas.h} -> ${r.atlas.h} px büyüdü)` : '';
    const kisalik = r.atilan ? ` (İ Ü hizasında, I'dan ${r.atilan} satır kısa)` : '';
    log(`${kisa.padEnd(34)} ı ve İ onarıldı${kisalik}${atlasNot}; metinde olup çizilemeyen: ${eksik.length ? eksik.join(' ') : 'yok'}`);
    if (eksik.length) sorun++;
  }

  // --- görseller: çevirmen İ ve Ü'yü I ve U olarak çizmiş (oyun bu yazıları metinden değil görselden basıyor) ---
  // Yerler araclar/gorsel-yerler.tsv'de (gorsel-ara.mjs bulur; yanlış kelime orijinal yazı tipiyle orada tutar).
  // Doğru kelime yamalı yazı tipiyle aynı yere basılır (gorsel.mjs kelimeDegistir); yer yoksa elle (aşağıda).
  const yollar = new Map([...kaynak.keys()].filter(a => a.endsWith('.png') && !a.startsWith('/fonts/')).map(a => [path.posix.basename(a, '.png'), a]));
  const tablo = yerlerMetni.split(/\r?\n/).filter(s => s && !s.startsWith('#')).map(s => s.split('\t'));
  // Tablo yolunun basamadığı yerler, paftada gözle bakılıp seçilen yolla (gorsel.mjs kelimeDegistir): "görsel doğru"
  // (araclar/gorsel-teshis.mjs her basılamayan yerin bu yollarla sonucunu ve noktanın çevresini ölçer.)
  const elleYol = new Map([
    // uzunluğu değişen; yeniden basılınca kelimenin 2 piksel çevresinde başka bir şey yok
    ['BulletinInnerFilerTut Pasaporta', 'yeniden'], ['EndNews Mutabakatı', 'yeniden'], ['RulesInnerAsylumGrant PARMAK İZİ', 'yeniden'],
    // nokta ana zeminde değil ya da komşusu dolu, ama değdiği yazı değil, zeminin dokusu (ahşap, tepe çizimi)
    ['FingerprintButton İZİ', 'zorla'], ['HintMissingInner İNCELEME', 'zorla'],
    // nokta çizgiye ya da çerçeveye bitişik, ama aynı yazıda oyunun kendi aksanı da orada: BÖLGESİ'nin Ö noktaları,
    // MÜSADERE'nin Ü noktaları, kimlik kartı başlığında resmî çevirilerin (cs, pl, fr, it) aksanları, broşür başlığında
    // resmî cs ve de aksanları (satır 3-4)
    ['BulletinInnerFilerTut BÖLGESİ', 'zorla'], ['Filer ALTINDAKİ', 'zorla'], ['IdCardInner KİMLİK', 'zorla'], ['ForgeryFlyerInnerFront OBRİSTAN', 'zorla'],
    // kaydırmadan sonra (aşağıda): "belirtilen" sağa alındı; SAHTE satırı ortalasın diye 7 piksel sağdan
    ['WorkPermitInner hamiline', 'yeniden'], ['ForgeryFlyerInnerFront SAHTE', ['yeniden', 7]],
  ]);
  // Satır kaydırma: noktası üst ya da alt satırın harfine değen (ya da uzayınca yanındakine yapışan) kelimeye yer açar.
  // Tablo yolundan önce, orijinal görselde (gorsel.mjs satirKaydir denetler); kayan kelimenin tablodaki koordinatı
  // kayma kadar düzeltilir. Nokta sonra varsayılan yolun temizlik denetiminden geçer. Koordinatlar araclar/harita.mjs ile.
  const kaydirmalar = new Map([
    // GEÇERLİ: satırı 1 yukarı: TARİH:'in noktası (73,37) üst satırın R'sine ve L'sine çapraz değiyordu. TARİH: yerinde
    // kalır: yanındaki siyah nokta (82,38; İngilizcede 86,36) büyük olasılıkla oyunun tarihi basacağı yerin işareti.
    ['EntryTicketInner', [[[51, 30, 81, 37], 0, -1]]],
    // GİRİŞ'in Ş çengeli (195,88) BİLGİSİ'nin İ noktasına (194,89) çapraz: üst satır 1 yukarı, alt satır 1 aşağı
    // (paragraf içi satır aralıkları eşit kalsın). Solda defter teli, sağda koyu bant.
    ['RulesInnerAccessPermit', [[[133, 81, 234, 88], 0, -1], [[133, 98, 234, 103], 0, 1]]],
    // İŞÇİLERE'nin Ş çengeli (69,139) VERİLİR'in İ noktasına (70,140) çapraz: alt satır 1 aşağı, üst satır 1 yukarı.
    ['RulesInnerWorkPermit', [[[12, 140, 110, 147], 0, 1], [[12, 124, 110, 131], 0, -1]]],
    // "hamiline" uzayınca "belirtilen"e yapışıyordu: "belirtilen" 4 sağa (e'nin ilerlemesi), arada orijinaldeki 5 boş sütun.
    ['WorkPermitInner', [[[70, 35, 120, 41], 4, 0]]],
    // Broşür başlığı: motorola_16'da İ, I'dan 3 satır yukarı çıkıyor; BELGELERİ ve Mİ'nin noktası üst satırın
    // harflerinin üstüne düşüyordu. 2. satır 3 aşağı (çerçevenin içinde boşluk üstte 0, ortada 1, altta 1); 1. satır
    // 3 sola, kısalan SAHTE ile birlikte ortası 2. satırınkiyle aynı (66,5).
    ['ForgeryFlyerInnerFront', [[[7, 22, 127, 36], 0, 3], [[8, 3, 127, 20], -3, 0]]],
  ]);
  // görsel, kaydırmaları uygulanmış; biri tutmazsa hiçbiri uygulanmaz
  const hazirGorsel = (ad, gorsel) => {
    const img = coz(kaynak.get(ad)), tasimalar = [];
    for (const [kutu, dx, dy] of kaydirmalar.get(gorsel) ?? []) {
      const r = satirKaydir(img, kutu, dx, dy);
      if (typeof r === 'string') { log(`${ad.padEnd(34)} KAYDIRILMADI [${kutu}]: ${r}`); sorun++; return { img: coz(kaynak.get(ad)), tasimalar: [] }; }
      tasimalar.push(r);
    }
    return { img, tasimalar };
  };
  const duzeltilen = new Map(), yerYok = [];
  for (const [gorsel, yanlis, dogru, fad, Ks, xs, ys] of tablo) {
    const ad = yollar.get(gorsel), K = +Ks;
    let x = +xs, y = +ys;
    if (!duzeltilen.has(ad)) duzeltilen.set(ad, { ...hazirGorsel(ad, gorsel), orj: hazirla(coz(kaynak.get(ad))), yerler: [] });
    const { img, yerler, tasimalar, orj } = duzeltilen.get(ad), fo = yaziTipi(once, fad), fy = yaziTipi(sonra, fad);
    const Mo = kelimeMaskesi(fo, yanlis, K), Md = kelimeMaskesi(fy, dogru, K), so = tasimalar.length && tutar(orj, Mo, x, y, fo.pay * K);
    // kayan kelime: dolu noktaları ya hep birlikte taşındı ya hiç
    if (so) {
      const ilk = doluNoktalar(Mo, so, img.w, img.h).map(String);
      let n = ilk, kismen = false;
      for (const t of tasimalar) { const k = n.filter(p => t.has(p)).length; if (k && k < n.length) kismen = true; else if (k) n = n.map(p => String(t.get(p))); }
      if (kismen) { (duzeltilen.get(ad).yarim ??= []).push(yanlis); continue; }
      const [a, b] = [ilk[0], n[0]].map(p => p.split(',').map(Number));
      x += b[0] - a[0]; y += b[1] - a[1];
    }
    const s = tutar(hazirla(img), Mo, x, y, fo.pay * K);
    if (!s) { log(`${gorsel} ${yanlis}: tabloda yazan yerde yok (görsel değişmiş olabilir)`); sorun++; continue; }
    const r = kelimeDegistir(img, Mo, Md, s, ...[elleYol.get(`${gorsel} ${dogru}`)].flat());
    if (typeof r === 'string') yerYok.push(`${gorsel} ${dogru} (${r})`); else yerler.push({ dogru, Md, x: r[0], y, pay: fy.pay * K, kalemler: r.join() });
  }
  // denetim: bütün düzeltmelerden sonra her doğru kelime yamalı yazı tipiyle basıldığı yerde, aynı harf aralıklarıyla tutar
  let basilan = 0;
  for (const [ad, { img, yerler, yarim }] of duzeltilen) {
    if (yarim) { log(`${ad.padEnd(34)} DÜZELTİLMEDİ: kelimenin bir kısmı kaydırılan dikdörtgende: ${yarim.join(' ')}`); sorun++; continue; }
    if (!yerler.length) continue;
    const G = hazirla(img), tutmayan = yerler.filter(k => tutar(G, k.Md, k.x, k.y, k.pay)?.kalemler.join() !== k.kalemler);
    if (tutmayan.length) { log(`${ad.padEnd(34)} DÜZELTİLMEDİ: basılan kelime yerinde tutmuyor: ${tutmayan.map(k => k.dogru).join(' ')}`); sorun++; continue; }
    cikti.set(ad, kodla(img));
    basilan += yerler.length;
  }
  log(`Görseller: tablodaki ${tablo.length} yerden ${basilan} tanesine doğru kelime basıldı (${[...duzeltilen.values()].filter(d => d.yerler.length).length} görsel).`);
  if (yerYok.length) log(`  Basılamayan ${yerYok.length} yer: ${yerYok.join(' · ')}`);

  // Elle (tablo yolunun sonucu üzerine): tablo yolunun basamadığı noktalar ve çevirmenin çiziminde birbirine yapışmış
  // yazılar. Her biri önce görselin beklenen hâlde olduğunu denetler; değilse dokunmaz.
  const piksel = (img, x, y) => [...img.px.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)].join(',');
  const boya = (img, x, y, renk) => img.px.set(renk.split(',').map(Number), (y * img.w + x) * 4);
  // Kural kitabının başlığı "MEMUR KABİNİ"de ikinci M (sütun 35-42) ile U (43-48) bitişik, öteki harflerin arasında
  // 1 boş sütun var. U'dan sağı (satır 11-21) 1 sütun sağa: aralık açılır, başlığın ortası 61,5 -> 62 (noktalı
  // çizginin ortası 63, İngilizce başlığınki 62,5).
  const memurKabini = ['MEMUR\'da M ile U ayrıldı', (img) => {
    const zemin = piksel(img, 30, 30), dolu = (x, y) => piksel(img, x, y) !== zemin;
    for (let y = 11; y <= 21; y++) if (dolu(104, y)) return ['sütun 104 boş değil'];
    if (![35, 36, 41, 42, 43, 44, 47, 48].every(x => dolu(x, 13)) || [37, 40, 45, 46, 49].some(x => dolu(x, 13))) return ['M ile U beklenen yerde değil'];
    for (let y = 11; y <= 21; y++) { for (let x = 104; x > 43; x--) boya(img, x, y, piksel(img, x - 1, y)); boya(img, 43, y, zemin); }
  }];
  // Eğik damgalarda alt satır: tohum noktalarından 8 komşulukla büyüyen yazı ("x,y"), üst satırın değen uçları hariç
  const altSatir = (yazi, tohumlar, uclar) => {
    const alt = new Set(tohumlar), yigin = [...tohumlar];
    while (yigin.length) {
      const [x, y] = yigin.pop().split(',').map(Number);
      for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) {
        const k = `${x + a},${y + b}`;
        if (yazi.has(k) && !uclar.includes(k) && !alt.has(k)) { alt.add(k); yigin.push(k); }
      }
    }
    return alt;
  };
  // Çeviri hatası satırları (satirDuzeltmeleri, yukarıda): yanlış satır orijinal yazı tipiyle yazan yerde tutmalı ve
  // görselin ortasında olmalı; doğrusu yamalı yazı tipiyle aynı satıra, görselin ortasına yeniden basılır. Çevirmenin
  // satırları ilerlemeleri toplamıyla ortalı, tek genişlikte yarım piksel sola (BulletinInnerFilerTut'ta 3 satır;
  // İngilizce sayfalar da aynı kuralla). Yeniden basılan satırın glif kutuları ve 1 piksel çevresi zemin olmalı.
  const satirlariYenile = (gorsel) => {
    const satirlar = satirDuzeltmeleri.filter(d => d[0] === gorsel);
    return [`çeviri hatası: ${satirlar.length} satır yeniden basıldı`, (img) => {
      const genislik = (M) => M.harfler.reduce((t, h) => t + h.adv, 0), hata = [];
      for (const [, , yanlis, dogru, fad, x, y] of satirlar) {
        const fo = yaziTipi(once, fad), Mo = kelimeMaskesi(fo, yanlis, 1), Md = kelimeMaskesi(yaziTipi(sonra, fad), dogru, 1);
        const s = Mo && Md && tutar(hazirla(img), Mo, x, y, fo.pay);
        if (!s) { hata.push(`"${yanlis}" yazan yerde yok`); continue; }
        if (x !== Math.floor((img.w - genislik(Mo)) / 2)) { hata.push(`"${yanlis}" görselin ortasında değil`); continue; }
        const r = kelimeDegistir(img, Mo, Md, s, 'yeniden', Math.floor((img.w - genislik(Md)) / 2) - x);
        if (typeof r === 'string') hata.push(`"${dogru}": ${r}`);
      }
      return hata;
    }];
  };
  // Kural kitabı başlıklarında (chixa_demibold_14) çevirmenin çiziminde iki harfin arası 0: yapışık harften sağı 1
  // sütun sağa (MEMUR KABİNİ'ndeki gibi). Kutudaki yazı (kutunun en sık rengi zemin) dışarıya yalnızca soldaki harfe
  // (sütun x0-1) bitişik; kutunun üstü, altı ve sağı boş. Başlığın ortası İngilizce başlığınkine eşit ya da yarım
  // piksel yakın olur; soldakini 1 sola almak ortayı İngilizceden uzaklaştırıyor ya da aynı uzaklıkta bırakıyor.
  const harfAc = ([x0, y0, x1, y1], nokta) => (img) => {
    const r32 = (x, y) => img.px.readUInt32LE((y * img.w + x) * 4), say = new Map();
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) say.set(r32(x, y), (say.get(r32(x, y)) ?? 0) + 1);
    const zemin = [...say].sort((a, b) => b[1] - a[1])[0][0], yazi = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (r32(x, y) !== zemin) yazi.push([x, y]);
    if (yazi.length !== nokta) return [`yazı beklenen hâlde değil (${yazi.length} nokta)`];
    for (let x = x0 - 1; x <= x1 + 1; x++) if (r32(x, y0 - 1) !== zemin || r32(x, y1 + 1) !== zemin) return ['kutunun üstü ya da altı boş değil'];
    for (let y = y0; y <= y1; y++) if (r32(x1 + 1, y) !== zemin) return ['kutunun sağı boş değil'];
    if (!yazi.some(([x, y]) => x === x0 && [-1, 0, 1].some(b => r32(x0 - 1, y + b) !== zemin))) return ['harfler bitişik değil'];
    const r = yaziKaydir(img, yazi, zemin, 1, 0);
    if (typeof r === 'string') return [r];
  };
  // [görsel, ne yapıldı, adım]: sırayla uygulanır; bir görselin birden çok adımı olabilir (her biri öncekinin sonucuna)
  const gorseller = [
    // GÜN 04b03_u_regular_8 (".#.#", boşluk, U; tabloda yok, kayıttaki "GÜN" doğru yazılmış), noktalar o yazı tipinin
    // Ü'sündeki gibi. Yazı satır 1-5'te, üstte noktalara yer yok: bir satır aşağı kaydırılır (satır 6-7 boş), U'nun sütunları 17-20
    ['/LoadDay.png', 'GÜN\'e Ü noktaları eklendi', (img) => {
      const zemin = piksel(img, 0, 0), yazi = piksel(img, 17, 1);
      for (let x = 0; x < img.w; x++) if (piksel(img, x, 0) !== zemin || piksel(img, x, 6) !== zemin) return ['satır 0 ya da 6 boş değil'];
      if (yazi === zemin || piksel(img, 20, 1) !== yazi) return ['U beklenen yerde değil'];
      img.px.copyWithin(img.w * 4, 0, img.w * 7 * 4);
      for (let x = 0; x < img.w; x++) boya(img, x, 0, zemin);
      for (const x of [18, 20]) boya(img, x, 0, yazi);
    }],
    // Kural kitabının son sayfası: "DIŞİŞLERİ BAK." satırının Ş çengelleri (satır 55-56, sütun 32-33 ve 44-45) alttaki
    // büyük MALIDIR'a yapışık, birincisi M'ye bir satır daha girmiş (satır 57 sütun 32-33; İngilizce ve Lehçe paketin
    // M'sinde orası boş). Üst satır (İ noktaları, gövde, çengeller: satır 42-56) 2 satır yukarı alınır; çengellerle
    // MALIDIR arasında İngilizce görselde iki satırın arasındaki kadar (2) boş satır kalır. Satır 56 sütun 55'teki nokta
    // MALIDIR'ın L'sinin tepesi (Lehçe paketteki L'de de var), yerinde kalır.
    ['/papers/RulesInnerLast.png', 'Ş çengelleri MALIDIR\'dan ayrıldı', (img) => {
      const zemin = piksel(img, 30, 30), satir = (y) => [...Array(105).keys()].map(i => i + 10).filter(x => piksel(img, x, y) !== zemin).join();
      if (satir(40) || satir(41)) return ['satır 40-41 boş değil'];
      if (satir(55) !== '32,33,44,45' || satir(56) !== '32,33,44,45,55' || !satir(57).startsWith('23,24,25,26,27,28,32,33,34,')) return ['çengeller beklenen yerde değil'];
      for (let y = 42; y <= 56; y++) for (let x = 10; x <= 114; x++) if (y !== 56 || x !== 55) { boya(img, x, y - 2, piksel(img, x, y)); boya(img, x, y, zemin); }
      for (const x of [32, 33]) boya(img, x, 57, zemin);
    }],
    // Kural kitabının kapağındaki eğik damga (bölge 140,108-231,159; sağında aynı renkte sayfa kenarı çizgisi): "DIŞİŞLERİ
    // BAK." satırının iki Ş çengeli alttaki MALIDIR'ın M'sine ve A'sına değiyor (İngilizce damgada iki satırın arasında
    // 1 boş piksel). Alt satır: çengellerin 5 ucu hariç, M, A, LI, D ve IR'nin birer noktasından 8 komşulukla büyüyen
    // yazı (İngilizce damganın M ve A'sıyla ayrılanla aynı 512 nokta); bölgedeki gerisi üst satır. Üst satır 1 sola 2
    // yukarı: satırların arasını İngilizcedeki kadar açan kaydırmaların en kısası, satıra dike de en yakını (11,7°).
    ['/papers/RulesInnerHome.png', 'DIŞİŞLERİ BAK. MALIDIR\'dan ayrıldı', (img) => {
      const r32 = (x, y) => img.px.readUInt32LE((y * img.w + x) * 4), say = new Map(), yazi = new Set();
      for (let y = 108; y <= 159; y++) for (let x = 140; x <= 231; x++) {
        say.set(r32(x, y), (say.get(r32(x, y)) ?? 0) + 1);
        if (piksel(img, x, y) === '148,150,123,255') yazi.add(`${x},${y}`);
      }
      const uclar = ['161,142', '163,143', '172,138', '172,139', '172,140'], tohumlar = ['158,143', '173,143', '185,140', '196,136', '212,135'];
      if (![...uclar, ...tohumlar].every(k => yazi.has(k))) return ['çengel uçları ya da alt satır beklenen yerde değil'];
      const alt = altSatir(yazi, tohumlar, uclar);
      if (yazi.size !== 930 || alt.size !== 512) return [`damga beklenen hâlde değil (yazı ${yazi.size}, alt satır ${alt.size} nokta)`];
      const zemin = [...say].sort((a, b) => b[1] - a[1])[0][0];
      const r = yaziKaydir(img, [...yazi].filter(k => !alt.has(k)).map(k => k.split(',').map(Number)), zemin, -1, -2);
      if (typeof r === 'string') return [r];
    }],
    // Kapakta "Dışişleri" ile "Bakanlığı" (chixa_demibold_14, satır aralığı 11; kapaktaki RULES & REGULATIONS da 11
    // aralıklı): çevirmenin ş çengeli 3 satır (yazı tipinde 2), ilk ş'ninki Bakanlığı'nın k'sinin tepesine biniyor,
    // (48,43) ve (49,43) iki yazının ortak noktası. Bakanlığı 2 aşağı (1'de çengelin ucu k'nin tepesine dikey bitişik
    // kalır): bölgedeki yazı, Dışişleri'nin bölgeye giren çengel noktaları hariç; ortak iki nokta sonra yeniden çengele.
    // Dışişleri İngilizce "Ministry" ile aynı satırda kalır; altta amblem satır 67'den.
    ['/papers/RulesInnerHome.png', 'Dışişleri ile Bakanlığı ayrıldı', (img) => {
      const r32 = (x, y) => img.px.readUInt32LE((y * img.w + x) * 4), renk = r32(48, 43), zemin = r32(30, 30), yazi = [];
      const cengel = ['50,42', '62,42', '60,43', '61,43'];
      for (let y = 42; y <= 53; y++) for (let x = 30; x <= 92; x++) {
        if (r32(x, y) === renk) { if (!cengel.includes(`${x},${y}`)) yazi.push([x, y]); } else if (r32(x, y) !== zemin) return ['bölgede başka renk var'];
      }
      if (renk === zemin || !cengel.every(k => r32(...k.split(',').map(Number)) === renk) || yazi.length !== 237) return [`yazı beklenen hâlde değil (${yazi.length} nokta)`];
      const r = yaziKaydir(img, yazi, zemin, 0, 2);
      if (typeof r === 'string') return [r];
      for (const x of [48, 49]) img.px.writeUInt32LE(renk, (43 * img.w + x) * 4);
      if ([47, 48, 49, 50].some(x => r32(x, 44) !== zemin)) return ['çengelin altı boş değil'];
    }],
    // Dolaptaki eğik damga (bölge 58,44-128,84) negatif: açık etiketin içinde yazı koyu boşluk; etiketin dışındaki koyu
    // zemin yazıyla aynı renk (bölge kenarından 4 komşulukla dolan kısım). Üst satır "DIŞİŞLERİ BAK."ın iki Ş çengeli
    // alttaki büyük "AITTIR."ın A'sına ve ilk I'sına değiyor (İngilizce damgada satırların arasında 1 boş piksel),
    // ikincisi ilk I'nın tam üstünde: nokta I'nın üstüne sığmıyor. Alt satır (çengellerin 4 ucu hariç, A, I, T, TI ve
    // R.'nin birer noktasından büyüyen yazı) 1 aşağı; iki I'nın üst serifi 3x2 nokta olur, altında 1 boş satır (oyunun
    // yazı tiplerindeki İ gibi gövde kısalır), ikinci I T'nin kolundan ayrılır. Üst satıra dokunulmaz: kendi içindeki
    // yapışık harfler damganın tarzı (İngilizce ve resmî çevirilerin hepsinde öyle).
    ['/Filer.png', 'AITTIR. -> AİTTİR., üst satırdan ayrıldı', (img) => {
      const r32 = (x, y) => img.px.readUInt32LE((y * img.w + x) * 4), etiket = r32(95, 50);
      const koyu = (x, y) => x >= 58 && x <= 128 && y >= 44 && y <= 84 && r32(x, y) !== etiket, dis = new Set(), yigin = [];
      for (let y = 44; y <= 84; y++) for (let x = 58; x <= 128; x++) if ((x === 58 || x === 128 || y === 44 || y === 84) && koyu(x, y)) { dis.add(`${x},${y}`); yigin.push([x, y]); }
      while (yigin.length) {
        const [x, y] = yigin.pop();
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (koyu(x + a, y + b) && !dis.has(`${x + a},${y + b}`)) { dis.add(`${x + a},${y + b}`); yigin.push([x + a, y + b]); }
      }
      const yazi = new Set();
      for (let y = 44; y <= 84; y++) for (let x = 58; x <= 128; x++) if (koyu(x, y) && !dis.has(`${x},${y}`)) yazi.add(`${x},${y}`);
      const uclar = ['74,64', '75,64', '82,63', '83,63'], tohumlar = ['72,70', '82,68', '89,70', '100,68', '111,66'];
      if (![...uclar, ...tohumlar].every(k => yazi.has(k))) return ['çengel uçları ya da alt satır beklenen yerde değil'];
      const alt = altSatir(yazi, tohumlar, uclar);
      if (yazi.size !== 593 || alt.size !== 364) return [`damga beklenen hâlde değil (yazı ${yazi.size}, alt satır ${alt.size} nokta)`];
      // kaydırmadan sonra etiket rengine: ilk I'nın serifinin sol taşkını (nokta gövde genişliğinde), iki I'da nokta ile
      // gövdenin arası, ikinci I'yı T'nin kolundan ayıran sütun
      const sil = [[80, 65], [80, 66], [81, 67], [82, 67], [83, 67], [104, 62], [104, 63], [105, 64], [106, 64], [107, 64]];
      if (!sil.every(([x, y]) => alt.has(`${x},${y - 1}`))) return ['I\'lar beklenen yerde değil'];
      const r = yaziKaydir(img, [...alt].map(k => k.split(',').map(Number)), etiket, 0, 1);
      if (typeof r === 'string') return [r];
      for (const [x, y] of sil) img.px.writeUInt32LE(etiket, (y * img.w + x) * 4);
    }],
    ['/papers/RulesInnerBooth.png', ...memurKabini], ['/papers/RulesInnerBooth2.png', ...memurKabini], ['/papers/RulesInnerBooth3.png', ...memurKabini],
    ['/papers/BulletinInnerGunTut.png', ...satirlariYenile('BulletinInnerGunTut')],
    ['/papers/RulesInnerAsylumGrant.png', 'TALEBİ\'nde E ile B ayrıldı', harfAc([69, 22, 108, 32], 63)],
    ['/papers/RulesInnerConfiscation.png', 'MÜSADERESİ\'nde E ile R ayrıldı', harfAc([71, 22, 108, 32], 118)],
    ['/papers/RulesInnerDiplomaticAuth.png', 'DİPLOMATİK\'te L ile O ayrıldı', harfAc([53, 10, 108, 20], 193)],
    ['/papers/RulesInnerDocs.png', 'DOKÜMANLAR\'da L ile A ayrıldı', harfAc([85, 74, 108, 84], 70)],
    // Diplomat eğitim sayfasında sağ sütunun son paragrafı (3 satır, aralık 8; İngilizcede 2 satır): 2. satırdaki
    // "bilgilerini"nin g kuyruğu 3. satırdaki ğ'nin işaretine biniyor, (113,110) ikisinin ortak noktası. 3. satır
    // (işaretinin 110'daki iki noktasıyla) 2 aşağı (1'de dikey bitişik kalır; aralıklar 8, 10); altı boş. Ortak nokta
    // sonra yeniden g'nin kuyruğuna.
    ['/papers/BulletinInnerDiploTut.png', 'g kuyruğu ile ğ ayrıldı', (img) => {
      const r32 = (x, y) => img.px.readUInt32LE((y * img.w + x) * 4), renk = r32(113, 110), zemin = r32(86, 119), yazi = [[113, 110], [115, 110]];
      for (let y = 111; y <= 118; y++) for (let x = 86; x <= 148; x++) {
        if (r32(x, y) === renk) yazi.push([x, y]); else if (r32(x, y) !== zemin) return ['bölgede başka renk var'];
      }
      if (renk === zemin || ![[115, 110], [112, 110], [114, 109]].every(([x, y]) => r32(x, y) === renk) || yazi.length !== 93) return [`yazı beklenen hâlde değil (${yazi.length} nokta)`];
      const r = yaziKaydir(img, yazi, zemin, 0, 2);
      if (typeof r === 'string') return [r];
      img.px.writeUInt32LE(renk, (110 * img.w + 113) * 4);
      if ([112, 113, 114].some(x => r32(x, 111) !== zemin)) return ['g kuyruğunun altı boş değil'];
    }],
  ];
  for (const [ad, ne, f] of gorseller) {
    const img = coz(cikti.get(ad)), hata = [f(img)].flat().filter(Boolean);
    if (hata.length) { log(`${ad.padEnd(34)} DÜZELTİLMEDİ: ${hata.join(', ')}`); sorun++; continue; }
    cikti.set(ad, kodla(img));
    log(`${ad.padEnd(34)} ${ne}`);
  }
  return { cikti, sorun, once, sonra };
}
