import { Registry, initializeTrrack } from '@trrack/core';
import {
  ACTION_TYPES,
  ANALYSIS_MODES,
  DEFAULT_ANALYSIS_CONTROL,
  DEFAULT_SCENE_KEY,
  INTERACTION_PHASES,
  POINTER_MODES,
  POINTER_SAMPLING_BEHAVIORS,
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
  getSceneStateChangeLabel,
  getSessionEndLabel,
  getSessionStartLabel,
} from './xrLoggingSchema.js';
import {
  buildAnswerPayload,
  cameraTransformChanged,
  getCameraSamplingProfile,
  getObjectSamplingProfile,
  getReplayPointerChangeDetails,
  normalizeReplayPointers,
  normalizeReplayState,
  objectTransformChanged,
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

  state.sceneKey = sceneSnapshot.sceneKey || DEFAULT_SCENE_KEY;
  state.sceneState = cloneValue( sceneSnapshot.sceneState || {} );
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

function createSampleStats() {

  return {
    logged: 0,
    skippedUnchanged: 0,
    skippedPending: 0,
  };

}

function createLoggingStats() {

  return {
    object: createSampleStats(),
    camera: createSampleStats(),
    pointer: {
      logged: 0,
      semanticLogged: 0,
      skippedUnchanged: 0,
      skippedPending: 0,
      skippedGrabStateOnly: 0,
    },
    outboundSync: {
      flushed: 0,
      forcedFlushes: 0,
      throttledSchedules: 0,
    },
  };

}

function createPointerTimestampMap( initialValue = 0 ) {

  return Object.fromEntries(
    REPLAY_POINTER_IDS.map( ( interactor ) => [ interactor, initialValue ] ),
  );

}

function getGraphNodeCount( graphBackend ) {

  if ( graphBackend?.nodes instanceof Map ) {

    return graphBackend.nodes.size;

  }

  return Object.keys( graphBackend?.nodes || {} ).length;

}

export function createXRStudyLogger( {
  bridge,
  getSceneSnapshot,
  applyReplayState,
  normalizeSceneReplayState = ( sceneKey, sceneState, fallbackSceneState ) => (
    structuredClone( sceneState ?? fallbackSceneState ?? {} )
  ),
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

  const sceneStateChangeAction = registry.register( ACTION_TYPES.SCENE_STATE_CHANGE, ( state, payload ) => {

    applySceneSnapshotToState( state, payload.sceneSnapshot );
    state.activeInteractor = payload.interactor;
    state.interactionPhase = INTERACTION_PHASES.IDLE;
    state.lastEvent = {
      type: ACTION_TYPES.SCENE_STATE_CHANGE,
      timestamp: payload.timestamp,
      source: payload.source,
    };

  }, { eventType: ACTION_TYPES.SCENE_STATE_CHANGE, label: 'Scene State Change' } );

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
  const lastPointerSampleAt = createPointerTimestampMap( 0 );
  const loggingStats = createLoggingStats();
  let lastOutboundSyncAt = 0;
  let pendingOutboundSyncTimer = null;
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

  function canSyncOutbound() {

    return (
      ! isApplyingReplayState &&
      ! getIsAnalysisSession() &&
      ( hasAnalysisControl || ! bridge.isEnabled )
    );

  }

  function cancelPendingOutboundSync() {

    if ( pendingOutboundSyncTimer !== null ) {

      clearTimeout( pendingOutboundSyncTimer );
      pendingOutboundSyncTimer = null;

    }

  }

  function flushOutboundState( { forced = false } = {} ) {

    currentState = cloneValue( trrack.getState() );

    if ( ! canSyncOutbound() ) {

      cancelPendingOutboundSync();
      return false;

    }

    cancelPendingOutboundSync();
    bridge.postProvenance( trrack.graph.backend );
    bridge.postAnswers( buildAnswerPayload( currentState ) );
    lastOutboundSyncAt = performance.now();
    loggingStats.outboundSync.flushed += 1;

    if ( forced ) {

      loggingStats.outboundSync.forcedFlushes += 1;

    }

    return true;

  }

  function scheduleOutboundStateSync( eventType = null ) {

    currentState = cloneValue( trrack.getState() );

    if ( ! canSyncOutbound() ) {

      cancelPendingOutboundSync();
      return false;

    }

    if ( SAMPLING_CONFIG.outboundSync.forceFlushEventTypes.includes( eventType ) ) {

      return flushOutboundState( { forced: true } );

    }

    const now = performance.now();
    const elapsedMs = now - lastOutboundSyncAt;

    if ( elapsedMs >= SAMPLING_CONFIG.outboundSync.minIntervalMs ) {

      return flushOutboundState();

    }

    if ( pendingOutboundSyncTimer !== null ) {

      return false;

    }

    loggingStats.outboundSync.throttledSchedules += 1;
    pendingOutboundSyncTimer = setTimeout( () => {

      pendingOutboundSyncTimer = null;
      flushOutboundState();

    }, Math.max( 0, SAMPLING_CONFIG.outboundSync.minIntervalMs - elapsedMs ) );

    return false;

  }

  function runAction( label, action, eventType = null ) {

    if ( ! canRecord() ) {

      return false;

    }

    trrack.apply( label, action );
    scheduleOutboundStateSync( eventType );
    return true;

  }

  function applyAnalysisControl( control ) {

    const nextControl = normalizeAnalysisControl( control );
    const prevPolicy = JSON.stringify( buildInteractionPolicy() );

    latestAnalysisControl = nextControl;
    hasAnalysisControl = true;

    if ( nextControl.mode === ANALYSIS_MODES.ANALYSIS ) {

      cancelPendingOutboundSync();

    }

    if ( nextControl.mode !== ANALYSIS_MODES.ANALYSIS ) {

      hasReceivedReplayState = false;

    }

    const nextPolicy = JSON.stringify( buildInteractionPolicy() );

    if ( prevPolicy !== nextPolicy ) {

      notifyInteractionPolicyChange();

    }

    if ( nextControl.mode === ANALYSIS_MODES.STUDY ) {

      flushOutboundState( { forced: true } );

    }

    return cloneValue( nextControl );

  }

  function applyNormalizedReplayState( normalizedState ) {

    const prevPolicy = JSON.stringify( buildInteractionPolicy() );

    cancelPendingOutboundSync();
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

    currentState = cloneValue( trrack.getState() );

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

    const normalizedState = normalizeReplayState( incomingState, currentState, normalizeSceneReplayState );
    applyNormalizedReplayState( normalizedState );

  } );

  function updatePointerSampleTimestamps( interactors, now ) {

    for ( const interactor of interactors ) {

      if ( interactor in lastPointerSampleAt ) {

        lastPointerSampleAt[ interactor ] = now;

      }

    }

  }

  function buildLoggingStatsSnapshot() {

    return {
      object: { ...loggingStats.object },
      camera: { ...loggingStats.camera },
      pointer: { ...loggingStats.pointer },
      outboundSync: { ...loggingStats.outboundSync },
      graphNodeCount: getGraphNodeCount( trrack.graph.backend ),
      outboundSyncPending: pendingOutboundSyncTimer !== null,
    };

  }

  if ( bridge.isStandalone ) {

    notifyInteractionPolicyChange();

  }

  flushOutboundState( { forced: true } );

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
    getLoggingStats() {

      return buildLoggingStatsSnapshot();

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

      const normalizedState = normalizeReplayState( incomingState, currentState, normalizeSceneReplayState );
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
        ACTION_TYPES.MODE_CHANGE,
      );

    },
    recordSessionStart( { mode, source = 'system' } ) {

      const actionPayload = createLoggerActionPayload( getSceneSnapshot, { source } );
      actionPayload.sceneSnapshot.presentationMode = mode;

      return runAction(
        getSessionStartLabel( mode ),
        sessionStartAction( actionPayload ),
        ACTION_TYPES.SESSION_START,
      );

    },
    recordSessionEnd( { source = 'system' } ) {

      const actionPayload = createLoggerActionPayload( getSceneSnapshot, { source } );

      return runAction(
        getSessionEndLabel(),
        sessionEndAction( actionPayload ),
        ACTION_TYPES.SESSION_END,
      );

    },
    recordCameraReset( { source = 'system' } ) {

      return runAction(
        'Camera Reset',
        cameraResetAction( createLoggerActionPayload( getSceneSnapshot, { source } ) ),
        ACTION_TYPES.CAMERA_RESET,
      );

    },
    recordObjectGrabStart( { interactor, source = interactor } ) {

      return runAction(
        getGrabStartLabel( interactor ),
        objectGrabStartAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
        } ) ),
        ACTION_TYPES.OBJECT_GRAB_START,
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
        ACTION_TYPES.OBJECT_GRAB_END,
      );

    },
    recordSceneStateChange( {
      source = 'scene',
      interactor = null,
      label = null,
    } = {} ) {

      return runAction(
        getSceneStateChangeLabel( label ),
        sceneStateChangeAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
        } ) ),
        ACTION_TYPES.SCENE_STATE_CHANGE,
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
      const objectSamplingProfile = getObjectSamplingProfile( sceneSnapshot.presentationMode, SAMPLING_CONFIG );

      if ( ! objectTransformChanged( sceneSnapshot, currentState, SAMPLING_CONFIG ) ) {

        loggingStats.object.skippedUnchanged += 1;
        return 'unchanged';

      }

      if ( now - lastObjectSampleAt < objectSamplingProfile.minIntervalMs ) {

        loggingStats.object.skippedPending += 1;
        return 'pending';

      }

      lastObjectSampleAt = now;

      if ( runAction(
        'Sample Object Transform',
        objectTransformSampleAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
          sceneSnapshot,
        } ) ),
        ACTION_TYPES.OBJECT_TRANSFORM_SAMPLE,
      ) ) {

        loggingStats.object.logged += 1;
        return 'logged';

      }

      return 'unchanged';

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
      const cameraSamplingProfile = getCameraSamplingProfile( sceneSnapshot.presentationMode, SAMPLING_CONFIG );

      if ( ! cameraTransformChanged( sceneSnapshot, currentState, SAMPLING_CONFIG ) ) {

        loggingStats.camera.skippedUnchanged += 1;
        return 'unchanged';

      }

      if ( now - lastCameraSampleAt < cameraSamplingProfile.minIntervalMs ) {

        loggingStats.camera.skippedPending += 1;
        return 'pending';

      }

      lastCameraSampleAt = now;

      if ( runAction(
        'Sample Camera Transform',
        cameraTransformSampleAction( createLoggerActionPayload( getSceneSnapshot, {
          interactor,
          source,
          sceneSnapshot,
        } ) ),
        ACTION_TYPES.CAMERA_TRANSFORM_SAMPLE,
      ) ) {

        loggingStats.camera.logged += 1;
        return 'logged';

      }

      return 'unchanged';

    },
    samplePointerStateIfNeeded( {
      source = 'xr-pointer',
      now = performance.now(),
    } = {} ) {

      if ( ! canRecord() || ! SAMPLING_CONFIG.pointer.enabled ) {

        return 'unchanged';

      }

      const sceneSnapshot = getSceneSnapshot();
      sceneSnapshot.replayPointers = normalizeReplayPointers(
        sceneSnapshot.replayPointers,
        currentState.replayPointers,
      );
      const pointerChangeDetails = getReplayPointerChangeDetails( sceneSnapshot, currentState, SAMPLING_CONFIG );
      const changedPointerDetails = REPLAY_POINTER_IDS
        .map( ( interactor ) => pointerChangeDetails[ interactor ] )
        .filter( ( detail ) => detail.semanticChanged || detail.geometryChanged );

      if ( changedPointerDetails.length === 0 ) {

        loggingStats.pointer.skippedUnchanged += 1;
        return 'unchanged';

      }

      const semanticDetails = changedPointerDetails.filter( ( detail ) => detail.semanticChanged );
      const changedInteractors = changedPointerDetails.map( ( detail ) => detail.interactor );

      if (
        semanticDetails.length > 0 &&
        SAMPLING_CONFIG.pointer.logImmediateSemanticTransitions &&
        ! semanticDetails.every( ( detail ) => (
          detail.nextPointer.mode === POINTER_MODES.GRAB &&
          SAMPLING_CONFIG.pointer.grabbing.behavior === POINTER_SAMPLING_BEHAVIORS.OFF
        ) )
      ) {

        updatePointerSampleTimestamps( changedInteractors, now );

        if ( runAction(
          getPointerSampleLabel(),
          pointerStateSampleAction( createLoggerActionPayload( getSceneSnapshot, {
            interactor: null,
            source,
            sceneSnapshot,
          } ) ),
          ACTION_TYPES.POINTER_STATE_SAMPLE,
        ) ) {

          loggingStats.pointer.logged += 1;
          loggingStats.pointer.semanticLogged += 1;
          return 'logged';

        }

        return 'unchanged';

      }

      let hasEligiblePointerChange = false;
      let hasPendingPointerChange = false;
      let hasSuppressedGrabChange = false;

      for ( const detail of changedPointerDetails ) {

        const isGrabPointer = detail.nextPointer.mode === POINTER_MODES.GRAB;
        const grabBehavior = SAMPLING_CONFIG.pointer.grabbing.behavior;

        if ( isGrabPointer && ! detail.semanticChanged && grabBehavior !== POINTER_SAMPLING_BEHAVIORS.FULL ) {

          hasSuppressedGrabChange = true;
          continue;

        }

        if (
          isGrabPointer &&
          detail.semanticChanged &&
          grabBehavior === POINTER_SAMPLING_BEHAVIORS.OFF
        ) {

          hasSuppressedGrabChange = true;
          continue;

        }

        if ( now - lastPointerSampleAt[ detail.interactor ] < detail.samplingProfile.minIntervalMs ) {

          hasPendingPointerChange = true;
          continue;

        }

        hasEligiblePointerChange = true;

      }

      if ( hasEligiblePointerChange ) {

        updatePointerSampleTimestamps( changedInteractors, now );

        if ( runAction(
          getPointerSampleLabel(),
          pointerStateSampleAction( createLoggerActionPayload( getSceneSnapshot, {
            interactor: null,
            source,
            sceneSnapshot,
          } ) ),
          ACTION_TYPES.POINTER_STATE_SAMPLE,
        ) ) {

          loggingStats.pointer.logged += 1;

          if ( semanticDetails.length > 0 ) {

            loggingStats.pointer.semanticLogged += 1;

          }

          return 'logged';

        }

        return 'unchanged';

      }

      if ( hasPendingPointerChange ) {

        loggingStats.pointer.skippedPending += 1;
        return 'pending';

      }

      if ( hasSuppressedGrabChange ) {

        loggingStats.pointer.skippedGrabStateOnly += 1;
        return 'unchanged';

      }

      loggingStats.pointer.skippedUnchanged += 1;
      return 'unchanged';

    },
  };

}
