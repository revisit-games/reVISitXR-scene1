# reVISit-XR Stimulus Package

This package is the standalone XR stimulus that can run by itself or inside a reVISit `website` iframe. It records semantic XR provenance with `@trrack/core@^1.4.0`, exports compact reactive answer summaries, and can hydrate recorded participant state during analysis replay.

## Files To Customize

- `main.js`
  The scene, input wiring, ghost replay pointer visuals, and the actual points where logging hooks are attached.
- `replayVisualConfig.js`
  Central replay-visual tuning for controller tooltip placement/colors, the replay head avatar, and the paused-analysis overlay.
- `logging/revisitBridge.js`
  The standalone-safe iframe bridge that speaks the `@REVISIT_COMMS/*` protocol.
- `logging/xrLoggingSchema.js`
  The central schema for tracked fields, action ids, labels, analysis defaults, and sampling knobs.
- `logging/xrSerialization.js`
  Array serialization, replay normalization, answer-summary formatting, and threshold comparisons.
- `logging/xrStudyLogger.js`
  The Trrack state machine, outbound sync policy, replay suppression, and analysis play/pause interaction policy.

## Message Protocol

Repo A does not depend on `public/revisitUtilities/revisit-communicate.js`. The bridge is local and optional.

If the URL includes `?id=<iframeId>`, the stimulus enables iframe messaging. If `id` is missing, the bridge becomes a no-op and the app runs standalone.

Supported child -> parent messages:

- `@REVISIT_COMMS/WINDOW_READY`
- `@REVISIT_COMMS/READY`
- `@REVISIT_COMMS/ANSWERS`
- `@REVISIT_COMMS/PROVENANCE`

Supported parent -> child messages:

- `@REVISIT_COMMS/STUDY_DATA`
- `@REVISIT_COMMS/ANSWERS`
- `@REVISIT_COMMS/PROVENANCE`
- `@REVISIT_COMMS/ANALYSIS_CONTROL`

`ANALYSIS_CONTROL` shape:

```js
{
  mode: 'study' | 'analysis',
  isPlaying: boolean,
  participantId?: string | null,
  trialId?: string | null,
  allowLocalInteractionWhenPaused: true
}
```

## Recording vs Interaction

The logger separates three concerns that should not be conflated:

- `canRecord()`
  Only `true` in study mode. Analysis mode never writes new participant provenance or answers.
- `canInteract()`
  `true` in study mode, and also `true` in analysis mode while playback is paused.
- `canEnterImmersiveSession()`
  `false` for the whole analysis session, even while paused. This keeps AR/VR entry buttons disabled during replay.

Replay hydration uses a brief `isApplyingReplayState` window. During that window:

- local desktop interaction is blocked
- inbound replay state overwrites local scratch edits
- no new provenance or answers are emitted

This is what enables the paused-analysis workflow:

1. Pause replay.
2. Temporarily inspect or manipulate the desktop scene.
3. Press Play again.
4. The next recorded replay snapshot overwrites those temporary local edits.

## Tracked State

`logging/xrLoggingSchema.js` defines the tracked replay state. The default state includes:

- `presentationMode`
- `cube.position`, `cube.quaternion`
- `camera.position`, `camera.quaternion`
- `xrOrigin.position`, `xrOrigin.quaternion`
- `replayPointers['controller-0' | 'controller-1']`
  Each controller pointer now carries:
  - `visible`, `origin`, `target`, `rayLength`, `mode`
  - `tooltipVisible`, `tooltipState`, `tooltipText`
- `activeInteractor`
- `interactionPhase`
- `metrics.*`
- `lastEvent.*`

To track more objects later, add them in three places:

1. `createInitialXRLoggingState()` in `logging/xrLoggingSchema.js`
2. `applySceneSnapshotToState()` in `logging/xrStudyLogger.js`
3. `getSceneSnapshot()` and `applyReplayState()` in `main.js`

## Sampling Knobs

Shared defaults live in `logging/xrLoggingSchema.js`, and scenes can now override them with a `loggingConfig` export on the scene definition.

The shared layer merges:

- global defaults from `logging/xrLoggingSchema.js`
- optional scene overrides such as `example1/example1LoggingConfig.js`

`main.js` passes the active scene logging config into `logging/xrStudyLogger.js`, and the scene runtime context exposes the resolved config back to authored scenes through `context.getLoggingConfig()`.

Adjust the shared defaults in `logging/xrLoggingSchema.js` when you want to affect every scene. Use a scene-local file when you want only one scene to change pointer sampling, outbound sync timing, or scene-state throttling.

Default knobs:

- `object.desktop.minIntervalMs: 200`
- `object.desktop.positionEpsilon: 0.01`
- `object.desktop.quaternionAngleThresholdDeg: 2`
- `object.immersive.minIntervalMs: 400`
- `object.immersive.positionEpsilon: 0.035`
- `object.immersive.quaternionAngleThresholdDeg: 5.5`
- `camera.desktop.minIntervalMs: 300`
- `camera.desktop.positionEpsilon: 0.015`
- `camera.desktop.quaternionAngleThresholdDeg: 2.5`
- `camera.immersive.minIntervalMs: 350`
- `camera.immersive.positionEpsilon: 0.025`
- `camera.immersive.quaternionAngleThresholdDeg: 4`
- `pointer.enabled: true`
- `pointer.hover.minIntervalMs: 300`
- `pointer.hover.positionEpsilon: 0.05`
- `pointer.hover.rayLengthEpsilon: 0.05`
- `pointer.grabbing.behavior: 'state-only'`
- `pointer.grabbing.minIntervalMs: 400`
- `pointer.grabbing.positionEpsilon: 0.06`
- `pointer.grabbing.rayLengthEpsilon: 0.06`
- `pointer.logImmediateSemanticTransitions: true`
- `outboundSync.minIntervalMs: 500`

Example 1 now overrides a small subset in `example1/example1LoggingConfig.js`:

- `pointer.grabbing.behavior: 'state-only'`
- `pointer.hover.minIntervalMs: 320`
- `pointer.grabbing.minIntervalMs: 320`
- `outboundSync.minIntervalMs: 700`
- `sceneState.minIntervalMs: 320`
- `sceneState.positionEpsilon: 0.03`
- `sceneState.quaternionAngleThresholdDeg: 2.5`
- `sceneState.flushOnSelectionChange: true`
- `sceneState.flushOnYearChange: false`
- `sceneState.flushOnPanelDragEnd: true`
- `example1.yearCommitDebounceMs: 240`
- `example1.panelDragIntermediateMinIntervalMs: 520`
- `example1.stableLabels.*`

If you want less graph growth:

- increase immersive object intervals and epsilons first
- switch `pointer.grabbing.behavior` from `'full'` to `'state-only'` or `'off'`
- slow `pointer.hover.*` thresholds if controller hover noise is still dense
- increase `outboundSync.minIntervalMs` on weaker host devices
- disable pointer sampling entirely with `pointer.enabled: false`

## Actions And Labels

Action ids live in `logging/xrLoggingSchema.js` and are registered in `logging/xrStudyLogger.js`.

Current semantic actions:

- `session-start`
- `session-end`
- `mode-change`
- `object-grab-start`
- `object-transform-sample`
- `object-grab-end`
- `camera-transform-sample`
- `camera-reset`
- `pointer-state-sample`

To disable a logging action, the safest approach is to remove or gate the corresponding call site in `main.js`. For example:

- stop calling `samplePointerStateIfNeeded()` to remove replay-pointer provenance
- stop calling `recordCameraReset()` if camera resets should not create nodes

## Logging Performance Tuning

Dense replay timelines usually come from immersive object manipulation, where several streams can all try to log at once.

Current default strategy:

- object sampling stays relatively responsive on desktop, but becomes coarser in immersive VR/AR to filter hand jitter
- camera sampling is now independent from object sampling, so head motion can stay plausible without inheriting object thresholds
- pointer hover sampling remains available, but slower and less sensitive than before
- pointer geometry logging during active XR grabs defaults to `state-only`, which keeps semantic controller changes while letting object transform samples carry the motion path
- outbound provenance plus reactive answer sync is throttled, so the parent no longer receives a full graph push on every dense local node

Pointer behavior during grabbing:

- `'state-only'`: keep semantic pointer changes, skip continuous grab-geometry samples
- `'off'`: suppress grab-pointer sample nodes entirely and rely on grab start/end scene snapshots
- `'full'`: allow continuous grab-pointer geometry logging with the grabbing thresholds

The first knobs to tune on lower-performance devices are:

- `object.immersive.minIntervalMs`
- `object.immersive.positionEpsilon`
- `object.immersive.quaternionAngleThresholdDeg`
- `pointer.grabbing.behavior`
- `pointer.hover.minIntervalMs`
- `outboundSync.minIntervalMs`

For debugging, Vite dev mode now exposes `window.__revisitXRDebug.getLoggingStats()` so you can confirm whether nodes were logged, skipped as pending, skipped as unchanged, or suppressed by the grab-state pointer policy.

## Multi-Scene Authoring

The package now supports a small scene registry instead of a single hardwired scene.

Scene selection is URL-driven:

- `index.html`
  Loads the reusable default template scene.
- `index.html?scene=1`
  Loads Example 1, the OWID energy-source bar matrix.
- `index.html?scene=2`
  Loads the Example 2 placeholder scene.
- `index.html?scene=3`
  Loads the Example 3 placeholder scene.

Scene modules are resolved through `scenes/core/sceneRegistry.js`. Each scene definition provides:

- `sceneKey`
- `queryValue`
- `label`
- `templateConfig`
- optional `loggingConfig`
- `createScene(context)`
- `normalizeSceneState(candidateState, fallbackState)`

The active scene controller can expose:

- `activate()`
- `dispose()`
- `update(deltaSeconds)`
- `getSceneStateForReplay()`
- `applySceneStateFromReplay(sceneState)`
- `getHudContent(presentationMode)`
- optional `onPresentationModeChange(presentationMode)`

## Default Template Scene

The baseline scene is now the reusable template that future scenes inherit from.

Shared template pieces live in `main.js` and are toggled per scene through `templateConfig`:

- floor
- floor grid
- baseline lighting
- dark background and fog
- default pedestal
- default interactable cube

The most important template flags are:

- `showFloor`
- `showGrid`
- `showPedestal`
- `showTemplateCube`
- `enableDefaultObjectManipulation`

Example 1 keeps the floor and grid, but turns off the pedestal, hides the template cube, and disables default cube manipulation.

## Scene-Specific Replay State

Replay snapshots now include two scene extension fields in addition to the shared XR state:

- `sceneKey`
- `sceneState`

The shared runtime snapshot still owns:

- `presentationMode`
- `camera`
- `xrOrigin`
- `cube`
- `replayPointers`

Scene modules own the compact semantic state under `sceneState`. The logger now supports a `scene-state-change` action so authored scenes can log semantic updates without treating all scene content as draggable transforms.

Example 1 uses:

- `selectedYear`
- `selectedDatumId`
- `panelPosition`
- `panelQuaternion`

This means replay reconstructs the bar matrix from the selected year, pinned datum, and floating year-window placement instead of recording dozens of individual bar transforms.

## Shared World Labels

Reusable world-label sprites now live in `scenes/core/textSprite.js`.

`createTextSprite(options)` still supports the original defaults, but it now also supports:

- `textAlign: 'left' | 'center' | 'right'`
- `maxTextWidth` or `wrapWidth`
- `fixedWidth`
- `minWidth`
- `fontWeight`
- `uppercase`
- `horizontalPadding`
- `verticalPadding`
- `anchorX`
- `anchorY`

Recommended usage patterns:

- use `textAlign: 'center'` for plaques, axis captions, and tooltips
- use `maxTextWidth` or `wrapWidth` for long country or category names so they wrap instead of stretching across the scene
- use `fixedWidth` when a family of labels should share the same card width
- use `anchorY: 0` for labels that should sit on a rail or hover above a mark from their bottom edge

The sprite utility now wraps long lines before drawing, centers multi-line text correctly, and avoids the old power-of-two width inflation that made some labels look wider than intended.

## Attached Panel Text

Reusable local-space panel text now lives in `scenes/core/textPlane.js`.

Use `createTextPlane(options)` when text should be attached to a panel or plaque instead of billboarding independently toward the viewer. The helper supports:

- centered or aligned text
- wrapping and fixed-width text blocks
- transparent or card-like backgrounds
- local-space text planes parented directly to a mesh or XR window

Recommended split:

- use `textSprite` for hover tooltips and labels that intentionally need always-facing readability
- use `textPlane` for XR windows, mounted axis plaques, and attached UI copy that should stay in the same transform space as the surface behind it

## Floating Orbital Panels

Reusable orbital XR-window behavior now lives in `scenes/core/floatingOrbitPanel.js`.

Use `createFloatingOrbitPanel(context, options)` when a scene needs a floating world-space window that:

- captures the immersive-entry camera position as a fixed orbit center
- places the panel once at a configurable left-front offset
- keeps the panel world-fixed instead of re-anchoring to the moving camera
- drags only along a fixed-radius horizontal orbit
- keeps the panel facing the fixed orbit center
- latches the drag state on `selectstart` even if the first ray-plane intersection is not yet valid, so the first good `selectmove` can still start orbital motion

Recommended pattern:

- build the window visuals with local `textPlane` labels and authored meshes
- create a title-bar `sceneUiSurface` for dragging
- create separate UI surfaces for slider or button controls
- keep `panelPosition` and `panelQuaternion` in semantic `sceneState`
- disable local drag during replay if replay is already restoring the recorded panel transform

## Scene Interaction Hooks

Scene modules can register authored XR targets through the lightweight raycast layer in `main.js`:

- `registerRaycastTarget(object3D, handlers)`
- `unregisterRaycastTarget(object3D)`

Supported handler hooks are:

- `onHoverChange`
- `onSelectStart`
- `onSelectMove`
- `onSelectEnd`

Handlers receive normalized payloads with the source, hit object, optional `instanceId`, hit point, and ray direction so scene modules can implement authored controls such as Example 1's XR year slider.

For authored scene UI, prefer `scenes/core/sceneUiSurface.js` instead of creating ad hoc invisible meshes in every scene.

`createSceneUiSurface(context, options)` creates a raycastable plane, adds it to the requested parent, and auto-registers it with the shared scene raycast system. The most useful options are:

- `parent`
- `width`
- `height`
- `position`
- `rotation` or `quaternion`
- `material`
- `handlers`

This is the recommended pattern for future in-world controls such as:

- slider hit strips
- floating panel hit planes
- draggable XR window title bars
- authored XR control cards that need replay-visible pointer targets

Because these surfaces use the same `registerRaycastTarget()` path as the rest of the scene system, live controller cursor dots and replay ghost pointer targets remain visible without scene-specific replay hacks.

## Example 1 Dataset Layout

The already-downloaded OWID files now live under `example1/`:

- `example1/data/per-capita-energy-stacked.csv`
- `example1/data/per-capita-energy-stacked.metadata.json`
- `example1/docs/per-capita-energy-stacked-readme.md`
- `example1/example1VisualConfig.js`

The markdown file is not required at runtime, but it is kept under `example1/docs/` because it contains source notes, citation context, and future-authoring references that are useful for researchers extending the package.

Example 1 loads its assets with `new URL('./data/...', import.meta.url)` so Vite includes them in `dist/` without moving them into the global `public/` folder.

Example 1 now keeps its visual tuning in `example1/example1VisualConfig.js`, including:

- chart scaffold dimensions
- XR panel size, initial placement offsets, orbital drag settings, and drag-bar layout
- desktop panel styles
- shared label and tooltip styles
- slice-plane value-axis styling and front-side measurement plaques

Example 1 now keeps its logging tuning in `example1/example1LoggingConfig.js`, including:

- replay-pointer behavior during XR slider drags
- immersive camera sampling overrides for scenes that do not need dense head-motion provenance
- immersive object sampling overrides for authored scenes that are semantic-first rather than manipulation-heavy
- scene-state throttling for panel dragging
- year-commit debounce timing
- stable legend-friendly scene labels
- immediate flush policy for selection and panel-drag-end semantics

Example 1's in-scene label policy is now intentional:

- kept in world space: axis captions, country labels, source labels, Y-axis tick labels, and the focused datum tooltip
- moved out of world space: the large scene title, loading banner, floating year billboard, and footer/source banner
- shown in desktop or XR panels instead: loading state, current year, citation text, and interaction guidance

## Future Scene Workflow

To add a new authored scene:

1. Create a new scene folder at the repo root such as `example4/`.
2. Add any scene-specific data under a local `data/` subfolder.
3. Keep notes or citations under a local `docs/` subfolder.
4. Add the scene module and export its scene definition.
5. Register the new scene in `scenes/core/sceneRegistry.js`.
6. Define compact `sceneState` serialization for replay instead of logging per-object transforms unless object manipulation is truly the intended motion channel.

The first values future authors usually need to tune are:

- scene `templateConfig`
- Example-style country/source presets or dataset subsets
- world label text, width, and anchor settings
- authored UI placement for desktop and immersive XR
- scene-local `loggingConfig`
- `normalizeSceneState()` for replay compatibility

For floating XR panels, start with `scenes/core/floatingOrbitPanel.js` instead of ad hoc camera-follow logic:

- capture the orbit center from the immersive-entry camera position
- place the panel slightly forward, to the user's left, and slightly below eye level
- keep it world-fixed after that
- add a dedicated drag bar if users should be able to reposition it
- keep the draggable transform in semantic `sceneState` if participant replay should reconstruct the interaction honestly
- prefer stable semantic labels such as `Change Example 1 Year` over value-specific labels that fragment the replay legend
- keep scene-local logging overrides in the scene folder so immersive camera/object sampling can be reduced without changing global defaults

Example 1 uses this pattern through `example1VisualConfig.js`, `scenes/core/floatingOrbitPanel.js`, and `example1/example1Scene.js`: a left-front initial placement, a draggable title bar, fixed-orbit repositioning, and semantic replay of the panel transform.

## Replay Pointer Visuals

Replay controller rays are rendered as ghost visuals in `main.js`. They are intentionally separate from live WebXR controller visuals.

The current ghost pointer uses:

- a world-space line for the ray
- a small sphere at the hit point
- a small origin marker
- a floating CSS2D tooltip anchored along the ray

Default tooltip behavior:

- visible hover ray: `LEFT CONTROLLER` or `RIGHT CONTROLLER`
- active grab ray: `LEFT CONTROLLER: GRABBING` or `RIGHT CONTROLLER: GRABBING`
- recorded grab release node: `LEFT CONTROLLER: RELEASED` or `RIGHT CONTROLLER: RELEASED`

Tooltip states are derived in two places:

- live replay pointer sampling in `main.js`
  Visible hover rays become `default`, and active grab rays become `grabbing`.
- `recordObjectGrabEnd()` in `logging/xrStudyLogger.js`
  The releasing controller's saved replay pointer is annotated as `released` before the Trrack action is applied, so replay can show a release label even when the saved ray geometry still reflects the just-ended grab frame.

Useful customization points:

- `replayVisualConfig.js`
- `createGhostReplayPointer()` in `main.js`
- `updateGhostReplayPointer()` in `main.js`

During paused analysis interaction, the ghost pointers are hidden on the first local viewer manipulation. The next replay snapshot restores them from participant state.

## Replay Visual Customization

All replay-only visuals are centralized in `replayVisualConfig.js`.

Pointer tooltip customization:

- change tooltip colors by editing `pointerColors`
- change label anchor placement with `pointerTooltips.anchorLerp`
- change label world-space lift with `pointerTooltips.verticalOffset`
- change label text appearance with `pointerTooltips.textColor`, `backgroundOpacity`, and `borderOpacity`

Replay user-head avatar:

- the replay avatar is loaded from `headModelPath`, which defaults to `'/userhead.obj'`
- the loader resolves that path relative to the current stimulus page, so the built package still works when copied under `public/<study>/assets/reVISitXR/`
- the shipped head asset is OBJ only; no animation pipeline is required
- `headScale` and `headRotationY` tune the imported model itself
- `headOffsetBack` and `headOffsetDown` control where the avatar sits relative to the recorded replay camera pose
- `headTooltipText` and `headTooltipVerticalOffset` control the `USER SIGHT` label
- `headArrowLength` and `headArrowColor` control the short facing-direction arrow

Paused replay overlay:

- styling lives in `index.html` CSS and is driven by `replayVisualConfig.js`
- the overlay is shown only when:
  - `policy.isAnalysisSession === true`
  - `policy.hasReceivedReplayState === true`
  - `policy.analysisPlaybackActive === false`
  - `policy.canInteract === true`
- the overlay DOM uses `pointer-events: none`, so it never blocks desktop inspection

Replay camera vs viewer camera:

- the replay head avatar uses the last applied replay camera world pose
- if the analyst moves the paused desktop camera locally, the avatar stays at the recorded participant position until the next replay snapshot arrives

## Replay Troubleshooting And Performance

Imported OBJ head meshes can render too dark if they arrive with broken or incomplete normals. The replay avatar loader in `main.js` now prepares every mesh before display:

- invalid or missing normals are recomputed when `replayAvatar.headRecomputeNormals` is enabled
- repaired normals are normalized when `replayAvatar.headNormalizeNormals` is enabled
- optional bounding boxes and bounding spheres are computed for more stable imported assets

Avatar material and mesh-prep knobs live in `replayVisualConfig.js` under `replayAvatar`:

- `headMaterialType`
- `headMaterialColor`
- `headMaterialEmissive`
- `headMaterialOpacity`
- `headUseDoubleSide`
- `headCastShadow`
- `headReceiveShadow`
- `headRecomputeNormals`
- `headNormalizeNormals`
- `headComputeBoundingBox`
- `headComputeBoundingSphere`

The default avatar is intentionally lightweight and explanatory rather than physically dramatic:

- `MeshPhongMaterial` is used by default because it is forgiving for imported OBJ meshes under simple study lighting
- shadows are disabled by default because the avatar is a replay marker, not a scene object that needs to affect lighting
- double-sided rendering is enabled by default as a safe fallback for imperfect static meshes

Replay performance knobs live in `replayVisualConfig.js` under `performance`:

- `lazyLoadReplayAvatar`
- `renderCssLabelsOnlyInAnalysis`
- `disableReplayVisualsDuringImmersiveStudy`

These defaults keep replay visuals analysis-only:

- the OBJ avatar is not loaded during normal study mode unless replay visuals actually become relevant
- the CSS2D label layer is hidden and not rendered during immersive study-mode XR
- per-frame replay avatar updates are skipped outside analysis replay

If you add new replay-only visuals later, keep them behind the same analysis-session gates so immersive study mode stays focused on participant interaction rather than analysis overlays.

## Reactive Answers

Compact reactive answers are built from `buildAnswerPayload()` in `logging/xrSerialization.js`.

The default answer ids are:

- `xrMode`
- `xrInteractionPhase`
- `xrGrabCount`
- `xrSessionCount`
- `xrLastEvent`
- `xrStateSummaryJson`

Do not put the full Trrack graph into reactive answers. The full graph is still sent through `postProvenance()`.

## Debug Hooks

In Vite dev mode, `window.__revisitXRDebug` is exposed for smoke testing:

- `getState()`
- `getLiveSceneSnapshot()`
- `getGraph()`
- `exportAnswers()`
- `applyReplayState(state)`
- `setAnalysisControl(control)`
- `getInteractionPolicy()`
- `getLoggingStats()`
- `getReplayPointerVisuals()`
- `getReplayAvatarVisuals()`

These helpers are for development only and are useful when validating replay hydration, pause/play behavior, pointer rendering, replay-avatar placement, and whether the logging-density optimizations are actually suppressing redundant samples.
