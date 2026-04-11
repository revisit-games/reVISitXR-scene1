# Demo 3 Analytic Workspace

Demo 3 is the paper-facing immersive analytic workspace for reVISit-XR. It keeps the public URL stable at:

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

No network download is required for the scene.

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

## Layout Modes

`demo3Conditions.js` accepts:

```text
index.html?scene=3&layout=compare
index.html?scene=3&layout=focus
index.html?scene=3&layout=surround
index.html?scene=3&layout=free
```

Default layout is `compare`.

Preset transforms live in `demo3VisualConfig.js` under `layouts.compare`, `layouts.focus`, and `layouts.surround`. Future packages can adjust panel positions, yaw, scale, sizes, colors, mark sizes, button sizes, and chart margins in `demo3VisualConfig.js` without editing scene logic.

## Linked Highlighting

All views use shared semantic datum ids such as `region:africa`. When linked highlighting is enabled, selecting or hovering a region in any view highlights the same region across the other views. When disabled, hover is local to the active view while `selectedDatumId` remains available to the summary panel and task submission.

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

## Implementation Notes

- The former `example3/` placeholder has been replaced by `demo3/`.
- `scenes/core/sceneRegistry.js` maps `scene=3` to `demo3SceneDefinition`.
- Demo 3 uses a scene-local panel helper so panels remain visible in desktop and immersive modes.
- The scene does not modify shared `main.js`.
