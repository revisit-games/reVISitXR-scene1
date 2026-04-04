import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const example1LoggingConfig = Object.freeze( {
  pointer: Object.freeze( {
    hover: Object.freeze( {
      minIntervalMs: 220,
      positionEpsilon: 0.035,
      rayLengthEpsilon: 0.035,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.FULL,
      minIntervalMs: 140,
      positionEpsilon: 0.018,
      rayLengthEpsilon: 0.018,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 140,
    positionEpsilon: 0.015,
    quaternionAngleThresholdDeg: 1.2,
    flushOnSelectionChange: true,
    flushOnYearChange: true,
    flushOnPanelDragEnd: true,
  } ),
} );
