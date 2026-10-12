# KodyBlocks AI v2 - Status integrasi

Tanggal: 2026-10-12 (putaran "siap produksi + tablet/iPad + belajar AI"). Ditulis oleh agent integrasi.
Semua angka di bawah berasal dari perintah yang benar-benar dijalankan hari ini (lihat "Cara mengulang").
Putaran 2026-10-10 ada di bagian bawah sebagai riwayat.

## Ringkasan 2026-10-12

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit -p .` | 0 error |
| `npx vitest run --pool=forks --poolOptions.forks.maxForks=2` (semua) | 117 file, 1663 lulus, 3 skip (3 skip = kasus parity yang masih beda) |
| Parity (`REQUIRED_PASS`) | 94/97 identik (97%), tidak berubah; 3 beda yang sama seperti sebelumnya |
| `npm run check:no-scratch-import` | OK |
| `npm run build` | sukses. `dist/` 78 MB total (69 MB model AI di `dist/models`). Entry JS `index-*.js` 830 KB (263 KB gzip) + `react-vendor` 186 KB (59 KB gzip). tfjs (1.28 MB) dan MediaPipe tetap lazy |
| `dist/` PWA | `sw.js`, `sw-register.js`, `manifest.webmanifest`, `favicon.ico`, `apple-touch-icon.png`, `icons/` ada; `index.html` memuat `/sw-register.js` |
| Playwright `tests/e2e` (desktop 1280x800 + tablet 820x1180, chrome-headless-shell) | 4/4 lulus |
| Smoke build produksi + CSP dari `_headers` (iPad 820x1180 dan 1180x820, sentuh, dpr 2) | tanpa error konsol / pelanggaran CSP, service worker `ready`, tanpa scroll horizontal; Belajar AI -> 6 kartu -> "Batu Gunting Kertas" terbuka (judul benar, skrip tidak bertumpuk) -> "Latih AI (Gambar)" membuka AI Lab dengan kelas batu/gunting/kertas |

Belum diuji di perangkat nyata: iPad/iPhone Safari, tablet Android, kamera/mikrofon sungguhan,
Apple Pencil, Share sheet "Simpan ke File", instalasi PWA dan mode offline. Semua uji browser memakai
chrome-headless-shell (SwiftShader) dengan sentuhan disimulasikan.

## QA akhir 2026-10-12 (e2e build produksi)

E2E baru di `tests/e2e/prod/` dijalankan terhadap `dist/` (hasil `npm run build`) yang disajikan
`tests/e2e/serve-prod.mjs` dengan header asli dari `_headers` (CSP, cache, fallback SPA):
`npm run test:e2e:prod` (= `playwright test -c playwright.prod.config.ts`; `PW_WEBKIT=1` menambah iPad WebKit).

| Proyek | Hasil |
|---|---|
| Chromium: desktop 1280x800, iPad lanskap 1180x820, iPad potret 820x1180, ponsel 390x844 (sentuh, isMobile, UA iPad/iPhone) | 35 lulus, 1 skip (tes "mouse di perangkat sentuh" tidak berlaku di desktop) |
| WebKit 27.2 (Playwright): iPad lanskap + potret | 16 lulus, 2 skip (latih AI gambar: kamera palsu hanya ada di Chromium) |
| `tests/e2e` lama (dev server) | 4/4 lulus |
| Vitest semua | 117 file, 1664 lulus, 3 skip |

Yang dicakup: app terbuka tanpa error konsol / pelanggaran CSP / scroll horizontal, layar memuat hilang;
seret blok dengan jari (CDP touch) dan mouse, bendera hijau menjalankan, Berhenti menghentikan; sprite dari
pustaka, kostum digambar (alat Kotak), unggah WAV + rekam mikrofon palsu, simpan .sb3 (di UA iPad lewat
`navigator.share` yang distub) lalu buka lagi; AI Lab gambar dengan kamera palsu (2 kelas, latih, batang
kepercayaan, kelas muncul di dropdown blok, "label dari kamera" mengembalikan kelas, simpan/buka lagi -> model
dan nama kelas masih ada); AI Lab teks (latih, uji langsung, blok "label dari teks"); keenam contoh AI terbuka
tanpa skrip bertumpuk; manifest + semua ikon (ukuran PNG dicek), header CSP/cache, service worker aktif,
muat ulang offline membuka editor dari cache.

Bug yang ditemukan dan diperbaiki saat QA:
- Contoh "Pengendali Gestur Tangan": skrip kedua (x=420) tertutup blok "pergi ke x: (posisi jari) y: (...)"
  yang lebarnya > 380 px. Sekarang satu kolom (`packages/ai/src/examples/ai-examples.ts`).
- Ponsel: pil "Kamera aktif" (z-index 600) menutupi menu File/Belajar AI yang terbuka sehingga "Baru" tidak bisa
  diketuk selama kamera menyala. Pil disembunyikan selama menu bar terbuka (`app/src/styles/app.css`).
- Palet: area sentuh kotak centang monitor melebar ke kanan ke arah blok; di Chrome (penyesuaian sentuh Android)
  seret reporter dari tepi kirinya malah mengenai kotak centang. Area sentuh kini hanya melebar ke kiri/atas/bawah
  (`packages/blocks-ui/src/flyout/flyout-view.ts`).
- Tekan-lama di editor blok: menu baru dibuka satu frame setelah timer, supaya gerakan jari yang masih antre
  (main thread sibuk, mis. AI mengklasifikasi kamera) memulai seretan, bukan membuka menu
  (`packages/blocks-ui/src/workspace/gesture.ts`, tes baru di `editor.touch.dom.test.ts`). Catatan jujur: bug ini
  terbukti di tes unit; di e2e kegagalan awalnya ternyata artefak harness (gerakan CDP dikirim berurutan).
- `data-opcode` ditambahkan pada `<g class="kb-block">` (selector e2e tanpa kait `window.__kody` di produksi).

Tetap belum terverifikasi: Safari/iPadOS sungguhan (WebKit Playwright di Windows bukan Safari iPad; seret sentuh di
WebKit memakai PointerEvent sintetis), kamera/mikrofon sungguhan, Apple Pencil, share sheet asli, pemasangan PWA.
`/sw-register.js` sengaja tidak di-cache SW, jadi saat offline permintaannya gagal (tanpa efek; SW sudah aktif).
Catatan UX: "label dari kamera" / "kepercayaan untuk" mengembalikan kosong/0 bila "mulai klasifikasi kamera" atau
"analisis gambar" belum dijalankan (sama seperti Video Sensing Scratch); anak perlu tahu urutan itu.

## Fitur (keadaan sekarang)

**Belajar & melatih AI**
- AI Lab ala Teachable Machine, 5 tab: Gambar, Pose Tubuh, Gestur Tangan, Suara (kelas wajib "Suara latar"), Teks.
  Tambah/ganti nama/hapus kelas, tambah/hapus contoh dengan thumbnail (pose/tangan/suara digambar ulang, bukan foto),
  tahan-untuk-merekam dengan jari atau mouse, unggah banyak gambar sekaligus, progres latihan, perkiraan akurasi,
  panel uji langsung dengan batang kepercayaan per kelas.
- Model tersimpan di project (.sb3) otomatis; dropdown kelas di blok langsung berganti tanpa muat ulang.
  Berbagi model antar anak lewat file `.kodyai.json` (divalidasi ketat saat impor).
- Blok AI: klasifikasi gambar/pose/tangan/suara/teks terlatih, "kepercayaan untuk <kelas>", hat
  "ketika AI mengenali/mendengar <kelas>", mulai/berhenti klasifikasi terus-menerus, kamera depan/belakang,
  bicara (TTS) dan pengenalan ucapan (perlu persetujuan internet).
- Menu **Belajar AI**: "Tutorial & Contoh AI" (6 contoh: batu-gunting-kertas, wajah-pengikut, pengendali-gestur,
  perintah-suara, chatbot-perasaan dengan model teks siap pakai, pose-pahlawan) dengan langkah-langkah, dan
  "Latih AI-mu (AI Lab)". Dari kartu tutorial, AI Lab dibuka di tab yang tepat dengan nama kelas tutorial terisi
  (hanya bila tab itu masih kosong).
- Persetujuan internet lewat dialog di dalam app yang default-nya menolak (bukan `window.confirm`).
- Pustaka punya kategori "Proyek AI" (tangan batu/gunting/kertas, wajah emosi, lampu lalu lintas, tempat sampah).

**Tablet / iPad**
- Tiga tata letak (`app/src/shell/layout.ts`): lebar (ala Scratch), split untuk tablet potret (panggung +
  sprite di atas, kode di bawah), ponsel (tab "Sprite"). Tanpa scroll halaman, safe-area, 100dvh, target sentuh >= 44px.
- Editor blok: pinch-zoom dan geser dua jari, tekan-lama untuk menu (tanpa salah pilih saat jari diangkat),
  papan angka di layar (ada minus), dial sudut, piano not, komentar blok/workspace, seret skrip ke sprite lain.
- Tombol panah + Spasi di layar di bawah panggung (juga saat layar penuh), layar penuh sungguhan.
- Simpan .sb3 di iPad lewat Share sheet; buka .sb3/.sprite3 di iPad (filter file dimatikan di iOS, dicek setelahnya).
- Audio iOS: AudioContext dibuka dari ketukan dan dilanjutkan lagi setelah iPad men-suspend-nya; untuk AI,
  mikrofon dan speechSynthesis dibuka pada ketukan pertama setelah ekstensi AI dipakai.

**Aset & project**
- Impor/ekspor `.sprite3`; ganti nama sprite/kostum/suara memperbarui blok yang merujuknya.
- Unggah suara m4a/aac/ogg/webm/flac (dikonversi ke WAV), foto HEIC/WebP/AVIF (dikonversi ke PNG), kamera depan.
- Pustaka: 87 sprite, 26 latar, 50 suara (semua orisinal).
- Autosave ke IndexedDB (3 dtk setelah perubahan, maks tiap 10 dtk, juga saat tab disembunyikan) + dialog
  "Lanjutkan project terakhir?"; peringatan sebelum menutup bila belum disimpan.

**Produksi**
- Layar crash dengan Kody ("Coba lagi" / "Muat ulang"), layar memuat sampai engine siap.
- Kesalahan saat skrip berjalan (`RUNTIME_ERROR`) muncul sebagai pemberitahuan ramah (paling sering sekali/15 dtk;
  blok AI punya pemberitahuan sendiri).
- Ikon/PWA (manifest, apple-touch-icon, maskable), service worker (HTML network-first 4 dtk, `/assets/*` cache-first,
  model AI di-cache saat pertama dipakai), header cache di `_headers`, CSP tetap ketat (+ `manifest-src 'self'`).
- Renderer: devicePixelRatio dibatasi 2x dan 2048 px; kegagalan `draw()` tidak menghentikan frame.

## Yang dikerjakan agent integrasi 2026-10-12

- Memeriksa semua sambungan antar-area: dialog persetujuan AI, menu contoh AI, refresh dropdown kelas,
  ganti nama aset -> blok, ErrorBoundary/autosave/layar memuat, pendaftaran service worker. Semua sudah tersambung.
- `packages/ai/src/examples/script-builder.ts`: skrip contoh dalam satu kolom kini ditumpuk otomatis menurut
  perkiraan tingginya (sebelumnya hat "ketika AI mengenali" menutupi blok di "Batu Gunting Kertas"). Tes baru di
  `examples.test.ts`.
- `packages/ai/src/lab/lab-session.ts` (`presetClasses`) + `AiLab.tsx` (`initialClasses`) + `AiTutorials.tsx`/
  `KodyShell.tsx`/`App.tsx`: kartu tutorial meneruskan nama kelas ke AI Lab. Tes baru di `lab.test.ts`.
- `app/src/App.tsx`: buka audio/ucapan AI dari gestur pertama (iOS), dan tampilkan `RUNTIME_ERROR` sebagai
  pemberitahuan ramah.
- Catatan kontrak: `packages/ai/src/examples/ai-examples.ts` mengimpor `@kody/project` secara dinamis (ai -> project).
  Vite memberi peringatan bahwa impor dinamis itu tidak memecah chunk (project sudah di bundle utama); tidak berbahaya.

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

## Masalah terbuka

1. **Belum diuji di perangkat nyata** (iPad/iPhone Safari, tablet Android): kamera + MediaPipe/MobileNet,
   tahan-untuk-merekam, mikrofon, AudioContext/speechSynthesis iOS, Share sheet, pemilih file iOS (.sb3/.sprite3),
   Fullscreen API iPadOS, safe-area notch, blokir pinch Safari, Apple Pencil, instalasi PWA dan offline.
2. **Belum di-commit dan belum di-deploy** putaran ini (sesuai instruksi). Live di kodyblocksai.kodingyuk.id
   belum berisi perubahan ini.
3. Header `! Cache-Control` untuk `/assets/library/library.json` di `_headers` belum diverifikasi di Worker Cloudflare.
4. File `/models/*` immutable 1 tahun dengan nama tetap: bila model di-vendor ulang di path yang sama, browser lama
   gagal cek SHA-256. Solusi: nama file model berhash.
5. Tab yang dibiarkan terbuka melewati deploy bisa gagal memuat chunk lazy yang belum pernah diambil
   (fallback SPA Cloudflare mengembalikan index.html). Muat ulang memperbaiki.
6. Bila Safari tidak pernah memulihkan konteks WebGL yang hilang, panggung kosong sampai muat ulang.
7. API ES2022 (`.at()`, `structuredClone`) tanpa polyfill: butuh iPadOS/iOS 15.4+.
8. Tombol layar hanya panah + Spasi; game dengan tombol huruf perlu keyboard.
9. Komentar blok tidak ikut pindah saat "rapikan" atau saat engine memindahkan skrip.
10. Project dengan ekstensi Scratch yang tidak kita punya (TTS Scratch, Video Sensing, Translate, LEGO, micro:bit)
    masih ditolak (pesannya kini ramah). `.sprite2` tidak didukung.
11. Contoh latihan yang belum dilatih hilang saat AI Lab ditutup (ada konfirmasi); hanya model terlatih yang disimpan.
    Model teks menyimpan bigram (kalimat 2 kata bisa dibaca ulang; dicatat di AI-SAFETY.md).
12. AI Lab tidak memuat ekstensi AI yang cocok secara otomatis setelah melatih (contoh tutorial sudah memuatnya).
13. Palet Musik yang lebar terpotong; font costume Scratch jatuh ke font sistem (sama seperti sebelumnya).
14. Ukuran palet: membangun ulang palet penuh ~0.7-1 dtk di jsdom; biaya di tablet murah belum diukur.

Masalah lama 4 (.sprite3), 5 (ganti nama aset) dan 6 (menu dinamis AI) dari 2026-10-10 sudah ditutup.

## Cara mengulang

```bash
export TEMP='D:\tmp' TMP='D:\tmp' npm_config_cache='D:\npm-cache'
npx tsc --noEmit -p .
npm run check:no-scratch-import
npx vitest run --pool=forks --poolOptions.forks.maxForks=2 --testTimeout=120000   # tabel parity dicetak di akhir
npm run build

# e2e: chrome-headless-shell di D:\pw-browsers (drive C: penuh)
export PW_PORT=5419 PW_EXECUTABLE='D:/pw-browsers/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'
export PW_BROWSER_HOME='D:/tmp/kody-int/home' PW_OUTPUT_DIR='D:/tmp/kody-int/results'
npx playwright test
```

---

# Riwayat: putaran 2026-10-10


Tanggal: 2026-10-10. Ditulis oleh agent integrasi setelah semua agent build selesai.
Semua angka di bawah berasal dari perintah yang benar-benar dijalankan hari ini (lihat bagian "Cara mengulang").

## Ringkasan (2026-10-10)

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

## Yang dikerjakan agent integrasi (2026-10-10)

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

## Masalah terbuka (2026-10-10)

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

## Langkah berikutnya (2026-10-10)

1. Putuskan target deploy, buat repo GitHub, commit, lalu deploy `dist/` (Cloudflare Workers static
   assets membaca `_headers`). Jalankan `npm run check` dan Playwright dulu.
2. Uji manual di Chrome/Edge + tablet sungguhan: performa, kamera (ekstensi AI), mikrofon, suara.
3. Perluas korpus parity (pen + musik di runtime penuh, lebih banyak kombinasi control/sensing), lalu
   jalankan `PARITY_STRICT=1` sebelum rilis.
4. Tutup masalah terbuka 4-6.

## Cara mengulang (2026-10-10)

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
