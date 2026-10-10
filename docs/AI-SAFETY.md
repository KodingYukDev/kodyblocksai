# KodyBlocks AI v2: Keamanan & Privasi AI

Dokumen ini milik paket `packages/ai`. Isinya model ancaman fitur AI (kamera, mikrofon, model, data
latih) untuk pengguna anak, mitigasi yang sudah ada di kode, dan hal yang wajib dikerjakan app.
Aturan umum ada di `docs/CONTRACTS.md` bagian 12.

## 1. Aset yang dilindungi

| Aset | Kenapa sensitif |
|---|---|
| Frame kamera (wajah anak, kamar, anggota keluarga) | Data biometrik dan lingkungan rumah |
| Audio mikrofon / ucapan | Suara anak, percakapan di sekitar |
| Data latih AI Lab (foto, rekaman, kalimat contoh) | Bisa berisi wajah atau nama |
| File project `.sb3` | Dibagikan antar siswa/guru, bisa dibuka di perangkat lain |
| Integritas model AI | Model yang ditukar bisa menjalankan kode atau menghasilkan keluaran menyesatkan |

## 2. Model ancaman

| # | Ancaman | Contoh |
|---|---|---|
| T1 | Frame/audio bocor ke server | Library atau kode memanggil `fetch`/WebSocket berisi gambar |
| T2 | Kamera/mic menyala tanpa sepengetahuan anak | Project dibuka, kamera langsung menyala; tab disembunyikan tapi kamera tetap aktif |
| T3 | Model atau wasm ditukar | CDN/server disusupi, project berisi URL model jahat |
| T4 | Project `.sb3` jahat | Label berisi skrip/kontrol bidi, payload model raksasa (DoS), JSON rusak |
| T5 | Foto mentah ikut tersimpan lalu tersebar | Thumbnail data latih ikut ke file project yang dibagikan |
| T6 | Pengenalan identitas | Fitur "siapa orang ini" atau embedding wajah yang bisa dipakai melacak orang |
| T7 | Layanan suara pihak ketiga | Web Speech API mengirim suara ke server Google/Apple tanpa pemberitahuan |
| T8 | Kehabisan memori / tab hang | Loop "selamanya" memanggil analisis, tensor tfjs bocor |
| T9 | XSS lewat data AI | Label kelas dirender sebagai HTML |

## 3. Mitigasi di kode

| Ancaman | Mitigasi | Lokasi | Tes |
|---|---|---|---|
| T1 | Semua inferensi lokal (MediaPipe wasm, tfjs). Tidak ada `fetch` selain pemuat model; tidak ada XHR/WebSocket/sendBeacon/MediaRecorder/URL http absolut di kode produksi. Frame hanya digambar ke kanvas lokal. | `models/verified-fetch.ts`, `devices/camera.ts` | `no-network.test.ts` (pindai statis) |
| T2 | `getUserMedia` hanya di `CameraController`/`MicrophoneController` dan hanya dipanggil oleh blok perintah (`analyse`, `videoToggle`, `startListening`, `recognizeSpeech`) atau tombol AI Lab. Hat dan reporter hanya membaca hasil terakhir. Perangkat mati saat stop (`PROJECT_STOP_ALL`), project baru (`PROJECT_LOADED`), tab tersembunyi (`visibilitychange`), `videoToggle off`, ekstensi dilepas, atau tombol **Matikan**. Tidak menyala saat tab tersembunyi. Permintaan tertunda dibatalkan (stream yang datang terlambat langsung dihentikan). Indikator `CameraIndicator` tampil selama perangkat aktif. Nilai `videoState: "on"` di project TIDAK menyalakan kamera. | `services.ts`, `devices/*`, `vision/vision-common.ts`, `ui/CameraIndicator.tsx` | `devices.test.ts`, `extensions.test.ts`, `ui.test.tsx` |
| T3 | Model hanya dari path di `models/manifest.json` (SHA-256 + ukuran di-pin di bundle) yang lolos `isAllowedModelUrl` (same-origin `/models/`). `fetch` dengan `redirect: "error"`, `credentials: "same-origin"`, respons dari origin lain ditolak. Byte terverifikasi diberikan ke library dari memori (`modelAssetBuffer`, `tf.io.fromMemory`, blob URL untuk wasm), jadi library tidak pernah memuat URL sendiri. Project tidak bisa menentukan URL model. | `models/verified-fetch.ts`, `models/loaders.ts`, `models/tfjs-artifacts.ts` | `models.test.ts` |
| T4 | Model terlatih dibaca sebagai input tak tepercaya: `validateTrainedClassifier`, lalu parser ketat per format (dimensi, jumlah contoh, indeks label, base64, skala, kosakata, hitungan). Label disanitasi (`sanitizeLabel`), batas `AI_LIMITS`/`KNN_LIMITS`/`TEXT_LIMITS`. Model rusak -> notice, ekstensi tetap jalan tanpa model. | `classifier/*`, `security.ts` | `classifier.test.ts`, `extensions.test.ts`, `lab.test.ts` |
| T5 | AI Lab hanya menyimpan vektor fitur (gambar: MobileNet int8; suara: 48 angka ringkasan pita frekuensi; teks: kosakata + hitungan, bukan kalimat). Thumbnail JPEG 64x48 hanya bila pengguna mencentang opsi eksplisit dan dibuang lagi bila centang dicabut. Data URL thumbnail divalidasi (`jpeg/png/webp`, ukuran dibatasi). | `lab/controllers.ts`, `classifier/knn.ts` | `lab.test.ts` |
| T6 | Ekstensi wajah hanya memberi posisi, landmark, dan ekspresi sederhana dari blendshape. Tidak ada pengenalan identitas, umur, gender, atau penyimpanan data wajah. | `extensions/face.ts`, `vision/face-expressions.ts` | `vision.test.ts` |
| T7 | Pengenalan ucapan memakai mode on-device (`processLocally`) bila tersedia. Bila tidak, blok dilewati kecuali app memberi persetujuan eksplisit lewat `requestNetworkConsent("speech-recognition")`, dan pengguna diberi notice bahwa suara dikirim ke penyedia browser. TTS memakai suara offline (`localService`); suara online hanya dengan persetujuan. Tanpa handler persetujuan = ditolak. | `speech/*` | `speech.test.ts` |
| T8 | Analisis dibatasi `AI_LIMITS.maxAnalysesPerSecond` (panggilan terlalu cepat memakai hasil terakhir, panggilan paralel digabung). `TensorGuard` mencatat tensor bocor dan batas memori; bila terlewati model dilepas dan dimuat ulang. Model dimuat lazy (dynamic import) dan dilepas saat ekstensi terakhir dilepas. | `vision/analysis-gate.ts`, `models/tensor-guard.ts` | `vision.test.ts`, `models.test.ts` |
| T9 | UI AI dirender sebagai teks React, tanpa HTML mentah; label disanitasi (karakter kontrol & bidi dibuang). | `lab/AiLab.tsx`, `security.ts` | `no-network.test.ts` |

## 4. Kewajiban app (agent app-shell / deploy)

1. **Vendor model**: jalankan `node packages/ai/tools/vendor-models.mjs` (salin ke `app/public/models`,
   hash diverifikasi). Tanpa ini blok AI menampilkan notice "Model AI gagal dimuat".
2. **CSP** minimal yang dibutuhkan paket AI:
   `script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob:; img-src 'self' data: blob:; media-src 'self' blob: mediastream:`.
   Jangan izinkan origin pihak ketiga di `connect-src` (supaya T1 juga dijaga browser).
3. **Permissions-Policy**: `camera=(self), microphone=(self)`; jangan izinkan iframe pihak ketiga.
4. **Pasang `CameraIndicator`** di area panggung (selalu terlihat saat perangkat aktif) dan teruskan
   `onDeviceActive` ke bus `ai:device-active`.
5. **Dialog persetujuan internet**: `configureAiServices(runtime, { requestNetworkConsent })` yang
   menjelaskan dengan bahasa anak bahwa suara/teks akan dikirim ke server penyedia browser.
   Tanpa ini, pengenalan ucapan hanya jalan di browser yang mendukung mode on-device.
6. **Notice**: tampilkan `services.events.on("notice")` sebagai toast (teks biasa, bukan HTML).
7. **AI Lab** dimuat lazy: `const { default: AiLab } = await loadAiLab()`.
8. Halaman wajib HTTPS (kamera & WebCrypto butuh secure context).

## 5. Risiko yang tersisa

- **Vektor fitur bukan anonim sempurna.** Embedding MobileNet dari foto wajah secara teori bisa
  dipakai memperkirakan kemiripan gambar. Mitigasi: hanya disimpan di project milik pengguna,
  tidak dikirim ke mana pun oleh paket ini; guru sebaiknya menyarankan melatih dengan objek, bukan wajah.
- **Web Speech API mode online** tetap mengirim audio ke penyedia browser setelah persetujuan.
  Kebijakan privasi penyedia berlaku; persetujuan disimpan per sesi project, bukan permanen.
- **Hash manifest dipin di bundle.** Bila server app sendiri (bundle JS) disusupi, penyerang bisa
  mengganti bundle dan manifest sekaligus; ini di luar cakupan paket AI (lindungi pipeline deploy).
- **Gestur & ekspresi berbasis aturan** bisa salah baca; jangan dipakai untuk keputusan penting.
- **Blob URL wasm** butuh `blob:` di `script-src`. Bila CSP tidak mengizinkan, MediaPipe gagal dimuat
  (ditampilkan sebagai notice), bukan diam-diam memuat dari tempat lain.
