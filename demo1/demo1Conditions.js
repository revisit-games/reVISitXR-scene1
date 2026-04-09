export const DEMO1_ID = 'demo1-scatterplot';

export const DEMO1_NAV_MODES = Object.freeze( {
  SCALE: 'scale',
  OVERVIEW: 'overview',
} );

export const DEMO1_COLOR_ENCODINGS = Object.freeze( {
  REGION: 'region',
  INCOME: 'income',
} );

export const DEMO1_SCALE_LIMITS = Object.freeze( {
  min: 0.5,
  max: 2.5,
  default: 1,
} );

export const DEMO1_DEFAULT_YEAR = 2023;
export const DEMO1_DEFAULT_TASK_ID = 'target-a';
export const DEMO1_SUPPORTED_TASK_IDS = Object.freeze( [ 'target-a', 'target-b', 'target-c' ] );

export function normalizeDemo1PanelPosition( candidateValue, fallbackValue = null ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 3 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : null;

}

export function normalizeDemo1PanelQuaternion( candidateValue, fallbackValue = null ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 4 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ], candidateValue[ 3 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : null;

}

function clamp( value, minValue, maxValue ) {

  return Math.min( maxValue, Math.max( minValue, value ) );

}

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function normalizeTaskId( taskId, fallbackTaskId = DEMO1_DEFAULT_TASK_ID ) {

  return typeof taskId === 'string' && DEMO1_SUPPORTED_TASK_IDS.includes( taskId )
    ? taskId
    : fallbackTaskId;

}

export function normalizeDemo1Year( candidateYear, {
  supportedYears = null,
  fallbackYear = DEMO1_DEFAULT_YEAR,
} = {} ) {

  if ( isFiniteNumber( candidateYear ) ) {

    const normalizedYear = Math.round( candidateYear );

    if ( Array.isArray( supportedYears ) && supportedYears.length > 0 ) {

      return supportedYears.includes( normalizedYear )
        ? normalizedYear
        : fallbackYear;

    }

    return normalizedYear;

  }

  return fallbackYear;

}

export function normalizeDemo1ScaleFactor( value, fallbackValue = DEMO1_SCALE_LIMITS.default ) {

  if ( ! isFiniteNumber( value ) ) {

    return fallbackValue;

  }

  return clamp( value, DEMO1_SCALE_LIMITS.min, DEMO1_SCALE_LIMITS.max );

}

export function parseDemo1Conditions( search = window.location.search, {
  supportedYears = null,
  defaultYear = DEMO1_DEFAULT_YEAR,
  defaultTaskId = DEMO1_DEFAULT_TASK_ID,
} = {} ) {

  const searchParams = new URLSearchParams( search );
  const navMode = searchParams.get( 'nav' ) === DEMO1_NAV_MODES.OVERVIEW
    ? DEMO1_NAV_MODES.OVERVIEW
    : DEMO1_NAV_MODES.SCALE;
  const colorEncoding = searchParams.get( 'color' ) === DEMO1_COLOR_ENCODINGS.INCOME
    ? DEMO1_COLOR_ENCODINGS.INCOME
    : DEMO1_COLOR_ENCODINGS.REGION;
  const overviewVisible = navMode === DEMO1_NAV_MODES.OVERVIEW
    ? searchParams.get( 'overview' ) === '1'
    : false;
  const parsedYear = Number.parseInt( searchParams.get( 'year' ), 10 );

  return {
    demoId: DEMO1_ID,
    dataYear: normalizeDemo1Year( parsedYear, {
      supportedYears,
      fallbackYear: defaultYear,
    } ),
    taskId: normalizeTaskId( searchParams.get( 'task' ), defaultTaskId ),
    navMode,
    colorEncoding,
    overviewEnabled: navMode === DEMO1_NAV_MODES.OVERVIEW,
    overviewVisible,
    overviewToggleCount: 0,
    scaleFactor: DEMO1_SCALE_LIMITS.default,
    selectedPointId: null,
    selectedPointIds: [],
    selectionCount: 0,
    taskAnswer: null,
    taskSubmitted: false,
    panelPosition: null,
    panelQuaternion: null,
  };

}

function normalizeSelectedPointIds( selectedPointIds, selectedPointId ) {

  if ( Array.isArray( selectedPointIds ) ) {

    return selectedPointIds
      .filter( ( pointId ) => typeof pointId === 'string' && pointId.trim().length > 0 )
      .slice( 0, 1 );

  }

  return typeof selectedPointId === 'string' && selectedPointId.trim().length > 0
    ? [ selectedPointId ]
    : [];

}

export function normalizeDemo1SceneState( candidateState, fallbackState = null, {
  supportedYears = null,
  defaultYear = DEMO1_DEFAULT_YEAR,
  defaultTaskId = DEMO1_DEFAULT_TASK_ID,
} = {} ) {

  const parsedDefaults = parseDemo1Conditions( '', {
    supportedYears,
    defaultYear,
    defaultTaskId,
  } );
  const fallback = fallbackState && typeof fallbackState === 'object'
    ? fallbackState
    : parsedDefaults;
  const navMode = candidateState?.navMode === DEMO1_NAV_MODES.OVERVIEW
    ? DEMO1_NAV_MODES.OVERVIEW
    : (
      candidateState?.navMode === DEMO1_NAV_MODES.SCALE
        ? DEMO1_NAV_MODES.SCALE
        : fallback.navMode
    );
  const colorEncoding = candidateState?.colorEncoding === DEMO1_COLOR_ENCODINGS.INCOME
    ? DEMO1_COLOR_ENCODINGS.INCOME
    : (
      candidateState?.colorEncoding === DEMO1_COLOR_ENCODINGS.REGION
        ? DEMO1_COLOR_ENCODINGS.REGION
        : fallback.colorEncoding
    );
  const selectedPointId = typeof candidateState?.selectedPointId === 'string' && candidateState.selectedPointId.trim().length > 0
    ? candidateState.selectedPointId
    : (
      typeof fallback.selectedPointId === 'string' && fallback.selectedPointId.trim().length > 0
        ? fallback.selectedPointId
        : null
    );
  const selectedPointIds = normalizeSelectedPointIds(
    candidateState?.selectedPointIds ?? fallback.selectedPointIds,
    selectedPointId,
  );

  return {
    demoId: typeof candidateState?.demoId === 'string' && candidateState.demoId.trim().length > 0
      ? candidateState.demoId
      : fallback.demoId || DEMO1_ID,
    dataYear: normalizeDemo1Year(
      candidateState?.dataYear,
      {
        supportedYears,
        fallbackYear: normalizeDemo1Year( fallback.dataYear, {
          supportedYears,
          fallbackYear: defaultYear,
        } ),
      },
    ),
    taskId: normalizeTaskId( candidateState?.taskId, normalizeTaskId( fallback.taskId, defaultTaskId ) ),
    navMode,
    colorEncoding,
    overviewEnabled: navMode === DEMO1_NAV_MODES.OVERVIEW,
    overviewVisible: navMode === DEMO1_NAV_MODES.OVERVIEW
      ? candidateState?.overviewVisible === true || ( candidateState?.overviewVisible !== false && fallback.overviewVisible === true )
      : false,
    overviewToggleCount: isFiniteNumber( candidateState?.overviewToggleCount )
      ? Math.max( 0, Math.round( candidateState.overviewToggleCount ) )
      : Math.max( 0, Math.round( fallback.overviewToggleCount || 0 ) ),
    scaleFactor: normalizeDemo1ScaleFactor(
      candidateState?.scaleFactor,
      normalizeDemo1ScaleFactor( fallback.scaleFactor, DEMO1_SCALE_LIMITS.default ),
    ),
    selectedPointId,
    selectedPointIds,
    selectionCount: selectedPointIds.length,
    taskAnswer: typeof candidateState?.taskAnswer === 'string' && candidateState.taskAnswer.trim().length > 0
      ? candidateState.taskAnswer
      : ( typeof fallback.taskAnswer === 'string' && fallback.taskAnswer.trim().length > 0 ? fallback.taskAnswer : null ),
    taskSubmitted: candidateState?.taskSubmitted === true || ( candidateState?.taskSubmitted !== false && fallback.taskSubmitted === true ),
    panelPosition: normalizeDemo1PanelPosition( candidateState?.panelPosition, fallback.panelPosition ),
    panelQuaternion: normalizeDemo1PanelQuaternion( candidateState?.panelQuaternion, fallback.panelQuaternion ),
  };

}
