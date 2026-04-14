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

Desktop mode supports authoring and replay review with mouse drag slicing over the play lane. VR mode is primary: both controller rays act as blades, so touching a fruit or bomb with the ray is enough to slice or hit it. No trigger press is required.

VR controller blade afterimages are drawn from endpoint motion, not from full controller rays. When a ray touches an active target, the endpoint is the target contact point; otherwise it is the clipped endpoint on the play-room bounds. This keeps the headset trail closer to a Fruit Ninja-style slash arc.

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

Scene state stores compact target outcomes only: id, type, status, event time, and interactor source. It does not store Three.js objects, target meshes, per-frame target transforms, blade trails, swing segments, or controller motion streams.

## Logging And Replay

Immediate semantic labels:

- `Start Demo 6 Round`
- `Slice Target`
- `Miss Target`
- `Hit Bomb`
- `End Demo 6 Round`
- `Sample Demo 6 Round Clock`
- `Submit Demo 6 Task`
- `Reset Demo 6 Scene`

The scene also records coarse, non-immediate `Sample Demo 6 Round Clock` snapshots while a round is running. Replay normalizes the saved state, rebuilds the target plan from the seed, restores elapsed time and target outcomes, and renders active unresolved targets only. Sliced fruit, hit bombs, and missed targets disappear immediately instead of remaining as reduced ghost objects.

Blade afterimages and slice particles are live-only visual feedback. They fade quickly, are not stored in scene state, are not emitted as reactive answers, and are not logged as provenance.

Replay audio is scene-local and lightweight. During replay hydration, Demo 6 compares compact target outcomes across safe forward time steps and plays fruit/slicing or bomb sounds only for crossed outcomes. Participant/trial changes, backward jumps, reset/idle states, round identity changes, and large scrubs reset the replay-audio cursor so replay does not emit a burst of old sounds.

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

Large state-summary JSON reactive fields are intentionally omitted for Demo 6. The Demo 6 scene definition opts out of the shared `xrStateSummaryJson` answer payload so the analytics table receives scalar game answers, while replay uses compact semantic provenance.

## Configuration

- `demo6VisualConfig.js`: play room walls, target colors, HUD/buttons, ray hit tuning, live afterimages, slice particles, audio volume and replay-audio safeguards, scoring, and desktop panel styling.
- `demo6LoggingConfig.js`: pointer/camera sampling, scene-state throttling, immediate semantic flush flags, coarse clock sampling, and stable labels.
- `demo6Conditions.js`: round config, state normalization, 25% smaller fruit/bomb radii, and caps for compact target outcomes.

Audio lives in `demo6/audio/` and is loaded with module-relative URLs:

- `gamestart.wav` for round start
- `fruit.wav` and `slicing.wav` for fruit slices
- `bomb.wav` for bomb hits

Future fruit or bomb GLB assets can be added behind Demo 6-local config, but v1 intentionally uses procedural primitives.
