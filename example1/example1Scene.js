import * as THREE from 'three';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import {
  EXAMPLE1_SOURCE_COLORS,
  loadExample1Dataset,
} from './example1Data.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createFloatingOrbitPanel } from '../scenes/core/floatingOrbitPanel.js';
import { example1VisualConfig } from './example1VisualConfig.js';
import { example1LoggingConfig } from './example1LoggingConfig.js';

const PANEL_DEFAULT_POSITION = Object.freeze( [ 0, 1.25, - 0.9 ] );
const PANEL_DEFAULT_QUATERNION = Object.freeze( [ 0, 0, 0, 1 ] );

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function formatValue( value, unit ) {

  return `${new Intl.NumberFormat( 'en-US', { maximumFractionDigits: 0 } ).format( value )} ${unit} / person`;

}

function formatCompactTick( value ) {

  if ( value === 0 ) {

    return '0';

  }

  if ( value >= 1000 ) {

    return `${Math.round( value / 1000 )}k`;

  }

  return new Intl.NumberFormat( 'en-US', { maximumFractionDigits: 0 } ).format( value );

}

function calculateNiceTickStep( value, targetIntervals = 5 ) {

  const safeValue = Math.max( value, 1 );
  const roughStep = safeValue / Math.max( 1, targetIntervals );
  const power = 10 ** Math.floor( Math.log10( roughStep ) );
  const normalized = roughStep / power;

  if ( normalized <= 1 ) {

    return power;

  }

  if ( normalized <= 2 ) {

    return 2 * power;

  }

  if ( normalized <= 5 ) {

    return 5 * power;

  }

  return 10 * power;

}

function buildDisplayScale( maxValue ) {

  const tickStep = calculateNiceTickStep( maxValue, 5 );
  const displayMax = Math.max( tickStep, Math.ceil( maxValue / tickStep ) * tickStep );
  const tickValues = [];

  for ( let value = 0; value <= displayMax + tickStep * 0.5; value += tickStep ) {

    tickValues.push( value );

  }

  return { displayMax, tickValues };

}

function buildDatumId( country, source ) {

  return `${country}|${source}`;

}

function parseDatumId( datumId ) {

  if ( typeof datumId !== 'string' ) {

    return null;

  }

  const [ country, source ] = datumId.split( '|' );
  return country && source ? { country, source } : null;

}

function normalizePanelPosition( candidateValue, fallbackValue = null ) {

  const fallback = Array.isArray( fallbackValue ) ? fallbackValue : PANEL_DEFAULT_POSITION;

  if ( Array.isArray( candidateValue ) && candidateValue.length === 3 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ] ];

  }

  return fallback ? [ ...fallback ] : null;

}

function normalizePanelQuaternion( candidateValue, fallbackValue = null ) {

  const fallback = Array.isArray( fallbackValue ) ? fallbackValue : PANEL_DEFAULT_QUATERNION;

  if ( Array.isArray( candidateValue ) && candidateValue.length === 4 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ], candidateValue[ 3 ] ];

  }

  return fallback ? [ ...fallback ] : null;

}

function positionDistance( positionA, positionB ) {

  const dx = positionA[ 0 ] - positionB[ 0 ];
  const dy = positionA[ 1 ] - positionB[ 1 ];
  const dz = positionA[ 2 ] - positionB[ 2 ];

  return Math.sqrt( dx * dx + dy * dy + dz * dz );

}

function quaternionAngularDifferenceDeg( quaternionA, quaternionB ) {

  const dot =
    quaternionA[ 0 ] * quaternionB[ 0 ] +
    quaternionA[ 1 ] * quaternionB[ 1 ] +
    quaternionA[ 2 ] * quaternionB[ 2 ] +
    quaternionA[ 3 ] * quaternionB[ 3 ];
  const clampedDot = Math.min( 1, Math.max( - 1, Math.abs( dot ) ) );
  return 2 * Math.acos( clampedDot ) * 180 / Math.PI;

}

function getEmptySceneState( fallbackState = {} ) {

  return {
    selectedYear: Number.isFinite( fallbackState?.selectedYear ) ? fallbackState.selectedYear : null,
    selectedDatumId: typeof fallbackState?.selectedDatumId === 'string' ? fallbackState.selectedDatumId : null,
    panelPosition: normalizePanelPosition( fallbackState?.panelPosition, null ),
    panelQuaternion: normalizePanelQuaternion( fallbackState?.panelQuaternion, null ),
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
  collection.push( { object3D: controller.sprite, dispose: () => controller.dispose() } );
  return controller;

}

function createTrackedTextPlane( collection, parent, options, position, rotation = null ) {

  const controller = createTextPlane( options );
  controller.mesh.position.copy( position );

  if ( rotation ) {

    controller.mesh.rotation.copy( rotation );

  }

  parent.add( controller.mesh );
  collection.push( { object3D: controller.mesh, dispose: () => controller.dispose() } );
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
  loggingConfig: example1LoggingConfig,
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
      panelPosition: normalizePanelPosition( candidateState?.panelPosition, normalizePanelPosition( fallbackState?.panelPosition, null ) ),
      panelQuaternion: normalizePanelQuaternion( candidateState?.panelQuaternion, normalizePanelQuaternion( fallbackState?.panelQuaternion, null ) ),
    };

  },
  createScene( context ) {

    const { chart, xrPanel, desktopPanel, labelStyles } = example1VisualConfig;

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
    const tempDirection = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();
    const sliderPlane = new THREE.Plane();
    const sliderIntersection = new THREE.Vector3();
    const lastLoggedPanelPosition = new THREE.Vector3();
    const lastLoggedPanelQuaternion = new THREE.Quaternion();

    const panelHoverSources = new Set();
    const sliderHoverSources = new Set();
    const dragBarHoverSources = new Set();
    const countryLabelSprites = new Map();
    const sourceLabelSprites = new Map();
    const labelCollections = {
      countries: [],
      sources: [],
      axes: [],
      ticks: [],
      panelPlanes: [],
    };
    const trackedMeshes = [];
    const uiSurfaces = [];
    const datumEntries = [];
    const datumEntryById = new Map();
    const axisGuideMeshes = [];
    const currentHeights = [];
    const startHeights = [];
    const targetHeights = [];
    const hoveredDatumIdsBySource = new Map();

    let barsMesh = null;
    let dataset = null;
    let displayMax = 50000;
    let displayTickValues = [ 0, 10000, 20000, 30000, 40000, 50000 ];
    let loadStatus = 'loading';
    let selectedYear = null;
    let selectedDatumId = null;
    let pendingSceneState = getEmptySceneState();
    let currentHoveredDatumId = null;
    let hoverUpdateSequence = 0;
    let animationElapsed = chart.animationDuration;
    let barMatrixDirty = false;
    let xrSliderDragSource = null;
    let xrPanelDragSource = null;
    let panelPlacementInitialized = false;
    let lastPanelStateLogAt = 0;
    let yearCommitTimeoutId = null;
    let hasPendingYearCommit = false;
    let pendingYearCommitSource = null;
    let lastLoggedYearValue = null;

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
        roughness: 0.94,
        metalness: 0.04,
      } ),
    );
    scaffoldRoot.add( stageMesh );

    const countryRailMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.countryRailColor,
        emissive: chart.countryRailEmissive,
        roughness: 0.92,
        metalness: 0.05,
      } ),
    );
    scaffoldRoot.add( countryRailMesh );

    const sourceRailMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.sourceRailColor,
        emissive: chart.sourceRailEmissive,
        roughness: 0.92,
        metalness: 0.05,
      } ),
    );
    scaffoldRoot.add( sourceRailMesh );

    const yAxisSpineMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: chart.valueFinColor,
        emissive: chart.valueFinEmissive,
        roughness: 0.76,
        metalness: 0.08,
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
        roughness: 0.88,
        metalness: 0.05,
        side: THREE.DoubleSide,
      } ),
    );
    xrPanelRoot.add( panelBackground );

    const panelBodyInset = createTrackedMesh(
      trackedMeshes,
      new THREE.PlaneGeometry( xrPanel.width - 0.05, xrPanel.height - 0.08 ),
      new THREE.MeshBasicMaterial( {
        color: xrPanel.bodyInsetColor,
        transparent: true,
        opacity: xrPanel.bodyInsetOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      } ),
    );
    panelBodyInset.position.set( 0, - 0.02, 0.002 );
    xrPanelRoot.add( panelBodyInset );

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
    panelEdge.position.z = 0.003;
    xrPanelRoot.add( panelEdge );

    const titleBarMesh = createTrackedMesh(
      trackedMeshes,
      new THREE.PlaneGeometry( xrPanel.width - 0.05, xrPanel.titleBarHeight ),
      new THREE.MeshStandardMaterial( {
        color: xrPanel.titleBarColor,
        emissive: xrPanel.titleBarEmissive,
        roughness: 0.76,
        metalness: 0.08,
        side: THREE.DoubleSide,
      } ),
    );
    titleBarMesh.position.set( 0, xrPanel.titleY, 0.006 );
    xrPanelRoot.add( titleBarMesh );

    createTrackedTextPlane( labelCollections.panelPlanes, xrPanelRoot, { ...labelStyles.panelTitle, text: 'ENERGY YEAR' }, new THREE.Vector3( 0, xrPanel.titleY, xrPanel.contentZ ) );
    const panelYearText = createTrackedTextPlane( labelCollections.panelPlanes, xrPanelRoot, { ...labelStyles.panelYear, text: '--' }, new THREE.Vector3( 0, xrPanel.yearBadgeY, xrPanel.contentZ ) );
    const panelHelperText = createTrackedTextPlane( labelCollections.panelPlanes, xrPanelRoot, { ...labelStyles.panelHelper, text: 'Loading energy dataset...' }, new THREE.Vector3( 0, xrPanel.helperY, xrPanel.contentZ ) );
    const panelMinYearText = createTrackedTextPlane( labelCollections.panelPlanes, xrPanelRoot, { ...labelStyles.panelRange, text: '--' }, new THREE.Vector3( - xrPanel.sliderTrackLength * 0.5, xrPanel.rangeLabelY, xrPanel.contentZ ) );
    const panelMaxYearText = createTrackedTextPlane( labelCollections.panelPlanes, xrPanelRoot, { ...labelStyles.panelRange, text: '--' }, new THREE.Vector3( xrPanel.sliderTrackLength * 0.5, xrPanel.rangeLabelY, xrPanel.contentZ ) );

    const sliderTrack = createTrackedMesh(
      trackedMeshes,
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshStandardMaterial( {
        color: xrPanel.sliderTrackColor,
        emissive: xrPanel.sliderTrackEmissive,
        roughness: 0.76,
        metalness: 0.08,
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
        roughness: 0.5,
        metalness: 0.08,
      } ),
    );
    sliderFill.position.set( - xrPanel.sliderTrackLength * 0.5, xrPanel.trackY, 0.018 );
    xrPanelRoot.add( sliderFill );

    const sliderKnob = createTrackedMesh(
      trackedMeshes,
      new THREE.CylinderGeometry( xrPanel.sliderKnobRadius, xrPanel.sliderKnobRadius, xrPanel.sliderKnobDepth, 24 ),
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

    const orbitPanel = createFloatingOrbitPanel( context, {
      panelRoot: xrPanelRoot,
      panelInitialOffset: xrPanel.panelInitialOffset,
      panelInitialYawDeg: xrPanel.panelInitialYawDeg,
      orbitCenterMode: xrPanel.orbitCenterMode,
      dragMode: xrPanel.dragMode,
      faceOrbitCenter: xrPanel.faceOrbitCenter,
    } );

    function getInteractionPolicy() {

      return context.getInteractionPolicy?.() ?? null;

    }

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || {
        minIntervalMs: 0,
        positionEpsilon: 0,
        quaternionAngleThresholdDeg: 0,
        flushOnSelectionChange: false,
        flushOnYearChange: false,
        flushOnPanelDragEnd: false,
      };

    }

    function getExample1LoggingTuning() {

      return context.getLoggingConfig?.()?.example1 || {
        yearCommitDebounceMs: 0,
        panelDragIntermediateMinIntervalMs: getSceneStateLoggingConfig().minIntervalMs,
        stableLabels: {
          year: 'Change Example 1 Year',
          selectDatum: 'Select Example 1 Datum',
          clearSelection: 'Clear Example 1 Selection',
          movePanel: 'Move Example 1 Year Panel',
        },
      };

    }

    function getStableSceneLabel( key ) {

      return getExample1LoggingTuning().stableLabels?.[ key ] || {
        year: 'Change Example 1 Year',
        selectDatum: 'Select Example 1 Datum',
        clearSelection: 'Clear Example 1 Selection',
        movePanel: 'Move Example 1 Year Panel',
      }[ key ];

    }

    function isPanelDragEnabled() {

      const interactionPolicy = getInteractionPolicy();

      if ( ! interactionPolicy ) {

        return true;

      }

      return (
        interactionPolicy.canInteract !== false &&
        interactionPolicy.isAnalysisSession !== true &&
        interactionPolicy.hasReceivedReplayState !== true &&
        interactionPolicy.isApplyingReplayState !== true
      );

    }

    function syncPanelDragAvailability() {

      orbitPanel.setLocalDragEnabled( isPanelDragEnabled() );

    }

    function getCurrentPanelSceneState() {

      return orbitPanel.getPanelSceneState();

    }

    function rememberPanelTransformAsLogged( now = performance.now() ) {

      const nextState = getCurrentPanelSceneState();

      lastLoggedPanelPosition.fromArray( nextState.panelPosition );
      lastLoggedPanelQuaternion.fromArray( nextState.panelQuaternion );
      lastPanelStateLogAt = now;
      panelPlacementInitialized = true;
      pendingSceneState = {
        ...pendingSceneState,
        ...nextState,
      };

    }

    function applyPanelTransform( panelPosition, panelQuaternion ) {

      orbitPanel.applyWorldTransform(
        normalizePanelPosition( panelPosition, PANEL_DEFAULT_POSITION ),
        normalizePanelQuaternion( panelQuaternion, PANEL_DEFAULT_QUATERNION ),
      );
      rememberPanelTransformAsLogged();

    }

    function placePanelAtDefault() {

      orbitPanel.captureOrbitCenterFromCamera();
      orbitPanel.placeAtDefault();
      rememberPanelTransformAsLogged();

    }

    function ensurePanelPlacementForCurrentMode( { forceDefault = false } = {} ) {

      if ( context.getPresentationMode() === PRESENTATION_MODES.DESKTOP ) {

        return;

      }

      orbitPanel.captureOrbitCenterFromCamera();
      syncPanelDragAvailability();

      if ( forceDefault ) {

        placePanelAtDefault();
        return;

      }

      const nextPanelPosition = normalizePanelPosition( pendingSceneState?.panelPosition, null );
      const nextPanelQuaternion = normalizePanelQuaternion( pendingSceneState?.panelQuaternion, null );

      if ( nextPanelPosition && nextPanelQuaternion ) {

        applyPanelTransform( nextPanelPosition, nextPanelQuaternion );
        return;

      }

      if ( ! panelPlacementInitialized ) {

        placePanelAtDefault();
        return;

      }

      orbitPanel.syncOrbitFromCurrentTransform();

    }

    function recordPanelTransformIfNeeded( source, { force = false, flushImmediately = false } = {} ) {

      const loggingConfig = getSceneStateLoggingConfig();
      const example1Logging = getExample1LoggingTuning();
      const nextState = getCurrentPanelSceneState();
      const positionChanged = positionDistance( nextState.panelPosition, lastLoggedPanelPosition.toArray() ) > loggingConfig.positionEpsilon;
      const rotationChanged = quaternionAngularDifferenceDeg( nextState.panelQuaternion, lastLoggedPanelQuaternion.toArray() ) > loggingConfig.quaternionAngleThresholdDeg;
      const now = performance.now();
      const dragMinInterval = Number.isFinite( example1Logging.panelDragIntermediateMinIntervalMs )
        ? example1Logging.panelDragIntermediateMinIntervalMs
        : loggingConfig.minIntervalMs;

      if ( ! force ) {

        if ( ! positionChanged && ! rotationChanged ) {

          return false;

        }

        if ( now - lastPanelStateLogAt < Math.max( loggingConfig.minIntervalMs, dragMinInterval ) ) {

          return false;

        }

      }

      const didLog = context.recordSceneStateChange( {
        source,
        label: getStableSceneLabel( 'movePanel' ),
        flushImmediately,
      } );

      if ( didLog ) {

        rememberPanelTransformAsLogged( now );

      }

      return didLog;

    }

    function clearPendingYearCommitTimer() {

      if ( yearCommitTimeoutId !== null ) {

        clearTimeout( yearCommitTimeoutId );
        yearCommitTimeoutId = null;

      }

    }

    function commitYearChange( source, { flushImmediately = false, force = false } = {} ) {

      clearPendingYearCommitTimer();

      if ( ! Number.isFinite( selectedYear ) ) {

        hasPendingYearCommit = false;
        pendingYearCommitSource = null;
        return false;

      }

      if ( ! hasPendingYearCommit && ! force ) {

        return false;

      }

      if ( selectedYear === lastLoggedYearValue && ! hasPendingYearCommit ) {

        pendingYearCommitSource = null;
        return false;

      }

      if ( ! force && selectedYear === lastLoggedYearValue ) {

        hasPendingYearCommit = false;
        pendingYearCommitSource = null;
        return false;

      }

      hasPendingYearCommit = false;
      pendingYearCommitSource = null;

      const didLog = context.recordSceneStateChange( {
        source: source || 'scene',
        label: getStableSceneLabel( 'year' ),
        flushImmediately,
      } );

      if ( didLog ) {

        lastLoggedYearValue = selectedYear;

      }

      return didLog;

    }

    function scheduleYearCommit( source, { flushImmediately = false } = {} ) {

      const debounceMs = getExample1LoggingTuning().yearCommitDebounceMs;

      hasPendingYearCommit = true;
      pendingYearCommitSource = source;
      clearPendingYearCommitTimer();

      if ( ! Number.isFinite( debounceMs ) || debounceMs <= 0 ) {

        return commitYearChange( source, { flushImmediately } );

      }

      yearCommitTimeoutId = setTimeout( () => {

        commitYearChange( pendingYearCommitSource, { flushImmediately } );

      }, debounceMs );

      return false;

    }

    function flushYearCommit( source, { force = true } = {} ) {

      return commitYearChange( source || pendingYearCommitSource, {
        force,
        flushImmediately: true,
      } );

    }

    function getChartWidth() {

      return Math.max( 0, ( dataset?.countries.length - 1 || 0 ) * chart.countrySpacing );

    }

    function getChartDepth() {

      return Math.max( 0, ( dataset?.sources.length - 1 || 0 ) * chart.sourceSpacing );

    }

    function getDisplayTickValues() {

      return displayTickValues;

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

      return Math.max( value > 0 ? 0.03 : 0.01, value / displayMax * chart.maxBarHeight );

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

      labelCollections[ collectionName ].splice( 0 ).forEach( ( entry ) => {

        entry.object3D?.removeFromParent?.();
        entry.dispose?.();

      } );

    }

    function clearChartLabels() {

      clearLabelCollection( 'countries' );
      clearLabelCollection( 'sources' );
      clearLabelCollection( 'axes' );
      clearLabelCollection( 'ticks' );
      countryLabelSprites.clear();
      sourceLabelSprites.clear();

    }

    function clearTickMeshes() {

      axisGuideMeshes.splice( 0 ).forEach( ( mesh ) => {

        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();

      } );

    }

    function setSpriteOpacity( sprite, opacity ) {

      if ( ! sprite?.material ) {

        return;

      }

      sprite.material.opacity = opacity;
      sprite.material.needsUpdate = true;

    }

    function updateStaticLabelEmphasis() {

      const activeDatum = getActiveDatum();

      countryLabelSprites.forEach( ( sprite, country ) => {

        setSpriteOpacity( sprite, activeDatum && activeDatum.country === country ? 0.18 : 1 );

      } );

      sourceLabelSprites.forEach( ( sprite, source ) => {

        setSpriteOpacity( sprite, activeDatum && activeDatum.source === source ? 0.18 : 1 );

      } );

    }

    function resetHoverState( { updateVisuals = true } = {} ) {

      hoveredDatumIdsBySource.clear();
      currentHoveredDatumId = null;
      hoverUpdateSequence = 0;

      if ( updateVisuals ) {

        updateTooltipAndHighlight();

      }

    }

    function updateTooltipAndHighlight() {

      const activeDatum = getActiveDatum();

      if ( ! activeDatum ) {

        highlightMesh.visible = false;
        tooltipSprite.sprite.visible = false;
        updateStaticLabelEmphasis();
        return;

      }

      const currentHeight = currentHeights[ activeDatum.instanceIndex ] ?? 0.01;
      highlightMesh.visible = true;
      highlightMesh.position.set( activeDatum.x, chart.barBaseY + currentHeight * 0.5, activeDatum.z );
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
        activeDatum.x - Math.sign( activeDatum.x || 1 ) * 0.08,
        chart.barBaseY + currentHeight + 0.28,
        activeDatum.z - Math.sign( activeDatum.z || 1 ) * 0.08,
      );
      updateStaticLabelEmphasis();

    }

    function resolveHoveredDatumId() {

      return [ ...hoveredDatumIdsBySource.values() ]
        .sort( ( entryA, entryB ) => (
          entryB.sequence - entryA.sequence ||
          String( entryA.source ).localeCompare( String( entryB.source ) )
        ) )
        .at( 0 )?.datumId ?? null;

    }

    function updateHoveredDatumFromSource( source, datumId ) {

      if ( datumId ) {

        hoveredDatumIdsBySource.set( source, {
          source,
          datumId,
          sequence: hoverUpdateSequence += 1,
        } );

      } else {

        hoveredDatumIdsBySource.delete( source );

      }

      const nextHoveredDatumId = resolveHoveredDatumId();

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

      syncPanelDragAvailability();
      const isPanelHovered = panelHoverSources.size > 0 || sliderHoverSources.size > 0 || dragBarHoverSources.size > 0;
      const isSliderActive = sliderHoverSources.size > 0 || xrSliderDragSource !== null;
      const isDragActive = dragBarHoverSources.size > 0 || xrPanelDragSource !== null;

      panelBackground.material.emissive.setHex( isPanelHovered ? 0x0d1a28 : xrPanel.backgroundEmissive );
      panelEdge.material.color.setHex(
        xrPanelDragSource !== null ? xrPanel.dragAccentColor : ( isPanelHovered ? xrPanel.hoverAccentColor : xrPanel.edgeColor ),
      );
      panelEdge.material.opacity = xrPanelDragSource !== null ? 0.34 : ( isPanelHovered ? 0.24 : xrPanel.edgeOpacity );
      titleBarMesh.material.emissive.setHex(
        xrPanelDragSource !== null || isDragActive ? xrPanel.titleBarHoverEmissive : xrPanel.titleBarEmissive,
      );
      sliderTrack.material.emissive.setHex( isSliderActive ? 0x17344d : xrPanel.sliderTrackEmissive );
      sliderFill.material.emissive.setHex( isSliderActive ? 0x1a5777 : xrPanel.sliderFillEmissive );
      sliderKnob.scale.setScalar( isSliderActive ? 1.08 : 1 );

    }

    function updateXRPanelText() {

      if ( loadStatus === 'error' ) {

        panelYearText.setText( 'LOAD FAILED' );
        panelHelperText.setText( 'Check the local OWID files and reload.' );
        panelMinYearText.setText( '--' );
        panelMaxYearText.setText( '--' );
        return;

      }

      if ( ! dataset ) {

        panelYearText.setText( '--' );
        panelHelperText.setText( 'Loading energy dataset...' );
        panelMinYearText.setText( '--' );
        panelMaxYearText.setText( '--' );
        return;

      }

      panelYearText.setText( String( selectedYear ) );
      panelMinYearText.setText( String( dataset.years[ 0 ] ) );
      panelMaxYearText.setText( String( dataset.years.at( - 1 ) ) );

      const pinnedDatum = getDatumForId( selectedDatumId );
      panelHelperText.setText( pinnedDatum ? `${pinnedDatum.country} · ${pinnedDatum.source}` : 'Drag the slider to scrub years.' );

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
      const knobX = THREE.MathUtils.lerp( - xrPanel.sliderTrackLength * 0.5, xrPanel.sliderTrackLength * 0.5, ratio );
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
        tempObject.position.set( entry.x, chart.barBaseY + height * 0.5, entry.z );
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
        targetHeights[ index ] = getBarHeightForValue( dataset.getValue( year, entry.country, entry.source ) );

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
      pendingSceneState = {
        ...pendingSceneState,
        selectedDatumId,
      };
      if ( normalizedDatumId === null ) {

        resetHoverState( { updateVisuals: false } );

      }

      updateDesktopSelectionText();
      updateXRPanelText();
      updateTooltipAndHighlight();

      if ( shouldLog ) {

        context.recordSceneStateChange( {
          source,
          label: normalizedDatumId ? getStableSceneLabel( 'selectDatum' ) : getStableSceneLabel( 'clearSelection' ),
          flushImmediately: getSceneStateLoggingConfig().flushOnSelectionChange,
        } );

      }

    }

    function setSelectedYear( nextYear, { source = 'scene', shouldLog = true, animate = true } = {} ) {

      if ( ! dataset || ! Number.isFinite( nextYear ) || ! dataset.years.includes( nextYear ) ) {

        return;

      }

      if ( nextYear === selectedYear ) {

        return;

      }

      selectedYear = nextYear;
      pendingSceneState = {
        ...pendingSceneState,
        selectedYear,
      };

      if ( animate ) {

        applyTargetHeightsForYear( nextYear );

      } else {

        for ( let index = 0; index < datumEntries.length; index += 1 ) {

          const entry = datumEntries[ index ];
          const height = getBarHeightForValue( dataset.getValue( nextYear, entry.country, entry.source ) );
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

        scheduleYearCommit( source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnYearChange,
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
      resetHoverState( { updateVisuals: false } );
      highlightMesh.visible = false;
      tooltipSprite.sprite.visible = false;

    }

    function buildChart() {

      if ( ! dataset ) {

        return;

      }

      clearChartGeometry();

      const displayScale = buildDisplayScale( dataset.maxValue );
      displayMax = displayScale.displayMax;
      displayTickValues = displayScale.tickValues;

      const chartWidth = getChartWidth();
      const chartDepth = getChartDepth();
      const stageWidth = chartWidth + chart.platformPaddingX;
      const stageDepth = chartDepth + chart.platformPaddingZ;
      const countryRailZ = chartDepth * 0.5 + chart.countryRailOffsetZ;
      const sourceRailX = - chartWidth * 0.5 - chart.sourceRailOffsetX;
      const valueFinX = chartWidth * 0.5 + chart.valueFinOffsetX;
      const valueFinZ = chartDepth * 0.5 + chart.valueFinOffsetZ;
      const frontAxisPlaqueX = chartWidth * 0.5 + chart.frontAxisPlaqueOffsetX;
      const frontAxisPlaqueZ = chartDepth * 0.5 + chart.frontAxisPlaqueOffsetZ;
      const sliceWidth = Math.max( 0.9, chartWidth + chart.platformPaddingX - chart.slicePlaneInsetX );
      const sliceDepth = Math.max( 0.8, chartDepth + chart.platformPaddingZ - chart.slicePlaneInsetZ );
      const sliceLabelX = chartWidth * 0.5 - chart.sliceLabelRightInset;
      const sliceLabelZ = chartDepth * 0.5 - chart.sliceLabelFrontInset;

      stageMesh.scale.set( stageWidth, chart.platformHeight, stageDepth );
      stageMesh.position.set( 0, chart.platformHeight * 0.5, 0 );

      countryRailMesh.scale.set( chartWidth + 0.72, chart.countryRailHeight, chart.countryRailDepth );
      countryRailMesh.position.set( 0, chart.platformHeight + chart.countryRailHeight * 0.5, countryRailZ );

      sourceRailMesh.scale.set( chart.sourceRailWidth, chart.sourceRailHeight, chartDepth + 0.48 );
      sourceRailMesh.position.set( sourceRailX, chart.platformHeight + chart.sourceRailHeight * 0.5, 0 );

      yAxisSpineMesh.scale.set( chart.valueFinWidth, chart.maxBarHeight + 0.08, chart.valueFinDepth );
      yAxisSpineMesh.position.set( valueFinX, chart.barBaseY + chart.maxBarHeight * 0.5, valueFinZ );

      barsMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry( 1, 1, 1 ),
        new THREE.MeshStandardMaterial( {
          color: 0xffffff,
          roughness: 0.42,
          metalness: 0.08,
        } ),
        dataset.countries.length * dataset.sources.length,
      );
      barsMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
      barsMesh.castShadow = false;
      barsMesh.receiveShadow = false;
      chartRoot.add( barsMesh );

      let instanceIndex = 0;

      dataset.countries.forEach( ( country, countryIndex ) => {

        const x = countryIndex * chart.countrySpacing - chartWidth * 0.5;

        const countryLabelController = createTrackedTextSprite(
          labelCollections.countries,
          labelRoot,
          { ...labelStyles.country, text: country },
          new THREE.Vector3( x, chart.platformHeight + chart.countryRailHeight + 0.035, countryRailZ + 0.14 ),
        );
        countryLabelSprites.set( country, countryLabelController.sprite );

        dataset.sources.forEach( ( source, sourceIndex ) => {

          if ( countryIndex === 0 ) {

            const zLabel = sourceIndex * chart.sourceSpacing - chartDepth * 0.5;

            const sourceLabelController = createTrackedTextSprite(
              labelCollections.sources,
              labelRoot,
              { ...labelStyles.source, text: source },
              new THREE.Vector3( sourceRailX - 0.16, chart.platformHeight + chart.sourceRailHeight + 0.1, zLabel ),
            );
            sourceLabelSprites.set( source, sourceLabelController.sprite );

          }

          const z = sourceIndex * chart.sourceSpacing - chartDepth * 0.5;
          const datumId = buildDatumId( country, source );
          const entry = { datumId, country, source, instanceIndex, x, z };

          datumEntries.push( entry );
          datumEntryById.set( datumId, entry );
          barsMesh.setColorAt( instanceIndex, new THREE.Color( EXAMPLE1_SOURCE_COLORS[ source ] ) );
          currentHeights[ instanceIndex ] = 0.01;
          startHeights[ instanceIndex ] = 0.01;
          targetHeights[ instanceIndex ] = 0.01;
          instanceIndex += 1;

        } );

      } );

      if ( barsMesh.instanceColor ) {

        barsMesh.instanceColor.needsUpdate = true;

      }

      createTrackedTextPlane( labelCollections.axes, labelRoot, { ...labelStyles.countryAxis, text: 'COUNTRIES' }, new THREE.Vector3( 0, 0.38, countryRailZ + 0.28 ) );
      createTrackedTextPlane( labelCollections.axes, labelRoot, { ...labelStyles.sourceAxis, text: 'ENERGY SOURCES' }, new THREE.Vector3( sourceRailX - 0.26, 0.54, 0 ) );

      createTrackedTextPlane(
        labelCollections.axes,
        labelRoot,
        { ...labelStyles.axisCaption, text: 'PER-CAPITA ENERGY' },
        new THREE.Vector3( frontAxisPlaqueX, chart.frontAxisTitleY, frontAxisPlaqueZ ),
      );
      createTrackedTextPlane(
        labelCollections.axes,
        labelRoot,
        { ...labelStyles.axisUnit, text: `${dataset.unit} / person` },
        new THREE.Vector3( frontAxisPlaqueX, chart.frontAxisUnitY, frontAxisPlaqueZ ),
      );

      getDisplayTickValues().filter( ( tickValue ) => tickValue > 0 ).slice( 0, 5 ).forEach( ( tickValue ) => {

        const tickHeight = chart.barBaseY + tickValue / displayMax * chart.maxBarHeight;
        const slicePlaneMesh = new THREE.Mesh(
          new THREE.PlaneGeometry( sliceWidth, sliceDepth ),
          new THREE.MeshBasicMaterial( {
            color: chart.slicePlaneColor,
            transparent: true,
            opacity: chart.slicePlaneOpacity,
            depthWrite: false,
            side: THREE.FrontSide,
            toneMapped: false,
          } ),
        );
        slicePlaneMesh.rotation.x = - Math.PI * 0.5;
        slicePlaneMesh.position.set( 0, tickHeight, 0 );
        slicePlaneMesh.renderOrder = chart.slicePlaneRenderOrder;
        chartRoot.add( slicePlaneMesh );
        axisGuideMeshes.push( slicePlaneMesh );

        createTrackedTextPlane(
          labelCollections.ticks,
          labelRoot,
          { ...labelStyles.tick, text: formatCompactTick( tickValue ) },
          new THREE.Vector3( sliceLabelX, tickHeight + chart.sliceLabelLift, sliceLabelZ ),
        );

      } );

      createTrackedTextPlane(
        labelCollections.ticks,
        labelRoot,
        { ...labelStyles.tick, text: '0' },
        new THREE.Vector3( frontAxisPlaqueX - 0.08, chart.barBaseY + chart.baselineLabelYOffset, frontAxisPlaqueZ ),
      );

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

      setSelectedYear( pendingSceneState.selectedYear ?? dataset.initialYear, { source: 'scene-init', shouldLog: false, animate: false } );
      setSelectedDatumId( pendingSceneState.selectedDatumId, { source: 'scene-init', shouldLog: false } );
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
      const ratio = THREE.MathUtils.clamp( localPoint.x / xrPanel.sliderTrackLength + 0.5, 0, 1 );
      const nextIndex = Math.round( ratio * ( dataset.years.length - 1 ) );
      const nextYear = dataset.years[ nextIndex ];
      setSelectedYear( nextYear, { source, shouldLog: true, animate: true } );

    }

    function beginPanelDrag( payload ) {

      if ( ! isPanelDragEnabled() ) {

        return;

      }

      if ( ! orbitPanel.beginDrag( payload ) ) {

        return;

      }

      xrPanelDragSource = payload.source;
      xrSliderDragSource = null;

      updatePanelVisualState();

    }

    function updatePanelDragFromRay( payload ) {

      if ( xrPanelDragSource !== payload.source ) {

        return;

      }

      if ( ! orbitPanel.updateDrag( payload ) ) {

        return;

      }

      panelPlacementInitialized = true;
      pendingSceneState = {
        ...pendingSceneState,
        ...getCurrentPanelSceneState(),
      };
      recordPanelTransformIfNeeded( payload.source );
      updatePanelVisualState();

    }

    function endPanelDrag( payload ) {

      if ( xrPanelDragSource !== payload.source ) {

        return;

      }

      orbitPanel.endDrag( payload );
      xrPanelDragSource = null;
      recordPanelTransformIfNeeded( payload.source, {
        force: true,
        flushImmediately: getSceneStateLoggingConfig().flushOnPanelDragEnd,
      } );
      updatePanelVisualState();

    }

    function buildDesktopPanel() {

      desktopPanelNode = document.createElement( 'section' );
      desktopPanelNode.className = 'scene-panel-card';
      desktopPanelNode.setAttribute( 'style', desktopPanel.root );
      desktopPanelNode.appendChild( createStyledElement( 'p', desktopPanel.eyebrow, 'Scene 1 · Semantic Replay' ) );
      desktopPanelNode.appendChild( createStyledElement( 'h2', desktopPanel.title, 'Per capita primary energy consumption by source' ) );
      desktopPanelNode.appendChild( createStyledElement( 'p', desktopPanel.body, 'Explore how a single year reshapes the 3D country-by-source energy matrix. Hover or pin a bar to inspect one country-source pair in detail.' ) );
      desktopPanelNode.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Year' ) );
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
      desktopSlider.addEventListener( 'change', () => {

        flushYearCommit( 'desktop-year-slider', { force: true } );

      } );
      desktopPanelNode.appendChild( desktopSlider );

      desktopPanelNode.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Pinned Selection' ) );
      desktopSelectionValue = createStyledElement( 'p', desktopPanel.detail, 'Hover for a quick tooltip or pin a bar to keep it in focus.' );
      desktopPanelNode.appendChild( desktopSelectionValue );
      desktopPanelNode.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Source' ) );
      desktopCitationValue = createStyledElement( 'p', desktopPanel.detail, 'Loading citation...' );
      desktopPanelNode.appendChild( desktopCitationValue );

      context.setDesktopPanelNode( desktopPanelNode );

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

      if ( options.source === 'replay-scene' ) {

        clearPendingYearCommitTimer();
        hasPendingYearCommit = false;
        pendingYearCommitSource = null;
        resetHoverState( { updateVisuals: false } );

      }

      pendingSceneState = example1SceneDefinition.normalizeSceneState( nextSceneState, pendingSceneState );
      const nextPanelPosition = normalizePanelPosition( pendingSceneState.panelPosition, null );
      const nextPanelQuaternion = normalizePanelQuaternion( pendingSceneState.panelQuaternion, null );

      if ( nextPanelPosition && nextPanelQuaternion ) {

        applyPanelTransform( nextPanelPosition, nextPanelQuaternion );

      } else if ( options.forceDefaultPanel === true || ( context.getPresentationMode() !== PRESENTATION_MODES.DESKTOP && ! panelPlacementInitialized ) ) {

        placePanelAtDefault();

      }

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

    const dragSurface = createSceneUiSurface( context, {
      parent: xrPanelRoot,
      width: xrPanel.width - 0.05,
      height: xrPanel.dragSurfaceHeight,
      position: [ 0, xrPanel.titleY, xrPanel.surfaceDragZ ],
      name: 'example1-panel-drag-surface',
      handlers: {
        onHoverChange( payload ) {

          if ( payload.isHovered ) {

            dragBarHoverSources.add( payload.source );

          } else {

            dragBarHoverSources.delete( payload.source );

          }

          updatePanelVisualState();

        },
        onSelectStart( payload ) {

          beginPanelDrag( payload );

        },
        onSelectMove( payload ) {

          updatePanelDragFromRay( payload );

        },
        onSelectEnd( payload ) {

          endPanelDrag( payload );

        },
      },
    } );
    uiSurfaces.push( dragSurface );

    const sliderSurface = createSceneUiSurface( context, {
      parent: xrPanelRoot,
      width: xrPanel.sliderTrackLength,
      height: xrPanel.sliderSurfaceHeight,
      position: [ 0, xrPanel.trackY, xrPanel.surfaceSliderZ ],
      name: 'example1-slider-surface',
      handlers: {
        onHoverChange( payload ) {

          if ( payload.isHovered ) {

            sliderHoverSources.add( payload.source );

          } else {

            sliderHoverSources.delete( payload.source );

          }

          updatePanelVisualState();

        },
        onSelectStart( payload ) {

          if ( xrPanelDragSource !== null || getInteractionPolicy()?.canInteract === false ) {

            return;

          }

          xrSliderDragSource = payload.source;
          updatePanelVisualState();
          updateYearFromXRRay( payload.rayOrigin, payload.rayDirection, payload.source );

        },
        onSelectMove( payload ) {

          if ( xrSliderDragSource === payload.source && xrPanelDragSource === null ) {

            updateYearFromXRRay( payload.rayOrigin, payload.rayDirection, payload.source );

          }

        },
        onSelectEnd( payload ) {

          if ( xrSliderDragSource === payload.source ) {

            xrSliderDragSource = null;
            flushYearCommit( payload.source, { force: true } );
            updatePanelVisualState();

          }

        },
      },
    } );
    uiSurfaces.push( sliderSurface );

    return {
      activate() {

        context.sceneContentRoot.add( root );
        syncPanelDragAvailability();
        buildDesktopPanel();
        updateDesktopPanel();
        updateXRPanelText();
        syncXRSliderKnob();
        loadDatasetIfNeeded();
        ensurePanelPlacementForCurrentMode();
        updatePanelVisualState();

      },
      dispose() {

        flushYearCommit( pendingYearCommitSource, { force: false } );
        clearPendingYearCommitTimer();

        if ( barsMesh ) {

          context.unregisterRaycastTarget( barsMesh );
          barsMesh.geometry.dispose();
          barsMesh.material.dispose();

        }

        uiSurfaces.forEach( ( surface ) => surface.dispose() );
        clearTickMeshes();
        clearChartLabels();
        clearLabelCollection( 'panelPlanes' );
        resetHoverState( { updateVisuals: false } );
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
          const alpha = THREE.MathUtils.smoothstep( animationElapsed / chart.animationDuration, 0, 1 );

          for ( let index = 0; index < datumEntries.length; index += 1 ) {

            currentHeights[ index ] = THREE.MathUtils.lerp( startHeights[ index ], targetHeights[ index ], alpha );

          }

          barMatrixDirty = true;

        }

        if ( barMatrixDirty ) {

          updateBarsImmediatelyFromCurrentHeights();
          updateTooltipAndHighlight();

        }

      },
      getSceneStateForReplay() {

        return {
          selectedYear,
          selectedDatumId,
          ...( panelPlacementInitialized ? getCurrentPanelSceneState() : {
            panelPosition: pendingSceneState.panelPosition,
            panelQuaternion: pendingSceneState.panelQuaternion,
          } ),
        };

      },
      applySceneStateFromReplay( sceneState ) {

        applySceneState( sceneState, {
          source: 'replay-scene',
          shouldLog: false,
          animate: true,
          forceDefaultPanel: true,
        } );

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

          return {
            title: 'Example 1 - Energy Matrix',
            body: 'Use the left-front year window to scrub through time, then point at bars to inspect country-source values.',
            note: 'Replay stores compact scene semantics: selected year, pinned datum, and panel transform.',
          };

        }

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

          return {
            title: 'Example 1 - Energy Matrix',
            body: 'The chart stays world-anchored while the floating year window remains draggable by its title bar.',
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
        xrSliderDragSource = null;
        xrPanelDragSource = null;
        panelHoverSources.clear();
        sliderHoverSources.clear();
        dragBarHoverSources.clear();
        resetHoverState( { updateVisuals: false } );
        syncPanelDragAvailability();

        if ( presentationMode !== PRESENTATION_MODES.DESKTOP ) {

          ensurePanelPlacementForCurrentMode();

        }

        updatePanelVisualState();

      },
      handleBackgroundSelect( payload ) {

        clearPinnedSelection( payload?.source || 'scene-background' );

      },
    };
  },
} );
