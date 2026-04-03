import { Registry, initializeTrrack } from '@trrack/core';
import {
  ACTION_TYPES,
  ANALYSIS_MODES,
  DEFAULT_ANALYSIS_CONTROL,
  INTERACTION_PHASES,
  PRESENTATION_MODES,
  REPLAY_POINTER_IDS,
  SAMPLING_CONFIG,
  REPLAY_POINTER_TOOLTIP_STATES,
  applyReplayPointerTooltipState,
  createHiddenReplayPointer,
  createInitialXRLoggingState,
  getGrabEndLabel,
  getGrabStartLabel,
  getModeChangeLabel,
  getPointerSampleLabel,
  getSessionEndLabel,
  getSessionStartLabel,
} from './xrLoggingSchema.js';
import {
  buildAnswerPayload,
  cameraTransformChanged,
  normalizeReplayPointers,
  normalizeReplayState,
  objectTransformChanged,
  replayPointersChanged,
} from './xrSerialization.js';

function cloneValue( value ) {

  return structuredClone( value );

}

function createListenerSet() {

  return new Set();

}

function notifyListeners( listeners, value ) {

  const payload = cloneValue( value );

  for ( const listener of listeners ) {

    listener( payload );

  }

}

function applySceneSnapshotToState( state, sceneSnapshot ) {

  state.presentationMode = sceneSnapshot.presentationMode;
  state.cube.position = [ ...sceneSnapshot.cube.position ];
  state.cube.quaternion = [ ...sceneSnapshot.cube.quaternion ];
  state.camera.position = [ ...sceneSnapshot.camera.position ];
  state.camera.quaternion = [ ...sceneSnapshot.camera.quaternion ];
  state.xrOrigin.position = [ ...sceneSnapshot.xrOrigin.position ];
  state.xrOrigin.quaternion = [ ...sceneSnapshot.xrOrigin.quaternion ];

  for ( const interactor of REPLAY_POINTER_IDS ) {

    const nextPointer = sceneSnapshot.replayPointers?.[ interactor ] || createHiddenReplayPointer( interactor );

    state.replayPointers[ interactor ] = {
      visible: nextPointer.visible,
      interactor: nextPointer.interactor,
      origin: [ ...nextPointer.origin ],
      target: [ ...nextPointer.target ],
      rayLength: nextPointer.rayLength,
      mode: nextPointer.mode,
      tooltipVisible: nextPointer.tooltipVisible,
      tooltipState: nextPointer.tooltipState,
      tooltipText: nextPointer.tooltipText,
    };

  }

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

function normalizeAnalysisControl( control ) {

  return {
    ...DEFAULT_ANALYSIS_CONTROL,
    ...( control || {} ),
    mode: control?.mode === ANALYSIS_MODES.ANALYSIS ? ANALYSIS_MODES.ANALYSIS : ANALYSIS_MODES.STUDY,
    isPlaying: control?.isPlaying === true,
    participantId: typeof control?.participantId === 'string' ? control.participantId : null,
    trialId: typeof control?.trialId === 'string' ? control.trialId : null,
    allowLocalInteractionWhenPaused: control?.allowLocalInteractionWhenPaused !== false,
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

  const pointerStateSampleAction = registry.register( ACTION_TYPES.POINTER_STATE_SAMPLE, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.lastEvent = {
      type: ACTION_TYPES.POINTER_STATE_SAMPLE,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.POINTER_STATE_SAMPLE, label: 'Pointer State Sample' } );

  const trrack = initializeTrrack( {
    registry,
    initialState: createInitialXRLoggingState( getSceneSnapshot() ),
  } );

  const interactionPolicyListeners = createListenerSet();

  let currentState = cloneValue( trrack.getState() );
  let latestStudyData = null;
  let latestIncomingAnswers = null;
  let latestAnalysisControl = normalizeAnalysisControl( null );
  let hasAnalysisControl = bridge.isStandalone;
  let lastObjectSampleAt = 0;
  let lastCameraSampleAt = 0;
  let lastPointerSampleAt = 0;
  let isApplyingReplayState = false;
  let hasReceivedReplayState = false;

  function getIsAnalysisSession() {

    return latestAnalysisControl.mode === ANALYSIS_MODES.ANALYSIS;

  }

  function getIsAnalysisPlaybackActive() {

    return getIsAnalysisSession() && latestAnalysisControl.isPlaying;

  }

  function canRecord() {

    return (
      ! isApplyingReplayState &&
      ! getIsAnalysisSession() &&
      ( hasAnalysisControl || ! bridge.isEnabled )
    );

  }

  function canInteract() {

    if ( isApplyingReplayState ) {

      return false;

    }

    if ( ! getIsAnalysisSession() ) {

      return true;

    }

    return latestAnalysisControl.allowLocalInteractionWhenPaused && ! latestAnalysisControl.isPlaying;

  }

  function canEnterImmersiveSession() {

    return ! getIsAnalysisSession() && ! isApplyingReplayState;

  }

  function buildInteractionPolicy() {

    return {
      isAnalysisSession: getIsAnalysisSession(),
      analysisPlaybackActive: getIsAnalysisPlaybackActive(),
      isApplyingReplayState,
      hasReceivedReplayState,
      canRecord: canRecord(),
      canInteract: canInteract(),
      canEnterImmersiveSession: canEnterImmersiveSession(),
      allowLocalInteractionWhenPaused: latestAnalysisControl.allowLocalInteractionWhenPaused,
      analysisControl: latestAnalysisControl,
    };

  }

  function notifyInteractionPolicyChange() {

    notifyListeners( interactionPolicyListeners, buildInteractionPolicy() );

  }

  function addInteractionPolicyListener( fn ) {

    interactionPolicyListeners.add( fn );
    fn( cloneValue( buildInteractionPolicy() ) );
    return () => interactionPolicyListeners.delete( fn );

  }

  function syncOutboundState() {

    currentState = cloneValue( trrack.getState() );

    if (
      isApplyingReplayState ||
      getIsAnalysisSession() ||
      ( bridge.isEnabled && ! hasAnalysisControl )
    ) {

      return;

    }

    bridge.postProvenance( trrack.graph.backend );
    bridge.postAnswers( buildAnswerPayload( currentState ) );

  }

  function runAction( label, action ) {

    if ( ! canRecord() ) {

      return false;

    }

    trrack.apply( label, action );
    return true;

  }

  function applyAnalysisControl( control ) {

    const nextControl = normalizeAnalysisControl( control );
    const prevPolicy = JSON.stringify( buildInteractionPolicy() );

    latestAnalysisControl = nextControl;
    hasAnalysisControl = true;

    if ( nextControl.mode !== ANALYSIS_MODES.ANALYSIS ) {

      hasReceivedReplayState = false;

    }

    const nextPolicy = JSON.stringify( buildInteractionPolicy() );

    if ( prevPolicy !== nextPolicy ) {

      notifyInteractionPolicyChange();

    }

    if ( nextControl.mode === ANALYSIS_MODES.STUDY ) {

      syncOutboundState();

    }

    return cloneValue( nextControl );

  }

  function applyNormalizedReplayState( normalizedState ) {

    const prevPolicy = JSON.stringify( buildInteractionPolicy() );

    hasReceivedReplayState = true;
    currentState = cloneValue( normalizedState );
    isApplyingReplayState = true;

    if ( prevPolicy !== JSON.stringify( buildInteractionPolicy() ) ) {

      notifyInteractionPolicyChange();

    }

    try {

      applyReplayState( normalizedState );

    } finally {

      const policyBeforeFinish = JSON.stringify( buildInteractionPolicy() );
      isApplyingReplayState = false;

      if ( policyBeforeFinish !== JSON.stringify( buildInteractionPolicy() ) ) {

        notifyInteractionPolicyChange();

      }

    }

    return cloneValue( normalizedState );

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

  bridge.onAnalysisControlReceive( ( control ) => {

    applyAnalysisControl( control );

  } );

  bridge.onProvenanceReceive( ( incomingState ) => {

    const normalizedState = normalizeReplayState( incomingState, currentState );
    applyNormalizedReplayState( normalizedState );

  } );

  if ( bridge.isStandalone ) {

    notifyInteractionPolicyChange();

  }

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
    getAnalysisControl() {

      return cloneValue( latestAnalysisControl );

    },
    getInteractionPolicy() {

      return cloneValue( buildInteractionPolicy() );

    },
    onInteractionPolicyChange( fn ) {

      return addInteractionPolicyListener( fn );

    },
    setAnalysisControl( control ) {

      return applyAnalysisControl( control );

    },
    isAnalysisSession() {

      return getIsAnalysisSession();

    },
    isApplyingReplayState() {

      return isApplyingReplayState;

    },
    isReplayControlled() {

      return hasReceivedReplayState;

    },
    canRecord() {

      return canRecord();

    },
    canInteract() {

      return canInteract();

    },
    canEnterImmersiveSession() {

      return canEnterImmersiveSession();

    },
    applyReplayStateSnapshot( incomingState ) {

      const normalizedState = normalizeReplayState( incomingState, currentState );
      return applyNormalizedReplayState( normalizedState );

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

      const sceneSnapshot = getSceneSnapshot();

      if ( REPLAY_POINTER_IDS.includes( interactor ) ) {

        const currentPointer = sceneSnapshot.replayPointers?.[ interactor ] || createHiddenReplayPointer( interactor );

        sceneSnapshot.replayPointers = {
          ...sceneSnapshot.replayPointers,
          [ interactor ]: applyReplayPointerTooltipState(
            currentPointer,
            interactor,
            REPLAY_POINTER_TOOLTIP_STATES.RELEASED,
            currentPointer.visible,
          ),
        };

      }

      return runAction(
        getGrabEndLabel( interactor ),
        objectGrabEndAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
          sceneSnapshot,
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
    samplePointerStateIfNeeded( {
      source = 'xr-pointer',
      now = performance.now(),
    } = {} ) {

      if ( ! canRecord() || ! SAMPLING_CONFIG.enablePointerSampling ) {

        return 'unchanged';

      }

      const sceneSnapshot = getSceneSnapshot();
      sceneSnapshot.replayPointers = normalizeReplayPointers(
        sceneSnapshot.replayPointers,
        currentState.replayPointers,
      );

      if ( ! replayPointersChanged( sceneSnapshot, currentState, SAMPLING_CONFIG ) ) {

        return 'unchanged';

      }

      if ( now - lastPointerSampleAt < SAMPLING_CONFIG.pointerMinIntervalMs ) {

        return 'pending';

      }

      lastPointerSampleAt = now;

      runAction(
        getPointerSampleLabel(),
        pointerStateSampleAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor: null,
          source,
          sceneSnapshot,
        } ) ),
      );

      return 'logged';

    },
  };

}
