# KodyBlocks AI v2

Editor pemrograman blok ala Scratch 3 + ekstensi AI (padanan PictoBlox) milik KodingYuk.
Engine, renderer, audio, dan editor blok **ditulis sendiri** (tanpa scratch-vm / scratch-render /
scratch-blocks / Blockly di kode produksi), tetapi perilakunya harus sama persis dengan Scratch 3.

## Struktur

```
packages/
  engine/      VM: runtime, thread, sequencer, target, primitive per kategori, Cast, IO, extension API
  renderer/    panggung WebGL, skin bitmap/SVG/teks/pena, efek grafis, tabrakan
  audio/       WebAudio player + efek pitch/pan/volume, decoder ADPCM
  blocks-ui/   editor blok SVG: definisi blok, toolbox, workspace, flyout, drag/snap
  project/     project.json Scratch 3, load/save .sb3, autosave IndexedDB
  ai/          ekstensi AI (wajah, tangan, tubuh, gambar, objek, teks, suara) - semua lokal di browser
  ext-pen/     ekstensi Pen
  ext-music/   ekstensi Music
app/           shell React ala KodyBlocks
tests/parity/  differential test lawan scratch-vm asli
tests/e2e/     Playwright
docs/CONTRACTS.md  kontrak antarmodul (baca dulu)
```

## Perintah

```
npm run dev                      # http://127.0.0.1:8620
npm run build                    # typecheck + vite build ke dist/
npm test                         # vitest
npm run test:parity              # parity vs scratch-vm
npm run test:e2e                 # Playwright (butuh browser terpasang)
npm run check:no-scratch-import  # gagal kalau packages/ atau app/ mengimpor scratch-*/blockly
npm run check                    # semua cek di atas kecuali e2e
```

Drive C: sering penuh: `.npmrc` mengarahkan cache npm ke `D:\npm-cache`. Set juga `TMP`/`TEMP`
ke folder di D: sebelum `npm install`.

## Referensi Scratch

`D:\Aril Saputra\Project\Products\_reference` (lihat README di sana). Port kode hanya dari
`_reference/bsd3-local` (BSD-3) dan wajib dicatat di `THIRD_PARTY.md`.
