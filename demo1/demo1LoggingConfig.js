import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const demo1LoggingConfig = Object.freeze( {
  object: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 900,
      positionEpsilon: 0.05,
      quaternionAngleThresholdDeg: 8,
    } ),
  } ),
  camera: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 700,
      positionEpsilon: 0.05,
      quaternionAngleThresholdDeg: 7,
    } ),
  } ),
  pointer: Object.freeze( {
    hover: Object.freeze( {
      minIntervalMs: 420,
      positionEpsilon: 0.05,
      rayLengthEpsilon: 0.05,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.STATE_ONLY,
      minIntervalMs: 420,
      positionEpsilon: 0.045,
      rayLengthEpsilon: 0.045,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 850,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 420,
    positionEpsilon: 0.04,
    quaternionAngleThresholdDeg: 3.5,
    flushOnNavModeChange: true,
    flushOnOverviewToggle: true,
    flushOnScaleChange: false,
    flushOnSelectionChange: true,
    flushOnTaskSubmit: true,
  } ),
  demo1: Object.freeze( {
    scaleCommitDebounceMs: 320,
    scaleCommitMinDelta: 0.04,
    stableLabels: Object.freeze( {
      navMode: 'Switch Demo 1 Nav Mode',
      overview: 'Toggle Demo 1 Overview',
      scale: 'Scale Demo 1 Plot',
      selection: 'Select Demo 1 Point',
      taskSubmit: 'Submit Demo 1 Task',
    } ),
  } ),
} );
