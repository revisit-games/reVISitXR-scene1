# Demo 1 Local Notes

Demo 1 is the paper-facing 3D scatterplot navigation baseline for reVISit-XR.

## Local Data Bundle

Required files:

- `demo1/data/gdp-per-capita-worldbank.csv`
- `demo1/data/gdp-per-capita-worldbank.metadata.json`
- `demo1/data/life-expectancy.csv`
- `demo1/data/life-expectancy.metadata.json`
- `demo1/data/co-emissions-per-capita.csv`
- `demo1/data/co-emissions-per-capita.metadata.json`

Optional files:

- `demo1/data/population-unwpp.csv`
- `demo1/data/population-unwpp.metadata.json`

The scene uses only local files. It does not fetch runtime data from OWID.

## Encodings

- `x = GDP per capita`
- `y = life expectancy`
- `z = CO2 emissions per capita`
- default color encoding: `region`
- optional alternate color encoding: `income`
- optional point size: `population`

## Navigation Modes

- `scale`
  Main scatterplot navigation with a shared semantic `scaleFactor`
- `overview`
  Main scatterplot plus an overview/WIM miniature that can be shown or hidden

## Semantic Scene State

Demo 1 replays from compact semantic state instead of per-point motion:

- `demoId`
- `dataYear`
- `taskId`
- `navMode`
- `colorEncoding`
- `overviewEnabled`
- `overviewVisible`
- `overviewToggleCount`
- `scaleFactor`
- `selectedPointId`
- `selectedPointIds`
- `selectionCount`
- `taskAnswer`
- `taskSubmitted`

Hover is runtime-only and intentionally not committed as dense provenance.
