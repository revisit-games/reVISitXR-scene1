import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const example1LoggingConfig = Object.freeze( {
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
    minIntervalMs: 900,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 450,
    positionEpsilon: 0.04,
    quaternionAngleThresholdDeg: 3.5,
    flushOnSelectionChange: true,
    flushOnYearChange: false,
    flushOnPanelDragEnd: true,
  } ),
  example1: Object.freeze( {
    yearCommitDebounceMs: 360,
    panelTransformCommitMinIntervalMs: 900,
    logPanelTransformOnPassiveHeightFollow: false,
    logPanelTransformOnSliderInteraction: true,
    logPanelTransformOnPanelDrag: true,
    logPanelTransformOnPanelDragEnd: true,
    stableLabels: Object.freeze( {
      year: 'Change Example 1 Year',
      selectDatum: 'Select Example 1 Datum',
      clearSelection: 'Clear Example 1 Selection',
      movePanel: 'Move Example 1 Year Panel',
    } ),
  } ),
} );
