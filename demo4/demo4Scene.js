import * as THREE from 'three';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createSituatedAnchor } from '../scenes/core/situatedAnchor.js';
import {
  DEMO4_INTERACTION_MODALITIES,
  DEMO4_LAYER_MODES,
  DEMO4_PLACEMENT_SOURCES,
  DEMO4_PLACEMENT_MODES,
  DEMO4_PLACEMENT_DRIVERS,
  normalizeDemo4ControlPanelY,
  normalizeDemo4InteractionModality,
  normalizeDemo4MetricId,
  normalizeDemo4PlacementControllerSource,
  normalizeDemo4PlacementSource,
  normalizeDemo4SceneState,
  normalizeDemo4SiteId,
  normalizeDemo4TimeIndex,
  parseDemo4Conditions,
} from './demo4Conditions.js';
import {
  DEMO4_METRIC_IDS,
  DEMO4_SITE_IDS,
  getDemo4Dataset,
  getDemo4Metric,
  getDemo4Reading,
  getDemo4Site,
  getDemo4TimeSlice,
  getDemo4VisibleSiteIds,
  formatDemo4Reading,
} from './demo4Data.js';
import { DEMO4_DEFAULT_TASK_ID, getDemo4Task } from './demo4Tasks.js';
import { demo4LoggingConfig } from './demo4LoggingConfig.js';
import { demo4VisualConfig } from './demo4VisualConfig.js';

const HALF_PI = Math.PI * 0.5;
const WORLD_UP = new THREE.Vector3( 0, 1, 0 );
const gazeRaycaster = new THREE.Raycaster();
const tempCameraWorldPosition = new THREE.Vector3();
const tempCameraWorldDirection = new THREE.Vector3();
const tempPlacementPosition = new THREE.Vector3();
const tempPlacementQuaternion = new THREE.Quaternion();
const tempSurfaceNormal = new THREE.Vector3();
const tempInstructionCardPosition = new THREE.Vector3();
const tempInstructionCardTargetPosition = new THREE.Vector3();
const tempControlPanelDragPoint = new THREE.Vector3();
const tempControlPanelWorldPosition = new THREE.Vector3();
const tempControlPanelPlaneNormal = new THREE.Vector3();
const controlPanelHeightDragRay = new THREE.Ray();
const controlPanelHeightDragPlane = new THREE.Plane();

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function vector3FromArray( value, fallback = [ 0, 0, 0 ] ) {

  if ( value?.isVector3 ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 3 && value.every( isFiniteNumber ) ) {

    return new THREE.Vector3( value[ 0 ], value[ 1 ], value[ 2 ] );

  }

  return vector3FromArray( fallback, [ 0, 0, 0 ] );

}

function quaternionFromArray( value, fallback = [ 0, 0, 0, 1 ] ) {

  if ( value?.isQuaternion ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 4 && value.every( isFiniteNumber ) ) {

    return new THREE.Quaternion( value[ 0 ], value[ 1 ], value[ 2 ], value[ 3 ] ).normalize();

  }

  return quaternionFromArray( fallback, [ 0, 0, 0, 1 ] );

}

function vector3ToArray( vector ) {

  return [ vector.x, vector.y, vector.z ];

}

function quaternionToArray( quaternion ) {

  return [ quaternion.x, quaternion.y, quaternion.z, quaternion.w ];

}

function jsonStringifyCompact( value ) {

  try {

    return JSON.stringify( value );

  } catch {

    return '{}';

  }

}

function createMaterial( {
  color = 0xffffff,
  emissive = 0x000000,
  opacity = 1,
  metalness = 0.02,
  roughness = 0.72,
} = {} ) {

  return new THREE.MeshStandardMaterial( {
    color,
    emissive,
    transparent: true,
    opacity,
    metalness,
    roughness,
  } );

}

function createBasicMaterial( {
  color = 0xffffff,
  opacity = 1,
  side = THREE.DoubleSide,
  depthWrite = false,
  depthTest = true,
} = {} ) {

  return new THREE.MeshBasicMaterial( {
    color,
    transparent: true,
    opacity,
    side,
    depthWrite,
    depthTest,
    toneMapped: false,
  } );

}

function createTrackedMesh( collection, parent, geometry, material, {
  name = '',
  position = null,
  rotation = null,
  renderOrder = null,
} = {} ) {

  const mesh = new THREE.Mesh( geometry, material );
  mesh.name = name;

  if ( position ) {

    mesh.position.copy( vector3FromArray( position ) );

  }

  if ( rotation ) {

    mesh.rotation.set( rotation[ 0 ] || 0, rotation[ 1 ] || 0, rotation[ 2 ] || 0 );

  }

  if ( Number.isFinite( renderOrder ) ) {

    mesh.renderOrder = renderOrder;

  }

  parent?.add( mesh );
  collection.push( {
    mesh,
    dispose() {

      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();

    },
  } );
  return mesh;

}

function createTrackedTextPlane( collection, parent, options, position, {
  name = '',
  rotation = null,
  renderOrder = null,
  depthTest = null,
} = {} ) {

  const controller = createTextPlane( options );
  controller.mesh.name = name;
  controller.mesh.position.copy( vector3FromArray( position ) );

  if ( rotation ) {

    controller.mesh.rotation.set( rotation[ 0 ] || 0, rotation[ 1 ] || 0, rotation[ 2 ] || 0 );

  }

  if ( Number.isFinite( renderOrder ) ) {

    controller.mesh.renderOrder = renderOrder;

  }

  if ( typeof depthTest === 'boolean' ) {

    controller.mesh.material.depthTest = depthTest;
    controller.mesh.material.needsUpdate = true;

  }

  parent?.add( controller.mesh );
  collection.push( {
    dispose() {

      controller.mesh.removeFromParent();
      controller.dispose();

    },
  } );
  return controller;

}

function createTrackedTextSprite( collection, parent, options, position, {
  name = '',
  renderOrder = null,
} = {} ) {

  const controller = createTextSprite( options );
  controller.sprite.name = name;
  controller.sprite.position.copy( vector3FromArray( position ) );

  if ( Number.isFinite( renderOrder ) ) {

    controller.sprite.renderOrder = renderOrder;

  }

  parent?.add( controller.sprite );
  collection.push( {
    dispose() {

      controller.sprite.removeFromParent();
      controller.dispose();

    },
  } );
  return controller;

}

function createHorizontalPlane( collection, parent, width, depth, material, {
  name = '',
  y = 0,
  renderOrder = null,
} = {} ) {

  return createTrackedMesh(
    collection,
    parent,
    new THREE.PlaneGeometry( width, depth ),
    material,
    {
      name,
      position: [ 0, y, 0 ],
      rotation: [ - HALF_PI, 0, 0 ],
      renderOrder,
    },
  );

}

function createRectangleBorder( collection, parent, width, height, color, opacity, z, name ) {

  const x = width * 0.5;
  const y = height * 0.5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [
    - x, - y, z, x, - y, z,
    x, - y, z, x, y, z,
    x, y, z, - x, y, z,
    - x, y, z, - x, - y, z,
  ], 3 ) );
  const material = new THREE.LineBasicMaterial( {
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
  } );
  const line = new THREE.LineSegments( geometry, material );
  line.name = name;
  line.renderOrder = demo4VisualConfig.footprint.renderOrder + 2;
  parent?.add( line );
  collection.push( {
    dispose() {

      line.removeFromParent();
      geometry.dispose();
      material.dispose();

    },
  } );
  return line;

}

function getReadingRange( metricId, timeIndex ) {

  const values = DEMO4_SITE_IDS.map( ( siteId ) => getDemo4Reading( siteId, metricId, timeIndex ) );
  const min = Math.min( ...values );
  const max = Math.max( ...values );

  return {
    min: Number.isFinite( min ) ? min : 0,
    max: Number.isFinite( max ) ? max : 1,
  };

}

function getNormalizedReadingRatio( value, range ) {

  const span = Math.max( 1, range.max - range.min );
  return THREE.MathUtils.clamp( ( value - range.min ) / span, 0, 1 );

}

function getAnchorSurfaceHeightFromPosition( position ) {

  const anchorPosition = vector3FromArray( position, demo4VisualConfig.placement.defaultPreviewPosition );
  return Math.max(
    0,
    anchorPosition.y - demo4VisualConfig.placement.floorY - demo4VisualConfig.placement.overlayLift,
  );

}

function buildAnchorTransformFromState( sceneState ) {

  return {
    position: sceneState.arAnchorPosition,
    quaternion: sceneState.arAnchorQuaternion,
    scale: sceneState.arScaleFactor,
    placementSource: sceneState.placementSource,
    surfaceDetected: sceneState.surfaceDetected,
    surfaceHeight: sceneState.arAnchorSurfaceHeight,
    placementDriver: sceneState.placementDriver,
    placementControllerSource: sceneState.placementControllerSource,
  };

}

export const demo4SceneDefinition = Object.freeze( {
  sceneKey: 'demo4',
  queryValue: '4',
  label: 'Demo 4 Situated AR Overlay',
  supportedImmersiveModes: Object.freeze( {
    ar: true,
    vr: false,
  } ),
  loggingConfig: demo4LoggingConfig,
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
    modeOverrides: Object.freeze( {
      desktop: Object.freeze( {
        showFloor: true,
        showGrid: true,
      } ),
      'immersive-ar': Object.freeze( {
        showFloor: false,
        showGrid: false,
      } ),
      'immersive-vr': Object.freeze( {
        showFloor: false,
        showGrid: false,
      } ),
      analysis: Object.freeze( {
        showFloor: true,
        showGrid: true,
      } ),
    } ),
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return normalizeDemo4SceneState( candidateState, fallbackState, { defaultTaskId: DEMO4_DEFAULT_TASK_ID } );

  },
  createScene( context ) {

    const dataset = getDemo4Dataset();
    const task = getDemo4Task( DEMO4_DEFAULT_TASK_ID );
    const root = new THREE.Group();
    const disposables = [];
    const markerRecords = new Map();
    const buttonRecords = new Map();
    const hoveredSiteBySource = new Map();
    const desktopRefs = {};
    const defaultSceneState = parseDemo4Conditions( window.location.search, { defaultTaskId: DEMO4_DEFAULT_TASK_ID } );
    let currentSceneState = normalizeDemo4SceneState( defaultSceneState, defaultSceneState );
    let placementConfirmInProgress = false;
    let placementAnchor = null;
    let anchoredContentRoot = null;
    let controlPanelRoot = null;
    let controlPanelTitleBarMesh = null;
    let controlPanelTitleBarMaterial = null;
    let controlPanelTitleBarHovered = false;
    let activeControlPanelHeightDrag = null;
    let detailRoot = null;
    let panelTaskText = null;
    let panelPlacementText = null;
    let panelStateText = null;
    let panelInteractionHelpText = null;
    let panelDetailText = null;
    let detailText = null;
    let placementPromptText = null;
    let placementInstructionCardRoot = null;
    let placementInstructionBodyText = null;
    let placementInstructionStatusText = null;
    let supportPedestalMesh = null;
    let supportPedestalLabelController = null;
    let supportPedestalVisible = false;
    let dwellProgressRing = null;
    let dwellTargetSiteId = null;
    let dwellElapsedMs = 0;
    let dwellActivatedSiteId = null;
    let unsupportedImmersiveMode = null;
    let placementPreviewStatus = 'lost';
    let placementPreviewSourceLabel = null;
    let placementPromptOverrideText = null;
    let placementPromptOverrideUntil = 0;
    let hasInstructionCardPose = false;
    let lastInstructionCardPoseAt = 0;
    const lastInstructionCardPosition = new THREE.Vector3();
    const lastPlacementSelectDebug = {
      source: null,
      interactor: null,
      handedness: null,
      controllerIndex: null,
      accepted: false,
      reason: 'none',
      backgroundConfirmed: false,
    };
    const placementStabilizer = {
      hasSmoothedPose: false,
      smoothedPosition: new THREE.Vector3(),
      smoothedQuaternion: new THREE.Quaternion(),
      lastAcceptedPosition: new THREE.Vector3(),
      stableFrameCount: 0,
      lastAcceptedAt: 0,
    };

    root.name = 'demo4-situated-overlay-root';
    context.sceneContentRoot?.add( root );

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || demo4LoggingConfig.sceneState;

    }

    function getDemo4LoggingTuning() {

      return context.getLoggingConfig?.()?.demo4 || demo4LoggingConfig.demo4;

    }

    function getStableSceneLabel( key ) {

      return getDemo4LoggingTuning().stableLabels?.[ key ] || key;

    }

    function recordSceneChange( labelKey, source, { flushImmediately = false } = {} ) {

      return context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( labelKey ),
        flushImmediately,
      } ) === true;

    }

    function isBlockedVRMode() {

      return context.getPresentationMode?.() === 'immersive-vr';

    }

    function getPlacementControllerSource( payload = {} ) {

      if ( payload.handedness === 'left' ) {

        return 'left';

      }

      const interactor = payload.interactor || payload.source;

      if ( interactor === 'controller-0' || payload.controllerIndex === 0 ) {

        return 'controller-0';

      }

      if ( interactor === 'controller-1' || payload.controllerIndex === 1 ) {

        return 'controller-1';

      }

      return null;

    }

    function isAcceptedPlacementSource( payload = {} ) {

      const presentationMode = context.getPresentationMode?.();

      if ( presentationMode === 'desktop' ) {

        return payload.source === 'desktop-pointer' || payload.pointerType === 'desktop';

      }

      if ( presentationMode !== 'immersive-ar' ) {

        return false;

      }

      if ( payload.handedness === 'left' ) {

        return true;

      }

      if ( payload.handedness === 'right' ) {

        return false;

      }

      const interactor = payload.interactor || payload.source;
      return (
        ( interactor === demo4VisualConfig.placement.fallbackControllerSource || payload.controllerIndex === 0 ) &&
        ! payload.handedness
      );

    }

    function isDemo4DebugEnabled() {

      if ( import.meta.env.DEV === true ) {

        return true;

      }

      try {

        const params = new URLSearchParams( window.location.search );
        return params.get( 'debug' ) === '1' || params.get( 'debug' ) === 'true';

      } catch {

        return false;

      }

    }

    function getPrimitivePlacementSelectSource( payload = {} ) {

      return payload.interactor || payload.source || payload.pointerType || 'unknown';

    }

    function setPlacementSelectDebug( payload = {}, {
      accepted = false,
      reason = 'none',
      backgroundConfirmed = false,
    } = {} ) {

      lastPlacementSelectDebug.source = getPrimitivePlacementSelectSource( payload );
      lastPlacementSelectDebug.interactor = typeof payload.interactor === 'string' ? payload.interactor : null;
      lastPlacementSelectDebug.handedness = typeof payload.handedness === 'string' ? payload.handedness : null;
      lastPlacementSelectDebug.controllerIndex = Number.isInteger( payload.controllerIndex )
        ? payload.controllerIndex
        : null;
      lastPlacementSelectDebug.accepted = accepted === true;
      lastPlacementSelectDebug.reason = typeof reason === 'string' ? reason : 'none';
      lastPlacementSelectDebug.backgroundConfirmed = backgroundConfirmed === true;

    }

    function getPlacementPromptOverrideText() {

      if ( placementPromptOverrideText && performance.now() <= placementPromptOverrideUntil ) {

        return placementPromptOverrideText;

      }

      placementPromptOverrideText = null;
      placementPromptOverrideUntil = 0;
      return null;

    }

    function setPlacementPromptOverride( text, holdMs = 1400 ) {

      placementPromptOverrideText = typeof text === 'string' ? text : null;
      placementPromptOverrideUntil = placementPromptOverrideText
        ? performance.now() + Math.max( 0, holdMs )
        : 0;
      updatePlacementPrompt();

    }

    function getPlacementStatusText() {

      if ( currentSceneState.arPlacementConfirmed ) {

        return `Placed via ${currentSceneState.placementSource}.`;

      }

      if ( context.getPresentationMode?.() === 'desktop' ) {

        return 'Desktop fallback: confirm the default footprint or enter AR.';

      }

      const overrideText = getPlacementPromptOverrideText();

      if ( overrideText ) {

        return overrideText;

      }

      if ( placementPreviewStatus === 'ready' ) {

        return placementPreviewSourceLabel === 'controller-0-fallback'
          ? 'Surface ready: left trigger to place (controller-0 fallback)'
          : 'Surface ready: left trigger to place';

      }

      if ( placementPreviewStatus === 'stabilizing' ) {

        return placementPreviewSourceLabel === 'controller-0-fallback'
          ? 'Surface detected: stabilizing... (controller-0 fallback)'
          : 'Surface detected: stabilizing...';

      }

      if ( placementPreviewStatus === 'fallback-controller' ) {

        return 'Using controller-0 fallback because handedness is unavailable.';

      }

      return 'Surface lost: keep aiming at the real surface';

    }

    function getPlacementPromptText() {

      if ( currentSceneState.arPlacementConfirmed ) {

        return 'Overlay placed.';

      }

      if ( context.getPresentationMode?.() === 'desktop' ) {

        return 'Desktop fallback: confirm the default footprint in the side panel.';

      }

      return [
        'Use the LEFT controller to choose a real-world surface.',
        'Pull the trigger to place the overlay.',
        getPlacementStatusText(),
      ].join( '\n' );

    }

    function getPlacementInstructionCardBodyText() {

      return [
        'Use the LEFT controller to choose a real-world surface.',
        'Pull the trigger to place the overlay.',
      ].join( '\n' );

    }

    function getPlacementDebugState() {

      const livePlacementStatus = placementAnchor?.getPlacementStatus?.() || {};

      return {
        placementPreviewStatus,
        surfaceDetected: livePlacementStatus.surfaceDetected === true || currentSceneState.surfaceDetected === true,
        placementSource: livePlacementStatus.source || currentSceneState.placementSource,
        placementControllerSource: currentSceneState.placementControllerSource || null,
        lastPlacementSelectSource: lastPlacementSelectDebug.source,
        lastPlacementSelectInteractor: lastPlacementSelectDebug.interactor,
        lastPlacementSelectHandedness: lastPlacementSelectDebug.handedness,
        lastPlacementSelectControllerIndex: lastPlacementSelectDebug.controllerIndex,
        lastPlacementSelectAccepted: lastPlacementSelectDebug.accepted,
        lastPlacementSelectReason: lastPlacementSelectDebug.reason,
        lastBackgroundSelectConfirmed: lastPlacementSelectDebug.backgroundConfirmed,
        supportPedestalVisible,
        arAnchorSurfaceHeight: currentSceneState.arAnchorSurfaceHeight,
      };

    }

    function getPlacementDebugLine() {

      const debugState = getPlacementDebugState();
      const controllerIndex = Number.isInteger( debugState.lastPlacementSelectControllerIndex )
        ? debugState.lastPlacementSelectControllerIndex
        : 'none';

      return [
        `Debug placement: status=${debugState.placementPreviewStatus}`,
        `surface=${debugState.surfaceDetected ? 'yes' : 'no'}`,
        `source=${debugState.placementSource || 'none'}`,
        `controller=${debugState.placementControllerSource || 'none'}`,
        `last=${debugState.lastPlacementSelectSource || 'none'}`,
        `hand=${debugState.lastPlacementSelectHandedness || 'none'}`,
        `idx=${controllerIndex}`,
        `accepted=${debugState.lastPlacementSelectAccepted ? 'yes' : 'no'}`,
        `reason=${debugState.lastPlacementSelectReason || 'none'}`,
        `bgConfirm=${debugState.lastBackgroundSelectConfirmed ? 'yes' : 'no'}`,
        `support=${debugState.supportPedestalVisible ? 'yes' : 'no'}`,
        `height=${debugState.arAnchorSurfaceHeight.toFixed( 2 )}m`,
      ].join( ' | ' );

    }

    function getActivationSequence() {

      return currentSceneState.gazeDwellCount + currentSceneState.handSelectCount + 1;

    }

    function getPlacementInstructionText() {

      if ( isBlockedVRMode() ) {

        return 'Demo 4 is AR-first. Exit VR and start AR to place the situated overlay.';

      }

      if ( currentSceneState.arPlacementConfirmed ) {

        return `Overlay placed via ${currentSceneState.placementSource}.`;

      }

      return getPlacementStatusText();

    }

    function getCurrentMetric() {

      return getDemo4Metric( currentSceneState.metricId );

    }

    function getCurrentTimeSlice() {

      return getDemo4TimeSlice( currentSceneState.timeIndex );

    }

    function syncDerivedVisibleSiteIds() {

      currentSceneState.visibleSiteIds = getDemo4VisibleSiteIds( {
        metricId: currentSceneState.metricId,
        timeIndex: currentSceneState.timeIndex,
        layerMode: currentSceneState.layerMode,
      } );

    }

    function isSiteHovered( siteId ) {

      return [ ...hoveredSiteBySource.values() ].includes( siteId );

    }

    function getActiveSiteId() {

      return currentSceneState.focusedSiteId || currentSceneState.selectedSiteId || currentSceneState.taskAnswer;

    }

    function getActiveSite() {

      return getDemo4Site( getActiveSiteId() );

    }

    function getSiteSummaryText( siteId, { expanded = false } = {} ) {

      const site = getDemo4Site( siteId );
      const metric = getCurrentMetric();
      const timeSlice = getCurrentTimeSlice();

      if ( ! site || ! metric || ! timeSlice ) {

        return 'Select a site marker to inspect local readings.';

      }

      const currentValue = getDemo4Reading( siteId, metric.id, timeSlice.index );
      const lines = [
        `${site.label}`,
        `${timeSlice.label} ${metric.label}: ${formatDemo4Reading( currentValue, metric.id )}`,
      ];

      if ( expanded ) {

        lines.push(
          `Occupancy: ${formatDemo4Reading( getDemo4Reading( siteId, 'occupancy', timeSlice.index ), 'occupancy' )}`,
          `Noise: ${formatDemo4Reading( getDemo4Reading( siteId, 'noise', timeSlice.index ), 'noise' )}`,
          `CO2: ${formatDemo4Reading( getDemo4Reading( siteId, 'co2', timeSlice.index ), 'co2' )}`,
        );

      }

      return lines.join( '\n' );

    }

    function getPanelTaskText() {

      return task.id === DEMO4_DEFAULT_TASK_ID
        ? 'Task: Find the site with the highest midday CO2.'
        : `Task: ${task.prompt}`;

    }

    function getPanelPlacementText() {

      return 'Placement: Left controller on a real surface.';

    }

    function getPanelDetailText() {

      const activeSite = getActiveSite();
      const metric = getCurrentMetric();
      const timeSlice = getCurrentTimeSlice();

      if ( ! activeSite || ! metric || ! timeSlice ) {

        return 'Selected: none';

      }

      if ( currentSceneState.detailExpanded ) {

        return [
          `Selected: ${activeSite.label}`,
          `Occupancy: ${formatDemo4Reading( getDemo4Reading( activeSite.id, 'occupancy', timeSlice.index ), 'occupancy' )}`,
          `Noise: ${formatDemo4Reading( getDemo4Reading( activeSite.id, 'noise', timeSlice.index ), 'noise' )}`,
          `CO2: ${formatDemo4Reading( getDemo4Reading( activeSite.id, 'co2', timeSlice.index ), 'co2' )}`,
        ].join( ' | ' );

      }

      return `Selected: ${activeSite.label} | ${timeSlice.label} ${metric.label}: ${formatDemo4Reading(
        getDemo4Reading( activeSite.id, metric.id, timeSlice.index ),
        metric.id,
      )}`;

    }

    function getPanelStatusText() {

      const metric = getCurrentMetric();
      const timeSlice = getCurrentTimeSlice();
      const answerSite = getDemo4Site( currentSceneState.taskAnswer );
      const placementText = currentSceneState.arPlacementConfirmed
        ? `Placed (${currentSceneState.placementCount})`
        : 'Placement preview';
      const selectionText = answerSite
        ? `Answer draft: ${answerSite.label}`
        : 'Answer draft: none';

      return [
        `Task: ${task.prompt}`,
        `Placement: ${placementText}`,
        `Source: ${currentSceneState.placementSource}`,
        `Driver: ${currentSceneState.placementDriver}`,
        `Controller: ${currentSceneState.placementControllerSource || 'none'}`,
        `Surface height: ${currentSceneState.arAnchorSurfaceHeight.toFixed( 2 )} m`,
        `Surface detected: ${currentSceneState.surfaceDetected ? 'Yes' : 'No'}`,
        `Metric: ${metric?.label || currentSceneState.metricId}`,
        `Time: ${timeSlice?.label || currentSceneState.timeIndex}`,
        `Layer: ${currentSceneState.layerMode}`,
        `Interaction: ${currentSceneState.interactionModality}`,
        `Activations: gaze ${currentSceneState.gazeDwellCount}, hand ${currentSceneState.handSelectCount}`,
        `Visible sites: ${currentSceneState.visibleSiteIds.length}/${DEMO4_SITE_IDS.length}`,
        selectionText,
        currentSceneState.taskSubmitted ? 'Task submitted' : 'Task not submitted',
      ].join( '\n' );

    }

    function getPanelStateText() {

      const metric = getCurrentMetric();
      const timeSlice = getCurrentTimeSlice();
      const modeLabel = currentSceneState.interactionModality === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL
        ? 'Gaze'
        : 'Hand';
      const layerLabel = currentSceneState.layerMode === DEMO4_LAYER_MODES.ALERTS
        ? 'Alerts'
        : 'All';

      return [
        `Metric: ${metric?.label || currentSceneState.metricId}`,
        `Time: ${timeSlice?.label || currentSceneState.timeIndex}`,
        `Layer: ${layerLabel}`,
        `Mode: ${modeLabel}`,
      ].join( ' | ' );

    }

    function getPanelInteractionHelpText() {

      return 'Gaze: look at a site for 0.9s. Hand: aim and trigger.';

    }

    function getControlPanelFixedX() {

      return demo4VisualConfig.panel.position[ 0 ] || 0;

    }

    function getControlPanelFixedZ() {

      return demo4VisualConfig.panel.position[ 2 ] || 0;

    }

    function applyControlPanelY( nextY, { commitState = true } = {} ) {

      const clampedY = normalizeDemo4ControlPanelY( nextY, currentSceneState.controlPanelY );

      if ( commitState ) {

        currentSceneState.controlPanelY = clampedY;

      }

      if ( controlPanelRoot ) {

        controlPanelRoot.position.set( getControlPanelFixedX(), clampedY, getControlPanelFixedZ() );

      }

      return clampedY;

    }

    function syncControlPanelPosition() {

      applyControlPanelY( currentSceneState.controlPanelY );

    }

    function updateAnchorStateFromTransform( transform, payload = null ) {

      currentSceneState.arAnchorPosition = Array.isArray( transform?.position )
        ? [ ...transform.position ]
        : vector3ToArray( placementAnchor.anchorRoot.position );
      currentSceneState.arAnchorQuaternion = Array.isArray( transform?.quaternion )
        ? [ ...transform.quaternion ]
        : quaternionToArray( placementAnchor.anchorRoot.quaternion );
      currentSceneState.arScaleFactor = isFiniteNumber( transform?.scale )
        ? transform.scale
        : placementAnchor.anchorRoot.scale.x;
      currentSceneState.placementSource = normalizeDemo4PlacementSource(
        transform?.placementSource,
        currentSceneState.placementSource,
      );
      currentSceneState.surfaceDetected = typeof transform?.surfaceDetected === 'boolean'
        ? transform.surfaceDetected
        : currentSceneState.surfaceDetected;
      currentSceneState.placementDriver = demo4VisualConfig.placement.driver || DEMO4_PLACEMENT_DRIVERS.LEFT_CONTROLLER;
      currentSceneState.placementControllerSource = normalizeDemo4PlacementControllerSource(
        getPlacementControllerSource( payload || transform || {} ),
        currentSceneState.placementControllerSource,
      );
      currentSceneState.arAnchorSurfaceHeight = getAnchorSurfaceHeightFromPosition( currentSceneState.arAnchorPosition );

    }

    function applyPlacementStateToAnchor() {

      if ( ! isFiniteNumber( currentSceneState.arAnchorSurfaceHeight ) || currentSceneState.arAnchorSurfaceHeight <= 0 ) {

        currentSceneState.arAnchorSurfaceHeight = getAnchorSurfaceHeightFromPosition( currentSceneState.arAnchorPosition );

      }
      const transform = buildAnchorTransformFromState( currentSceneState );

      if ( currentSceneState.arPlacementConfirmed ) {

        placementAnchor.setAnchorTransform( transform );
        placementAnchor.setAnchorVisible( true );
        placementAnchor.setPreviewTransform( transform );
        placementAnchor.setPreviewVisible( false );
        placementAnchor.setPlacementEnabled( false );

      } else {

        placementAnchor.resetPlacement( transform );

      }

    }

    function confirmPlacement( sourceOrPayload, transform = null ) {

      if ( placementConfirmInProgress || isBlockedVRMode() ) {

        return;

      }

      const placementPayload = sourceOrPayload && typeof sourceOrPayload === 'object'
        ? sourceOrPayload
        : null;

      if ( placementPayload && ! isAcceptedPlacementSource( placementPayload ) ) {

        return;

      }

      if (
        placementPayload &&
        context.getPresentationMode?.() === 'immersive-ar' &&
        placementAnchor?.getPlacementStatus?.().source === DEMO4_PLACEMENT_SOURCES.XR_HIT_TEST &&
        placementPreviewStatus !== 'ready'
      ) {

        return;

      }

      placementConfirmInProgress = true;
      const source = placementPayload?.source || sourceOrPayload;
      const fallbackPlacementSource = context.getPresentationMode?.() === 'desktop'
        ? DEMO4_PLACEMENT_SOURCES.DESKTOP_DEFAULT
        : currentSceneState.placementSource;
      const confirmTransform = transform
        ? {
          ...transform,
          placementSource: transform.placementSource || fallbackPlacementSource,
          surfaceDetected: typeof transform.surfaceDetected === 'boolean'
            ? transform.surfaceDetected
            : currentSceneState.surfaceDetected,
        }
        : {
          placementSource: fallbackPlacementSource,
          surfaceDetected: currentSceneState.surfaceDetected,
        };
      const finalTransform = placementAnchor.confirmPlacement( confirmTransform );
      updateAnchorStateFromTransform( finalTransform, placementPayload );

      if ( context.getPresentationMode?.() === 'desktop' ) {

        currentSceneState.placementControllerSource = null;

      }

      currentSceneState.arPlacementConfirmed = true;
      currentSceneState.placementMode = DEMO4_PLACEMENT_MODES.ANCHORED;
      currentSceneState.placementCount += 1;
      placementPreviewStatus = 'placed';
      hoveredSiteBySource.clear();
      currentSceneState.focusedSiteId = currentSceneState.selectedSiteId;
      syncVisuals();
      recordSceneChange( 'placementConfirm', source || 'demo4-placement-confirm', {
        flushImmediately: getSceneStateLoggingConfig().flushOnPlacementConfirm === true,
      } );
      placementConfirmInProgress = false;

    }

    function resetPlacement( source ) {

      if ( ! currentSceneState.arPlacementConfirmed ) {

        return;

      }

      const previewTransform = placementAnchor.getAnchorTransform();
      currentSceneState.arPlacementConfirmed = false;
      currentSceneState.placementMode = DEMO4_PLACEMENT_MODES.PREVIEW;
      updateAnchorStateFromTransform( previewTransform );
      currentSceneState.focusedSiteId = null;
      placementPreviewStatus = 'lost';
      placementPreviewSourceLabel = null;
      resetPlacementStabilizer( { clearPose: true } );
      resetInstructionCardPose();
      hoveredSiteBySource.clear();
      applyPlacementStateToAnchor();
      syncVisuals();
      recordSceneChange( 'placementReset', source || 'demo4-placement-reset', {
        flushImmediately: getSceneStateLoggingConfig().flushOnPlacementReset === true,
      } );

    }

    function setMetric( metricId, source ) {

      const nextMetricId = normalizeDemo4MetricId( metricId, currentSceneState.metricId );

      if ( nextMetricId === currentSceneState.metricId ) {

        return;

      }

      currentSceneState.metricId = nextMetricId;
      syncVisuals();
      recordSceneChange( 'metric', source || 'demo4-metric', {
        flushImmediately: getSceneStateLoggingConfig().flushOnMetricChange === true,
      } );

    }

    function setTimeIndex( timeIndex, source ) {

      const nextTimeIndex = normalizeDemo4TimeIndex( timeIndex, currentSceneState.timeIndex );

      if ( nextTimeIndex === currentSceneState.timeIndex ) {

        return;

      }

      currentSceneState.timeIndex = nextTimeIndex;
      syncVisuals();
      recordSceneChange( 'timeSlice', source || 'demo4-time-slice', {
        flushImmediately: getSceneStateLoggingConfig().flushOnTimeSliceChange === true,
      } );

    }

    function toggleLayerMode( source ) {

      currentSceneState.layerMode = currentSceneState.layerMode === DEMO4_LAYER_MODES.ALL
        ? DEMO4_LAYER_MODES.ALERTS
        : DEMO4_LAYER_MODES.ALL;
      syncVisuals();
      recordSceneChange( 'layerMode', source || 'demo4-layer-mode', {
        flushImmediately: getSceneStateLoggingConfig().flushOnLayerModeToggle === true,
      } );

    }

    function toggleLabels( source ) {

      currentSceneState.labelsVisible = ! currentSceneState.labelsVisible;
      syncVisuals();
      recordSceneChange( 'labels', source || 'demo4-labels', {
        flushImmediately: getSceneStateLoggingConfig().flushOnLabelsToggle === true,
      } );

    }

    function toggleDetail( source ) {

      currentSceneState.detailExpanded = ! currentSceneState.detailExpanded;
      syncVisuals();
      recordSceneChange( 'detail', source || 'demo4-detail', {
        flushImmediately: getSceneStateLoggingConfig().flushOnDetailToggle === true,
      } );

    }

    function setInteractionModality( modality, source ) {

      const nextModality = normalizeDemo4InteractionModality( modality, currentSceneState.interactionModality );

      if ( nextModality === currentSceneState.interactionModality ) {

        return;

      }

      currentSceneState.interactionModality = nextModality;
      dwellTargetSiteId = null;
      dwellElapsedMs = 0;
      dwellActivatedSiteId = null;
      syncVisuals();
      recordSceneChange( 'interactionModality', source || 'demo4-interaction-modality', {
        flushImmediately: getSceneStateLoggingConfig().flushOnInteractionModalityChange === true,
      } );

    }

    function toggleInteractionModality( source ) {

      setInteractionModality(
        currentSceneState.interactionModality === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL
          ? DEMO4_INTERACTION_MODALITIES.HAND_RAY
          : DEMO4_INTERACTION_MODALITIES.GAZE_DWELL,
        source,
      );

    }

    function selectSite( siteId, source, {
      activationEventType = null,
      shouldLog = true,
    } = {} ) {

      const normalizedSiteId = normalizeDemo4SiteId( siteId, null );

      if ( ! normalizedSiteId ) {

        return;

      }

      const changed = (
        currentSceneState.selectedSiteId !== normalizedSiteId ||
        currentSceneState.taskAnswer !== normalizedSiteId
      );
      currentSceneState.selectedSiteId = normalizedSiteId;
      currentSceneState.focusedSiteId = normalizedSiteId;
      currentSceneState.taskAnswer = normalizedSiteId;
      currentSceneState.detailExpanded = true;

      if ( activationEventType ) {

        const activationSequence = getActivationSequence();

        if ( activationEventType === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL ) {

          currentSceneState.gazeDwellCount += 1;

        } else if ( activationEventType === DEMO4_INTERACTION_MODALITIES.HAND_RAY ) {

          currentSceneState.handSelectCount += 1;

        }

        currentSceneState.lastActivationEvent = {
          activationEventType,
          activationSiteId: normalizedSiteId,
          sequence: activationSequence,
        };

      }

      syncVisuals();

      if ( shouldLog && ( changed || activationEventType ) ) {

        recordSceneChange( activationEventType ? 'activation' : 'siteSelection', source || 'demo4-site-selection', {
          flushImmediately: activationEventType
            ? getSceneStateLoggingConfig().flushOnActivation === true
            : getSceneStateLoggingConfig().flushOnSiteSelection === true,
        } );

      }

    }

    function activateSite( siteId, activationEventType, source ) {

      selectSite( siteId, source, { activationEventType } );

    }

    function submitTask( source ) {

      if ( ! currentSceneState.taskAnswer ) {

        return;

      }

      currentSceneState.taskSubmitted = true;
      syncVisuals();
      recordSceneChange( 'taskSubmit', source || 'demo4-task-submit', {
        flushImmediately: getSceneStateLoggingConfig().flushOnTaskSubmit === true,
      } );

    }

    function setFocusedSiteFromHover( siteId, source, isHovered ) {

      if ( isHovered ) {

        hoveredSiteBySource.set( source, siteId );
        currentSceneState.focusedSiteId = siteId;

      } else {

        hoveredSiteBySource.delete( source );
        const fallbackHoveredSiteId = [ ...hoveredSiteBySource.values() ].at( - 1 ) || null;
        currentSceneState.focusedSiteId = fallbackHoveredSiteId || currentSceneState.selectedSiteId;

      }

      syncVisuals();

    }

    function createFootprintVisuals( parent, { preview = false } = {} ) {

      const { footprint } = demo4VisualConfig;
      const baseMaterial = createBasicMaterial( {
        color: preview ? footprint.previewColor : footprint.baseColor,
        opacity: preview ? footprint.previewOpacity : footprint.baseOpacity,
      } );
      createHorizontalPlane( disposables, parent, footprint.width, footprint.depth, baseMaterial, {
        name: preview ? 'demo4-placement-preview-footprint' : 'demo4-anchored-footprint',
        y: 0,
        renderOrder: footprint.renderOrder,
      } );
      const border = createRectangleBorder(
        disposables,
        parent,
        footprint.width,
        footprint.depth,
        preview ? footprint.previewColor : footprint.borderColor,
        preview ? 0.9 : footprint.borderOpacity,
        0.006,
        preview ? 'demo4-placement-preview-border' : 'demo4-anchored-border',
      );
      border.rotation.x = - HALF_PI;

    }

    function createSupportPedestalVisual() {

      const { footprint, supportPedestal } = demo4VisualConfig;
      supportPedestalMesh = createTrackedMesh(
        disposables,
        placementAnchor.anchorRoot,
        new THREE.BoxGeometry( 1, 1, 1 ),
        createBasicMaterial( {
          color: supportPedestal.color,
          opacity: supportPedestal.opacity,
          depthWrite: false,
        } ),
        {
          name: 'demo4-analysis-support-pedestal',
          renderOrder: supportPedestal.renderOrder,
        },
      );
      supportPedestalMesh.visible = false;
      supportPedestalLabelController = createTrackedTextSprite(
        disposables,
        placementAnchor.anchorRoot,
        {
          ...supportPedestal.label,
          text: supportPedestal.label.text,
        },
        [ 0, 0, 0 ],
        {
          name: 'demo4-analysis-support-pedestal-label',
          renderOrder: supportPedestal.label.renderOrder,
        },
      );
      supportPedestalLabelController.sprite.visible = false;
      supportPedestalLabelController.sprite.material.depthTest = false;
      supportPedestalLabelController.sprite.material.needsUpdate = true;

    }

    function createPlacementInstructionCard() {

      const card = demo4VisualConfig.placementInstructionCard;
      placementInstructionCardRoot = new THREE.Group();
      placementInstructionCardRoot.name = 'demo4-placement-instruction-card-root';
      placementInstructionCardRoot.visible = false;
      root.add( placementInstructionCardRoot );

      createTrackedMesh(
        disposables,
        placementInstructionCardRoot,
        new THREE.PlaneGeometry( card.width, card.height ),
        createBasicMaterial( {
          color: card.backgroundColor,
          opacity: card.backgroundOpacity,
          depthWrite: false,
          depthTest: false,
        } ),
        {
          name: 'demo4-placement-instruction-card-background',
          renderOrder: card.renderOrder,
        },
      );

      const border = createRectangleBorder(
        disposables,
        placementInstructionCardRoot,
        card.width,
        card.height,
        card.borderColor,
        card.borderOpacity,
        0.008,
        'demo4-placement-instruction-card-border',
      );
      border.renderOrder = card.renderOrder + 1;
      border.material.depthTest = false;
      border.material.needsUpdate = true;

      placementInstructionBodyText = createTrackedTextPlane(
        disposables,
        placementInstructionCardRoot,
        {
          ...card.bodyText,
          text: getPlacementInstructionCardBodyText(),
        },
        [ 0, 0.045, 0.014 ],
        {
          name: 'demo4-placement-instruction-card-body',
          renderOrder: card.renderOrder + 2,
          depthTest: false,
        },
      );
      placementInstructionStatusText = createTrackedTextPlane(
        disposables,
        placementInstructionCardRoot,
        {
          ...card.statusText,
          text: getPlacementStatusText(),
        },
        [ 0, - 0.08, 0.016 ],
        {
          name: 'demo4-placement-instruction-card-status',
          renderOrder: card.renderOrder + 2,
          depthTest: false,
        },
      );

    }

    function createPlacementVisuals() {

      createFootprintVisuals( placementAnchor.previewRoot, { preview: true } );
      placementPromptText = createTrackedTextSprite(
        disposables,
        placementAnchor.previewRoot,
        {
          ...demo4VisualConfig.text.label,
          text: getPlacementPromptText(),
          worldHeight: 0.105,
          fixedWidth: 430,
          maxTextWidth: 390,
        },
        [ 0, 0.22, 0 ],
        { name: 'demo4-placement-prompt', renderOrder: 20 },
      );
      createPlacementInstructionCard();

    }

    function createMarker( site ) {

      const markerStyle = demo4VisualConfig.markers;
      const group = new THREE.Group();
      group.name = `demo4-marker-${site.id}`;
      group.position.copy( vector3FromArray( site.localPosition ) );
      anchoredContentRoot.add( group );

      const material = createMaterial( {
        color: markerStyle.colors[ currentSceneState.metricId ] || markerStyle.colors.co2,
        emissive: markerStyle.emissive[ currentSceneState.metricId ] || markerStyle.emissive.co2,
        opacity: markerStyle.visibleOpacity,
      } );
      const cylinder = createTrackedMesh(
        disposables,
        group,
        new THREE.CylinderGeometry( 1, 1, 1, 28 ),
        material,
        { name: `${site.id}-metric-column` },
      );
      cylinder.castShadow = true;
      cylinder.receiveShadow = true;

      const hitMesh = createTrackedMesh(
        disposables,
        group,
        new THREE.CylinderGeometry( 1, 1, 1, 18 ),
        createBasicMaterial( { color: 0xffffff, opacity: 0.001 } ),
        { name: `${site.id}-hit-target` },
      );
      context.registerRaycastTarget?.( hitMesh, {
        onHoverChange( payload ) {

          if ( isBlockedVRMode() || ! currentSceneState.arPlacementConfirmed ) {

            return;

          }

          setFocusedSiteFromHover( site.id, payload.source || 'unknown', payload.isHovered === true );

        },
        onSelectStart( payload ) {

          if (
            isBlockedVRMode() ||
            ! currentSceneState.arPlacementConfirmed ||
            ! currentSceneState.visibleSiteIds.includes( site.id )
          ) {

            return;

          }

          activateSite(
            site.id,
            DEMO4_INTERACTION_MODALITIES.HAND_RAY,
            payload.source || 'demo4-site-select',
          );

        },
      } );
      disposables.push( {
        dispose() {

          context.unregisterRaycastTarget?.( hitMesh );

        },
      } );

      const selectedRing = createTrackedMesh(
        disposables,
        group,
        new THREE.TorusGeometry( 0.11, 0.008, 10, 44 ),
        createBasicMaterial( {
          color: markerStyle.selectedRingColor,
          opacity: 0.95,
        } ),
        { name: `${site.id}-selected-ring`, rotation: [ HALF_PI, 0, 0 ], renderOrder: 12 },
      );

      const alertRing = createTrackedMesh(
        disposables,
        group,
        new THREE.TorusGeometry( 0.085, 0.006, 10, 36 ),
        createBasicMaterial( {
          color: demo4VisualConfig.footprint.alertColor,
          opacity: 0.72,
        } ),
        { name: `${site.id}-alert-ring`, rotation: [ HALF_PI, 0, 0 ], renderOrder: 11 },
      );

      const labelController = createTrackedTextSprite(
        disposables,
        group,
        { ...demo4VisualConfig.text.label, text: site.shortLabel },
        [ 0, 0.28, 0 ],
        { name: `${site.id}-label`, renderOrder: 18 },
      );

      markerRecords.set( site.id, {
        site,
        group,
        cylinder,
        material,
        hitMesh,
        selectedRing,
        alertRing,
        labelController,
      } );

    }

    function updateButtonVisualState( record ) {

      const panelStyle = demo4VisualConfig.panel;
      const enabled = record.isEnabled();
      const active = record.isActive();
      const nextColor = ! enabled
        ? panelStyle.buttonDisabledColor
        : ( active ? panelStyle.buttonActiveColor : ( record.hovered ? panelStyle.buttonHoverColor : panelStyle.buttonColor ) );
      record.material.color.setHex( nextColor );
      record.material.opacity = enabled ? 0.96 : 0.52;
      record.material.needsUpdate = true;

      if ( record.key === 'modality' ) {

        record.textController.setText(
          currentSceneState.interactionModality === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL
            ? 'Mode: Gaze'
            : 'Mode: Hand',
        );

      } else if ( record.key === 'layer' ) {

        record.textController.setText(
          currentSceneState.layerMode === DEMO4_LAYER_MODES.ALERTS
            ? 'Layer: Alerts'
            : 'Layer: All',
        );

      } else if ( record.key === 'detail' ) {

        record.textController.setText(
          currentSceneState.detailExpanded
            ? 'Detail: Full'
            : 'Detail: Brief',
        );

      }

    }

    function updateControlPanelTitleBarVisual() {

      if ( ! controlPanelTitleBarMaterial ) {

        return;

      }

      const panelStyle = demo4VisualConfig.panel;
      const nextColor = activeControlPanelHeightDrag
        ? panelStyle.titleBarDragColor
        : ( controlPanelTitleBarHovered ? panelStyle.titleBarHoverColor : panelStyle.titleBarColor );
      controlPanelTitleBarMaterial.color.setHex( nextColor );
      controlPanelTitleBarMaterial.opacity = panelStyle.titleBarOpacity;
      controlPanelTitleBarMaterial.needsUpdate = true;

    }

    function getControlPanelHeightDragIntersection( payload, target = tempControlPanelDragPoint ) {

      if ( ! activeControlPanelHeightDrag || ! payload?.rayOrigin || ! payload?.rayDirection ) {

        return null;

      }

      controlPanelHeightDragRay.origin.copy( payload.rayOrigin );
      controlPanelHeightDragRay.direction.copy( payload.rayDirection ).normalize();
      return controlPanelHeightDragRay.intersectPlane( activeControlPanelHeightDrag.dragPlane, target );

    }

    function beginControlPanelHeightDrag( payload = {} ) {

      const panelStyle = demo4VisualConfig.panel;

      if (
        ! controlPanelRoot ||
        panelStyle.heightDrag?.enabled !== true ||
        context.getInteractionPolicy?.()?.canInteract === false
      ) {

        return false;

      }

      context.camera.getWorldDirection( tempControlPanelPlaneNormal ).normalize();
      tempControlPanelPlaneNormal.y = 0;

      if ( tempControlPanelPlaneNormal.lengthSq() < 0.0001 ) {

        tempControlPanelPlaneNormal.set( 0, 0, 1 );

      } else {

        tempControlPanelPlaneNormal.normalize();

      }

      controlPanelTitleBarMesh?.getWorldPosition( tempControlPanelWorldPosition );
      controlPanelHeightDragPlane.setFromNormalAndCoplanarPoint(
        tempControlPanelPlaneNormal,
        payload.point || tempControlPanelWorldPosition,
      );

      activeControlPanelHeightDrag = {
        dragPlane: controlPanelHeightDragPlane.clone(),
        startPointY: 0,
        startPanelY: controlPanelRoot.position.y,
        startSemanticY: currentSceneState.controlPanelY,
        fixedX: getControlPanelFixedX(),
        fixedZ: getControlPanelFixedZ(),
        didMove: false,
      };

      const startPoint = payload.point?.clone?.() || getControlPanelHeightDragIntersection( payload )?.clone?.() || tempControlPanelWorldPosition.clone();
      activeControlPanelHeightDrag.startPointY = startPoint.y;
      activeControlPanelHeightDrag.startPanelY = controlPanelRoot.position.y;
      updateControlPanelTitleBarVisual();
      return true;

    }

    function updateControlPanelHeightDrag( payload = {} ) {

      if ( ! activeControlPanelHeightDrag || ! controlPanelRoot ) {

        return false;

      }

      const nextPoint = getControlPanelHeightDragIntersection( payload );

      if ( ! nextPoint ) {

        return false;

      }

      const nextY = normalizeDemo4ControlPanelY(
        activeControlPanelHeightDrag.startPanelY + nextPoint.y - activeControlPanelHeightDrag.startPointY,
        activeControlPanelHeightDrag.startPanelY,
      );
      controlPanelRoot.position.set(
        activeControlPanelHeightDrag.fixedX,
        nextY,
        activeControlPanelHeightDrag.fixedZ,
      );

      if ( Math.abs( nextY - activeControlPanelHeightDrag.startPanelY ) > 0.0001 ) {

        activeControlPanelHeightDrag.didMove = true;

      }

      return true;

    }

    function endControlPanelHeightDrag( payload = {} ) {

      if ( ! activeControlPanelHeightDrag ) {

        return false;

      }

      const dragState = activeControlPanelHeightDrag;
      const nextY = normalizeDemo4ControlPanelY(
        controlPanelRoot?.position.y,
        dragState.startSemanticY,
      );
      const changed = Math.abs( nextY - dragState.startSemanticY ) >= demo4VisualConfig.panel.heightDrag.dragEpsilon;
      currentSceneState.controlPanelY = changed
        ? nextY
        : normalizeDemo4ControlPanelY( dragState.startSemanticY );
      activeControlPanelHeightDrag = null;
      syncControlPanelPosition();
      updateControlPanelTitleBarVisual();

      if ( changed ) {

        recordSceneChange( 'controlPanelHeight', payload.source || 'demo4-control-panel-height-drag-end', {
          flushImmediately: getSceneStateLoggingConfig().flushOnControlPanelHeightDragEnd === true,
        } );

      }

      return true;

    }

    function createControlButton( key, label, position, onPress, {
      width = demo4VisualConfig.panel.buttonWidth,
      height = demo4VisualConfig.panel.buttonHeight,
      isActive = () => false,
      isEnabled = () => true,
    } = {} ) {

      const panelStyle = demo4VisualConfig.panel;
      const material = createBasicMaterial( {
        color: panelStyle.buttonColor,
        opacity: 0.94,
      } );
      const mesh = createTrackedMesh(
        disposables,
        controlPanelRoot,
        new THREE.PlaneGeometry( width, height ),
        material,
        { name: `demo4-button-${key}`, position: [ position[ 0 ], position[ 1 ], 0.018 ], renderOrder: 18 },
      );
      const textController = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        { ...demo4VisualConfig.text.button, text: label, planeHeight: height * 0.72 },
        [ position[ 0 ], position[ 1 ], 0.026 ],
        { name: `demo4-button-${key}-label`, renderOrder: 19 },
      );
      const record = {
        key,
        label,
        material,
        mesh,
        textController,
        isActive,
        isEnabled,
        hovered: false,
      };

      context.registerRaycastTarget?.( mesh, {
        onHoverChange( payload ) {

          record.hovered = payload.isHovered === true;
          updateButtonVisualState( record );

        },
        onSelectStart( payload ) {

          if ( record.isEnabled() ) {

            onPress( payload.source || `demo4-button-${key}` );

          }

        },
      } );
      disposables.push( {
        dispose() {

          context.unregisterRaycastTarget?.( mesh );

        },
      } );
      buttonRecords.set( key, record );
      return record;

    }

    function createControlPanel() {

      const { panel } = demo4VisualConfig;
      const metricButtonOrder = [ 'co2', 'noise', 'occupancy' ].filter( ( metricId ) => DEMO4_METRIC_IDS.includes( metricId ) );
      controlPanelRoot = new THREE.Group();
      controlPanelRoot.name = 'demo4-control-panel-root';
      controlPanelRoot.position.set(
        getControlPanelFixedX(),
        normalizeDemo4ControlPanelY( currentSceneState.controlPanelY ),
        getControlPanelFixedZ(),
      );
      anchoredContentRoot.add( controlPanelRoot );

      createTrackedMesh(
        disposables,
        controlPanelRoot,
        new THREE.PlaneGeometry( panel.width, panel.height ),
        createBasicMaterial( { color: panel.backgroundColor, opacity: panel.backgroundOpacity } ),
        { name: 'demo4-control-panel-background', renderOrder: 14 },
      );
      createRectangleBorder(
        disposables,
        controlPanelRoot,
        panel.width,
        panel.height,
        panel.borderColor,
        0.62,
        0.004,
        'demo4-control-panel-border',
      );

      controlPanelTitleBarMaterial = createBasicMaterial( {
        color: panel.titleBarColor,
        opacity: panel.titleBarOpacity,
      } );
      controlPanelTitleBarMesh = createTrackedMesh(
        disposables,
        controlPanelRoot,
        new THREE.PlaneGeometry( panel.width, panel.titleBarHeight ),
        controlPanelTitleBarMaterial,
        {
          name: 'demo4-control-panel-titlebar',
          position: [ 0, panel.titleBarY, 0.018 ],
          renderOrder: 16,
        },
      );
      context.registerRaycastTarget?.( controlPanelTitleBarMesh, {
        onHoverChange( payload ) {

          controlPanelTitleBarHovered = payload.isHovered === true;
          updateControlPanelTitleBarVisual();

        },
        onSelectStart( payload ) {

          beginControlPanelHeightDrag( payload );

        },
        onSelectMove( payload ) {

          updateControlPanelHeightDrag( payload );

        },
        onSelectEnd( payload ) {

          endControlPanelHeightDrag( payload );

        },
      } );
      disposables.push( {
        dispose() {

          context.unregisterRaycastTarget?.( controlPanelTitleBarMesh );

        },
      } );

      createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        { ...demo4VisualConfig.text.panelTitle, text: 'Control Panel' },
        [ panel.textPositions.title[ 0 ], panel.textPositions.title[ 1 ], 0.022 ],
        { name: 'demo4-panel-title', renderOrder: 17 },
      );
      panelTaskText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo4VisualConfig.text.panelBody,
          text: getPanelTaskText(),
        },
        [ panel.textPositions.task[ 0 ], panel.textPositions.task[ 1 ], 0.022 ],
        { name: 'demo4-panel-task', renderOrder: 17 },
      );
      panelPlacementText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo4VisualConfig.text.panelHelp,
          text: getPanelPlacementText(),
        },
        [ panel.textPositions.placement[ 0 ], panel.textPositions.placement[ 1 ], 0.022 ],
        { name: 'demo4-panel-placement-help', renderOrder: 17 },
      );
      panelStateText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo4VisualConfig.text.panelBody,
          text: '',
        },
        [ panel.textPositions.state[ 0 ], panel.textPositions.state[ 1 ], 0.022 ],
        { name: 'demo4-panel-state', renderOrder: 17 },
      );
      panelDetailText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo4VisualConfig.text.panelDetail,
          text: getPanelDetailText(),
        },
        [ panel.textPositions.detail[ 0 ], panel.textPositions.detail[ 1 ], 0.022 ],
        { name: 'demo4-panel-selected-site', renderOrder: 17 },
      );
      panelInteractionHelpText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo4VisualConfig.text.panelHelp,
          text: getPanelInteractionHelpText(),
        },
        [ panel.textPositions.help[ 0 ], panel.textPositions.help[ 1 ], 0.022 ],
        { name: 'demo4-panel-interaction-help', renderOrder: 17 },
      );

      metricButtonOrder.forEach( ( metricId, index ) => {

        const metric = getDemo4Metric( metricId );
        createControlButton(
          `metric-${metricId}`,
          metric?.label || metricId,
          [ panel.buttonColumns[ index ], panel.buttonRows.metrics ],
          ( source ) => setMetric( metricId, source ),
          {
            isActive: () => currentSceneState.metricId === metricId,
          },
        );

      } );

      dataset.timeSlices.forEach( ( timeSlice, index ) => {

        createControlButton(
          `time-${timeSlice.id}`,
          timeSlice.label,
          [ panel.buttonColumns[ index ], panel.buttonRows.times ],
          ( source ) => setTimeIndex( timeSlice.index, source ),
          {
            isActive: () => currentSceneState.timeIndex === timeSlice.index,
          },
        );

      } );

      createControlButton( 'modality', 'Mode: Gaze', [ panel.buttonColumns[ 0 ], panel.buttonRows.controls ], ( source ) => toggleInteractionModality( source ), {
        isActive: () => currentSceneState.interactionModality === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL,
      } );
      createControlButton( 'layer', 'Layer: All', [ panel.buttonColumns[ 1 ], panel.buttonRows.controls ], ( source ) => toggleLayerMode( source ), {
        isActive: () => currentSceneState.layerMode === DEMO4_LAYER_MODES.ALERTS,
      } );
      createControlButton( 'labels', 'Labels', [ panel.buttonColumns[ 2 ], panel.buttonRows.controls ], ( source ) => toggleLabels( source ), {
        isActive: () => currentSceneState.labelsVisible,
      } );
      createControlButton( 'detail', 'Detail: Brief', [ panel.buttonColumns[ 0 ], panel.buttonRows.actions ], ( source ) => toggleDetail( source ), {
        isActive: () => currentSceneState.detailExpanded,
      } );
      createControlButton( 'reset', 'Reset', [ panel.buttonColumns[ 1 ], panel.buttonRows.actions ], ( source ) => resetPlacement( source ) );
      createControlButton( 'submit', 'Submit', [ panel.buttonColumns[ 2 ], panel.buttonRows.actions ], ( source ) => submitTask( source ), {
        isActive: () => currentSceneState.taskSubmitted,
        isEnabled: () => Boolean( currentSceneState.taskAnswer ),
      } );

    }

    function createDetailCard() {

      const { detail } = demo4VisualConfig;
      detailRoot = new THREE.Group();
      detailRoot.name = 'demo4-detail-card-root';
      detailRoot.position.copy( vector3FromArray( detail.position ) );
      detailRoot.visible = false;
      anchoredContentRoot.add( detailRoot );
      createTrackedMesh(
        disposables,
        detailRoot,
        new THREE.PlaneGeometry( detail.width, detail.height ),
        createBasicMaterial( { color: detail.backgroundColor, opacity: detail.backgroundOpacity } ),
        { name: 'demo4-detail-card-background', renderOrder: 15 },
      );
      createRectangleBorder(
        disposables,
        detailRoot,
        detail.width,
        detail.height,
        detail.borderColor,
        0.7,
        0.004,
        'demo4-detail-card-border',
      );
      detailText = createTrackedTextPlane(
        disposables,
        detailRoot,
        {
          ...demo4VisualConfig.text.panelBody,
          fixedWidth: 380,
          maxTextWidth: 338,
          text: '',
        },
        [ 0, 0.02, 0.024 ],
        { name: 'demo4-detail-card-text', renderOrder: 18 },
      );

    }

    function createDwellProgressVisual() {

      const interaction = demo4VisualConfig.interaction;
      dwellProgressRing = createTrackedMesh(
        disposables,
        anchoredContentRoot,
        new THREE.TorusGeometry(
          interaction.dwellProgressBaseRadius,
          interaction.dwellProgressTubeRadius,
          10,
          48,
        ),
        createMaterial( {
          color: interaction.dwellProgressColor,
          emissive: interaction.dwellProgressEmissive,
          opacity: interaction.dwellProgressOpacity,
        } ),
        {
          name: 'demo4-gaze-dwell-progress',
          rotation: [ HALF_PI, 0, 0 ],
          renderOrder: 22,
        },
      );
      dwellProgressRing.visible = false;

    }

    function createAnchoredContentRoot() {

      anchoredContentRoot = new THREE.Group();
      anchoredContentRoot.name = 'demo4-anchored-content-root';
      anchoredContentRoot.rotation.y = demo4VisualConfig.overlay.contentYawOffsetRad;
      placementAnchor.anchorRoot.add( anchoredContentRoot );

    }

    function createAnchoredOverlayVisuals() {

      createAnchoredContentRoot();
      createFootprintVisuals( anchoredContentRoot );
      createSupportPedestalVisual();
      dataset.sites.forEach( createMarker );
      createControlPanel();
      createDetailCard();
      createDwellProgressVisual();

    }

    function syncMarkerVisuals() {

      const markerStyle = demo4VisualConfig.markers;
      const range = getReadingRange( currentSceneState.metricId, currentSceneState.timeIndex );
      const metric = getCurrentMetric();

      markerRecords.forEach( ( record, siteId ) => {

        const value = getDemo4Reading( siteId, currentSceneState.metricId, currentSceneState.timeIndex );
        const ratio = getNormalizedReadingRatio( value, range );
        const height = THREE.MathUtils.lerp( markerStyle.minHeight, markerStyle.maxHeight, ratio );
        const radius = markerStyle.baseRadius + ratio * markerStyle.radiusScale;
        const visibleInLayer = currentSceneState.visibleSiteIds.includes( siteId );
        const selected = currentSceneState.selectedSiteId === siteId || currentSceneState.taskAnswer === siteId;
        const hovered = isSiteHovered( siteId ) || currentSceneState.focusedSiteId === siteId;
        const alert = value >= ( metric?.alertThreshold ?? Number.POSITIVE_INFINITY );
        const markerColor = selected
          ? markerStyle.selectedColor
          : ( hovered ? markerStyle.hoverColor : ( markerStyle.colors[ currentSceneState.metricId ] || markerStyle.colors.co2 ) );
        const markerEmissive = selected || hovered
          ? 0x293c48
          : ( markerStyle.emissive[ currentSceneState.metricId ] || markerStyle.emissive.co2 );
        const markerScale = selected
          ? markerStyle.selectedScale
          : ( hovered ? markerStyle.hoverScale : 1 );

        record.group.visible = currentSceneState.arPlacementConfirmed && visibleInLayer;
        record.cylinder.scale.set( radius * markerScale, height, radius * markerScale );
        record.cylinder.position.y = height * 0.5;
        record.material.color.setHex( markerColor );
        record.material.emissive.setHex( markerEmissive );
        record.material.opacity = selected ? 1 : markerStyle.visibleOpacity;
        record.material.needsUpdate = true;
        record.hitMesh.scale.set( markerStyle.hitRadius, markerStyle.hitHeight, markerStyle.hitRadius );
        record.hitMesh.position.y = markerStyle.hitHeight * 0.5;
        record.hitMesh.visible = currentSceneState.arPlacementConfirmed && visibleInLayer;
        record.selectedRing.visible = selected;
        record.selectedRing.position.y = 0.02;
        record.alertRing.visible = alert;
        record.alertRing.position.y = 0.038;
        record.labelController.sprite.visible = currentSceneState.labelsVisible;
        record.labelController.sprite.position.y = height + 0.14;
        record.labelController.setText( `${record.site.shortLabel}\n${formatDemo4Reading( value, currentSceneState.metricId )}` );

      } );

    }

    function syncDwellProgressVisual() {

      if ( ! dwellProgressRing ) {

        return;

      }

      const targetRecord = dwellTargetSiteId ? markerRecords.get( dwellTargetSiteId ) : null;
      const dwellDurationMs = demo4VisualConfig.interaction.dwellDurationMs;
      const progress = THREE.MathUtils.clamp( dwellElapsedMs / Math.max( 1, dwellDurationMs ), 0, 1 );
      const visible = (
        currentSceneState.arPlacementConfirmed &&
        currentSceneState.interactionModality === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL &&
        Boolean( targetRecord ) &&
        progress > 0 &&
        ! isBlockedVRMode()
      );

      dwellProgressRing.visible = visible;

      if ( ! visible ) {

        return;

      }

      const interaction = demo4VisualConfig.interaction;
      dwellProgressRing.position.copy( targetRecord.group.position );
      dwellProgressRing.position.y = 0.028;
      const radiusScale = THREE.MathUtils.lerp(
        1,
        interaction.dwellProgressRadius / interaction.dwellProgressBaseRadius,
        progress,
      );
      dwellProgressRing.scale.setScalar( radiusScale );
      dwellProgressRing.material.opacity = THREE.MathUtils.lerp( 0.35, interaction.dwellProgressOpacity, progress );
      dwellProgressRing.material.needsUpdate = true;

    }

    function syncSupportPedestalVisual() {

      if ( ! supportPedestalMesh ) {

        return;

      }

      const policy = context.getInteractionPolicy?.() || null;
      const surfaceHeight = Math.max( 0, currentSceneState.arAnchorSurfaceHeight || 0 );
      const isReplayInspection = policy?.isAnalysisSession === true || policy?.hasReceivedReplayState === true;
      const visible = (
        currentSceneState.arPlacementConfirmed &&
        surfaceHeight > demo4VisualConfig.supportPedestal.minVisibleHeight &&
        isReplayInspection
      );

      supportPedestalVisible = visible;
      supportPedestalMesh.visible = visible;
      if ( supportPedestalLabelController?.sprite ) {

        supportPedestalLabelController.sprite.visible = visible;

      }

      if ( ! visible ) {

        return;

      }

      supportPedestalMesh.scale.set(
        demo4VisualConfig.footprint.width,
        surfaceHeight,
        demo4VisualConfig.footprint.depth,
      );
      supportPedestalMesh.position.set(
        0,
        - demo4VisualConfig.placement.overlayLift - surfaceHeight * 0.5,
        0,
      );
      if ( supportPedestalLabelController?.sprite ) {

        const { footprint, supportPedestal } = demo4VisualConfig;
        supportPedestalLabelController.sprite.position.set(
          footprint.width * 0.5 + supportPedestal.label.horizontalOffset,
          - demo4VisualConfig.placement.overlayLift - surfaceHeight * 0.5,
          footprint.depth * 0.5 + supportPedestal.label.zOffset,
        );

      }

    }

    function syncPlacementInstructionCard() {

      if ( ! placementInstructionCardRoot ) {

        return;

      }

      const presentationMode = context.getPresentationMode?.();
      const policy = context.getInteractionPolicy?.() || null;
      const visible = (
        ! currentSceneState.arPlacementConfirmed &&
        presentationMode === 'immersive-ar' &&
        ! isBlockedVRMode() &&
        policy?.isAnalysisSession !== true &&
        policy?.hasReceivedReplayState !== true
      );

      placementInstructionCardRoot.visible = visible;

      if ( ! visible ) {

        return;

      }

      placementInstructionBodyText?.setText( getPlacementInstructionCardBodyText() );
      placementInstructionStatusText?.setText( getPlacementStatusText() );

      const card = demo4VisualConfig.placementInstructionCard;
      const livePlacementStatus = placementAnchor?.getPlacementStatus?.() || {};
      const hasLivePreviewPose = (
        placementAnchor?.previewRoot?.visible === true &&
        placementStabilizer.hasSmoothedPose === true &&
        livePlacementStatus.surfaceDetected === true &&
        placementPreviewStatus !== 'lost'
      );
      const now = performance.now();

      if ( hasLivePreviewPose ) {

        placementAnchor.previewRoot.getWorldPosition( tempInstructionCardTargetPosition );
        tempInstructionCardTargetPosition.y += card.verticalOffset;

        if ( hasInstructionCardPose ) {

          lastInstructionCardPosition.lerp( tempInstructionCardTargetPosition, card.positionSmoothingAlpha );

        } else {

          lastInstructionCardPosition.copy( tempInstructionCardTargetPosition );
          hasInstructionCardPose = true;

        }

        lastInstructionCardPoseAt = now;
        tempInstructionCardPosition.copy( lastInstructionCardPosition );

      } else if ( hasInstructionCardPose ) {

        if (
          now - lastInstructionCardPoseAt > card.staleHitHoldMs &&
          placementAnchor?.previewRoot?.visible === true
        ) {

          placementAnchor.previewRoot.getWorldPosition( tempInstructionCardTargetPosition );
          tempInstructionCardTargetPosition.y += card.verticalOffset;
          lastInstructionCardPosition.lerp( tempInstructionCardTargetPosition, card.positionSmoothingAlpha * 0.25 );

        }

        tempInstructionCardPosition.copy( lastInstructionCardPosition );

      } else {

        context.camera.getWorldPosition( tempCameraWorldPosition );
        context.camera.getWorldDirection( tempCameraWorldDirection );
        tempInstructionCardPosition
          .copy( tempCameraWorldPosition )
          .addScaledVector( tempCameraWorldDirection.normalize(), card.cameraFallbackDistance );
        tempInstructionCardPosition.y += card.cameraFallbackYOffset;
        lastInstructionCardPoseAt = now - card.staleHitHoldMs;

      }

      placementInstructionCardRoot.position.copy( tempInstructionCardPosition );
      placementInstructionCardRoot.quaternion.copy( context.camera.quaternion );

    }

    function syncControlPanel() {

      if ( ! controlPanelRoot ) {

        return;

      }

      controlPanelRoot.visible = currentSceneState.arPlacementConfirmed;
      if ( ! activeControlPanelHeightDrag ) {

        syncControlPanelPosition();

      }
      panelTaskText?.setText( getPanelTaskText() );
      panelPlacementText?.setText( getPanelPlacementText() );
      panelStateText?.setText( getPanelStateText() );
      panelDetailText?.setText( getPanelDetailText() );
      panelInteractionHelpText?.setText( getPanelInteractionHelpText() );
      updateControlPanelTitleBarVisual();
      buttonRecords.forEach( updateButtonVisualState );

    }

    function syncDetailCard() {

      if ( ! detailRoot || ! detailText ) {

        return;

      }

      detailRoot.visible = false;
      detailText.setText( '' );

    }

    function syncDesktopPanel() {

      if ( ! desktopRefs.status ) {

        return;

      }

      const activeSite = getActiveSite();
      const expectedSite = getDemo4Site( task.expectedAnswerId );
      desktopRefs.status.textContent = getPanelStatusText();
      desktopRefs.detail.textContent = activeSite
        ? getSiteSummaryText( activeSite.id, { expanded: true } )
        : `Task target: ${expectedSite?.label || task.expectedAnswerId}`;

      desktopRefs.metricButtons?.forEach( ( button, metricId ) => {

        button.setAttribute( 'style', currentSceneState.metricId === metricId
          ? demo4VisualConfig.desktopPanel.activeButton
          : demo4VisualConfig.desktopPanel.button );

      } );
      desktopRefs.timeButtons?.forEach( ( button, timeIndex ) => {

        button.setAttribute( 'style', currentSceneState.timeIndex === timeIndex
          ? demo4VisualConfig.desktopPanel.activeButton
          : demo4VisualConfig.desktopPanel.button );

      } );
      desktopRefs.layerButton.textContent = currentSceneState.layerMode === DEMO4_LAYER_MODES.ALERTS
        ? 'Layer: Alerts'
        : 'Layer: All';
      desktopRefs.labelsButton.textContent = currentSceneState.labelsVisible ? 'Labels: On' : 'Labels: Off';
      desktopRefs.detailButton.textContent = currentSceneState.detailExpanded ? 'Detail: Expanded' : 'Detail: Compact';
      desktopRefs.modalityButton.textContent = currentSceneState.interactionModality === DEMO4_INTERACTION_MODALITIES.GAZE_DWELL
        ? 'Mode: Gaze'
        : 'Mode: Hand';
      desktopRefs.confirmButton.disabled = currentSceneState.arPlacementConfirmed;
      desktopRefs.submitButton.disabled = ! currentSceneState.taskAnswer;

    }

    function syncVisuals() {

      syncDerivedVisibleSiteIds();
      applyPlacementStateToAnchor();
      if ( anchoredContentRoot ) {

        anchoredContentRoot.rotation.y = demo4VisualConfig.overlay.contentYawOffsetRad;

      }
      placementPromptText?.setText( getPlacementPromptText() );
      if ( placementPromptText?.sprite ) {

        placementPromptText.sprite.visible = ! (
          context.getPresentationMode?.() === 'immersive-ar' &&
          ! currentSceneState.arPlacementConfirmed
        );

      }
      syncMarkerVisuals();
      syncDwellProgressVisual();
      syncSupportPedestalVisual();
      syncPlacementInstructionCard();
      syncControlPanel();
      syncDetailCard();
      syncDesktopPanel();

    }

    function resetInstructionCardPose() {

      hasInstructionCardPose = false;
      lastInstructionCardPoseAt = 0;
      lastInstructionCardPosition.set( 0, 0, 0 );

    }

    function resetPlacementStabilizer( { clearPose = false } = {} ) {

      placementStabilizer.stableFrameCount = 0;
      placementStabilizer.lastAcceptedAt = 0;

      if ( clearPose ) {

        placementStabilizer.hasSmoothedPose = false;

      }

    }

    function getPlacementPreviewSourceLabel( payload = {} ) {

      return (
        ! payload.handedness &&
        ( payload.interactor === demo4VisualConfig.placement.fallbackControllerSource || payload.controllerIndex === 0 )
      )
        ? 'controller-0-fallback'
        : null;

    }

    function updatePlacementPrompt() {

      placementPromptText?.setText( getPlacementPromptText() );
      placementInstructionStatusText?.setText( getPlacementStatusText() );

    }

    function applyTransientFallbackPreviewStatus( payload = {} ) {

      placementPreviewStatus = payload?.source === 'desktop-pointer'
        ? 'lost'
        : 'fallback-controller';
      placementPreviewSourceLabel = getPlacementPreviewSourceLabel( payload );
      updatePlacementPrompt();

    }

    function getSurfaceTiltDeg( quaternion ) {

      tempSurfaceNormal.set( 0, 1, 0 ).applyQuaternion( quaternion ).normalize();
      return THREE.MathUtils.radToDeg( tempSurfaceNormal.angleTo( WORLD_UP ) );

    }

    function updatePlacementPreviewFromHitTest( hitTest ) {

      const placementConfig = demo4VisualConfig.placement;
      const now = performance.now();
      const elapsedSinceAccepted = placementStabilizer.lastAcceptedAt > 0
        ? now - placementStabilizer.lastAcceptedAt
        : Number.POSITIVE_INFINITY;

      tempPlacementPosition.copy( vector3FromArray( hitTest.position, placementConfig.defaultPreviewPosition ) );
      tempPlacementQuaternion.copy( quaternionFromArray( hitTest.quaternion, placementConfig.defaultPreviewQuaternion ) );

      if ( getSurfaceTiltDeg( tempPlacementQuaternion ) > placementConfig.maxSurfaceTiltDeg ) {

        placementPreviewStatus = 'lost';
        placementPreviewSourceLabel = getPlacementPreviewSourceLabel( hitTest );
        updatePlacementPrompt();
        return null;

      }

      if (
        placementStabilizer.hasSmoothedPose &&
        placementStabilizer.lastAcceptedPosition.distanceTo( tempPlacementPosition ) > placementConfig.maxFrameJumpMeters &&
        elapsedSinceAccepted <= placementConfig.staleHitHoldMs
      ) {

        placementPreviewStatus = 'stabilizing';
        placementPreviewSourceLabel = getPlacementPreviewSourceLabel( hitTest );
        updatePlacementPrompt();
        return null;

      }

      if ( placementStabilizer.hasSmoothedPose ) {

        placementStabilizer.smoothedPosition.lerp( tempPlacementPosition, placementConfig.hitTestSmoothingAlpha );
        placementStabilizer.smoothedQuaternion.slerp(
          tempPlacementQuaternion,
          placementConfig.hitTestRotationSmoothingAlpha,
        );

      } else {

        placementStabilizer.smoothedPosition.copy( tempPlacementPosition );
        placementStabilizer.smoothedQuaternion.copy( tempPlacementQuaternion );
        placementStabilizer.hasSmoothedPose = true;

      }

      placementStabilizer.lastAcceptedPosition.copy( tempPlacementPosition );
      placementStabilizer.stableFrameCount += 1;
      placementStabilizer.lastAcceptedAt = now;
      placementPreviewStatus = placementStabilizer.stableFrameCount >= placementConfig.requiredStableFrames
        ? 'ready'
        : 'stabilizing';
      placementPreviewSourceLabel = getPlacementPreviewSourceLabel( hitTest );

      const transform = placementAnchor.setPreviewFromPlacementPose( {
        position: vector3ToArray( placementStabilizer.smoothedPosition ),
        quaternion: quaternionToArray( placementStabilizer.smoothedQuaternion ),
        source: DEMO4_PLACEMENT_SOURCES.XR_HIT_TEST,
        surfaceDetected: true,
      } );

      updatePlacementPrompt();
      return transform;

    }

    function updatePlacementPreviewFromRuntime( runtime = {} ) {

      if ( currentSceneState.arPlacementConfirmed || isBlockedVRMode() ) {

        return;

      }

      const presentationMode = runtime.presentationMode || context.getPresentationMode?.();

      if (
        presentationMode === 'immersive-ar' &&
        runtime.xrHitTest?.surfaceDetected &&
        Array.isArray( runtime.xrHitTest.position ) &&
        isAcceptedPlacementSource( runtime.xrHitTest )
      ) {

        updatePlacementPreviewFromHitTest( runtime.xrHitTest );
        return;

      }

      if ( presentationMode === 'immersive-ar' ) {

        const elapsedSinceAccepted = placementStabilizer.lastAcceptedAt > 0
          ? performance.now() - placementStabilizer.lastAcceptedAt
          : Number.POSITIVE_INFINITY;
        placementPreviewStatus = elapsedSinceAccepted <= demo4VisualConfig.placement.staleHitHoldMs
          ? 'stabilizing'
          : 'lost';
        placementPreviewSourceLabel = null;

        if ( placementPreviewStatus === 'lost' ) {

          resetPlacementStabilizer( { clearPose: true } );

        }

        updatePlacementPrompt();
        return;

      }

      if ( presentationMode === 'desktop' && currentSceneState.placementSource !== DEMO4_PLACEMENT_SOURCES.DESKTOP_DEFAULT ) {

        currentSceneState.placementSource = DEMO4_PLACEMENT_SOURCES.DESKTOP_DEFAULT;
        currentSceneState.surfaceDetected = false;
        currentSceneState.placementControllerSource = null;
        resetPlacementStabilizer( { clearPose: true } );
        placementPreviewStatus = 'lost';
        placementPreviewSourceLabel = null;
        syncVisuals();

      }

    }

    function getGazeTargetSiteId() {

      if ( ! currentSceneState.arPlacementConfirmed || isBlockedVRMode() ) {

        return null;

      }

      const hitTargets = [ ...markerRecords.values() ]
        .filter( ( record ) => (
          record.hitMesh.visible &&
          currentSceneState.visibleSiteIds.includes( record.site.id )
        ) )
        .map( ( record ) => record.hitMesh );

      if ( hitTargets.length === 0 ) {

        return null;

      }

      context.camera.getWorldPosition( tempCameraWorldPosition );
      context.camera.getWorldDirection( tempCameraWorldDirection );
      gazeRaycaster.set( tempCameraWorldPosition, tempCameraWorldDirection.normalize() );
      gazeRaycaster.far = 8;
      const hit = gazeRaycaster.intersectObjects( hitTargets, false )[ 0 ] || null;

      if ( ! hit ) {

        return null;

      }

      return [ ...markerRecords.values() ].find( ( record ) => record.hitMesh === hit.object )?.site.id || null;

    }

    function resetGazeDwell( { keepFocus = false } = {} ) {

      dwellTargetSiteId = null;
      dwellElapsedMs = 0;
      dwellActivatedSiteId = null;

      if ( ! keepFocus ) {

        currentSceneState.focusedSiteId = currentSceneState.selectedSiteId;

      }

    }

    function updateGazeDwell( deltaSeconds, runtime = {} ) {

      if (
        runtime.interactionPolicy?.isAnalysisSession === true ||
        runtime.interactionPolicy?.hasReceivedReplayState === true
      ) {

        resetGazeDwell( { keepFocus: true } );
        syncDwellProgressVisual();
        return;

      }

      if (
        runtime.interactionPolicy?.canInteract === false ||
        currentSceneState.interactionModality !== DEMO4_INTERACTION_MODALITIES.GAZE_DWELL ||
        ! currentSceneState.arPlacementConfirmed ||
        isBlockedVRMode()
      ) {

        resetGazeDwell( { keepFocus: true } );
        syncDwellProgressVisual();
        return;

      }

      const nextTargetSiteId = getGazeTargetSiteId();

      if ( ! nextTargetSiteId ) {

        resetGazeDwell();
        syncVisuals();
        return;

      }

      if ( nextTargetSiteId !== dwellTargetSiteId ) {

        dwellTargetSiteId = nextTargetSiteId;
        dwellElapsedMs = 0;
        dwellActivatedSiteId = null;

      }

      dwellElapsedMs += deltaSeconds * 1000;
      currentSceneState.focusedSiteId = nextTargetSiteId;

      if (
        dwellElapsedMs >= demo4VisualConfig.interaction.dwellDurationMs &&
        dwellActivatedSiteId !== nextTargetSiteId
      ) {

        dwellActivatedSiteId = nextTargetSiteId;
        activateSite( nextTargetSiteId, DEMO4_INTERACTION_MODALITIES.GAZE_DWELL, 'gaze-dwell' );
        return;

      }

      syncVisuals();

    }

    function getReadyBackgroundPreviewTransform() {

      const livePlacementStatus = placementAnchor?.getPlacementStatus?.() || {};

      if (
        placementPreviewStatus !== 'ready' ||
        livePlacementStatus.source !== DEMO4_PLACEMENT_SOURCES.XR_HIT_TEST ||
        livePlacementStatus.surfaceDetected !== true
      ) {

        return null;

      }

      const previewTransform = placementAnchor?.getPreviewTransform?.();

      if (
        ! previewTransform ||
        ! Array.isArray( previewTransform.position ) ||
        ! Array.isArray( previewTransform.quaternion )
      ) {

        return null;

      }

      return {
        ...previewTransform,
        placementSource: DEMO4_PLACEMENT_SOURCES.XR_HIT_TEST,
        surfaceDetected: true,
      };

    }

    function handlePlacementBackgroundSelect( payload = {} ) {

      if ( currentSceneState.arPlacementConfirmed || isBlockedVRMode() ) {

        setPlacementSelectDebug( payload, {
          accepted: false,
          reason: currentSceneState.arPlacementConfirmed ? 'already-confirmed' : 'blocked-vr',
          backgroundConfirmed: false,
        } );
        return;

      }

      if ( context.getPresentationMode?.() !== 'immersive-ar' ) {

        setPlacementSelectDebug( payload, {
          accepted: false,
          reason: 'not-immersive-ar',
          backgroundConfirmed: false,
        } );
        return;

      }

      if ( ! isAcceptedPlacementSource( payload ) ) {

        setPlacementSelectDebug( payload, {
          accepted: false,
          reason: 'rejected-source',
          backgroundConfirmed: false,
        } );
        setPlacementPromptOverride( 'Placement requires the LEFT controller.' );
        syncPlacementInstructionCard();
        return;

      }

      const previewTransform = getReadyBackgroundPreviewTransform();

      if ( ! previewTransform ) {

        const livePlacementStatus = placementAnchor?.getPlacementStatus?.() || {};
        setPlacementSelectDebug( payload, {
          accepted: true,
          reason: livePlacementStatus.surfaceDetected === true ? 'surface-stabilizing' : 'surface-not-ready',
          backgroundConfirmed: false,
        } );
        setPlacementPromptOverride( 'Aim the LEFT controller at a detected surface first.' );
        updatePlacementPrompt();
        syncPlacementInstructionCard();
        return;

      }

      setPlacementSelectDebug( payload, {
        accepted: true,
        reason: 'confirmed',
        backgroundConfirmed: true,
      } );
      confirmPlacement( payload, previewTransform );

    }

    function getSceneStateForStorage() {

      syncDerivedVisibleSiteIds();
      return {
        demoId: currentSceneState.demoId,
        taskId: currentSceneState.taskId,
        arPlacementConfirmed: currentSceneState.arPlacementConfirmed,
        placementMode: currentSceneState.placementMode,
        placementCount: currentSceneState.placementCount,
        placementSource: currentSceneState.placementSource,
        placementDriver: currentSceneState.placementDriver,
        placementControllerSource: currentSceneState.placementControllerSource,
        surfaceDetected: currentSceneState.surfaceDetected,
        arAnchorPosition: [ ...currentSceneState.arAnchorPosition ],
        arAnchorQuaternion: [ ...currentSceneState.arAnchorQuaternion ],
        arAnchorSurfaceHeight: currentSceneState.arAnchorSurfaceHeight,
        arScaleFactor: currentSceneState.arScaleFactor,
        controlPanelY: currentSceneState.controlPanelY,
        metricId: currentSceneState.metricId,
        timeIndex: currentSceneState.timeIndex,
        layerMode: currentSceneState.layerMode,
        labelsVisible: currentSceneState.labelsVisible,
        selectedSiteId: currentSceneState.selectedSiteId,
        focusedSiteId: currentSceneState.focusedSiteId,
        detailExpanded: currentSceneState.detailExpanded,
        interactionModality: currentSceneState.interactionModality,
        gazeDwellCount: currentSceneState.gazeDwellCount,
        handSelectCount: currentSceneState.handSelectCount,
        lastActivationEvent: currentSceneState.lastActivationEvent
          ? { ...currentSceneState.lastActivationEvent }
          : null,
        visibleSiteIds: [ ...currentSceneState.visibleSiteIds ],
        taskAnswer: currentSceneState.taskAnswer,
        taskSubmitted: currentSceneState.taskSubmitted,
      };

    }

    function getAnswerSummary() {

      const state = getSceneStateForStorage();
      const anchorTransform = {
        position: state.arAnchorPosition,
        quaternion: state.arAnchorQuaternion,
        scale: state.arScaleFactor,
        surfaceHeight: state.arAnchorSurfaceHeight,
        placementDriver: state.placementDriver,
        placementControllerSource: state.placementControllerSource,
      };

      return {
        xrDemoId: state.demoId,
        xrTaskId: state.taskId,
        xrArPlacementConfirmed: state.arPlacementConfirmed,
        xrArPlacementMode: state.placementMode,
        xrArPlacementSource: state.placementSource,
        xrArSurfaceDetected: state.surfaceDetected,
        xrArMetricId: state.metricId,
        xrArTimeIndex: state.timeIndex,
        xrArLayerMode: state.layerMode,
        xrArLabelsVisible: state.labelsVisible,
        xrArSelectedSiteId: state.selectedSiteId,
        xrArFocusedSiteId: state.focusedSiteId,
        xrArDetailExpanded: state.detailExpanded,
        xrArInteractionModality: state.interactionModality,
        xrArGazeDwellCount: state.gazeDwellCount,
        xrArHandSelectCount: state.handSelectCount,
        xrArVisibleSiteCount: state.visibleSiteIds.length,
        xrArAnchorTransformJson: jsonStringifyCompact( anchorTransform ),
        xrStateSummaryJson: jsonStringifyCompact( state ),
      };

    }

    function createDesktopPanel() {

      const style = demo4VisualConfig.desktopPanel;
      const node = document.createElement( 'section' );
      node.setAttribute( 'style', style.root );

      const title = document.createElement( 'h2' );
      title.setAttribute( 'style', style.title );
      title.textContent = 'Campus Commons Monitoring Overlay';
      node.appendChild( title );

      const status = document.createElement( 'p' );
      status.setAttribute( 'style', style.body );
      node.appendChild( status );

      const metricRow = document.createElement( 'div' );
      metricRow.setAttribute( 'style', style.row );
      const metricButtons = new Map();
      DEMO4_METRIC_IDS.forEach( ( metricId ) => {

        const metric = getDemo4Metric( metricId );
        const button = document.createElement( 'button' );
        button.type = 'button';
        button.textContent = metric?.label || metricId;
        button.addEventListener( 'click', () => setMetric( metricId, `desktop-metric-${metricId}` ) );
        metricButtons.set( metricId, button );
        metricRow.appendChild( button );

      } );
      node.appendChild( metricRow );

      const timeRow = document.createElement( 'div' );
      timeRow.setAttribute( 'style', style.row );
      const timeButtons = new Map();
      dataset.timeSlices.forEach( ( timeSlice ) => {

        const button = document.createElement( 'button' );
        button.type = 'button';
        button.textContent = timeSlice.label;
        button.addEventListener( 'click', () => setTimeIndex( timeSlice.index, `desktop-time-${timeSlice.id}` ) );
        timeButtons.set( timeSlice.index, button );
        timeRow.appendChild( button );

      } );
      node.appendChild( timeRow );

      const controlRow = document.createElement( 'div' );
      controlRow.setAttribute( 'style', style.row );
      const confirmButton = document.createElement( 'button' );
      confirmButton.type = 'button';
      confirmButton.textContent = 'Confirm placement';
      confirmButton.addEventListener( 'click', () => confirmPlacement( 'desktop-confirm-placement' ) );
      controlRow.appendChild( confirmButton );

      const resetButton = document.createElement( 'button' );
      resetButton.type = 'button';
      resetButton.textContent = 'Reset placement';
      resetButton.addEventListener( 'click', () => resetPlacement( 'desktop-reset-placement' ) );
      controlRow.appendChild( resetButton );

      const layerButton = document.createElement( 'button' );
      layerButton.type = 'button';
      layerButton.addEventListener( 'click', () => toggleLayerMode( 'desktop-layer-mode' ) );
      controlRow.appendChild( layerButton );

      const labelsButton = document.createElement( 'button' );
      labelsButton.type = 'button';
      labelsButton.addEventListener( 'click', () => toggleLabels( 'desktop-labels' ) );
      controlRow.appendChild( labelsButton );

      const detailButton = document.createElement( 'button' );
      detailButton.type = 'button';
      detailButton.addEventListener( 'click', () => toggleDetail( 'desktop-detail' ) );
      controlRow.appendChild( detailButton );

      const modalityButton = document.createElement( 'button' );
      modalityButton.type = 'button';
      modalityButton.addEventListener( 'click', () => toggleInteractionModality( 'desktop-interaction-modality' ) );
      controlRow.appendChild( modalityButton );

      const submitButton = document.createElement( 'button' );
      submitButton.type = 'button';
      submitButton.textContent = 'Submit answer';
      submitButton.addEventListener( 'click', () => submitTask( 'desktop-task-submit' ) );
      controlRow.appendChild( submitButton );

      [ confirmButton, resetButton, layerButton, labelsButton, detailButton, modalityButton, submitButton ].forEach( ( button ) => {

        button.setAttribute( 'style', style.button );

      } );
      node.appendChild( controlRow );

      const siteRow = document.createElement( 'div' );
      siteRow.setAttribute( 'style', style.row );
      DEMO4_SITE_IDS.forEach( ( siteId ) => {

        const site = getDemo4Site( siteId );
        const button = document.createElement( 'button' );
        button.type = 'button';
        button.setAttribute( 'style', style.button );
        button.textContent = site?.label || siteId;
        button.addEventListener( 'click', () => activateSite(
          siteId,
          DEMO4_INTERACTION_MODALITIES.HAND_RAY,
          `desktop-site-${siteId}`,
        ) );
        siteRow.appendChild( button );

      } );
      node.appendChild( siteRow );

      const detail = document.createElement( 'p' );
      detail.setAttribute( 'style', style.detail );
      node.appendChild( detail );

      Object.assign( desktopRefs, {
        status,
        metricButtons,
        timeButtons,
        layerButton,
        labelsButton,
        detailButton,
        modalityButton,
        confirmButton,
        submitButton,
        detail,
      } );
      context.setDesktopPanelNode?.( node );
      syncDesktopPanel();

    }

    placementAnchor = createSituatedAnchor( context, {
      parent: root,
      name: 'demo4-situated-anchor',
      floorY: demo4VisualConfig.placement.floorY,
      overlayLift: demo4VisualConfig.placement.overlayLift,
      placementSurfaceSize: demo4VisualConfig.placement.placementSurfaceSize,
      defaultPreviewPosition: demo4VisualConfig.placement.defaultPreviewPosition,
      defaultPreviewQuaternion: demo4VisualConfig.placement.defaultPreviewQuaternion,
      defaultScale: demo4VisualConfig.placement.defaultScale,
      preservePlacementPoseY: true,
      shouldAcceptPlacementPayload: isAcceptedPlacementSource,
      onPreviewMove( payload ) {

        applyTransientFallbackPreviewStatus( payload );

      },
      onConfirmPlacement( payload, transform ) {

        confirmPlacement( payload || 'demo4-placement-surface', transform );

      },
    } );
    disposables.push( placementAnchor );

    createPlacementVisuals();
    createAnchoredOverlayVisuals();
    createDesktopPanel();
    syncVisuals();

    return {
      activate() {

        syncVisuals();

      },
      dispose() {

        context.clearDesktopPanel?.();
        hoveredSiteBySource.clear();
        disposables.splice( 0 ).reverse().forEach( ( disposable ) => disposable.dispose?.() );
        root.removeFromParent();

      },
      getSceneStateForReplay() {

        return normalizeDemo4SceneState( getSceneStateForStorage(), currentSceneState );

      },
      applySceneStateFromReplay( sceneState ) {

        currentSceneState = normalizeDemo4SceneState( sceneState, currentSceneState );

        if ( ! isFiniteNumber( sceneState?.arAnchorSurfaceHeight ) || sceneState.arAnchorSurfaceHeight <= 0 ) {

          currentSceneState.arAnchorSurfaceHeight = getAnchorSurfaceHeightFromPosition( currentSceneState.arAnchorPosition );

        }

        if ( ! sceneState?.placementSource ) {

          currentSceneState.placementSource = DEMO4_PLACEMENT_SOURCES.REPLAY;
          currentSceneState.surfaceDetected = false;

        }

        resetGazeDwell( { keepFocus: true } );
        syncVisuals();

      },
      update( deltaSeconds, runtime = {} ) {

        updatePlacementPreviewFromRuntime( runtime );
        updateGazeDwell( deltaSeconds, runtime );
        syncSupportPedestalVisual();
        syncPlacementInstructionCard();

      },
      getAnswerSummary() {

        return getAnswerSummary();

      },
      resolveRaycastIntersection( intersections ) {

        if ( ! currentSceneState.arPlacementConfirmed ) {

          return intersections.find( ( hit ) => hit.object === placementAnchor.placementSurface ) || intersections[ 0 ] || null;

        }

        return intersections[ 0 ] || null;

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === 'immersive-vr' || unsupportedImmersiveMode === 'immersive-vr' ) {

          return {
            title: 'Demo 4 Is AR Only',
            body: 'This situated overlay is designed for real-surface AR placement. VR is intentionally disabled for this scene.',
            note: 'Exit VR and use Start AR or desktop fallback to continue. Replay hydration still restores the semantic anchor transform.',
          };

        }

        const isPlaced = currentSceneState.arPlacementConfirmed;
        const modeLabel = presentationMode === 'immersive-ar' ? 'AR' : 'desktop';

        return {
          title: 'Demo 4 Situated AR Overlay',
          body: isPlaced
            ? `Inspect the anchored campus overlay in ${modeLabel}. Switch metric/time, select a site, then submit your answer.`
            : (
              presentationMode === 'immersive-ar'
                ? getPlacementPromptText()
                : `Place the campus overlay on the default preview in ${modeLabel}. Desktop can use the side panel confirm button.`
            ),
          note: [
            'Placement, metric, time slice, layer, labels, site selection, detail state, and answer submission are stored as semantic replay state.',
            isDemo4DebugEnabled() ? getPlacementDebugLine() : null,
          ].filter( Boolean ).join( '\n' ),
        };

      },
      handleBackgroundSelect( payload = {} ) {

        handlePlacementBackgroundSelect( payload );

      },
      getDebugState() {

        return getPlacementDebugState();

      },
      onPresentationModeChange( presentationMode ) {

        unsupportedImmersiveMode = presentationMode === 'immersive-vr'
          ? 'immersive-vr'
          : null;
        placementPreviewStatus = 'lost';
        placementPreviewSourceLabel = null;
        resetPlacementStabilizer( { clearPose: true } );
        resetGazeDwell( { keepFocus: true } );
        syncVisuals();

      },
      onUnsupportedImmersiveMode( mode ) {

        unsupportedImmersiveMode = mode;
        syncVisuals();

      },
    };

  },
} );
