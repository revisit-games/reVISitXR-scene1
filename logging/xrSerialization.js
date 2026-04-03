import {
  INTERACTION_PHASES,
  POINTER_MODES,
  PRESENTATION_MODES,
  REPLAY_POINTER_IDS,
  REPLAY_POINTER_TOOLTIP_STATES,
  SUMMARY_RESPONSE_KEYS,
  getReplayPointerTooltipStateFromPointerMode,
  getReplayPointerTooltipText,
  createHiddenReplayPointer,
  createInitialXRLoggingState,
} from './xrLoggingSchema.js';

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

export function roundNumber( value, decimals = 3 ) {

  if ( ! isFiniteNumber( value ) ) {

    return 0;

  }

  const factor = 10 ** decimals;
  return Math.round( value * factor ) / factor;

}

export function roundArray( values, decimals = 3 ) {

  return values.map( ( value ) => roundNumber( value, decimals ) );

}

export function vector3ToArray( vector3 ) {

  return [ vector3.x, vector3.y, vector3.z ];

}

export function quaternionToArray( quaternion ) {

  return [ quaternion.x, quaternion.y, quaternion.z, quaternion.w ];

}

export function normalizeVector3Array( value, fallback = [ 0, 0, 0 ] ) {

  if ( Array.isArray( value ) && value.length === 3 && value.every( isFiniteNumber ) ) {

    return [ value[ 0 ], value[ 1 ], value[ 2 ] ];

  }

  return [ ...fallback ];

}

export function normalizeQuaternionArray( value, fallback = [ 0, 0, 0, 1 ] ) {

  if ( Array.isArray( value ) && value.length === 4 && value.every( isFiniteNumber ) ) {

    return [ value[ 0 ], value[ 1 ], value[ 2 ], value[ 3 ] ];

  }

  return [ ...fallback ];

}

export function positionDistance( positionA, positionB ) {

  const dx = positionA[ 0 ] - positionB[ 0 ];
  const dy = positionA[ 1 ] - positionB[ 1 ];
  const dz = positionA[ 2 ] - positionB[ 2 ];

  return Math.sqrt( dx * dx + dy * dy + dz * dz );

}

export function quaternionAngularDifferenceDeg( quaternionA, quaternionB ) {

  const dot =
    quaternionA[ 0 ] * quaternionB[ 0 ] +
    quaternionA[ 1 ] * quaternionB[ 1 ] +
    quaternionA[ 2 ] * quaternionB[ 2 ] +
    quaternionA[ 3 ] * quaternionB[ 3 ];

  const clampedDot = Math.min( 1, Math.max( - 1, Math.abs( dot ) ) );
  const angleRadians = 2 * Math.acos( clampedDot );

  return angleRadians * 180 / Math.PI;

}

export function transformChanged( transformA, transformB, samplingConfig ) {

  return (
    positionDistance( transformA.position, transformB.position ) > samplingConfig.positionEpsilon ||
    quaternionAngularDifferenceDeg(
      transformA.quaternion,
      transformB.quaternion,
    ) > samplingConfig.quaternionAngleThresholdDeg
  );

}

export function normalizeReplayPointer( value, fallback = createHiddenReplayPointer( null ) ) {

  const mode = Object.values( POINTER_MODES ).includes( value?.mode )
    ? value.mode
    : fallback.mode;
  const visible = value?.visible === true && mode !== POINTER_MODES.HIDDEN;
  const interactor = typeof value?.interactor === 'string' ? value.interactor : fallback.interactor;
  const tooltipState = Object.values( REPLAY_POINTER_TOOLTIP_STATES ).includes( value?.tooltipState )
    ? value.tooltipState
    : (
      visible
        ? getReplayPointerTooltipStateFromPointerMode( mode )
        : fallback.tooltipState
    );
  const tooltipVisible = visible && (
    typeof value?.tooltipVisible === 'boolean'
      ? value.tooltipVisible
      : true
  );

  return {
    visible,
    interactor,
    origin: normalizeVector3Array( value?.origin, fallback.origin ),
    target: normalizeVector3Array( value?.target, fallback.target ),
    rayLength: isFiniteNumber( value?.rayLength ) ? Math.max( 0, value.rayLength ) : fallback.rayLength,
    mode: visible ? mode : POINTER_MODES.HIDDEN,
    tooltipVisible,
    tooltipState,
    tooltipText: typeof value?.tooltipText === 'string' && value.tooltipText.trim().length > 0
      ? value.tooltipText
      : getReplayPointerTooltipText( interactor, tooltipState ),
  };

}

export function normalizeReplayPointers( value, fallback ) {

  const replayPointers = {};

  for ( const interactor of REPLAY_POINTER_IDS ) {

    replayPointers[ interactor ] = normalizeReplayPointer(
      value?.[ interactor ],
      fallback[ interactor ] || createHiddenReplayPointer( interactor ),
    );

  }

  return replayPointers;

}

export function replayPointerChanged( pointerA, pointerB, samplingConfig ) {

  if (
    pointerA.visible !== pointerB.visible ||
    pointerA.mode !== pointerB.mode ||
    pointerA.interactor !== pointerB.interactor ||
    pointerA.tooltipVisible !== pointerB.tooltipVisible ||
    pointerA.tooltipState !== pointerB.tooltipState ||
    pointerA.tooltipText !== pointerB.tooltipText
  ) {

    return true;

  }

  if ( ! pointerA.visible && ! pointerB.visible ) {

    return false;

  }

  return (
    positionDistance( pointerA.origin, pointerB.origin ) > samplingConfig.pointerPositionEpsilon ||
    positionDistance( pointerA.target, pointerB.target ) > samplingConfig.pointerPositionEpsilon ||
    Math.abs( pointerA.rayLength - pointerB.rayLength ) > samplingConfig.pointerRayLengthEpsilon
  );

}

export function replayPointersChanged( sceneSnapshot, currentState, samplingConfig ) {

  return REPLAY_POINTER_IDS.some( ( interactor ) => {

    return replayPointerChanged(
      sceneSnapshot.replayPointers[ interactor ],
      currentState.replayPointers[ interactor ],
      samplingConfig,
    );

  } );

}

export function objectTransformChanged( sceneSnapshot, currentState, samplingConfig ) {

  return transformChanged( sceneSnapshot.cube, currentState.cube, samplingConfig );

}

export function cameraTransformChanged( sceneSnapshot, currentState, samplingConfig ) {

  return (
    transformChanged( sceneSnapshot.camera, currentState.camera, samplingConfig ) ||
    transformChanged( sceneSnapshot.xrOrigin, currentState.xrOrigin, samplingConfig )
  );

}

export function buildCompactStateSummary( state ) {

  const visiblePointers = REPLAY_POINTER_IDS
    .filter( ( interactor ) => state.replayPointers[ interactor ]?.visible )
    .map( ( interactor ) => `${interactor}:${state.replayPointers[ interactor ].mode}` );

  return JSON.stringify( {
    mode: state.presentationMode,
    phase: state.interactionPhase,
    interactor: state.activeInteractor,
    sessions: state.metrics.sessionCount,
    grabs: state.metrics.grabCount,
    pointers: visiblePointers.length > 0 ? visiblePointers : [ 'none' ],
    cubePos: roundArray( state.cube.position, 2 ),
    cameraPos: roundArray( state.camera.position, 2 ),
    xrOriginPos: roundArray( state.xrOrigin.position, 2 ),
  } );

}

export function buildAnswerPayload( state ) {

  return {
    [ SUMMARY_RESPONSE_KEYS.XR_MODE ]: state.presentationMode,
    [ SUMMARY_RESPONSE_KEYS.XR_INTERACTION_PHASE ]: state.interactionPhase,
    [ SUMMARY_RESPONSE_KEYS.XR_GRAB_COUNT ]: state.metrics.grabCount,
    [ SUMMARY_RESPONSE_KEYS.XR_SESSION_COUNT ]: state.metrics.sessionCount,
    [ SUMMARY_RESPONSE_KEYS.XR_LAST_EVENT ]: `${state.lastEvent.type}:${state.lastEvent.source}`,
    [ SUMMARY_RESPONSE_KEYS.XR_STATE_SUMMARY_JSON ]: buildCompactStateSummary( state ),
  };

}

function normalizeTransform( value, fallback ) {

  return {
    position: normalizeVector3Array( value?.position, fallback.position ),
    quaternion: normalizeQuaternionArray( value?.quaternion, fallback.quaternion ),
  };

}

function normalizeMetrics( value, fallback ) {

  return {
    sessionCount: isFiniteNumber( value?.sessionCount ) ? value.sessionCount : fallback.sessionCount,
    vrSessionCount: isFiniteNumber( value?.vrSessionCount ) ? value.vrSessionCount : fallback.vrSessionCount,
    arSessionCount: isFiniteNumber( value?.arSessionCount ) ? value.arSessionCount : fallback.arSessionCount,
    grabCount: isFiniteNumber( value?.grabCount ) ? value.grabCount : fallback.grabCount,
    cameraSampleCount: isFiniteNumber( value?.cameraSampleCount ) ? value.cameraSampleCount : fallback.cameraSampleCount,
    objectSampleCount: isFiniteNumber( value?.objectSampleCount ) ? value.objectSampleCount : fallback.objectSampleCount,
  };

}

export function normalizeReplayState( candidateState, fallbackState ) {

  const fallbackSnapshot = {
    presentationMode: fallbackState.presentationMode || PRESENTATION_MODES.DESKTOP,
    cube: fallbackState.cube,
    camera: fallbackState.camera,
    xrOrigin: fallbackState.xrOrigin,
    replayPointers: fallbackState.replayPointers,
  };

  const normalizedBase = createInitialXRLoggingState(
    fallbackSnapshot,
    fallbackState.lastEvent?.timestamp || Date.now(),
  );

  const presentationMode =
    candidateState?.presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ||
    candidateState?.presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ||
    candidateState?.presentationMode === PRESENTATION_MODES.DESKTOP
      ? candidateState.presentationMode
      : fallbackState.presentationMode || normalizedBase.presentationMode;

  const activeInteractor = typeof candidateState?.activeInteractor === 'string'
    ? candidateState.activeInteractor
    : null;

  const interactionPhase = Object.values( INTERACTION_PHASES ).includes( candidateState?.interactionPhase )
    ? candidateState.interactionPhase
    : INTERACTION_PHASES.IDLE;

  return {
    presentationMode,
    cube: normalizeTransform( candidateState?.cube, fallbackState.cube || normalizedBase.cube ),
    camera: normalizeTransform( candidateState?.camera, fallbackState.camera || normalizedBase.camera ),
    xrOrigin: normalizeTransform( candidateState?.xrOrigin, fallbackState.xrOrigin || normalizedBase.xrOrigin ),
    replayPointers: normalizeReplayPointers(
      candidateState?.replayPointers,
      fallbackState.replayPointers || normalizedBase.replayPointers,
    ),
    activeInteractor,
    interactionPhase,
    metrics: normalizeMetrics( candidateState?.metrics, fallbackState.metrics || normalizedBase.metrics ),
    lastEvent: {
      type: typeof candidateState?.lastEvent?.type === 'string'
        ? candidateState.lastEvent.type
        : fallbackState.lastEvent?.type || normalizedBase.lastEvent.type,
      timestamp: isFiniteNumber( candidateState?.lastEvent?.timestamp )
        ? candidateState.lastEvent.timestamp
        : Date.now(),
      source: typeof candidateState?.lastEvent?.source === 'string'
        ? candidateState.lastEvent.source
        : fallbackState.lastEvent?.source || normalizedBase.lastEvent.source,
    },
  };

}
