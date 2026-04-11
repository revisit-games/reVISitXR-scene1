# Demo 4 Situated AR Overlay

Demo 4 is an AR-first situated overlay for local site monitoring. It is selected with:

- `index.html?scene=4`

The scene presents the Campus Commons Monitoring Overlay. Participants place a translucent footprint on a simulated horizontal floor/table plane, confirm it, and then inspect six anchored site markers. The desktop mode uses the same deterministic preview pose plus a side-panel fallback so reviewers can run the scene without a headset.

## Data And Task

The local dataset lives at `demo4/data/siteReadings.json`. It contains six deterministic sites:

- Library
- Atrium
- Cafe
- Lab
- Studio
- Classroom

Each site has overlay-local coordinates and readings for three time slices:

- morning
- midday
- evening

The supported metrics are:

- `occupancy`
- `noise`
- `co2`

The default task is `midday-highest-co2`: “At midday, using the CO2 metric, which site has the highest reading?” The expected answer is `site:classroom`.

## Placement

Demo 4 uses the shared `scenes/core/situatedAnchor.js` helper. The helper owns a preview root, an anchor root, and an invisible horizontal placement surface. Controller or desktop rays intersect that surface to update the preview. Selecting the surface confirms the placement and copies the preview transform into the anchor root.

The scene stores placement as semantic state:

- `arPlacementConfirmed`
- `placementMode`
- `placementCount`
- `arAnchorPosition`
- `arAnchorQuaternion`
- `arScaleFactor`

Preview motion is intentionally not logged. Only placement confirmation and reset/reposition commits create semantic scene-state nodes.

## Interactions

After placement, anchored markers and controls support:

- hover and select site marker
- switch metric
- switch time slice
- toggle labels
- toggle layer mode between `all` and `alerts`
- expand or collapse the detail card
- reset/reposition the anchor
- submit the selected site as the answer

The `alerts` layer derives `visibleSiteIds` from the active metric’s threshold at the active time slice. If the selected site is hidden by the alerts layer, the semantic answer remains stored and replayable.

## Replay And Answers

`getSceneStateForReplay()` returns normalized semantic state only. `applySceneStateFromReplay()` hydrates the anchor transform, placement mode, metric, time slice, layer, labels, focused/selected site, detail state, answer, and submission state directly. It does not replay raw placement animation.

The scene-specific answer summary exposes:

- `xrDemoId`
- `xrTaskId`
- `xrArPlacementConfirmed`
- `xrArPlacementMode`
- `xrArMetricId`
- `xrArTimeIndex`
- `xrArLayerMode`
- `xrArLabelsVisible`
- `xrArSelectedSiteId`
- `xrArFocusedSiteId`
- `xrArDetailExpanded`
- `xrArVisibleSiteCount`
- `xrArAnchorTransformJson`
- `xrStateSummaryJson`

The existing global replay avatar and ghost controller rays are managed by `main.js` and are not changed by Demo 4.
