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
- `pointer.hover.minIntervalMs: 420`
- `pointer.grabbing.minIntervalMs: 420`
- `outboundSync.minIntervalMs: 900`
- `sceneState.minIntervalMs: 450`
- `sceneState.positionEpsilon: 0.04`
- `sceneState.quaternionAngleThresholdDeg: 3.5`
- `sceneState.flushOnSelectionChange: true`
- `sceneState.flushOnYearChange: false`
- `sceneState.flushOnPanelDragEnd: true`
- `example1.yearCommitDebounceMs: 360`
- `example1.panelTransformCommitMinIntervalMs: 900`
- `example1.logPanelTransformOnPassiveHeightFollow: false`
- `example1.logPanelTransformOnSliderInteraction: true`
- `example1.logPanelTransformOnPanelDrag: true`
- `example1.logPanelTransformOnPanelDragEnd: true`
- `example1.stableLabels.*`

Demo 1 keeps its scatterplot-specific semantic logging in `demo1/demo1LoggingConfig.js`, including:

- coarser immersive camera/object sampling for navigation-heavy use
- pointer grabbing behavior set to `'state-only'`
- scene-state flushes for nav-mode switch, overview toggle, point selection, and task submit
- debounced scale commits with stable labels such as `Scale Demo 1 Plot`

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
- `index.html?scene=0`
  Loads the legacy Example 1 OWID energy-source bar matrix.
- `index.html?scene=1`
  Loads Demo 1, the paper-facing 3D scatterplot navigation baseline.
- `index.html?scene=2`
  Loads Demo 2, the paper-facing migration globe baseline.
- `index.html?scene=3`
  Loads Demo 3, the paper-facing immersive analytic workspace.

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
- optional `getAnswerSummary()`
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

Demo 1 and Example 1 both keep the floor and grid, but turn off the pedestal, hide the template cube, and disable default cube manipulation.

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

Demo 1 uses:

- `demoId`
- `dataYear`
- `taskId`
- `navMode`
- `colorEncoding`
- `overviewEnabled`
- `overviewVisible`
- `overviewToggleCount`
- `scaleFactor`
- `selectedPointId`
- `selectedPointIds`
- `selectionCount`
- `taskAnswer`
- `taskSubmitted`

This keeps scatterplot replay semantic. The scene restores authored navigation mode, overview visibility, plot scale, selection, and task state without logging or replaying per-point animation.

Demo 3 uses:

- `demoId`
- `taskId`
- `layoutMode`
- `focusedViewId`
- `selectedViewId`
- `selectedDatumId`
- `linkedHighlightEnabled`
- `visibleViewIds`
- `pinnedViewIds`
- `panelLayouts`
- `panelOrder`
- `taskAnswer`
- `taskSubmitted`

This keeps the multi-view workspace replay semantic. Demo 3 restores layout presets, committed floating panel transforms, focused and selected panels, linked region selection, pinned panels, and task submission without replaying dense drag motion. The local OWID bundle lives in `demo3/data/`, and package-specific visual customization is centralized in `demo3/demo3VisualConfig.js`.

Example 1 uses:

- `selectedYear`
- `selectedDatumId`
- `panelPosition`
- `panelQuaternion`

This means replay reconstructs the bar matrix from the selected year, pinned datum, and floating year-window placement instead of recording dozens of individual bar transforms.

For the floating panel, `panelPosition` and `panelQuaternion` are the committed semantic transform, not a continuously sampled runtime pose. Example 1 can now let the panel height follow the live immersive camera without rewriting scene state until an authored panel interaction chooses to commit that transform.

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

Reusable orbit math still lives in `scenes/core/floatingOrbitPanel.js`, but scenes should usually consume the shared shell helper in `scenes/core/floatingOrbitPanelShell.js`.

Use `createFloatingOrbitPanelShell(context, options)` when a scene needs a floating world-space panel that:

- captures the immersive-entry camera position as a fixed orbit center
- places the panel once at a configurable left-front offset
- keeps the panel world-fixed instead of re-anchoring to the moving camera
- can optionally keep only the panel height adaptive to the live camera height while preserving the original orbit-center X/Z, orbit radius, and yaw-facing behavior
- restores authored transforms in live mode with `applyLiveWorldTransform()` semantics, but restores exact logged transforms in replay with `applyWorldTransform()` semantics
- auto-creates shared shell chrome plus distinct `background-hit` and `titlebar-drag` ray surfaces through `sceneUiSurface`
- keeps drag affordance separate from generic panel hit blocking, so only the title bar highlights and drags while the panel body still receives hit points
- disables local drag and passive height-follow during replay/analysis policy states

Recommended pattern:

- use the shared shell for panel chrome, default placement, runtime height-follow policy, and title-bar-only dragging
- layer scene-specific slider or button surfaces on top of the shell instead of rebuilding panel hit planes in every scene
- override placement knobs such as `panelInitialOffset`, `panelInitialYawDeg`, `orbitHeightOffset`, `followCameraHeight`, `heightFollowOffset`, `minPanelHeight`, `maxPanelHeight`, `heightSmoothing`, and `lockVerticalOrientation` in scene config, while keeping the orbit-facing math shared
- call `ensurePlacement()` when the scene activates or presentation mode changes so older recordings without panel state still get a sensible default placement
- call `applyPanelTransform(..., { useExactTransform: true })` when replay is restoring a logged `panelPosition` and `panelQuaternion`
- commit `panelPosition` and `panelQuaternion` from authored panel interactions such as title-bar drags, not from passive runtime height updates

Adaptive height is a live-study comfort behavior, not a replay-analysis behavior. The shared shell intentionally stops passive height-follow whenever replay state is being applied or inspected, so paused free-camera analysis stays tied to the logged panel transform.

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
- floating panel hit planes when a scene is not already using `floatingOrbitPanelShell.js`
- draggable XR window title bars when a scene is not already using `floatingOrbitPanelShell.js`
- authored XR control cards that need replay-visible pointer targets

Because these surfaces use the same `registerRaycastTarget()` path as the rest of the scene system, live controller cursor dots and replay ghost pointer targets remain visible without scene-specific replay hacks.

### Reusable XY Move Handle

`scenes/core/xyMoveHandle.js` exports `createXYMoveHandle(context, options)` for scene-owned horizontal movement affordances. The helper creates a root group, a vertical line down to the floor, a floor ring/disc, four non-interactive move arrows, and one invisible cylinder hit surface registered through `registerRaycastTarget()`. When `allowedRotate: true`, it also creates two curved rotation arrows and a separate invisible torus hit target for horizontal yaw rotation around Three.js world `Y`.

Scenes provide `getTargetPosition()` and `setTargetPosition(nextPosition)` plus optional `onDragStart`, `onDragMove`, and `onDragEnd` callbacks. The user-facing name is an XY move handle or XY move bar, but Three.js uses `X/Z` for the ground plane: the helper preserves target `Y` and changes only world `X/Z`.

The visual attachment point can be distinct from the moved target center. By default the handle anchors at `getTargetPosition()`. For rectangular panels or other off-center affordances, pass `getAnchorWorldPosition()` or pass `targetObject` with `anchorLocalPosition` / `attachmentLocalPosition`; the helper uses that anchor for the root, vertical line, floor ring/disc/arrows, and hit surfaces while still moving the target through `setTargetPosition()`.

Rotation remains opt-in. With `allowedRotate: true`, scenes should provide `getTargetQuaternion()` and `setTargetQuaternion(nextQuaternion)` plus optional `onRotateStart`, `onRotateMove`, and `onRotateEnd` callbacks. The helper computes floor-plane angle deltas around the anchor and applies yaw around world `Y`; it does not implement pitch or roll.

Recommended scene config pattern:

```js
panels: {
  withXYMoveBarDefault: true,
},
views: {
  trend: { withXYMoveBar: true },
},
xyMoveHandle: {
  floorY: 0.035,
  ringRadius: 0.14,
  interactiveRadius: 0.17,
  allowedRotate: false,
}
```

Use per-view flags such as `withXYMoveBar` or scene defaults such as `withXYMoveBarDefault` to decide which objects receive the helper. The helper owns only visual/raycast behavior. Semantic state, provenance labels, replay snapshots, and flush policy remain scene-owned so replay stores compact scene state rather than dense drag samples.

## Demo 1 Dataset Layout

Demo 1 keeps its local OWID bundle under `demo1/`:

- `demo1/data/gdp-per-capita-worldbank.csv`
- `demo1/data/gdp-per-capita-worldbank.metadata.json`
- `demo1/data/life-expectancy.csv`
- `demo1/data/life-expectancy.metadata.json`
- `demo1/data/co-emissions-per-capita.csv`
- `demo1/data/co-emissions-per-capita.metadata.json`
- optional `demo1/data/population-unwpp.csv`
- optional `demo1/data/population-unwpp.metadata.json`
- `demo1/demo1Data.js`
- `demo1/demo1Scene.js`
- `demo1/demo1VisualConfig.js`
- `demo1/demo1LoggingConfig.js`
- `demo1/demo1Tasks.js`
- `demo1/demo1Conditions.js`

Demo 1 joins the required local files on `(Code, Year)` and keeps only shared country-year rows with 3-letter country codes. It uses:

- `x = GDP per capita`
- `y = life expectancy`
- `z = CO2 emissions per capita`
- `color = region` by default
- `color = income` as an optional alternate grouping
- `size = population` when the optional population file is available, otherwise a fixed fallback radius

The required bundle is loaded locally with `new URL('./data/...', import.meta.url)` plus `fetch`. There are no runtime network requests back to OWID.

If a required file is missing, Demo 1 fails gracefully by showing an explanatory desktop/XR panel instead of crashing the scene. The expected filenames remain:

- `demo1/data/gdp-per-capita-worldbank.csv`
- `demo1/data/gdp-per-capita-worldbank.metadata.json`
- `demo1/data/life-expectancy.csv`
- `demo1/data/life-expectancy.metadata.json`
- `demo1/data/co-emissions-per-capita.csv`
- `demo1/data/co-emissions-per-capita.metadata.json`

Demo 1 also demonstrates the reusable scene-specific reactive-answer hook:

- the scene controller can expose `getAnswerSummary()`
- `main.js` forwards that hook into `createXRStudyLogger(...)`
- `buildAnswerPayload()` merges generic XR fields with scene-specific summary fields at outbound sync time

This keeps reactive summaries compact and scene-owned instead of hardcoding Demo 1 logic into the generic logger.

## Demo 2 Dataset Layout

Demo 2 keeps its migration baseline under `demo2/`:

- `demo2/data/demo2Nodes.json`
- `demo2/data/demo2Flows.csv`
- `demo2/data/geo/world-atlas-countries-110m.json`
- `demo2/data/raw/owid-migration-flows-export.csv`
- `demo2/data/raw/owid-migrant-stock-total.csv`
- `demo2/data/raw/owid-migrant-stock-total.metadata.json`
- `demo2/demo2Data.js`
- `demo2/demo2Scene.js`
- `demo2/demo2VisualConfig.js`
- `demo2/demo2Conditions.js`
- `demo2/demo2Tasks.js`
- `demo2/demo2LoggingConfig.js`

The current Demo 2 runtime bundle is intentionally an Afghanistan-centered outbound migration baseline because the provided OWID flow export is already scoped to emigration from Afghanistan. The scene-local data contract stays generalized around node and flow bundles so future demos can swap in broader OD datasets without changing the shared runtime. Demo 2 now also bundles a local Natural Earth-derived world boundary topology for subtle country linework on the globe, so there is still no runtime network fetch.

Demo 2 uses the same scene-local answer-summary hook pattern as Demo 1. Its controller contributes compact geo state such as year, direction mode, threshold, focused country, selected route, visible-flow count, label visibility, and globe yaw while the generic XR answers still continue to provide `xrMode`, `xrInteractionPhase`, `xrGrabCount`, `xrSessionCount`, `xrLastEvent`, and `xrStateSummaryJson`. Globe interaction remains semantic and replay-safe because Demo 2 now keeps both `globeYawDeg` and `globeAnchorPosition` in scene-local state: direct globe dragging updates yaw, and a floor handle under the globe updates horizontal anchor placement without introducing dense animation logs.

## Example 1 Dataset Layout

The legacy Example 1 OWID files now live under `example1/`:

- `example1/data/per-capita-energy-stacked.csv`
- `example1/data/per-capita-energy-stacked.metadata.json`
- `example1/docs/per-capita-energy-stacked-readme.md`
- `example1/example1VisualConfig.js`

The markdown file is not required at runtime, but it is kept under `example1/docs/` because it contains source notes, citation context, and future-authoring references that are useful for researchers extending the package.

Example 1 loads its assets with `new URL('./data/...', import.meta.url)` so Vite includes them in `dist/` without moving them into the global `public/` folder.

Example 1 now keeps its visual tuning in `example1/example1VisualConfig.js`, including:

- chart scaffold dimensions
- XR panel size, initial placement offsets, orbital drag settings, adaptive-height options, orbit-height/upright-orientation options, and drag-bar layout
- desktop panel styles
- shared label and tooltip styles
- slice-plane value-axis styling, double-sided visibility, light-blue outlines, and front-side measurement plaques

Example 1's slice planes are still built in `example1/example1Scene.js`, but the reusable styling knobs now live in `example1/example1VisualConfig.js`:

- `chart.sliceUseDoubleSide`
- `chart.sliceOutlineColor`
- `chart.sliceOutlineOpacity`
- `chart.sliceOutlineLift`
- `chart.sliceOutlineRenderOrder`

Future scenes can reuse the same pattern by keeping the plane geometry in scene code, enabling `sliceUseDoubleSide`, and adding a subtle outline with the matching `sliceOutline*` config values.

Example 1 now keeps its logging tuning in `example1/example1LoggingConfig.js`, including:

- replay-pointer behavior during XR slider drags
- immersive camera sampling overrides for scenes that do not need dense head-motion provenance
- immersive object sampling overrides for authored scenes that are semantic-first rather than manipulation-heavy
- scene-state throttling for panel-transform commits
- panel-policy knobs for passive height-follow, XR slider commits, drag commits, and drag-end commits
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
- keep `lockVerticalOrientation: true` unless the scene truly needs pitch toward the orbit center
- add a dedicated drag bar if users should be able to reposition it
- keep the draggable transform in semantic `sceneState` if participant replay should reconstruct the interaction honestly
- prefer stable semantic labels such as `Change Example 1 Year` over value-specific labels that fragment the replay legend
- keep scene-local logging overrides in the scene folder so immersive camera/object sampling can be reduced without changing global defaults
- let the shared helper own orbit mechanics and adaptive height, while the scene decides which authored panel interactions are allowed to commit transform state

Example 1 uses this pattern through `example1VisualConfig.js`, `scenes/core/floatingOrbitPanel.js`, and `example1/example1Scene.js`: a left-front initial placement, a draggable title bar, fixed-orbit repositioning, adaptive live height follow, upright shared yaw-only facing, and semantic replay of the committed panel transform.

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

Generic answer ids are always available:

- `xrMode`
- `xrInteractionPhase`
- `xrGrabCount`
- `xrSessionCount`
- `xrLastEvent`
- `xrStateSummaryJson`

Scenes can now contribute additional reactive fields through an optional `getAnswerSummary()` hook on the active scene controller.

Demo 1 uses that hook to expose:

- `xrDemoId`
- `xrTaskId`
- `xrNavMode`
- `xrOverviewVisible`
- `xrOverviewToggleCount`
- `xrScaleFactor`
- `xrSelectedPointCount`
- `xrSelectedPointIdsJson`
- `xrLastSelectedPointId`

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
