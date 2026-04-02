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

export const SAMPLING_CONFIG = Object.freeze( {
  objectMinIntervalMs: 200,
  cameraMinIntervalMs: 300,
  pointerMinIntervalMs: 120,
  positionEpsilon: 0.01,
  quaternionAngleThresholdDeg: 2,
  pointerPositionEpsilon: 0.02,
  pointerRayLengthEpsilon: 0.02,
  enablePointerSampling: true,
} );

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
} );

function cloneTransform( transform = {} ) {

  return {
    position: [ ...( transform.position || [ 0, 0, 0 ] ) ],
    quaternion: [ ...( transform.quaternion || [ 0, 0, 0, 1 ] ) ],
  };

}

export function createHiddenReplayPointer( interactor ) {

  return {
    visible: false,
    interactor,
    origin: [ 0, 0, 0 ],
    target: [ 0, 0, 0 ],
    rayLength: 0,
    mode: POINTER_MODES.HIDDEN,
  };

}

function cloneReplayPointer( pointer = {}, fallback = createHiddenReplayPointer( null ) ) {

  return {
    visible: pointer.visible === true,
    interactor: typeof pointer.interactor === 'string' ? pointer.interactor : fallback.interactor,
    origin: [ ...( pointer.origin || fallback.origin ) ],
    target: [ ...( pointer.target || fallback.target ) ],
    rayLength: typeof pointer.rayLength === 'number' ? pointer.rayLength : fallback.rayLength,
    mode: typeof pointer.mode === 'string' ? pointer.mode : fallback.mode,
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

export function createInitialXRLoggingState( sceneSnapshot, timestamp = Date.now() ) {

  const replayPointers = createInitialReplayPointers();

  return {
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
