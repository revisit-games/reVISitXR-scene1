# Demo 2 Migration Globe

This folder now owns the paper-facing Demo 2 baseline for `index.html?scene=2`.

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
  Globe, panel, button, and label styling.

Future demos should follow this scene-local pattern instead of pushing authored visualization logic into `main.js`.

## Local Data Bundle

Demo 2 uses only local files that ship with Repo A:

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

The local globe boundary asset is derived from `world-atlas` `countries-110m.json`, which in turn is built from Natural Earth public-domain data. Demo 2 loads that file through `demo2Data.js` and renders scene-local country outline linework without any runtime network fetch.

## Globe Interaction

Demo 2 keeps globe orientation semantic and replay-safe:

- the scene still stores only `globeYawDeg`
- globe rotation now comes from direct pointer/controller dragging on a raycastable interaction shell around the globe
- node and flow meshes remain their own interactive targets, so selecting a node or route still wins over bare-globe dragging when those marks are under the pointer
- replay restores the logged yaw directly through semantic scene-state hydration instead of replaying dense animation

The drag interaction intentionally stays yaw-only in v1. Demo 2 does not record globe pitch, roll, or free quaternion motion.

Demo 2 also adds a scene-local floor handle for ground-plane translation:

- a vertical line now drops from the globe to a floor ring/disc anchor
- the visible ring/disc is paired with four non-interactive arrow affordances
- dragging the handle updates the globe anchor in `X/Z` only while keeping `Y` fixed
- replay restores that anchor semantically instead of reenacting drag motion

## Interaction Geometry

Demo 2 now separates visible geometry from interaction geometry:

- visible country nodes remain small spheres
- node interaction uses larger invisible hit proxies
- visible flow arcs remain full globe-spanning tubes
- flow interaction uses separate invisible trimmed mid-arc proxies so route picking happens away from crowded node endpoints
- the globe shell is reserved for blank-surface dragging
- the floor handle remains a direct translation target

Most XR-safe interaction sizing now lives in `demo2/demo2VisualConfig.js`, including:

- `nodeHitProxyRadius`
- `flowProxyTrimStart`
- `flowProxyTrimEnd`
- `flowProxyRadiusFactor`
- `flowProxyMinRadius`
- `xrFrontHitClusterDistance`
- `xrShellAssistMaxContactDistance`

This keeps the paper-facing Demo 2 scene customizable without pushing scene-specific heuristics into `main.js`.

## Static Globe Labels And Panel Details

Demo 2 intentionally keeps only one in-scene text system on the globe:

- fixed country-name sprites are created from each node's `name`
- `labelsVisible` controls whether those fixed labels are shown
- hover, click, selection, replay, and route focus do not create or replace dynamic 3D tooltips
- selected node and selected flow details belong to the desktop/XR panels

The static-label policy is scene-local and lives in `demo2/demo2VisualConfig.js`:

- `interaction.tooltipMode` defaults to `'static-labels-only'`
- `interaction.flowSelectionAnnotationMode` defaults to `'none'`
- fixed country-label card styling lives under `labelStyles.nodeLabel`
- selected-node label tint, selected-label opacity, and selected-node halo strength live under `interaction.selectedLabelAccentColor`, `interaction.selectedLabelAccentStrength`, `interaction.selectedLabelOpacity`, and `interaction.selectedNodeHaloOpacity`

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
- `visibleFlowCount`
- `globeYawDeg`
- `globeAnchorPosition`
- `taskAnswer`
- `taskSubmitted`
- `panelPosition`
- `panelQuaternion`

The shared logger and bridge then merge Demo 2's scene-local answer summary into the generic XR reactive fields that Repo B already expects.
