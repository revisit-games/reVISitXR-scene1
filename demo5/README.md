# Demo 5 Landmark Scale Visceralization

Demo 5 is available at:

```text
index.html?scene=5
```

It is a VR-first landmark height comparison scene inspired by Lee et al., "Data Visceralization: Enabling Deeper Understanding of Data Using Virtual Reality." The scene emphasizes embodied scale comparison rather than chart reading: participants use authored viewpoints, human-scale references, shadow cues, ruler bands, and semantic replayable controls to answer which landmark is tallest.

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
- annotation, human-reference, shadow, ruler, and quantitative-label toggles
- task answer and submission state

Replay restores these semantic values directly. It does not replay raw animation frames or model transitions.

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
