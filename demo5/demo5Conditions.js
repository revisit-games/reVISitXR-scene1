import {
  DEMO5_DEFAULT_SELECTED_LANDMARK_ID,
  DEMO5_LANDMARK_IDS,
  DEMO5_LANDMARK_SET_ID,
} from './demo5Data.js';
import { DEMO5_DEFAULT_TASK_ID } from './demo5Tasks.js';

export const DEMO5_ID = 'demo5-landmark-scale-visceralization';

export const DEMO5_COMPARISON_MODES = Object.freeze( {
  REAL_SCALE: 'real-scale',
  DISTANT_COMPARISON: 'distant-comparison',
  MINIATURE_COMPARISON: 'miniature-comparison',
} );

export const DEMO5_COMPARISON_MODE_LIST = Object.freeze( [
  DEMO5_COMPARISON_MODES.REAL_SCALE,
  DEMO5_COMPARISON_MODES.DISTANT_COMPARISON,
  DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON,
] );

export const DEMO5_VIEWPOINT_PRESETS = Object.freeze( {
  BASE_NEAR_SELECTED: 'base_near_selected',
  DISTANT_COMPARISON: 'distant_comparison',
  ELEVATED_OVERVIEW: 'elevated_overview',
  HIGH_VANTAGE: 'high_vantage',
} );

export const DEMO5_VIEWPOINT_PRESET_LIST = Object.freeze( [
  DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED,
  DEMO5_VIEWPOINT_PRESETS.DISTANT_COMPARISON,
  DEMO5_VIEWPOINT_PRESETS.ELEVATED_OVERVIEW,
  DEMO5_VIEWPOINT_PRESETS.HIGH_VANTAGE,
] );

export const DEMO5_DEFAULT_COMPARISON_MODE = DEMO5_COMPARISON_MODES.REAL_SCALE;
export const DEMO5_DEFAULT_VIEWPOINT_PRESET_ID = DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED;
export const DEMO5_DEFAULT_CONTROL_PANEL_POSITION = Object.freeze( [ 1.24, 1.42, - 1.62 ] );
export const DEMO5_DEFAULT_CONTROL_PANEL_QUATERNION = Object.freeze( [ 0, 0, 0, 1 ] );

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

export function normalizeDemo5LandmarkId( value, fallbackValue = DEMO5_DEFAULT_SELECTED_LANDMARK_ID ) {

  return DEMO5_LANDMARK_IDS.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo5ComparisonMode( value, fallbackValue = DEMO5_DEFAULT_COMPARISON_MODE ) {

  return DEMO5_COMPARISON_MODE_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo5ViewpointPresetId( value, fallbackValue = DEMO5_DEFAULT_VIEWPOINT_PRESET_ID ) {

  return DEMO5_VIEWPOINT_PRESET_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo5ControlPanelPosition( value, fallbackValue = DEMO5_DEFAULT_CONTROL_PANEL_POSITION ) {

  if ( Array.isArray( value ) && value.length === 3 && value.every( isFiniteNumber ) ) {

    return [ value[ 0 ], value[ 1 ], value[ 2 ] ];

  }

  return Array.isArray( fallbackValue ) && fallbackValue.length === 3
    ? [ ...fallbackValue ]
    : [ ...DEMO5_DEFAULT_CONTROL_PANEL_POSITION ];

}

export function normalizeDemo5ControlPanelQuaternion( value, fallbackValue = DEMO5_DEFAULT_CONTROL_PANEL_QUATERNION ) {

  if ( Array.isArray( value ) && value.length === 4 && value.every( isFiniteNumber ) ) {

    return [ value[ 0 ], value[ 1 ], value[ 2 ], value[ 3 ] ];

  }

  return Array.isArray( fallbackValue ) && fallbackValue.length === 4
    ? [ ...fallbackValue ]
    : [ ...DEMO5_DEFAULT_CONTROL_PANEL_QUATERNION ];

}

export function parseDemo5Conditions( search = window.location.search, {
  defaultTaskId = DEMO5_DEFAULT_TASK_ID,
} = {} ) {

  const searchParams = new URLSearchParams( search );

  return {
    demoId: DEMO5_ID,
    taskId: normalizeStringId( searchParams.get( 'task' ), defaultTaskId ),
    landmarkSetId: DEMO5_LANDMARK_SET_ID,
    selectedLandmarkId: normalizeDemo5LandmarkId( searchParams.get( 'landmark' ), DEMO5_DEFAULT_SELECTED_LANDMARK_ID ),
    comparisonMode: normalizeDemo5ComparisonMode( searchParams.get( 'mode' ), DEMO5_DEFAULT_COMPARISON_MODE ),
    viewpointPresetId: normalizeDemo5ViewpointPresetId( searchParams.get( 'view' ), DEMO5_DEFAULT_VIEWPOINT_PRESET_ID ),
    annotationsVisible: searchParams.get( 'annotations' ) !== '0',
    humanReferenceVisible: searchParams.get( 'humans' ) !== '0',
    shadowCueVisible: searchParams.get( 'shadows' ) !== '0',
    rulerCueVisible: searchParams.get( 'ruler' ) !== '0',
    quantLabelsVisible: searchParams.get( 'quant' ) === '1',
    taskAnswer: null,
    taskSubmitted: false,
    controlPanelPosition: [ ...DEMO5_DEFAULT_CONTROL_PANEL_POSITION ],
    controlPanelQuaternion: [ ...DEMO5_DEFAULT_CONTROL_PANEL_QUATERNION ],
  };

}

export function normalizeDemo5SceneState( candidateState, fallbackState = null, {
  defaultTaskId = DEMO5_DEFAULT_TASK_ID,
} = {} ) {

  const parsedDefaults = parseDemo5Conditions( '', { defaultTaskId } );
  const fallback = fallbackState && typeof fallbackState === 'object'
    ? fallbackState
    : parsedDefaults;

  return {
    demoId: normalizeStringId( candidateState?.demoId, fallback.demoId || DEMO5_ID ),
    taskId: normalizeStringId( candidateState?.taskId, fallback.taskId || defaultTaskId ),
    landmarkSetId: normalizeStringId( candidateState?.landmarkSetId, fallback.landmarkSetId || DEMO5_LANDMARK_SET_ID ),
    selectedLandmarkId: normalizeDemo5LandmarkId(
      candidateState?.selectedLandmarkId,
      normalizeDemo5LandmarkId( fallback.selectedLandmarkId, DEMO5_DEFAULT_SELECTED_LANDMARK_ID ),
    ),
    comparisonMode: normalizeDemo5ComparisonMode(
      candidateState?.comparisonMode,
      normalizeDemo5ComparisonMode( fallback.comparisonMode, DEMO5_DEFAULT_COMPARISON_MODE ),
    ),
    viewpointPresetId: normalizeDemo5ViewpointPresetId(
      candidateState?.viewpointPresetId,
      normalizeDemo5ViewpointPresetId( fallback.viewpointPresetId, DEMO5_DEFAULT_VIEWPOINT_PRESET_ID ),
    ),
    annotationsVisible: typeof candidateState?.annotationsVisible === 'boolean'
      ? candidateState.annotationsVisible
      : normalizeBoolean( fallback.annotationsVisible, true ),
    humanReferenceVisible: typeof candidateState?.humanReferenceVisible === 'boolean'
      ? candidateState.humanReferenceVisible
      : normalizeBoolean( fallback.humanReferenceVisible, true ),
    shadowCueVisible: typeof candidateState?.shadowCueVisible === 'boolean'
      ? candidateState.shadowCueVisible
      : normalizeBoolean( fallback.shadowCueVisible, true ),
    rulerCueVisible: typeof candidateState?.rulerCueVisible === 'boolean'
      ? candidateState.rulerCueVisible
      : normalizeBoolean( fallback.rulerCueVisible, true ),
    quantLabelsVisible: typeof candidateState?.quantLabelsVisible === 'boolean'
      ? candidateState.quantLabelsVisible
      : normalizeBoolean( fallback.quantLabelsVisible, false ),
    taskAnswer: normalizeDemo5LandmarkId(
      candidateState?.taskAnswer,
      normalizeDemo5LandmarkId( fallback.taskAnswer, null ),
    ),
    taskSubmitted: typeof candidateState?.taskSubmitted === 'boolean'
      ? candidateState.taskSubmitted
      : Boolean( fallback.taskSubmitted ),
    controlPanelPosition: normalizeDemo5ControlPanelPosition(
      candidateState?.controlPanelPosition,
      normalizeDemo5ControlPanelPosition( fallback.controlPanelPosition, DEMO5_DEFAULT_CONTROL_PANEL_POSITION ),
    ),
    controlPanelQuaternion: normalizeDemo5ControlPanelQuaternion(
      candidateState?.controlPanelQuaternion,
      normalizeDemo5ControlPanelQuaternion( fallback.controlPanelQuaternion, DEMO5_DEFAULT_CONTROL_PANEL_QUATERNION ),
    ),
  };

}
