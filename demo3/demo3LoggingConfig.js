import { POINTER_SAMPLING_BEHAVIORS } from '../logging/xrLoggingSchema.js';

export const demo3LoggingConfig = Object.freeze( {
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
    minIntervalMs: 280,
    positionEpsilon: 0.035,
    quaternionAngleThresholdDeg: 3.5,
    flushOnLayoutModeChange: true,
    flushOnFocusViewChange: true,
    flushOnSelectViewChange: true,
    flushOnSelectionChange: true,
    flushOnLinkedHighlightToggle: true,
    flushOnPanelDragEnd: true,
    flushOnResetWorkspace: true,
    flushOnTaskSubmit: true,
  } ),
  demo3: Object.freeze( {
    panelTransformCommitMinIntervalMs: 360,
    stableLabels: Object.freeze( {
      layoutMode: 'Switch Demo 3 Layout Mode',
      focusView: 'Focus Demo 3 View',
      selectView: 'Select Demo 3 View',
      selection: 'Select Demo 3 Datum',
      linkedHighlight: 'Toggle Demo 3 Linked Highlighting',
      movePanel: 'Move Demo 3 Panel',
      resetWorkspace: 'Reset Demo 3 Workspace',
      taskSubmit: 'Submit Demo 3 Task',
    } ),
  } ),
} );
