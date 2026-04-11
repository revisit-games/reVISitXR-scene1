import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { createRevisitBridge } from './logging/revisitBridge.js';
import {
  DEFAULT_SCENE_KEY,
  INTERACTORS,
  POINTER_MODES,
  PRESENTATION_MODES,
  REPLAY_POINTER_IDS,
  REPLAY_POINTER_TOOLTIP_STATES,
  createHiddenReplayPointer,
  getReplayPointerTooltipText,
  resolveLoggingConfig,
} from './logging/xrLoggingSchema.js';
import { createXRStudyLogger } from './logging/xrStudyLogger.js';
import { replayVisualConfig } from './replayVisualConfig.js';
import {
  getSceneDefinitionByKey,
  resolveSceneDefinitionFromSearch,
} from './scenes/core/sceneRegistry.js';
import {
  quaternionToArray,
  vector3ToArray,
} from './logging/xrSerialization.js';

const scene = new THREE.Scene();
const defaultBackground = new THREE.Color( 0x0b1320 );
const defaultFog = new THREE.Fog( 0x0b1320, 6, 18 );
scene.background = defaultBackground;
scene.fog = defaultFog;

const initialDesktopCameraPosition = new THREE.Vector3( 0, 1.6, 3 );
const initialDesktopCameraQuaternion = new THREE.Quaternion();

const camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.copy( initialDesktopCameraPosition );
camera.quaternion.copy( initialDesktopCameraQuaternion );

const xrOrigin = new THREE.Group();
scene.add( xrOrigin );
xrOrigin.add( camera );

const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType( 'local-floor' );
renderer.domElement.style.touchAction = 'none';
document.body.appendChild( renderer.domElement );

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize( window.innerWidth, window.innerHeight );
labelRenderer.domElement.id = 'replay-label-layer';
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.display = 'none';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.overflow = 'hidden';
labelRenderer.domElement.style.zIndex = '18';
document.body.appendChild( labelRenderer.domElement );

const hudTitle = document.querySelector( '#hud-title' );
const hudBody = document.querySelector( '#hud-body' );
const hudNote = document.querySelector( '#hud-note' );
const scenePanelRoot = document.querySelector( '#scene-panel' );
const pausedOverlayFrame = document.querySelector( '#analysis-paused-frame' );
const pausedOverlayBanner = document.querySelector( '#analysis-paused-banner' );

const light = new THREE.HemisphereLight( 0xdbe7ff, 0x2a1e12, 1.6 );
scene.add( light );

const keyLight = new THREE.DirectionalLight( 0xffffff, 1.6 );
keyLight.position.set( 3, 5, 2 );
keyLight.castShadow = true;
keyLight.shadow.mapSize.set( 1024, 1024 );
scene.add( keyLight );

const environmentRoot = new THREE.Group();
scene.add( environmentRoot );

const sceneContentRoot = new THREE.Group();
scene.add( sceneContentRoot );

const floor = new THREE.Mesh(
  new THREE.CircleGeometry( 8, 64 ),
  new THREE.MeshStandardMaterial( {
    color: 0x263449,
    roughness: 0.96,
    metalness: 0.05,
  } ),
);
floor.rotation.x = - Math.PI / 2;
floor.receiveShadow = true;
environmentRoot.add( floor );

const grid = new THREE.GridHelper( 8, 20, 0x7aa6ff, 0x335077 );
grid.position.y = 0.01;
environmentRoot.add( grid );

const cubeMaterial = new THREE.MeshStandardMaterial( {
  color: 0x4dd0a8,
  emissive: 0x000000,
  roughness: 0.35,
  metalness: 0.08,
} );

const cube = new THREE.Mesh( new THREE.BoxGeometry( 0.35, 0.35, 0.35 ), cubeMaterial );
cube.castShadow = true;
cube.receiveShadow = true;
cube.userData.grabbedBy = null;
scene.add( cube );

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry( 0.23, 0.26, 0.8, 32 ),
  new THREE.MeshStandardMaterial( {
    color: 0xb8c7dc,
    roughness: 0.82,
    metalness: 0.18,
  } ),
);
pedestal.receiveShadow = true;
scene.add( pedestal );

const interactables = [ cube ];
const controllers = [];
const raycaster = new THREE.Raycaster();
const controllerModelFactory = new XRControllerModelFactory();
const pointer = new THREE.Vector2();
const desktopGrabber = { type: INTERACTORS.DESKTOP_POINTER };
const sceneRaycastTargets = new Map();

const tempWorldPosition = new THREE.Vector3();
const tempWorldQuaternion = new THREE.Quaternion();
const tempCubeWorldPosition = new THREE.Vector3();
const tempCubeWorldQuaternion = new THREE.Quaternion();
const tempDirection = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempUp = new THREE.Vector3();
const dragPoint = new THREE.Vector3();
const dragNormal = new THREE.Vector3();
const tempReplayPointerOrigin = new THREE.Vector3();
const tempReplayPointerTarget = new THREE.Vector3();
const tempReplayTooltipAnchor = new THREE.Vector3();
const tempReplayCameraForward = new THREE.Vector3();
const desktopEuler = new THREE.Euler( 0, 0, 0, 'YXZ' );
const tempXRHitTestPosition = new THREE.Vector3();
const tempXRHitTestQuaternion = new THREE.Quaternion();

const desktopState = {
  activePointerId: null,
  hovered: null,
  hoveredSceneEntry: null,
  selected: null,
  sceneSelection: null,
  mode: null,
  dragPlane: new THREE.Plane(),
  dragOffset: new THREE.Vector3(),
  lastPointer: new THREE.Vector2(),
};
const sceneInteractionDebugStateBySource = new Map();

const hoverColor = 0x163244;
const grabbedColor = 0x235f7d;
const idleColor = 0x000000;
const defaultRayLength = 5;
const mousePanFactor = 0.003;
const mouseRotateFactor = 0.005;
const keyboardMoveSpeed = 2.4;
const wheelMoveStep = 0.45;

const pressedKeys = new Set();
const timer = new THREE.Timer();
timer.connect( document );
const revisitBridge = createRevisitBridge();

const resolvedInitialScene = resolveSceneDefinitionFromSearch( window.location.search );
if ( resolvedInitialScene.warning ) {

  console.warn( resolvedInitialScene.warning );

}

let currentMode = PRESENTATION_MODES.DESKTOP;
let studyLogger = null;
let cameraSamplingRequested = false;
let replayGhostPointersHiddenByViewer = false;
let replayGhostPointersHiddenReason = null;
let activeSceneDefinition = resolvedInitialScene.sceneDefinition;
let activeSceneController = null;
let xrHitTestViewerSpace = null;
let xrHitTestSource = null;
let xrHitTestAvailable = false;
let xrHitTestSetupPending = false;
const xrControllerHitTestStates = new Map();

const replayPointerVisuals = {};
const replayCameraPose = {
  hasValue: false,
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
};
const replayAvatarLoadStates = Object.freeze( {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
} );
const replayAvatarRoot = new THREE.Group();
const replayAvatarPoseGroup = new THREE.Group();
const replayAvatarModelContainer = new THREE.Group();
const replayAvatarLabelAnchor = new THREE.Object3D();
const replayAvatarArrow = new THREE.ArrowHelper(
  new THREE.Vector3( 0, 0, - 1 ),
  new THREE.Vector3(),
  replayVisualConfig.replayAvatar.headArrowLength,
  replayVisualConfig.replayAvatar.headArrowColor,
  replayVisualConfig.replayAvatar.headArrowLength * 0.4,
  replayVisualConfig.replayAvatar.headArrowLength * 0.24,
);
let replayAvatarLoadState = replayAvatarLoadStates.IDLE;

replayAvatarRoot.visible = false;
replayAvatarPoseGroup.add( replayAvatarModelContainer );
replayAvatarPoseGroup.add( replayAvatarArrow );
replayAvatarRoot.add( replayAvatarPoseGroup );
replayAvatarRoot.add( replayAvatarLabelAnchor );
scene.add( replayAvatarRoot );

function colorToCssRgba( colorHex, alpha = 1 ) {

  const color = new THREE.Color( colorHex );
  const red = Math.round( color.r * 255 );
  const green = Math.round( color.g * 255 );
  const blue = Math.round( color.b * 255 );

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;

}

function applyReplayLabelAccent( element, colorHex ) {

  element.style.setProperty( '--replay-label-accent', colorToCssRgba( colorHex, 1 ) );
  element.style.setProperty(
    '--replay-label-background',
    colorToCssRgba( colorHex, replayVisualConfig.pointerTooltips.backgroundOpacity ),
  );
  element.style.setProperty(
    '--replay-label-border',
    colorToCssRgba( colorHex, replayVisualConfig.pointerTooltips.borderOpacity ),
  );
  element.style.setProperty( '--replay-label-text', replayVisualConfig.pointerTooltips.textColor );

}

function createReplayLabelElement( className, text, accentColor ) {

  const element = document.createElement( 'div' );
  element.className = className;
  element.textContent = text;
  applyReplayLabelAccent( element, accentColor );
  return element;

}

function createReplayPointerLabel( interactor ) {

  const accentColor = replayVisualConfig.pointerColors[ interactor ] || 0xffffff;
  const labelElement = createReplayLabelElement(
    `replay-floating-label replay-pointer-label ${interactor}`,
    getReplayPointerTooltipText( interactor ),
    accentColor,
  );
  const labelObject = new CSS2DObject( labelElement );
  labelObject.center.set( 0.5, 0.5 );

  const labelAnchor = new THREE.Object3D();
  labelAnchor.visible = false;
  labelAnchor.add( labelObject );

  return {
    labelAnchor,
    labelObject,
    labelElement,
  };

}

function createReplayAvatarLabel() {

  const labelElement = createReplayLabelElement(
    'replay-floating-label replay-avatar-label',
    replayVisualConfig.replayAvatar.headTooltipText,
    replayVisualConfig.replayAvatar.headArrowColor,
  );
  const labelObject = new CSS2DObject( labelElement );
  labelObject.center.set( 0.5, 1 );
  replayAvatarLabelAnchor.add( labelObject );

  return {
    labelElement,
    labelObject,
  };

}

const replayAvatarLabel = createReplayAvatarLabel();

function applyReplayVisualConfigToDom() {

  document.documentElement.style.setProperty(
    '--replay-paused-border-color',
    replayVisualConfig.pausedOverlay.borderColor,
  );
  document.documentElement.style.setProperty(
    '--replay-paused-banner-background',
    replayVisualConfig.pausedOverlay.bannerBackground,
  );
  document.documentElement.style.setProperty(
    '--replay-paused-banner-text',
    replayVisualConfig.pausedOverlay.bannerTextColor,
  );

  if ( pausedOverlayBanner ) {

    pausedOverlayBanner.textContent = replayVisualConfig.pausedOverlay.bannerText;

  }

}

function setPausedReplayOverlayVisibility( visible ) {

  pausedOverlayFrame?.classList.toggle( 'visible', visible );
  pausedOverlayBanner?.classList.toggle( 'visible', visible );

}

function updatePausedReplayOverlay( policy = studyLogger?.getInteractionPolicy?.() ) {

  const shouldShow = Boolean(
    policy?.isAnalysisSession &&
    policy?.hasReceivedReplayState &&
    policy?.analysisPlaybackActive === false &&
    policy?.canInteract === true,
  );

  setPausedReplayOverlayVisibility( shouldShow );

}

function isReplayVisualAnalysisActive( policy = studyLogger?.getInteractionPolicy?.() ) {

  return Boolean(
    policy?.isAnalysisSession &&
    policy?.hasReceivedReplayState,
  );

}

function hasVisibleReplayLabelCandidates() {

  return replayAvatarRoot.visible || REPLAY_POINTER_IDS.some( ( interactor ) => {

    const visuals = replayPointerVisuals[ interactor ];
    return Boolean( visuals?.labelAnchor.visible );

  } );

}

function shouldRenderReplayLabelLayer( policy = studyLogger?.getInteractionPolicy?.() ) {

  if ( replayVisualConfig.performance.renderCssLabelsOnlyInAnalysis && ! isReplayVisualAnalysisActive( policy ) ) {

    return false;

  }

  if ( replayVisualConfig.performance.disableReplayVisualsDuringImmersiveStudy && renderer.xr.isPresenting ) {

    return false;

  }

  return hasVisibleReplayLabelCandidates();

}

function setReplayLabelLayerVisibility( visible ) {

  labelRenderer.domElement.style.display = visible ? 'block' : 'none';

}

function renderScene( policy = studyLogger?.getInteractionPolicy?.() ) {

  renderer.render( scene, camera );

  const shouldRenderLabels = shouldRenderReplayLabelLayer( policy );
  setReplayLabelLayerVisibility( shouldRenderLabels );

  if ( shouldRenderLabels ) {

    labelRenderer.render( scene, camera );

  }

}

function setDesktopScenePanelNode( node ) {

  if ( ! scenePanelRoot ) {

    return;

  }

  scenePanelRoot.replaceChildren();

  if ( node ) {

    scenePanelRoot.appendChild( node );

  }

  updateScenePanelVisibility();

}

function setDesktopScenePanelContent( html ) {

  if ( ! scenePanelRoot ) {

    return;

  }

  scenePanelRoot.innerHTML = typeof html === 'string' ? html : '';
  updateScenePanelVisibility();

}

function clearDesktopScenePanel() {

  if ( ! scenePanelRoot ) {

    return;

  }

  scenePanelRoot.replaceChildren();
  updateScenePanelVisibility();

}

function updateScenePanelVisibility() {

  if ( ! scenePanelRoot ) {

    return;

  }

  const hasPanelContent = scenePanelRoot.childNodes.length > 0;
  const shouldShow = hasPanelContent && currentMode === PRESENTATION_MODES.DESKTOP;
  scenePanelRoot.style.display = shouldShow ? 'block' : 'none';

}

function registerRaycastTarget( object3D, handlers = {} ) {

  if ( object3D ) {

    sceneRaycastTargets.set( object3D, handlers );

  }

}

function unregisterRaycastTarget( object3D ) {

  if ( object3D ) {

    sceneRaycastTargets.delete( object3D );

  }

}

function getRaycastTargetEntryFromObject( object3D ) {

  let currentObject = object3D;

  while ( currentObject ) {

    if ( sceneRaycastTargets.has( currentObject ) ) {

      return {
        object: currentObject,
        handlers: sceneRaycastTargets.get( currentObject ),
      };

    }

    currentObject = currentObject.parent;

  }

  return null;

}

function sameSceneRaycastEntry( entryA, entryB ) {

  return (
    entryA?.object === entryB?.object &&
    ( entryA?.hit?.instanceId ?? null ) === ( entryB?.hit?.instanceId ?? null )
  );

}

function cloneSceneInteractionDebugHit( hit ) {

  if ( ! hit ) {

    return null;

  }

  return {
    object: hit.object ?? null,
    instanceId: Number.isInteger( hit.instanceId ) ? hit.instanceId : null,
    distance: typeof hit.distance === 'number' ? hit.distance : null,
  };

}

function cloneSceneInteractionDebugEntry( entry ) {

  if ( ! entry ) {

    return null;

  }

  return {
    object: entry.object ?? null,
    hit: cloneSceneInteractionDebugHit( entry.hit ),
  };

}

function setSceneInteractionDebugState( source, {
  phase = null,
  pointerType = null,
  rawFirstSceneHit = null,
  resolvedSceneHit = null,
} = {} ) {

  if ( typeof source !== 'string' || source.trim().length === 0 ) {

    return;

  }

  sceneInteractionDebugStateBySource.set( source, {
    phase,
    pointerType,
    rawFirstSceneHit: cloneSceneInteractionDebugHit( rawFirstSceneHit ),
    resolvedSceneHit: cloneSceneInteractionDebugHit( resolvedSceneHit ),
  } );

}

function getControllerByInteractorId( interactor ) {

  if ( interactor === INTERACTORS.CONTROLLER_0 ) {

    return controllers[ 0 ] ?? null;

  }

  if ( interactor === INTERACTORS.CONTROLLER_1 ) {

    return controllers[ 1 ] ?? null;

  }

  return null;

}

function getSceneInteractionDebugState( source ) {

  const baseState = sceneInteractionDebugStateBySource.get( source ) || null;
  const controller = getControllerByInteractorId( source );
  const hoveredSceneEntry = source === INTERACTORS.DESKTOP_POINTER
    ? desktopState.hoveredSceneEntry
    : ( controller?.userData?.hoveredSceneEntry ?? null );
  const sceneSelection = source === INTERACTORS.DESKTOP_POINTER
    ? desktopState.sceneSelection
    : ( controller?.userData?.sceneSelection ?? null );

  return {
    source,
    phase: baseState?.phase ?? null,
    pointerType: baseState?.pointerType ?? null,
    controllerIndex: Number.isInteger( controller?.userData?.index ) ? controller.userData.index : null,
    handedness: typeof controller?.userData?.handedness === 'string' ? controller.userData.handedness : null,
    rawFirstSceneHit: baseState?.rawFirstSceneHit ?? null,
    resolvedSceneHit: baseState?.resolvedSceneHit ?? null,
    hoveredSceneEntry: cloneSceneInteractionDebugEntry( hoveredSceneEntry ),
    sceneSelection: cloneSceneInteractionDebugEntry( sceneSelection ),
  };

}

function getSceneInteractorState( source ) {

  const controller = getControllerByInteractorId( source );
  const hoveredSceneEntry = source === INTERACTORS.DESKTOP_POINTER
    ? desktopState.hoveredSceneEntry
    : ( controller?.userData?.hoveredSceneEntry ?? null );
  const sceneSelection = source === INTERACTORS.DESKTOP_POINTER
    ? desktopState.sceneSelection
    : ( controller?.userData?.sceneSelection ?? null );

  return {
    source,
    interactor: source === INTERACTORS.DESKTOP_POINTER ? INTERACTORS.DESKTOP_POINTER : ( controller ? getControllerInteractorId( controller ) : source ),
    pointerType: source === INTERACTORS.DESKTOP_POINTER ? 'desktop' : 'xr',
    controllerIndex: Number.isInteger( controller?.userData?.index ) ? controller.userData.index : null,
    handedness: typeof controller?.userData?.handedness === 'string' ? controller.userData.handedness : null,
    inputSource: controller?.userData?.inputSource || null,
    hoveredSceneEntry,
    sceneSelection,
  };

}

function buildSceneInteractionPayload( {
  source,
  hit = null,
  controller = null,
  isHovered = false,
  previousHit = null,
} ) {

  const interactor = controller ? getControllerInteractorId( controller ) : source;

  return {
    source,
    interactor,
    pointerType: source === INTERACTORS.DESKTOP_POINTER ? 'desktop' : ( controller ? 'xr' : null ),
    controllerIndex: Number.isInteger( controller?.userData?.index ) ? controller.userData.index : null,
    handedness: typeof controller?.userData?.handedness === 'string' ? controller.userData.handedness : null,
    inputSource: controller?.userData?.inputSource || null,
    controller,
    object: hit?.object ?? null,
    instanceId: Number.isInteger( hit?.instanceId ) ? hit.instanceId : null,
    point: hit?.point?.clone?.() ?? null,
    distance: typeof hit?.distance === 'number' ? hit.distance : null,
    rayOrigin: raycaster.ray.origin.clone(),
    rayDirection: raycaster.ray.direction.clone(),
    isHovered,
    previousObject: previousHit?.object ?? null,
    previousInstanceId: Number.isInteger( previousHit?.instanceId ) ? previousHit.instanceId : null,
  };

}

function updateDesktopSceneHover( nextEntry ) {

  const previousEntry = desktopState.hoveredSceneEntry;

  if ( sameSceneRaycastEntry( previousEntry, nextEntry ) ) {

    return;

  }

  if ( previousEntry?.handlers?.onHoverChange ) {

    previousEntry.handlers.onHoverChange( buildSceneInteractionPayload( {
      source: INTERACTORS.DESKTOP_POINTER,
      hit: previousEntry.hit,
      isHovered: false,
      previousHit: nextEntry?.hit || null,
    } ) );

  }

  desktopState.hoveredSceneEntry = nextEntry || null;

  if ( nextEntry?.handlers?.onHoverChange ) {

    nextEntry.handlers.onHoverChange( buildSceneInteractionPayload( {
      source: INTERACTORS.DESKTOP_POINTER,
      hit: nextEntry.hit,
      isHovered: true,
      previousHit: previousEntry?.hit || null,
    } ) );

  }

}

function updateControllerSceneHover( controller, nextEntry ) {

  const previousEntry = controller.userData.hoveredSceneEntry;
  const source = getControllerInteractorId( controller );

  if ( sameSceneRaycastEntry( previousEntry, nextEntry ) ) {

    return;

  }

  if ( previousEntry?.handlers?.onHoverChange ) {

    previousEntry.handlers.onHoverChange( buildSceneInteractionPayload( {
      source,
      controller,
      hit: previousEntry.hit,
      isHovered: false,
      previousHit: nextEntry?.hit || null,
    } ) );

  }

  controller.userData.hoveredSceneEntry = nextEntry || null;

  if ( nextEntry?.handlers?.onHoverChange ) {

    nextEntry.handlers.onHoverChange( buildSceneInteractionPayload( {
      source,
      controller,
      hit: nextEntry.hit,
      isHovered: true,
      previousHit: previousEntry?.hit || null,
    } ) );

  }

}

function clearControllerSceneHover( controller ) {

  updateControllerSceneHover( controller, null );

}

function invalidateSceneHoverForSource( source ) {

  if ( source === INTERACTORS.DESKTOP_POINTER ) {

    desktopState.hoveredSceneEntry = null;
    return;

  }

  const controller = getControllerByInteractorId( source );

  if ( controller ) {

    controller.userData.hoveredSceneEntry = null;

  }

}

function getActiveTemplateConfig() {

  const defaultTemplateConfig = {
    showFloor: true,
    showGrid: true,
    showPedestal: true,
    showTemplateCube: true,
    enableDefaultObjectManipulation: true,
  };
  const rawTemplateConfig = activeSceneDefinition?.templateConfig || defaultTemplateConfig;
  const {
    modeOverrides = {},
    ...baseTemplateConfig
  } = rawTemplateConfig;
  const interactionPolicy = studyLogger?.getInteractionPolicy?.() || null;

  return {
    ...defaultTemplateConfig,
    ...baseTemplateConfig,
    ...( modeOverrides?.[ currentMode ] || {} ),
    ...( interactionPolicy?.isAnalysisSession ? ( modeOverrides?.analysis || {} ) : {} ),
  };

}

function getActiveImmersiveSupport() {

  const supportedImmersiveModes = activeSceneDefinition?.supportedImmersiveModes || {};

  return {
    ar: supportedImmersiveModes.ar !== false,
    vr: supportedImmersiveModes.vr !== false,
  };

}

function isPresentationModeSupportedByActiveScene( mode ) {

  const support = getActiveImmersiveSupport();

  if ( mode === PRESENTATION_MODES.IMMERSIVE_AR ) {

    return support.ar;

  }

  if ( mode === PRESENTATION_MODES.IMMERSIVE_VR ) {

    return support.vr;

  }

  return true;

}

function applyActiveTemplateConfig() {

  const templateConfig = getActiveTemplateConfig();

  floor.visible = templateConfig.showFloor !== false;
  grid.visible = templateConfig.showGrid !== false;
  pedestal.visible = templateConfig.showPedestal !== false;
  cube.visible = templateConfig.showTemplateCube !== false;
  environmentRoot.visible = floor.visible || grid.visible;

}

function canUseDefaultObjectManipulation() {

  const templateConfig = getActiveTemplateConfig();
  return templateConfig.enableDefaultObjectManipulation !== false && cube.visible;

}

function getActiveSceneStateForReplay() {

  return activeSceneController?.getSceneStateForReplay?.() || {};

}

function getActiveSceneAnswerSummary() {

  return activeSceneController?.getAnswerSummary?.() || null;

}

function normalizeSceneStateForReplay( sceneKey, candidateSceneState, fallbackSceneState ) {

  return getSceneDefinitionByKey( sceneKey ).normalizeSceneState(
    candidateSceneState,
    fallbackSceneState,
  );

}

function getActiveSceneLoggingConfig() {

  return resolveLoggingConfig( activeSceneDefinition?.loggingConfig || null );

}

function createSceneRuntimeContext() {

  return {
    scene,
    sceneContentRoot,
    camera,
    xrOrigin,
    renderer,
    registerRaycastTarget,
    unregisterRaycastTarget,
    setDesktopPanelNode: setDesktopScenePanelNode,
    setDesktopPanelContent: setDesktopScenePanelContent,
    clearDesktopPanel: clearDesktopScenePanel,
    getPresentationMode: () => currentMode,
    getInteractionPolicy: () => studyLogger?.getInteractionPolicy?.() ?? null,
    getLoggingConfig: () => studyLogger?.getActiveLoggingConfig?.() ?? getActiveSceneLoggingConfig(),
    invalidateSceneHoverForSource,
    getSceneInteractorState,
    getSceneInteractionDebugState,
    recordSceneStateChange: ( payload ) => studyLogger?.recordSceneStateChange?.( payload ) ?? false,
  };

}

function activateSceneDefinition( nextSceneDefinition ) {

  if ( ! nextSceneDefinition ) {

    return;

  }

  if ( activeSceneController?.dispose ) {

    activeSceneController.dispose();

  }

  sceneInteractionDebugStateBySource.clear();
  sceneRaycastTargets.clear();
  sceneContentRoot.clear();
  activeSceneDefinition = nextSceneDefinition;
  activeSceneController = nextSceneDefinition.createScene( createSceneRuntimeContext() );
  activeSceneController?.activate?.();
  applyActiveTemplateConfig();
  activeSceneController?.onPresentationModeChange?.( currentMode );
  updateHud();
  updateBridgeLockStateUI();
  refreshInteractableAppearance();
  updateScenePanelVisibility();

}

function switchSceneByKey( sceneKey ) {

  const nextSceneDefinition = getSceneDefinitionByKey( sceneKey );
  activateSceneDefinition( nextSceneDefinition );

}

function resolveReplayAssetUrl( assetPath ) {

  const normalizedPath = assetPath.startsWith( '/' )
    ? assetPath.slice( 1 )
    : assetPath;

  return new URL( normalizedPath, window.location.href ).toString();

}

function hasValidReplayAvatarNormals( geometry ) {

  const positionAttribute = geometry?.getAttribute?.( 'position' );
  const normalAttribute = geometry?.getAttribute?.( 'normal' );

  if ( ! positionAttribute || ! normalAttribute || normalAttribute.count !== positionAttribute.count ) {

    return false;

  }

  const normalArray = normalAttribute.array;

  for ( let index = 0; index < normalArray.length; index += 3 ) {

    const x = normalArray[ index ];
    const y = normalArray[ index + 1 ];
    const z = normalArray[ index + 2 ];

    if ( ! Number.isFinite( x ) || ! Number.isFinite( y ) || ! Number.isFinite( z ) ) {

      return false;

    }

    const lengthSq = x * x + y * y + z * z;

    if ( lengthSq <= 1e-8 || lengthSq > 4 ) {

      return false;

    }

  }

  return true;

}

function prepareReplayAvatarMesh( mesh ) {

  const geometry = mesh?.geometry;

  if ( ! geometry?.isBufferGeometry || ! geometry.getAttribute( 'position' ) ) {

    return;

  }

  if ( replayVisualConfig.replayAvatar.headComputeBoundingBox ) {

    geometry.computeBoundingBox();

  }

  const shouldRecomputeNormals =
    replayVisualConfig.replayAvatar.headRecomputeNormals &&
    ! hasValidReplayAvatarNormals( geometry );

  if ( shouldRecomputeNormals ) {

    geometry.deleteAttribute( 'normal' );
    geometry.computeVertexNormals();

  }

  if (
    replayVisualConfig.replayAvatar.headNormalizeNormals &&
    typeof geometry.normalizeNormals === 'function' &&
    geometry.getAttribute( 'normal' )
  ) {

    geometry.normalizeNormals();
    geometry.getAttribute( 'normal' ).needsUpdate = true;

  }

  if ( replayVisualConfig.replayAvatar.headComputeBoundingSphere ) {

    geometry.computeBoundingSphere();

  }

}

function createReplayAvatarMaterial() {

  const commonMaterialOptions = {
    color: replayVisualConfig.replayAvatar.headMaterialColor,
    emissive: replayVisualConfig.replayAvatar.headMaterialEmissive,
    transparent: replayVisualConfig.replayAvatar.headMaterialOpacity < 1,
    opacity: replayVisualConfig.replayAvatar.headMaterialOpacity,
    side: replayVisualConfig.replayAvatar.headUseDoubleSide ? THREE.DoubleSide : THREE.FrontSide,
  };

  if ( replayVisualConfig.replayAvatar.headMaterialType === 'lambert' ) {

    return new THREE.MeshLambertMaterial( commonMaterialOptions );

  }

  if ( replayVisualConfig.replayAvatar.headMaterialType === 'standard' ) {

    return new THREE.MeshStandardMaterial( {
      ...commonMaterialOptions,
      roughness: 0.62,
      metalness: 0.03,
    } );

  }

  return new THREE.MeshPhongMaterial( {
    ...commonMaterialOptions,
    shininess: 18,
    specular: new THREE.Color( 0x2a3644 ),
  } );

}

function loadReplayAvatarModel() {

  if ( replayAvatarLoadState !== replayAvatarLoadStates.IDLE ) {

    return;

  }

  replayAvatarLoadState = replayAvatarLoadStates.LOADING;

  const loader = new OBJLoader();

  loader.load(
    resolveReplayAssetUrl( replayVisualConfig.replayAvatar.headModelPath ),
    ( object ) => {

      const headMaterial = createReplayAvatarMaterial();

      object.traverse( ( child ) => {

        if ( child.isMesh ) {

          prepareReplayAvatarMesh( child );
          child.material = headMaterial;
          child.castShadow = replayVisualConfig.replayAvatar.headCastShadow;
          child.receiveShadow = replayVisualConfig.replayAvatar.headReceiveShadow;

        }

      } );

      replayAvatarModelContainer.clear();
      const bounds = new THREE.Box3().setFromObject( object );
      const center = bounds.getCenter( new THREE.Vector3() );
      object.position.sub( center );
      replayAvatarModelContainer.add( object );
      replayAvatarModelContainer.scale.setScalar( replayVisualConfig.replayAvatar.headScale );
      replayAvatarModelContainer.rotation.y = replayVisualConfig.replayAvatar.headRotationY;
      replayAvatarLoadState = replayAvatarLoadStates.READY;

    },
    undefined,
    ( error ) => {

      replayAvatarLoadState = replayAvatarLoadStates.ERROR;
      console.warn( 'Unable to load replay user-head avatar model.', error );

    },
  );

}

function ensureReplayAvatarLoaded( policy = studyLogger?.getInteractionPolicy?.() ) {

  const shouldLoad =
    replayVisualConfig.performance.lazyLoadReplayAvatar
      ? isReplayVisualAnalysisActive( policy )
      : true;

  if ( shouldLoad ) {

    loadReplayAvatarModel();

  }

}

function captureReplayCameraPoseFromScene() {

  scene.updateMatrixWorld( true );
  camera.getWorldPosition( replayCameraPose.position );
  camera.getWorldQuaternion( replayCameraPose.quaternion );
  replayCameraPose.hasValue = true;

}

function updateReplayAvatar( policy = studyLogger?.getInteractionPolicy?.() ) {

  const shouldShow = Boolean( isReplayVisualAnalysisActive( policy ) && replayCameraPose.hasValue );

  replayAvatarRoot.visible = shouldShow;

  if ( ! shouldShow ) {

    return;

  }

  tempReplayCameraForward.set( 0, 0, - 1 ).applyQuaternion( replayCameraPose.quaternion ).normalize();

  replayAvatarRoot.position.copy( replayCameraPose.position );
  replayAvatarRoot.position.addScaledVector( tempReplayCameraForward, - replayVisualConfig.replayAvatar.headOffsetBack );
  replayAvatarRoot.position.y -= replayVisualConfig.replayAvatar.headOffsetDown;

  replayAvatarPoseGroup.quaternion.copy( replayCameraPose.quaternion );
  replayAvatarLabelAnchor.position.set( 0, replayVisualConfig.replayAvatar.headTooltipVerticalOffset, 0 );
  replayAvatarArrow.position.set( 0, 0.015, 0 );
  replayAvatarArrow.setDirection( new THREE.Vector3( 0, 0, - 1 ) );
  replayAvatarArrow.setLength(
    replayVisualConfig.replayAvatar.headArrowLength,
    replayVisualConfig.replayAvatar.headArrowLength * 0.4,
    replayVisualConfig.replayAvatar.headArrowLength * 0.24,
  );

}

function getReplayAvatarDebugState() {

  return {
    visible: replayAvatarRoot.visible,
    hasReplayCameraPose: replayCameraPose.hasValue,
    loadState: replayAvatarLoadState,
    position: vector3ToArray( replayAvatarRoot.position ),
    quaternion: quaternionToArray( replayAvatarPoseGroup.quaternion ),
    tooltipText: replayAvatarLabel.labelElement.textContent,
  };

}

function applyButtonPlacement( button, left ) {

  button.style.setProperty( 'left', left, 'important' );
  button.style.setProperty( 'width', '180px', 'important' );
  button.style.setProperty( 'bottom', '20px', 'important' );

}

const arButton = ARButton.createButton( renderer, {
  optionalFeatures: [ 'local-floor', 'bounded-floor', 'hit-test' ],
} );
applyButtonPlacement( arButton, '20px' );
document.body.appendChild( arButton );

const vrButton = VRButton.createButton( renderer, {
  optionalFeatures: [ 'local-floor', 'bounded-floor' ],
} );
applyButtonPlacement( vrButton, '220px' );
document.body.appendChild( vrButton );

function createGhostReplayPointer( interactor ) {

  const color = replayVisualConfig.pointerColors[ interactor ] || 0xffffff;
  const positions = new Float32Array( 6 );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
  const pointerLabel = createReplayPointerLabel( interactor );

  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial( {
      color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      toneMapped: false,
    } ),
  );
  line.frustumCulled = false;
  line.renderOrder = 20;

  const originMarker = new THREE.Mesh(
    new THREE.SphereGeometry( 0.018, 12, 12 ),
    new THREE.MeshBasicMaterial( {
      color,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    } ),
  );
  originMarker.renderOrder = 21;

  const hitMarker = new THREE.Mesh(
    new THREE.SphereGeometry( 0.026, 14, 14 ),
    new THREE.MeshBasicMaterial( {
      color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    } ),
  );
  hitMarker.renderOrder = 21;

  const group = new THREE.Group();
  group.name = `ghost-replay-pointer-${interactor}`;
  group.visible = false;
  group.add( line );
  group.add( originMarker );
  group.add( hitMarker );
  group.add( pointerLabel.labelAnchor );
  scene.add( group );

  replayPointerVisuals[ interactor ] = {
    group,
    line,
    originMarker,
    hitMarker,
    labelAnchor: pointerLabel.labelAnchor,
    labelObject: pointerLabel.labelObject,
    labelElement: pointerLabel.labelElement,
    positions,
  };

}

function setGhostReplayPointerVisibility( interactor, visible ) {

  const visuals = replayPointerVisuals[ interactor ];

  if ( visuals ) {

    visuals.group.visible = visible;
    if ( ! visible ) {

      visuals.labelAnchor.visible = false;

    }

  }

}

function hideAllGhostReplayPointers() {

  for ( const interactor of REPLAY_POINTER_IDS ) {

    setGhostReplayPointerVisibility( interactor, false );

  }

}

function updateGhostReplayPointer( interactor, pointerState ) {

  const visuals = replayPointerVisuals[ interactor ];

  if ( ! visuals ) {

    return;

  }

  if ( replayGhostPointersHiddenByViewer || ! pointerState?.visible ) {

    visuals.group.visible = false;
    visuals.labelAnchor.visible = false;
    return;

  }

  visuals.positions[ 0 ] = pointerState.origin[ 0 ];
  visuals.positions[ 1 ] = pointerState.origin[ 1 ];
  visuals.positions[ 2 ] = pointerState.origin[ 2 ];
  visuals.positions[ 3 ] = pointerState.target[ 0 ];
  visuals.positions[ 4 ] = pointerState.target[ 1 ];
  visuals.positions[ 5 ] = pointerState.target[ 2 ];
  visuals.line.geometry.attributes.position.needsUpdate = true;
  visuals.line.geometry.computeBoundingSphere();
  visuals.originMarker.position.fromArray( pointerState.origin );
  visuals.hitMarker.position.fromArray( pointerState.target );
  tempReplayTooltipAnchor
    .fromArray( pointerState.origin )
    .lerp(
      tempReplayPointerTarget.fromArray( pointerState.target ),
      replayVisualConfig.pointerTooltips.anchorLerp,
    );
  tempReplayTooltipAnchor.y += replayVisualConfig.pointerTooltips.verticalOffset;
  visuals.labelAnchor.position.copy( tempReplayTooltipAnchor );
  visuals.labelAnchor.visible = pointerState.tooltipVisible !== false;
  visuals.labelElement.textContent = pointerState.tooltipText || getReplayPointerTooltipText(
    interactor,
    pointerState.tooltipState,
  );
  visuals.labelElement.dataset.state = pointerState.tooltipState || REPLAY_POINTER_TOOLTIP_STATES.DEFAULT;
  visuals.group.visible = true;

}

function updateGhostReplayPointersFromState( replayPointers ) {

  for ( const interactor of REPLAY_POINTER_IDS ) {

    updateGhostReplayPointer( interactor, replayPointers?.[ interactor ] );

  }

}

function getGhostReplayPointerDebugState() {

  return Object.fromEntries( REPLAY_POINTER_IDS.map( ( interactor ) => {

    const visuals = replayPointerVisuals[ interactor ];

    return [
      interactor,
      {
        visible: visuals?.group.visible ?? false,
        origin: visuals ? vector3ToArray( visuals.originMarker.position ) : null,
        target: visuals ? vector3ToArray( visuals.hitMarker.position ) : null,
        tooltipVisible: visuals?.labelAnchor.visible ?? false,
        tooltipText: visuals?.labelElement.textContent ?? null,
        tooltipAnchor: visuals ? vector3ToArray( visuals.labelAnchor.position ) : null,
        hiddenByViewer: replayGhostPointersHiddenByViewer,
        hiddenReason: replayGhostPointersHiddenReason,
      },
    ];

  } ) );

}

function hideReplayGhostPointersForLocalInteraction( { reason = 'scene-interaction' } = {} ) {

  if ( ! studyLogger?.isAnalysisSession() || ! studyLogger.canInteract() ) {

    return;

  }

  const performanceConfig = replayVisualConfig.performance || {};

  if (
    reason === 'camera-navigation' &&
    performanceConfig.keepReplayPointersDuringPausedCameraNavigation !== false
  ) {

    return;

  }

  if (
    reason === 'scene-interaction' &&
    performanceConfig.hideReplayPointersOnPausedSceneInteraction === false
  ) {

    return;

  }

  replayGhostPointersHiddenByViewer = true;
  replayGhostPointersHiddenReason = reason;
  hideAllGhostReplayPointers();

}

function isLocalInteractionBlocked() {

  return studyLogger ? ! studyLogger.canInteract() : false;

}

function updateBridgeLockStateUI() {

  const immersiveBlocked = studyLogger ? ! studyLogger.canEnterImmersiveSession() : false;
  const immersiveSupport = getActiveImmersiveSupport();
  const pointerEvents = immersiveBlocked ? 'none' : 'auto';
  const opacity = immersiveBlocked ? '0.45' : '1';

  arButton.style.display = immersiveSupport.ar ? '' : 'none';
  arButton.style.pointerEvents = pointerEvents;
  arButton.style.opacity = opacity;
  vrButton.style.display = immersiveSupport.vr ? '' : 'none';
  vrButton.style.pointerEvents = pointerEvents;
  vrButton.style.opacity = opacity;

}

function markCameraForSampling() {

  cameraSamplingRequested = true;

}

function getControllerInteractorId( controller ) {

  if ( controller?.userData?.index === 0 ) {

    return INTERACTORS.CONTROLLER_0;

  }

  if ( controller?.userData?.index === 1 ) {

    return INTERACTORS.CONTROLLER_1;

  }

  return null;

}

function getActiveGrabInteractorId() {

  if ( cube.userData.grabbedBy === desktopGrabber ) {

    return INTERACTORS.DESKTOP_POINTER;

  }

  return getControllerInteractorId( cube.userData.grabbedBy );

}

function getControllerReplayPointerState( controller ) {

  const interactor = getControllerInteractorId( controller );

  if ( ! interactor || ! renderer.xr.isPresenting ) {

    return createHiddenReplayPointer( interactor );

  }

  controller.updateMatrixWorld( true );
  controller.getWorldPosition( tempReplayPointerOrigin );

  let pointerMode = POINTER_MODES.HIDDEN;

  if ( controller.userData.mode === 'object' && controller.userData.selected === cube ) {

    cube.getWorldPosition( tempReplayPointerTarget );
    pointerMode = POINTER_MODES.GRAB;

  } else if ( Array.isArray( controller.userData.pointerTarget ) ) {

    tempReplayPointerTarget.fromArray( controller.userData.pointerTarget );
    pointerMode = POINTER_MODES.HOVER;

  }

  if ( pointerMode === POINTER_MODES.HIDDEN ) {

    return createHiddenReplayPointer( interactor );

  }

  const tooltipState = pointerMode === POINTER_MODES.GRAB
    ? REPLAY_POINTER_TOOLTIP_STATES.GRABBING
    : REPLAY_POINTER_TOOLTIP_STATES.DEFAULT;

  return {
    visible: true,
    interactor,
    origin: vector3ToArray( tempReplayPointerOrigin ),
    target: vector3ToArray( tempReplayPointerTarget ),
    rayLength: tempReplayPointerOrigin.distanceTo( tempReplayPointerTarget ),
    mode: pointerMode,
    tooltipVisible: true,
    tooltipState,
    tooltipText: getReplayPointerTooltipText( interactor, tooltipState ),
  };

}

function getReplayPointerSnapshot() {

  return {
    [ INTERACTORS.CONTROLLER_0 ]: getControllerReplayPointerState( controllers[ 0 ] ),
    [ INTERACTORS.CONTROLLER_1 ]: getControllerReplayPointerState( controllers[ 1 ] ),
  };

}

function getSceneSnapshot() {

  scene.updateMatrixWorld( true );
  cube.getWorldPosition( tempCubeWorldPosition );
  cube.getWorldQuaternion( tempCubeWorldQuaternion );

  return {
    sceneKey: activeSceneDefinition?.sceneKey || DEFAULT_SCENE_KEY,
    sceneState: getActiveSceneStateForReplay(),
    presentationMode: currentMode,
    cube: {
      position: vector3ToArray( tempCubeWorldPosition ),
      quaternion: quaternionToArray( tempCubeWorldQuaternion ),
    },
    camera: {
      position: vector3ToArray( camera.position ),
      quaternion: quaternionToArray( camera.quaternion ),
    },
    xrOrigin: {
      position: vector3ToArray( xrOrigin.position ),
      quaternion: quaternionToArray( xrOrigin.quaternion ),
    },
    replayPointers: getReplayPointerSnapshot(),
  };

}

function initializeSceneLayout() {

  cube.position.set( 0, 1.4, - 1.2 );
  pedestal.position.set( cube.position.x, 0.4, cube.position.z );

}

function updateHud() {

  if ( ! hudTitle || ! hudBody || ! hudNote ) {

    return;

  }

  const interactionPolicy = studyLogger?.getInteractionPolicy?.();

  if ( interactionPolicy?.isAnalysisSession ) {

    hudTitle.textContent = 'Analysis Replay Mode';
    hudBody.textContent = interactionPolicy.analysisPlaybackActive
      ? 'Replay playback is actively advancing, so desktop interaction is temporarily locked while participant state drives the scene.'
      : 'Replay playback is paused. You can temporarily inspect and manipulate the desktop scene; the next replay snapshot will overwrite local changes.';
    hudNote.textContent = 'Analysis mode never records new participant data. AR and VR entry buttons stay disabled, and ghost controller rays show the participant aim when replay pointer samples are available.';
    return;

  }

  const sceneHudContent = activeSceneController?.getHudContent?.( currentMode );

  hudTitle.textContent = sceneHudContent?.title || activeSceneDefinition?.label || 'reVISit-XR Scene';
  hudBody.textContent = sceneHudContent?.body || 'Desktop pointer controls remain available, and immersive XR uses controller rays for interaction.';
  hudNote.textContent = sceneHudContent?.note || 'Scene-specific instructions are provided by the active scene module.';

}

function setPresentationMode( mode ) {

  currentMode = mode;

  if ( mode === PRESENTATION_MODES.IMMERSIVE_AR ) {

    scene.background = null;
    scene.fog = null;

  } else {

    scene.background = defaultBackground;
    scene.fog = defaultFog;

  }

  applyActiveTemplateConfig();
  activeSceneController?.onPresentationModeChange?.( mode );
  updateHud();
  updateBridgeLockStateUI();
  updateScenePanelVisibility();
  studyLogger?.recordModeChange( { mode } );

}

function resetXROriginToInitial() {

  xrOrigin.position.set( 0, 0, 0 );
  xrOrigin.quaternion.identity();
  xrOrigin.scale.set( 1, 1, 1 );

}

function resetCameraForXRSession() {

  resetXROriginToInitial();
  camera.position.set( 0, 0, 0 );
  camera.quaternion.identity();
  camera.scale.set( 1, 1, 1 );
  camera.updateMatrixWorld( true );

}

function cancelXRHitTestSource( source, label = 'AR hit-test source' ) {

  if ( ! source?.cancel ) {

    return;

  }

  try {

    source.cancel();

  } catch ( error ) {

    console.warn( `Unable to cancel ${label}.`, error );

  }

}

function getControllerHitTestState( controller ) {

  const index = controller?.userData?.index;

  if ( ! Number.isInteger( index ) ) {

    return null;

  }

  if ( ! xrControllerHitTestStates.has( index ) ) {

    xrControllerHitTestStates.set( index, {
      source: null,
      available: false,
      setupPending: false,
      setupToken: 0,
      handedness: null,
      inputSource: null,
    } );

  }

  return xrControllerHitTestStates.get( index );

}

function resetControllerHitTestState( controller, { clearInputSource = false } = {} ) {

  const state = getControllerHitTestState( controller );

  if ( ! state ) {

    return;

  }

  state.setupToken += 1;
  cancelXRHitTestSource( state.source, `controller-${controller.userData.index} AR hit-test source` );
  state.source = null;
  state.available = false;
  state.setupPending = false;

  if ( clearInputSource ) {

    state.handedness = null;
    state.inputSource = null;
    controller.userData.handedness = null;
    controller.userData.inputSource = null;

  }

}

function resetAllControllerHitTestStates() {

  for ( const controller of controllers ) {

    resetControllerHitTestState( controller, { clearInputSource: true } );

  }

  xrControllerHitTestStates.clear();

}

async function setupControllerHitTestSource( controller, inputSource = controller?.userData?.inputSource || null ) {

  const state = getControllerHitTestState( controller );
  const session = renderer.xr.getSession();

  if ( ! state ) {

    return;

  }

  state.setupToken += 1;
  const setupToken = state.setupToken;
  state.handedness = typeof inputSource?.handedness === 'string' ? inputSource.handedness : null;
  state.inputSource = inputSource || null;
  resetControllerHitTestState( controller );
  state.setupToken = setupToken;
  state.handedness = typeof inputSource?.handedness === 'string' ? inputSource.handedness : null;
  state.inputSource = inputSource || null;

  if (
    currentMode !== PRESENTATION_MODES.IMMERSIVE_AR ||
    ! session ||
    typeof session.requestHitTestSource !== 'function' ||
    ! inputSource?.targetRaySpace
  ) {

    return;

  }

  state.setupPending = true;

  try {

    const source = await session.requestHitTestSource( { space: inputSource.targetRaySpace } );

    if ( state.setupToken !== setupToken ) {

      cancelXRHitTestSource( source, `stale controller-${controller.userData.index} AR hit-test source` );
      return;

    }

    state.source = source;
    state.available = true;

  } catch ( error ) {

    if ( state.setupToken === setupToken ) {

      state.source = null;
      state.available = false;
      console.warn( `Controller ${controller.userData.index} AR hit-test unavailable.`, error );

    }

  } finally {

    if ( state.setupToken === setupToken ) {

      state.setupPending = false;

    }

  }

}

function resetXRHitTestState() {

  cancelXRHitTestSource( xrHitTestSource, 'viewer AR hit-test source' );

  xrHitTestViewerSpace = null;
  xrHitTestSource = null;
  xrHitTestAvailable = false;
  xrHitTestSetupPending = false;
  resetAllControllerHitTestStates();

}

async function setupARHitTestSource( session ) {

  if (
    ! session ||
    typeof session.requestReferenceSpace !== 'function' ||
    typeof session.requestHitTestSource !== 'function'
  ) {

    xrHitTestAvailable = false;
    return;

  }

  xrHitTestSetupPending = true;

  try {

    xrHitTestViewerSpace = await session.requestReferenceSpace( 'viewer' );
    xrHitTestSource = await session.requestHitTestSource( { space: xrHitTestViewerSpace } );
    xrHitTestAvailable = true;

  } catch ( error ) {

    xrHitTestViewerSpace = null;
    xrHitTestSource = null;
    xrHitTestAvailable = false;
    console.warn( 'AR hit-test unavailable; scenes can use placement fallback.', error );

  } finally {

    xrHitTestSetupPending = false;

  }

}

function getCompactXRHitTestState( xrFrame ) {

  const controllerHitTestAvailable = [ ...xrControllerHitTestStates.values() ].some( ( controllerState ) => (
    controllerState.available === true || controllerState.setupPending === true
  ) );
  const state = {
    available: xrHitTestAvailable === true || xrHitTestSetupPending === true || controllerHitTestAvailable,
    surfaceDetected: false,
    position: null,
    quaternion: null,
    source: null,
    controllerIndex: null,
    handedness: null,
    interactor: null,
  };

  if (
    currentMode !== PRESENTATION_MODES.IMMERSIVE_AR ||
    ! xrFrame ||
    typeof xrFrame.getHitTestResults !== 'function'
  ) {

    return state;

  }

  const referenceSpace = renderer.xr.getReferenceSpace();

  if ( ! referenceSpace ) {

    return state;

  }

  function readHitTestPose( source ) {

    try {

      const hitTestResults = xrFrame.getHitTestResults( source );
      const hitTestResult = hitTestResults[ 0 ] || null;
      const hitPose = hitTestResult?.getPose?.( referenceSpace ) || null;

      if ( ! hitPose?.transform ) {

        return null;

      }

      tempXRHitTestPosition.set(
        hitPose.transform.position.x,
        hitPose.transform.position.y,
        hitPose.transform.position.z,
      );
      tempXRHitTestQuaternion.set(
        hitPose.transform.orientation.x,
        hitPose.transform.orientation.y,
        hitPose.transform.orientation.z,
        hitPose.transform.orientation.w,
      );

      return {
        position: vector3ToArray( tempXRHitTestPosition ),
        quaternion: quaternionToArray( tempXRHitTestQuaternion ),
      };

    } catch ( error ) {

      console.warn( 'Unable to read AR hit-test result.', error );
      return null;

    }

  }

  function applyHitTestPose( pose, metadata ) {

    state.surfaceDetected = true;
    state.position = pose.position;
    state.quaternion = pose.quaternion;
    state.source = metadata.source;
    state.controllerIndex = metadata.controllerIndex;
    state.handedness = metadata.handedness;
    state.interactor = metadata.interactor;
    return state;

  }

  const controllerEntries = controllers
    .map( ( controller ) => ( {
      controller,
      controllerState: xrControllerHitTestStates.get( controller.userData.index ) || null,
    } ) )
    .filter( ( entry ) => entry.controllerState?.source );
  const preferredControllerEntries = [
    ...controllerEntries.filter( ( entry ) => entry.controllerState.handedness === 'left' ),
    ...controllerEntries.filter( ( entry ) => entry.controller.userData.index === 0 && ! entry.controllerState.handedness ),
  ];

  for ( const entry of preferredControllerEntries ) {

    const pose = readHitTestPose( entry.controllerState.source );

    if ( pose ) {

      return applyHitTestPose( pose, {
        source: 'controller-target-ray',
        controllerIndex: entry.controller.userData.index,
        handedness: entry.controllerState.handedness,
        interactor: getControllerInteractorId( entry.controller ),
      } );

    }

  }

  if ( ! xrHitTestSource ) {

    return state;

  }

  const viewerPose = readHitTestPose( xrHitTestSource );

  if ( ! viewerPose ) {

    return state;

  }

  return applyHitTestPose( viewerPose, {
    source: 'viewer',
    controllerIndex: null,
    handedness: null,
    interactor: 'xr-camera',
  } );

}

function flattenXRToDesktopCamera() {

  camera.updateMatrixWorld( true );
  camera.getWorldPosition( tempWorldPosition );
  camera.getWorldQuaternion( tempWorldQuaternion );

  resetXROriginToInitial();

  camera.position.copy( tempWorldPosition );
  camera.quaternion.copy( tempWorldQuaternion );
  camera.updateMatrixWorld( true );

}

async function alignARViewToFloor() {

  const session = renderer.xr.getSession();

  if ( ! session ) {

    return;

  }

  try {

    const floorReferenceSpace = await session.requestReferenceSpace( 'local-floor' );
    renderer.xr.setReferenceSpace( floorReferenceSpace );

  } catch ( error ) {

    console.warn( 'AR local-floor reference space unavailable, keeping default local space.', error );

  }

}

function refreshInteractableAppearance() {

  for ( const object of interactables ) {

    if ( ! canUseDefaultObjectManipulation() ) {

      object.material.emissive.setHex( idleColor );
      continue;

    }

    const hoveredByController = controllers.some( ( controller ) => controller.userData.hovered === object );
    const hovered = hoveredByController || desktopState.hovered === object;

    if ( object.userData.grabbedBy ) {

      object.material.emissive.setHex( grabbedColor );

    } else if ( hovered ) {

      object.material.emissive.setHex( hoverColor );

    } else {

      object.material.emissive.setHex( idleColor );

    }

  }

}

function setPointerFromEvent( event ) {

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
  pointer.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

}

function getDesktopIntersections() {

  camera.updateMatrixWorld( true );
  raycaster.setFromCamera( pointer, camera );

  const raycastableObjects = [];

  if ( canUseDefaultObjectManipulation() ) {

    raycastableObjects.push( ...interactables );

  }

  raycastableObjects.push( ...sceneRaycastTargets.keys() );

  return raycastableObjects.length === 0
    ? []
    : raycaster.intersectObjects( raycastableObjects, false ).filter( ( hit ) => {

      const targetEntry = getRaycastTargetEntryFromObject( hit.object );

      if ( targetEntry ) {

        return true;

      }

      return hit.object.userData.grabbedBy === null || hit.object.userData.grabbedBy === desktopGrabber;

    } );

}

function getXRIntersections( controller ) {

  raycaster.setFromXRController( controller );

  const raycastableObjects = [];

  if ( canUseDefaultObjectManipulation() ) {

    raycastableObjects.push( ...interactables );

  }

  raycastableObjects.push( ...sceneRaycastTargets.keys() );

  return raycastableObjects.length === 0
    ? []
    : raycaster.intersectObjects( raycastableObjects, false ).filter( ( hit ) => {

      const targetEntry = getRaycastTargetEntryFromObject( hit.object );

      if ( targetEntry ) {

        return true;

      }

      return hit.object.userData.grabbedBy === null || hit.object.userData.grabbedBy === controller;

    } );

}

function buildSceneRaycastResolverContext( {
  phase,
  source,
  pointerType,
} ) {

  const controller = getControllerByInteractorId( source );

  return {
    phase,
    source,
    pointerType,
    controllerIndex: Number.isInteger( controller?.userData?.index ) ? controller.userData.index : null,
    handedness: typeof controller?.userData?.handedness === 'string' ? controller.userData.handedness : null,
    inputSource: controller?.userData?.inputSource || null,
    presentationMode: currentMode,
    rayOrigin: raycaster.ray.origin.clone(),
    rayDirection: raycaster.ray.direction.clone(),
  };

}

function resolveSceneRaycastCandidate( intersections, resolverContext ) {

  const firstHit = intersections[ 0 ] ?? null;

  if ( ! firstHit ) {

    setSceneInteractionDebugState( resolverContext?.source, {
      phase: resolverContext?.phase ?? null,
      pointerType: resolverContext?.pointerType ?? null,
      rawFirstSceneHit: null,
      resolvedSceneHit: null,
    } );

    return {
      hit: null,
      sceneEntry: null,
    };

  }

  const firstSceneEntry = getRaycastTargetEntryFromObject( firstHit.object );

  if ( ! firstSceneEntry?.object ) {

    setSceneInteractionDebugState( resolverContext?.source, {
      phase: resolverContext?.phase ?? null,
      pointerType: resolverContext?.pointerType ?? null,
      rawFirstSceneHit: null,
      resolvedSceneHit: null,
    } );

    return {
      hit: firstHit,
      sceneEntry: null,
    };

  }

  const sceneCandidates = [ {
    hit: firstHit,
    sceneEntry: firstSceneEntry,
  } ];

  for ( let index = 1; index < intersections.length; index += 1 ) {

    const hit = intersections[ index ];
    const sceneEntry = getRaycastTargetEntryFromObject( hit.object );

    if ( sceneEntry?.object ) {

      sceneCandidates.push( {
        hit,
        sceneEntry,
      } );

    }

  }

  let resolvedCandidate = sceneCandidates[ 0 ];
  const resolveRaycastIntersection = activeSceneController?.resolveRaycastIntersection;

  if ( typeof resolveRaycastIntersection === 'function' ) {

    const sceneIntersections = sceneCandidates.map( ( candidate ) => candidate.hit );
    const resolvedHit = resolveRaycastIntersection( sceneIntersections, resolverContext );

    if ( sceneIntersections.includes( resolvedHit ) ) {

      const resolvedIndex = sceneIntersections.indexOf( resolvedHit );
      resolvedCandidate = sceneCandidates[ resolvedIndex ];

    }

  }

  setSceneInteractionDebugState( resolverContext?.source, {
    phase: resolverContext?.phase ?? null,
    pointerType: resolverContext?.pointerType ?? null,
    rawFirstSceneHit: firstHit,
    resolvedSceneHit: resolvedCandidate.hit ?? firstHit,
  } );

  return resolvedCandidate;

}

function panDesktopCamera( deltaX, deltaY ) {

  const panScale = mousePanFactor * Math.max( camera.position.distanceTo( cube.position ), 1.5 );

  tempRight.set( 1, 0, 0 ).applyQuaternion( camera.quaternion );
  tempUp.set( 0, 1, 0 ).applyQuaternion( camera.quaternion );

  camera.position.addScaledVector( tempRight, - deltaX * panScale );
  camera.position.addScaledVector( tempUp, deltaY * panScale );
  camera.updateMatrixWorld( true );
  markCameraForSampling();

}

function rotateDesktopCamera( deltaX, deltaY ) {

  desktopEuler.setFromQuaternion( camera.quaternion );
  desktopEuler.y -= deltaX * mouseRotateFactor;
  desktopEuler.x -= deltaY * mouseRotateFactor;
  desktopEuler.x = THREE.MathUtils.clamp( desktopEuler.x, - Math.PI / 2 + 0.05, Math.PI / 2 - 0.05 );

  camera.quaternion.setFromEuler( desktopEuler );
  camera.updateMatrixWorld( true );
  markCameraForSampling();

}

function moveCameraForward( distance ) {

  tempDirection.set( 0, 0, - 1 ).applyQuaternion( camera.quaternion ).normalize();
  camera.position.addScaledVector( tempDirection, distance );
  camera.updateMatrixWorld( true );
  markCameraForSampling();

}

function moveCameraRight( distance ) {

  tempRight.set( 1, 0, 0 ).applyQuaternion( camera.quaternion ).normalize();
  camera.position.addScaledVector( tempRight, distance );
  camera.updateMatrixWorld( true );
  markCameraForSampling();

}

function updateKeyboardMovement( deltaSeconds ) {

  const keyboardBlockedByPointer =
    desktopState.mode === 'object' ||
    desktopState.mode === 'pan' ||
    desktopState.mode === 'scene-target';

  if (
    renderer.xr.isPresenting ||
    keyboardBlockedByPointer ||
    pressedKeys.size === 0 ||
    isLocalInteractionBlocked()
  ) {

    return;

  }

  let forward = 0;
  let right = 0;

  if ( pressedKeys.has( 'KeyW' ) ) forward += 1;
  if ( pressedKeys.has( 'KeyS' ) ) forward -= 1;
  if ( pressedKeys.has( 'KeyD' ) ) right += 1;
  if ( pressedKeys.has( 'KeyA' ) ) right -= 1;

  if ( forward === 0 && right === 0 ) {

    return;

  }

  const distance = keyboardMoveSpeed * deltaSeconds;

  if ( forward !== 0 ) {

    moveCameraForward( forward * distance );

  }

  if ( right !== 0 ) {

    moveCameraRight( right * distance );

  }

}

function updateDesktopHover() {

  if ( renderer.xr.isPresenting || desktopState.mode !== null || isLocalInteractionBlocked() ) {

    updateDesktopSceneHover( null );
    desktopState.hovered = null;
    renderer.domElement.style.cursor = 'default';
    return;

  }

  const intersections = getDesktopIntersections();
  const nextCandidate = resolveSceneRaycastCandidate(
    intersections,
    buildSceneRaycastResolverContext( {
      phase: 'hover',
      source: INTERACTORS.DESKTOP_POINTER,
      pointerType: 'desktop',
    } ),
  );
  const nextHit = nextCandidate.hit;
  const nextSceneEntry = nextCandidate.sceneEntry;

  updateDesktopSceneHover( nextSceneEntry?.object ? nextSceneEntry : null );

  if ( nextSceneEntry?.object ) {

    desktopState.hovered = null;
    renderer.domElement.style.cursor = 'pointer';
    return;

  }

  desktopState.hovered = nextHit?.object ?? null;
  renderer.domElement.style.cursor = desktopState.hovered ? 'grab' : 'default';

}

function releaseDesktopInteraction() {

  if ( desktopState.mode === 'object' && desktopState.selected ) {

    desktopState.selected.userData.grabbedBy = null;

  }

  desktopState.mode = null;
  desktopState.selected = null;
  desktopState.sceneSelection = null;
  desktopState.activePointerId = null;
  renderer.domElement.style.cursor = desktopState.hovered ? 'grab' : 'default';

}

function onPointerDown( event ) {

  if ( renderer.xr.isPresenting || isLocalInteractionBlocked() ) {

    return;

  }

  if ( event.button !== 0 && event.button !== 2 ) {

    return;

  }

  setPointerFromEvent( event );
  desktopState.activePointerId = event.pointerId;
  desktopState.lastPointer.set( event.clientX, event.clientY );

  if ( event.button === 2 ) {

    desktopState.mode = 'rotate';
    renderer.domElement.setPointerCapture( event.pointerId );
    renderer.domElement.style.cursor = 'grabbing';
    return;

  }

  const intersections = getDesktopIntersections();
  const resolvedCandidate = resolveSceneRaycastCandidate(
    intersections,
    buildSceneRaycastResolverContext( {
      phase: 'select',
      source: INTERACTORS.DESKTOP_POINTER,
      pointerType: 'desktop',
    } ),
  );
  const hit = resolvedCandidate.hit;
  const sceneEntry = resolvedCandidate.sceneEntry;

  if ( sceneEntry?.object ) {

    hideReplayGhostPointersForLocalInteraction( { reason: 'scene-interaction' } );
    desktopState.mode = 'scene-target';
    desktopState.sceneSelection = {
      ...sceneEntry,
      hit,
    };
    desktopState.selected = null;
    desktopState.hovered = null;
    renderer.domElement.setPointerCapture( event.pointerId );
    renderer.domElement.style.cursor = 'grabbing';
    sceneEntry.handlers?.onSelectStart?.( buildSceneInteractionPayload( {
      source: INTERACTORS.DESKTOP_POINTER,
      hit,
    } ) );
    return;

  }

  if ( hit ) {

    hideReplayGhostPointersForLocalInteraction( { reason: 'scene-interaction' } );
    desktopState.mode = 'object';
    desktopState.selected = hit.object;
    desktopState.hovered = hit.object;
    hit.object.userData.grabbedBy = desktopGrabber;

    camera.getWorldDirection( dragNormal );
    desktopState.dragPlane.setFromNormalAndCoplanarPoint( dragNormal, hit.object.position );
    desktopState.dragOffset.copy( hit.object.position ).sub( hit.point );

    renderer.domElement.setPointerCapture( event.pointerId );
    renderer.domElement.style.cursor = 'grabbing';
    studyLogger?.recordObjectGrabStart( {
      interactor: INTERACTORS.DESKTOP_POINTER,
      source: INTERACTORS.DESKTOP_POINTER,
    } );
    return;

  }

  activeSceneController?.handleBackgroundSelect?.( {
    source: INTERACTORS.DESKTOP_POINTER,
  } );
  hideReplayGhostPointersForLocalInteraction( { reason: 'camera-navigation' } );
  desktopState.mode = 'pan';
  renderer.domElement.setPointerCapture( event.pointerId );
  renderer.domElement.style.cursor = 'grabbing';

}

function onPointerMove( event ) {

  if ( renderer.xr.isPresenting || isLocalInteractionBlocked() ) {

    return;

  }

  setPointerFromEvent( event );

  if ( desktopState.activePointerId !== event.pointerId || desktopState.mode === null ) {

    updateDesktopHover();
    return;

  }

  const deltaX = event.clientX - desktopState.lastPointer.x;
  const deltaY = event.clientY - desktopState.lastPointer.y;
  desktopState.lastPointer.set( event.clientX, event.clientY );

  if ( desktopState.mode === 'object' && desktopState.selected ) {

    camera.updateMatrixWorld( true );
    raycaster.setFromCamera( pointer, camera );

    if ( raycaster.ray.intersectPlane( desktopState.dragPlane, dragPoint ) ) {

      desktopState.selected.position.copy( dragPoint ).add( desktopState.dragOffset );

    }

    return;

  }

  if ( desktopState.mode === 'scene-target' && desktopState.sceneSelection ) {

    const intersections = getDesktopIntersections();
    const resolvedCandidate = resolveSceneRaycastCandidate(
      intersections,
      buildSceneRaycastResolverContext( {
        phase: 'select',
        source: INTERACTORS.DESKTOP_POINTER,
        pointerType: 'desktop',
      } ),
    );
    desktopState.sceneSelection.handlers?.onSelectMove?.( buildSceneInteractionPayload( {
      source: INTERACTORS.DESKTOP_POINTER,
      hit: resolvedCandidate.hit,
    } ) );
    return;

  }

  if ( desktopState.mode === 'pan' ) {

    panDesktopCamera( deltaX, deltaY );
    return;

  }

  if ( desktopState.mode === 'rotate' ) {

    rotateDesktopCamera( deltaX, deltaY );

  }

}

function onPointerUp( event ) {

  if ( isLocalInteractionBlocked() ) {

    onPointerCancel();
    return;

  }

  if ( desktopState.activePointerId !== event.pointerId ) {

    return;

  }

  const shouldLogGrabEnd = desktopState.mode === 'object' && desktopState.selected;
  const sceneSelection = desktopState.sceneSelection;

  if ( renderer.domElement.hasPointerCapture( event.pointerId ) ) {

    renderer.domElement.releasePointerCapture( event.pointerId );

  }

  if ( shouldLogGrabEnd ) {

    studyLogger?.recordObjectGrabEnd( {
      interactor: INTERACTORS.DESKTOP_POINTER,
      source: INTERACTORS.DESKTOP_POINTER,
    } );

  }

  if ( sceneSelection ) {

    const intersections = getDesktopIntersections();
    const resolvedCandidate = resolveSceneRaycastCandidate(
      intersections,
      buildSceneRaycastResolverContext( {
        phase: 'select',
        source: INTERACTORS.DESKTOP_POINTER,
        pointerType: 'desktop',
      } ),
    );
    sceneSelection.handlers?.onSelectEnd?.( buildSceneInteractionPayload( {
      source: INTERACTORS.DESKTOP_POINTER,
      hit: resolvedCandidate.hit,
    } ) );

  }

  releaseDesktopInteraction();
  updateDesktopHover();

}

function onPointerLeave() {

  if ( renderer.xr.isPresenting || desktopState.mode !== null || isLocalInteractionBlocked() ) {

    return;

  }

  desktopState.hovered = null;
  updateDesktopSceneHover( null );
  renderer.domElement.style.cursor = 'default';

}

function onPointerCancel() {

  if ( desktopState.activePointerId !== null && renderer.domElement.hasPointerCapture( desktopState.activePointerId ) ) {

    renderer.domElement.releasePointerCapture( desktopState.activePointerId );

  }

  releaseDesktopInteraction();
  desktopState.hovered = null;
  updateDesktopSceneHover( null );
  renderer.domElement.style.cursor = 'default';

}

function onKeyDown( event ) {

  if ( renderer.xr.isPresenting || isLocalInteractionBlocked() ) {

    return;

  }

  if ( event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD' ) {

    hideReplayGhostPointersForLocalInteraction( { reason: 'camera-navigation' } );
    pressedKeys.add( event.code );
    event.preventDefault();

  }

}

function onKeyUp( event ) {

  pressedKeys.delete( event.code );

}

function onWindowBlur() {

  pressedKeys.clear();
  onPointerCancel();

}

function onWheel( event ) {

  if ( renderer.xr.isPresenting || isLocalInteractionBlocked() ) {

    return;

  }

  const direction = Math.sign( event.deltaY );

  if ( direction === 0 ) {

    return;

  }

  hideReplayGhostPointersForLocalInteraction( { reason: 'camera-navigation' } );
  moveCameraForward( - direction * wheelMoveStep );
  event.preventDefault();

}

function startXRObjectGrab( controller, object ) {

  object.userData.grabbedBy = controller;
  controller.attach( object );
  controller.userData.selected = object;
  controller.userData.mode = 'object';
  controller.userData.hovered = null;

}

function releaseControllerObject( controller ) {

  const selected = controller.userData.selected;

  if ( ! selected ) {

    return;

  }

  scene.attach( selected );
  selected.userData.grabbedBy = null;
  controller.userData.selected = null;

}

function releaseControllerAction( controller ) {

  if ( controller.userData.mode === 'object' ) {

    releaseControllerObject( controller );

  }

  controller.userData.mode = null;
  controller.userData.hovered = null;
  controller.userData.sceneSelection = null;
  controller.userData.pointerTarget = null;
  clearControllerSceneHover( controller );

  const cursor = controller.getObjectByName( 'cursor' );
  if ( cursor ) {

    cursor.visible = false;

  }

}

function releaseAllXRControllerActions() {

  for ( const controller of controllers ) {

    releaseControllerAction( controller );

  }

}

function buildController( index ) {

  const controller = renderer.xr.getController( index );
  controller.userData.index = index;
  controller.userData.mode = null;
  controller.userData.selected = null;
  controller.userData.hovered = null;
  controller.userData.hoveredSceneEntry = null;
  controller.userData.sceneSelection = null;
  controller.userData.pointerTarget = null;
  controller.userData.handedness = null;
  controller.userData.inputSource = null;
  controller.addEventListener( 'connected', ( event ) => {

    controller.userData.handedness = event.data?.handedness || null;
    controller.userData.inputSource = event.data || null;
    void setupControllerHitTestSource( controller, event.data || null );

  } );
  controller.addEventListener( 'disconnected', () => {

    releaseControllerAction( controller );
    resetControllerHitTestState( controller, { clearInputSource: true } );

  } );

  controller.addEventListener( 'selectstart', onSelectStart );
  controller.addEventListener( 'selectend', onSelectEnd );

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints( [
      new THREE.Vector3( 0, 0, 0 ),
      new THREE.Vector3( 0, 0, - 1 ),
    ] ),
    new THREE.LineBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0.9 } ),
  );
  line.name = 'ray';
  line.scale.z = defaultRayLength;
  controller.add( line );

  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry( 0.015, 16, 16 ),
    new THREE.MeshBasicMaterial( { color: 0xffffff, toneMapped: false } ),
  );
  cursor.name = 'cursor';
  cursor.visible = false;
  controller.add( cursor );

  const grip = renderer.xr.getControllerGrip( index );
  grip.add( controllerModelFactory.createControllerModel( grip ) );

  scene.add( controller );
  scene.add( grip );
  controllers.push( controller );

}

function onSelectStart( event ) {

  const controller = event.target;

  if ( ! renderer.xr.isPresenting || isLocalInteractionBlocked() ) {

    return;

  }

  const intersections = getXRIntersections( controller );
  const resolvedCandidate = resolveSceneRaycastCandidate(
    intersections,
    buildSceneRaycastResolverContext( {
      phase: 'select',
      source: getControllerInteractorId( controller ),
      pointerType: 'xr',
    } ),
  );

  if ( ! resolvedCandidate.hit ) {

    activeSceneController?.handleBackgroundSelect?.( buildSceneInteractionPayload( {
      source: getControllerInteractorId( controller ),
      controller,
      hit: null,
    } ) );
    return;

  }

  const hit = resolvedCandidate.hit;
  const sceneEntry = resolvedCandidate.sceneEntry;

  if ( sceneEntry?.object ) {

    controller.userData.sceneSelection = {
      ...sceneEntry,
      hit,
    };
    sceneEntry.handlers?.onSelectStart?.( buildSceneInteractionPayload( {
      source: getControllerInteractorId( controller ),
      controller,
      hit,
    } ) );
    return;

  }

  startXRObjectGrab( controller, hit.object );
  studyLogger?.recordObjectGrabStart( {
    interactor: getControllerInteractorId( controller ),
    source: getControllerInteractorId( controller ),
  } );

}

function onSelectEnd( event ) {

  const controller = event.target;
  const interactor = getControllerInteractorId( controller );
  const sceneSelection = controller.userData.sceneSelection;

  if ( sceneSelection ) {

    sceneSelection.handlers?.onSelectEnd?.( buildSceneInteractionPayload( {
      source: interactor,
      controller,
      hit: sceneSelection.hit || null,
    } ) );
    controller.userData.sceneSelection = null;
    return;

  }

  const shouldLogGrabEnd = controller.userData.mode === 'object' && controller.userData.selected;

  if ( shouldLogGrabEnd && ! isLocalInteractionBlocked() ) {

    studyLogger?.recordObjectGrabEnd( {
      interactor,
      source: interactor,
    } );

  }

  releaseControllerAction( controller );

}

function updateControllerState( controller ) {

  const line = controller.getObjectByName( 'ray' );
  const cursor = controller.getObjectByName( 'cursor' );

  if ( ! renderer.xr.isPresenting ) {

    clearControllerSceneHover( controller );
    controller.userData.hovered = null;
    controller.userData.pointerTarget = null;
    if ( controller.userData.mode !== 'object' ) {

      controller.userData.mode = null;

    }
    line.scale.z = defaultRayLength;
    cursor.visible = false;
    return;

  }

  if ( controller.userData.mode === 'object' ) {

    clearControllerSceneHover( controller );
    cube.getWorldPosition( tempReplayPointerTarget );
    controller.userData.pointerTarget = vector3ToArray( tempReplayPointerTarget );
    line.scale.z = 0.6;
    cursor.visible = false;
    return;

  }

  const intersections = getXRIntersections( controller );
  const resolvedCandidate = resolveSceneRaycastCandidate(
    intersections,
    buildSceneRaycastResolverContext( {
      phase: 'hover',
      source: getControllerInteractorId( controller ),
      pointerType: 'xr',
    } ),
  );
  const hit = resolvedCandidate.hit;
  const sceneEntry = resolvedCandidate.sceneEntry;

  updateControllerSceneHover( controller, sceneEntry?.object ? sceneEntry : null );

  if ( controller.userData.sceneSelection ) {

    controller.userData.sceneSelection.handlers?.onSelectMove?.( buildSceneInteractionPayload( {
      source: getControllerInteractorId( controller ),
      controller,
      hit,
    } ) );

  }

  if ( sceneEntry?.object ) {

    controller.userData.hovered = null;
    controller.userData.pointerTarget = vector3ToArray( hit.point );
    line.scale.z = hit.distance;
    cursor.position.set( 0, 0, - Math.max( 0.04, hit.distance - 0.01 ) );
    cursor.visible = true;
    return;

  }

  if ( hit ) {

    controller.userData.hovered = hit.object;
    controller.userData.pointerTarget = vector3ToArray( hit.point );
    line.scale.z = hit.distance;
    cursor.position.set( 0, 0, - Math.max( 0.04, hit.distance - 0.01 ) );
    cursor.visible = true;

  } else {

    controller.userData.hovered = null;
    controller.userData.pointerTarget = null;
    line.scale.z = defaultRayLength;
    cursor.visible = false;

  }

}

function applyReplayInteractionState( replayState ) {

  sceneInteractionDebugStateBySource.clear();
  desktopState.hovered = null;
  updateDesktopSceneHover( null );
  desktopState.selected = null;
  desktopState.sceneSelection = null;
  desktopState.mode = null;
  renderer.domElement.style.cursor = 'default';
  cube.userData.grabbedBy = null;

  for ( const controller of controllers ) {

    controller.userData.selected = null;
    controller.userData.mode = null;
    controller.userData.hovered = null;
    controller.userData.sceneSelection = null;
    controller.userData.pointerTarget = null;
    clearControllerSceneHover( controller );

    const cursor = controller.getObjectByName( 'cursor' );
    if ( cursor ) {

      cursor.visible = false;

    }

    const line = controller.getObjectByName( 'ray' );
    if ( line ) {

      line.scale.z = defaultRayLength;

    }

  }

  const shouldShowGrabState =
    replayState.interactionPhase === 'grab-start' ||
    replayState.interactionPhase === 'manipulating';

  if ( ! shouldShowGrabState ) {

    return;

  }

  if ( replayState.activeInteractor === INTERACTORS.DESKTOP_POINTER ) {

    cube.userData.grabbedBy = desktopGrabber;
    return;

  }

  const controller = replayState.activeInteractor === INTERACTORS.CONTROLLER_1
    ? controllers[ 1 ]
    : controllers[ 0 ];

  if ( controller ) {

    cube.userData.grabbedBy = controller;
    controller.userData.selected = cube;
    controller.userData.mode = 'object';

  }

}

function applyReplayState( replayState ) {

  pressedKeys.clear();
  onPointerCancel();
  releaseAllXRControllerActions();
  replayGhostPointersHiddenByViewer = false;
  replayGhostPointersHiddenReason = null;

  if (
    typeof replayState.sceneKey === 'string' &&
    replayState.sceneKey.trim().length > 0 &&
    replayState.sceneKey !== activeSceneDefinition?.sceneKey
  ) {

    const replaySceneDefinition = getSceneDefinitionByKey( replayState.sceneKey );

    if ( replaySceneDefinition.sceneKey !== replayState.sceneKey && replayState.sceneKey !== DEFAULT_SCENE_KEY ) {

      console.warn( `Unknown replay scene key "${replayState.sceneKey}". Falling back to the default template scene.` );

    }

    activateSceneDefinition( replaySceneDefinition );

  }

  scene.attach( cube );
  cube.userData.grabbedBy = null;
  cube.position.fromArray( replayState.cube.position );
  cube.quaternion.fromArray( replayState.cube.quaternion );
  cube.scale.set( 1, 1, 1 );

  xrOrigin.position.fromArray( replayState.xrOrigin.position );
  xrOrigin.quaternion.fromArray( replayState.xrOrigin.quaternion );
  xrOrigin.scale.set( 1, 1, 1 );

  camera.position.fromArray( replayState.camera.position );
  camera.quaternion.fromArray( replayState.camera.quaternion );
  camera.scale.set( 1, 1, 1 );

  setPresentationMode( replayState.presentationMode );
  activeSceneController?.applySceneStateFromReplay?.( replayState.sceneState );
  applyReplayInteractionState( replayState );
  updateGhostReplayPointersFromState( replayState.replayPointers );

  captureReplayCameraPoseFromScene();
  const interactionPolicy = studyLogger?.getInteractionPolicy?.();
  ensureReplayAvatarLoaded( interactionPolicy );
  updateReplayAvatar( interactionPolicy );
  refreshInteractableAppearance();
  renderScene( interactionPolicy );

}

function handleInteractionPolicyChange( policy ) {

  if ( policy.isAnalysisSession && renderer.xr.isPresenting ) {

    void renderer.xr.getSession()?.end().catch( ( error ) => {

      console.warn( 'Unable to end XR session while entering analysis mode.', error );

    } );

  }

  if ( ! policy.canInteract ) {

    pressedKeys.clear();
    onPointerCancel();
    releaseAllXRControllerActions();
    desktopState.hovered = null;
    renderer.domElement.style.cursor = 'default';

  }

  if ( ! policy.isAnalysisSession || ! policy.hasReceivedReplayState ) {

    replayGhostPointersHiddenByViewer = false;
    replayGhostPointersHiddenReason = null;
    hideAllGhostReplayPointers();

  }

  applyActiveTemplateConfig();
  updateHud();
  updateScenePanelVisibility();
  updatePausedReplayOverlay( policy );

  if ( isReplayVisualAnalysisActive( policy ) ) {

    ensureReplayAvatarLoaded( policy );
    updateReplayAvatar( policy );

  } else {

    replayAvatarRoot.visible = false;

  }

  updateBridgeLockStateUI();
  refreshInteractableAppearance();
  renderScene( policy );

}

function animate( _timestamp = 0, xrFrame = null ) {

  timer.update();
  const deltaSeconds = Math.min( timer.getDelta(), 0.05 );
  const interactionPolicy = studyLogger?.getInteractionPolicy?.();
  const xrHitTest = getCompactXRHitTestState( xrFrame );
  updateKeyboardMovement( deltaSeconds );

  for ( const controller of controllers ) {

    updateControllerState( controller );

  }

  const activeGrabInteractor = getActiveGrabInteractorId();
  if ( activeGrabInteractor ) {

    studyLogger?.sampleObjectTransformIfNeeded( {
      interactor: activeGrabInteractor,
      source: activeGrabInteractor,
    } );

  }

  if ( renderer.xr.isPresenting || cameraSamplingRequested ) {

    const cameraSampleStatus = studyLogger?.sampleCameraTransformIfNeeded( {
      interactor: activeGrabInteractor,
      source: renderer.xr.isPresenting ? 'xr-camera' : 'desktop-camera',
    } );

    if ( ! renderer.xr.isPresenting && cameraSampleStatus !== 'pending' ) {

      cameraSamplingRequested = false;

    }

  }

  if ( renderer.xr.isPresenting ) {

    studyLogger?.samplePointerStateIfNeeded( {
      source: 'xr-pointer',
    } );

  }

  activeSceneController?.update?.( deltaSeconds, {
    presentationMode: currentMode,
    xrHitTest,
    interactionPolicy,
  } );

  if ( isReplayVisualAnalysisActive( interactionPolicy ) ) {

    ensureReplayAvatarLoaded( interactionPolicy );
    updateReplayAvatar( interactionPolicy );

  } else {

    replayAvatarRoot.visible = false;

  }

  refreshInteractableAppearance();
  renderScene( interactionPolicy );

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );
  labelRenderer.setSize( window.innerWidth, window.innerHeight );

}

renderer.xr.addEventListener( 'sessionstart', () => {

  if ( studyLogger && ! studyLogger.canEnterImmersiveSession() ) {

    return;

  }

  releaseDesktopInteraction();
  desktopState.hovered = null;
  renderer.domElement.style.cursor = 'default';

  resetCameraForXRSession();
  studyLogger?.recordCameraReset( { source: 'xr-session-reset' } );

  const blendMode = renderer.xr.getEnvironmentBlendMode();
  const isPassthroughStyle = blendMode === 'alpha-blend' || blendMode === 'additive';
  const nextMode = isPassthroughStyle
    ? PRESENTATION_MODES.IMMERSIVE_AR
    : PRESENTATION_MODES.IMMERSIVE_VR;
  const session = renderer.xr.getSession();

  setPresentationMode( nextMode );

  if ( ! isPresentationModeSupportedByActiveScene( nextMode ) ) {

    activeSceneController?.onUnsupportedImmersiveMode?.( nextMode );
    updateHud();
    return;

  }

  studyLogger?.recordSessionStart( {
    mode: nextMode,
    source: 'xr-session',
  } );

  if ( isPassthroughStyle ) {

    void alignARViewToFloor();
    void setupARHitTestSource( session );

    for ( const controller of controllers ) {

      if ( controller.userData.inputSource ) {

        void setupControllerHitTestSource( controller, controller.userData.inputSource );

      }

    }

  }

} );

renderer.xr.addEventListener( 'sessionend', () => {

  const endingMode = currentMode;

  releaseAllXRControllerActions();
  studyLogger?.recordSessionEnd( { source: 'xr-session' } );
  flattenXRToDesktopCamera();
  desktopState.hovered = null;
  renderer.xr.setReferenceSpace( null );
  renderer.xr.setReferenceSpaceType( 'local-floor' );
  resetXRHitTestState();
  setPresentationMode( PRESENTATION_MODES.DESKTOP );
  cameraSamplingRequested = false;

  if ( endingMode !== PRESENTATION_MODES.DESKTOP ) {

    markCameraForSampling();

  }

} );

initializeSceneLayout();
activateSceneDefinition( activeSceneDefinition );
buildController( 0 );
buildController( 1 );
applyReplayVisualConfigToDom();

for ( const interactor of REPLAY_POINTER_IDS ) {

  createGhostReplayPointer( interactor );

}

studyLogger = createXRStudyLogger( {
  bridge: revisitBridge,
  getSceneSnapshot,
  applyReplayState,
  getLoggingConfig: getActiveSceneLoggingConfig,
  getSceneAnswerSummary: getActiveSceneAnswerSummary,
  normalizeSceneReplayState: normalizeSceneStateForReplay,
} );

studyLogger.onInteractionPolicyChange( handleInteractionPolicyChange );
ensureReplayAvatarLoaded( studyLogger.getInteractionPolicy() );
updateReplayAvatar( studyLogger.getInteractionPolicy() );

if ( import.meta.env.DEV ) {

  window.__revisitXRDebug = {
    getState: () => studyLogger.getState(),
    getLiveSceneSnapshot: () => getSceneSnapshot(),
    getActiveSceneKey: () => activeSceneDefinition?.sceneKey || DEFAULT_SCENE_KEY,
    getGraph: () => studyLogger.getGraph(),
    exportAnswers: () => studyLogger.exportAnswers(),
    applyReplayState: ( state ) => studyLogger.applyReplayStateSnapshot( state ),
    isReplayControlled: () => studyLogger.isReplayControlled(),
    getInteractionPolicy: () => studyLogger.getInteractionPolicy(),
    setAnalysisControl: ( control ) => studyLogger.setAnalysisControl( control ),
    getLoggingStats: () => studyLogger.getLoggingStats(),
    getReplayPointerVisuals: () => getGhostReplayPointerDebugState(),
    getReplayAvatarVisuals: () => getReplayAvatarDebugState(),
    getActiveSceneDebugState: () => activeSceneController?.getDebugState?.() || null,
    getStudyData: () => studyLogger.getStudyData(),
  };

}

updateHud();
updatePausedReplayOverlay();
updateBridgeLockStateUI();
revisitBridge.postReady();

window.addEventListener( 'resize', onWindowResize );
window.addEventListener( 'blur', onWindowBlur );
window.addEventListener( 'keydown', onKeyDown );
window.addEventListener( 'keyup', onKeyUp );
renderer.domElement.addEventListener( 'contextmenu', ( event ) => event.preventDefault() );
renderer.domElement.addEventListener( 'pointerdown', onPointerDown );
renderer.domElement.addEventListener( 'pointermove', onPointerMove );
renderer.domElement.addEventListener( 'pointerup', onPointerUp );
renderer.domElement.addEventListener( 'pointercancel', onPointerCancel );
renderer.domElement.addEventListener( 'pointerleave', onPointerLeave );
renderer.domElement.addEventListener( 'wheel', onWheel, { passive: false } );
renderer.setAnimationLoop( animate );
