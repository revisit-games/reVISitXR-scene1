# Demo 3 Analytic Workspace

Demo 3 is the immersive analytic workspace for reVISit-XR. It keeps the public URL stable at:

```text
index.html?scene=3
```

The scene demonstrates four coordinated floating views in XR:

- `trend`: population-weighted regional life-expectancy trends.
- `ranking`: regions ranked by life-expectancy increase.
- `comparison`: latest GDP per capita, CO2 per capita, and population comparison.
- `summary`: task prompt, selected-region details, answer status, and XR controls.

## Data Bundle

Demo 3 uses local OWID CSV and metadata files copied from Demo 1 into `demo3/data/`:

- `gdp-per-capita-worldbank.csv`
- `life-expectancy.csv`
- `co-emissions-per-capita.csv`
- `population-unwpp.csv`
- matching `.metadata.json` files

`demo3Data.js` joins the files by ISO country code and year, keeps country rows with 3-letter ISO codes, uses `World region according to OWID` from the GDP file, and builds population-weighted regional aggregates. The current local data supports a `2000` to `2023` comparison window.

See `../credits.md` for project-facing data attribution. The bundled OWID metadata files remain beside the local data files for detailed provenance.

## Semantic State

Replay and reactive answer summaries use compact semantic workspace state rather than raw drag motion:

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

Each `panelLayouts[viewId]` entry stores:

- `position: [x, y, z]`
- `quaternion: [x, y, z, w]`
- `slotId`
- `pinned`

Panel dragging commits the semantic transform on drag end and moves the workspace into `free` layout. Replay restores the semantic layout, focus, selection, linked highlighting, pinned panels, answer, and submitted state directly.

## Panel XY Move Handles

All four workspace panels opt into the shared `scenes/core/xyMoveHandle.js` helper through `demo3VisualConfig.panels.withXYMoveBarDefault`, `demo3VisualConfig.views[viewId].withXYMoveBar`, and `demo3VisualConfig.xyMoveHandle`.

The user-facing XY move bars sit on the floor as siblings of the panels under the workspace root. Their vertical line uses a bottom-center attachment point just below each rectangular panel, while movement still targets the panel root/center. Dragging a handle moves only that panel's root in Three.js world `X/Z`, keeps the panel's `Y` unchanged, switches the workspace to `free`, and commits the compact `panelLayouts[viewId]` transform only on drag end.

Demo 3 also enables the helper's optional rotation arrows with `demo3VisualConfig.xyMoveHandle.allowedRotate`. The purple outer arrows use the helper's `rotateRing*`, `rotateArrow*`, `rotateHover*`, `rotateActive*`, and `rotateInteractive*` knobs, and their separate torus hit target yaws the panel horizontally around Three.js world `Y`. Rotation updates `panel.root.quaternion` during drag and commits the existing `panelLayouts[viewId].quaternion` value on drag end. `rotateDirection` flips the floor-plane drag direction while keeping rotation yaw-only.

The same shared helper owns move and rotate hover/active feedback. The cyan move ring brightens during hover/drag, while the purple rotation arrows brighten to pale purple/white during hover/drag. Demo 2 keeps rotation disabled.

## Layout Modes

`demo3Conditions.js` accepts:

```text
index.html?scene=3&layout=compare
index.html?scene=3&layout=focus
index.html?scene=3&layout=surround
index.html?scene=3&layout=free
```

Default layout is `compare`.

Preset transforms live in `demo3VisualConfig.js` under `layouts.compare`, `layouts.focus`, and `layouts.surround`. The side-panel yaw signs face panels inward by default: left panels yaw right and right panels yaw left, while center/front panels remain at zero yaw. Future packages can adjust panel positions, yaw, scale, sizes, colors, mark sizes, button sizes, and chart margins in `demo3VisualConfig.js` without editing scene logic.

## Linked Highlighting

All views use shared semantic datum ids such as `region:africa`. When linked highlighting is enabled, selecting or hovering a region in any view highlights the same region across the other views. When disabled, hover is local to the active view while `selectedDatumId` remains available to the summary panel and task submission.

Selected datum highlighting is tuned in `demo3VisualConfig.charts` with `selectedColor`, `selectedDimmedOpacity`, `selectedScaleMultiplier`, `selectedOutlineColor`, and `selectedOutlineOpacity`. The selected region uses a white fill plus explicit white selected overlays and a gold outline/halo across the trend, ranking, comparison, and linked-highlighted views, while non-selected marks dim instead of disappearing. The trend view includes a selected line overlay so the selected data line stays visible even when several region lines overlap.

## Reactive Answer Fields

`getAnswerSummary()` exposes:

- `xrDemoId`
- `xrTaskId`
- `xrWorkspaceLayoutMode`
- `xrWorkspaceFocusedViewId`
- `xrWorkspaceSelectedViewId`
- `xrWorkspaceSelectedDatumId`
- `xrWorkspaceLinkedHighlight`
- `xrWorkspaceVisibleViewIdsJson`
- `xrWorkspacePinnedViewIdsJson`
- `xrWorkspacePanelLayoutJson`

The shared runtime continues to provide generic fields such as `xrMode`, `xrInteractionPhase`, `xrGrabCount`, `xrSessionCount`, `xrLastEvent`, and `xrStateSummaryJson`.

