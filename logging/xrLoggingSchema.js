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
  positionEpsilon: 0.01,
  quaternionAngleThresholdDeg: 2,
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
} );

function cloneTransform( transform = {} ) {

  return {
    position: [ ...( transform.position || [ 0, 0, 0 ] ) ],
    quaternion: [ ...( transform.quaternion || [ 0, 0, 0, 1 ] ) ],
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

export function createInitialXRLoggingState( sceneSnapshot, timestamp = Date.now() ) {

  return {
    presentationMode: sceneSnapshot.presentationMode || PRESENTATION_MODES.DESKTOP,
    cube: cloneTransform( sceneSnapshot.cube ),
    camera: cloneTransform( sceneSnapshot.camera ),
    xrOrigin: cloneTransform( sceneSnapshot.xrOrigin ),
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
