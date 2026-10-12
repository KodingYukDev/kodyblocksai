# Graph Report - kodyblocks-ai-v2  (2026-10-12)

## Corpus Check
- 562 files · ~591,489 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 5712 nodes · 16338 edges · 191 communities (165 shown, 26 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 289 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c9e1103d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- svgDoc
- ITarget
- Cast
- BlocksWorkspace
- layout.ts
- target.ts
- IRuntime
- index.ts
- BlockUtility
- KodyShell.tsx
- services.ts
- actions.ts
- runtime.ts
- IThread
- lab-session.ts
- index.ts
- helpers.ts
- Block
- engine-runner.ts
- Skin
- content.ts
- loaders.ts
- runtime-host.ts
- LabSession
- fakes.ts
- RenderedTarget
- CostumeTab.tsx
- index.ts
- EffectChain
- b
- IBlocksContainer
- control.ts
- IRenderer
- Monitor.tsx
- looks.ts
- editor.ts
- audio-engine.test.ts
- types.ts
- StagePane.tsx
- KodyRenderer
- icons.tsx
- deserialize.ts
- AiServices
- FakeRenderer
- sound-media.ts
- pen.ts
- validate.ts
- new-asset.ts
- camera.ts
- index.ts
- renderer-core.ts
- autosave.test.ts
- index.ts
- BlocksContainer
- Drawable
- SoundEditor.tsx
- sound.ts
- drawable.ts
- knn.ts
- flag
- index.ts
- Harness
- costume-media.ts
- adpcm.ts
- library-loader.ts
- instantiate.ts
- layout.ts
- sb3-file.ts
- i18n.ts
- runtime-controller.ts
- index.ts
- parity-runner.ts
- ShellController
- DirectionPicker.tsx
- ai-examples.ts
- undo.ts
- webgl-backend.ts
- music.ts
- pwa-plugin.test.ts
- bitmap-ops.ts
- vector-doc.ts
- KodyShell.test.tsx
- asset-list-logic.ts
- TextBubbleSkin
- extract-scratch-blocks.mjs
- Thread
- oracle-parity.test.ts
- AudioEngineImpl
- harness.test.ts
- AiTutorials.tsx
- PaintEditor.tsx
- default-project.ts
- sound-effects.ts
- list-monitor-logic.ts
- helpers.ts
- GeometryWorld
- CodePanel.tsx
- extensions.ts
- geometry.test.ts
- gif-decoder.ts
- audio-engine.ts
- MonitorRecord
- MonitorOverlay.tsx
- devDependencies
- IAudioEngine
- EditorTabs.tsx
- music-audio.test.ts
- compilerOptions
- KodyBlocks AI v2 - Kontrak Antarmodul
- dependencies
- music-audio.ts
- deserialize-blocks.ts
- AssetEditorHost
- .block
- KodyBlocks AI v2 - Status integrasi
- SoundPlayer
- toolbox.ts
- generate-icons.mjs
- IRenderedTarget
- PenSkin
- Silhouette
- ErrorBoundary
- FakeAudio
- opcodes.ts
- music-synth.ts
- types.ts
- music.test.ts
- PaintEditor
- scripts
- Clock
- FakeRuntime
- vendor-models.mjs
- definitions.ts
- oracle.test.ts
- include
- LimitedZip
- paths
- MusicSampleBank
- check-no-scratch-import.mjs
- Third-party notices
- BitmapToolSession
- KodyBlocks AI v2: Keamanan & Privasi AI
- Canvas2DBackend
- sw-template.js
- Parity test (engine KodyBlocks vs scratch-vm)
- PaintHistory
- VectorToolSession
- include
- KodyDialog.tsx
- package.json
- Overlay
- run-bench.mjs
- playwright.prod.config.ts
- KodyBlocks AI v2
- oracle-source.test.ts
- files
- /models/coco-ssd/group1-shard1of5
- /models/coco-ssd/group1-shard2of5
- /models/coco-ssd/group1-shard3of5
- /models/coco-ssd/group1-shard4of5
- /models/coco-ssd/group1-shard5of5
- /models/coco-ssd/model.json
- /models/mediapipe/face_landmarker.task
- /models/mediapipe/hand_landmarker.task
- /models/mediapipe/pose_landmarker.task
- /models/mediapipe/wasm/vision_wasm_internal.js
- /models/mediapipe/wasm/vision_wasm_internal.wasm
- /models/mediapipe/wasm/vision_wasm_nosimd_internal.js
- /models/mediapipe/wasm/vision_wasm_nosimd_internal.wasm
- /models/mobilenet/model.json
- /models/mobilenet/weights.bin
- no-network.test.ts
- ModelProvider
- MusicExtensionModule
- lib
- MusicSampleUrls
- playwright.config.ts
- types
- @kody/audio
- @kody/engine
- @kody/ext-pen
- @kody/project
- @kody/renderer
- typescript
- vite
- README.md
- THIRD_PARTY.md
- CHECKBOX_MARGIN

## God Nodes (most connected - your core abstractions)
1. `ITarget` - 178 edges
2. `IRuntime` - 165 edges
3. `Runtime` - 101 edges
4. `Block` - 86 edges
5. `BlocksWorkspace` - 83 edges
6. `KodyRenderer` - 69 edges
7. `RenderedTarget` - 63 edges
8. `IRenderer` - 63 edges
9. `b()` - 63 edges
10. `Cast` - 62 edges

## Surprising Connections (you probably didn't know these)
- `parseHeaders()` --indirect_call--> `line()`  [INFERRED]
  tests/e2e/serve-prod.mjs → app/src/library/art/svg-kit.ts
- `showPrompt()` --indirect_call--> `ok()`  [INFERRED]
  packages/blocks-ui/src/workspace/dialogs.ts → scripts/pwa-plugin.test.ts
- `canvasToPng()` --indirect_call--> `b()`  [INFERRED]
  app/src/costume-tab/costume-media.ts → packages/blocks-ui/src/toolbox.ts
- `sanitizeSvgElement()` --indirect_call--> `attr()`  [INFERRED]
  packages/renderer/src/skins/svg-loader.ts → app/src/costume-tab/costume-upload.ts
- `mount()` --indirect_call--> `host()`  [INFERRED]
  packages/ai/src/ui/consent-lab.test.tsx → app/src/costume-tab/memory-host.test.ts

## Import Cycles
- 2-file cycle: `packages/project/src/autosave.ts -> packages/project/src/autosaver.ts -> packages/project/src/autosave.ts`

## Communities (191 total, 26 thin omitted)

### Community 0 - "svgDoc"
Cohesion: 0.06
Nodes (134): BackdropArt, CostumeArt, SoundArt, SpriteArt, BACKDROP_SIZE, backdropArts(), buildings(), cloudShape() (+126 more)

### Community 1 - "ITarget"
Cohesion: 0.03
Nodes (9): fixUpVariableReferences(), QueuedQuestion, upperFields(), asRenderedTarget(), IRuntimeInternal, Runtime, RuntimeListener, ITarget (+1 more)

### Community 2 - "Cast"
Cohesion: 0.06
Nodes (78): LoadedExtension, finite(), handFeatures(), poseFeatures(), notifyTrainedModelChanged(), Parsed, TRAINED_KIND_EXTENSION, TrainedModelCache (+70 more)

### Community 3 - "BlocksWorkspace"
Cohesion: 0.05
Nodes (11): BlocksEditorProps, EditorActions, BlocksWorkspace, FieldSpec, GestureHandler, isDragTowardWorkspace(), resolveDraggable(), cloneBlock() (+3 more)

### Community 4 - "layout.ts"
Cohesion: 0.06
Nodes (71): cleanUpEvents(), orderedTopBlocks(), COMMENT_DEFAULT_SIZE, COMMENT_MIN_SIZE, CommentNode, commentsInTrees(), withCommentDeletes(), allPlacements() (+63 more)

### Community 5 - "target.ts"
Cohesion: 0.05
Nodes (43): buildTarget(), installSprite(), InstallSpriteDeps, shareBroadcastsToStage(), VarRef, createBlocksContainer(), createMonitorRecord(), findAsset() (+35 more)

### Community 6 - "IRuntime"
Cohesion: 0.04
Nodes (24): createClock(), createIODevices(), createKeyboard(), KEY_NAME, KEY_NAME_LIST, keyArgToScratchKey(), Keyboard, keyStringToScratchKey() (+16 more)

### Community 7 - "index.ts"
Cohesion: 0.05
Nodes (37): FakeRuntime, createBlockUtility(), StackTimerState, CORE_BLOCK_PACKAGES, createSensingBlocks(), currentDatePart(), daysSince2000(), SensingBlocks (+29 more)

### Community 8 - "BlockUtility"
Cohesion: 0.05
Nodes (44): asItem(), createDataBlocks(), fieldRef(), getList(), getVariable(), listContentsToString(), ListVariable, requestCloudUpdate() (+36 more)

### Community 9 - "KodyShell.tsx"
Cohesion: 0.05
Nodes (48): AppBus, AppLocale, LoadingScreen(), AutosaverDeps, AutosaveRecord, createIdbAutosaveStore(), createMemoryAutosaveStore(), createShellAutosaver() (+40 more)

### Community 10 - "services.ts"
Cohesion: 0.04
Nodes (43): rec(), AcquiredFrame, AiServiceEventMap, AiServicesOptions, defaultTimers, documentVisibility(), registry, ResetReason (+35 more)

### Community 11 - "actions.ts"
Cohesion: 0.07
Nodes (58): ArgSpec, Region, VAR_TYPES, ProcedureParts, buttons(), modalShell(), PromptOptions, PromptResult (+50 more)

### Community 12 - "runtime.ts"
Cohesion: 0.05
Nodes (45): BlocksCache, cloneMyself, flag, listField, realKit(), varField, BlockCached, ContainerBlockExtras (+37 more)

### Community 13 - "IThread"
Cohesion: 0.04
Nodes (17): BlockUtilityImpl, ContainerBlock, ArgValues, BroadcastOption, execute(), fallbackCaches, handlePromise(), handleReport() (+9 more)

### Community 14 - "lab-session.ts"
Cohesion: 0.05
Nodes (53): AudioFeatureWindow, bandEnergies(), bandLayout, VectorKind, featurePoints(), HAND_EDGES, POSE_EDGES, KIND_NAMES (+45 more)

### Community 15 - "index.ts"
Cohesion: 0.05
Nodes (33): ProjectModel, MemoryAssetStore, referencedAssets(), StoredAsset, AutosaveEntry, AutosaveStore, AutosaveStoreOptions, AutosaveBackend (+25 more)

### Community 16 - "helpers.ts"
Cohesion: 0.07
Nodes (60): click(), pointer(), byText(), Element, xmlToRenderBlock(), pointer(), fixupSvgString(), FONT_FALLBACKS (+52 more)

### Community 17 - "Block"
Cohesion: 0.07
Nodes (41): ctx(), MOTION, VARS, simulate(), DropResult, FakeContainer, setup(), TOOLBOX (+33 more)

### Community 18 - "engine-runner.ts"
Cohesion: 0.05
Nodes (45): CANVAS, ParityAction, CaseDef, EngineResult, EngineRunOptions, monitorSnapshot(), parityMediaLoader, runEngine() (+37 more)

### Community 19 - "Skin"
Cohesion: 0.07
Nodes (20): BitmapSource, Any2DContext, AnyCanvas, createCanvas(), get2d(), getSourceSize(), isPixelData(), PixelData (+12 more)

### Community 20 - "content.ts"
Cohesion: 0.06
Nodes (28): base(), Builder, fieldArgs(), flyoutBlockId(), FlyoutBuildContext, FlyoutContent, FlyoutItem, VAR_FIELD_TYPES (+20 more)

### Community 21 - "loaders.ts"
Cohesion: 0.06
Nodes (48): createDefaultDetectorFactories(), Fileset, FrameDims, LoaderDeps, MODEL_PATHS, SIMD_PROBE, TfModelArtifacts, tfReady() (+40 more)

### Community 22 - "runtime-host.ts"
Cohesion: 0.07
Nodes (36): AiLab, App(), AppWithHost(), AppWithHostProps, LibraryRequest, Locale, AssetActionDeps, createAssetActions() (+28 more)

### Community 23 - "LabSession"
Cohesion: 0.06
Nodes (11): trained(), clearTrained(), ModelFile, parseTrained(), readTrained(), serializeModelFile(), writeTrained(), TextClassifier (+3 more)

### Community 24 - "fakes.ts"
Cohesion: 0.06
Nodes (29): TRAINED_STATE_KEYS, cameraConstraints(), MediaStreamLike, camera(), AnalyserLike, AudioContextCtor, AudioContextLike, MIC_CONSTRAINTS (+21 more)

### Community 25 - "RenderedTarget"
Cohesion: 0.06
Nodes (4): asRuntimeInternal(), getRuntimeRandom(), RenderedTarget, TestKit

### Community 26 - "CostumeTab.tsx"
Cohesion: 0.08
Nodes (39): AddMenu(), AddMenuItem, AddMenuProps, MenuButton(), AssetList(), AssetListItem, AssetListProps, MenuState (+31 more)

### Community 27 - "index.ts"
Cohesion: 0.07
Nodes (42): AI_EXTENSIONS, AI_EXTRA_OPCODES, parseModelFile(), TextNbPayload, tokenize(), manifestFor(), sha(), asGroups() (+34 more)

### Community 28 - "EffectChain"
Cohesion: 0.06
Nodes (13): EffectChain, AudioCore, Effect, EffectName, EffectOwner, InputProvider, PanEffect, panToGains() (+5 more)

### Community 29 - "b"
Cohesion: 0.11
Nodes (52): L(), Arg, argRef(), b(), bc(), bcId(), BOOLEAN_SLOTS, BroadcastArg (+44 more)

### Community 30 - "IBlocksContainer"
Cohesion: 0.06
Nodes (8): isBlocksContainer(), getCached(), GlowTracker, has(), TargetBase, IBlocksContainer, Variable, uid()

### Community 31 - "control.ts"
Cohesion: 0.05
Nodes (29): cloneMenuOptions(), ControlBlockPackage, controlStopHasNext(), controlStopMutation(), controlStopOptions(), createControlBlocks(), HBlock, Reporter (+21 more)

### Community 32 - "IRenderer"
Cohesion: 0.04
Nodes (9): BITMAP_MIME, createMediaLoader(), defaultDecodeBitmap(), MediaLoaderDeps, sliceBuffer(), fakeRenderer(), svgState, FakeRuntimeOptions (+1 more)

### Community 33 - "Monitor.tsx"
Cohesion: 0.07
Nodes (35): ContextMenu(), ContextMenuItem, ContextMenuProps, ContextMenuState, useContextMenuTrigger(), pickFiles(), readPickedFile(), SpriteInfoPatch (+27 more)

### Community 34 - "looks.ts"
Cohesion: 0.06
Nodes (20): BubbleState, clampEffect(), createLooksBlocks(), defaultBubbleState(), EFFECT_BRIGHTNESS_LIMIT, EFFECT_GHOST_LIMIT, formatBubbleText(), jsIsNaN() (+12 more)

### Community 35 - "editor.ts"
Cohesion: 0.09
Nodes (38): UI_COLOURS, CategoryMenu, FlyoutSection, createMeasurer(), svg(), collectTree(), SavedView, pinchView() (+30 more)

### Community 36 - "audio-engine.test.ts"
Cohesion: 0.05
Nodes (13): createAudioEngine(), lastSource(), micSetup(), setup(), buildAdpcmWav(), MockAnalyser, MockAudioContext, MockBuffer (+5 more)

### Community 37 - "types.ts"
Cohesion: 0.08
Nodes (26): BlocksEditor(), BlocksEditorComponentProps, reload(), setLocale(), controlDefinitions, dataDefinitions, eventsDefinitions, allCoreDefinitions() (+18 more)

### Community 38 - "StagePane.tsx"
Cohesion: 0.08
Nodes (32): StageSizeMode, computeShellLayout(), dimsFromWidth(), fitStage(), getShellMode(), LayoutOptions, ShellLayout, ShellMode (+24 more)

### Community 39 - "KodyRenderer"
Cohesion: 0.06
Nodes (6): BubbleType, DrawableProperties, DrawablePropertyBag, bufferRatio(), KodyRenderer, VideoFrame

### Community 40 - "icons.tsx"
Cohesion: 0.07
Nodes (36): useDismiss(), AllAroundIcon(), BackdropIcon(), CaretIcon(), DontRotateIcon(), EyeIcon(), EyeOffIcon(), FileIcon() (+28 more)

### Community 41 - "deserialize.ts"
Cohesion: 0.08
Nodes (45): DeserializeHooks, parseComment(), ParseContext, parseCostume(), parseMonitor(), parseSound(), parseTarget(), parseVariables() (+37 more)

### Community 42 - "AiServices"
Cohesion: 0.08
Nodes (20): IntervalTimers, CameraKind, Captured, captureFromCamera(), captureFromFile(), decodeImageFile(), DETECT_SIZE, EMBED_SIZE (+12 more)

### Community 43 - "FakeRenderer"
Cohesion: 0.06
Nodes (6): FakeRenderer, headersFor(), parseHeaders(), port, root, TYPES

### Community 44 - "sound-media.ts"
Cohesion: 0.10
Nodes (28): makeSound(), AudioRecorder, pickRecorderMime(), RecordingResult, RecordModal(), RecordModalProps, classifySoundFile(), CONVERT_EXT (+20 more)

### Community 45 - "pen.ts"
Cohesion: 0.09
Nodes (30): Color, HSVObject, RGBObject, createPenExtension(), createPenExtensionWithOptions(), EN, getPenInfo(), ID (+22 more)

### Community 46 - "validate.ts"
Cohesion: 0.18
Nodes (43): ref(), isKnownOpcode(), PROJECT_LIMITS, UnknownOpcodePolicy, BlockCheckContext, BOOL_STRINGS, checkBlock(), checkFields() (+35 more)

### Community 47 - "new-asset.ts"
Cohesion: 0.10
Nodes (27): CameraModal(), CameraModalProps, CostumeTabProps, built, loader, assetListLogic, createMemoryAssetHost(), MemoryTarget (+19 more)

### Community 48 - "camera.ts"
Cohesion: 0.08
Nodes (16): CAMERA_CONSTRAINTS, CameraController, CameraDeps, CameraEventMap, Canvas2DLike, CanvasLike, DEFAULT_FRAME_SIZE, defaultGetUserMedia() (+8 more)

### Community 49 - "index.ts"
Cohesion: 0.09
Nodes (37): BLOCK_MEDIA, displayText(), instantiateBlock(), layoutRenderBlock(), renderBlockToSvg(), RenderOptions, BlockColours, ChildPlacement (+29 more)

### Community 50 - "renderer-core.ts"
Cohesion: 0.08
Nodes (22): Rect, blendColor, Candidate, candidatesBounds(), candidatesTouching(), colorMatches(), drawableTouchingBounds(), fenceBounds (+14 more)

### Community 51 - "autosave.test.ts"
Cohesion: 0.09
Nodes (34): fakeTimers(), fixture(), setup(), deserializeProject(), deserializeProjectWithReport(), load(), Mutable, bigProject() (+26 more)

### Community 52 - "index.ts"
Cohesion: 0.10
Nodes (34): CategoryColours, baseInfo(), BlockInfo, CATEGORY_TO_COLOURS, checkOf(), coloursForCategory(), ConnCheck, fallbackInfo() (+26 more)

### Community 53 - "BlocksContainer"
Cohesion: 0.09
Nodes (8): BlocksContainer, cloneMutation(), emptyCache(), applyEditorEventTo(), copyBlock(), has(), has(), parseJsonArray()

### Community 54 - "Drawable"
Cohesion: 0.09
Nodes (8): RGBA, makeRenderer(), cross(), determinant(), getConvexHullPointsForDrawable(), monotoneConvexHull(), Drawable, defaultEffectUniforms()

### Community 55 - "SoundEditor.tsx"
Cohesion: 0.11
Nodes (24): autoTrimRecording(), computeChunkedRMS(), computeRMS(), copySelection(), cropToSelection(), deleteSelection(), downsampleIfNeeded(), EditResult (+16 more)

### Community 56 - "sound.ts"
Cohesion: 0.09
Nodes (19): BEAT_RANGE, cloneState(), createSoundBlocks(), defaultSoundState(), getSoundIndex(), getSoundIndexByName(), getSoundState(), hasOwn() (+11 more)

### Community 57 - "drawable.ts"
Cohesion: 0.11
Nodes (29): framebufferScale(), FrameInfo, CachedImage, hsvToRgb(), rgbToHsv(), getLocalPosition(), hullProjection, isTouchingPosition (+21 more)

### Community 58 - "knn.ts"
Cohesion: 0.10
Nodes (18): A, C, Example, KNN_LIMITS, KnnClassifier, KnnMode, KnnOptions, KnnPayload (+10 more)

### Community 59 - "flag"
Cohesion: 0.19
Nodes (33): flag(), forever(), menu(), setVar(), wait(), mkCase(), probeCase(), allParityCases() (+25 more)

### Community 60 - "index.ts"
Cohesion: 0.13
Nodes (21): classOptions(), blockDefinitions(), ARGUMENT_TYPE_MAP, buildMenuBlock(), convertBlock(), ConvertedExtension, convertExtension(), convertMenuItems() (+13 more)

### Community 61 - "Harness"
Cohesion: 0.10
Nodes (5): Harness, HTarget, HThread, frames(), frames()

### Community 62 - "costume-media.ts"
Cohesion: 0.15
Nodes (32): bitmapCostume(), canvas(), canvasToPng(), captureVideoFrame(), CostumeImportError, costumesFromFile(), costumeToPixels(), ctx2d() (+24 more)

### Community 63 - "adpcm.ts"
Cohesion: 0.12
Nodes (20): AdpcmDecoded, AdpcmFormatError, AdpcmHeader, __adpcmTables, ByteStream, decodeAdpcmSamples(), decodeAdpcmWav(), deltaTable() (+12 more)

### Community 64 - "library-loader.ts"
Cohesion: 0.14
Nodes (26): costumeFromLibrary(), soundFromLibrary(), loadCostumeEntry(), LoadedSprite, loadSoundEntry(), loadSpriteEntry(), previewAsset(), checkCostume() (+18 more)

### Community 65 - "instantiate.ts"
Cohesion: 0.12
Nodes (29): MESSAGES_EN, MESSAGES_ID, ScratchArgJson, BlockLocale, InterpolationToken, merged, resolveMessage(), tokenizeInterpolation() (+21 more)

### Community 66 - "layout.ts"
Cohesion: 0.12
Nodes (34): OutputShape, FieldInstance, FieldSize, measureField(), RenderedSvg, BlockInstance, InputInstance, alignedCursor() (+26 more)

### Community 67 - "sb3-file.ts"
Cohesion: 0.16
Nodes (29): jszip, jszip, createAssetStore(), convertValidatedProject(), K, md5Hex(), md5String(), S (+21 more)

### Community 68 - "i18n.ts"
Cohesion: 0.09
Nodes (21): en, id, LocaleContext, MessageKey, Messages, Translate, useT(), ArrowIcon() (+13 more)

### Community 69 - "runtime-controller.ts"
Cohesion: 0.08
Nodes (14): bytesToBase64(), costumeDataUrl(), createRuntimeController(), FeatureUnavailableError, get(), IMAGE_MIME, keys(), LoadedProjectLike (+6 more)

### Community 70 - "index.ts"
Cohesion: 0.09
Nodes (17): BenchResult, makeCostume(), run(), Window, HeadlessBackend, RenderBackend, getWebGLContext(), RendererCoreOptions (+9 more)

### Community 71 - "parity-runner.ts"
Cohesion: 0.13
Nodes (27): PARITY_CATEGORIES, ParityCase, ParityCategory, isRequired(), isStrict(), REQUIRED_PASS, SB3Json, CaseResult (+19 more)

### Community 73 - "DirectionPicker.tsx"
Cohesion: 0.14
Nodes (18): BaseProps, BufferedInput(), BufferedInputProps, Dial(), DialProps, DirectionPicker(), DirectionPickerProps, dialHandlePosition() (+10 more)

### Community 74 - "ai-examples.ts"
Cohesion: 0.14
Nodes (21): AI_EXAMPLES, buildAiExample(), buildAiExampleSb3(), BuildExampleOptions, classHat(), findAiExample(), flag, say() (+13 more)

### Community 75 - "undo.ts"
Cohesion: 0.11
Nodes (11): CommentLayer, applyWithInverse(), BlockGetter, InverseDeps, inverseOf(), parentLinkOf(), snapshotTree(), UndoGroup (+3 more)

### Community 76 - "webgl-backend.ts"
Cohesion: 0.12
Nodes (10): GL, Program, TextureEntry, WebGLBackend, DrawMode, toImageData(), buildShaderSources(), QUAD_POSITIONS (+2 more)

### Community 77 - "music.ts"
Cohesion: 0.17
Nodes (23): createMusicExtension(), BEAT_RANGE, buildMenu(), defaultMusicState(), DRUM_INFO, DrumInfo, EN, getMusicInfo() (+15 more)

### Community 78 - "pwa-plugin.test.ts"
Cohesion: 0.10
Nodes (14): kodyAliases, names, BundleLike, collectPwaConfig(), kodyPwaPlugin(), PwaConfig, renderServiceWorker(), shortHash() (+6 more)

### Community 79 - "bitmap-ops.ts"
Cohesion: 0.17
Nodes (24): blit(), createPixels(), crop(), cropForSave(), CroppedBitmap, fillEllipse(), fillRect(), floodFill() (+16 more)

### Community 80 - "vector-doc.ts"
Cohesion: 0.16
Nodes (24): addShape(), Box, distToSegment(), docBounds(), docFromSvg(), dragBox(), emptyDoc(), escapeXml() (+16 more)

### Community 81 - "KodyShell.test.tsx"
Cohesion: 0.11
Nodes (13): AppEventMap, createAppBus(), byLabel(), click(), q(), createMockController(), defaultTargets(), MockCall (+5 more)

### Community 82 - "asset-list-logic.ts"
Cohesion: 0.17
Nodes (22): addCostume(), addCostumeAndSelect(), addCostumeAt(), addSound(), clamp(), clampSoundSelection(), CostumeListState, defaultCostumeName() (+14 more)

### Community 83 - "TextBubbleSkin"
Cohesion: 0.13
Nodes (12): cluster(), BubbleStyle, TextBubbleSkin, Break, graphemes(), INLINE_SPACE, isCJK(), lineBreaks() (+4 more)

### Community 84 - "extract-scratch-blocks.mjs"
Cohesion: 0.08
Nodes (14): allCtx, compact(), ctx, defs, en, enCtx, files, here (+6 more)

### Community 85 - "Thread"
Cohesion: 0.13
Nodes (5): createStackFrame(), createThread(), reuseStackFrame(), Thread, StackFrame

### Community 86 - "oracle-parity.test.ts"
Cohesion: 0.11
Nodes (18): build(), EFFECT_NAMES, PALETTE, randomBitmap(), randomSpec(), SceneSpec, Any, here (+10 more)

### Community 88 - "harness.test.ts"
Cohesion: 0.12
Nodes (13): opcodesInBlocks(), FakeClock, Sequencer, Timer, decodeBlocks(), decodeFields(), decodeInputs(), decodePrimitive() (+5 more)

### Community 89 - "AiTutorials.tsx"
Cohesion: 0.13
Nodes (10): AiTutorials(), AiTutorialsProps, LAB_NAMES, TutorialCard, TutorialCatalog, AlertItem(), AlertStack(), AlertStackProps (+2 more)

### Community 90 - "PaintEditor.tsx"
Cohesion: 0.19
Nodes (16): addText(), BitmapResult, BitmapSelection, DEFAULT_SETTINGS, Modifiers, PaintMode, PaintSettings, PaintTool (+8 more)

### Community 91 - "default-project.ts"
Cohesion: 0.16
Nodes (15): addAsset(), createDefaultProject(), DefaultProjectOptions, svgCostume(), KODY_SVG, TEXT, bmpSize(), gifSize() (+7 more)

### Community 92 - "sound-effects.ts"
Cohesion: 0.16
Nodes (18): applyEffect(), applyGain(), compress(), diode(), DIODE_CURVE, EFFECT_TYPES, effectLayout(), EffectName (+10 more)

### Community 93 - "list-monitor-logic.ts"
Cohesion: 0.23
Nodes (19): appendItem(), clampListSize(), commitEdit(), CSV_IMPORT_LIMITS, csvColumn(), exportListText(), handleListKey(), initialListSize() (+11 more)

### Community 94 - "helpers.ts"
Cohesion: 0.16
Nodes (19): BNode, buildBlocks(), autoDeclare(), CAST_VALUES, collectRefs(), cross(), CROSS_VALUES, Json (+11 more)

### Community 95 - "GeometryWorld"
Cohesion: 0.23
Nodes (8): createGeometryIRenderer(), GeometryRendererAdapter, createScratchRenderFacade(), DEFAULT_SKIN, GeoDrawable, GeometryWorld, GeoRect, GeoSkin

### Community 96 - "CodePanel.tsx"
Cohesion: 0.15
Nodes (11): AiLab, CodePanel(), CodePanelProps, dropTargetAt(), toolboxDefaults(), WorkspaceHandle, ExtensionLibrary(), ExtensionLibraryProps (+3 more)

### Community 97 - "extensions.ts"
Cohesion: 0.12
Nodes (8): APP_EXTENSIONS, AppLocale, extensionCategory(), ExtensionHost, findExtensionEntry(), MUSIC, PEN, ProjectIODeps

### Community 98 - "geometry.test.ts"
Cohesion: 0.19
Nodes (6): LayerGroup, LayerList, createPixelData(), addSquare(), headless(), solidBitmap()

### Community 99 - "gif-decoder.ts"
Cohesion: 0.17
Nodes (11): decodeGif(), deinterlace(), GIF_LIMITS, GifFormatError, GifFrame, isGif(), lzwDecode(), Reader (+3 more)

### Community 100 - "audio-engine.ts"
Cohesion: 0.18
Nodes (11): GESTURE_EVENTS, EffectValues, EFFECT_RANGE, computeLoudness(), createLoudnessMeter(), defaultGetUserMedia(), GetUserMedia, LoudnessMeter (+3 more)

### Community 101 - "MonitorRecord"
Cohesion: 0.13
Nodes (5): MonitorOverlayProps, MonitorStore, sameRecord(), sameValue(), MonitorRecord

### Community 102 - "MonitorOverlay.tsx"
Cohesion: 0.21
Nodes (14): addMonitorRect(), getInitialPosition(), has(), initialMonitorLayout, MonitorLayoutState, moveMonitorRect(), Point, rectsIntersect() (+6 more)

### Community 103 - "devDependencies"
Cohesion: 0.11
Nodes (19): jsdom, devDependencies, jsdom, @playwright/test, @resvg/resvg-js, scratch-vm, @types/node, @types/react (+11 more)

### Community 105 - "EditorTabs.tsx"
Cohesion: 0.15
Nodes (15): EditorTab, BASE_ORDER, EditorTabs(), EditorTabsProps, ShellTab, exitFs(), FsDocument, FsElement (+7 more)

### Community 106 - "music-audio.test.ts"
Cohesion: 0.13
Nodes (8): FakeBuffer, FakeGain, FakeNode, FakeParam, fakeSamples, FakeSource, makeCtx(), makeOutput()

### Community 107 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, baseUrl, esModuleInterop, exactOptionalPropertyTypes, isolatedModules, jsx, module, moduleResolution (+10 more)

### Community 108 - "KodyBlocks AI v2 - Kontrak Antarmodul"
Cohesion: 0.12
Nodes (16): 0. Prinsip, 10. Editor blok <-> engine, 11. Event bus app, 12. Keamanan AI (wajib untuk agent ai & app), 13. Keamanan file project, 14. Tes, 1. Kepemilikan folder, 2. Format project (+8 more)

### Community 109 - "dependencies"
Cohesion: 0.12
Nodes (17): idb, @mediapipe/tasks-vision, dependencies, idb, @mediapipe/tasks-vision, react, react-dom, @tensorflow-models/coco-ssd (+9 more)

### Community 110 - "music-audio.ts"
Cohesion: 0.18
Nodes (6): MusicAudioContext, MusicBufferSource, ratioForPitchInterval(), selectSampleIndexForNote(), Voice, WebAudioMusicOutput

### Community 111 - "deserialize-blocks.ts"
Cohesion: 0.21
Nodes (16): BlockBuildContext, deserializeBlockObject(), deserializeBlocks(), deserializeFields(), deserializeInputs(), deserializeMutation(), deserializePrimitive(), Entry (+8 more)

### Community 113 - ".block"
Cohesion: 0.21
Nodes (5): indexAtPoint(), PressState, TouchReorderCallbacks, useTouchReorder(), Serializer

### Community 114 - "KodyBlocks AI v2 - Status integrasi"
Cohesion: 0.12
Nodes (15): Cara mengulang, Cara mengulang (2026-10-10), Fitur (keadaan sekarang), Keamanan AI (yang sudah dicek saat integrasi), KodyBlocks AI v2 - Status integrasi, Langkah berikutnya (2026-10-10), Masalah terbuka, Masalah terbuka (2026-10-10) (+7 more)

### Community 116 - "toolbox.ts"
Cohesion: 0.47
Nodes (15): msg(), b(), control(), Entry, events(), looks(), makeDefaultToolbox(), menu() (+7 more)

### Community 117 - "generate-icons.mjs"
Cohesion: 0.12
Nodes (12): fullBleed, icoBuf, inner, mascot, maskable, outDir, outputs, publicDir (+4 more)

### Community 119 - "PenSkin"
Cohesion: 0.19
Nodes (3): PenAttributes, PenSkin, rasterizeLine()

### Community 120 - "Silhouette"
Cohesion: 0.19
Nodes (4): cornerWork, intMax(), intMin(), Silhouette

### Community 121 - "ErrorBoundary"
Cohesion: 0.15
Nodes (4): ErrorBoundary, ErrorBoundaryProps, ErrorBoundaryState, rootEl

### Community 123 - "opcodes.ts"
Cohesion: 0.23
Nodes (11): AI_OPCODES, ALL_OPCODES, byOpcode, CORE_OPCODES, coreHatOpcodes(), coreVmPrimitiveOpcodes(), MUSIC_OPCODES, OpcodeSpec (+3 more)

### Community 124 - "music-synth.ts"
Cohesion: 0.21
Nodes (11): DRUM_RECIPES, DrumRecipe, envelope(), harmonicsFor(), INSTRUMENT_SHAPES, makeRandom(), midiToHz(), SampleBufferFactory (+3 more)

### Community 125 - "types.ts"
Cohesion: 0.21
Nodes (6): IssueReport, DeserializeOptions, IssueSeverity, LoadSb3Options, ProjectIssue, ValidationResult

### Community 126 - "music.test.ts"
Cohesion: 0.15
Nodes (5): MusicSoundOutput, Enc, fakeOutput(), Handler, Rec

### Community 127 - "PaintEditor"
Cohesion: 0.24
Nodes (10): clonePixels(), Pixels, base64(), paintPixels(), pixelsToVectorDoc(), previewSvg(), vectorToPixels(), PaintEditor() (+2 more)

### Community 128 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, check, check:no-scratch-import, dev, icons, preview, test (+4 more)

### Community 131 - "vendor-models.mjs"
Cohesion: 0.18
Nodes (8): args, checkOnly, here, legacy, manifest, out, repo, wasmDir

### Community 132 - "definitions.ts"
Cohesion: 0.36
Nodes (10): argSpec(), CATEGORY_BY_JSON, CATEGORY_BY_PREFIX, categoryOf(), checkOf(), has(), shapeOf(), toBlockDefinition() (+2 more)

### Community 133 - "oracle.test.ts"
Cohesion: 0.27
Nodes (9): data, Flat, flattenOracle(), flattenOurs(), m8, normPath(), OracleBlock, r3() (+1 more)

### Community 134 - "include"
Cohesion: 0.18
Nodes (10): aliases.ts, app, packages, playwright.config.ts, playwright.prod.config.ts, scripts/*.ts, tests, vite.config.ts (+2 more)

### Community 136 - "paths"
Cohesion: 0.20
Nodes (10): packages/ai/src/*, packages/ai/src/index.ts, packages/blocks-ui/src/*, packages/blocks-ui/src/index.ts, packages/ext-music/src/*, packages/ext-music/src/index.ts, paths, @kody/ai (+2 more)

### Community 138 - "check-no-scratch-import.mjs"
Cohesion: 0.36
Nodes (7): forbidden(), main(), root, roots, scanSource(), skipDirs, walk()

### Community 139 - "Third-party notices"
Cohesion: 0.22
Nodes (8): Apache-2.0 (scratch-blocks 1.1.206), BSD-3-Clause (scratch-vm, scratch-render, scratch-audio, scratch-svg-renderer versi lama), Dependensi khusus tes (tidak dibundel), Dependensi runtime (npm), Kode yang diport / disalin ke repo ini, Merek, Teks lisensi, Third-party notices

### Community 141 - "KodyBlocks AI v2: Keamanan & Privasi AI"
Cohesion: 0.25
Nodes (7): 1. Aset yang dilindungi, 2. Model ancaman, 3. Mitigasi di kode, 4. Kewajiban app (agent app-shell / deploy), 5. Risiko yang tersisa, KodyBlocks AI v2: Keamanan & Privasi AI, Tablet / iPad

### Community 143 - "sw-template.js"
Cohesion: 0.46
Nodes (6): cacheable(), cacheFirst(), isHtml(), networkFirstNavigation(), precacheShell(), staleWhileRevalidate()

### Community 144 - "Parity test (engine KodyBlocks vs scratch-vm)"
Cohesion: 0.25
Nodes (7): Aturan menulis kasus, Cara pakai, Determinisme (penting untuk penulis engine), File, Parity test (engine KodyBlocks vs scratch-vm), Quirk scratch-vm yang sengaja diuji, Status kasus & ratchet

### Community 147 - "include"
Cohesion: 0.29
Nodes (6): extends, include, ../../app/src/vite-env.d.ts, src/**/*.ts, src/**/*.tsx, ../../tsconfig.json

### Community 148 - "KodyDialog.tsx"
Cohesion: 0.40
Nodes (3): KodyDialog(), KodyDialogAction, KodyDialogProps

### Community 149 - "package.json"
Cohesion: 0.33
Nodes (5): description, name, private, type, version

### Community 151 - "run-bench.mjs"
Cohesion: 0.33
Nodes (5): bundle, headed, here, outDir, repo

### Community 152 - "playwright.prod.config.ts"
Cohesion: 0.40
Nodes (4): chromiumLaunch, chromiumProjects, ipad, port

### Community 153 - "KodyBlocks AI v2"
Cohesion: 0.40
Nodes (4): KodyBlocks AI v2, Perintah, Referensi Scratch, Struktur

### Community 154 - "oracle-source.test.ts"
Cohesion: 0.40
Nodes (3): CORE_FILES, oracleRoot, repoRoot

### Community 155 - "files"
Cohesion: 0.50
Nodes (3): files, note, version

### Community 156 - "/models/coco-ssd/group1-shard1of5"
Cohesion: 0.50
Nodes (4): /models/coco-ssd/group1-shard1of5, bytes, sha256, source

### Community 157 - "/models/coco-ssd/group1-shard2of5"
Cohesion: 0.50
Nodes (4): /models/coco-ssd/group1-shard2of5, bytes, sha256, source

### Community 158 - "/models/coco-ssd/group1-shard3of5"
Cohesion: 0.50
Nodes (4): /models/coco-ssd/group1-shard3of5, bytes, sha256, source

### Community 159 - "/models/coco-ssd/group1-shard4of5"
Cohesion: 0.50
Nodes (4): /models/coco-ssd/group1-shard4of5, bytes, sha256, source

### Community 160 - "/models/coco-ssd/group1-shard5of5"
Cohesion: 0.50
Nodes (4): /models/coco-ssd/group1-shard5of5, bytes, sha256, source

### Community 161 - "/models/coco-ssd/model.json"
Cohesion: 0.50
Nodes (4): /models/coco-ssd/model.json, bytes, sha256, source

### Community 162 - "/models/mediapipe/face_landmarker.task"
Cohesion: 0.50
Nodes (4): /models/mediapipe/face_landmarker.task, bytes, sha256, source

### Community 163 - "/models/mediapipe/hand_landmarker.task"
Cohesion: 0.50
Nodes (4): /models/mediapipe/hand_landmarker.task, bytes, sha256, source

### Community 164 - "/models/mediapipe/pose_landmarker.task"
Cohesion: 0.50
Nodes (4): /models/mediapipe/pose_landmarker.task, bytes, sha256, source

### Community 165 - "/models/mediapipe/wasm/vision_wasm_internal.js"
Cohesion: 0.50
Nodes (4): /models/mediapipe/wasm/vision_wasm_internal.js, bytes, sha256, source

### Community 166 - "/models/mediapipe/wasm/vision_wasm_internal.wasm"
Cohesion: 0.50
Nodes (4): /models/mediapipe/wasm/vision_wasm_internal.wasm, bytes, sha256, source

### Community 167 - "/models/mediapipe/wasm/vision_wasm_nosimd_internal.js"
Cohesion: 0.50
Nodes (4): /models/mediapipe/wasm/vision_wasm_nosimd_internal.js, bytes, sha256, source

### Community 168 - "/models/mediapipe/wasm/vision_wasm_nosimd_internal.wasm"
Cohesion: 0.50
Nodes (4): /models/mediapipe/wasm/vision_wasm_nosimd_internal.wasm, bytes, sha256, source

### Community 169 - "/models/mobilenet/model.json"
Cohesion: 0.50
Nodes (4): /models/mobilenet/model.json, bytes, sha256, source

### Community 170 - "/models/mobilenet/weights.bin"
Cohesion: 0.50
Nodes (4): /models/mobilenet/weights.bin, bytes, sha256, source

### Community 174 - "lib"
Cohesion: 0.50
Nodes (4): DOM, DOM.Iterable, ES2022, lib

### Community 177 - "types"
Cohesion: 0.67
Nodes (3): node, vite/client, types

### Community 178 - "@kody/audio"
Cohesion: 0.67
Nodes (3): packages/audio/src/*, packages/audio/src/index.ts, @kody/audio

### Community 179 - "@kody/engine"
Cohesion: 0.67
Nodes (3): packages/engine/src/*, packages/engine/src/index.ts, @kody/engine

### Community 180 - "@kody/ext-pen"
Cohesion: 0.67
Nodes (3): packages/ext-pen/src/*, packages/ext-pen/src/index.ts, @kody/ext-pen

### Community 181 - "@kody/project"
Cohesion: 0.67
Nodes (3): packages/project/src/*, packages/project/src/index.ts, @kody/project

### Community 182 - "@kody/renderer"
Cohesion: 0.67
Nodes (3): packages/renderer/src/*, packages/renderer/src/index.ts, @kody/renderer

## Knowledge Gaps
- **681 isolated node(s):** `names`, `LibraryRequest`, `Locale`, `AiLab`, `AppEventMap` (+676 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `IRuntime` connect `IRuntime` to `Clock`, `Cast`, `BlocksWorkspace`, `ITarget`, `target.ts`, `index.ts`, `BlockUtility`, `KodyShell.tsx`, `services.ts`, `actions.ts`, `runtime.ts`, `IThread`, `lab-session.ts`, `Block`, `engine-runner.ts`, `content.ts`, `runtime-host.ts`, `LabSession`, `fakes.ts`, `RenderedTarget`, `index.ts`, `IBlocksContainer`, `control.ts`, `IRenderer`, `looks.ts`, `editor.ts`, `types.ts`, `AiServices`, `pen.ts`, `new-asset.ts`, `index.ts`, `BlocksContainer`, `sound.ts`, `Harness`, `runtime-controller.ts`, `music.ts`, `CodePanel.tsx`, `extensions.ts`, `MonitorRecord`, `IAudioEngine`, `music.test.ts`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `ITarget` connect `ITarget` to `BlocksWorkspace`, `layout.ts`, `target.ts`, `IRuntime`, `index.ts`, `BlockUtility`, `KodyShell.tsx`, `services.ts`, `actions.ts`, `runtime.ts`, `IThread`, `Block`, `engine-runner.ts`, `content.ts`, `runtime-host.ts`, `LabSession`, `RenderedTarget`, `IBlocksContainer`, `control.ts`, `Monitor.tsx`, `looks.ts`, `editor.ts`, `AiServices`, `pen.ts`, `MusicExtensionModule`, `new-asset.ts`, `renderer-core.ts`, `sound.ts`, `runtime-controller.ts`, `undo.ts`, `music.ts`, `Thread`, `CodePanel.tsx`, `extensions.ts`, `IRenderedTarget`, `music.test.ts`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Why does `BlocksContainer` connect `BlocksContainer` to `ITarget`, `target.ts`, `IRuntime`, `index.ts`, `runtime.ts`, `RenderedTarget`, `IBlocksContainer`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `names`, `LibraryRequest`, `Locale` to the rest of the system?**
  _681 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `svgDoc` be split into smaller, more focused modules?**
  _Cohesion score 0.05840740068927988 - nodes in this community are weakly interconnected._
- **Should `ITarget` be split into smaller, more focused modules?**
  _Cohesion score 0.02723453570911198 - nodes in this community are weakly interconnected._
- **Should `Cast` be split into smaller, more focused modules?**
  _Cohesion score 0.060383653044203504 - nodes in this community are weakly interconnected._