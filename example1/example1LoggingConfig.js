import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const example1LoggingConfig = Object.freeze( {
  pointer: Object.freeze( {
    hover: Object.freeze( {
      minIntervalMs: 320,
      positionEpsilon: 0.05,
      rayLengthEpsilon: 0.05,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.STATE_ONLY,
      minIntervalMs: 320,
      positionEpsilon: 0.045,
      rayLengthEpsilon: 0.045,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 700,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 320,
    positionEpsilon: 0.03,
    quaternionAngleThresholdDeg: 2.5,
    flushOnSelectionChange: true,
    flushOnYearChange: false,
    flushOnPanelDragEnd: true,
  } ),
  example1: Object.freeze( {
    yearCommitDebounceMs: 240,
    panelDragIntermediateMinIntervalMs: 520,
    stableLabels: Object.freeze( {
      year: 'Change Example 1 Year',
      selectDatum: 'Select Example 1 Datum',
      clearSelection: 'Clear Example 1 Selection',
      movePanel: 'Move Example 1 Year Panel',
    } ),
  } ),
} );
