// Oyuncunun programı: Papers, Please'in Türkçe paketine (loc/tr.zip) yamayı kurar ya da kaldırır.
// Oyunun hiçbir dosyası programda yok: yamalı paket oyuncunun kendi tr.zip'inden üretilir (araclar/yama.mjs; geliştiricinin
// tr-yama.mjs'iyle aynı kod). Exe'ye araclar/kurucu-derle.mjs çevirir; tablolar ve yamalı paketin içerik izi exe'ye gömülür.
// Sıra: üret, izle karşılaştır (bu bilgisayarda da aynı yama mı), geçici dosyaya yaz, geri okuyup denetle, sonra tr.zip'in
// yerine tek adımda geçir. Oyunla gelen paketin yedeği oyun klasörünün dışında (kaldırmak için).
//
// Sınama için (proje kökünden; exe aynı parametreleri alır):
//   node araclar/kurucu.mjs [--oyun <oyun klasörü>] [--veri <yedek klasörü>]
// --oyun yoksa oyun Steam'in kayıtlarından bulunur; --veri yoksa %LOCALAPPDATA%\PapersPleaseTR.
// Cevaplar stdin'den satır satır okunur (boruyla da verilebilir).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import sea from 'node:sea';
import { bicimFarklari, zipBicim, zipOku, zipYaz } from './zip.mjs';
import { ORIJINAL_SHA, icerikIzi, yamaUret } from './yama.mjs';

// Yamanın sürümü için tek kaynak: kurucu-derle.mjs exe'nin dosya bilgisine, yayin.mjs README'ye buradan okur.
const SURUM = '1.0.0';
const OYUN_SURUMU = '1.4.11.124'; // ORIJINAL_SHA'nın geldiği sürüm (yama.mjs)
const TR_ZIP = path.join('PapersPlease_Data', 'StreamingAssets', 'loc', 'tr.zip');
// Oyun klasörünün kökünde: tr.zip ile aynı diskte, yerine tek adımda geçer. Adı .zip ile bitmez (dil paketi sanılmasın).
const GECICI = 'tr.zip.yama-gecici';
const STEAM_DOGRULA = 'Oyunla gelen paketi geri getirmek için: Steam\'de oyuna sağ tıklayın > Özellikler > Yüklü Dosyalar >\n"Oyun dosyalarının bütünlüğünü doğrula".';

class Sorun extends Error {} // oyuncuya olduğu gibi gösterilen
class Vazgec extends Error {}

const arg = process.argv.slice(2), secenek = (ad) => { const i = arg.indexOf(ad); return i >= 0 ? arg[i + 1] : null; };
const VERI = path.resolve(secenek('--veri') ?? path.join(process.env.LOCALAPPDATA || os.homedir(), 'PapersPleaseTR'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const yaz = (s = '') => process.stdout.write(s + '\n');
const gunlukSatirlari = [`--- ${new Date().toISOString()} kurucu ${SURUM} ---`];
const gunluk = (s) => gunlukSatirlari.push(s);

// stdin satırları kuyrukta: boruyla gelen satırlar soru sorulmadan önce gelse de kaybolmaz
const satirlar = [], bekleyenler = [];
let girdiBitti = false;
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', (s) => bekleyenler.length ? bekleyenler.shift()(s) : satirlar.push(s));
rl.on('close', () => { girdiBitti = true; while (bekleyenler.length) bekleyenler.shift()(null); });
// cevap (çevresindeki boşluk ve tırnaklar atılmış; "Yol olarak kopyala" tırnaklı verir) ya da girdi bittiyse null
async function sor(soru) {
  process.stdout.write(soru);
  const s = satirlar.length ? satirlar.shift() : girdiBitti ? null : await new Promise((ok) => bekleyenler.push(ok));
  if (!process.stdin.isTTY) yaz(s ?? '');
  return s === null ? null : s.trim().replace(/^"(.*)"$/, '$1').trim();
}

// Exe'de tablolar ve yamalı paketin içerik izi gömülü (kurucu-derle.mjs); doğrudan çalıştırmada proje dosyalarından,
// iz derlemedeki gibi yedek/tr.zip'ten.
function gomuluVeri() {
  if (sea.isSea()) return { duzeltmelerMetni: sea.getAsset('duzeltmeler.tsv', 'utf8'), yerlerMetni: sea.getAsset('gorsel-yerler.tsv', 'utf8'), yamaliIz: sea.getAsset('yamali-iz.txt', 'utf8').trim() };
  const kok = path.resolve(path.dirname(process.argv[1]), '..'), oku = (a) => fs.readFileSync(path.join(kok, 'araclar', a), 'utf8');
  const tablolar = { duzeltmelerMetni: oku('duzeltmeler.tsv'), yerlerMetni: oku('gorsel-yerler.tsv') };
  return { ...tablolar, yamaliIz: icerikIzi(yamaUret(zipOku(path.join(kok, 'yedek', 'tr.zip')), { ...tablolar, log: () => {} }).cikti) };
}

const oyunKlasoru = (k) => fs.existsSync(path.join(k, TR_ZIP));

// Steam: kurulum yeri kayıt defterinde, kütüphaneler libraryfolders.vdf'te; oyun, kurulum kaydı (appmanifest_239030.acf)
// olan kütüphanede. Kütüphane listesinin "apps" bölümüne güvenilmez: oyunun kurulu olduğu bir bilgisayarda 239030 orada yoktu.
function oyunuBul() {
  const steamlar = [];
  for (const [anahtar, deger] of [['HKCU\\Software\\Valve\\Steam', 'SteamPath'], ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'], ['HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath']]) {
    try {
      // reg'in çıktısı konsolun kod sayfasında: Türkçe harfli yol bozuk gelir, ASCII olmayan yol atlanır
      const c = execFileSync('reg', ['query', anahtar, '/v', deger], { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
      const m = new RegExp(`${deger}\\s+REG_SZ\\s+([\\x20-\\x7e]+?)\\s*$`, 'm').exec(c);
      if (m) steamlar.push(path.resolve(m[1]));
    } catch { /* anahtar yok ya da Windows değil */ }
  }
  steamlar.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  const adaylar = [path.dirname(process.execPath)]; // exe oyun klasörüne konduysa
  for (const steam of steamlar) {
    let vdf;
    try { vdf = fs.readFileSync(path.join(steam, 'steamapps', 'libraryfolders.vdf'), 'utf8'); } catch { continue; }
    for (const kutuphane of [steam, ...[...vdf.matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, '\\'))]) {
      try {
        const dizin = /"installdir"\s+"([^"]+)"/.exec(fs.readFileSync(path.join(kutuphane, 'steamapps', 'appmanifest_239030.acf'), 'utf8'))?.[1];
        if (dizin) adaylar.push(path.join(kutuphane, 'steamapps', 'common', dizin));
      } catch { /* bu kütüphanede değil */ }
    }
  }
  return adaylar.find(oyunKlasoru) ?? null;
}

// oyundaki paket: 'orijinal' (oyunla geldiği gibi), 'yamali' (bu yama kurulu) ya da 'taninmadi'
function durumu(oyunZip, yamaliIz) {
  if (sha(fs.readFileSync(oyunZip)) === ORIJINAL_SHA) return 'orijinal';
  try { return icerikIzi(zipOku(oyunZip)) === yamaliIz ? 'yamali' : 'taninmadi'; } catch { return 'taninmadi'; }
}

function oyunAcik() {
  try {
    const c = execFileSync('tasklist', ['/FI', 'IMAGENAME eq PapersPlease.exe', '/NH', '/FO', 'CSV'], { encoding: 'latin1', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    return /"PapersPlease\.exe"/i.test(c);
  } catch { return false; } // tasklist yok (Windows değil): oyun dosyayı tutuyorsa yerine geçirme zaten hata verir
}
async function oyunKapanana() {
  while (oyunAcik()) {
    const c = await sor('Oyun açık. Oyunu kapatın, sonra Enter\'a basın (vazgeçmek için 0): ');
    if (c === null || c === '0') throw new Vazgec();
  }
}

// Oyunla gelen paketin yedeği: varsa ve sağlamsa olduğu gibi kalır
function yedekAl(veri, orijinal) {
  const yol = path.join(veri, 'tr.zip');
  try { if (sha(fs.readFileSync(yol)) === ORIJINAL_SHA) return; } catch { /* yok */ }
  fs.mkdirSync(veri, { recursive: true });
  fs.writeFileSync(yol + '.gecici', orijinal);
  fs.renameSync(yol + '.gecici', yol);
  if (sha(fs.readFileSync(yol)) !== ORIJINAL_SHA) throw new Sorun(`Oyunla gelen paketin yedeği alınamadı (${yol}); oyunun dosyası değişmedi.`);
  gunluk(`yedek: ${yol}`);
}

// geçici dosyayı tr.zip'in yerine geçirir (oyun kapandıktan sonra); dönen: oyundaki dosya yazılanla aynı mı
let oyunDosyasiDegisti = false;
async function yerineKoy(gecici, oyunZip) {
  const yeni = fs.readFileSync(gecici);
  await oyunKapanana();
  fs.renameSync(gecici, oyunZip);
  oyunDosyasiDegisti = true;
  return fs.readFileSync(oyunZip).equals(yeni);
}

async function kur(oyunZip, gecici, veri, gomulu) {
  const orijinal = fs.readFileSync(oyunZip);
  if (sha(orijinal) !== ORIJINAL_SHA) throw new Sorun('Türkçe paket bu arada değişmiş; oyunun dosyası değişmedi.');
  yaz('Yama hazırlanıyor...');
  const { cikti, sorun } = yamaUret(zipOku(oyunZip), { duzeltmelerMetni: gomulu.duzeltmelerMetni, yerlerMetni: gomulu.yerlerMetni, log: gunluk });
  const iz = icerikIzi(cikti);
  gunluk(`üretilen paketin izi: ${iz} (sorun ${sorun})`);
  if (sorun || iz !== gomulu.yamaliIz) throw new Sorun('Yama bu bilgisayarda beklenen sonucu vermedi; oyunun dosyası değişmedi.');
  yedekAl(veri, orijinal);
  zipYaz(gecici, cikti, zipBicim(oyunZip));
  const bicim = bicimFarklari(zipBicim(oyunZip), zipBicim(gecici));
  if (icerikIzi(zipOku(gecici)) !== gomulu.yamaliIz || bicim.length) throw new Sorun('Yazılan paket denetimden geçmedi; oyunun dosyası değişmedi.');
  if (!await yerineKoy(gecici, oyunZip)) throw new Sorun(`Türkçe paket yazıldı ama geri okununca tutmadı.\n${STEAM_DOGRULA}`);
  gunluk(`kuruldu: tr.zip sha256 ${sha(fs.readFileSync(oyunZip))}`);
}

async function kaldir(oyunZip, gecici, veri) {
  let yedek = null;
  try { yedek = fs.readFileSync(path.join(veri, 'tr.zip')); } catch { /* yok */ }
  if (!yedek || sha(yedek) !== ORIJINAL_SHA) throw new Sorun(`Oyunla gelen paketin yedeği bulunamadı (${path.join(veri, 'tr.zip')}).\n${STEAM_DOGRULA}`);
  fs.writeFileSync(gecici, yedek);
  if (sha(fs.readFileSync(gecici)) !== ORIJINAL_SHA) throw new Sorun('Yedek oyun klasörüne kopyalanamadı; oyunun dosyası değişmedi.');
  if (!await yerineKoy(gecici, oyunZip)) throw new Sorun(`Türkçe paket geri kondu ama geri okununca tutmadı.\n${STEAM_DOGRULA}`);
  gunluk('kaldırıldı');
}

let oyun = null;
async function ana() {
  process.title = 'Papers, Please - Türkçe yama';
  yaz(`Papers, Please — Türkçe yama ${SURUM}`);
  yaz('Oyunla gelen Türkçe çevirinin yazı tiplerine İ ve ı harflerini ekler, yazım hatalarını düzeltir.');
  yaz();
  const gomulu = gomuluVeri();
  oyun = secenek('--oyun') ? path.resolve(secenek('--oyun')) : oyunuBul();
  while (!oyun || !oyunKlasoru(oyun)) {
    yaz(oyun ? `Bu klasörde oyunun Türkçe paketi yok: ${oyun}` : 'Oyun bulunamadı.');
    yaz('Oyunun klasörünü yazın ya da yapıştırın. Steam\'de oyuna sağ tıklayıp "Yerel dosyalara göz at" ile açılan');
    yaz('pencerenin adres çubuğundaki yol.');
    const c = await sor('Klasör (çıkmak için boş bırakıp Enter): ');
    if (!c) return 0;
    oyun = path.resolve(c);
  }
  const oyunZip = path.join(oyun, TR_ZIP), gecici = path.join(oyun, GECICI);
  fs.rmSync(gecici, { force: true }); // yarıda kalmış bir önceki çalıştırmadan
  let surum = '?';
  try { surum = fs.readFileSync(path.join(oyun, 'PapersPlease_Data', 'StreamingAssets', 'Version.txt'), 'utf8').trim(); } catch { /* yok */ }
  yaz(`Oyun: ${oyun} (sürüm ${surum})`);
  const durum = durumu(oyunZip, gomulu.yamaliIz);
  gunluk(`oyun: ${oyun} (sürüm ${surum}); Türkçe paket: ${durum}; veri: ${VERI}`);
  if (durum === 'taninmadi') {
    yaz('Türkçe paket tanınmadı: ne oyunla geldiği hâli ne de bu yamanın kurduğu hâli. Oyun güncellenmiş ya da paket');
    yaz(`başka bir programla değiştirilmiş olabilir. Bu yama oyunun ${OYUN_SURUMU} sürümü içindir. Dosyaya dokunulmadı.`);
    yaz(STEAM_DOGRULA);
    yaz('Sonra bu programı yeniden çalıştırın.');
    return 1;
  }
  yaz(durum === 'orijinal' ? 'Türkçe paket: oyunla geldiği gibi, yama kurulu değil.' : 'Türkçe paket: bu yama kurulu.');
  yaz();
  yaz(durum === 'orijinal' ? '  1  Yamayı kur' : '  1  Yamayı kaldır (oyunla gelen Türkçe paketi geri koy)');
  yaz('  0  Çık');
  for (;;) {
    const c = await sor('Seçiminiz (1 ya da 0): ');
    if (c === null || c === '0') return 0;
    if (c === '1') break;
  }
  await oyunKapanana();
  if (durum === 'orijinal') {
    await kur(oyunZip, gecici, VERI, gomulu);
    yaz();
    yaz('Yama kuruldu. Oyunu açın; dil Türkçe değilse oyunun dil seçeneğinden Türkçe\'yi seçin.');
    yaz('Oyunun bir güncellemesi ya da Steam\'in dosya doğrulaması yamayı kaldırabilir: o zaman bu programı yeniden çalıştırın.');
  } else {
    await kaldir(oyunZip, gecici, VERI);
    yaz();
    yaz('Yama kaldırıldı: oyunla gelen Türkçe paket geri kondu.');
  }
  return 0;
}

// exe'ye çevrilen biçimde (CJS) dosya düzeyinde await yok
(async () => {
  let kod;
  try {
    kod = await ana();
  } catch (e) {
    kod = 1;
    if (e instanceof Vazgec) { yaz('Vazgeçildi; oyunun dosyası değişmedi.'); kod = 0; } else {
      const bilinen = e instanceof Sorun ? e.message : ['EPERM', 'EACCES'].includes(e.code)
        ? 'Oyunun klasörüne yazma izni yok. Programa sağ tıklayıp "Yönetici olarak çalıştır" ile yeniden deneyin.'
        : e.code === 'EBUSY' ? 'Dosya kullanımda (oyun ya da başka bir program açık olabilir). Kapatıp yeniden deneyin.' : null;
      yaz();
      yaz(`Sorun: ${bilinen ?? `beklenmeyen bir hata (${e.message}).`}`);
      if (!(e instanceof Sorun)) yaz(oyunDosyasiDegisti ? `Türkçe paket değişti ama denetlenemedi.\n${STEAM_DOGRULA}` : 'Oyunun dosyası değişmedi.');
      gunluk(`HATA: ${e.stack}`);
    }
  } finally {
    if (oyun) fs.rmSync(path.join(oyun, GECICI), { force: true });
  }
  try {
    fs.mkdirSync(VERI, { recursive: true });
    fs.appendFileSync(path.join(VERI, 'kurulum.log'), gunlukSatirlari.join('\n') + '\n');
    if (kod) yaz(`Ayrıntılar: ${path.join(VERI, 'kurulum.log')}`);
  } catch { /* günlük yazılamadı: işin sonucu değişmez */ }
  if (process.stdin.isTTY) await sor('\nKapatmak için Enter\'a basın.');
  rl.close();
  process.exit(kod);
})();
