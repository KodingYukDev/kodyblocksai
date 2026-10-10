# Parity test (engine KodyBlocks vs scratch-vm)

Differential test: project yang sama dijalankan di **scratch-vm asli** (oracle, devDependency, hanya
untuk tes) dan di **engine kita** (`@kody/engine`), lalu jejak state per frame dibandingkan persis.

## Cara pakai

```bash
npm run test:parity                                   # semua tes parity + tabel PARITY
npx vitest run tests/parity/parity.test.ts            # differential saja
PARITY_FILTER="^motion/" npx vitest run tests/parity  # hanya kasus yang id-nya cocok regex
PARITY_STRICT=1 npm run test:parity                   # semua kasus WAJIB identik (sebelum rilis)
PARITY_REPORT=D:/tmp/parity.json npm run test:parity  # tulis laporan JSON (status + diff per kasus)
PARITY_SKIP_DETERMINISM=1 ...                         # lewati cek determinisme oracle (iterasi cepat)
PARITY_ORACLE_PATH=<modul> ...                        # pakai build scratch-vm lain sebagai oracle
```

Di akhir run, `parity.test.ts` mencetak:

```
PARITY engine KodyBlocks vs scratch-vm
KATEGORI     KASUS   SAMA   BEDA  ERROR  INVALID   PARITY
motion          15     12      3      0        0      80%
...
```

lalu "ERROR ENGINE TERBANYAK" (stub mana yang menghambat), "CONTOH PERBEDAAN" (frame, jalur
properti, nilai scratch-vm vs kita), dan "SIAP DIWAJIBKAN" (kasus yang sudah identik).

## Status kasus & ratchet

| status | arti | efek di vitest |
|---|---|---|
| `match` | trace identik | lulus |
| `mismatch` | ada perbedaan | **skip** (expected-fail), kecuali kasus wajib -> gagal |
| `error` | engine kita melempar (load / step) | **skip**, kecuali kasus wajib -> gagal |
| `invalid` | kasusnya sendiri tidak deterministik (spin guard di oracle) | selalu gagal (bug korpus) |

Kasus wajib ada di `expectations.ts` (`REQUIRED_PASS`). Setelah engine membuat kasus identik,
pindahkan id-nya ke sana supaya regresi berikutnya membuat `npm test` merah. `PARITY_STRICT=1`
mewajibkan semua kasus.

## File

| file | isi |
|---|---|
| `scratch-vm-oracle.ts` | jalankan sb3 di scratch-vm + `GeometryWorld`, rekam `FrameSnapshot` per frame |
| `engine-runner.ts` | jalankan sb3 di `@kody/engine` dengan kondisi identik (renderer, jam, PRNG, aksi IO) |
| `geometry-renderer.ts` | `GeometryWorld` (skin persegi panjang 96x100, fencing port scratch-render BSD, pick, sentuhan AABB) + facade scratch-render |
| `geometry-irenderer.ts` | adaptor `IRenderer` (kontrak engine) di atas `GeometryWorld` yang sama |
| `fake-env.ts` | jam palsu + tick virtual, setTimeout palsu, PRNG terpisah (blok vs uid) |
| `sb3-to-model.ts` | sb3 -> `ProjectModel` khusus harness (tidak bergantung pada packages/project) |
| `snapshot.ts` | format trace: posisi, arah, ukuran, costume, volume, efek, rotation style, draggable, layer, variabel/list, balon, monitor, event SAY/QUESTION, jumlah thread |
| `trace-diff.ts` | pembanding (Object.is: `0` vs `-0` dan `"10"` vs `10` dianggap beda) |
| `block-builder.ts` | DSL pembuat blok sb3 terkompresi (`b`, `menu`, `setVar`, `procDef`, ...) |
| `corpus/*.ts` | kasus per kategori + gabungan |
| `parity.test.ts` | differential test + tabel |
| `oracle-determinism.test.ts` | oracle dijalankan 2x harus identik, tanpa spin guard |
| `oracle-source.test.ts` | file perilaku scratch-vm 5.0.300 (oracle) identik dengan 4.8.102 BSD (spesifikasi) |
| `harness.test.ts` | tes harness: cakupan opcode, builder, konversi, jam, diff, adaptor renderer |
| `opcode-coverage.test.ts` | katalog `opcodes.ts` == primitive/hat scratch-vm |

## Determinisme (penting untuk penulis engine)

1. **Jam.** `Date.now()`/`new Date()` dipalsukan selama run. Awal frame ke-n = epoch + n*stepTime.
   `currentMSecs` dibaca sekali per frame (awal `stepThreads`).
2. **Tick virtual.** scratch-vm terus mengulang tick sampai WORK_TIME (75% frame) habis selama ada
   thread RUNNING, dan thread yang sedang `wait`/`glide` tetap RUNNING. Jam palsu maju 0.1 ms
   **hanya** ketika `Timer.timeElapsed()` dipanggil langsung dari method `stepThreads`
   (dikenali lewat stack trace) -> 250 tick per frame 30 fps, sama di kedua VM.
   **Syarat engine:** loop sequencer memeriksa WORK_TIME dengan `this.timer.timeElapsed()` di
   method bernama `stepThreads` (struktur sequencer.js). Kalau tidak, engine memicu spin guard.
3. **Timer.** `setTimeout` dipalsukan; callback dijalankan di awal frame setelah jatuh tempo
   (bubble "say for secs" scratch-vm memakai setTimeout).
4. **Microtask** di-flush setelah aksi IO dan setelah step (resolve Promise `ask and wait`).
5. **Acak.** Oracle: `Math.random` dari `uid()` -> aliran id, selain itu -> aliran blok
   `mulberry32(seed)`. Engine kita: `RuntimeOptions.random` = aliran blok yang sama, sedangkan
   `Math.random` global hanya aliran id. Jadi engine WAJIB memakai `runtime.random()` untuk blok.
6. **Exception di step.** Oracle meniru `setInterval` browser: error dari `_step()` dicatat dan
   frame berikutnya tetap jalan. Error engine kita di frame yang oracle-nya tidak error = `error`.

## Aturan menulis kasus

1. Pakai `mkCase`/`probeCase` dari `corpus/helpers.ts`; variabel/list/broadcast yang dirujuk tapi
   tidak dideklarasikan otomatis dibuat global di Stage.
2. Reporter/boolean: `probeCase(kategori, nama, focus, [ekspresi...])` -> `set rN to (ekspresi)`.
3. Untuk melihat state antara, sisipkan `wait(0)` (satu langkah per frame).
4. Jangan menaruh `wait` di dalam procedure warp (menunggu WARP_TIME -> spin guard -> invalid).
5. Aksi IO per frame (`actions`): `key`, `mouse` (koordinat klien kanvas 480x360), `wheel`,
   `answer`, `username`, `greenFlag`, `stopAll`. Kasus yang membaca posisi mouse sebaiknya
   memposting mouse dulu (sebelum itu scratch-vm mengembalikan `undefined`).
6. `harness.test.ts` gagal bila ada primitive/hat core scratch-vm yang belum muncul di korpus.

## Quirk scratch-vm yang sengaja diuji

- `looks/switchbackdroptoandwait`: bila ada hat "when backdrop switches to", `startHats()` menjalankan
  `execute()` untuk hat baru dan menimpa `BlockUtility` singleton, sehingga primitive membaca
  `stackFrame` thread lain -> TypeError di frame 1 (frame terpotong), lalu normal di frame berikutnya.
- `motion/mouse-never-posted`: sebelum ada `postData` mouse, `getScratchX()` = `undefined`.
- Event `SAY` scratch-vm membawa pesan MENTAH (angka tidak dibulatkan, string tidak dipotong);
  pemformatan 2 desimal / 330 karakter hanya untuk isi balon (`bubble`).
