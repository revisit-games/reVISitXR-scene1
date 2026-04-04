import * as THREE from 'three';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import {
  EXAMPLE1_SOURCE_COLORS,
  loadExample1Dataset,
} from './example1Data.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { example1VisualConfig } from './example1VisualConfig.js';

const DISPLAY_MAX_STEP = 50000;
const DISPLAY_TICK_COUNT = 4;

function formatValue( value, unit ) {

  return `${new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits: 0,
  } ).format( value )} ${unit} / person`;

}

function formatCompactTick( value ) {

  if ( value === 0 ) {

    return '0';

  }

  if ( value >= 1000 ) {

    return `${Math.round( value / 1000 )}k`;

  }

  return new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits: 0,
  } ).format( value );

}

function roundUpToStep( value, step ) {

  return Math.max( step, Math.ceil( value / step ) * step );

}

function buildDatumId( country, source ) {

  return `${country}|${source}`;

}

function parseDatumId( datumId ) {

  if ( typeof datumId !== 'string' ) {

    return null;

  }

  const [ country, source ] = datumId.split( '|' );

  if ( ! country || ! source ) {

    return null;

  }

  return { country, source };

}

function getEmptySceneState( fallbackState = {} ) {

  return {
    selectedYear: Number.isFinite( fallbackState?.selectedYear ) ? fallbackState.selectedYear : null,
    selectedDatumId: typeof fallbackState?.selectedDatumId === 'string' ? fallbackState.selectedDatumId : null,
  };

}

function createStyledElement( tagName, style, text = '' ) {

  const element = document.createElement( tagName );
  element.setAttribute( 'style', style );
  element.textContent = text;
  return element;

}

function updateLabelSprite( spriteController, position ) {

  spriteController.sprite.position.copy( position );

}

function createTrackedTextSprite( collection, parent, options, position ) {

  const controller = createTextSprite( options );
  updateLabelSprite( controller, position );
  parent.add( controller.sprite );
  collection.push( controller );
  return controller;

}

function createTrackedMesh( collection, geometry, material ) {

  const mesh = new THREE.Mesh( geometry, material );
  collection.push( mesh );
  return mesh;

}

export const example1SceneDefinition = Object.freeze( {
  sceneKey: 'example1',
  queryValue: '1',
  label: 'Example 1 Energy Matrix',
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return {
      selectedYear: Number.isFinite( candidateState?.selectedYear )
        ? candidateState.selectedYear
        : ( Number.isFinite( fallbackState?.selectedYear ) ? fallbackState.selectedYear : null ),
      selectedDatumId: typeof candidateState?.selectedDatumId === 'string'
        ? candidateState.selectedDatumId
        : ( typeof fallbackState?.selectedDatumId === 'string' ? fallbackState.selectedDatumId : null ),
    };

  },
  createScene( context ) {

    const {
      chart,
      xrPanel,
      desktopPanel,
      labelStyles,
    } = example1VisualConfig;

    const root = new THREE.Group();
    const chartRoot = new THREE.Group();
    const scaffoldRoot = new THREE.Group();
    const labelRoot = new THREE.Group();
    const xrPanelRoot = new THREE.Group();

    chartRoot.position.fromArray( chart.rootPosition );
    root.add( chartRoot );
    root.add( xrPanelRoot );
    chartRoot.add( scaffoldRoot );
    chartRoot.add( labelRoot );

    const tempObject = new THREE.Object3D();
    const tempVector = new THREE.Vector3();
    const tempVector2 = new THREE.Vector3();
    const tempVector3 = new THREE.Vector3();
    const tempForward = new THREE.Vector3();
    const tempRight = new THREE.Vector3();
    const tempLeft = new THREE.Vector3();
    const tempDirection = new THREE.Vector3();
    const tempLookTarget = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();
    const tempPanelTargetQuaternion = new THREE.Quaternion();
    const sliderPlane = new THREE.Plane();
    const sliderIntersection = new THREE.Vector3();

    const panelHoverSources = new Set();
    const sliderHoverSources = new Set();
    const labelCollections = {
      countries: [],
      sources: [],
      axes: [],
      ticks: [],
      panel: [],
    };
    const trackedMeshes = [];
    const uiSurfaces = [];
    const datumEntries = [];
    const datumEntryById = new Map();
    const tickMeshes = [];
    const currentHeights = [];
    const startHeights = [];
    const targetHeights = [];
    const hoveredDatumIdsBySource = new Map();

    let barsMesh = null;
    let dataset = null;
    let displayMax = DISPLAY_MAX_STEP;
    let loadStatus = 'loading';
    let selectedYear = null;
    let selectedDatumId = null;
    let pendingSceneState = getEmptySceneState();
    let currentHoveredDatumId = null;
    let animationElapsed = chart.animationDuration;
    let barMatrixDirty = false;
    let xrDragSource = null;
    let xrPanelNeedsReanchor = false;

    let desktopPanelNode = null;
    let desktopYearValue = null;
    let desktopSlider = null;
    let desktopStatusValue = null;
    let desktopSelectionValue = null;
    let desktopCitationValue = null;

    const stageMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.platformColor,
        emissive: chart.platformEmissive,
        roughness: 0.92,
        metalness: 0.06,
      } ),
    );
    scaffoldRoot.add( stageMesh );

    const countryRailMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.countryRailColor,
        emissive: chart.countryRailEmissive,
        roughness: 0.9,
        metalness: 0.06,
      } ),
    );
    scaffoldRoot.add( countryRailMesh );

    const sourceRailMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.sourceRailColor,
        emissive: chart.sourceRailEmissive,
        roughness: 0.9,
        metalness: 0.06,
      } ),
    );
    scaffoldRoot.add( sourceRailMesh );

    const yAxisSpineMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.yAxisColor,
        emissive: chart.yAxisEmissive,
        roughness: 0.62,
        metalness: 0.14,
      } ),
    );
    scaffoldRoot.add( yAxisSpineMesh );

    const highlightMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshBasicMaterial( {
        color: chart.highlightColor,
        wireframe: true,
        transparent: true,
        opacity: chart.highlightOpacity,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    highlightMesh.visible = false;
    chartRoot.add( highlightMesh );

    const tooltipSprite = createTextSprite( {
      ...labelStyles.tooltip,
      text: '',
    } );
    tooltipSprite.sprite.visible = false;
    labelRoot.add( tooltipSprite.sprite );

    const panelBackground = createTrackedMesh(
      trackedMeshes,
      new THREE.PlaneGeometry( xrPanel.width, xrPanel.height ),
      new THREE.MeshStandardMaterial( {
        color: xrPanel.backgroundColor,
        emissive: xrPanel.backgroundEmissive,
        transparent: true,
        opacity: xrPanel.backgroundOpacity,
        roughness: 0.86,
        metalness: 0.06,
        side: THREE.DoubleSide,
      } ),
    );
    xrPanelRoot.add( panelBackground );

    const panelEdge = createTrackedMesh(
      trackedMeshes,
      new THREE.PlaneGeometry( xrPanel.width - 0.018, xrPanel.height - 0.018 ),
      new THREE.MeshBasicMaterial( {
        color: xrPanel.edgeColor,
        transparent: true,
        opacity: xrPanel.edgeOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      } ),
    );
    panelEdge.position.z = 0.002;
    xrPanelRoot.add( panelEdge );

    createTrackedTextSprite(
      labelCollections.panel,
      xrPanelRoot,
      {
        ...labelStyles.panelTitle,
        text: 'ENERGY YEAR',
      },
      new THREE.Vector3( 0, xrPanel.titleY, xrPanel.contentZ ),
    );
    const panelYearSprite = createTrackedTextSprite(
      labelCollections.panel,
      xrPanelRoot,
      {
        ...labelStyles.panelYear,
        text: '--',
      },
      new THREE.Vector3( 0, xrPanel.yearY, xrPanel.contentZ ),
    );
    const panelHelperSprite = createTrackedTextSprite(
      labelCollections.panel,
      xrPanelRoot,
      {
        ...labelStyles.panelHelper,
        text: 'Loading energy dataset...',
      },
      new THREE.Vector3( 0, xrPanel.helperY, xrPanel.contentZ ),
    );
    const panelMinYearSprite = createTrackedTextSprite(
      labelCollections.panel,
      xrPanelRoot,
      {
        ...labelStyles.panelRange,
        text: '--',
      },
      new THREE.Vector3( - xrPanel.sliderTrackLength * 0.5, xrPanel.rangeLabelY, xrPanel.contentZ ),
    );
    const panelMaxYearSprite = createTrackedTextSprite(
      labelCollections.panel,
      xrPanelRoot,
      {
        ...labelStyles.panelRange,
        text: '--',
      },
      new THREE.Vector3( xrPanel.sliderTrackLength * 0.5, xrPanel.rangeLabelY, xrPanel.contentZ ),
    );

    const sliderTrack = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: xrPanel.sliderTrackColor,
        emissive: xrPanel.sliderTrackEmissive,
        roughness: 0.74,
        metalness: 0.12,
      } ),
    );
    sliderTrack.scale.set( xrPanel.sliderTrackLength, xrPanel.sliderTrackHeight, xrPanel.sliderTrackDepth );
    sliderTrack.position.set( 0, xrPanel.trackY, 0.014 );
    xrPanelRoot.add( sliderTrack );

    const sliderFill = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: xrPanel.sliderFillColor,
        emissive: xrPanel.sliderFillEmissive,
        roughness: 0.48,
        metalness: 0.08,
      } ),
    );
    sliderFill.position.set( - xrPanel.sliderTrackLength * 0.5, xrPanel.trackY, 0.018 );
    xrPanelRoot.add( sliderFill );

    const sliderKnob = createTrackedMesh(
      trackedMeshes,
      new THREE.CylinderGeometry(
        xrPanel.sliderKnobRadius,
        xrPanel.sliderKnobRadius,
        xrPanel.sliderKnobDepth,
        24,
      ),
      new THREE.MeshStandardMaterial( {
        color: xrPanel.sliderKnobColor,
        emissive: xrPanel.sliderKnobEmissive,
        roughness: 0.34,
        metalness: 0.08,
      } ),
    );
    sliderKnob.rotation.z = Math.PI * 0.5;
    sliderKnob.position.set( - xrPanel.sliderTrackLength * 0.5, xrPanel.trackY, 0.028 );
    xrPanelRoot.add( sliderKnob );
    xrPanelRoot.visible = false;

    function getChartWidth() {

      return Math.max( 0, ( dataset?.countries.length - 1 || 0 ) * chart.countrySpacing );

    }

    function getChartDepth() {

      return Math.max( 0, ( dataset?.sources.length - 1 || 0 ) * chart.sourceSpacing );

    }

    function getDisplayTickValues() {

      return Array.from( { length: DISPLAY_TICK_COUNT }, ( _, index ) => {

        const ratio = index / ( DISPLAY_TICK_COUNT - 1 );
        const rawValue = displayMax * ratio;
        return index === 0
          ? 0
          : Math.round( rawValue / 1000 ) * 1000;

      } );

    }

    function getIndexForYear( year ) {

      const index = dataset?.years.indexOf( year ) ?? - 1;
      return index >= 0 ? index : 0;

    }

    function getSliderRatioForYear( year ) {

      if ( ! dataset || dataset.years.length <= 1 ) {

        return 0;

      }

      return getIndexForYear( year ) / ( dataset.years.length - 1 );

    }

    function getBarHeightForValue( value ) {

      return Math.max(
        value > 0 ? 0.03 : 0.01,
        value / displayMax * chart.maxBarHeight,
      );

    }

    function getDatumForId( datumId ) {

      const parsedDatumId = parseDatumId( datumId );
      const entry = datumEntryById.get( datumId );

      if ( ! parsedDatumId || ! entry || ! dataset ) {

        return null;

      }

      return {
        datumId,
        country: parsedDatumId.country,
        source: parsedDatumId.source,
        value: dataset.getValue( selectedYear, parsedDatumId.country, parsedDatumId.source ),
        ...entry,
      };

    }

    function getActiveDatum() {

      return getDatumForId( currentHoveredDatumId ) || getDatumForId( selectedDatumId );

    }

    function clearLabelCollection( collectionName ) {

      labelCollections[ collectionName ].splice( 0 ).forEach( ( controller ) => {

        controller.sprite.removeFromParent();
        controller.dispose();

      } );

    }

    function clearChartLabels() {

      clearLabelCollection( 'countries' );
      clearLabelCollection( 'sources' );
      clearLabelCollection( 'axes' );
      clearLabelCollection( 'ticks' );

    }

    function clearTickMeshes() {

      tickMeshes.splice( 0 ).forEach( ( mesh ) => {

        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();

      } );

    }

    function updateTooltipAndHighlight() {

      const activeDatum = getActiveDatum();

      if ( ! activeDatum ) {

        highlightMesh.visible = false;
        tooltipSprite.sprite.visible = false;
        return;

      }

      const currentHeight = currentHeights[ activeDatum.instanceIndex ] ?? 0.01;
      highlightMesh.visible = true;
      highlightMesh.position.set(
        activeDatum.x,
        chart.barBaseY + currentHeight * 0.5,
        activeDatum.z,
      );
      highlightMesh.scale.set(
        chart.barWidth + chart.highlightPaddingX,
        currentHeight + chart.highlightPaddingY,
        chart.barDepth + chart.highlightPaddingZ,
      );

      tooltipSprite.setText(
        `${activeDatum.country}\n${activeDatum.source}\n${selectedYear} · ${formatValue( activeDatum.value, dataset.unit )}`,
      );
      tooltipSprite.sprite.visible = true;
      tooltipSprite.sprite.position.set(
        activeDatum.x,
        chart.barBaseY + currentHeight + 0.2,
        activeDatum.z,
      );

    }

    function updateHoveredDatumFromSource( source, datumId ) {

      if ( datumId ) {

        hoveredDatumIdsBySource.delete( source );
        hoveredDatumIdsBySource.set( source, datumId );

      } else {

        hoveredDatumIdsBySource.delete( source );

      }

      const nextHoveredDatumId = [ ...hoveredDatumIdsBySource.values() ].at( - 1 ) ?? null;

      if ( nextHoveredDatumId === currentHoveredDatumId ) {

        return;

      }

      currentHoveredDatumId = nextHoveredDatumId;
      updateTooltipAndHighlight();

    }

    function updateDesktopSelectionText() {

      if ( ! desktopSelectionValue ) {

        return;

      }

      const pinnedDatum = getDatumForId( selectedDatumId );

      if ( ! pinnedDatum ) {

        desktopSelectionValue.textContent = 'Hover for a quick tooltip or pin a bar to keep a country-source value in focus.';
        return;

      }

      desktopSelectionValue.textContent = `${pinnedDatum.country} · ${pinnedDatum.source} · ${selectedYear} · ${formatValue( pinnedDatum.value, dataset.unit )}`;

    }

    function updatePanelVisualState() {

      const isHovered = panelHoverSources.size > 0 || sliderHoverSources.size > 0 || xrDragSource !== null;

      panelBackground.material.emissive.setHex( isHovered ? 0x0d1b29 : xrPanel.backgroundEmissive );
      panelEdge.material.color.setHex( isHovered ? xrPanel.hoverAccentColor : xrPanel.edgeColor );
      panelEdge.material.opacity = isHovered ? 0.28 : xrPanel.edgeOpacity;
      sliderTrack.material.emissive.setHex( sliderHoverSources.size > 0 || xrDragSource !== null ? 0x17344d : xrPanel.sliderTrackEmissive );
      sliderFill.material.emissive.setHex( sliderHoverSources.size > 0 || xrDragSource !== null ? 0x1b5e82 : xrPanel.sliderFillEmissive );
      sliderKnob.scale.setScalar( sliderHoverSources.size > 0 || xrDragSource !== null ? 1.08 : 1 );

    }

    function updateXRPanelText() {

      if ( loadStatus === 'error' ) {

        panelYearSprite.setText( 'LOAD FAILED' );
        panelHelperSprite.setText( 'Check the local OWID files and reload.' );
        panelMinYearSprite.setText( '--' );
        panelMaxYearSprite.setText( '--' );
        return;

      }

      if ( ! dataset ) {

        panelYearSprite.setText( '--' );
        panelHelperSprite.setText( 'Loading energy dataset...' );
        panelMinYearSprite.setText( '--' );
        panelMaxYearSprite.setText( '--' );
        return;

      }

      panelYearSprite.setText( String( selectedYear ) );
      panelMinYearSprite.setText( String( dataset.years[ 0 ] ) );
      panelMaxYearSprite.setText( String( dataset.years.at( - 1 ) ) );

      const pinnedDatum = getDatumForId( selectedDatumId );
      panelHelperSprite.setText(
        pinnedDatum
          ? `${pinnedDatum.country} · ${pinnedDatum.source}`
          : 'Point and drag the slider to scrub years.',
      );

    }

    function updateDesktopPanel() {

      if ( ! desktopYearValue || ! desktopSlider || ! desktopStatusValue || ! desktopCitationValue ) {

        return;

      }

      if ( loadStatus === 'error' ) {

        desktopYearValue.textContent = 'Dataset unavailable';
        desktopStatusValue.textContent = 'Example 1 failed to load. Check the local OWID dataset files.';
        desktopSlider.disabled = true;
        desktopCitationValue.textContent = 'No citation available because the metadata request failed.';
        updateDesktopSelectionText();
        return;

      }

      if ( ! dataset ) {

        desktopYearValue.textContent = 'Loading dataset...';
        desktopStatusValue.textContent = 'Fetching the OWID CSV and metadata for the chart.';
        desktopSlider.disabled = true;
        desktopCitationValue.textContent = 'Loading citation...';
        updateDesktopSelectionText();
        return;

      }

      desktopSlider.disabled = false;
      desktopSlider.min = '0';
      desktopSlider.max = String( dataset.years.length - 1 );
      desktopSlider.step = '1';
      desktopSlider.value = String( getIndexForYear( selectedYear ) );
      desktopYearValue.textContent = `Showing ${selectedYear}`;
      desktopStatusValue.textContent = `Y-axis display max: ${formatCompactTick( displayMax )} ${dataset.unit} / person`;
      desktopCitationValue.textContent = dataset.citation;
      updateDesktopSelectionText();

    }

    function syncXRSliderKnob() {

      if ( ! dataset || loadStatus === 'error' ) {

        sliderFill.visible = false;
        sliderKnob.position.x = - xrPanel.sliderTrackLength * 0.5;
        return;

      }

      const ratio = THREE.MathUtils.clamp( getSliderRatioForYear( selectedYear ), 0, 1 );
      const knobX = THREE.MathUtils.lerp(
        - xrPanel.sliderTrackLength * 0.5,
        xrPanel.sliderTrackLength * 0.5,
        ratio,
      );
      const fillWidth = Math.max( 0.001, xrPanel.sliderTrackLength * ratio );

      sliderFill.visible = true;
      sliderKnob.position.x = knobX;
      sliderFill.scale.set( fillWidth, xrPanel.sliderTrackHeight * 0.74, xrPanel.sliderTrackDepth * 0.72 );
      sliderFill.position.x = - xrPanel.sliderTrackLength * 0.5 + fillWidth * 0.5;

    }

    function updateBarsImmediatelyFromCurrentHeights() {

      if ( ! barsMesh ) {

        return;

      }

      for ( let index = 0; index < datumEntries.length; index += 1 ) {

        const entry = datumEntries[ index ];
        const height = currentHeights[ index ] ?? 0.01;
        tempObject.position.set(
          entry.x,
          chart.barBaseY + height * 0.5,
          entry.z,
        );
        tempObject.scale.set( chart.barWidth, height, chart.barDepth );
        tempObject.updateMatrix();
        barsMesh.setMatrixAt( index, tempObject.matrix );

      }

      barsMesh.instanceMatrix.needsUpdate = true;
      barMatrixDirty = false;

    }

    function applyTargetHeightsForYear( year ) {

      if ( ! dataset ) {

        return;

      }

      for ( let index = 0; index < datumEntries.length; index += 1 ) {

        const entry = datumEntries[ index ];
        startHeights[ index ] = currentHeights[ index ] ?? 0.01;
        targetHeights[ index ] = getBarHeightForValue(
          dataset.getValue( year, entry.country, entry.source ),
        );

      }

      animationElapsed = 0;
      barMatrixDirty = true;

    }

    function setSelectedDatumId( nextDatumId, { source = 'scene', shouldLog = true } = {} ) {

      const normalizedDatumId = typeof nextDatumId === 'string' ? nextDatumId : null;

      if ( normalizedDatumId === selectedDatumId ) {

        return;

      }

      selectedDatumId = normalizedDatumId;
      updateDesktopSelectionText();
      updateXRPanelText();
      updateTooltipAndHighlight();

      if ( shouldLog ) {

        const parsedDatum = parseDatumId( normalizedDatumId );
        context.recordSceneStateChange( {
          source,
          label: parsedDatum
            ? `Select ${parsedDatum.country} ${parsedDatum.source}`
            : 'Clear Example 1 Selection',
        } );

      }

    }

    function setSelectedYear( nextYear, {
      source = 'scene',
      shouldLog = true,
      animate = true,
    } = {} ) {

      if ( ! dataset || ! Number.isFinite( nextYear ) || ! dataset.years.includes( nextYear ) ) {

        return;

      }

      if ( nextYear === selectedYear ) {

        return;

      }

      selectedYear = nextYear;

      if ( animate ) {

        applyTargetHeightsForYear( nextYear );

      } else {

        for ( let index = 0; index < datumEntries.length; index += 1 ) {

          const entry = datumEntries[ index ];
          const height = getBarHeightForValue(
            dataset.getValue( nextYear, entry.country, entry.source ),
          );
          currentHeights[ index ] = height;
          startHeights[ index ] = height;
          targetHeights[ index ] = height;

        }

        updateBarsImmediatelyFromCurrentHeights();

      }

      updateDesktopPanel();
      updateXRPanelText();
      syncXRSliderKnob();
      updateTooltipAndHighlight();

      if ( shouldLog ) {

        context.recordSceneStateChange( {
          source,
          label: `Change Example 1 Year To ${nextYear}`,
        } );

      }

    }

    function clearChartGeometry() {

      if ( barsMesh ) {

        context.unregisterRaycastTarget( barsMesh );
        barsMesh.removeFromParent();
        barsMesh.geometry.dispose();
        barsMesh.material.dispose();
        barsMesh = null;

      }

      datumEntries.splice( 0 );
      datumEntryById.clear();
      currentHeights.length = 0;
      startHeights.length = 0;
      targetHeights.length = 0;
      clearTickMeshes();
      clearChartLabels();
      hoveredDatumIdsBySource.clear();
      currentHoveredDatumId = null;
      highlightMesh.visible = false;
      tooltipSprite.sprite.visible = false;

    }

    function buildChart() {

      if ( ! dataset ) {

        return;

      }

      clearChartGeometry();
      displayMax = roundUpToStep( dataset.maxValue, DISPLAY_MAX_STEP );

      const chartWidth = getChartWidth();
      const chartDepth = getChartDepth();
      const stageWidth = chartWidth + chart.platformPaddingX;
      const stageDepth = chartDepth + chart.platformPaddingZ;
      const countryRailZ = chartDepth * 0.5 + chart.countryRailOffsetZ;
      const sourceRailX = - chartWidth * 0.5 - chart.sourceRailOffsetX;
      const yAxisX = chartWidth * 0.5 + chart.yAxisOffsetX;
      const yAxisZ = chartDepth * 0.5 + chart.yAxisOffsetZ;

      stageMesh.scale.set( stageWidth, chart.platformHeight, stageDepth );
      stageMesh.position.set( 0, chart.platformHeight * 0.5, 0 );

      countryRailMesh.scale.set(
        chartWidth + 0.92,
        chart.countryRailHeight,
        chart.countryRailDepth,
      );
      countryRailMesh.position.set(
        0,
        chart.platformHeight + chart.countryRailHeight * 0.5,
        countryRailZ,
      );

      sourceRailMesh.scale.set(
        chart.sourceRailWidth,
        chart.sourceRailHeight,
        chartDepth + 0.84,
      );
      sourceRailMesh.position.set(
        sourceRailX,
        chart.platformHeight + chart.sourceRailHeight * 0.5,
        0,
      );

      yAxisSpineMesh.scale.set(
        chart.yAxisWidth,
        chart.maxBarHeight + 0.14,
        chart.yAxisDepth,
      );
      yAxisSpineMesh.position.set(
        yAxisX,
        chart.barBaseY + chart.maxBarHeight * 0.5,
        yAxisZ,
      );

      const geometry = new THREE.BoxGeometry( 1, 1, 1 );
      const material = new THREE.MeshStandardMaterial( {
        color: 0xffffff,
        roughness: 0.32,
        metalness: 0.08,
      } );
      barsMesh = new THREE.InstancedMesh(
        geometry,
        material,
        dataset.countries.length * dataset.sources.length,
      );
      barsMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
      barsMesh.castShadow = true;
      barsMesh.receiveShadow = true;
      chartRoot.add( barsMesh );

      let instanceIndex = 0;

      dataset.countries.forEach( ( country, countryIndex ) => {

        const x = countryIndex * chart.countrySpacing - chartWidth * 0.5;

        createTrackedTextSprite(
          labelCollections.countries,
          labelRoot,
          {
            ...labelStyles.country,
            text: country,
          },
          new THREE.Vector3(
            x,
            chart.platformHeight + chart.countryRailHeight + 0.04,
            countryRailZ + 0.18,
          ),
        );

        dataset.sources.forEach( ( source, sourceIndex ) => {

          if ( countryIndex === 0 ) {

            const zLabel = sourceIndex * chart.sourceSpacing - chartDepth * 0.5;

            createTrackedTextSprite(
              labelCollections.sources,
              labelRoot,
              {
                ...labelStyles.source,
                text: source,
              },
              new THREE.Vector3(
                sourceRailX - 0.25,
                chart.platformHeight + chart.sourceRailHeight + 0.12,
                zLabel,
              ),
            );

          }

          const z = sourceIndex * chart.sourceSpacing - chartDepth * 0.5;
          const datumId = buildDatumId( country, source );
          const color = new THREE.Color( EXAMPLE1_SOURCE_COLORS[ source ] );
          const entry = {
            datumId,
            country,
            source,
            instanceIndex,
            x,
            z,
          };

          datumEntries.push( entry );
          datumEntryById.set( datumId, entry );
          barsMesh.setColorAt( instanceIndex, color );
          currentHeights[ instanceIndex ] = 0.01;
          startHeights[ instanceIndex ] = 0.01;
          targetHeights[ instanceIndex ] = 0.01;
          instanceIndex += 1;

        } );

      } );

      if ( barsMesh.instanceColor ) {

        barsMesh.instanceColor.needsUpdate = true;

      }

      createTrackedTextSprite(
        labelCollections.axes,
        labelRoot,
        {
          ...labelStyles.axisCaption,
          text: 'COUNTRIES',
        },
        new THREE.Vector3( 0, 0.48, countryRailZ + 0.4 ),
      );

      createTrackedTextSprite(
        labelCollections.axes,
        labelRoot,
        {
          ...labelStyles.axisCaption,
          text: 'ENERGY SOURCES',
        },
        new THREE.Vector3( sourceRailX - 0.34, 0.58, 0 ),
      );

      createTrackedTextSprite(
        labelCollections.axes,
        labelRoot,
        {
          ...labelStyles.axisCaption,
          text: 'PER-CAPITA ENERGY',
        },
        new THREE.Vector3( yAxisX + 0.36, chart.maxBarHeight + 0.42, yAxisZ ),
      );

      createTrackedTextSprite(
        labelCollections.axes,
        labelRoot,
        {
          ...labelStyles.axisUnit,
          text: `${dataset.unit} / person`,
        },
        new THREE.Vector3( yAxisX + 0.3, chart.maxBarHeight + 0.2, yAxisZ ),
      );

      getDisplayTickValues().forEach( ( tickValue ) => {

        const tickHeight = chart.barBaseY + tickValue / displayMax * chart.maxBarHeight;
        const tickMesh = new THREE.Mesh(
          new THREE.BoxGeometry( chart.yAxisTickLength, chart.yAxisTickHeight, chart.yAxisTickDepth ),
          new THREE.MeshStandardMaterial( {
            color: chart.yAxisTickColor,
            emissive: 0x14263a,
            roughness: 0.6,
            metalness: 0.16,
          } ),
        );
        tickMesh.position.set(
          yAxisX - chart.yAxisTickLength * 0.5,
          tickHeight,
          yAxisZ,
        );
        chartRoot.add( tickMesh );
        tickMeshes.push( tickMesh );

        createTrackedTextSprite(
          labelCollections.ticks,
          labelRoot,
          {
            ...labelStyles.tick,
            text: formatCompactTick( tickValue ),
          },
          new THREE.Vector3(
            yAxisX - chart.yAxisTickLength - 0.06,
            tickHeight,
            yAxisZ,
          ),
        );

      } );

      context.registerRaycastTarget( barsMesh, {
        onHoverChange( payload ) {

          const datumId = payload.isHovered && Number.isInteger( payload.instanceId )
            ? datumEntries[ payload.instanceId ]?.datumId ?? null
            : null;
          updateHoveredDatumFromSource( payload.source, datumId );

        },
        onSelectStart( payload ) {

          if ( Number.isInteger( payload.instanceId ) ) {

            setSelectedDatumId( datumEntries[ payload.instanceId ]?.datumId ?? null, {
              source: payload.source,
              shouldLog: true,
            } );

          }

        },
      } );

      setSelectedYear( pendingSceneState.selectedYear ?? dataset.initialYear, {
        source: 'scene-init',
        shouldLog: false,
        animate: false,
      } );
      setSelectedDatumId( pendingSceneState.selectedDatumId, {
        source: 'scene-init',
        shouldLog: false,
      } );
      updateDesktopPanel();
      updateXRPanelText();
      syncXRSliderKnob();
      updateTooltipAndHighlight();

    }

    function updateYearFromXRRay( rayOrigin, rayDirection, source ) {

      if ( ! dataset ) {

        return;

      }

      sliderTrack.updateMatrixWorld( true );
      sliderTrack.getWorldPosition( tempVector );
      sliderTrack.getWorldQuaternion( tempQuaternion );

      tempDirection.set( 0, 0, 1 ).applyQuaternion( tempQuaternion );
      sliderPlane.setFromNormalAndCoplanarPoint( tempDirection, tempVector );

      const ray = new THREE.Ray( rayOrigin.clone(), rayDirection.clone() );

      if ( ! ray.intersectPlane( sliderPlane, sliderIntersection ) ) {

        return;

      }

      const localPoint = sliderTrack.worldToLocal( sliderIntersection.clone() );
      const ratio = THREE.MathUtils.clamp(
        localPoint.x / xrPanel.sliderTrackLength + 0.5,
        0,
        1,
      );
      const nextIndex = Math.round( ratio * ( dataset.years.length - 1 ) );
      const nextYear = dataset.years[ nextIndex ];
      setSelectedYear( nextYear, { source, shouldLog: true, animate: true } );

    }

    function buildDesktopPanel() {

      desktopPanelNode = document.createElement( 'section' );
      desktopPanelNode.className = 'scene-panel-card';
      desktopPanelNode.setAttribute( 'style', desktopPanel.root );

      desktopPanelNode.appendChild(
        createStyledElement( 'p', desktopPanel.eyebrow, 'Scene 1 · Semantic Replay' ),
      );
      desktopPanelNode.appendChild(
        createStyledElement( 'h2', desktopPanel.title, 'Per capita primary energy consumption by source' ),
      );
      desktopPanelNode.appendChild(
        createStyledElement(
          'p',
          desktopPanel.body,
          'Explore how a single year reshapes the 3D country-by-source energy matrix. Hover or pin a bar to inspect one country-source pair in detail.',
        ),
      );

      desktopPanelNode.appendChild(
        createStyledElement( 'p', desktopPanel.sectionLabel, 'Year' ),
      );
      desktopYearValue = createStyledElement( 'p', desktopPanel.heroValue, 'Loading dataset...' );
      desktopPanelNode.appendChild( desktopYearValue );

      desktopStatusValue = createStyledElement( 'p', desktopPanel.status, 'Fetching the OWID dataset.' );
      desktopPanelNode.appendChild( desktopStatusValue );

      desktopSlider = document.createElement( 'input' );
      desktopSlider.type = 'range';
      desktopSlider.disabled = true;
      desktopSlider.setAttribute( 'style', desktopPanel.slider );
      desktopSlider.addEventListener( 'input', () => {

        if ( ! dataset ) {

          return;

        }

        const nextIndex = Number.parseInt( desktopSlider.value, 10 );
        const nextYear = dataset.years[ nextIndex ];
        setSelectedYear( nextYear, {
          source: 'desktop-year-slider',
          shouldLog: true,
          animate: true,
        } );

      } );
      desktopPanelNode.appendChild( desktopSlider );

      desktopPanelNode.appendChild(
        createStyledElement( 'p', desktopPanel.sectionLabel, 'Pinned Selection' ),
      );
      desktopSelectionValue = createStyledElement( 'p', desktopPanel.detail, 'Hover for a quick tooltip or pin a bar to keep it in focus.' );
      desktopPanelNode.appendChild( desktopSelectionValue );

      desktopPanelNode.appendChild(
        createStyledElement( 'p', desktopPanel.sectionLabel, 'Source' ),
      );
      desktopCitationValue = createStyledElement( 'p', desktopPanel.detail, 'Loading citation...' );
      desktopPanelNode.appendChild( desktopCitationValue );

      context.setDesktopPanelNode( desktopPanelNode );

    }

    function updatePanelAnchorTarget() {

      context.camera.updateMatrixWorld( true );
      context.camera.getWorldPosition( tempVector );
      context.camera.getWorldDirection( tempForward );
      context.camera.getWorldQuaternion( tempQuaternion );

      tempForward.y = 0;
      if ( tempForward.lengthSq() < 1e-6 ) {

        tempForward.set( 0, 0, - 1 );

      } else {

        tempForward.normalize();

      }

      tempRight.set( 1, 0, 0 ).applyQuaternion( tempQuaternion );
      tempRight.y = 0;
      if ( tempRight.lengthSq() < 1e-6 ) {

        tempRight.set( 1, 0, 0 );

      } else {

        tempRight.normalize();

      }

      tempLeft.copy( tempRight ).multiplyScalar( - 1 );

      tempVector2.copy( tempVector )
        .addScaledVector( tempForward, xrPanel.anchor.forward )
        .addScaledVector( tempLeft, xrPanel.anchor.left );
      tempVector2.y = Math.max( 1.0, tempVector.y - xrPanel.anchor.down );

      tempLookTarget.copy( tempVector );
      tempLookTarget.y = tempVector2.y;

      tempObject.position.copy( tempVector2 );
      tempObject.lookAt( tempLookTarget );
      tempPanelTargetQuaternion.copy( tempObject.quaternion );

    }

    function needsPanelReanchor() {

      if ( context.getPresentationMode() === PRESENTATION_MODES.DESKTOP ) {

        return false;

      }

      context.camera.updateMatrixWorld( true );
      context.camera.getWorldPosition( tempVector );
      context.camera.getWorldDirection( tempForward );
      tempDirection.copy( xrPanelRoot.position ).sub( tempVector );

      const distance = tempDirection.length();

      if ( distance > xrPanel.anchor.maxDistance ) {

        return true;

      }

      tempForward.y = 0;
      tempDirection.y = 0;

      if ( tempForward.lengthSq() < 1e-6 || tempDirection.lengthSq() < 1e-6 ) {

        return false;

      }

      tempForward.normalize();
      tempDirection.normalize();
      context.camera.getWorldQuaternion( tempQuaternion );
      tempRight.set( 1, 0, 0 ).applyQuaternion( tempQuaternion );
      tempRight.y = 0;
      if ( tempRight.lengthSq() >= 1e-6 ) {

        tempRight.normalize();

      }
      tempLeft.copy( tempRight ).multiplyScalar( - 1 );

      tempVector3.copy( tempForward ).multiplyScalar( 0.78 ).addScaledVector( tempLeft, 0.52 ).normalize();
      const angle = tempVector3.angleTo( tempDirection );

      return angle > THREE.MathUtils.degToRad( xrPanel.anchor.maxAngleDeg );

    }

    function updateXRPanelAnchoring() {

      if ( context.getPresentationMode() === PRESENTATION_MODES.DESKTOP ) {

        xrPanelRoot.visible = false;
        return;

      }

      xrPanelRoot.visible = true;

      if ( xrPanelNeedsReanchor || needsPanelReanchor() ) {

        updatePanelAnchorTarget();
        xrPanelNeedsReanchor = true;

      }

      if ( ! xrPanelNeedsReanchor ) {

        return;

      }

      xrPanelRoot.position.lerp( tempVector2, xrPanel.anchor.snapLerp );
      xrPanelRoot.quaternion.slerp( tempPanelTargetQuaternion, xrPanel.anchor.snapLerp );

      if (
        xrPanelRoot.position.distanceToSquared( tempVector2 ) < 0.0004 &&
        xrPanelRoot.quaternion.angleTo( tempPanelTargetQuaternion ) < 0.01
      ) {

        xrPanelRoot.position.copy( tempVector2 );
        xrPanelRoot.quaternion.copy( tempPanelTargetQuaternion );
        xrPanelNeedsReanchor = false;

      }

    }

    function requestXRPanelReanchor( immediate = false ) {

      updatePanelAnchorTarget();
      xrPanelNeedsReanchor = ! immediate;

      if ( immediate ) {

        xrPanelRoot.position.copy( tempVector2 );
        xrPanelRoot.quaternion.copy( tempPanelTargetQuaternion );

      }

    }

    function clearPinnedSelection( source = 'scene-background' ) {

      setSelectedDatumId( null, { source, shouldLog: true } );

    }

    function loadDatasetIfNeeded() {

      if ( loadStatus !== 'loading' ) {

        return;

      }

      loadExample1Dataset().then( ( nextDataset ) => {

        dataset = nextDataset;
        loadStatus = 'ready';
        buildChart();
        updateDesktopPanel();
        updateXRPanelText();
        syncXRSliderKnob();

      } ).catch( ( error ) => {

        console.error( 'Example 1 dataset failed to load.', error );
        loadStatus = 'error';
        updateDesktopPanel();
        updateXRPanelText();
        syncXRSliderKnob();

      } );

    }

    function applySceneState( nextSceneState, options = {} ) {

      pendingSceneState = example1SceneDefinition.normalizeSceneState( nextSceneState, pendingSceneState );

      if ( ! dataset ) {

        return;

      }

      setSelectedYear( pendingSceneState.selectedYear ?? dataset.initialYear, {
        source: options.source || 'scene-state',
        shouldLog: options.shouldLog === true,
        animate: options.animate !== false,
      } );
      setSelectedDatumId( pendingSceneState.selectedDatumId, {
        source: options.source || 'scene-state',
        shouldLog: options.shouldLog === true,
      } );

    }

    const panelSurface = createSceneUiSurface( context, {
      parent: xrPanelRoot,
      width: xrPanel.width,
      height: xrPanel.height,
      position: [ 0, 0, xrPanel.surfacePanelZ ],
      name: 'example1-panel-surface',
      handlers: {
        onHoverChange( payload ) {

          if ( payload.isHovered ) {

            panelHoverSources.add( payload.source );

          } else {

            panelHoverSources.delete( payload.source );

          }

          updatePanelVisualState();

        },
      },
    } );
    uiSurfaces.push( panelSurface );

    const sliderSurfaceHandlers = {
      onHoverChange( payload ) {

        if ( payload.isHovered ) {

          sliderHoverSources.add( payload.source );

        } else {

          sliderHoverSources.delete( payload.source );

        }

        updatePanelVisualState();

      },
      onSelectStart( payload ) {

        xrDragSource = payload.source;
        updatePanelVisualState();
        updateYearFromXRRay( payload.rayOrigin, payload.rayDirection, payload.source );

      },
      onSelectMove( payload ) {

        if ( xrDragSource === payload.source ) {

          updateYearFromXRRay( payload.rayOrigin, payload.rayDirection, payload.source );

        }

      },
      onSelectEnd( payload ) {

        if ( xrDragSource === payload.source ) {

          xrDragSource = null;
          updatePanelVisualState();

        }

      },
    };

    const sliderSurface = createSceneUiSurface( context, {
      parent: xrPanelRoot,
      width: xrPanel.sliderTrackLength,
      height: xrPanel.sliderSurfaceHeight,
      position: [ 0, xrPanel.trackY, xrPanel.surfaceSliderZ ],
      name: 'example1-slider-surface',
      handlers: sliderSurfaceHandlers,
    } );
    uiSurfaces.push( sliderSurface );

    return {
      activate() {

        context.sceneContentRoot.add( root );
        buildDesktopPanel();
        updateDesktopPanel();
        updateXRPanelText();
        syncXRSliderKnob();
        loadDatasetIfNeeded();
        requestXRPanelReanchor( true );
        updatePanelVisualState();

      },
      dispose() {

        if ( barsMesh ) {

          context.unregisterRaycastTarget( barsMesh );
          barsMesh.geometry.dispose();
          barsMesh.material.dispose();

        }

        uiSurfaces.forEach( ( surface ) => surface.dispose() );
        clearTickMeshes();
        clearChartLabels();
        labelCollections.panel.splice( 0 ).forEach( ( controller ) => controller.dispose() );
        tooltipSprite.dispose();
        trackedMeshes.forEach( ( mesh ) => {

          mesh.removeFromParent();
          mesh.geometry?.dispose?.();
          mesh.material?.dispose?.();

        } );
        root.removeFromParent();
        context.clearDesktopPanel();

      },
      update( deltaSeconds ) {

        if ( dataset && animationElapsed < chart.animationDuration ) {

          animationElapsed = Math.min( chart.animationDuration, animationElapsed + deltaSeconds );
          const alpha = THREE.MathUtils.smoothstep(
            animationElapsed / chart.animationDuration,
            0,
            1,
          );

          for ( let index = 0; index < datumEntries.length; index += 1 ) {

            currentHeights[ index ] = THREE.MathUtils.lerp(
              startHeights[ index ],
              targetHeights[ index ],
              alpha,
            );

          }

          barMatrixDirty = true;

        }

        if ( barMatrixDirty ) {

          updateBarsImmediatelyFromCurrentHeights();
          updateTooltipAndHighlight();

        }

        updateXRPanelAnchoring();

      },
      getSceneStateForReplay() {

        return {
          selectedYear,
          selectedDatumId,
        };

      },
      applySceneStateFromReplay( sceneState ) {

        applySceneState( sceneState, {
          source: 'replay-scene',
          shouldLog: false,
          animate: true,
        } );

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

          return {
            title: 'Example 1 - Energy Matrix',
            body: 'Use the left-side floating year window to scrub through time, then point at bars to inspect country-source values.',
            note: 'Replay still stores only compact scene semantics such as `selectedYear` and the pinned datum id.',
          };

        }

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

          return {
            title: 'Example 1 - Energy Matrix',
            body: 'The chart stays world-anchored while the floating year panel remains comfortably near your left hand.',
            note: 'Authored panel surfaces register through the shared scene raycast pipeline, so pointer hits remain visible in live use and replay.',
          };

        }

        return {
          title: 'Example 1 - Energy Matrix',
          body: 'Use the desktop year slider to scrub through the OWID dataset, then hover or pin bars to inspect one country-source pair in detail.',
          note: 'This scene replays from compact semantic state instead of per-bar transforms.',
        };

      },
      onPresentationModeChange( presentationMode ) {

        xrPanelRoot.visible = presentationMode !== PRESENTATION_MODES.DESKTOP;
        xrDragSource = null;
        panelHoverSources.clear();
        sliderHoverSources.clear();
        updatePanelVisualState();

        if ( presentationMode !== PRESENTATION_MODES.DESKTOP ) {

          requestXRPanelReanchor( true );

        }

      },
      handleBackgroundSelect( payload ) {

        clearPinnedSelection( payload?.source || 'scene-background' );

      },
    };

  },
} );
