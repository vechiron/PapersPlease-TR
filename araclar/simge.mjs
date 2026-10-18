// Kurucu exe'nin simgesi: kâğıt üstünde kırmızı "TR" damgası. Özgün 16x16 piksel çizimi (oyunun hiçbir görselinden
// alınmadı); büyük boylar pikseller tam katla büyütülerek çıkar, oyunun iri piksel tarzı korunur.
//   node araclar/simge.mjs <önizleme.png>   ->   simgenin bütün boyları yan yana, açık ve koyu zemin üstünde
// kurucu-derle.mjs simgeIco() ile .ico'yu üretip exe'ye yazar.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { kodla, yeni } from './png.mjs';

const RENK = { K: [0x3d, 0x34, 0x2b], P: [0xe6, 0xd8, 0xb8], L: [0xa3, 0x96, 0x7c], R: [0xb5, 0x2f, 0x2a] };
const CIZIM = [
  '.KKKKKKKKKKK....',
  '.KPPPPPPPPPK....',
  '.KPLLLLLLLPK....',
  '.KPPPPPPPPPK....',
  '.KPLLLLLPPPK....',
  '.KPPPPPPPPPK....',
  '.KPPPPPPPPPK....',
  '.KPPPRRRRRRRRRRR',
  '.KPPPRPPPPPPPPPR',
  '.KPPPRPRRRPRRPPR',
  '.KPPPRPPRPPRPRPR',
  '.KPPPRPPRPPRRPPR',
  '.KKKKRPPRPPRPRPR',
  '.....RPPRPPRPRPR',
  '.....RPPPPPPPPPR',
  '.....RRRRRRRRRRR',
];
export const BOYLAR = [16, 32, 48, 256];

function ciz(boy) {
  const kat = boy / CIZIM.length, img = yeni(boy, boy);
  for (let y = 0; y < boy; y++) for (let x = 0; x < boy; x++) {
    const r = RENK[CIZIM[Math.floor(y / kat)][Math.floor(x / kat)]];
    if (r) img.px.set([...r, 255], (y * boy + x) * 4);
  }
  return img;
}

// .ico: 6 baytlık başlık, her boy için 16 baytlık girdi, sonra PNG'ler (Windows Vista'dan beri her boyda PNG okunur)
export function simgeIco() {
  const pngler = BOYLAR.map((b) => kodla(ciz(b)));
  const baslik = Buffer.alloc(6 + 16 * pngler.length);
  baslik.writeUInt16LE(1, 2);
  baslik.writeUInt16LE(pngler.length, 4);
  let ofs = baslik.length;
  pngler.forEach((p, i) => {
    const g = 6 + 16 * i, b = BOYLAR[i] % 256; // 256 -> 0
    baslik[g] = b; baslik[g + 1] = b;
    baslik.writeUInt16LE(1, g + 4);
    baslik.writeUInt16LE(32, g + 6);
    baslik.writeUInt32LE(p.length, g + 8);
    baslik.writeUInt32LE(ofs, g + 12);
    ofs += p.length;
  });
  return Buffer.concat([baslik, ...pngler]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  if (!process.argv[2]) { console.error('kullanım: node araclar/simge.mjs <önizleme.png>'); process.exit(1); }
  const ara = 8, gen = BOYLAR.reduce((t, b) => t + b + ara, ara), yuk = 2 * (256 + 2 * ara);
  const img = yeni(gen, yuk);
  for (let y = 0; y < yuk; y++) for (let x = 0; x < gen; x++) img.px.set(y < yuk / 2 ? [0xf3, 0xf3, 0xf3, 255] : [0x20, 0x20, 0x20, 255], (y * gen + x) * 4);
  for (const zemin of [0, yuk / 2]) {
    let x0 = ara;
    for (const b of BOYLAR) {
      const s = ciz(b), y0 = zemin + ara;
      for (let y = 0; y < b; y++) for (let x = 0; x < b; x++) {
        const i = (y * b + x) * 4;
        if (s.px[i + 3]) s.px.copy(img.px, ((y0 + y) * gen + x0 + x) * 4, i, i + 4);
      }
      x0 += b + ara;
    }
  }
  fs.writeFileSync(process.argv[2], kodla(img));
  console.log(`${process.argv[2]} (${BOYLAR.join(', ')} piksel; üstte açık, altta koyu zemin)`);
}
