// Kurucuyu (kurucu.mjs) oyuncunun indireceği tek exe'ye çevirir, sonra exe'yi sahte bir oyun klasöründe sınar.
//   node araclar/kurucu-derle.mjs   ->   derleme/PapersPleaseTR-Kurulum.exe (derleme/ git dışı)
// Girdi: oyunla gelen Türkçe paket yedek/tr.zip'te (git dışı; oyunun PapersPlease_Data/StreamingAssets/loc/tr.zip'i).
// Node'un tek dosya özelliği (SEA): exe, derlemeyi koşturan node.exe'nin kopyası + içine gömülen tek bir CJS betik ve
// dosyalar. SEA .mjs'i ve birden çok dosyayı koşturmuyor: modüller esbuild ile tek dosyaya birleştirilir. Gömülen dosyalar
// iki tablo ve yamalı paketin içerik izi (yedek/tr.zip'ten); kurucu bunları bu adlarla okur (sea.getAsset). Oyunun hiçbir
// dosyası gömülmez. node.exe'nin imzası gömmeden önce kaldırılır: postject imzayı bozuyor, bozuk imza imzasızdan kötü görünür.
// Node'un simgesi ve dosya bilgisi ("Node.js JavaScript Runtime") de gömmeden önce yamanınkiyle değişir (simge.mjs).
// Exe Node.js'i içerdiği için Node'un lisansı (MIT; kopyayla birlikte verilmesi şart) exe'nin yanına indirilir:
// derleme/Node.js-LICENSE.txt, exe ile birlikte dağıtılır. Araçlar npx ile, sabit sürüm (ilk koşuda indirilir).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zipBicim, zipOku, zipYaz } from './zip.mjs';
import { ORIJINAL_SHA, icerikIzi, yamaUret } from './yama.mjs';
import { simgeIco } from './simge.mjs';

const ESBUILD = 'esbuild@0.28.2', POSTJECT = 'postject@1.0.0-alpha.6', RESEDIT = 'resedit-cli@3.1.1';
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YEDEK = path.join(KOK, 'yedek/tr.zip');
const DERLEME = path.join(KOK, 'derleme'), d = (a) => path.join(DERLEME, a);
const EXE_ADI = 'PapersPleaseTR-Kurulum.exe', EXE = d(EXE_ADI);
// Sürüm kurucu.mjs'ten (tek kaynak); Windows'un dosya sürümü dört parçalı
const SURUM = /^const SURUM = '(\d+\.\d+\.\d+)';$/m.exec(fs.readFileSync(path.join(KOK, 'araclar/kurucu.mjs'), 'utf8'))?.[1];
if (!SURUM) { console.error('DURDU: araclar/kurucu.mjs\'te "const SURUM = \'X.Y.Z\';" satırı yok'); process.exit(1); }
// exe'nin özelliklerinde görünen bilgi; Türkçe (1055). Verilmeyen alanlar (şirket, telif) Node'unkiyle birlikte silinir.
const DOSYA_BILGISI = { fileDescription: 'Papers, Please Türkçe yama kurucusu', productName: 'Papers, Please Türkçe Yama', fileVersion: `${SURUM}.0`, productVersion: `${SURUM}.0`, internalName: 'PapersPleaseTR-Kurulum' };

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let sorun = 0;
// başarısız denetimde exe'nin o koşudaki çıktısı bir kez basılır
const denetle = (kosul, ne, kosu) => {
  console.log(`  ${kosul ? 'tamam' : 'BAŞARISIZ'}: ${ne}`);
  if (kosul) return true;
  sorun++;
  if (kosu && !kosu.basildi) { kosu.basildi = true; console.log(`  --- exe'nin çıktısı (çıkış ${kosu.kod}) ---\n${kosu.cikti}${kosu.hata}`.replace(/\n/g, '\n    ')); }
  return false;
};
const dur = (ne) => { console.error(`DURDU: ${ne}`); process.exit(1); };
// npx Windows'ta .cmd: kabuk gerekir; yollar KOK'a göreli ve boşluksuz verilir
function npx(komut) {
  const r = spawnSync(`npx --yes ${komut}`, { shell: true, cwd: KOK, encoding: 'utf8' });
  const cikti = (r.stdout + r.stderr).trim();
  if (cikti) console.log(cikti.replace(/^/gm, '    '));
  if (r.status !== 0) dur(`npx ${komut.split(' ')[0]} çıkış ${r.status}`);
  return cikti;
}

// PE başlığı (PE32+): sertifika tablosu veri dizininin 5. girdisi; sağlama toplamı isteğe bağlı başlığın 64. baytında
function peBaslik(b) {
  const pe = b.readUInt32LE(0x3c);
  if (b.toString('latin1', pe, pe + 4) !== 'PE\0\0' || b.readUInt16LE(pe + 24) !== 0x20b) dur('node.exe 64 bit PE değil');
  return { guvenlik: pe + 24 + 112 + 4 * 8, saglamaAlani: pe + 24 + 64 };
}
// Windows'un PE sağlama toplamı (alanın kendisi hariç 16 bitlik toplam + dosya boyu); node.exe'nin alanındaki değeri tutuyor
function peSaglama(b, alan) {
  let t = 0;
  for (let i = 0; i < b.length; i += 2) {
    if (i === alan || i === alan + 2) continue;
    t += i + 1 < b.length ? b.readUInt16LE(i) : b[i];
    t = (t & 0xffff) + (t >>> 16);
  }
  return ((t & 0xffff) + (t >>> 16) + b.length) >>> 0;
}

fs.mkdirSync(DERLEME, { recursive: true });
fs.rmSync(EXE, { force: true });
fs.rmSync(d('bilgi.json'), { force: true });
// derlemenin girdileri (bilgi.json'a; yayin.mjs yayına giden kodun bu derlemeninki olduğunu buradan denetler)
const kaynaklar = Object.fromEntries(fs.readdirSync(path.join(KOK, 'araclar')).sort().map((a) => [`araclar/${a}`, sha(fs.readFileSync(path.join(KOK, 'araclar', a)))]));

console.log('1. Yamalı paketin içerik izi (yedek/tr.zip)');
if (!fs.existsSync(YEDEK) || sha(fs.readFileSync(YEDEK)) !== ORIJINAL_SHA) dur('yedek/tr.zip yok ya da ORIJINAL_SHA değil');
const tablolar = { duzeltmelerMetni: fs.readFileSync(path.join(KOK, 'araclar/duzeltmeler.tsv'), 'utf8'), yerlerMetni: fs.readFileSync(path.join(KOK, 'araclar/gorsel-yerler.tsv'), 'utf8') };
const rapor = [];
const { cikti, sorun: uretimSorunu } = yamaUret(zipOku(YEDEK), { ...tablolar, log: (s) => rapor.push(s) });
if (uretimSorunu) { console.log(rapor.join('\n').replace(/^/gm, '    ')); dur(`yamaUret ${uretimSorunu} sorun bildirdi (raporu yukarıda)`); }
const yamaliIz = icerikIzi(cikti);
fs.writeFileSync(d('yamali-iz.txt'), yamaliIz + '\n');
console.log(`  ${yamaliIz}`);

console.log(`2. Modüller tek CJS dosyaya (${ESBUILD})`);
npx(`${ESBUILD} araclar/kurucu.mjs --bundle --platform=node --format=cjs --target=node${process.versions.node.split('.')[0]} --outfile=derleme/kurucu.cjs --metafile=derleme/meta.json --log-level=warning`);
const paketlenen = Object.keys(JSON.parse(fs.readFileSync(d('meta.json'), 'utf8')).inputs).sort(); // exe'ye giren modüller

console.log('3. SEA blob (kurucu.cjs + tablolar + iz)');
// main göreli: Node onu yazıldığı gibi blob'a da koyuyor; tam yol olsa exe derlendiği klasöre göre değişir (ve yolu taşır)
fs.writeFileSync(d('sea-config.json'), JSON.stringify({
  main: 'derleme/kurucu.cjs', output: d('kurucu.blob'), disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false,
  assets: { 'duzeltmeler.tsv': path.join(KOK, 'araclar/duzeltmeler.tsv'), 'gorsel-yerler.tsv': path.join(KOK, 'araclar/gorsel-yerler.tsv'), 'yamali-iz.txt': d('yamali-iz.txt') },
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', d('sea-config.json')], { stdio: 'inherit', cwd: KOK });

console.log(`4. node.exe ${process.version} kopyası, imzası kaldırılmış`);
const node = fs.readFileSync(process.execPath), { guvenlik, saglamaAlani } = peBaslik(node);
const sertifika = node.readUInt32LE(guvenlik), sertifikaBoy = node.readUInt32LE(guvenlik + 4);
if (node.indexOf(`${FUSE}:0`) < 0) dur('node.exe\'de SEA işareti yok (bu Node sürümü SEA desteklemiyor ya da işaretin adı değişti)');
let kopya = node;
if (sertifikaBoy) {
  if (sertifika + sertifikaBoy !== node.length) dur('sertifika tablosu dosyanın sonunda değil');
  kopya = Buffer.from(node.subarray(0, sertifika));
  kopya.writeUInt32LE(0, guvenlik);
  kopya.writeUInt32LE(0, guvenlik + 4);
}
fs.writeFileSync(EXE, kopya);

console.log(`5. Simge ve dosya bilgisi (${RESEDIT})`);
const ico = simgeIco();
fs.writeFileSync(d('simge.ico'), ico);
// Türkçe metin kabuktan geçmesin diye tanım dosyasıyla; önce Node'un bütün simgeleri silinir, sonra bizimki yazılır.
// --allow-shrink: kaynak bölümü dosyada da küçülür. Yoksa bölüm bellekte küçülüp dosyada eski boyda kalıyor, sonraki
// bölümün adresine taşıyor; postject reloc tablosunu o bölümden okuyup "Relocation corrupted" diyor (exe yine çalışıyordu).
fs.writeFileSync(d('kaynak.json'), JSON.stringify({ lang: 1055, icons: [{ id: 1, sourceFile: d('simge.ico') }], version: { ...DOSYA_BILGISI, originalFileName: EXE_ADI } }, null, 2));
npx(`${RESEDIT} --in derleme/${EXE_ADI} --out derleme/kaynakli.exe --definition derleme/kaynak.json --delete-allicon --allow-shrink`);
fs.renameSync(d('kaynakli.exe'), EXE);

console.log(`6. Blob exe'ye gömülüyor (${POSTJECT})`);
const pj = npx(`${POSTJECT} derleme/${EXE_ADI} NODE_SEA_BLOB derleme/kurucu.blob --sentinel-fuse ${FUSE}`);
if (/signature/i.test(pj)) dur('postject imza uyarısı verdi');
if (/error/i.test(pj)) dur('postject hata bildirdi (exe çalışsa bile dosya düzeni bozuk olabilir)');
const exe = fs.readFileSync(EXE), utf16 = (s) => Buffer.from(s, 'utf16le');
if (exe.indexOf(`${FUSE}:1`) < 0) dur('exe\'de SEA işareti açılmamış');
const pngler = []; // .ico'daki PNG'ler (girdilerdeki boy ve konumdan); postject kaynakları yeniden yazdığı için son exe'de aranır
for (let i = 0; i < ico.readUInt16LE(4); i++) pngler.push(ico.subarray(ico.readUInt32LE(6 + 16 * i + 12), ico.readUInt32LE(6 + 16 * i + 12) + ico.readUInt32LE(6 + 16 * i + 8)));
if (!pngler.every((p) => exe.indexOf(p) >= 0)) dur('simgenin boylarından biri exe\'de yok');
if (exe.indexOf(utf16(DOSYA_BILGISI.fileDescription)) < 0) dur('dosya açıklaması exe\'de yok');
if (exe.indexOf(utf16('Node.js JavaScript Runtime')) >= 0) dur('Node\'un dosya açıklaması exe\'de kalmış');
for (const y of [KOK, os.homedir()]) if (exe.indexOf(y) >= 0 || exe.indexOf(utf16(y)) >= 0) dur(`exe'de derleme makinesinin yolu geçiyor (${y === KOK ? 'depo' : 'ev'} klasörü): başka klasörde derleyen aynı exe'yi alamaz, kullanıcı adı sızabilir`);
exe.writeUInt32LE(peSaglama(exe, saglamaAlani), saglamaAlani); // postject sağlama toplamını güncellemiyor olabilir
fs.writeFileSync(EXE, exe);

console.log('7. Exe sahte oyun klasöründe sınanıyor');
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'kurucu-sina-'));
const oyun = path.join(gecici, 'oyun'), veri = path.join(gecici, 'veri');
const oyunZip = path.join(oyun, 'PapersPlease_Data/StreamingAssets/loc/tr.zip');
fs.mkdirSync(path.dirname(oyunZip), { recursive: true });
fs.copyFileSync(YEDEK, oyunZip);
// kurucu oyunun sürümünü yalnızca ekranda gösterir; derleme oyun klasörünün dışında da (açık depoda) koşsun diye sabit metin
fs.writeFileSync(path.join(oyun, 'PapersPlease_Data/StreamingAssets/Version.txt'), 'sahte oyun klasörü\n');
zipYaz(path.join(gecici, 'beklenen.zip'), cikti, zipBicim(YEDEK)); // tr-yama.mjs'in oyuna yazdığı biçim
const beklenen = sha(fs.readFileSync(path.join(gecici, 'beklenen.zip')));
const kos = (argumanlar, girdi) => {
  const r = spawnSync(EXE, argumanlar, { input: girdi, encoding: 'utf8', timeout: 120000, windowsHide: true });
  return { kod: r.status, cikti: r.stdout ?? '', hata: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
};
const ozetYol = (y) => { try { return sha(fs.readFileSync(y)); } catch { return null; } }, ozet = () => ozetYol(oyunZip);
try {
  let r = kos(['--oyun', path.join(gecici, 'yok'), '--veri', veri], '\n');
  denetle(r.kod === 0 && r.cikti.includes('Bu klasörde oyunun Türkçe paketi yok') && !r.hata, 'yanlış --oyun klasörü, sonra boş: çıkış 0 (argümanlar exe\'ye geçiyor)', r);
  r = kos(['--oyun', oyun, '--veri', veri], '1\n');
  denetle(r.kod === 0 && r.cikti.includes('Yama kuruldu.') && !r.hata, 'orijinalde 1: "Yama kuruldu.", çıkış 0, hata çıktısı yok', r);
  denetle(ozet() === beklenen, `kurulan paket tr-yama.mjs'inkiyle bayt bayt aynı (${beklenen.slice(0, 8)})`, r);
  denetle(ozetYol(path.join(veri, 'tr.zip')) === ORIJINAL_SHA, 'yedek oyunla gelen paket', r);
  denetle(fs.readdirSync(oyun).join() === 'PapersPlease_Data', 'oyun kökünde geçici dosya kalmadı', r);
  r = kos(['--oyun', oyun, '--veri', veri], '1\n');
  denetle(r.kod === 0 && r.cikti.includes('Yama kaldırıldı') && ozet() === ORIJINAL_SHA, 'yamalıda 1: kaldırıldı, paket oyunla gelen', r);
  const bozuk = fs.readFileSync(oyunZip);
  bozuk[bozuk.length >> 1] ^= 1;
  fs.writeFileSync(oyunZip, bozuk);
  r = kos(['--oyun', oyun, '--veri', veri], '1\n');
  denetle(r.kod === 1 && r.cikti.includes('Türkçe paket tanınmadı') && ozet() === sha(bozuk), '1 baytı bozuk paket: tanınmadı, çıkış 1, dokunulmadı', r);
} finally {
  fs.rmSync(gecici, { recursive: true, force: true });
}

console.log(`8. Node.js ${process.version} lisansı`);
const lisansAdresi = `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`;
const lisans = await fetch(lisansAdresi).then((y) => y.ok ? y.text() : null, () => null);
fs.rmSync(d('Node.js-LICENSE.txt'), { force: true });
if (lisans?.startsWith('Node.js is licensed for use as follows:')) fs.writeFileSync(d('Node.js-LICENSE.txt'), lisans);
denetle(fs.existsSync(d('Node.js-LICENSE.txt')), `${lisansAdresi} indirildi, exe'nin yanında`);

const son = fs.readFileSync(EXE);
console.log(`\n${EXE}\n  ${(son.length / 1e6).toFixed(1)} MB · sha256 ${sha(son)} · içinde Node ${process.version}`);
if (fs.existsSync(d('Node.js-LICENSE.txt'))) console.log(`${d('Node.js-LICENSE.txt')} (exe ile birlikte dağıtılır)`);
// yayin.mjs README'ye buradan yazar; yalnızca bütün denetimler geçince
if (!sorun) fs.writeFileSync(d('bilgi.json'), JSON.stringify({ surum: SURUM, node: process.version, exe: EXE_ADI, sha256: sha(son), boy: son.length, paketlenen, kaynaklar }, null, 2) + '\n');
console.log(sorun ? `BAŞARISIZ: ${sorun} denetim` : 'Derleme ve sınama tamam.');
process.exit(sorun ? 1 : 0);
