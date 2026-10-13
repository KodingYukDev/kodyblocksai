# KodyBlocks AI v2: Keamanan & Privasi AI

Dokumen ini milik paket `packages/ai`. Isinya model ancaman fitur AI (kamera, mikrofon, model, data
latih) untuk pengguna anak, mitigasi yang sudah ada di kode, dan hal yang wajib dikerjakan app.
Aturan umum ada di `docs/CONTRACTS.md` bagian 12.

## 1. Aset yang dilindungi

| Aset | Kenapa sensitif |
|---|---|
| Frame kamera (wajah anak, kamar, anggota keluarga) | Data biometrik dan lingkungan rumah |
| Audio mikrofon / ucapan | Suara anak, percakapan di sekitar |
| Data latih AI Lab (foto, pose, gestur, rekaman, kalimat contoh) | Bisa berisi wajah atau nama |
| File model `.kodyai.json` | Dibagikan antar siswa; bisa diubah orang lain sebelum diimpor |
| File project `.sb3` | Dibagikan antar siswa/guru, bisa dibuka di perangkat lain |
| Integritas model AI | Model yang ditukar bisa menjalankan kode atau menghasilkan keluaran menyesatkan |

## 2. Model ancaman

| # | Ancaman | Contoh |
|---|---|---|
| T1 | Frame/audio bocor ke server | Library atau kode memanggil `fetch`/WebSocket berisi gambar |
| T2 | Kamera/mic menyala tanpa sepengetahuan anak | Project dibuka, kamera langsung menyala; tab disembunyikan tapi kamera tetap aktif |
| T3 | Model atau wasm ditukar | CDN/server disusupi, project berisi URL model jahat |
| T4 | Project `.sb3` / file model jahat | Label berisi skrip/kontrol bidi, payload model raksasa (DoS), JSON rusak, indeks/vektor palsu |
| T5 | Foto mentah ikut tersimpan lalu tersebar | Thumbnail data latih ikut ke file project yang dibagikan |
| T6 | Pengenalan identitas | Fitur "siapa orang ini" atau embedding wajah yang bisa dipakai melacak orang |
| T7 | Layanan suara pihak ketiga | Web Speech API mengirim suara ke server Google/Apple tanpa pemberitahuan |
| T8 | Kehabisan memori / tab hang | Loop "selamanya" memanggil analisis, tensor tfjs bocor |
| T9 | XSS lewat data AI | Label kelas dirender sebagai HTML |

## 3. Mitigasi di kode

| Ancaman | Mitigasi | Lokasi | Tes |
|---|---|---|---|
| T1 | Semua inferensi lokal (MediaPipe wasm, tfjs). Tidak ada `fetch` selain pemuat model; tidak ada XHR/WebSocket/sendBeacon/MediaRecorder/URL http absolut di kode produksi. Frame hanya digambar ke kanvas lokal. | `models/verified-fetch.ts`, `devices/camera.ts` | `no-network.test.ts` (pindai statis) |
| T2 | `getUserMedia` hanya di `CameraController`/`MicrophoneController` dan hanya dipanggil oleh blok perintah (`analyse`, `startAuto`, `videoToggle`, `setCamera`, `startListening`, `recognizeSpeech`) atau tombol AI Lab ("Nyalakan kamera", tombol rekam). Analisis terus-menerus (`startAuto`) berhenti saat stop/reset, saat kamera dimatikan dari indikator (tidak meminta izin ulang), dan saat model gagal dimuat. Hat dan reporter hanya membaca hasil terakhir. Perangkat mati saat stop (`PROJECT_STOP_ALL`), project baru (`PROJECT_LOADED`), tab tersembunyi (`visibilitychange`), `videoToggle off`, ekstensi dilepas, atau tombol **Matikan**. Tidak menyala saat tab tersembunyi. Permintaan tertunda dibatalkan (stream yang datang terlambat langsung dihentikan). Indikator `CameraIndicator` tampil selama perangkat aktif. Nilai `videoState: "on"` di project TIDAK menyalakan kamera. | `services.ts`, `devices/*`, `vision/vision-common.ts`, `ui/CameraIndicator.tsx` | `devices.test.ts`, `extensions.test.ts`, `ui.test.tsx` |
| T3 | Model hanya dari path di `models/manifest.json` (SHA-256 + ukuran di-pin di bundle) yang lolos `isAllowedModelUrl` (same-origin `/models/`). `fetch` dengan `redirect: "error"`, `credentials: "same-origin"`, respons dari origin lain ditolak. Byte terverifikasi diberikan ke library dari memori (`modelAssetBuffer`, `tf.io.fromMemory`, blob URL untuk wasm), jadi library tidak pernah memuat URL sendiri. Project tidak bisa menentukan URL model. | `models/verified-fetch.ts`, `models/loaders.ts`, `models/tfjs-artifacts.ts` | `models.test.ts` |
| T4 | Model terlatih (dari project ATAU file model yang diimpor) dibaca sebagai input tak tepercaya: batas ukuran file (`AI_LIMITS.maxModelFileBytes`), pembungkus `{format:"kodyblocks-ai-model",version:1}`, `validateTrainedClassifier` (jenis `image/pose/hand/audio/text`), lalu parser ketat per format (dimensi, jumlah contoh, indeks label, base64, skala, kosakata, hitungan). Jenis model harus cocok dengan tab AI Lab. Label disanitasi (`sanitizeLabel`), batas `AI_LIMITS`/`KNN_LIMITS`/`TEXT_LIMITS`. Model rusak -> notice / pesan di AI Lab, ekstensi tetap jalan tanpa model. | `classifier/*`, `security.ts`, `lab/lab-session.ts` | `classifier.test.ts`, `extensions.test.ts`, `lab.test.ts` |
| T5 | AI Lab hanya menyimpan vektor fitur (gambar: MobileNet int8; pose: 33 titik tubuh ternormalisasi; tangan: 21 titik jari ternormalisasi; suara: 48 angka ringkasan pita frekuensi; teks: kosakata kata + pasangan kata (bigram) + hitungan, bukan kalimat utuh). Foto kecil 64x64 hanya ada di memori selama AI Lab terbuka; ikut ke project/file model HANYA bila pengguna mencentang opsi eksplisit, dan dibuang lagi bila centang dicabut. Thumbnail pose/tangan/suara digambar ulang dari angka fitur (bukan foto). Data URL thumbnail divalidasi (`jpeg/png/webp`, ukuran dibatasi). | `lab/lab-session.ts`, `lab/sources.ts`, `classifier/knn.ts`, `classifier/landmark-features.ts` | `lab.test.ts` |
| T6 | Ekstensi wajah hanya memberi posisi, landmark, dan ekspresi sederhana dari blendshape. Tidak ada pengenalan identitas, umur, gender, atau penyimpanan data wajah. | `extensions/face.ts`, `vision/face-expressions.ts` | `vision.test.ts` |
| T7 | Pengenalan ucapan memakai mode on-device (`processLocally`) bila tersedia. Bila tidak, blok dilewati kecuali pengguna menyetujui lewat dialog di dalam app (`AiConsentDialog`, menggantikan `window.confirm`): bahasa anak, tombol yang difokus pertama = "Jangan", Escape = tolak, berlaku sampai project berganti. Controller (`createNetworkConsent` / `aiNetworkConsent`) MENOLAK otomatis bila dialog belum terpasang atau dilepas saat menunggu. Browser tanpa Web Speech API (Firefox, Safari lama) mendapat pesan jelas (`SPEECH_UNSUPPORTED_MESSAGE`) dan blok dilewati. TTS memakai suara offline (`localService`); suara online hanya dengan persetujuan; TTS punya batas waktu agar skrip tidak macet di iOS. | `speech/*`, `ui/NetworkConsent.tsx` | `speech.test.ts`, `consent-lab.test.tsx` |
| T8 | Analisis dibatasi `AI_LIMITS.maxAnalysesPerSecond` (panggilan terlalu cepat memakai hasil terakhir, panggilan paralel digabung). `TensorGuard` mencatat tensor bocor dan batas memori; bila terlewati model dilepas dan dimuat ulang. Model dimuat lazy (dynamic import) dan dilepas saat ekstensi terakhir dilepas. | `vision/analysis-gate.ts`, `models/tensor-guard.ts` | `vision.test.ts`, `models.test.ts` |
| T9 | UI AI dirender sebagai teks React, tanpa HTML mentah; label disanitasi (karakter kontrol & bidi dibuang). | `lab/AiLab.tsx`, `security.ts` | `no-network.test.ts` |

| T8 (lanjutan) | Pratinjau AI Lab dan analisis blok memakai kanvas frame terpisah (`camera.getFrameFor(key)`), jadi frame yang sedang dianalisis tidak tertimpa. Pratinjau gambar hanya berjalan setelah model dilatih; pelatihan dipecah per potongan (UI tetap responsif) dan perkiraan akurasi dibatasi 400 contoh. | `devices/camera.ts`, `lab/*` | `ios-tablet.test.ts`, `lab.test.ts` |

### Tablet / iPad

- Video kamera: `muted` + `playsInline` + atribut `playsinline`/`webkit-playsinline` (syarat iOS Safari).
  Batasan kamera `facingMode: {ideal}`; bila `OverconstrainedError`, dicoba sekali lagi dengan `{video:true}`.
- Kamera depan/belakang: blok "pakai kamera [depan/belakang]" dan tombol di AI Lab; kamera belakang tidak dicerminkan.
- Mikrofon: `AudioContext` (atau `webkitAudioContext`) dibuat SINKRON saat `start()` dipanggil dari gestur;
  `services.unlockAudio()` bisa dipanggil dari tap; context yang masih `suspended` dilanjutkan pada tap berikutnya.
- MediaPipe: delegasi GPU hanya bila WebGL ada; bila task GPU gagal dibuat ATAU gagal saat deteksi pertama,
  otomatis dibuat ulang di CPU. tfjs jatuh ke backend `cpu` bila WebGL tidak ada/gagal.
- Izin ditolak: pesan di AI Lab menjelaskan cara mengizinkan (termasuk Pengaturan > Safari > Kamera di iPad).
- Target sentuh AI Lab >= 44px; "tahan untuk merekam" memakai pointer events + `touch-action:none`
  (tanpa menu tekan-lama iOS); satu kolom di layar sempit, dua kolom (container query) di layar lebar.

## 4. Kewajiban app (agent app-shell / deploy)

1. **Vendor model**: jalankan `node packages/ai/tools/vendor-models.mjs` (salin ke `app/public/models`,
   hash diverifikasi). Tanpa ini blok AI menampilkan notice "Model AI gagal dimuat".
2. **CSP** minimal yang dibutuhkan paket AI:
   `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' data: blob:; media-src 'self' blob: mediastream:`.
   Jangan izinkan origin pihak ketiga di `connect-src` (supaya T1 juga dijaga browser).
3. **Permissions-Policy**: `camera=(self), microphone=(self)`; jangan izinkan iframe pihak ketiga.
4. **Pasang `CameraIndicator`** di area panggung (selalu terlihat saat perangkat aktif) dan teruskan
   `onDeviceActive` ke bus `ai:device-active`.
5. **Dialog persetujuan internet**: pasang `<AiConsentDialog />` sekali di root app dan berikan
   `requestNetworkConsent: aiNetworkConsent.request` ke `configureAiServices` (sudah dipasang di
   `app/src/host/runtime-host.ts` + `app/src/App.tsx`). Jangan pakai `window.confirm`.
   Tanpa dialog terpasang, permintaan ditolak dan pengenalan ucapan hanya jalan di mode on-device.
6. **Notice**: tampilkan `services.events.on("notice")` sebagai toast (teks biasa, bukan HTML).
7. **AI Lab** dimuat lazy: `const { default: AiLab } = await loadAiLab()`. Tab: `image`, `pose`, `hand`,
   `audio`, `text` (`initialTab`). Model yang dilatih otomatis ditulis ke project dan memancarkan
   `BLOCKSINFO_UPDATE`; `ExtensionHost` mendaftarkan ulang menu dinamis sebelum editor membangun ulang
   palet (`app/src/host/extensions.ts`), jadi menu kelas langsung berisi kelas baru. Hal yang sama
   terjadi saat project dengan model dimuat (`PROJECT_LOADED`).
8. Halaman wajib HTTPS (kamera & WebCrypto butuh secure context).
9. **Contoh project AI**: `const ex = await loadAiExamples()`; tampilkan `ex.AI_EXAMPLES` sebagai kartu,
   buka dengan `ex.buildAiExampleSb3(id, { kodySvg })` lewat alur buka .sb3 yang biasa.

## 5. Risiko yang tersisa

- **Vektor fitur bukan anonim sempurna.** Embedding MobileNet dari foto wajah secara teori bisa
  dipakai memperkirakan kemiripan gambar. Mitigasi: hanya disimpan di project milik pengguna,
  tidak dikirim ke mana pun oleh paket ini; guru sebaiknya menyarankan melatih dengan objek, bukan wajah.
- **Bigram teks**: model teks menyimpan pasangan kata berurutan, jadi kalimat contoh dua kata bisa
  terbaca dari kosakata. Sarankan anak tidak memakai nama atau data pribadi sebagai contoh kalimat.
- **File model yang dibagikan** berisi vektor fitur (dan foto kecil bila opsi dicentang) milik pembuatnya.
- **Belum diuji di iPad/tablet fisik**: perilaku iOS di atas mengikuti dokumentasi WebKit dan diuji dengan
  tiruan (unit test), bukan perangkat sungguhan.
- **Web Speech API mode online** tetap mengirim audio ke penyedia browser setelah persetujuan.
  Kebijakan privasi penyedia berlaku; persetujuan disimpan per sesi project, bukan permanen.
- **Hash manifest dipin di bundle.** Bila server app sendiri (bundle JS) disusupi, penyerang bisa
  mengganti bundle dan manifest sekaligus; ini di luar cakupan paket AI (lindungi pipeline deploy).
- **Gestur & ekspresi berbasis aturan** bisa salah baca; jangan dipakai untuk keputusan penting.
- **Loader wasm MediaPipe** dimuat dari URL same-origin (`/models/mediapipe/wasm/*.js`, hash tetap dicek dulu),
  karena CSP tidak mengizinkan `blob:` di `script-src`. Hanya biner wasm yang lewat blob URL.
