# Demo 4 Situated AR Overlay

Demo 4 is an AR-first situated overlay for local site monitoring. It is selected with:

- `index.html?scene=4`

The scene presents the Campus Commons Monitoring Overlay. Participants place a footprint onto a situated surface, inspect anchored site markers, switch metrics and time slices, and submit the site that answers the task. Desktop mode remains usable as a deterministic fallback for reviewers and replay analysis. VR is intentionally disabled for this scene because the demo is meant to foreground AR/situated interaction rather than another virtual chart room.

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

The default task is `midday-highest-co2`: "At midday, using the CO2 metric, which site has the highest reading?" The expected answer is `site:classroom`.

## Placement

Demo 4 uses the shared `scenes/core/situatedAnchor.js` helper. The helper owns a preview root, an anchor root, and an invisible horizontal fallback placement surface. The scene can feed the helper one of three live placement sources:

- `xr-hit-test`: WebXR hit-test found a real surface pose.
- `floor-plane-fallback`: real surface hit-test is unavailable or has no current result, so the deterministic horizontal fallback plane is used.
- `desktop-default`: desktop fallback uses a stable default preview pose.

Replay may also hydrate `placementSource: 'replay'` for older snapshots without a source field. Replay never requires a live hit-test source because the anchor transform is stored semantically.

Demo 4 placement is driven by the left controller before the overlay is confirmed. Gaze/head ray placement is intentionally ignored, and the right controller cannot move or confirm the footprint. If WebXR does not expose handedness, `controller-0` is accepted as a fallback and the prompt/HUD calls that out. Desktop remains deterministic: reviewers can confirm the default footprint from the side panel.

In live AR, the left trigger confirms the current stabilized WebXR hit-test preview even when the controller ray does not intersect the invisible Three.js fallback placement surface. This keeps real-surface preview and trigger confirmation on the same semantic placement path. A separate placement card appears only during live AR before confirmation with the left-controller instruction and live surface status. After a surface preview is acquired, the card stays above the stabilized footprint instead of following the camera, so the prompt remains readable even when the preview footprint is lying flat on a real table or bed. Desktop analysis replay never shows this live placement helper.

Demo 4 does not claim real plane detection when WebXR hit-test is unavailable. In AR it tells the participant whether real hit-test placement is stabilizing, ready, or lost. Preview motion is smoothed and spike-filtered, but the raw preview path is not logged.

The scene stores placement as semantic state:

- `arPlacementConfirmed`
- `placementMode`
- `placementCount`
- `placementSource`
- `placementDriver`
- `placementControllerSource`
- `surfaceDetected`
- `arAnchorPosition`
- `arAnchorQuaternion`
- `arAnchorSurfaceHeight`
- `arScaleFactor`
- `controlPanelY`

Preview motion is intentionally not logged. Only placement confirmation and reset/reposition commits create semantic scene-state nodes.

Real `xr-hit-test` placement preserves the hit pose's world Y value through confirmation and replay. Floor-plane fallback and desktop default placement still use `floorY + overlayLift`. During analysis replay, anchors above the virtual floor show a translucent gray support pedestal under the footprint so tabletop/bed placements remain interpretable without appearing in live AR. The pedestal includes a side label, "Estimated real-world support surface", to clarify that the cuboid is an approximate physical support-surface proxy.

## Situated Interaction

Demo 4 combines:

- a world-anchored overlay
- real-surface placement when WebXR hit-test is available
- deterministic fallback placement when real hit-test is unavailable
- head-gaze dwell activation as a WebXR-compatible proxy for gaze-based activation
- hand/controller ray selection as the baseline modality
- semantic replay of situated state rather than raw preview animation

The `interactionModality` state toggles between:

- `gaze-dwell`
- `hand-ray`

`gaze-dwell` uses the live testing camera forward ray to focus visible site markers. A stable dwell of about 900 ms activates the site, expands detail, stores it as the answer draft, increments `gazeDwellCount`, and records `lastActivationEvent`. During analysis replay inspection, gaze dwell is disabled so the analyst's free camera cannot change marker focus or selection, while the shared replay pointer system can still render the recorded `USER GAZE: GAZE DWELL` ray and hit point. `hand-ray` preserves controller and desktop marker selection, increments `handSelectCount`, and records the same activation summary shape.

## Interactions

After placement, anchored markers and controls support:

- hover and select site marker
- gaze-dwell site activation
- switch interaction modality
- switch metric
- switch time slice
- toggle labels
- toggle layer mode between `all` and `alerts`
- toggle compact or expanded selected-site detail inside the main control panel
- drag the Control Panel title bar to adjust panel height only
- reset/reposition the anchor
- submit the selected site as the answer

The `alerts` layer derives `visibleSiteIds` from the active metric's threshold at the active time slice. If the selected site is hidden by the alerts layer, the semantic answer remains stored and replayable.

Selected site details are shown in the main control panel and desktop sidebar. Demo 4 no longer shows a separate floating in-scene detail tooltip/card next to the site markers.

The Control Panel defaults behind the marker cluster with `demo4VisualConfig.panel.position`, so it stays readable without sitting between the viewer and the site cylinders. Its title strip is a raycast target for either controller and desktop pointer. Dragging it changes only the panel's local Y position, clamps that height with `demo4VisualConfig.panel.heightDrag.minY/maxY`, and records one semantic `controlPanelY` change on drag end when the movement exceeds `heightDrag.dragEpsilon`. The fixed X/Z placement and title-strip styling live in `demo4VisualConfig.panel.position`, `titleBarHeight`, `titleBarY`, `titleBarColor`, `titleBarHoverColor`, `titleBarDragColor`, and `titleBarOpacity`.

## Replay And Answers

`getSceneStateForReplay()` returns normalized semantic state only. `applySceneStateFromReplay()` hydrates the anchor transform, placement source label, stored support-surface height, control-panel height, surface-detected flag, interaction modality, activation counts, metric, time slice, layer, labels, focused/selected site, control-panel detail expansion state, answer, and submission state directly. It does not replay raw placement animation and does not need live hit-test.

The scene-specific answer summary exposes:

- `xrDemoId`
- `xrTaskId`
- `xrArPlacementConfirmed`
- `xrArPlacementMode`
- `xrArPlacementSource`
- `xrArSurfaceDetected`
- `xrArMetricId`
- `xrArTimeIndex`
- `xrArLayerMode`
- `xrArLabelsVisible`
- `xrArSelectedSiteId`
- `xrArFocusedSiteId`
- `xrArDetailExpanded`
- `xrArInteractionModality`
- `xrArGazeDwellCount`
- `xrArHandSelectCount`
- `xrArVisibleSiteCount`
- `xrArAnchorTransformJson`
- `xrStateSummaryJson`

New placement and panel implementation fields such as `placementDriver`, `placementControllerSource`, `arAnchorSurfaceHeight`, and `controlPanelY` stay inside `xrStateSummaryJson`. `xrArAnchorTransformJson` also includes compact anchor height/source metadata under the existing reactive id; no new study sidebar reactive ids are required.
