export const PRESENTATION_MODES = Object.freeze( {
  DESKTOP: 'desktop',
  IMMERSIVE_VR: 'immersive-vr',
  IMMERSIVE_AR: 'immersive-ar',
} );

export const INTERACTION_PHASES = Object.freeze( {
  IDLE: 'idle',
  GRAB_START: 'grab-start',
  MANIPULATING: 'manipulating',
  GRAB_END: 'grab-end',
} );

export const INTERACTORS = Object.freeze( {
  DESKTOP_POINTER: 'desktop-pointer',
  CONTROLLER_0: 'controller-0',
  CONTROLLER_1: 'controller-1',
} );

export const REPLAY_POINTER_IDS = Object.freeze( [
  INTERACTORS.CONTROLLER_0,
  INTERACTORS.CONTROLLER_1,
] );

export const POINTER_MODES = Object.freeze( {
  HOVER: 'hover',
  GRAB: 'grab',
  HIDDEN: 'hidden',
} );

export const REPLAY_POINTER_TOOLTIP_STATES = Object.freeze( {
  DEFAULT: 'default',
  GRABBING: 'grabbing',
  RELEASED: 'released',
} );

export const ANALYSIS_MODES = Object.freeze( {
  STUDY: 'study',
  ANALYSIS: 'analysis',
} );

export const DEFAULT_ANALYSIS_CONTROL = Object.freeze( {
  mode: ANALYSIS_MODES.STUDY,
  isPlaying: false,
  participantId: null,
  trialId: null,
  allowLocalInteractionWhenPaused: true,
} );

export const SUMMARY_RESPONSE_KEYS = Object.freeze( {
  XR_MODE: 'xrMode',
  XR_INTERACTION_PHASE: 'xrInteractionPhase',
  XR_GRAB_COUNT: 'xrGrabCount',
  XR_SESSION_COUNT: 'xrSessionCount',
  XR_LAST_EVENT: 'xrLastEvent',
  XR_STATE_SUMMARY_JSON: 'xrStateSummaryJson',
} );

export const DEFAULT_SCENE_KEY = 'default-template';

export const ACTION_TYPES = Object.freeze( {
  SESSION_START: 'session-start',
  SESSION_END: 'session-end',
  MODE_CHANGE: 'mode-change',
  OBJECT_GRAB_START: 'object-grab-start',
  OBJECT_TRANSFORM_SAMPLE: 'object-transform-sample',
  OBJECT_GRAB_END: 'object-grab-end',
  CAMERA_TRANSFORM_SAMPLE: 'camera-transform-sample',
  CAMERA_RESET: 'camera-reset',
  POINTER_STATE_SAMPLE: 'pointer-state-sample',
  SCENE_STATE_CHANGE: 'scene-state-change',
} );

export const POINTER_SAMPLING_BEHAVIORS = Object.freeze( {
  OFF: 'off',
  STATE_ONLY: 'state-only',
  FULL: 'full',
} );

export const SAMPLING_CONFIG = Object.freeze( {
  object: Object.freeze( {
    desktop: Object.freeze( {
      minIntervalMs: 200,
      positionEpsilon: 0.01,
      quaternionAngleThresholdDeg: 2,
    } ),
    immersive: Object.freeze( {
      minIntervalMs: 400,
      positionEpsilon: 0.035,
      quaternionAngleThresholdDeg: 5.5,
    } ),
  } ),
  camera: Object.freeze( {
    desktop: Object.freeze( {
      minIntervalMs: 300,
      positionEpsilon: 0.015,
      quaternionAngleThresholdDeg: 2.5,
    } ),
    immersive: Object.freeze( {
      minIntervalMs: 350,
      positionEpsilon: 0.025,
      quaternionAngleThresholdDeg: 4,
    } ),
  } ),
  pointer: Object.freeze( {
    enabled: true,
    hover: Object.freeze( {
      minIntervalMs: 300,
      positionEpsilon: 0.05,
      rayLengthEpsilon: 0.05,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.STATE_ONLY,
      minIntervalMs: 400,
      positionEpsilon: 0.06,
      rayLengthEpsilon: 0.06,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 500,
    forceFlushEventTypes: Object.freeze( [
      ACTION_TYPES.MODE_CHANGE,
      ACTION_TYPES.SESSION_START,
      ACTION_TYPES.SESSION_END,
      ACTION_TYPES.OBJECT_GRAB_START,
      ACTION_TYPES.OBJECT_GRAB_END,
      ACTION_TYPES.CAMERA_RESET,
    ] ),
  } ),
} );

export const DEFAULT_SCENE_STATE_LOGGING_CONFIG = Object.freeze( {
  minIntervalMs: 0,
  positionEpsilon: 0,
  quaternionAngleThresholdDeg: 0,
  flushOnSelectionChange: false,
  flushOnYearChange: false,
  flushOnPanelDragEnd: false,
} );

export const DEFAULT_LOGGING_CONFIG = Object.freeze( {
  object: SAMPLING_CONFIG.object,
  camera: SAMPLING_CONFIG.camera,
  pointer: SAMPLING_CONFIG.pointer,
  outboundSync: SAMPLING_CONFIG.outboundSync,
  sceneState: DEFAULT_SCENE_STATE_LOGGING_CONFIG,
} );

function isPlainObject( value ) {

  return value !== null && typeof value === 'object' && ! Array.isArray( value );

}

function deepFreeze( value ) {

  if ( ! isPlainObject( value ) && ! Array.isArray( value ) ) {

    return value;

  }

  const nestedValues = Array.isArray( value )
    ? value
    : Object.values( value );

  nestedValues.forEach( ( nestedValue ) => deepFreeze( nestedValue ) );
  return Object.freeze( value );

}

function mergeConfigValues( baseValue, overrideValue ) {

  if ( overrideValue === undefined ) {

    if ( Array.isArray( baseValue ) ) {

      return [ ...baseValue ];

    }

    if ( isPlainObject( baseValue ) ) {

      return Object.fromEntries(
        Object.entries( baseValue ).map( ( [ key, nestedValue ] ) => (
          [ key, mergeConfigValues( nestedValue, undefined ) ]
        ) ),
      );

    }

    return baseValue;

  }

  if ( Array.isArray( overrideValue ) ) {

    return [ ...overrideValue ];

  }

  if ( ! isPlainObject( overrideValue ) ) {

    return overrideValue;

  }

  const mergedValue = isPlainObject( baseValue ) ? {
    ...Object.fromEntries(
      Object.entries( baseValue ).map( ( [ key, nestedValue ] ) => (
        [ key, mergeConfigValues( nestedValue, undefined ) ]
      ) ),
    ),
  } : {};

  Object.entries( overrideValue ).forEach( ( [ key, nestedValue ] ) => {

    mergedValue[ key ] = mergeConfigValues( mergedValue[ key ], nestedValue );

  } );

  return mergedValue;

}

export function resolveLoggingConfig( overrideConfig = null ) {

  return deepFreeze( mergeConfigValues( DEFAULT_LOGGING_CONFIG, overrideConfig || {} ) );

}

function cloneTransform( transform = {} ) {

  return {
    position: [ ...( transform.position || [ 0, 0, 0 ] ) ],
    quaternion: [ ...( transform.quaternion || [ 0, 0, 0, 1 ] ) ],
  };

}

function cloneSceneState( sceneState = {} ) {

  try {

    return structuredClone( sceneState || {} );

  } catch {

    return {};

  }

}

export function getReplayPointerBaseLabel( interactor ) {

  if ( interactor === INTERACTORS.CONTROLLER_0 ) {

    return 'LEFT CONTROLLER';

  }

  if ( interactor === INTERACTORS.CONTROLLER_1 ) {

    return 'RIGHT CONTROLLER';

  }

  return 'CONTROLLER';

}

export function getReplayPointerTooltipStateFromPointerMode( mode ) {

  return mode === POINTER_MODES.GRAB
    ? REPLAY_POINTER_TOOLTIP_STATES.GRABBING
    : REPLAY_POINTER_TOOLTIP_STATES.DEFAULT;

}

export function getReplayPointerTooltipText(
  interactor,
  tooltipState = REPLAY_POINTER_TOOLTIP_STATES.DEFAULT,
) {

  const baseLabel = getReplayPointerBaseLabel( interactor );

  if ( tooltipState === REPLAY_POINTER_TOOLTIP_STATES.GRABBING ) {

    return `${baseLabel}: GRABBING`;

  }

  if ( tooltipState === REPLAY_POINTER_TOOLTIP_STATES.RELEASED ) {

    return `${baseLabel}: RELEASED`;

  }

  return baseLabel;

}

export function applyReplayPointerTooltipState(
  pointer = createHiddenReplayPointer( null ),
  interactor = pointer?.interactor ?? null,
  tooltipState = REPLAY_POINTER_TOOLTIP_STATES.DEFAULT,
  tooltipVisible = pointer?.visible === true,
) {

  return {
    ...pointer,
    interactor,
    tooltipVisible,
    tooltipState,
    tooltipText: getReplayPointerTooltipText( interactor, tooltipState ),
  };

}

export function createHiddenReplayPointer( interactor ) {

  return applyReplayPointerTooltipState( {
    visible: false,
    interactor,
    origin: [ 0, 0, 0 ],
    target: [ 0, 0, 0 ],
    rayLength: 0,
    mode: POINTER_MODES.HIDDEN,
  }, interactor, REPLAY_POINTER_TOOLTIP_STATES.DEFAULT, false );

}

function cloneReplayPointer( pointer = {}, fallback = createHiddenReplayPointer( null ) ) {

  const interactor = typeof pointer.interactor === 'string' ? pointer.interactor : fallback.interactor;
  const visible = pointer.visible === true;
  const mode = typeof pointer.mode === 'string' ? pointer.mode : fallback.mode;
  const tooltipState = Object.values( REPLAY_POINTER_TOOLTIP_STATES ).includes( pointer.tooltipState )
    ? pointer.tooltipState
    : (
      visible && mode !== POINTER_MODES.HIDDEN
        ? getReplayPointerTooltipStateFromPointerMode( mode )
        : fallback.tooltipState
    );
  const tooltipVisible = visible && (
    typeof pointer.tooltipVisible === 'boolean'
      ? pointer.tooltipVisible
      : fallback.tooltipVisible
  );

  return {
    visible,
    interactor,
    origin: [ ...( pointer.origin || fallback.origin ) ],
    target: [ ...( pointer.target || fallback.target ) ],
    rayLength: typeof pointer.rayLength === 'number' ? pointer.rayLength : fallback.rayLength,
    mode,
    tooltipVisible,
    tooltipState,
    tooltipText: typeof pointer.tooltipText === 'string' && pointer.tooltipText.trim().length > 0
      ? pointer.tooltipText
      : getReplayPointerTooltipText( interactor, tooltipState ),
  };

}

export function createInitialReplayPointers() {

  return {
    [ INTERACTORS.CONTROLLER_0 ]: createHiddenReplayPointer( INTERACTORS.CONTROLLER_0 ),
    [ INTERACTORS.CONTROLLER_1 ]: createHiddenReplayPointer( INTERACTORS.CONTROLLER_1 ),
  };

}

export function getModeChangeLabel( mode ) {

  if ( mode === PRESENTATION_MODES.IMMERSIVE_AR ) {

    return 'Enter AR Mode';

  }

  if ( mode === PRESENTATION_MODES.IMMERSIVE_VR ) {

    return 'Enter VR Mode';

  }

  return 'Enter Desktop Mode';

}

export function getSessionStartLabel( mode ) {

  return mode === PRESENTATION_MODES.IMMERSIVE_AR ? 'Start AR Session' : 'Start VR Session';

}

export function getSessionEndLabel() {

  return 'End XR Session';

}

export function getGrabStartLabel( interactor ) {

  return interactor === INTERACTORS.DESKTOP_POINTER ? 'Desktop Grab Start' : 'XR Grab Start';

}

export function getGrabEndLabel( interactor ) {

  return interactor === INTERACTORS.DESKTOP_POINTER ? 'Desktop Grab End' : 'XR Grab End';

}

export function getPointerSampleLabel() {

  return 'Sample Pointer State';

}

export function getSceneStateChangeLabel( label = null ) {

  if ( typeof label === 'string' && label.trim().length > 0 ) {

    return label;

  }

  return 'Update Scene State';

}

export function createInitialXRLoggingState( sceneSnapshot, timestamp = Date.now() ) {

  const replayPointers = createInitialReplayPointers();

  return {
    sceneKey: sceneSnapshot.sceneKey || DEFAULT_SCENE_KEY,
    sceneState: cloneSceneState( sceneSnapshot.sceneState ),
    presentationMode: sceneSnapshot.presentationMode || PRESENTATION_MODES.DESKTOP,
    cube: cloneTransform( sceneSnapshot.cube ),
    camera: cloneTransform( sceneSnapshot.camera ),
    xrOrigin: cloneTransform( sceneSnapshot.xrOrigin ),
    replayPointers: {
      [ INTERACTORS.CONTROLLER_0 ]: cloneReplayPointer(
        sceneSnapshot.replayPointers?.[ INTERACTORS.CONTROLLER_0 ],
        replayPointers[ INTERACTORS.CONTROLLER_0 ],
      ),
      [ INTERACTORS.CONTROLLER_1 ]: cloneReplayPointer(
        sceneSnapshot.replayPointers?.[ INTERACTORS.CONTROLLER_1 ],
        replayPointers[ INTERACTORS.CONTROLLER_1 ],
      ),
    },
    activeInteractor: null,
    interactionPhase: INTERACTION_PHASES.IDLE,
    metrics: {
      sessionCount: 0,
      vrSessionCount: 0,
      arSessionCount: 0,
      grabCount: 0,
      cameraSampleCount: 0,
      objectSampleCount: 0,
    },
    lastEvent: {
      type: 'initial-sync',
      timestamp,
      source: 'system',
    },
  };

}
