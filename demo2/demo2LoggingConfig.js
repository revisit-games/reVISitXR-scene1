import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const demo2LoggingConfig = Object.freeze( {
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
      positionEpsilon: 0.05,
      rayLengthEpsilon: 0.05,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 850,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 240,
    positionEpsilon: 0.04,
    quaternionAngleThresholdDeg: 3.5,
    flushOnYearChange: true,
    flushOnThresholdChange: true,
    flushOnDirectionModeChange: true,
    flushOnLabelsToggle: true,
    flushOnFocusChange: true,
    flushOnSelectionChange: true,
    flushOnResetView: true,
    flushOnResetFilters: true,
    flushOnTaskSubmit: true,
    flushOnGlobeDragEnd: true,
    flushOnGlobeMoveEnd: true,
    flushOnPanelDragEnd: true,
  } ),
  demo2: Object.freeze( {
    panelTransformCommitMinIntervalMs: 420,
    stableLabels: Object.freeze( {
      year: 'Change Demo 2 Year',
      threshold: 'Change Demo 2 Threshold',
      directionMode: 'Change Demo 2 Direction Mode',
      labels: 'Toggle Demo 2 Labels',
      focusCountry: 'Focus Demo 2 Country',
      selection: 'Select Demo 2 Flow',
      rotateGlobe: 'Rotate Demo 2 Globe',
      moveGlobe: 'Move Demo 2 Globe',
      resetView: 'Reset Demo 2 View',
      resetFilters: 'Reset Demo 2 Filters',
      taskSubmit: 'Submit Demo 2 Task',
      movePanel: 'Move Demo 2 Panel',
    } ),
  } ),
} );
