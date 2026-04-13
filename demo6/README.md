# Demo 6 Slice Rush

Demo 6 is available at:

```text
index.html?scene=6
```

Slice Rush is a VR-first XR mini-game baseline. It shows how reVISit-XR can capture high-frequency embodied play as compact semantic provenance: targets are generated deterministically, slices and misses are recorded as authored game events, and replay restores the round from semantic state instead of dense per-frame transforms.

## Gameplay

Participants slice flying fruit targets while avoiding bombs.

- Fruit hit: `+10` score and combo increment.
- Bomb hit: `-25` score and combo reset.
- Missed fruit: miss count increment and combo reset.
- Default round: `standard-v1`, 45 seconds, 52 deterministic procedural targets.

Desktop mode supports authoring and replay review with mouse drag slicing over the play lane. VR mode is primary: both controllers produce blade tips and trails from compact controller pose snapshots.

## Deterministic Round State

`demo6Conditions.js` defines the replayable state and `standard-v1` round config. The spawn plan is reconstructed from:

- `roundSeed`
- `roundConfigId`
- `durationMs`
- target count, cadence, target weights, trajectory bounds, and gravity

Each target uses an analytic trajectory:

```text
position = start + velocity * t + gravity * t * t * 0.5
```

Scene state stores compact target results only: id, type, status, hit time, and interactor. It does not store Three.js objects, target meshes, or per-frame target transforms.

## Logging And Replay

Immediate semantic labels:

- `Start Demo 6 Round`
- `Slice Target`
- `Miss Target`
- `Hit Bomb`
- `End Demo 6 Round`
- `Submit Demo 6 Task`
- `Reset Demo 6 Scene`

The scene also records low-frequency `Sample Demo 6 Round Clock` snapshots while a round is running. Recent blade trails are capped at 80 compact line segments and piggyback on semantic events or clock samples. Replay normalizes the saved state, rebuilds the target plan from the seed, restores elapsed time and target statuses, and renders ghost blade trails without starting new gameplay logs.

## Reactive Answers

`getAnswerSummary()` exposes:

- `xrDemoId`
- `xrTaskId`
- `xrGameScore`
- `xrGameCombo`
- `xrGameComboMax`
- `xrGameHits`
- `xrGameMisses`
- `xrGameAccuracy`
- `xrGameBombHits`
- `xrGameRoundSeed`
- `xrGameRoundState`
- `xrGameElapsedMs`
- `xrGameLastEvent`
- `xrGameStateSummaryJson`
- `xrStateSummaryJson`

## Configuration

- `demo6VisualConfig.js`: play lane, target colors, HUD/buttons, blade thresholds, scoring, and desktop panel styling.
- `demo6LoggingConfig.js`: pointer/camera sampling, scene-state throttling, immediate semantic flush flags, clock/trail sampling intervals, and stable labels.
- `demo6Conditions.js`: round config, state normalization, caps for target results and swing segments.

Future fruit or bomb GLB assets can be added behind Demo 6-local config, but v1 intentionally uses procedural primitives and no external downloads.
