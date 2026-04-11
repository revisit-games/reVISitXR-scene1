export const DEMO3_ID = 'demo3-analytic-workspace';

export const DEMO3_VIEW_IDS = Object.freeze( {
  TREND: 'trend',
  RANKING: 'ranking',
  COMPARISON: 'comparison',
  SUMMARY: 'summary',
} );

export const DEMO3_VIEW_ID_LIST = Object.freeze( [
  DEMO3_VIEW_IDS.TREND,
  DEMO3_VIEW_IDS.RANKING,
  DEMO3_VIEW_IDS.COMPARISON,
  DEMO3_VIEW_IDS.SUMMARY,
] );

export const DEMO3_LAYOUT_MODES = Object.freeze( {
  FREE: 'free',
  COMPARE: 'compare',
  FOCUS: 'focus',
  SURROUND: 'surround',
} );

export const DEMO3_LAYOUT_MODE_LIST = Object.freeze( [
  DEMO3_LAYOUT_MODES.FREE,
  DEMO3_LAYOUT_MODES.COMPARE,
  DEMO3_LAYOUT_MODES.FOCUS,
  DEMO3_LAYOUT_MODES.SURROUND,
] );

export const DEMO3_DEFAULT_TASK_ID = 'strongest-life-increase';
export const DEMO3_DEFAULT_LAYOUT_MODE = DEMO3_LAYOUT_MODES.COMPARE;
export const DEMO3_DEFAULT_FOCUSED_VIEW_ID = DEMO3_VIEW_IDS.TREND;
export const DEMO3_DEFAULT_SELECTED_VIEW_ID = DEMO3_VIEW_IDS.TREND;
export const DEMO3_DEFAULT_LINKED_HIGHLIGHT_ENABLED = true;

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function normalizeStringId( value, fallbackValue = null ) {

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallbackValue;

}

export function normalizeDemo3LayoutMode( value, fallbackValue = DEMO3_DEFAULT_LAYOUT_MODE ) {

  return DEMO3_LAYOUT_MODE_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo3ViewId( value, fallbackValue = DEMO3_DEFAULT_FOCUSED_VIEW_ID ) {

  return DEMO3_VIEW_ID_LIST.includes( value ) ? value : fallbackValue;

}

export function normalizeDemo3VisibleViewIds( value, fallbackValue = DEMO3_VIEW_ID_LIST ) {

  const candidateList = Array.isArray( value )
    ? value
    : ( typeof value === 'string' ? value.split( ',' ) : [] );
  const normalizedList = candidateList
    .map( ( item ) => normalizeDemo3ViewId( typeof item === 'string' ? item.trim() : item, null ) )
    .filter( Boolean );
  const uniqueList = [ ...new Set( normalizedList ) ];

  if ( uniqueList.length > 0 ) {

    return uniqueList;

  }

  return Array.isArray( fallbackValue ) && fallbackValue.length > 0
    ? [ ...new Set( fallbackValue.filter( ( item ) => DEMO3_VIEW_ID_LIST.includes( item ) ) ) ]
    : [ ...DEMO3_VIEW_ID_LIST ];

}

export function normalizeDemo3PinnedViewIds( value, fallbackValue = [] ) {

  const candidateList = Array.isArray( value )
    ? value
    : ( typeof value === 'string' ? value.split( ',' ) : [] );
  const normalizedList = candidateList
    .map( ( item ) => normalizeDemo3ViewId( typeof item === 'string' ? item.trim() : item, null ) )
    .filter( Boolean );
  const uniqueList = [ ...new Set( normalizedList ) ];

  return uniqueList.length > 0
    ? uniqueList
    : ( Array.isArray( fallbackValue ) ? [ ...new Set( fallbackValue.filter( ( item ) => DEMO3_VIEW_ID_LIST.includes( item ) ) ) ] : [] );

}

export function normalizeDemo3PanelPosition( candidateValue, fallbackValue = null ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 3 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : null;

}

export function normalizeDemo3PanelQuaternion( candidateValue, fallbackValue = null ) {

  if ( Array.isArray( candidateValue ) && candidateValue.length === 4 && candidateValue.every( isFiniteNumber ) ) {

    return [ candidateValue[ 0 ], candidateValue[ 1 ], candidateValue[ 2 ], candidateValue[ 3 ] ];

  }

  return Array.isArray( fallbackValue ) ? [ ...fallbackValue ] : null;

}

export function normalizeDemo3PanelLayout( candidateValue, fallbackValue = null ) {

  const fallback = fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {};
  const normalizedPosition = normalizeDemo3PanelPosition( candidateValue?.position, normalizeDemo3PanelPosition( fallback.position, null ) );
  const normalizedQuaternion = normalizeDemo3PanelQuaternion( candidateValue?.quaternion, normalizeDemo3PanelQuaternion( fallback.quaternion, null ) );
  const normalizedSlotId = normalizeStringId( candidateValue?.slotId, normalizeStringId( fallback.slotId, null ) );

  if ( ! normalizedPosition || ! normalizedQuaternion ) {

    return null;

  }

  return {
    position: normalizedPosition,
    quaternion: normalizedQuaternion,
    slotId: normalizedSlotId,
    pinned: typeof candidateValue?.pinned === 'boolean'
      ? candidateValue.pinned
      : Boolean( fallback.pinned ),
  };

}

export function normalizeDemo3PanelLayouts( candidateValue, fallbackValue = {} ) {

  const normalizedLayouts = {};
  const candidate = candidateValue && typeof candidateValue === 'object' ? candidateValue : {};
  const fallback = fallbackValue && typeof fallbackValue === 'object' ? fallbackValue : {};

  DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => {

    const normalizedLayout = normalizeDemo3PanelLayout( candidate[ viewId ], fallback[ viewId ] );

    if ( normalizedLayout ) {

      normalizedLayouts[ viewId ] = normalizedLayout;

    }

  } );

  return normalizedLayouts;

}

export function parseDemo3Conditions( search = window.location.search, {
  defaultTaskId = DEMO3_DEFAULT_TASK_ID,
} = {} ) {

  const searchParams = new URLSearchParams( search );

  return {
    demoId: DEMO3_ID,
    taskId: normalizeStringId( searchParams.get( 'task' ), defaultTaskId ),
    layoutMode: normalizeDemo3LayoutMode( searchParams.get( 'layout' ), DEMO3_DEFAULT_LAYOUT_MODE ),
    focusedViewId: normalizeDemo3ViewId( searchParams.get( 'focusView' ), DEMO3_DEFAULT_FOCUSED_VIEW_ID ),
    selectedViewId: normalizeDemo3ViewId( searchParams.get( 'selectedView' ), DEMO3_DEFAULT_SELECTED_VIEW_ID ),
    selectedDatumId: normalizeStringId( searchParams.get( 'datum' ), null ),
    linkedHighlightEnabled: searchParams.get( 'linked' ) !== '0',
    visibleViewIds: normalizeDemo3VisibleViewIds( searchParams.get( 'views' ), DEMO3_VIEW_ID_LIST ),
    pinnedViewIds: normalizeDemo3PinnedViewIds( searchParams.get( 'pinned' ), [] ),
    panelLayouts: {},
    panelOrder: [ ...DEMO3_VIEW_ID_LIST ],
    taskAnswer: null,
    taskSubmitted: false,
  };

}

export function normalizeDemo3SceneState( candidateState, fallbackState = null, {
  defaultTaskId = DEMO3_DEFAULT_TASK_ID,
} = {} ) {

  const parsedDefaults = parseDemo3Conditions( '', { defaultTaskId } );
  const fallback = fallbackState && typeof fallbackState === 'object'
    ? fallbackState
    : parsedDefaults;

  return {
    demoId: normalizeStringId( candidateState?.demoId, fallback.demoId || DEMO3_ID ),
    taskId: normalizeStringId( candidateState?.taskId, fallback.taskId || defaultTaskId ),
    layoutMode: normalizeDemo3LayoutMode(
      candidateState?.layoutMode,
      normalizeDemo3LayoutMode( fallback.layoutMode, DEMO3_DEFAULT_LAYOUT_MODE ),
    ),
    focusedViewId: normalizeDemo3ViewId(
      candidateState?.focusedViewId,
      normalizeDemo3ViewId( fallback.focusedViewId, DEMO3_DEFAULT_FOCUSED_VIEW_ID ),
    ),
    selectedViewId: normalizeDemo3ViewId(
      candidateState?.selectedViewId,
      normalizeDemo3ViewId( fallback.selectedViewId, DEMO3_DEFAULT_SELECTED_VIEW_ID ),
    ),
    selectedDatumId: normalizeStringId(
      candidateState?.selectedDatumId,
      normalizeStringId( fallback.selectedDatumId, null ),
    ),
    linkedHighlightEnabled: typeof candidateState?.linkedHighlightEnabled === 'boolean'
      ? candidateState.linkedHighlightEnabled
      : ( typeof fallback.linkedHighlightEnabled === 'boolean' ? fallback.linkedHighlightEnabled : DEMO3_DEFAULT_LINKED_HIGHLIGHT_ENABLED ),
    visibleViewIds: normalizeDemo3VisibleViewIds( candidateState?.visibleViewIds, normalizeDemo3VisibleViewIds( fallback.visibleViewIds, DEMO3_VIEW_ID_LIST ) ),
    pinnedViewIds: normalizeDemo3PinnedViewIds( candidateState?.pinnedViewIds, normalizeDemo3PinnedViewIds( fallback.pinnedViewIds, [] ) ),
    panelLayouts: normalizeDemo3PanelLayouts( candidateState?.panelLayouts, normalizeDemo3PanelLayouts( fallback.panelLayouts, {} ) ),
    panelOrder: normalizeDemo3VisibleViewIds( candidateState?.panelOrder, normalizeDemo3VisibleViewIds( fallback.panelOrder, DEMO3_VIEW_ID_LIST ) ),
    taskAnswer: normalizeStringId( candidateState?.taskAnswer, normalizeStringId( fallback.taskAnswer, null ) ),
    taskSubmitted: typeof candidateState?.taskSubmitted === 'boolean'
      ? candidateState.taskSubmitted
      : Boolean( fallback.taskSubmitted ),
  };

}
