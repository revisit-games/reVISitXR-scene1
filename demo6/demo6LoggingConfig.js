import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const demo6LoggingConfig = Object.freeze( {
  object: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 1200,
      positionEpsilon: 0.12,
      quaternionAngleThresholdDeg: 12,
    } ),
  } ),
  camera: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 650,
      positionEpsilon: 0.08,
      quaternionAngleThresholdDeg: 8,
    } ),
  } ),
  pointer: Object.freeze( {
    hover: Object.freeze( {
      minIntervalMs: 650,
      positionEpsilon: 0.08,
      rayLengthEpsilon: 0.1,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.STATE_ONLY,
      minIntervalMs: 650,
      positionEpsilon: 0.08,
      rayLengthEpsilon: 0.1,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 1000,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 700,
    positionEpsilon: 0.05,
    quaternionAngleThresholdDeg: 5,
    flushOnStartRound: true,
    flushOnSliceTarget: true,
    flushOnMissTarget: true,
    flushOnBombHit: true,
    flushOnEndRound: true,
    flushOnResetScene: true,
    flushOnTaskSubmit: true,
  } ),
  demo6: Object.freeze( {
    clockSampleIntervalMs: 750,
    trailSampleIntervalMs: 125,
    stableLabels: Object.freeze( {
      startRound: 'Start Demo 6 Round',
      sliceTarget: 'Slice Target',
      missTarget: 'Miss Target',
      bombHit: 'Hit Bomb',
      endRound: 'End Demo 6 Round',
      roundClock: 'Sample Demo 6 Round Clock',
      resetScene: 'Reset Demo 6 Scene',
      taskSubmit: 'Submit Demo 6 Task',
    } ),
  } ),
} );
