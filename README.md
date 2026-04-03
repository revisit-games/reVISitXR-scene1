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

Adjust all timing and threshold values in `logging/xrLoggingSchema.js`.

Default knobs:

- `objectMinIntervalMs: 200`
- `cameraMinIntervalMs: 300`
- `pointerMinIntervalMs: 120`
- `positionEpsilon: 0.01`
- `quaternionAngleThresholdDeg: 2`
- `pointerPositionEpsilon: 0.02`
- `pointerRayLengthEpsilon: 0.02`
- `enablePointerSampling: true`

If you want less graph growth:

- increase the sample intervals
- increase the epsilons
- disable pointer sampling with `enablePointerSampling: false`

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
- `getReplayPointerVisuals()`
- `getReplayAvatarVisuals()`

These helpers are for development only and are useful when validating replay hydration, pause/play behavior, pointer rendering, and replay-avatar placement.
