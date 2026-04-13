# Demo 5 Landmark Scale Visceralization

Demo 5 is available at:

```text
index.html?scene=5
```

It is a VR-first landmark height comparison scene inspired by Lee et al., "Data Visceralization: Enabling Deeper Understanding of Data Using Virtual Reality." The scene emphasizes embodied scale comparison rather than chart reading: participants use authored viewpoints, human-scale references, shadow cues, ruler bands, and semantic replayable controls to answer which landmark is tallest.

Demo 5 uses a scene-scoped clear-sky environment with a light ground plane. Its VR authored viewpoints reapply the Demo 5 background, fog, and camera projection after presentation-mode changes so the real-scale landmarks remain visible from base, far, overview, and high vantage points.

## Local Assets

The scene loads GLB assets from the Repo A `models/` folder first and falls back to OBJ only when the matching GLB fails:

- `cn_tower.glb` / `cn_tower.obj`
- `khalifa.glb` / `khalifa.obj`
- `oriental_pearl.glb` / `oriental_pearl.obj`
- `statue_of_liberty.glb` / `statue_of_liberty.obj`
- `people1.glb` / `people1.obj`
- `people2.glb` / `people2.obj`

Vite resolves those files through `new URL('../models/...', import.meta.url).href` in `demo5Data.js`; no external model requests are needed at runtime.

## Height Metadata

`demo5Data.js` centralizes labels, heights, source labels, source URLs, asset URLs, and landmark colors. Each loaded model is normalized after load by measuring its bounding box, scaling uniformly to the intended metadata height, shifting its base to `y=0`, and centering the X/Z footprint.

Included heights:

- Burj Khalifa: 828 m
- CN Tower: 553.33 m
- Oriental Pearl Tower: 468 m
- Statue of Liberty: 92.99 m, ground to torch

## Interaction And Replay

Semantic state includes:

- selected landmark
- comparison mode: `real-scale`, `distant-comparison`, or `miniature-comparison`
- viewpoint preset: `base_near_selected`, `distant_comparison`, `elevated_overview`, or `high_vantage`
- human-reference, shadow, ruler, and quantitative-label toggles
- control panel position and yaw rotation
- task answer and submission state

Replay restores these semantic values directly. It does not replay raw animation frames or model transitions.

## Controls

The in-scene Control Panel provides landmark, scale mode, viewpoint, cue, reset, and submit buttons in a compact headset-readable layout. Its top status line shows only the selected landmark and height, while the footer carries the task instruction: use authored views, select the tallest landmark, then submit. Landmark name labels stay fixed-size; the selected landmark also gets a near-user readable label that is independent of building scale. The annotation visibility state is preserved for compatibility, but there is no longer an `Ann On` / `Ann Off` participant control.

The Control Panel can be moved on the floor plane and yaw-rotated with the shared XY move handle. Demo 5 records the final panel transform only when a move or rotate interaction ends.

Human references use `people1` and `people2` when available, with OBJ fallback only if GLB loading fails. They are placed on the user-facing side of each landmark footprint, use isolated neutral materials so selection tint cannot leak into them, and remain controlled by the People toggle.

Selected and hovered landmarks use subtle visual-only base rings; the larger invisible hit proxies remain available for reliable controller and replay gaze selection. Shadow cues use soft transparent ground planes rather than hard circular blobs, and remain controlled by the Shadow toggle.

## Reactive Answers

The scene contributes Demo 5-specific reactive answers through `getAnswerSummary()`:

- `xrDemoId`
- `xrTaskId`
- `xrVisceralLandmarkSetId`
- `xrVisceralSelectedLandmarkId`
- `xrVisceralComparisonMode`
- `xrVisceralViewpointPresetId`
- `xrVisceralAnnotationsVisible`
- `xrVisceralHumanReferenceVisible`
- `xrVisceralShadowCueVisible`
- `xrVisceralRulerCueVisible`
- `xrVisceralQuantLabelsVisible`
- `xrVisceralStateSummaryJson`
- `xrStateSummaryJson`

The default task is "Which landmark is tallest?" and the expected answer is `burj_khalifa`.
