# @kody/renderer - kode yang diport

Semua port berasal dari `_reference/bsd3-local/scratch-render` **1.2.115** (BSD-3-Clause, teks lisensi di
`THIRD_PARTY.md` root). Tidak ada kode yang disalin dari clone scratch-render terbaru (AGPL-3.0).
Baris-baris ini perlu digabung ke tabel `THIRD_PARTY.md` root oleh pemilik file tersebut.

| File di repo ini | Asal (scratch-render 1.2.115) | Lisensi |
|---|---|---|
| `packages/renderer/src/rectangle.ts` | `src/Rectangle.js` | BSD-3-Clause |
| `packages/renderer/src/color-conversions.ts` | `src/util/color-conversions.js` | BSD-3-Clause |
| `packages/renderer/src/effect-info.ts` | `src/ShaderManager.js` (EFFECT_INFO, EFFECTS, DRAW_MODE) | BSD-3-Clause |
| `packages/renderer/src/effect-transform.ts` | `src/EffectTransform.js` | BSD-3-Clause |
| `packages/renderer/src/silhouette.ts` | `src/Silhouette.js` | BSD-3-Clause |
| `packages/renderer/src/drawable.ts` | `src/Drawable.js` | BSD-3-Clause |
| `packages/renderer/src/convex-hull.ts` (pemindaian kiri/kanan) | `src/RenderWebGL.js` `_getConvexHullPointsForDrawable` | BSD-3-Clause |
| `packages/renderer/src/layer-list.ts` | `src/RenderWebGL.js` (layer group, setDrawableOrder) | BSD-3-Clause |
| `packages/renderer/src/collision.ts` | `src/RenderWebGL.js` (isTouchingDrawables, isTouchingColor jalur CPU, pick, sampleColor3b, getFencedPositionOfDrawable, clientSpaceToScratchBounds) | BSD-3-Clause |
| `packages/renderer/src/shaders.ts` | `src/shaders/sprite.vert`, `src/shaders/sprite.frag` | BSD-3-Clause |
| `packages/renderer/src/skins/skin.ts` | `src/Skin.js` | BSD-3-Clause |
| `packages/renderer/src/skins/bitmap-skin.ts` | `src/BitmapSkin.js` | BSD-3-Clause |
| `packages/renderer/src/skins/svg-skin.ts` | `src/SVGSkin.js` | BSD-3-Clause |
| `packages/renderer/src/skins/pen-skin.ts` (atribut default, offset 0.5) | `src/PenSkin.js` | BSD-3-Clause |
| `packages/renderer/src/skins/text-bubble-skin.ts` | `src/TextBubbleSkin.js` | BSD-3-Clause |
| `packages/renderer/src/skins/text-wrap.ts` (algoritma pembungkus) | `src/util/text-wrapper.js` | BSD-3-Clause |
| `packages/renderer/src/skins/svg-loader.ts` (`fixupSvgString`) | scratch-svg-renderer 2.5.40 `src/fixup-svg-string.js` | BSD-3-Clause |

Ditulis ulang sendiri (bukan salinan):
- `monotoneConvexHull` (setara hasil hull.js 0.2.10 dengan concavity Infinity, algoritma Andrew).
- Rasterisasi garis pena CPU (`rasterizeLine`) dan stamp CPU (`pen-stamp.ts`), emulasi shader float
  (`gpu-sampler.ts`): rumus diturunkan dari `sprite.vert`/`sprite.frag`, implementasi baru.
- Sanitasi SVG (`svg-loader.ts`), backend WebGL/Canvas2D, VideoSkin.

Tes `packages/renderer/test/oracle-parity.test.ts` memuat scratch-render 1.2.115 dari `_reference`
**hanya saat tes** (tidak dibundel) untuk membandingkan hasil di adegan acak.
