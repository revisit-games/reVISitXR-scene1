import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const demo5LoggingConfig = Object.freeze( {
  object: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 1000,
      positionEpsilon: 0.1,
      quaternionAngleThresholdDeg: 10,
    } ),
  } ),
  camera: Object.freeze( {
    immersive: Object.freeze( {
      minIntervalMs: 800,
      positionEpsilon: 0.08,
      quaternionAngleThresholdDeg: 8,
    } ),
  } ),
  pointer: Object.freeze( {
    hover: Object.freeze( {
      minIntervalMs: 950,
      positionEpsilon: 0.1,
      rayLengthEpsilon: 0.12,
    } ),
    grabbing: Object.freeze( {
      behavior: POINTER_SAMPLING_BEHAVIORS.STATE_ONLY,
      minIntervalMs: 800,
      positionEpsilon: 0.1,
      rayLengthEpsilon: 0.12,
    } ),
    logImmediateSemanticTransitions: true,
  } ),
  outboundSync: Object.freeze( {
    minIntervalMs: 1200,
  } ),
  sceneState: Object.freeze( {
    minIntervalMs: 700,
    positionEpsilon: 0.05,
    quaternionAngleThresholdDeg: 4,
    flushOnLandmarkSelectionChange: true,
    flushOnComparisonModeSwitch: true,
    flushOnViewpointPresetSwitch: true,
    flushOnAnnotationToggle: true,
    flushOnHumanReferenceToggle: true,
    flushOnShadowCueToggle: true,
    flushOnRulerCueToggle: true,
    flushOnQuantLabelsToggle: true,
    flushOnResetScene: true,
    flushOnTaskSubmit: true,
  } ),
  demo5: Object.freeze( {
    stableLabels: Object.freeze( {
      landmarkSelection: 'Select Demo 5 Landmark',
      comparisonMode: 'Switch Demo 5 Comparison Mode',
      viewpointPreset: 'Switch Demo 5 Viewpoint',
      annotations: 'Toggle Demo 5 Annotations',
      humanReference: 'Toggle Demo 5 Human References',
      shadowCue: 'Toggle Demo 5 Shadow Cues',
      rulerCue: 'Toggle Demo 5 Ruler Cues',
      quantLabels: 'Toggle Demo 5 Quantitative Labels',
      resetScene: 'Reset Demo 5 Scene',
      taskSubmit: 'Submit Demo 5 Task',
    } ),
  } ),
} );
