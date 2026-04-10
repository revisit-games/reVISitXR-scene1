export const DEMO2_ID = 'demo2-migration-globe';

export const DEMO2_DIRECTION_MODES = Object.freeze( {
  ALL: 'all',
  OUTBOUND: 'outbound',
  INBOUND: 'inbound',
} );

export const DEMO2_THRESHOLD_PRESETS = Object.freeze( [ 0, 50000, 100000, 250000, 500000 ] );
export const DEMO2_DEFAULT_YEAR = 2024;
export const DEMO2_DEFAULT_THRESHOLD = 50000;
export const DEMO2_DEFAULT_TASK_ID = 'afg-strongest-outbound';
export const DEMO2_DEFAULT_FOCUSED_COUNTRY_ID = 'AFG';
export const DEMO2_DEFAULT_GLOBE_YAW_DEG = - 35;
export const DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION = Object.freeze( [ 0, 1.28, - 2.45 ] );
export const DEMO2_GLOBE_YAW_STEP_DEG = 30;

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function normalizeCountryId( value, fallbackValue = null ) {

  return typeof value === 'string' && value.trim().length === 3
    ? value.trim().toUpperCase()
    : fallbackValue;

}

function clampToSupportedYears( candidateYear, supportedYears, fallbackYear ) {

  if ( ! isFiniteNumber( candidateYear ) ) {

    return fallbackYear;

  }

  const normalizedYear = Math.round( candidateYear );

  if ( Array.isArray( supportedYears ) && supportedYears.length > 0 ) {

    return supportedYears.includes( normalizedYear )
      ? normalizedYear
      : fallbackYear;

  }

  return normalizedYear;

}

function normalizeDirectionMode( value, fallbackValue = DEMO2_DIRECTION_MODES.OUTBOUND ) {

  if ( value === DEMO2_DIRECTION_MODES.ALL || value === DEMO2_DIRECTION_MODES.OUTBOUND || value === DEMO2_DIRECTION_MODES.INBOUND ) {

    return value;

  }

  return fallbackValue;

}

function normalizeThreshold( value, fallbackValue = DEMO2_DEFAULT_THRESHOLD ) {

  const numericValue = typeof value === 'string'
    ? Number.parseInt( value, 10 )
    : value;

  if ( ! isFiniteNumber( numericValue ) ) {

    return fallbackValue;

  }

  return DEMO2_THRESHOLD_PRESETS.reduce( ( closest, preset ) => (
    Math.abs( preset - numericValue ) < Math.abs( closest - numericValue ) ? preset : closest
  ), DEMO2_THRESHOLD_PRESETS[ 0 ] );

}

function normalizeAngleDegrees( value, fallbackValue = DEMO2_DEFAULT_GLOBE_YAW_DEG ) {

  if ( ! isFiniteNumber( value ) ) {

    return fallbackValue;

  }

  let normalizedValue = value % 360;

  if ( normalizedValue > 180 ) {

    normalizedValue -= 360;

  } else if ( normalizedValue <= - 180 ) {

    normalizedValue += 360;

  }

  return Number.parseFloat( normalizedValue.toFixed( 3 ) );

}

export function normalizeDemo2PanelPosition( candidateValue, fallbackValue = null ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 3 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : null;

}

export function normalizeDemo2PanelQuaternion( candidateValue, fallbackValue = null ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 4 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ], candidateValue[ 3 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : null;

}

export function normalizeDemo2GlobeAnchorPosition(
  candidateValue,
  fallbackValue = DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION,
) {

  const fallbackPosition = Array.isArray( fallbackValue ) &&
    fallbackValue.length === 3 &&
    fallbackValue.every( isFiniteNumber )
    ? fallbackValue
    : DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION;

  if ( Array.isArray( candidateValue ) && candidateValue.length === 3 && candidateValue.every( isFiniteNumber ) ) {

    return [
      candidateValue[ 0 ],
      DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION[ 1 ],
      candidateValue[ 2 ],
    ];

  }

  return [
    fallbackPosition[ 0 ],
    DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION[ 1 ],
    fallbackPosition[ 2 ],
  ];

}

export function parseDemo2Conditions( search = window.location.search, {
  supportedYears = null,
  defaultYear = DEMO2_DEFAULT_YEAR,
  defaultTaskId = DEMO2_DEFAULT_TASK_ID,
  defaultFocusedCountryId = DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
} = {} ) {

  const searchParams = new URLSearchParams( search );
  const parsedYear = Number.parseInt( searchParams.get( 'year' ), 10 );
  const parsedThreshold = Number.parseInt( searchParams.get( 'threshold' ), 10 );
  const parsedYaw = Number.parseFloat( searchParams.get( 'yaw' ) );

  return {
    demoId: DEMO2_ID,
    taskId: typeof searchParams.get( 'task' ) === 'string' && searchParams.get( 'task' ).trim().length > 0
      ? searchParams.get( 'task' ).trim()
      : defaultTaskId,
    geoYear: clampToSupportedYears( parsedYear, supportedYears, defaultYear ),
    flowDirectionMode: normalizeDirectionMode( searchParams.get( 'direction' ), DEMO2_DIRECTION_MODES.OUTBOUND ),
    minFlowThreshold: normalizeThreshold( parsedThreshold, DEMO2_DEFAULT_THRESHOLD ),
    focusedCountryId: normalizeCountryId( searchParams.get( 'focus' ), defaultFocusedCountryId ),
    selectedNodeId: null,
    selectedFlowId: null,
    labelsVisible: searchParams.get( 'labels' ) !== '0',
    visibleFlowCount: 0,
    globeYawDeg: normalizeAngleDegrees( parsedYaw, DEMO2_DEFAULT_GLOBE_YAW_DEG ),
    globeAnchorPosition: normalizeDemo2GlobeAnchorPosition( null, DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION ),
    taskAnswer: null,
    taskSubmitted: false,
    panelPosition: null,
    panelQuaternion: null,
  };

}

export function normalizeDemo2SceneState( candidateState, fallbackState = null, {
  supportedYears = null,
  defaultYear = DEMO2_DEFAULT_YEAR,
  defaultTaskId = DEMO2_DEFAULT_TASK_ID,
  defaultFocusedCountryId = DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
} = {} ) {

  const parsedDefaults = parseDemo2Conditions( '', {
    supportedYears,
    defaultYear,
    defaultTaskId,
    defaultFocusedCountryId,
  } );
  const fallback = fallbackState && typeof fallbackState === 'object'
    ? fallbackState
    : parsedDefaults;

  return {
    demoId: typeof candidateState?.demoId === 'string' && candidateState.demoId.trim().length > 0
      ? candidateState.demoId
      : fallback.demoId || DEMO2_ID,
    taskId: typeof candidateState?.taskId === 'string' && candidateState.taskId.trim().length > 0
      ? candidateState.taskId.trim()
      : ( fallback.taskId || defaultTaskId ),
    geoYear: clampToSupportedYears(
      candidateState?.geoYear,
      supportedYears,
      clampToSupportedYears( fallback.geoYear, supportedYears, defaultYear ),
    ),
    flowDirectionMode: normalizeDirectionMode( candidateState?.flowDirectionMode, normalizeDirectionMode( fallback.flowDirectionMode, DEMO2_DIRECTION_MODES.OUTBOUND ) ),
    minFlowThreshold: normalizeThreshold( candidateState?.minFlowThreshold, normalizeThreshold( fallback.minFlowThreshold, DEMO2_DEFAULT_THRESHOLD ) ),
    focusedCountryId: normalizeCountryId( candidateState?.focusedCountryId, normalizeCountryId( fallback.focusedCountryId, defaultFocusedCountryId ) ),
    selectedNodeId: normalizeCountryId( candidateState?.selectedNodeId, normalizeCountryId( fallback.selectedNodeId, null ) ),
    selectedFlowId: typeof candidateState?.selectedFlowId === 'string' && candidateState.selectedFlowId.trim().length > 0
      ? candidateState.selectedFlowId.trim()
      : ( typeof fallback.selectedFlowId === 'string' && fallback.selectedFlowId.trim().length > 0 ? fallback.selectedFlowId.trim() : null ),
    labelsVisible: typeof candidateState?.labelsVisible === 'boolean'
      ? candidateState.labelsVisible
      : ( typeof fallback.labelsVisible === 'boolean' ? fallback.labelsVisible : true ),
    visibleFlowCount: isFiniteNumber( candidateState?.visibleFlowCount )
      ? Math.max( 0, Math.round( candidateState.visibleFlowCount ) )
      : ( isFiniteNumber( fallback.visibleFlowCount ) ? Math.max( 0, Math.round( fallback.visibleFlowCount ) ) : 0 ),
    globeYawDeg: normalizeAngleDegrees( candidateState?.globeYawDeg, normalizeAngleDegrees( fallback.globeYawDeg, DEMO2_DEFAULT_GLOBE_YAW_DEG ) ),
    globeAnchorPosition: normalizeDemo2GlobeAnchorPosition(
      candidateState?.globeAnchorPosition,
      normalizeDemo2GlobeAnchorPosition( fallback.globeAnchorPosition, DEMO2_DEFAULT_GLOBE_ANCHOR_POSITION ),
    ),
    taskAnswer: typeof candidateState?.taskAnswer === 'string' && candidateState.taskAnswer.trim().length > 0
      ? candidateState.taskAnswer.trim()
      : ( typeof fallback.taskAnswer === 'string' && fallback.taskAnswer.trim().length > 0 ? fallback.taskAnswer.trim() : null ),
    taskSubmitted: typeof candidateState?.taskSubmitted === 'boolean'
      ? candidateState.taskSubmitted
      : Boolean( fallback.taskSubmitted ),
    panelPosition: normalizeDemo2PanelPosition( candidateState?.panelPosition, normalizeDemo2PanelPosition( fallback.panelPosition, null ) ),
    panelQuaternion: normalizeDemo2PanelQuaternion( candidateState?.panelQuaternion, normalizeDemo2PanelQuaternion( fallback.panelQuaternion, null ) ),
  };

}
