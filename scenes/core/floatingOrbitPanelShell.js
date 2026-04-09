import * as THREE from 'three';
import { PRESENTATION_MODES } from '../../logging/xrLoggingSchema.js';
import { createFloatingOrbitPanel } from './floatingOrbitPanel.js';
import { createSceneUiSurface } from './sceneUiSurface.js';

function isFiniteVector3Array( value ) {

  return Array.isArray( value ) && value.length === 3 && value.every( Number.isFinite );

}

function isFiniteQuaternionArray( value ) {

  return Array.isArray( value ) && value.length === 4 && value.every( Number.isFinite );

}

function createPanelMesh( geometry, material ) {

  const mesh = new THREE.Mesh( geometry, material );

  return {
    mesh,
    dispose() {

      geometry.dispose();
      material.dispose();

    },
  };

}

function createPanelEdge( {
  width,
  height,
  edgeColor,
  edgeOpacity,
  edgeMode = 'plane',
} ) {

  if ( edgeMode === 'line' ) {

    const geometry = new THREE.EdgesGeometry( new THREE.PlaneGeometry( width, height ) );
    const material = new THREE.LineBasicMaterial( {
      color: edgeColor,
      transparent: true,
      opacity: edgeOpacity,
      toneMapped: false,
    } );
    const lineSegments = new THREE.LineSegments( geometry, material );

    return {
      object3D: lineSegments,
      dispose() {

        geometry.dispose();
        material.dispose();

      },
    };

  }

  return createPanelMesh(
    new THREE.PlaneGeometry( width, height ),
    new THREE.MeshBasicMaterial( {
      color: edgeColor,
      transparent: true,
      opacity: edgeOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    } ),
  );

}

export function createFloatingOrbitPanelShell( context, {
  panelRoot,
  namePrefix = 'floating-panel',
  width = 1,
  height = 1,
  titleBarHeight = 0.14,
  titleBarY = 0,
  titleBarWidth = width - 0.05,
  dragSurfaceHeight = titleBarHeight,
  backgroundColor = 0x101820,
  backgroundEmissive = 0x07111a,
  backgroundOpacity = 0.94,
  bodyInsetColor = 0x111b27,
  bodyInsetOpacity = 0.72,
  edgeColor = 0x6ea8cf,
  edgeOpacity = 0.16,
  titleBarColor = 0x152335,
  titleBarEmissive = 0x0a1826,
  surfacePanelZ = 0.016,
  surfaceDragZ = 0.04,
  edgeMode = 'plane',
  panelInitialOffset,
  panelInitialYawDeg = 0,
  orbitCenterMode = 'immersive-entry-camera',
  orbitRadius = null,
  orbitHeightOffset = null,
  followCameraHeight = false,
  heightFollowOffset = null,
  minPanelHeight = null,
  maxPanelHeight = null,
  heightSmoothing = 0,
  dragMode = 'orbital-horizontal',
  faceOrbitCenter = true,
  lockVerticalOrientation = true,
  minOrbitRadius = 0.25,
  enableLocalDrag = true,
  onPanelHoverChange = null,
  onTitleBarHoverChange = null,
  onDragStart = null,
  onDragMove = null,
  onDragEnd = null,
} = {} ) {

  if ( ! panelRoot ) {

    throw new Error( 'createFloatingOrbitPanelShell requires a panelRoot.' );

  }

  const panelHoverSources = new Set();
  const titleBarHoverSources = new Set();
  const disposableObjects = [];
  const disposableSurfaces = [];
  let placementInitialized = false;

  const backgroundMesh = createPanelMesh(
    new THREE.PlaneGeometry( width, height ),
    new THREE.MeshStandardMaterial( {
      color: backgroundColor,
      emissive: backgroundEmissive,
      transparent: true,
      opacity: backgroundOpacity,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.DoubleSide,
    } ),
  );
  panelRoot.add( backgroundMesh.mesh );
  disposableObjects.push( backgroundMesh );

  const bodyInsetMesh = createPanelMesh(
    new THREE.PlaneGeometry( Math.max( 0.01, width - 0.05 ), Math.max( 0.01, height - 0.08 ) ),
    new THREE.MeshBasicMaterial( {
      color: bodyInsetColor,
      transparent: true,
      opacity: bodyInsetOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    } ),
  );
  bodyInsetMesh.mesh.position.set( 0, - 0.02, 0.002 );
  panelRoot.add( bodyInsetMesh.mesh );
  disposableObjects.push( bodyInsetMesh );

  const edge = createPanelEdge( {
    width: Math.max( 0.01, width - 0.018 ),
    height: Math.max( 0.01, height - 0.018 ),
    edgeColor,
    edgeOpacity,
    edgeMode,
  } );
  const edgeObject3D = edge.object3D || edge.mesh;
  edgeObject3D.position.z = edgeMode === 'line' ? 0.004 : 0.003;
  panelRoot.add( edgeObject3D );
  disposableObjects.push( edge );

  const titleBarMesh = createPanelMesh(
    new THREE.PlaneGeometry( Math.max( 0.01, titleBarWidth ), titleBarHeight ),
    new THREE.MeshStandardMaterial( {
      color: titleBarColor,
      emissive: titleBarEmissive,
      roughness: 0.76,
      metalness: 0.08,
      side: THREE.DoubleSide,
    } ),
  );
  titleBarMesh.mesh.position.set( 0, titleBarY, 0.006 );
  panelRoot.add( titleBarMesh.mesh );
  disposableObjects.push( titleBarMesh );

  const orbitPanel = createFloatingOrbitPanel( context, {
    panelRoot,
    panelInitialOffset,
    panelInitialYawDeg,
    orbitCenterMode,
    orbitRadius,
    orbitHeightOffset,
    followCameraHeight,
    heightFollowOffset,
    minPanelHeight,
    maxPanelHeight,
    heightSmoothing,
    dragMode,
    faceOrbitCenter,
    lockVerticalOrientation,
    minOrbitRadius,
  } );

  function getInteractionPolicy() {

    return context.getInteractionPolicy?.() ?? null;

  }

  function isLiveStudyInteractionAllowed() {

    if ( enableLocalDrag === false ) {

      return false;

    }

    const interactionPolicy = getInteractionPolicy();

    if ( ! interactionPolicy ) {

      return true;

    }

    return (
      interactionPolicy.canInteract !== false &&
      interactionPolicy.isAnalysisSession !== true &&
      interactionPolicy.hasReceivedReplayState !== true &&
      interactionPolicy.isApplyingReplayState !== true
    );

  }

  function shouldApplyRuntimeHeightFollow() {

    if (
      context.getPresentationMode?.() === PRESENTATION_MODES.DESKTOP ||
      orbitPanel.isFollowingCameraHeight() !== true
    ) {

      return false;

    }

    const interactionPolicy = getInteractionPolicy();

    if ( ! interactionPolicy ) {

      return true;

    }

    return (
      interactionPolicy.isAnalysisSession !== true &&
      interactionPolicy.hasReceivedReplayState !== true &&
      interactionPolicy.isApplyingReplayState !== true
    );

  }

  function syncDragAvailability() {

    orbitPanel.setLocalDragEnabled( isLiveStudyInteractionAllowed() );
    return orbitPanel.isDragEnabled();

  }

  function handlePanelHoverChange( payload ) {

    if ( payload.isHovered ) {

      panelHoverSources.add( payload.source );

    } else {

      panelHoverSources.delete( payload.source );

    }

    onPanelHoverChange?.( payload );

  }

  function handleTitleBarHoverChange( payload ) {

    if ( payload.isHovered ) {

      titleBarHoverSources.add( payload.source );

    } else {

      titleBarHoverSources.delete( payload.source );

    }

    onTitleBarHoverChange?.( payload );

  }

  disposableSurfaces.push( createSceneUiSurface( context, {
    parent: panelRoot,
    width,
    height,
    position: [ 0, 0, surfacePanelZ ],
    name: `${namePrefix}-background-surface`,
    handlers: {
      onHoverChange: handlePanelHoverChange,
    },
  } ) );

  disposableSurfaces.push( createSceneUiSurface( context, {
    parent: panelRoot,
    width: Math.max( 0.01, titleBarWidth ),
    height: dragSurfaceHeight,
    position: [ 0, titleBarY, surfaceDragZ ],
    name: `${namePrefix}-titlebar-surface`,
    handlers: {
      onHoverChange: handleTitleBarHoverChange,
      onSelectStart( payload ) {

        syncDragAvailability();

        if ( ! orbitPanel.beginDrag( payload ) ) {

          return;

        }

        onDragStart?.( payload );

      },
      onSelectMove( payload ) {

        if ( ! orbitPanel.updateDrag( payload ) ) {

          return;

        }

        placementInitialized = true;
        onDragMove?.( payload );

      },
      onSelectEnd( payload ) {

        if ( ! orbitPanel.endDrag( payload ) ) {

          return;

        }

        onDragEnd?.( payload );

      },
    },
  } ) );

  function placeAtDefault() {

    orbitPanel.captureOrbitCenterFromCamera();
    const panelState = orbitPanel.placeAtDefault();
    placementInitialized = true;
    return panelState;

  }

  function applyPanelTransform( panelPosition, panelQuaternion, { useExactTransform = false } = {} ) {

    const panelState = useExactTransform
      ? orbitPanel.applyWorldTransform( panelPosition, panelQuaternion )
      : orbitPanel.applyLiveWorldTransform( panelPosition, panelQuaternion );
    placementInitialized = true;
    return panelState;

  }

  function ensurePlacement( {
    panelPosition = null,
    panelQuaternion = null,
    forceDefault = false,
    useExactTransform = false,
  } = {} ) {

    if ( context.getPresentationMode?.() === PRESENTATION_MODES.DESKTOP ) {

      panelRoot.visible = false;
      return null;

    }

    panelRoot.visible = true;
    orbitPanel.captureOrbitCenterFromCamera();
    syncDragAvailability();

    if ( forceDefault ) {

      return placeAtDefault();

    }

    if ( isFiniteVector3Array( panelPosition ) && isFiniteQuaternionArray( panelQuaternion ) ) {

      return applyPanelTransform( panelPosition, panelQuaternion, { useExactTransform } );

    }

    if ( ! placementInitialized ) {

      return placeAtDefault();

    }

    orbitPanel.syncOrbitFromCurrentTransform();
    return orbitPanel.getPanelSceneState();

  }

  return {
    meshes: {
      background: backgroundMesh.mesh,
      bodyInset: bodyInsetMesh.mesh,
      edge: edgeObject3D,
      titleBar: titleBarMesh.mesh,
    },
    orbitPanel,
    captureOrbitCenterFromCamera() {

      return orbitPanel.captureOrbitCenterFromCamera();

    },
    getPanelSceneState() {

      return orbitPanel.getPanelSceneState();

    },
    placeAtDefault,
    applyPanelTransform,
    ensurePlacement,
    syncOrbitFromCurrentTransform( options ) {

      orbitPanel.syncOrbitFromCurrentTransform( options );

    },
    syncDragAvailability,
    updateRuntimePlacement( { deltaSeconds = null } = {} ) {

      syncDragAvailability();

      if ( ! shouldApplyRuntimeHeightFollow() ) {

        return false;

      }

      const didUpdate = orbitPanel.updateRuntimePlacement( { deltaSeconds } );

      if ( didUpdate ) {

        placementInitialized = true;

      }

      return didUpdate;

    },
    hasPlacementInitialized() {

      return placementInitialized;

    },
    isPanelHovered() {

      return panelHoverSources.size > 0;

    },
    isTitleBarHovered() {

      return titleBarHoverSources.size > 0;

    },
    isDragging() {

      return orbitPanel.isDragging();

    },
    isDragEnabled() {

      return orbitPanel.isDragEnabled();

    },
    shouldApplyRuntimeHeightFollow,
    dispose() {

      disposableSurfaces.forEach( ( surface ) => surface.dispose() );
      disposableObjects.forEach( ( entry ) => {

        entry.object3D?.removeFromParent?.();
        entry.mesh?.removeFromParent?.();
        entry.dispose?.();

      } );
      panelHoverSources.clear();
      titleBarHoverSources.clear();

    },
  };

}
