import { INTERACTORS } from './logging/xrLoggingSchema.js';

export const replayVisualConfig = Object.freeze( {
  pointerColors: Object.freeze( {
    [ INTERACTORS.CONTROLLER_0 ]: 0xff6b6b,
    [ INTERACTORS.CONTROLLER_1 ]: 0x4ecdc4,
  } ),
  pointerTooltips: Object.freeze( {
    anchorLerp: 0.74,
    verticalOffset: 0.07,
    textColor: '#f6fbff',
    backgroundOpacity: 0.18,
    borderOpacity: 0.62,
  } ),
  replayAvatar: Object.freeze( {
    headModelPath: '/userhead.obj',
    headScale: 0.00024,
    headRotationY: Math.PI,
    headOffsetBack: 0.22,
    headOffsetDown: 0.14,
    headTooltipText: 'USER SIGHT',
    headTooltipVerticalOffset: 0.16,
    headArrowLength: 0.22,
    headArrowColor: 0xffb347,
    headMaterialType: 'phong',
    headMaterialColor: 0xe4edf8,
    headMaterialEmissive: 0x1a2432,
    headMaterialOpacity: 0.94,
    headUseDoubleSide: true,
    headCastShadow: false,
    headReceiveShadow: false,
    headRecomputeNormals: true,
    headNormalizeNormals: true,
    headComputeBoundingBox: true,
    headComputeBoundingSphere: true,
  } ),
  performance: Object.freeze( {
    lazyLoadReplayAvatar: true,
    renderCssLabelsOnlyInAnalysis: true,
    disableReplayVisualsDuringImmersiveStudy: true,
  } ),
  pausedOverlay: Object.freeze( {
    bannerText: 'Replay Paused. Free Camera Moving',
    borderColor: '#ffb347',
    bannerBackground: 'rgba(255, 179, 71, 0.18)',
    bannerTextColor: '#fff2db',
  } ),
} );
