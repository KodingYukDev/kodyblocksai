# KodyBlocks AI v2 - Kontrak Antarmodul

Dokumen ini adalah sumber kebenaran pembagian kerja antar-agent. Tipe nyata ada di kode
(`packages/*/src/types.ts`, `packages/engine/src/types/*.ts`); dokumen ini menjelaskan aturannya.
Kalau dokumen dan kode berbeda, **kode tipe yang menang**, lalu perbaiki dokumen ini.

## 0. Prinsip

1. **Perilaku = Scratch 3 persis.** Sumber kebenaran: `D:\Aril Saputra\Project\Products\_reference`.
   - `bsd3-local/` = scratch-vm 4.8.102, scratch-render 1.2.115, scratch-audio 1.0.325,
     scratch-svg-renderer 2.5.40 (BSD-3-Clause) + scratch-blocks 1.1.206 (Apache-2.0).
     **Hanya dari folder ini** kode boleh diport baris demi baris (catat di `THIRD_PARTY.md`).
   - `scratch-vm/`, `scratch-render/`, `scratch-gui/` (clone GitHub terbaru) sekarang **AGPL-3.0**.
     Boleh dibaca sebagai spesifikasi perilaku, **jangan disalin**.
2. **Engine ditulis sendiri.** `packages/` dan `app/` tidak boleh mengimpor `scratch-*`, `@scratch/*`,
   `blockly`. Dicek oleh `npm run check:no-scratch-import`. Hanya `tests/parity` yang memakai
   `scratch-vm` (devDependency, AGPL, tidak ikut dibundel) sebagai oracle.
3. **Dependensi satu arah:** `engine` <- (`renderer`, `audio`, `project`, `blocks-ui`, `ai`, `ext-pen`,
   `ext-music`) <- `app`. Engine tidak mengimpor paket lain. Antarmuka yang diimplementasikan paket
   lain (IRenderer, IAudioEngine, IVideoProvider) didefinisikan **di engine**.
4. Impor antarpaket memakai alias `@kody/<paket>` (tsconfig `paths`, `aliases.ts` untuk Vite/Vitest).
   Tidak ada workspace npm; satu `package.json` di root.
5. File < ~600 baris, TypeScript strict (`noUncheckedIndexedAccess` aktif), tes vitest di samping
   kode (`*.test.ts`). Tes yang butuh DOM menulis `// @vitest-environment jsdom` di baris pertama.

## 1. Kepemilikan folder

| Agent | Folder milik | Isi |
|---|---|---|
| engine-core | `packages/engine/src/{runtime,thread,sequencer,execute,block-utility,blocks-container,monitors,extension-manager}.ts`, `cast.ts`, `util/` | loop frame, thread, sequencer, execute, Cast, Color, MathUtil |
| engine-target | `packages/engine/src/{target,sprite,variable}.ts` | RenderedTarget, Sprite, clone, variabel, layer |
| engine-io | `packages/engine/src/io/` | keyboard, mouse, wheel, clock, userData |
| engine-motion-looks | `packages/engine/src/blocks/{motion,looks}.ts` | primitive Motion & Looks |
| engine-sound | `packages/engine/src/blocks/sound.ts` | primitive Sound |
| engine-control-events | `packages/engine/src/blocks/{control,event,procedures}.ts` | primitive Control, Events, My Blocks |
| engine-sensing | `packages/engine/src/blocks/sensing.ts` | primitive Sensing |
| engine-operators-data | `packages/engine/src/blocks/{operators,data}.ts` | primitive Operators, Variables, Lists |
| renderer | `packages/renderer/` | WebGL stage, skin bitmap/SVG/teks/pena, efek, tabrakan |
| audio | `packages/audio/` | WebAudio, ADPCM, efek pitch/pan/volume, loudness |
| project | `packages/project/` | sb3 <-> ProjectModel, zip, autosave IndexedDB, project default |
| blocks-ui | `packages/blocks-ui/` | definisi visual semua blok, toolbox, render SVG, workspace, flyout, drag/snap |
| ext-pen / ext-music | `packages/ext-pen/`, `packages/ext-music/` | ekstensi Pen & Music |
| ai | `packages/ai/` | ekstensi AI + kamera bersama + AI Lab model format |
| app-shell | `app/` | shell React ala KodyBlocks, wiring runtime, panel sprite/stage/costume/sound |
| parity | `tests/parity/` | differential test engine kita vs scratch-vm |

File bersama (`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `aliases.ts`,
`packages/engine/src/types/*`, `packages/engine/src/opcodes.ts`, dokumen ini) milik scaffold.
Butuh perubahan? Tambahkan tipe pelengkap di file milikmu dan catat di `open_issues`.

## 2. Format project

- **Di disk / .sb3**: `project.json` identik Scratch 3 (`packages/project/src/sb3-types.ts`), termasuk
  primitif terkompresi `[4,"10"]`, `[12,name,id]`, input `[1|2|3, ...]`. File harus bisa dibuka di
  scratch.mit.edu dan sebaliknya.
- **Di memori**: `ProjectModel` (`packages/engine/src/types/project-model.ts`). Identik `project.json`
  kecuali:
  - blok tidak terkompresi seperti di memori scratch-vm: `inputs[name] = {name, block, shadow}`,
    `fields[name] = {name, value, id?, variableType?}`, setiap shadow adalah blok tersendiri;
  - variabel/list/broadcast digabung ke `variables: Record<id, VariableState>` dengan `type`
    `"" | "list" | "broadcast_msg"`;
  - `extensionState` opsional per target (state ekstensi yang ikut disimpan, mis. model AI terlatih).
- Asset: `AssetData {assetId, dataFormat, data}`; md5ext = `<md5>.<ext>`; `AssetStore` di project.
- `runtime.loadProject(model, mediaLoader, assets)`: engine membuat Sprite/Target, `IMediaLoader`
  (diimplementasikan app memakai renderer+audio) memuat costume/sound.

## 3. Katalog opcode

`packages/engine/src/opcodes.ts` berisi **semua** opcode (core 138 primitive + 9 hat + shadow/menu +
pen + music + AI) dengan `owner` = file yang wajib mengimplementasikannya. Tes
`tests/parity/opcode-coverage.test.ts` memastikan daftar core sama persis dengan scratch-vm.

- `vmPrimitive: true` -> engine harus mendaftarkan fungsi primitive.
- `shape: "shadow"` tanpa primitive -> blocks-ui mendefinisikan bloknya; execute membaca nilai field
  tunggal shadow (seperti execute.js).
- `hidden: true` -> tidak di palet, tetapi tetap harus jalan bila ada di project.

## 4. Eksekusi (engine)

Tipe: `packages/engine/src/types/runtime.ts`.

- **Frame**: `compatibilityMode` default `true` -> 30 fps (`1000/30` ms). Sequencer menjalankan thread
  sampai `WORK_TIME = 0.75 * currentStepTime` habis, atau **redraw diminta** (kecuali turbo), atau
  tidak ada thread aktif. Warp (`procedures` "run without screen refresh") dibatasi `WARP_TIME = 500 ms`.
- **Urutan thread**: `startHats` mengiterasi `executableTargets` dari atas ke bawah (sprite paling
  depan lebih dulu), lalu skrip urutan `getScripts()`; thread baru ditambahkan di akhir `threads`.
  Semua harus identik dengan runtime.js / sequencer.js / execute.js.
- **Status thread**: nilai numerik `ThreadStatus` = scratch-vm (`RUNNING 0, PROMISE_WAIT 1,
  YIELD 2, YIELD_TICK 3, DONE 4`).
- **Primitive**: `(args: BlockArgs, util: BlockUtility) => PrimitiveResult`.
  - Input diberikan **mentah** (belum di-cast). Primitive meng-cast dengan `Cast` (identik cast.js).
  - Field biasa -> string; field `VARIABLE`/`LIST`/`BROADCAST_OPTION` -> `{id, name}`.
  - Kembalikan nilai untuk reporter; kembalikan `Promise` untuk menunggu (thread `PROMISE_WAIT`).
  - Blok bertimer (wait, glide, say for secs) memakai pola scratch-vm: `util.stackTimerNeedsInit()`,
    `util.startStackTimer(ms)`, `util.yield()`, `util.stackTimerFinished()`.
  - Loop: `util.startBranch(1, true)`; if: `util.startBranch(n, false)`.
  - Hat dengan predikat (edge-activated): primitive mengembalikan boolean; runtime memicu hanya saat
    false -> true.
- **BlockPackage**: setiap file `blocks/<kategori>.ts` mengekspor `create<Kategori>Blocks(runtime)`
  yang mengembalikan `{getPrimitives, getHats, getMonitored}` persis struktur scratch-vm.
- **Event runtime**: `RuntimeEventMap` (nama sama dengan scratch-vm: `PROJECT_RUN_START`, `SAY`,
  `QUESTION`, `MONITORS_UPDATE`, `SCRIPT_GLOW_ON`, `VISUAL_REPORT`, ...).
- **Determinisme**: `RuntimeOptions.time` dan `RuntimeOptions.random` agar tes dan parity bisa
  mengontrol waktu dan angka acak. `autoStart: false` + `runtime.step()` untuk tes.

## 5. Target & sprite

Tipe: `packages/engine/src/types/target.ts`.
Semua aturan RenderedTarget: `setXY` lewat `renderer.getFencedPositionOfDrawable` (tanpa renderer:
tanpa fencing), `setDirection` -> `wrapClamp(d, -179, 180)`, ukuran dibatasi oleh ukuran costume &
panggung (min/maks rendered-target.js), rotation style, efek dibatasi (ghost 0..100, brightness
-100..100), layer `goToFront/goBackwardLayers` lewat `setDrawableOrder` dengan grup `sprite`,
clone maksimum `MAX_CLONES = 300`, variabel lokal clone disalin. State ekstensi per target via
`getCustomState/setCustomState` (pen: `"Scratch.pen"`, music: `"Scratch.music"`, AI: `"Kody.<id>"`).

## 6. Renderer

Interface: `IRenderer` (`packages/engine/src/types/renderer.ts`), implementasi `@kody/renderer`
`createRenderer({canvas})`. Koordinat titik **selalu koordinat panggung Scratch**. Wajib identik
scratch-render: grup layer `background < video < pen < sprite`, efek shader (konversi nilai di
`effect-transform.ts`), `getBounds` dari convex hull, `getFencedPositionOfDrawable`,
`isTouchingColor` (toleransi warna dan mask), `pick`, balon teks, pena (diameter, ujung bulat),
SVG Scratch 2/3 (rotation center, bitmapResolution 2 untuk bitmap).

## 7. Audio

Interface: `IAudioEngine` (`packages/engine/src/types/audio.ts`), implementasi `@kody/audio`.
`targetKey = target.id`. Pitch -> `playbackRate = 2^(pitch/10/12)`, pan -100..100, volume 0..100.
`playSound` menghentikan instance sound yang sama di target yang sama dulu (scratch-audio).
WAV ADPCM wajib didukung (decoder sendiri). `getLoudness()` -1 bila mikrofon tidak aktif.

## 8. IO

Interface: `packages/engine/src/types/io.ts`. Keyboard menerima `event.key` DOM dan memetakan ke
nama Scratch (`space`, `left arrow`, ..., `any`). Mouse menerima koordinat klien + ukuran kanvas lalu
menghitung koordinat Scratch (pembulatan + clamp persis io/mouse.js). Clock = timer project.
`IVideoProvider` (kamera) diimplementasikan `@kody/ai` dan dipasang ke `runtime.ioDevices.video`.

## 9. Extension API

Tipe: `packages/engine/src/types/extension.ts`. Bentuk `ExtensionInfo` = `getInfo()` Scratch 3
(`blockType`, `arguments`, `menus`, `acceptReporters`, `isEdgeActivated`, `filter`, ...).
`ExtensionModule.getPrimitives()` memakai opcode **tanpa** prefix; runtime mendaftarkan
`${id}_${opcode}` dan shadow menu `${id}_menu_${menuName}` (helper: `extensionBlockOpcode`,
`extensionMenuOpcode`). `validateExtensionInfo()` wajib lulus untuk setiap ekstensi.
Id: `pen`, `music` (sama dengan Scratch supaya .sb3 kompatibel), `aiFace`, `aiHand`, `aiPose`,
`aiImage`, `aiObject`, `aiText`, `aiAudio`. Galeri ekstensi memakai `ExtensionCatalogEntry`
(muat lazy dengan dynamic import).

## 10. Editor blok <-> engine

Tipe: `packages/engine/src/types/editor.ts` dan `packages/blocks-ui/src/types.ts`.
- Sumber kebenaran blok = `target.blocks` (IBlocksContainer). Editor mengirim
  `EditorWorkspaceEvent` ke `target.blocks.applyEditorEvent(e)` (padanan `blocklyListen`), lalu
  merender dari container.
- Klik skrip: `runtime.toggleScript(topId, {stackClick: true})`. Glow & visual report diterima lewat
  `runtime.on("SCRIPT_GLOW_ON" | "SCRIPT_GLOW_OFF" | "VISUAL_REPORT", ...)`.
- Checkbox monitor di flyout -> `runtime.requestAddMonitor/requestUpdateMonitor`.
- `BlockDefinition` menyalin teks/argumen/bentuk scratch-blocks `blocks_vertical` (warna kategori di
  `colours.ts`, sudah final). Toolbox default menyalin `make-toolbox-xml.js` scratch-gui.
- Bahasa UI: Indonesia (`id`) default, Inggris (`en`) opsional.

## 11. Event bus app

`app/src/app-events.ts` (`AppEventMap`): koordinasi panel UI (tab, target terpilih, simpan, izin
kamera/mikrofon, alert). Event eksekusi **tidak** lewat bus ini - dengarkan runtime langsung.

## 12. Keamanan AI (wajib untuk agent ai & app)

1. Semua inferensi di browser. **Tidak ada** frame kamera, audio mikrofon, atau data latih yang
   dikirim ke server. Tidak ada kunci API di klien.
2. Model hanya dari origin sendiri di `/models/` (`isAllowedModelUrl`). Tidak memuat model/skrip
   dari URL di dalam project atau CDN pihak ketiga. File model di-vendor ke `app/public/models/`
   (MediaPipe `.task` + wasm, tfjs mobilenet, coco-ssd).
3. Kamera/mikrofon hanya dinyalakan setelah aksi pengguna (blok dijalankan atau tombol), dengan
   indikator aktif yang terlihat (`ai:device-active`) dan dimatikan saat project berhenti/ditutup.
4. Data dari project (.sb3 pengguna) adalah input tak tepercaya: label disanitasi (`sanitizeLabel`),
   model terlatih divalidasi (`validateTrainedClassifier`), ukuran dibatasi (`AI_LIMITS`),
   tidak ada `eval`/`new Function`/`innerHTML` dari data project.
5. Batas laju analisis (`AI_LIMITS.maxAnalysesPerSecond`) agar tab tidak hang di perangkat murah.
6. Jika nanti ada blok AI berbasis cloud (LLM), wajib lewat proxy server milik KodingYuk dengan
   autentikasi, rate limit, dan filter konten; di luar cakupan scaffold ini.

## 13. Keamanan file project

`loadSb3` wajib menerapkan `SB3_LIMITS` (ukuran file, jumlah entri zip, total unzip anti zip-bomb),
memvalidasi JSON sebelum dipakai, dan menolak path asset aneh. SVG costume disanitasi sebelum
dirender (hapus `<script>`, event handler `on*`, `href` eksternal) - tanggung jawab renderer.

## 14. Tes

- `npx vitest run <folder>` per agent, `npx tsc --noEmit -p .` untuk seluruh repo.
- Parity: `tests/parity/scratch-vm-oracle.ts` menjalankan project di scratch-vm asli dengan
  `GeometryWorld` (renderer geometri headless). Engine kita dijalankan dengan geometri yang sama
  lewat adaptor `IRenderer` (dibuat agent parity), lalu trace per frame dibandingkan.
- E2E: Playwright `tests/e2e` (`npm run test:e2e`).
