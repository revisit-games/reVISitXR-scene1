import { Registry, initializeTrrack } from '@trrack/core';
import {
  ACTION_TYPES,
  INTERACTION_PHASES,
  PRESENTATION_MODES,
  SAMPLING_CONFIG,
  createInitialXRLoggingState,
  getGrabEndLabel,
  getGrabStartLabel,
  getModeChangeLabel,
  getSessionEndLabel,
  getSessionStartLabel,
} from './xrLoggingSchema.js';
import {
  buildAnswerPayload,
  cameraTransformChanged,
  normalizeReplayState,
  objectTransformChanged,
} from './xrSerialization.js';

function cloneValue( value ) {

  return structuredClone( value );

}

function applySceneSnapshotToState( state, sceneSnapshot ) {

  state.presentationMode = sceneSnapshot.presentationMode;
  state.cube.position = [ ...sceneSnapshot.cube.position ];
  state.cube.quaternion = [ ...sceneSnapshot.cube.quaternion ];
  state.camera.position = [ ...sceneSnapshot.camera.position ];
  state.camera.quaternion = [ ...sceneSnapshot.camera.quaternion ];
  state.xrOrigin.position = [ ...sceneSnapshot.xrOrigin.position ];
  state.xrOrigin.quaternion = [ ...sceneSnapshot.xrOrigin.quaternion ];

}

function createLoggerActionPayload( getSceneSnapshot, {
  source = 'system',
  interactor = null,
  sceneSnapshot,
} = {} ) {

  return {
    sceneSnapshot: sceneSnapshot || getSceneSnapshot(),
    source,
    interactor,
    timestamp: Date.now(),
  };

}

export function createXRStudyLogger( {
  bridge,
  getSceneSnapshot,
  applyReplayState,
} ) {

  const registry = Registry.create();

  const modeChangeAction = registry.register( ACTION_TYPES.MODE_CHANGE, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = null;
    state.interactionPhase = INTERACTION_PHASES.IDLE;
    state.lastEvent = {
      type: ACTION_TYPES.MODE_CHANGE,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.MODE_CHANGE, label: 'Mode Change' } );

  const sessionStartAction = registry.register( ACTION_TYPES.SESSION_START, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = null;
    state.interactionPhase = INTERACTION_PHASES.IDLE;
    state.metrics.sessionCount += 1;

    if ( payload.sceneSnapshot.presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

      state.metrics.vrSessionCount += 1;

    } else if ( payload.sceneSnapshot.presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

      state.metrics.arSessionCount += 1;

    }

    state.lastEvent = {
      type: ACTION_TYPES.SESSION_START,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.SESSION_START, label: 'Session Start' } );

  const sessionEndAction = registry.register( ACTION_TYPES.SESSION_END, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = null;
    state.interactionPhase = INTERACTION_PHASES.IDLE;
    state.lastEvent = {
      type: ACTION_TYPES.SESSION_END,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.SESSION_END, label: 'Session End' } );

  const objectGrabStartAction = registry.register( ACTION_TYPES.OBJECT_GRAB_START, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = payload.interactor;
    state.interactionPhase = INTERACTION_PHASES.GRAB_START;
    state.metrics.grabCount += 1;
    state.lastEvent = {
      type: ACTION_TYPES.OBJECT_GRAB_START,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.OBJECT_GRAB_START, label: 'Object Grab Start' } );

  const objectTransformSampleAction = registry.register( ACTION_TYPES.OBJECT_TRANSFORM_SAMPLE, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = payload.interactor;
    state.interactionPhase = INTERACTION_PHASES.MANIPULATING;
    state.metrics.objectSampleCount += 1;
    state.lastEvent = {
      type: ACTION_TYPES.OBJECT_TRANSFORM_SAMPLE,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.OBJECT_TRANSFORM_SAMPLE, label: 'Object Transform Sample' } );

  const objectGrabEndAction = registry.register( ACTION_TYPES.OBJECT_GRAB_END, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = null;
    state.interactionPhase = INTERACTION_PHASES.GRAB_END;
    state.lastEvent = {
      type: ACTION_TYPES.OBJECT_GRAB_END,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.OBJECT_GRAB_END, label: 'Object Grab End' } );

  const cameraTransformSampleAction = registry.register( ACTION_TYPES.CAMERA_TRANSFORM_SAMPLE, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = payload.interactor;
    state.interactionPhase = payload.interactor ? state.interactionPhase : INTERACTION_PHASES.IDLE;
    state.metrics.cameraSampleCount += 1;
    state.lastEvent = {
      type: ACTION_TYPES.CAMERA_TRANSFORM_SAMPLE,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.CAMERA_TRANSFORM_SAMPLE, label: 'Camera Transform Sample' } );

  const cameraResetAction = registry.register( ACTION_TYPES.CAMERA_RESET, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = null;
    state.interactionPhase = INTERACTION_PHASES.IDLE;
    state.lastEvent = {
      type: ACTION_TYPES.CAMERA_RESET,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.CAMERA_RESET, label: 'Camera Reset' } );

  const trrack = initializeTrrack( {
    registry,
    initialState: createInitialXRLoggingState( getSceneSnapshot() ),
  } );

  let currentState = cloneValue( trrack.getState() );
  let latestStudyData = null;
  let latestIncomingAnswers = null;
  let lastObjectSampleAt = 0;
  let lastCameraSampleAt = 0;
  let isApplyingReplayState = false;
  let isReplayControlled = false;

  function syncOutboundState() {

    currentState = cloneValue( trrack.getState() );

    if ( isApplyingReplayState || isReplayControlled ) {

      return;

    }

    bridge.postProvenance( trrack.graph.backend );
    bridge.postAnswers( buildAnswerPayload( currentState ) );

  }

  function canRecord() {

    return ! isApplyingReplayState && ! isReplayControlled;

  }

  function runAction( label, action ) {

    if ( ! canRecord() ) {

      return false;

    }

    trrack.apply( label, action );
    return true;

  }

  trrack.currentChange( () => {

    syncOutboundState();

  } );

  bridge.onDataReceive( ( studyData ) => {

    latestStudyData = studyData;

  } );

  bridge.onAnswersReceive( ( answers ) => {

    latestIncomingAnswers = answers;

  } );

  bridge.onProvenanceReceive( ( incomingState ) => {

    isReplayControlled = true;

    const normalizedState = normalizeReplayState( incomingState, currentState );
    currentState = cloneValue( normalizedState );

    isApplyingReplayState = true;

    try {

      applyReplayState( normalizedState );

    } finally {

      isApplyingReplayState = false;

    }

  } );

  syncOutboundState();

  return {
    getState() {

      return cloneValue( currentState );

    },
    getGraph() {

      return cloneValue( trrack.graph.backend );

    },
    exportAnswers() {

      return buildAnswerPayload( currentState );

    },
    getStudyData() {

      return latestStudyData;

    },
    getIncomingAnswers() {

      return latestIncomingAnswers;

    },
    isApplyingReplayState() {

      return isApplyingReplayState;

    },
    isReplayControlled() {

      return isReplayControlled;

    },
    canInteract() {

      return ! isReplayControlled && ! isApplyingReplayState;

    },
    applyReplayStateSnapshot( incomingState ) {

      const normalizedState = normalizeReplayState( incomingState, currentState );
      isReplayControlled = true;
      currentState = cloneValue( normalizedState );

      isApplyingReplayState = true;

      try {

        applyReplayState( normalizedState );

      } finally {

        isApplyingReplayState = false;

      }

      return cloneValue( normalizedState );

    },
    recordModeChange( { mode, source = 'system' } ) {

      const actionPayload = createLoggerActionPayload( getSceneSnapshot, { source } );
      actionPayload.sceneSnapshot.presentationMode = mode;

      if ( currentState.presentationMode === actionPayload.sceneSnapshot.presentationMode ) {

        return false;

      }

      return runAction(
        getModeChangeLabel( mode ),
        modeChangeAction( actionPayload ),
      );

    },
    recordSessionStart( { mode, source = 'system' } ) {

      const actionPayload = createLoggerActionPayload( getSceneSnapshot, { source } );
      actionPayload.sceneSnapshot.presentationMode = mode;

      return runAction(
        getSessionStartLabel( mode ),
        sessionStartAction( actionPayload ),
      );

    },
    recordSessionEnd( { source = 'system' } ) {

      const actionPayload = createLoggerActionPayload( getSceneSnapshot, { source } );

      return runAction(
        getSessionEndLabel(),
        sessionEndAction( actionPayload ),
      );

    },
    recordCameraReset( { source = 'system' } ) {

      return runAction(
        'Camera Reset',
        cameraResetAction( createLoggerActionPayload( getSceneSnapshot, { source } ) ),
      );

    },
    recordObjectGrabStart( { interactor, source = interactor } ) {

      return runAction(
        getGrabStartLabel( interactor ),
        objectGrabStartAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
        } ) ),
      );

    },
    recordObjectGrabEnd( { interactor, source = interactor } ) {

      return runAction(
        getGrabEndLabel( interactor ),
        objectGrabEndAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
        } ) ),
      );

    },
    sampleObjectTransformIfNeeded( {
      interactor,
      source = interactor,
      now = performance.now(),
    } ) {

      if ( ! canRecord() ) {

        return 'unchanged';

      }

      const sceneSnapshot = getSceneSnapshot();

      if ( ! objectTransformChanged( sceneSnapshot, currentState, SAMPLING_CONFIG ) ) {

        return 'unchanged';

      }

      if ( now - lastObjectSampleAt < SAMPLING_CONFIG.objectMinIntervalMs ) {

        return 'pending';

      }

      lastObjectSampleAt = now;

      runAction(
        'Sample Object Transform',
        objectTransformSampleAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
          sceneSnapshot,
        } ) ),
      );

      return 'logged';

    },
    sampleCameraTransformIfNeeded( {
      interactor = null,
      source = 'camera',
      now = performance.now(),
    } ) {

      if ( ! canRecord() ) {

        return 'unchanged';

      }

      const sceneSnapshot = getSceneSnapshot();

      if ( ! cameraTransformChanged( sceneSnapshot, currentState, SAMPLING_CONFIG ) ) {

        return 'unchanged';

      }

      if ( now - lastCameraSampleAt < SAMPLING_CONFIG.cameraMinIntervalMs ) {

        return 'pending';

      }

      lastCameraSampleAt = now;

      runAction(
        'Sample Camera Transform',
        cameraTransformSampleAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
          sceneSnapshot,
        } ) ),
      );

      return 'logged';

    },
  };

}
