# Third-party notices

## Kode yang diport / disalin ke repo ini

Setiap port baris-demi-baris WAJIB ditambahkan ke tabel ini: file tujuan, file asal + versi, lisensi.
Port hanya boleh dari `_reference/bsd3-local` (versi BSD-3 / Apache-2.0). Versi Scratch terbaru di
GitHub sudah AGPL-3.0 dan **tidak boleh** disalin ke kode produk.

| File di repo ini | Asal | Versi | Lisensi |
|---|---|---|---|
| `packages/blocks-ui/src/colours.ts` (nilai warna) | scratch-blocks `core/colours.js` | 1.1.206 | Apache-2.0 |
| `packages/engine/src/monitors.ts` (`getMonitorIdForBlockWithArgs`) | scratch-vm `src/util/get-monitor-id.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/util/math-util.ts` (`wrapClamp`, `scale`, `tan`, `reducedSortOrdering`, `inclusiveRandIntWithout`) | scratch-vm `src/util/math-util.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/util/cast.ts` (Cast, plus `hexToRgb`/`decimalToRgb` dari `src/util/color.js`) | scratch-vm `src/util/cast.js`, `src/util/color.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/{thread,sequencer,execute,block-utility}.ts` (Thread, stepThreads/stepThread/stepToBranch/stepToProcedure, BlockCached + handleReport/handlePromise, BlockUtility) | scratch-vm `src/engine/thread.js`, `sequencer.js`, `execute.js`, `block-utility.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/{runtime,runtime-glows,runtime-loader,extension-manager}.ts` (startHats, _step, stopAll, greenFlag, toggleScript, executable order, monitor state, _updateGlows, _fillExtensionCategory, parseScratchObject/deserializeMonitor/installTargets) | scratch-vm `src/engine/runtime.js`, `src/serialization/sb3.js`, `src/virtual-machine.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/{blocks-container,blocks-container-events}.ts` (Blocks + cache eksekusi/hat, blocklyListen) | scratch-vm `src/engine/blocks.js`, `blocks-runtime-cache.js`, `blocks-execute-cache.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/{target-base,target,sprite}.ts` (Target, RenderedTarget: setXY/setSize/setDirection/keepInFence/layer/makeClone/dispose, Sprite) | scratch-vm `src/engine/target.js`, `src/sprites/rendered-target.js`, `src/sprites/sprite.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/io/{clock,keyboard,mouse,mouse-wheel}.ts` | scratch-vm `src/io/clock.js`, `keyboard.js`, `mouse.js`, `mouseWheel.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/util/{color,string-util}.ts`, `monitors.ts` (Color, StringUtil, uid, newBlockIds, MonitorRecord) | scratch-vm `src/util/color.js`, `string-util.js`, `uid.js`, `new-block-ids.js`, `src/engine/monitor-record.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/testing/fake-renderer.ts` (setDrawableOrder, fencing; hanya tes) | scratch-render `src/RenderWebGL.js` | 1.2.115 | BSD-3-Clause |
| `packages/engine/src/blocks/operators.ts` (semua primitive Operators) | scratch-vm `src/blocks/scratch3_operators.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/blocks/sensing.ts` (primitive Sensing, antrian ask, cache loudness, `daysSince2000`) | scratch-vm `src/blocks/scratch3_sensing.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/blocks/data.ts` (primitive Variables & Lists, `LIST_ITEM_LIMIT`) | scratch-vm `src/blocks/scratch3_data.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/util/__fixtures__/cast-oracle.json` (tabel keluaran, dihasilkan `gen-cast-oracle.cjs`) | keluaran scratch-vm `cast.js`/`scratch3_operators.js`/`math-util.js` | 4.8.102 | BSD-3-Clause |
| `tests/parity/geometry-renderer.ts` (fencing) | scratch-render `src/RenderWebGL.js` `getFencedPositionOfDrawable` | 1.2.115 | BSD-3-Clause |
| `packages/engine/src/blocks/motion.ts` (semua primitive Motion, `limitPrecision`, `ifOnEdgeBounce`) | scratch-vm `src/blocks/scratch3_motion.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/blocks/looks.ts` (primitive Looks, balon say/think, `_setCostume`/`_setBackdrop`, `clampEffect`) | scratch-vm `src/blocks/scratch3_looks.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/blocks/control.ts` (logika primitive Control) | scratch-vm `src/blocks/scratch3_control.js` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/blocks/event.ts` (logika primitive & metadata hat Events) | scratch-vm `src/blocks/scratch3_event.js`, `src/io/mouse.js` `_activateClickHats` | 4.8.102 | BSD-3-Clause |
| `packages/engine/src/blocks/sound.ts` (logika primitive Sound) | scratch-vm `src/blocks/scratch3_sound.js` | 4.8.102 | BSD-3-Clause |
| `packages/audio/src/adpcm.ts` (dekoder IMA ADPCM, tabel step/index) | scratch-audio `src/ADPCMSoundDecoder.js`, `src/ArrayBufferStream.js` | 1.0.325 | BSD-3-Clause |
| `packages/audio/src/effects.ts`, `effect-chain.ts` (Pan/Pitch/Volume, logika patch) | scratch-audio `src/effects/*.js` | 1.0.325 | BSD-3-Clause |
| `packages/audio/src/sound-player.ts`, `audio-engine.ts` (SoundPlayer take/fade, SoundBank) | scratch-audio `src/SoundPlayer.js`, `src/SoundBank.js`, `src/AudioEngine.js` | 1.0.325 | BSD-3-Clause |
| `packages/audio/src/loudness.ts` (rumus loudness) | scratch-audio `src/Loudness.js` | 1.0.325 | BSD-3-Clause |
| `packages/ext-pen/src/pen.ts`, `pen-state.ts`, `pen-info.ts` (logika & getInfo Pen: wrap/clamp warna, legacy shade/hue, ukuran 1..1200) | scratch-vm `src/extensions/scratch3_pen/index.js` | 4.8.102 | BSD-3-Clause |
| `packages/ext-pen/src/icons.ts` (ikon blok Pen, data URI) | scratch-vm `src/extensions/scratch3_pen/index.js` | 4.8.102 | BSD-3-Clause |
| `packages/ext-pen/src/__fixtures__/pen-oracle.json` (dihasilkan `gen-pen-oracle.cjs`) | keluaran scratch-vm `scratch3_pen` | 4.8.102 | BSD-3-Clause |
| `packages/ext-music/src/music.ts`, `music-info.ts` (logika Music, tabel DRUM/INSTRUMENT/MIDI_INSTRUMENTS/MIDI_DRUMS, batas) | scratch-vm `src/extensions/scratch3_music/index.js` | 4.8.102 | BSD-3-Clause |
| `packages/ext-music/src/music-audio.ts` (perilaku take/isStarting/DECAY_DURATION, release nada) | scratch-vm `scratch3_music/index.js`, scratch-audio `src/SoundPlayer.js` | 4.8.102 / 1.0.325 | BSD-3-Clause |
| `packages/ext-music/src/icons.ts` (ikon blok & menu Music) | scratch-vm `src/extensions/scratch3_music/index.js` | 4.8.102 | BSD-3-Clause |
| `packages/ext-music/assets/**/*.mp3` (61 sampel: 18 drum, 43 sampel instrumen) | scratch-vm `src/extensions/scratch3_music/assets/` | 4.8.102 | BSD-3-Clause |
| `packages/ext-music/src/__fixtures__/music-oracle.json` (dihasilkan `gen-music-oracle.cjs`) | keluaran scratch-vm `scratch3_music` | 4.8.102 | BSD-3-Clause |
| `packages/ext-music/src/music-synth.ts` (sintesis cadangan drum/instrumen) | ditulis sendiri | - | milik sendiri |
| `packages/project/src/{deserialize,deserialize-blocks,serialize,opcode-check}.ts` (logika sb3 serialize/deserialize, kompresi primitif, `getExtensionIdForOpcode`, `replaceUnsafeCharsInVariableIds`, `deserializeMonitor`) | scratch-vm `src/serialization/sb3.js`, `src/serialization/deserialize-assets.js` | 4.8.102 | BSD-3-Clause |
| `packages/project/src/{validate,validate-blocks}.ts` (aturan tipe skema sb3), `sb3-file.ts` (`parseProjectJsonText`, deteksi signature, pencarian project.json) | scratch-parser `lib/sb3_schema.json`, `lib/sb3_definitions.json`, `lib/parse.js`, `lib/unpack.js`, `lib/unzip.js` | 5.2.1 | BSD-3-Clause |
| `packages/project/src/sprite3.ts` (`loadSprite3`/`saveSprite3`: sprite.json + asset, DEFLATE 6), `serialize.ts` `serializeSprite` | scratch-vm `src/virtual-machine.js` (`exportSprite`, `_addSprite3`), `src/serialization/sb3.js` (`serialize` dengan targetId) | 4.8.102 | BSD-3-Clause |
| `app/src/host/sprite-install.ts` (`fixUpVariableReferences`, `mergeVariables`, `installTargets` untuk satu sprite, `renameSprite` -> `updateAssetName`) | scratch-vm `src/engine/target.js`, `src/virtual-machine.js` | 4.8.102 | BSD-3-Clause |
| `packages/project/src/__fixtures__/scratch-vm-oracle/*.json` (data keluaran `vm.toJSON()` untuk fixture uji, bukan kode) | keluaran scratch-vm atas `test/fixtures/*.sb3` | 5.0.300 | data uji (tidak dibundel) |
| `app/src/assets/kodyblocks-logo.png`, `app/public/kody.svg` | KodyBlocks (milik KodingYuk) | - | milik sendiri |
| `app/src/costume-tab/asset-list-logic.ts` (add/rename/delete/reorder costume & sound, aturan seleksi tab) | scratch-vm `src/sprites/sprite.js`, `src/sprites/rendered-target.js`, `src/virtual-machine.js`; scratch-gui `containers/sound-tab.jsx`, `containers/costume-tab.jsx` (lewat fork KodyBlocks) | 4.8.102 / fork KodyBlocks | BSD-3-Clause |
| `app/src/costume-tab/costume-upload.ts` (`getResizedWidthHeight`, aturan jenis file & nama frame) | scratch-svg-renderer `src/bitmap-adapter.js`; scratch-gui `lib/file-uploader.js` (fork KodyBlocks) | 2.5.40 / fork KodyBlocks | BSD-3-Clause |
| `app/src/sound-tab/sound-effects.ts` (parameter & tata letak efek), `app/src/sound-tab/sound-edit.ts` (RMS, hapus/potong/tempel, downsample, potong-otomatis rekaman) | scratch-gui `lib/audio/audio-effects.js`, `lib/audio/effects/*.js`, `lib/audio/audio-util.js`, `lib/audio/audio-recorder.js`, `containers/sound-editor.jsx` (fork KodyBlocks) | fork KodyBlocks | BSD-3-Clause |
| `app/public/assets/library/*` (sprite, latar, suara pustaka) | dibuat generator `app/src/library/art/*` & `app/src/library/audio/*` (gambar & suara sintesis orisinal; varian maskot Kody) | - | milik sendiri (KodingYuk) |

| `packages/engine/src/blocks/procedures.ts` (procedures_call/definition, argument reporter) | scratch-vm `src/blocks/scratch3_procedures.js` | 4.8.102 | BSD-3-Clause |
| `packages/blocks-ui/src/toolbox.ts` (isi, urutan, gap & shadow default palet) | scratch-gui `src/lib/make-toolbox-xml.js`, `containers/blocks.jsx` getToolboxXML (fork KodyBlocks) | fork KodyBlocks | BSD-3-Clause |
| `packages/blocks-ui/src/workspace/share-blocks.ts` (salin skrip ke sprite lain: shareBlocksToTarget, resolveVariableSharingConflictsWithTarget, shareLocalVariableToStage/Sprite, mergeVariables, getAllVariableAndListReferences) | scratch-vm `src/virtual-machine.js`, `src/engine/target.js`, `src/engine/blocks.js` | 4.8.102 | BSD-3-Clause |
| `app/src/host/{asset-host,asset-actions,media-loader}.ts` (aturan deleteCostume/addCostume/addSprite, randomizeSpritePosition, loadVector_/loadBitmap_) | scratch-vm `src/virtual-machine.js`, `src/sprites/rendered-target.js`, `src/import/load-costume.js`; scratch-gui `lib/randomize-sprite-position.js` (fork KodyBlocks) | 4.8.102 / fork KodyBlocks | BSD-3-Clause |
| `packages/renderer/src/*` (Rectangle, color-conversions, EFFECT_INFO, EffectTransform, Silhouette, Drawable, layer/collision/hull RenderWebGL, shader sprite.vert/frag, Skin/Bitmap/SVG/Pen/TextBubble, text-wrapper) - rincian per file di `packages/renderer/THIRD_PARTY.md` | scratch-render `src/*` | 1.2.115 | BSD-3-Clause |
| `packages/renderer/src/skins/svg-loader.ts` (`fixupSvgString`) | scratch-svg-renderer `src/fixup-svg-string.js` | 2.5.40 | BSD-3-Clause |
| `app/public/models/*` (MediaPipe wasm + .task, MobileNet, COCO-SSD; disalin `packages/ai/tools/vendor-models.mjs`, hash SHA-256 dipin di manifest) | Google MediaPipe `@mediapipe/tasks-vision` 0.10.32, TF Hub / tfjs-models | - | Apache-2.0 |

## Teks lisensi

### BSD-3-Clause (scratch-vm, scratch-render, scratch-audio, scratch-svg-renderer versi lama)

Copyright (c) 2016, Massachusetts Institute of Technology. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted
provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions
   and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of
   conditions and the following disclaimer in the documentation and/or other materials provided
   with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to
   endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### Apache-2.0 (scratch-blocks 1.1.206)

Licensed under the Apache License, Version 2.0. Teks lengkap:
https://www.apache.org/licenses/LICENSE-2.0 (salinan di `_reference/bsd3-local/scratch-blocks/LICENSE`).

## Merek

"Scratch", logo Scratch, dan Scratch Cat adalah merek Scratch Foundation (lihat file TRADEMARK di
repo Scratch). Produk ini tidak memakai nama/logo/maskot Scratch; maskot kita adalah Kody.

## Dependensi runtime (npm)

react, react-dom (MIT); jszip (MIT/GPLv3 dual - dipakai di bawah MIT); idb (ISC); twgl.js (MIT);
@tensorflow/tfjs, @tensorflow-models/mobilenet, @tensorflow-models/coco-ssd (Apache-2.0);
@mediapipe/tasks-vision (Apache-2.0).

## Dependensi khusus tes (tidak dibundel)

scratch-vm 5.0.300 (AGPL-3.0-only) - hanya oracle di `tests/parity`, tidak pernah diimpor kode produksi
dan tidak ikut build `dist/`.
