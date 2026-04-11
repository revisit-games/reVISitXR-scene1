import {
  DEMO4_METRIC_IDS,
  DEMO4_SITE_IDS,
  DEMO4_TIME_SLICE_IDS,
} from './demo4Data.js';
import { DEMO4_DEFAULT_TASK_ID } from './demo4Tasks.js';

export const DEMO4_ID = 'demo4-situated-ar-overlay';

export const DEMO4_PLACEMENT_MODES = Object.freeze( {
  PREVIEW: 'preview',
  ANCHORED: 'anchored',
} );

export const DEMO4_PLACEMENT_MODE_LIST = Object.freeze( [
  DEMO4_PLACEMENT_MODES.PREVIEW,
  DEMO4_PLACEMENT_MODES.ANCHORED,
] );

export const DEMO4_LAYER_MODES = Object.freeze( {
  ALL: 'all',
  ALERTS: 'alerts',
} );

export const DEMO4_LAYER_MODE_LIST = Object.freeze( [
  DEMO4_LAYER_MODES.ALL,
  DEMO4_LAYER_MODES.ALERTS,
] );

export const DEMO4_PLACEMENT_SOURCES = Object.freeze( {
  XR_HIT_TEST: 'xr-hit-test',
  FLOOR_PLANE_FALLBACK: 'floor-plane-fallback',
  DESKTOP_DEFAULT: 'desktop-default',
  REPLAY: 'replay',
} );

export const DEMO4_PLACEMENT_SOURCE_LIST = Object.freeze( [
  DEMO4_PLACEMENT_SOURCES.XR_HIT_TEST,
  DEMO4_PLACEMENT_SOURCES.FLOOR_PLANE_FALLBACK,
  DEMO4_PLACEMENT_SOURCES.DESKTOP_DEFAULT,
  DEMO4_PLACEMENT_SOURCES.REPLAY,
] );

export const DEMO4_PLACEMENT_DRIVERS = Object.freeze( {
  LEFT_CONTROLLER: 'left-controller',
} );

export const DEMO4_PLACEMENT_DRIVER_LIST = Object.freeze( [
  DEMO4_PLACEMENT_DRIVERS.LEFT_CONTROLLER,
] );

export const DEMO4_INTERACTION_MODALITIES = Object.freeze( {
  GAZE_DWELL: 'gaze-dwell',
  HAND_RAY: 'hand-ray',
} );

export const DEMO4_INTERACTION_MODALITY_LIST = Object.freeze( [
  DEMO4_INTERACTION_MODALITIES.GAZE_DWELL,
  DEMO4_INTERACTION_MODALITIES.HAND_RAY,
] );

export const DEMO4_DEFAULT_METRIC_ID = 'co2';
export const DEMO4_DEFAULT_TIME_INDEX = Math.max( 0, DEMO4_TIME_SLICE_IDS.indexOf( 'midday' ) );
export const DEMO4_DEFAULT_LAYER_MODE = DEMO4_LAYER_MODES.ALL;
export const DEMO4_DEFAULT_LABELS_VISIBLE = true;
export const DEMO4_DEFAULT_ANCHOR_POSITION = Object.freeze( [ 0, 0.053, - 1.45 ] );
export const DEMO4_DEFAULT_ANCHOR_QUATERNION = Object.freeze( [ 0, 0, 0, 1 ] );
export const DEMO4_DEFAULT_SCALE_FACTOR = 1;
export const DEMO4_DEFAULT_PLACEMENT_SOURCE = DEMO4_PLACEMENT_SOURCES.DESKTOP_DEFAULT;
export const DEMO4_DEFAULT_PLACEMENT_DRIVER = DEMO4_PLACEMENT_DRIVERS.LEFT_CONTROLLER;
export const DEMO4_DEFAULT_INTERACTION_MODALITY = DEMO4_INTERACTION_MODALITIES.GAZE_DWELL;

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function normalizeStringId( value, fallbackValue = null ) {

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallbackValue;

}

function normalizeBoolean( value, fallbackValue = false ) {

  if ( typeof value === 'boolean' ) {

    return value;

  }

  if ( value === '1' || value === 'true' ) {

    return true;

  }

  if ( value === '0' || value === 'false' ) {

    return false;

  }

  return Boolean( fallbackValue );

}

export function normalizeDemo4MetricId( value, fallbackValue = DEMO4_DEFAULT_METRIC_ID ) {

  return DEMO4_METRIC_IDS.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4TimeIndex( value, fallbackValue = DEMO4_DEFAULT_TIME_INDEX ) {

  if ( typeof value === 'string' && DEMO4_TIME_SLICE_IDS.includes( value ) ) {

    return DEMO4_TIME_SLICE_IDS.indexOf( value );

  }

  const numericValue = typeof value === 'string' ? Number.parseInt( value, 10 ) : value;

  if ( isFiniteNumber( numericValue ) ) {

    return Math.max( 0, Math.min( DEMO4_TIME_SLICE_IDS.length - 1, Math.round( numericValue ) ) );

  }

  return Math.max( 0, Math.min( DEMO4_TIME_SLICE_IDS.length - 1, fallbackValue ) );

}

export function normalizeDemo4LayerMode( value, fallbackValue = DEMO4_DEFAULT_LAYER_MODE ) {

  return DEMO4_LAYER_MODE_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4PlacementSource( value, fallbackValue = DEMO4_DEFAULT_PLACEMENT_SOURCE ) {

  return DEMO4_PLACEMENT_SOURCE_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4PlacementDriver( value, fallbackValue = DEMO4_DEFAULT_PLACEMENT_DRIVER ) {

  return DEMO4_PLACEMENT_DRIVER_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4PlacementControllerSource( value, fallbackValue = null ) {

  if ( value === 'controller-0' || value === 'controller-1' || value === 'left' ) {

    return value;

  }

  return fallbackValue === 'controller-0' || fallbackValue === 'controller-1' || fallbackValue === 'left'
    ? fallbackValue
    : null;

}

export function normalizeDemo4InteractionModality( value, fallbackValue = DEMO4_DEFAULT_INTERACTION_MODALITY ) {

  return DEMO4_INTERACTION_MODALITY_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4PlacementMode( value, fallbackValue = DEMO4_PLACEMENT_MODES.PREVIEW ) {

  return DEMO4_PLACEMENT_MODE_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4SiteId( value, fallbackValue = null ) {

  return DEMO4_SITE_IDS.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo4VisibleSiteIds( value, fallbackValue = DEMO4_SITE_IDS ) {

  const candidateList = Array.isArray( value )
    ? value
    : ( typeof value === 'string' ? value.split( ',' ) : [] );
  const normalizedList = candidateList
    .map( ( item ) => normalizeDemo4SiteId( typeof item === 'string' ? item.trim() : item, null ) )
    .filter( Boolean );
  const uniqueList = [ ...new Set( normalizedList ) ];

  if ( uniqueList.length > 0 || Array.isArray( value ) ) {

    return uniqueList;

  }

  return Array.isArray( fallbackValue )
    ? [ ...new Set( fallbackValue.filter( ( item ) => DEMO4_SITE_IDS.includes( item ) ) ) ]
    : [ ...DEMO4_SITE_IDS ];

}

export function normalizeDemo4Vector3( candidateValue, fallbackValue = DEMO4_DEFAULT_ANCHOR_POSITION ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 3 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : [ ...DEMO4_DEFAULT_ANCHOR_POSITION ];

}

export function normalizeDemo4Quaternion( candidateValue, fallbackValue = DEMO4_DEFAULT_ANCHOR_QUATERNION ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 4 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ], candidateValue[ 3 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : [ ...DEMO4_DEFAULT_ANCHOR_QUATERNION ];

}

export function normalizeDemo4ActivationEvent( candidateValue, fallbackValue = null ) {

  const fallback = fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : null;
  const candidate = candidateValue && typeof candidateValue === 'object' ? candidateValue : {};
  const activationEventType = normalizeDemo4InteractionModality(
    candidate.activationEventType,
    fallback?.activationEventType || null,
  );
  const activationSiteId = normalizeDemo4SiteId(
    candidate.activationSiteId,
    normalizeDemo4SiteId( fallback?.activationSiteId, null ),
  );
  const fallbackSequence = isFiniteNumber( fallback?.sequence ) ? fallback.sequence : 0;
  const sequence = Math.max(
    0,
    Math.round( isFiniteNumber( candidate.sequence ) ? candidate.sequence : fallbackSequence ),
  );

  if ( ! activationEventType || ! activationSiteId ) {

    return null;

  }

  return {
    activationEventType,
    activationSiteId,
    sequence,
  };

}

export function parseDemo4Conditions( search = window.location.search, {
  defaultTaskId = DEMO4_DEFAULT_TASK_ID,
} = {} ) {

  const searchParams = new URLSearchParams( search );
  const defaultMetricId = normalizeDemo4MetricId( searchParams.get( 'metric' ), DEMO4_DEFAULT_METRIC_ID );
  const defaultTimeIndex = normalizeDemo4TimeIndex( searchParams.get( 'time' ), DEMO4_DEFAULT_TIME_INDEX );

  return {
    demoId: DEMO4_ID,
    taskId: normalizeStringId( searchParams.get( 'task' ), defaultTaskId ),
    arPlacementConfirmed: false,
    placementMode: DEMO4_PLACEMENT_MODES.PREVIEW,
    placementCount: 0,
    placementSource: DEMO4_DEFAULT_PLACEMENT_SOURCE,
    placementDriver: DEMO4_DEFAULT_PLACEMENT_DRIVER,
    placementControllerSource: null,
    surfaceDetected: false,
    arAnchorPosition: [ ...DEMO4_DEFAULT_ANCHOR_POSITION ],
    arAnchorQuaternion: [ ...DEMO4_DEFAULT_ANCHOR_QUATERNION ],
    arAnchorSurfaceHeight: 0,
    arScaleFactor: DEMO4_DEFAULT_SCALE_FACTOR,
    metricId: defaultMetricId,
    timeIndex: defaultTimeIndex,
    layerMode: normalizeDemo4LayerMode( searchParams.get( 'layer' ), DEMO4_DEFAULT_LAYER_MODE ),
    labelsVisible: searchParams.get( 'labels' ) !== '0',
    selectedSiteId: normalizeDemo4SiteId( searchParams.get( 'site' ), null ),
    focusedSiteId: null,
    detailExpanded: normalizeBoolean( searchParams.get( 'detail' ), false ),
    interactionModality: normalizeDemo4InteractionModality( searchParams.get( 'modality' ), DEMO4_DEFAULT_INTERACTION_MODALITY ),
    gazeDwellCount: 0,
    handSelectCount: 0,
    lastActivationEvent: null,
    visibleSiteIds: [ ...DEMO4_SITE_IDS ],
    taskAnswer: null,
    taskSubmitted: false,
  };

}

export function normalizeDemo4SceneState( candidateState, fallbackState = null, {
  defaultTaskId = DEMO4_DEFAULT_TASK_ID,
} = {} ) {

  const parsedDefaults = parseDemo4Conditions( '', { defaultTaskId } );
  const fallback = fallbackState && typeof fallbackState === 'object'
    ? fallbackState
    : parsedDefaults;
  const arPlacementConfirmed = typeof candidateState?.arPlacementConfirmed === 'boolean'
    ? candidateState.arPlacementConfirmed
    : Boolean( fallback.arPlacementConfirmed );

  return {
    demoId: normalizeStringId( candidateState?.demoId, fallback.demoId || DEMO4_ID ),
    taskId: normalizeStringId( candidateState?.taskId, fallback.taskId || defaultTaskId ),
    arPlacementConfirmed,
    placementMode: normalizeDemo4PlacementMode(
      candidateState?.placementMode,
      arPlacementConfirmed ? DEMO4_PLACEMENT_MODES.ANCHORED : DEMO4_PLACEMENT_MODES.PREVIEW,
    ),
    placementCount: Math.max(
      0,
      Math.round(
        isFiniteNumber( candidateState?.placementCount )
          ? candidateState.placementCount
          : ( isFiniteNumber( fallback.placementCount ) ? fallback.placementCount : 0 ),
      ),
    ),
    placementSource: normalizeDemo4PlacementSource(
      candidateState?.placementSource,
      normalizeDemo4PlacementSource( fallback.placementSource, DEMO4_DEFAULT_PLACEMENT_SOURCE ),
    ),
    placementDriver: normalizeDemo4PlacementDriver(
      candidateState?.placementDriver,
      normalizeDemo4PlacementDriver( fallback.placementDriver, DEMO4_DEFAULT_PLACEMENT_DRIVER ),
    ),
    placementControllerSource: normalizeDemo4PlacementControllerSource(
      candidateState?.placementControllerSource,
      normalizeDemo4PlacementControllerSource( fallback.placementControllerSource, null ),
    ),
    surfaceDetected: typeof candidateState?.surfaceDetected === 'boolean'
      ? candidateState.surfaceDetected
      : Boolean( fallback.surfaceDetected ),
    arAnchorPosition: normalizeDemo4Vector3( candidateState?.arAnchorPosition, normalizeDemo4Vector3( fallback.arAnchorPosition ) ),
    arAnchorQuaternion: normalizeDemo4Quaternion( candidateState?.arAnchorQuaternion, normalizeDemo4Quaternion( fallback.arAnchorQuaternion ) ),
    arAnchorSurfaceHeight: Math.max(
      0,
      isFiniteNumber( candidateState?.arAnchorSurfaceHeight )
        ? candidateState.arAnchorSurfaceHeight
        : ( isFiniteNumber( fallback.arAnchorSurfaceHeight ) ? fallback.arAnchorSurfaceHeight : 0 ),
    ),
    arScaleFactor: Math.max(
      0.25,
      isFiniteNumber( candidateState?.arScaleFactor )
        ? candidateState.arScaleFactor
        : ( isFiniteNumber( fallback.arScaleFactor ) ? fallback.arScaleFactor : DEMO4_DEFAULT_SCALE_FACTOR ),
    ),
    metricId: normalizeDemo4MetricId(
      candidateState?.metricId,
      normalizeDemo4MetricId( fallback.metricId, DEMO4_DEFAULT_METRIC_ID ),
    ),
    timeIndex: normalizeDemo4TimeIndex(
      candidateState?.timeIndex,
      normalizeDemo4TimeIndex( fallback.timeIndex, DEMO4_DEFAULT_TIME_INDEX ),
    ),
    layerMode: normalizeDemo4LayerMode(
      candidateState?.layerMode,
      normalizeDemo4LayerMode( fallback.layerMode, DEMO4_DEFAULT_LAYER_MODE ),
    ),
    labelsVisible: typeof candidateState?.labelsVisible === 'boolean'
      ? candidateState.labelsVisible
      : normalizeBoolean( fallback.labelsVisible, DEMO4_DEFAULT_LABELS_VISIBLE ),
    selectedSiteId: normalizeDemo4SiteId(
      candidateState?.selectedSiteId,
      normalizeDemo4SiteId( fallback.selectedSiteId, null ),
    ),
    focusedSiteId: normalizeDemo4SiteId(
      candidateState?.focusedSiteId,
      normalizeDemo4SiteId( fallback.focusedSiteId, null ),
    ),
    detailExpanded: typeof candidateState?.detailExpanded === 'boolean'
      ? candidateState.detailExpanded
      : Boolean( fallback.detailExpanded ),
    interactionModality: normalizeDemo4InteractionModality(
      candidateState?.interactionModality,
      normalizeDemo4InteractionModality( fallback.interactionModality, DEMO4_DEFAULT_INTERACTION_MODALITY ),
    ),
    gazeDwellCount: Math.max(
      0,
      Math.round(
        isFiniteNumber( candidateState?.gazeDwellCount )
          ? candidateState.gazeDwellCount
          : ( isFiniteNumber( fallback.gazeDwellCount ) ? fallback.gazeDwellCount : 0 ),
      ),
    ),
    handSelectCount: Math.max(
      0,
      Math.round(
        isFiniteNumber( candidateState?.handSelectCount )
          ? candidateState.handSelectCount
          : ( isFiniteNumber( fallback.handSelectCount ) ? fallback.handSelectCount : 0 ),
      ),
    ),
    lastActivationEvent: normalizeDemo4ActivationEvent(
      candidateState?.lastActivationEvent,
      normalizeDemo4ActivationEvent( fallback.lastActivationEvent, null ),
    ),
    visibleSiteIds: normalizeDemo4VisibleSiteIds(
      candidateState?.visibleSiteIds,
      normalizeDemo4VisibleSiteIds( fallback.visibleSiteIds, DEMO4_SITE_IDS ),
    ),
    taskAnswer: normalizeDemo4SiteId(
      candidateState?.taskAnswer,
      normalizeDemo4SiteId( fallback.taskAnswer, null ),
    ),
    taskSubmitted: typeof candidateState?.taskSubmitted === 'boolean'
      ? candidateState.taskSubmitted
      : Boolean( fallback.taskSubmitted ),
  };

}
