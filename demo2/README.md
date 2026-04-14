# Demo 2 Migration Globe

This folder now owns the Demo 2 baseline for `index.html?scene=2`.

## Scene Pattern

Demo 2 follows the same scene-local structure as Demo 1:

- `demo2Scene.js`
  Scene rendering, interactions, replay hydration, desktop panel, and XR floating panel.
- `demo2Data.js`
  Local bundled-data loader for the curated node and flow files.
- `demo2Conditions.js`
  Query parsing plus backward-compatible semantic scene-state normalization.
- `demo2Tasks.js`
  Compact study-facing task definitions.
- `demo2LoggingConfig.js`
  Scene-specific logging knobs and stable semantic labels.
- `demo2VisualConfig.js`
  Globe, flat map, panel, button, and label styling.

Future demos should follow this scene-local pattern instead of pushing authored visualization logic into `main.js`.

## Local Data Bundle

Demo 2 uses only local files that ship with this repo:

- generated runtime files:
  - `demo2/data/demo2Nodes.json`
  - `demo2/data/demo2Flows.csv`
  - `demo2/data/geo/world-atlas-countries-110m.json`
- raw source files kept for provenance and future curation:
  - `demo2/data/raw/owid-migration-flows-export.csv`
  - `demo2/data/raw/owid-migrant-stock-total.csv`
  - `demo2/data/raw/owid-migrant-stock-total.metadata.json`
- scene-local generation inputs:
  - `demo2/config/demo2DatasetSelectionConfig.mjs`
  - `demo2/config/demo2CountryMetadata.mjs`
  - `demo2/scripts/buildDemo2Dataset.mjs`

The current generated baseline is intentionally Afghanistan-centered because the provided OWID flow export is an Afghanistan outbound migration table rather than a full global OD matrix. The runtime data contract still stays generalized:

- nodes: `id`, `name`, `lat`, `lon`, `region`, `stockByYear`
- flows: `flowId`, `year`, `originId`, `destinationId`, `value`

That keeps Demo 2 extensible for broader OD datasets later without redesigning the scene architecture.

## Rebuild Workflow

Demo 2 runtime data should be regenerated from raw files rather than edited by hand:

```bash
npm run demo2:build-data
```

The generator:

- reads the two OWID raw source files
- filters to 3-letter country rows
- keeps only the configured `AFG -> destination` outbound routes
- keeps only the configured years
- joins in scene-local country metadata because the OWID exports do not include globe coordinates
- rewrites `demo2/data/demo2Nodes.json` and `demo2/data/demo2Flows.csv`

Default selection lives in `demo2/config/demo2DatasetSelectionConfig.mjs`:

- `originId`
- `supportedYears`
- `requiredDestinationIds`
- `preferredDestinationIds`
- `maxDestinationCount`
- `minAngularSeparationDeg`

The default XR-safe destination set is:

- `IRN`
- `PAK`
- `IND`
- `DEU`
- `GBR`
- `USA`
- `CAN`
- `AUS`

Country metadata used to place nodes on the globe lives in `demo2/config/demo2CountryMetadata.mjs`.

Demo 2 loads the local globe boundary file through `demo2Data.js` and renders scene-local country outline linework without any runtime network fetch. See `../credits.md` and `demo2/data/geo/SOURCE.md` for attribution and upstream provenance.

## Globe Interaction

Demo 2 keeps globe orientation semantic and replay-safe:

- the scene still stores only `globeYawDeg`
- globe rotation now comes from direct pointer/controller dragging on a raycastable interaction shell around the globe
- node and flow meshes remain their own interactive targets, so selecting a node or route still wins over bare-globe dragging when those marks are under the pointer
- replay restores the logged yaw directly through semantic scene-state hydration instead of replaying dense animation

The drag interaction intentionally stays yaw-only in v1. Demo 2 does not record globe pitch, roll, or free quaternion motion.

Demo 2 consumes the shared `scenes/core/xyMoveHandle.js` helper for floor translation:

- a vertical line now drops from the globe to a floor ring/disc anchor
- the visible ring/disc is paired with four non-interactive arrow affordances
- dragging the user-facing XY move bar updates the globe anchor in Three.js world `X/Z` only while keeping `Y` fixed
- the shared helper's optional yaw rotation arrows are disabled here, because globe yaw is already handled by direct globe dragging
- replay restores that anchor semantically instead of reenacting drag motion

The visual tuning lives in `demo2VisualConfig.globe.xyMoveHandle`. Existing flat `globe.handle*` fields are still used as fallbacks for package compatibility. The helper owns the line, ring, disc, arrows, and invisible hit cylinder, while Demo 2 still owns the `GLOBE_HANDLE` raycast role, `moveGlobe` provenance label, replay hydration, and `flushOnGlobeMoveEnd` behavior.

## Map Display Modes

Demo 2 now supports a scene-local `mapDisplayMode`:

- `globe`
  Default. Shows the 3D globe, globe nodes, globe flows, globe shell, and globe floor handle.
- `flat`
  Shows a rectangular equirectangular world map slightly above the floor with country boundary linework, flat nodes, and flat flows.
- `both`
  Shows the globe and flat map together.

The optional query parameter is:

```text
index.html?scene=2&map=globe
index.html?scene=2&map=flat
index.html?scene=2&map=both
```

The globe and flat map are two views of the same data, not separate interaction systems. They share:

- `focusedCountryId`
- `selectedNodeId`
- `selectedFlowId`
- current node and flow hover state
- year, threshold, direction, and label filters
- semantic logging and replay state

Selecting or hovering a node or flow in either view updates the same semantic target, so highlights mirror across both views when `mapDisplayMode` is `both`.

Flat map customization lives in `demo2VisualConfig.flatMap`. Package users can tune the floor position, width, height, map lift, boundary colors, node radius, node hit-proxy radius, flow thickness, flow arc height, flow hit-proxy thickness, and hover/selected colors without editing scene logic.

## Interaction Geometry

Demo 2 now separates visible geometry from interaction geometry:

- visible country nodes remain small spheres
- node interaction uses larger invisible hit proxies
- visible flow arcs remain full globe-spanning tubes
- flow interaction uses separate invisible trimmed mid-arc proxies so route picking happens away from crowded node endpoints
- the globe shell is reserved for blank-surface dragging
- the floor handle remains a direct translation target
- flat map nodes and flows use their own invisible hit proxies while sharing the same semantic target ids as the globe

Most XR-safe interaction sizing now lives in `demo2/demo2VisualConfig.js`, including:

- `nodeHitProxyRadius`
- `flowProxyTrimStart`
- `flowProxyTrimEnd`
- `flowProxyRadiusFactor`
- `flowProxyMinRadius`
- `xrFrontHitClusterDistance`
- `xrShellAssistMaxContactDistance`
- `flatMap.nodeHitProxyRadius`
- `flatMap.flowProxyRadiusFactor`
- `flatMap.flowProxyMinRadius`

This keeps the paper-facing Demo 2 scene customizable without pushing scene-specific heuristics into `main.js`.

Hidden map targets are filtered scene-locally. Demo 2 marks raycastable map objects with `demo2MapSpace` (`globe` or `flat`), filters inactive spaces inside the Demo 2 resolver, and disables layer `0` for inactive map-space targets so hidden proxies cannot capture desktop or XR raycasts. Panel buttons are not map-space targets and remain interactive in every display mode.

## Panel Details

Selected-node label tint, selected-label opacity, and selected-node halo strength live under `interaction.selectedLabelAccentColor`, `interaction.selectedLabelAccentStrength`, `interaction.selectedLabelOpacity`, and `interaction.selectedNodeHaloOpacity`

Panel summary text is owned by `syncDesktopPanel()` and `syncXrPanel()` in `demo2/demo2Scene.js`. Those functions are the authoritative place for selected node, selected route, route year/value/destination, and task submission status.

## Semantic Replay State

Demo 2 restores semantic geo state instead of replaying dense arc animation:

- `demoId`
- `taskId`
- `geoYear`
- `flowDirectionMode`
- `minFlowThreshold`
- `focusedCountryId`
- `selectedNodeId`
- `selectedFlowId`
- `labelsVisible`
- `mapDisplayMode`
- `visibleFlowCount`
- `globeYawDeg`
- `globeAnchorPosition`
- `taskAnswer`
- `taskSubmitted`
- `panelPosition`
- `panelQuaternion`

The shared logger and bridge then merge Demo 2's scene-local answer summary into the generic XR reactive fields that the study wrapper already expects.
