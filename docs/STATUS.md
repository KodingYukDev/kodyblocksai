# KodyBlocks AI v2 - Status integrasi

Tanggal: 2026-10-10. Ditulis oleh agent integrasi setelah semua agent build selesai.
Semua angka di bawah berasal dari perintah yang benar-benar dijalankan hari ini (lihat bagian "Cara mengulang").

## Ringkasan

App sudah jalan dari awal sampai akhir di browser (dev dan build produksi):
buka app -> project default (Kody + latar putih) -> seret "ketika bendera diklik", "gerak 10 langkah",
"katakan Halo!" -> klik bendera -> Kody bergeser ke x=10 dan balon "Halo!" muncul -> simpan .sb3 ->
"Baru" -> muat .sb3 -> skrip, nama sprite, dan posisi kembali. Alur ini diuji Playwright di desktop
1280x800 dan tablet 820x1180 (lulus), screenshot di `docs/screenshots/`.

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit -p .` | 0 error |
| `npx vitest run` (semua) | 99 file, 1528 lulus, 3 skip (3 skip = kasus parity yang masih beda, lihat bawah) |
| `npm run check:no-scratch-import` | OK (packages/ dan app/ tidak mengimpor scratch-*/blockly) |
| `npx vite build` | sukses, `dist/` 7.4 MB + `dist/models` 69 MB (model AI) |
| Playwright `tests/e2e` (desktop + tablet) | 4/4 lulus |
| Build produksi + header CSP dari `app/public/_headers` | app, ekstensi Pena/Musik/AI, AI Lab tampil tanpa error konsol dan tanpa pelanggaran CSP |

## Parity dengan Scratch 3 (angka dari harness `tests/parity`)

Engine kita vs scratch-vm asli (oracle), trace state per frame dibandingkan persis.

| Kategori | Kasus | Sama | Beda | Error | Parity |
|---|---:|---:|---:|---:|---:|
| motion | 15 | 14 | 1 | 0 | 93% |
| looks | 12 | 11 | 1 | 0 | 92% |
| sound | 2 | 2 | 0 | 0 | 100% |
| events | 8 | 8 | 0 | 0 | 100% |
| control | 14 | 14 | 0 | 0 | 100% |
| sensing | 9 | 8 | 1 | 0 | 89% |
| operators | 17 | 17 | 0 | 0 | 100% |
| variables | 3 | 3 | 0 | 0 | 100% |
| lists | 5 | 5 | 0 | 0 | 100% |
| myBlocks | 5 | 5 | 0 | 0 | 100% |
| combined | 7 | 7 | 0 | 0 | 100% |
| **Total** | **97** | **94** | **3** | **0** | **97%** |

Sebelum integrasi angkanya 82/97 (85%). Yang diperbaiki saat integrasi:
- **My Blocks 0% -> 100%:** `packages/engine/src/blocks/procedures.ts` ternyata masih stub (tidak ada
  primitive `procedures_call`). Sekarang port baris demi baris `scratch3_procedures.js`.
- **Glide (motion/glideto, glidesecstoxy, combined/turbo, warp, timer):** glide memakai jam beku per
  frame (`util.nowObj`); scratch-vm memakai `new Timer()` (jam nyata), jadi sprite sudah bergeser sedikit
  di tick berikutnya dalam frame yang sama. Sekarang glide memakai jam sequencer.
- **Event SAY:** dulu teks diformat (2 desimal, potong 330) sebelum event; scratch-vm mengirim nilai
  mentah. Balon tetap diformat sama seperti Scratch.
- **"ganti latar ke ... dan tunggu":** dulu tidak menunggu sama sekali bila ada skrip penerima
  (yield jatuh ke thread lain karena konteks util ditimpa startHats). Sekarang menunggu.
- **control/clone-limit** ikut lulus setelah perbaikan di atas.

94 kasus yang identik sudah dimasukkan ke `REQUIRED_PASS` (`tests/parity/expectations.ts`), jadi
regresi berikutnya membuat `npm test` merah.

3 kasus yang masih beda, apa adanya:
1. `looks/switchbackdroptoandwait` - beda 1 frame. scratch-vm punya bug: `_setBackdrop` memanggil
   `runtime.startHats` langsung sehingga frame pertama melempar TypeError dan terpotong; skrip penerima
   di Scratch mulai 1 frame lebih lambat. Kita tidak meniru crash itu; setelahnya perilaku menunggu sama.
2. `motion/mouse-never-posted` dan 3. `sensing/keys-mouse` - posisi mouse sebelum mouse pernah
   digerakkan. Oracle (scratch-vm 5.0.300, AGPL) mengembalikan `undefined`; spesifikasi BSD 4.8.102
   (`io/mouse.js`) memulai dari `0`, dan engine kita mengikuti 4.8.102. Di browser nyata mouse hampir
   selalu sudah bergerak di atas panggung, jadi ini jarang terlihat.

Catatan cakupan: 97 kasus ini menguji perilaku runtime (posisi, arah, ukuran, costume, variabel/list,
balon, monitor, thread, urutan eksekusi). Renderer punya tes oracle sendiri terhadap scratch-render
1.2.115 (bounds, fencing, touching, pick, warna; lulus). Tampilan blok diuji terhadap scratch-blocks
(260 kasus path/ukuran, lulus). Audio ADPCM diuji terhadap scratch-audio (lulus). Pena dan Musik diuji
terhadap fixture keluaran scratch3_pen/scratch3_music (lulus). Tetap belum ada bukti parity 100% untuk
semua kombinasi blok; korpus parity bisa diperluas.

## Yang dikerjakan agent integrasi

- `app/src/host/runtime-host.ts`: merakit audio engine, runtime (CORE_BLOCK_PACKAGES didaftarkan engine,
  tidak didaftar ulang), renderer saat kanvas panggung terpasang, media loader, ekstensi, ShellController,
  host Kostum/Suara. Kanvas diganti = renderer baru + project dimuat ulang.
- `app/src/host/media-loader.ts`: IMediaLoader (SVG/bitmap ke renderer seperti load-costume.js, sound ke
  audio engine).
- `app/src/host/asset-host.ts`: tab Kostum/Suara di atas runtime (tambah/duplikat/hapus/urut ulang/ganti
  nama/simpan hasil editor), aturan sama dengan RenderedTarget/VM.
- `app/src/host/asset-actions.ts`: tambah sprite/latar dari pustaka, gambar, unggah, kejutan.
- `app/src/host/extensions.ts` + `app/src/code-tab/`: galeri ekstensi (Pena, Musik, 7 ekstensi AI),
  tombol "Tambah Ekstensi" kiri bawah, AI Lab (lazy), toolbox ekstensi per sprite/panggung.
- `app/src/host/project-io.ts`: .sb3 load/save, project default, ekstensi project dimuat sebelum loadProject.
- `app/src/App.tsx`: shell KodyBlocks + panel kode/kostum/suara + modal pustaka + indikator kamera/mikrofon.
- `packages/blocks-ui/src/toolbox.ts`: toolbox default masih stub (palet kosong). Sekarang port
  make-toolbox-xml.js (urutan, gap, shadow default, nilai costume/latar/suara dari target).
- `packages/blocks-ui/src/BlocksEditor.tsx`, `workspace.ts`: masih stub, sekarang tersambung ke workspace.
- `packages/engine/src/blocks/procedures.ts`, glide di `motion.ts`, SAY dan switch-backdrop-and-wait di
  `looks.ts` (lihat parity di atas).
- `app/src/costume-tab/use-asset-url.ts`: thumbnail kostum kosong di React StrictMode (blob URL dicabut
  saat remount) - diperbaiki.
- Model AI di-vendor ke `app/public/models` (69 MB, hash SHA-256 dicek skrip `vendor-models.mjs`).
- `app/public/_headers`: CSP ketat (hanya origin sendiri, `wasm-unsafe-eval` untuk MediaPipe, tanpa
  `unsafe-eval`), `Permissions-Policy` kamera/mikrofon hanya origin sendiri, `frame-ancestors` kodingyuk.id.
- `playwright.config.ts`: port 5197, proyek desktop + tablet, opsi browser untuk mesin yang drive C:-nya penuh.

## Keamanan AI (yang sudah dicek saat integrasi)

- Semua inferensi lokal; model hanya dari `/models/` origin sendiri dengan verifikasi SHA-256
  (`verified-fetch.ts`), redirect/origin lain ditolak. Dicek ulang di build produksi dengan CSP.
- Kamera dimatikan oleh AiServices saat stop/project baru/tab disembunyikan; mikrofon dilepas host saat
  stop (`PROJECT_STOP_ALL`). Indikator kamera/mikrofon tampil di atas app.
- Ekstensi hanya dari katalog bawaan; id/URL ekstensi dari file project ditolak.
- Fitur yang butuh internet (pengenalan ucapan online browser) hanya setelah dialog persetujuan
  (`window.confirm`) per sesi. Default lama = selalu ditolak; ini keputusan produk yang perlu dikonfirmasi.
- `window.__kody` (akses runtime untuk tes) hanya ada di mode dev, tidak di build produksi (dicek).

## Masalah terbuka

1. **Belum di-deploy dan belum ada commit git.** Repo `kodyblocks-ai-v2` masih tanpa commit. Permintaan
   user "push ke prod" belum dijalankan oleh agent ini: perlu keputusan target (domain/worker Cloudflare,
   apakah menggantikan KodyBlocks lama) dan repo GitHub. Build produksi siap di `dist/`.
2. **Browser nyata dengan GPU belum dites.** Semua tes browser memakai chrome-headless-shell (SwiftShader)
   karena Chrome biasa crash di mesin ini (drive C: 0 byte). WebGL jalan di SwiftShader; perlu cek manual
   di Chrome/Edge biasa dan tablet sungguhan, termasuk fps 30 dengan banyak sprite.
3. **Ekstensi AI dengan kamera/mikrofon belum dites end-to-end** (headless tanpa kamera). Yang dites:
   ekstensi termuat, blok muncul, model bisa diambil dari `/models/` di bawah CSP, AI Lab terbuka.
4. **Unggah .sprite2/.sprite3 belum didukung** (ditolak dengan pesan jelas). Unggah gambar didukung.
5. **Ganti nama costume/sound belum memperbarui referensi di blok** (`blocks.updateAssetName` scratch-vm
   belum ada di IBlocksContainer).
6. **Menu dinamis ekstensi** (mis. daftar kelas AI) di workspace memakai opsi saat ekstensi didaftarkan;
   kelas baru dari AI Lab mungkin baru muncul setelah ekstensi dimuat ulang. Perlu dicek.
7. **Palet terpotong untuk blok Musik yang lebar** (flyout lebar tetap, sama seperti Scratch).
8. Font costume Scratch (Sans Serif, Handwriting, dst.) jatuh ke font sistem; teks balon memakai aturan
   pemenggalan baris sederhana (lihat laporan renderer).
9. Drive C: penuh terus-menerus selama sesi (diisi proses lain). Semua tes dijalankan dengan
   `TEMP/TMP=D:\tmp`; tanpa itu vitest/Chrome gagal ENOSPC.

## Langkah berikutnya

1. Putuskan target deploy, buat repo GitHub, commit, lalu deploy `dist/` (Cloudflare Workers static
   assets membaca `_headers`). Jalankan `npm run check` dan Playwright dulu.
2. Uji manual di Chrome/Edge + tablet sungguhan: performa, kamera (ekstensi AI), mikrofon, suara.
3. Perluas korpus parity (pen + musik di runtime penuh, lebih banyak kombinasi control/sensing), lalu
   jalankan `PARITY_STRICT=1` sebelum rilis.
4. Tutup masalah terbuka 4-6.

## Cara mengulang

```bash
# drive C: penuh -> arahkan temp ke D:
export TEMP='D:\tmp' TMP='D:\tmp'
npx tsc --noEmit -p .
npx vitest run
npm run check:no-scratch-import
npx vitest run tests/parity            # tabel PARITY dicetak di akhir
npx vite build

# e2e (port 5197). Di mesin ini pakai headless shell + home browser di D:
export PW_EXECUTABLE='C:/Users/tunas/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'
export PW_BROWSER_HOME='D:/tmp/kody-e2e/home' PW_OUTPUT_DIR='D:/tmp/kody-e2e/results'
npx playwright test
```
