import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const demo4LoggingConfig = Object.freeze( {
  object: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 950,
      positionEpsilon: 0.06,
      quaternionAngleThresholdDeg: 8,
    } ),
  } ),
  camera: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 750,
      positionEpsilon: 0.055,
      quaternionAngleThresholdDeg: 7,
    } ),
  } ),
  pointer: Object.freeze( {
    hover: Object.freeze( {
      minIntervalMs: 950,
      positionEpsilon: 0.08,
      rayLengthEpsilon: 0.08,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.STATE_ONLY,
      minIntervalMs: 700,
      positionEpsilon: 0.08,
      rayLengthEpsilon: 0.08,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 1200,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 700,
    positionEpsilon: 0.035,
    quaternionAngleThresholdDeg: 3.5,
    flushOnPlacementConfirm: true,
    flushOnPlacementReset: true,
    flushOnMetricChange: true,
    flushOnTimeSliceChange: true,
    flushOnLayerModeToggle: true,
    flushOnLabelsToggle: true,
    flushOnSiteSelection: true,
    flushOnDetailToggle: true,
    flushOnInteractionModalityChange: true,
    flushOnActivation: true,
    flushOnTaskSubmit: true,
  } ),
  demo4: Object.freeze( {
    stableLabels: Object.freeze( {
      placementConfirm: 'Confirm Demo 4 AR Placement',
      placementReset: 'Reset Demo 4 AR Placement',
      metric: 'Change Demo 4 Metric',
      timeSlice: 'Change Demo 4 Time Slice',
      layerMode: 'Toggle Demo 4 Layer Mode',
      labels: 'Toggle Demo 4 Labels',
      siteSelection: 'Select Demo 4 Site',
      detail: 'Toggle Demo 4 Detail',
      interactionModality: 'Change Demo 4 Interaction Modality',
      activation: 'Activate Demo 4 Site',
      taskSubmit: 'Submit Demo 4 Task',
    } ),
  } ),
} );
