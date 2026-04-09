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

- curated runtime files:
  - `demo2/data/demo2Nodes.json`
  - `demo2/data/demo2Flows.csv`
- raw source files kept for provenance and future curation:
  - `demo2/data/raw/owid-migration-flows-export.csv`
  - `demo2/data/raw/owid-migrant-stock-total.csv`
  - `demo2/data/raw/owid-migrant-stock-total.metadata.json`

The current curated baseline is intentionally Afghanistan-centered because the provided OWID flow export is an Afghanistan outbound migration table rather than a full global OD matrix. The runtime data contract still stays generalized:

- nodes: `id`, `name`, `lat`, `lon`, `region`, `stockByYear`
- flows: `flowId`, `year`, `originId`, `destinationId`, `value`

That keeps Demo 2 extensible for broader OD datasets later without redesigning the scene architecture.

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
- `taskAnswer`
- `taskSubmitted`
- `panelPosition`
- `panelQuaternion`

The shared logger and bridge then merge Demo 2's scene-local answer summary into the generic XR reactive fields that Repo B already expects.
