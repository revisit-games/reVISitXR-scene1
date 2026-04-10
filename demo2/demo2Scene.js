import * as THREE from 'three';
import { mesh as buildTopojsonMesh } from 'topojson-client';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createFloatingOrbitPanelShell } from '../scenes/core/floatingOrbitPanelShell.js';
import { loadDemo2Dataset } from './demo2Data.js';
import { demo2VisualConfig } from './demo2VisualConfig.js';
import { demo2LoggingConfig } from './demo2LoggingConfig.js';
import {
  DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
  DEMO2_DEFAULT_GLOBE_YAW_DEG,
  DEMO2_DEFAULT_TASK_ID,
  DEMO2_DEFAULT_THRESHOLD,
  DEMO2_DEFAULT_YEAR,
  DEMO2_DIRECTION_MODES,
  DEMO2_THRESHOLD_PRESETS,
  normalizeDemo2GlobeAnchorPosition,
  normalizeDemo2PanelPosition,
  normalizeDemo2PanelQuaternion,
  normalizeDemo2SceneState,
  parseDemo2Conditions,
} from './demo2Conditions.js';
import { getDemo2Task } from './demo2Tasks.js';

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function createStyledElement( tagName, style, text = '' ) {

  const element = document.createElement( tagName );
  element.setAttribute( 'style', style );
  element.textContent = text;
  return element;

}

function formatCompactNumber( value, {
  maximumFractionDigits = 1,
} = {} ) {

  if ( ! isFiniteNumber( value ) ) {

    return '--';

  }

  return new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits,
  } ).format( value );

}

function formatFlowValue( value ) {

  if ( ! isFiniteNumber( value ) || value < 0 ) {

    return '--';

  }

  if ( value >= 1e6 ) {

    return `${formatCompactNumber( value / 1e6, { maximumFractionDigits: 2 } )}M`;

  }

  if ( value >= 1e3 ) {

    return `${formatCompactNumber( value / 1e3, { maximumFractionDigits: 1 } )}K`;

  }

  return formatCompactNumber( value, { maximumFractionDigits: 0 } );

}

function formatThreshold( value ) {

  return value <= 0 ? 'All' : `>= ${formatFlowValue( value )}`;

}

function formatCompactThreshold( value ) {

  return value <= 0 ? 'all' : `>=${formatFlowValue( value )}`;

}

function formatDirectionMode( value ) {

  if ( value === DEMO2_DIRECTION_MODES.ALL ) {

    return 'All';

  }

  if ( value === DEMO2_DIRECTION_MODES.INBOUND ) {

    return 'Inbound';

  }

  return 'Outbound';

}

function truncateLabel( value, maxLength = 22 ) {

  if ( typeof value !== 'string' || value.length <= maxLength ) {

    return value || '';

  }

  return `${value.slice( 0, maxLength - 3 ).trimEnd()}...`;

}

function buildButtonLabel( label, state ) {

  return `${label}\n${state}`;

}

function getButtonStyle( desktopPanelStyle, isEnabled ) {

  return isEnabled ? desktopPanelStyle.button : desktopPanelStyle.buttonDisabled;

}

function latLonToVector3( latDeg, lonDeg, radius ) {

  const phi = THREE.MathUtils.degToRad( 90 - latDeg );
  const theta = THREE.MathUtils.degToRad( lonDeg + 180 );

  return new THREE.Vector3(
    - radius * Math.sin( phi ) * Math.cos( theta ),
    radius * Math.cos( phi ),
    radius * Math.sin( phi ) * Math.sin( theta ),
  );

}

function createArcPoints( start, end, radius, arcHeight, segments ) {

  const startUnit = start.clone().normalize();
  const endUnit = end.clone().normalize();
  const points = [];

  for ( let index = 0; index <= segments; index += 1 ) {

    const t = index / segments;
    const unitPoint = startUnit.clone().lerp( endUnit, t ).normalize();
    const liftedRadius = radius + Math.sin( Math.PI * t ) * arcHeight;
    points.push( unitPoint.multiplyScalar( liftedRadius ) );

  }

  return points;

}

function normalizeAngleDegrees( value ) {

  if ( ! isFiniteNumber( value ) ) {

    return DEMO2_DEFAULT_GLOBE_YAW_DEG;

  }

  let normalized = value % 360;

  if ( normalized > 180 ) {

    normalized -= 360;

  } else if ( normalized <= - 180 ) {

    normalized += 360;

  }

  return Number.parseFloat( normalized.toFixed( 3 ) );

}

function getAngleDifferenceDegrees( angleA, angleB ) {

  return Math.abs( normalizeAngleDegrees( angleA - angleB ) );

}

function appendSurfaceSegmentPositions( positions, startCoordinate, endCoordinate, radius ) {

  const startPoint = latLonToVector3( startCoordinate[ 1 ], startCoordinate[ 0 ], radius ).normalize();
  const endPoint = latLonToVector3( endCoordinate[ 1 ], endCoordinate[ 0 ], radius ).normalize();
  const angleRadians = Math.acos( THREE.MathUtils.clamp( startPoint.dot( endPoint ), - 1, 1 ) );
  const subdivisions = Math.max( 1, Math.ceil( angleRadians / THREE.MathUtils.degToRad( 4 ) ) );
  let previousPoint = startPoint.clone().multiplyScalar( radius );

  for ( let step = 1; step <= subdivisions; step += 1 ) {

    const nextPoint = startPoint
      .clone()
      .lerp( endPoint, step / subdivisions )
      .normalize()
      .multiplyScalar( radius );

    positions.push(
      previousPoint.x, previousPoint.y, previousPoint.z,
      nextPoint.x, nextPoint.y, nextPoint.z,
    );
    previousPoint = nextPoint;

  }

}

export const demo2SceneDefinition = Object.freeze( {
  sceneKey: 'demo2',
  queryValue: '2',
  label: 'Demo 2 Migration Globe Baseline',
  loggingConfig: demo2LoggingConfig,
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return normalizeDemo2SceneState(
      candidateState,
      fallbackState,
      {
        defaultYear: DEMO2_DEFAULT_YEAR,
        defaultTaskId: DEMO2_DEFAULT_TASK_ID,
        defaultFocusedCountryId: DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
      },
    );

  },
  createScene( context ) {

    const { globe, xrPanel, desktopPanel, palettes, labelStyles } = demo2VisualConfig;
    const defaultSceneState = parseDemo2Conditions( window.location.search, {
      defaultYear: DEMO2_DEFAULT_YEAR,
      defaultTaskId: DEMO2_DEFAULT_TASK_ID,
      defaultFocusedCountryId: DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
    } );
    const root = new THREE.Group();
    const globeRoot = new THREE.Group();
    const globeYawRoot = new THREE.Group();
    const globeBoundaryRoot = new THREE.Group();
    const globeArcRoot = new THREE.Group();
    const globeNodeRoot = new THREE.Group();
    const globeLabelRoot = new THREE.Group();
    const xrPanelRoot = new THREE.Group();
    const staticObjects = [];
    const dynamicObjects = [];
    const uiSurfaces = [];
    const xrButtons = new Map();
    const desktopRefs = {};
    const nodeEntriesById = new Map();
    const flowHoverBySource = new Map();
    const nodeHoverBySource = new Map();
    const defaultGlobeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
      globe.anchorDefaultPosition || globe.rootPosition,
    );
    const handleLocalFloorY = globe.handleFloorY - defaultGlobeAnchorPosition[ 1 ];
    const lastLoggedPanelPosition = new THREE.Vector3();
    const lastLoggedPanelQuaternion = new THREE.Quaternion();
    const lastLoggedGlobeAnchorPosition = new THREE.Vector3().fromArray( defaultGlobeAnchorPosition );
    const globeInteractionSphere = new THREE.Sphere( new THREE.Vector3(), globe.interactionRadius );
    const globeHandleDragPlane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), - globe.handleFloorY );
    const tempTooltipPosition = new THREE.Vector3();
    const tempTooltipAnchor = new THREE.Vector3();
    const tempGlobeWorldCenter = new THREE.Vector3();
    const tempGlobeWorldHit = new THREE.Vector3();
    const tempGlobeLocalHit = new THREE.Vector3();
    const tempGlobeRay = new THREE.Ray();
    const tempGlobeHandleHit = new THREE.Vector3();
    const tempGlobeAnchorPosition = new THREE.Vector3();
    let interactionSequence = 0;
    let dataset = null;
    let loadStatus = 'loading';
    let loadError = null;
    let currentSceneState = { ...defaultSceneState };
    let currentHoveredEntry = null;
    let currentHoveredNodeId = null;
    let currentHoveredFlowId = null;
    let selectedNodeSource = null;
    let selectedFlowSource = null;
    let selectedNodeSelectionSequence = - 1;
    let selectedFlowSelectionSequence = - 1;
    let currentVisibleFlows = [];
    let currentVisibleFlowEntries = [];
    let currentFlowEntryById = new Map();
    let currentBoundaryLines = null;
    let activeGlobeDrag = null;
    let activeGlobeMove = null;
    let lastLoggedGlobeYawDeg = currentSceneState.globeYawDeg;
    let lastGlobeYawLogAt = 0;
    let lastGlobeAnchorLogAt = 0;

    root.add( globeRoot );
    root.add( xrPanelRoot );
    globeRoot.position.fromArray( defaultGlobeAnchorPosition );
    globeRoot.add( globeYawRoot );
    const globeHandleRoot = new THREE.Group();
    globeRoot.add( globeHandleRoot );
    globeYawRoot.add( globeBoundaryRoot );
    globeYawRoot.add( globeArcRoot );
    globeYawRoot.add( globeNodeRoot );
    globeYawRoot.add( globeLabelRoot );

    const defaultDesktopCameraPosition = new THREE.Vector3( 0, 1.46, 0.12 );
    const defaultDesktopLookAt = new THREE.Vector3( 0, defaultGlobeAnchorPosition[ 1 ], defaultGlobeAnchorPosition[ 2 ] );

    function trackDisposable( collection, object3D, dispose ) {

      collection.push( {
        object3D,
        dispose,
      } );

      return object3D;

    }

    function createTrackedMesh( collection, parent, geometry, material ) {

      const mesh = new THREE.Mesh( geometry, material );
      parent.add( mesh );
      trackDisposable( collection, mesh, () => {

        mesh.removeFromParent();
        geometry.dispose();
        material.dispose();

      } );
      return mesh;

    }

    function createInteractiveTrackedMesh( collection, parent, geometry, material, handlers ) {

      const mesh = createTrackedMesh( collection, parent, geometry, material );
      context.registerRaycastTarget( mesh, handlers );
      const entry = collection.at( - 1 );
      const baseDispose = entry.dispose;
      entry.dispose = () => {

        context.unregisterRaycastTarget( mesh );
        baseDispose();

      };
      return mesh;

    }

    function createTrackedTextPlane( collection, parent, options, position ) {

      const controller = createTextPlane( options );
      controller.mesh.position.copy( position );
      parent.add( controller.mesh );
      trackDisposable( collection, controller.mesh, () => {

        controller.mesh.removeFromParent();
        controller.dispose();

      } );
      return controller;

    }

    function createTrackedTextSprite( collection, parent, options, position ) {

      const controller = createTextSprite( options );
      controller.sprite.position.copy( position );
      parent.add( controller.sprite );
      trackDisposable( collection, controller.sprite, () => {

        controller.sprite.removeFromParent();
        controller.dispose();

      } );
      return controller;

    }

    function createTrackedLineSegments( collection, parent, geometry, material ) {

      const lineSegments = new THREE.LineSegments( geometry, material );
      parent.add( lineSegments );
      trackDisposable( collection, lineSegments, () => {

        lineSegments.removeFromParent();
        geometry.dispose();
        material.dispose();

      } );
      return lineSegments;

    }

    function clearTrackedCollection( collection ) {

      collection.splice( 0 ).forEach( ( entry ) => {

        entry.dispose?.();

      } );

    }

    const globeShell = createTrackedMesh(
      staticObjects,
      globeYawRoot,
      new THREE.SphereGeometry( globe.radius, 48, 32 ),
      new THREE.MeshStandardMaterial( {
        color: globe.shellColor,
        emissive: globe.shellEmissive,
        transparent: true,
        opacity: globe.shellOpacity,
        roughness: 0.82,
        metalness: 0.04,
      } ),
    );
    const globeWireframe = createTrackedMesh(
      staticObjects,
      globeYawRoot,
      new THREE.SphereGeometry( globe.radius * 1.001, 24, 18 ),
      new THREE.MeshBasicMaterial( {
        color: globe.gridColor,
        wireframe: true,
        transparent: true,
        opacity: globe.gridOpacity,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    const atmosphere = createTrackedMesh(
      staticObjects,
      globeYawRoot,
      new THREE.SphereGeometry( globe.radius * 1.05, 32, 24 ),
      new THREE.MeshBasicMaterial( {
        color: globe.atmosphereColor,
        transparent: true,
        opacity: globe.atmosphereOpacity,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    atmosphere.renderOrder = 2;
    const globeInteractionShell = createInteractiveTrackedMesh(
      staticObjects,
      globeYawRoot,
      new THREE.SphereGeometry( globe.interactionRadius, 48, 32 ),
      new THREE.MeshBasicMaterial( {
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      } ),
      {
        onSelectStart( payload ) {

          if ( context.getInteractionPolicy?.()?.canInteract === false ) {

            return;

          }

          const startAzimuthDeg = resolveGlobeDragAzimuth( payload.rayOrigin, payload.rayDirection );

          if ( startAzimuthDeg === null ) {

            return;

          }

          activeGlobeDrag = {
            source: payload.source,
            startYawDeg: currentSceneState.globeYawDeg,
            startAzimuthDeg,
            hasMoved: false,
          };
          clearHoverState();

        },
        onSelectMove( payload ) {

          if ( activeGlobeDrag?.source !== payload.source ) {

            return;

          }

          const nextAzimuthDeg = resolveGlobeDragAzimuth( payload.rayOrigin, payload.rayDirection );

          if ( nextAzimuthDeg === null ) {

            return;

          }

          const nextYawDeg = normalizeAngleDegrees(
            activeGlobeDrag.startYawDeg + ( nextAzimuthDeg - activeGlobeDrag.startAzimuthDeg ),
          );

          if ( getAngleDifferenceDegrees( nextYawDeg, currentSceneState.globeYawDeg ) <= 0.08 ) {

            return;

          }

          activeGlobeDrag.hasMoved = true;
          currentSceneState.globeYawDeg = nextYawDeg;
          applyGlobeYaw();
          updateHighlightsAndTooltip();
          syncAllUi();
          recordGlobeYawIfNeeded( `${payload.source}-globe-drag` );

        },
        onSelectEnd( payload ) {

          if ( activeGlobeDrag?.source !== payload.source ) {

            return;

          }

          const shouldFlush = activeGlobeDrag.hasMoved === true;
          activeGlobeDrag = null;

          if ( shouldFlush ) {

            recordGlobeYawIfNeeded( `${payload.source}-globe-drag-end`, {
              force: true,
              flushImmediately: getSceneStateLoggingConfig().flushOnGlobeDragEnd === true,
            } );

          }

        },
      },
    );
    globeInteractionShell.renderOrder = 1;

    const handleLineHeight = Math.max( 0.05, Math.abs( handleLocalFloorY ) );
    const globeHandleLine = createTrackedMesh(
      staticObjects,
      globeHandleRoot,
      new THREE.CylinderGeometry( globe.handleLineRadius, globe.handleLineRadius, handleLineHeight, 18 ),
      new THREE.MeshStandardMaterial( {
        color: 0x88c9f3,
        emissive: 0x133349,
        transparent: true,
        opacity: 0.8,
        roughness: 0.38,
        metalness: 0.16,
      } ),
    );
    globeHandleLine.position.set( 0, handleLocalFloorY * 0.5, 0 );

    const globeHandleRing = createTrackedMesh(
      staticObjects,
      globeHandleRoot,
      new THREE.TorusGeometry( globe.handleRingRadius, globe.handleRingTubeRadius, 20, 64 ),
      new THREE.MeshStandardMaterial( {
        color: 0x7fc9ff,
        emissive: 0x17364a,
        transparent: true,
        opacity: 0.82,
        roughness: 0.34,
        metalness: 0.18,
      } ),
    );
    globeHandleRing.position.set( 0, handleLocalFloorY + globe.handleRingTubeRadius, 0 );
    globeHandleRing.rotation.x = Math.PI * 0.5;

    const globeHandleDisc = createTrackedMesh(
      staticObjects,
      globeHandleRoot,
      new THREE.CylinderGeometry( globe.handleDiscRadius, globe.handleDiscRadius, 0.012, 48 ),
      new THREE.MeshBasicMaterial( {
        color: 0x2c4860,
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    globeHandleDisc.position.set( 0, handleLocalFloorY + 0.006, 0 );
    globeHandleDisc.renderOrder = 1;

    const arrowDirections = [
      { position: [ globe.handleArrowOffset, handleLocalFloorY + globe.handleArrowLift, 0 ], rotation: [ 0, 0, - Math.PI * 0.5 ] },
      { position: [ - globe.handleArrowOffset, handleLocalFloorY + globe.handleArrowLift, 0 ], rotation: [ 0, 0, Math.PI * 0.5 ] },
      { position: [ 0, handleLocalFloorY + globe.handleArrowLift, globe.handleArrowOffset ], rotation: [ Math.PI * 0.5, 0, 0 ] },
      { position: [ 0, handleLocalFloorY + globe.handleArrowLift, - globe.handleArrowOffset ], rotation: [ - Math.PI * 0.5, 0, 0 ] },
    ];
    arrowDirections.forEach( ( arrowConfig ) => {

      const arrow = createTrackedMesh(
        staticObjects,
        globeHandleRoot,
        new THREE.ConeGeometry( 0.028, 0.05, 12 ),
        new THREE.MeshStandardMaterial( {
          color: 0xbfe7ff,
          emissive: 0x1b4760,
          transparent: true,
          opacity: 0.86,
          roughness: 0.26,
          metalness: 0.12,
        } ),
      );
      arrow.position.fromArray( arrowConfig.position );
      arrow.rotation.set( arrowConfig.rotation[ 0 ], arrowConfig.rotation[ 1 ], arrowConfig.rotation[ 2 ] );

    } );

    const globeHandleInteraction = createInteractiveTrackedMesh(
      staticObjects,
      globeHandleRoot,
      new THREE.CylinderGeometry( globe.handleInteractiveRadius, globe.handleInteractiveRadius, 0.14, 48 ),
      new THREE.MeshBasicMaterial( {
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      } ),
      {
        onSelectStart( payload ) {

          if ( context.getInteractionPolicy?.()?.canInteract === false ) {

            return;

          }

          const startPoint = resolveGlobeHandlePoint( payload.rayOrigin, payload.rayDirection );

          if ( startPoint === null ) {

            return;

          }

          activeGlobeMove = {
            source: payload.source,
            startAnchorPosition: globeRoot.position.clone(),
            dragOffsetX: globeRoot.position.x - startPoint.x,
            dragOffsetZ: globeRoot.position.z - startPoint.z,
            hasMoved: false,
          };
          clearHoverState();

        },
        onSelectMove( payload ) {

          if ( activeGlobeMove?.source !== payload.source ) {

            return;

          }

          const nextPoint = resolveGlobeHandlePoint( payload.rayOrigin, payload.rayDirection );

          if ( nextPoint === null ) {

            return;

          }

          const nextAnchorPosition = normalizeDemo2GlobeAnchorPosition(
            [
              nextPoint.x + activeGlobeMove.dragOffsetX,
              defaultGlobeAnchorPosition[ 1 ],
              nextPoint.z + activeGlobeMove.dragOffsetZ,
            ],
            defaultGlobeAnchorPosition,
          );

          tempGlobeAnchorPosition.fromArray( nextAnchorPosition );

          if ( tempGlobeAnchorPosition.distanceTo( globeRoot.position ) <= 0.005 ) {

            return;

          }

          activeGlobeMove.hasMoved = true;
          currentSceneState.globeAnchorPosition = nextAnchorPosition;
          applyGlobeAnchorPosition();
          recordGlobeAnchorIfNeeded( `${payload.source}-globe-handle-drag` );

        },
        onSelectEnd( payload ) {

          if ( activeGlobeMove?.source !== payload.source ) {

            return;

          }

          const shouldFlush = activeGlobeMove.hasMoved === true;
          activeGlobeMove = null;

          if ( shouldFlush ) {

            recordGlobeAnchorIfNeeded( `${payload.source}-globe-handle-drag-end`, {
              force: true,
              flushImmediately: getSceneStateLoggingConfig().flushOnGlobeMoveEnd === true,
            } );

          }

        },
      },
    );
    globeHandleInteraction.position.set( 0, handleLocalFloorY + 0.07, 0 );
    globeHandleInteraction.renderOrder = 1;

    const focusHalo = createTrackedMesh(
      staticObjects,
      globeNodeRoot,
      new THREE.SphereGeometry( globe.nodeBaseRadius * 2.6, 18, 18 ),
      new THREE.MeshBasicMaterial( {
        color: globe.focusHaloColor,
        transparent: true,
        opacity: globe.haloOpacity,
        wireframe: true,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    const selectedNodeHalo = createTrackedMesh(
      staticObjects,
      globeNodeRoot,
      new THREE.SphereGeometry( globe.nodeBaseRadius * 2.2, 18, 18 ),
      new THREE.MeshBasicMaterial( {
        color: globe.selectedNodeHaloColor,
        transparent: true,
        opacity: globe.haloOpacity,
        wireframe: true,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    const hoverNodeHalo = createTrackedMesh(
      staticObjects,
      globeNodeRoot,
      new THREE.SphereGeometry( globe.nodeBaseRadius * 2.2, 18, 18 ),
      new THREE.MeshBasicMaterial( {
        color: globe.hoverHaloColor,
        transparent: true,
        opacity: globe.haloOpacity,
        wireframe: true,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    focusHalo.visible = false;
    selectedNodeHalo.visible = false;
    hoverNodeHalo.visible = false;

    const tooltip = createTrackedTextSprite(
      staticObjects,
      globeYawRoot,
      { ...labelStyles.tooltip, text: '' },
      new THREE.Vector3( 0, globe.radius + 0.15, 0 ),
    );
    tooltip.sprite.visible = false;

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || {};

    }

    function getDemo2LoggingTuning() {

      return context.getLoggingConfig?.()?.demo2 || {};

    }

    function getStableSceneLabel( key ) {

      return getDemo2LoggingTuning().stableLabels?.[ key ] || key;

    }

    function recordSceneChange( labelKey, source, {
      flushImmediately = false,
    } = {} ) {

      return context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( labelKey ),
        flushImmediately,
      } ) === true;

    }

    function getCurrentTask() {

      return getDemo2Task( currentSceneState.taskId );

    }

    function getFocusedNode() {

      return dataset?.nodeById.get( currentSceneState.focusedCountryId ) || null;

    }

    function getSelectedNode() {

      return dataset?.nodeById.get( currentSceneState.selectedNodeId ) || null;

    }

    function getSelectedFlow() {

      if ( ! dataset || ! currentSceneState.selectedFlowId ) {

        return null;

      }

      return dataset.flowList.find( ( flow ) => flow.flowId === currentSceneState.selectedFlowId ) || null;

    }

    function getCurrentPanelSceneState() {

      return panelShell.getPanelSceneState();

    }

    function commitPanelTransformToSceneState( panelPosition, panelQuaternion ) {

      currentSceneState.panelPosition = normalizeDemo2PanelPosition( panelPosition, null );
      currentSceneState.panelQuaternion = normalizeDemo2PanelQuaternion( panelQuaternion, null );

      return {
        panelPosition: currentSceneState.panelPosition,
        panelQuaternion: currentSceneState.panelQuaternion,
      };

    }

    function commitCurrentPanelTransformToSceneState() {

      const nextPanelState = getCurrentPanelSceneState();
      return commitPanelTransformToSceneState( nextPanelState.panelPosition, nextPanelState.panelQuaternion );

    }

    function rememberPanelTransformAsLogged( panelState ) {

      if ( ! panelState?.panelPosition || ! panelState?.panelQuaternion ) {

        return;

      }

      lastLoggedPanelPosition.fromArray( panelState.panelPosition );
      lastLoggedPanelQuaternion.fromArray( panelState.panelQuaternion );

    }

    function rememberGlobeYawAsLogged( globeYawDeg, timestamp = performance.now() ) {

      lastLoggedGlobeYawDeg = normalizeAngleDegrees( globeYawDeg );
      lastGlobeYawLogAt = timestamp;

    }

    function applyGlobeAnchorPosition() {

      currentSceneState.globeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
        currentSceneState.globeAnchorPosition,
        defaultGlobeAnchorPosition,
      );
      globeRoot.position.fromArray( currentSceneState.globeAnchorPosition );

    }

    function rememberGlobeAnchorAsLogged( globeAnchorPosition, timestamp = performance.now() ) {

      lastLoggedGlobeAnchorPosition.fromArray(
        normalizeDemo2GlobeAnchorPosition( globeAnchorPosition, defaultGlobeAnchorPosition ),
      );
      lastGlobeAnchorLogAt = timestamp;

    }

    function resolveGlobeDragAzimuth( rayOrigin, rayDirection ) {

      globeRoot.getWorldPosition( tempGlobeWorldCenter );
      globeInteractionSphere.center.copy( tempGlobeWorldCenter );
      tempGlobeRay.origin.copy( rayOrigin );
      tempGlobeRay.direction.copy( rayDirection ).normalize();

      if ( tempGlobeRay.intersectSphere( globeInteractionSphere, tempGlobeWorldHit ) === null ) {

        return null;

      }

      tempGlobeLocalHit.copy( tempGlobeWorldHit );
      globeRoot.worldToLocal( tempGlobeLocalHit );

      if ( ( tempGlobeLocalHit.x * tempGlobeLocalHit.x ) + ( tempGlobeLocalHit.z * tempGlobeLocalHit.z ) <= 1e-4 ) {

        return null;

      }

      return THREE.MathUtils.radToDeg( Math.atan2( tempGlobeLocalHit.x, tempGlobeLocalHit.z ) );

    }

    function resolveGlobeHandlePoint( rayOrigin, rayDirection ) {

      tempGlobeRay.origin.copy( rayOrigin );
      tempGlobeRay.direction.copy( rayDirection ).normalize();

      if ( tempGlobeRay.intersectPlane( globeHandleDragPlane, tempGlobeHandleHit ) === null ) {

        return null;

      }

      return tempGlobeHandleHit;

    }

    function recordGlobeYawIfNeeded( source = 'scene-globe-drag', {
      force = false,
      flushImmediately = false,
    } = {} ) {

      const loggingConfig = getSceneStateLoggingConfig();
      const yawEpsilonDeg = 0.1;
      const yawChanged = getAngleDifferenceDegrees(
        currentSceneState.globeYawDeg,
        lastLoggedGlobeYawDeg,
      ) > yawEpsilonDeg;

      if ( ! yawChanged ) {

        return false;

      }

      const now = performance.now();

      if ( ! force && ( now - lastGlobeYawLogAt ) < Math.max( 0, loggingConfig.minIntervalMs ?? 0 ) ) {

        return false;

      }

      const didLog = recordSceneChange( 'rotateGlobe', source, { flushImmediately } );

      if ( didLog ) {

        rememberGlobeYawAsLogged( currentSceneState.globeYawDeg, now );

      }

      return didLog;

    }

    function recordGlobeAnchorIfNeeded( source = 'scene-globe-handle-drag', {
      force = false,
      flushImmediately = false,
    } = {} ) {

      const loggingConfig = getSceneStateLoggingConfig();
      tempGlobeAnchorPosition.fromArray(
        normalizeDemo2GlobeAnchorPosition( currentSceneState.globeAnchorPosition, defaultGlobeAnchorPosition ),
      );
      const anchorChanged = tempGlobeAnchorPosition.distanceTo( lastLoggedGlobeAnchorPosition ) > Math.max(
        0.001,
        loggingConfig.positionEpsilon ?? 0.04,
      );

      if ( ! anchorChanged ) {

        return false;

      }

      const now = performance.now();

      if ( ! force && ( now - lastGlobeAnchorLogAt ) < Math.max( 0, loggingConfig.minIntervalMs ?? 0 ) ) {

        return false;

      }

      const didLog = recordSceneChange( 'moveGlobe', source, { flushImmediately } );

      if ( didLog ) {

        rememberGlobeAnchorAsLogged( tempGlobeAnchorPosition.toArray(), now );

      }

      return didLog;

    }

    function maybeLogPanelTransform( source = 'panel-drag-end', {
      flushImmediately = false,
    } = {} ) {

      const nextState = getCurrentPanelSceneState();

      if (
        lastLoggedPanelPosition.distanceTo( new THREE.Vector3().fromArray( nextState.panelPosition ) ) <= getSceneStateLoggingConfig().positionEpsilon &&
        2 * Math.acos( Math.min( 1, Math.max( - 1, Math.abs( lastLoggedPanelQuaternion.dot( new THREE.Quaternion().fromArray( nextState.panelQuaternion ) ) ) ) ) ) * 180 / Math.PI <= getSceneStateLoggingConfig().quaternionAngleThresholdDeg
      ) {

        return false;

      }

      const committedState = commitCurrentPanelTransformToSceneState();
      const didLog = recordSceneChange( 'movePanel', source, { flushImmediately } );

      if ( didLog ) {

        rememberPanelTransformAsLogged( committedState );

      }

      return didLog;

    }

    function applyGlobeYaw() {

      globeYawRoot.rotation.y = THREE.MathUtils.degToRad( currentSceneState.globeYawDeg );

    }

    function resetDesktopCameraView() {

      if ( context.getPresentationMode?.() !== PRESENTATION_MODES.DESKTOP ) {

        return;

      }

      context.camera.position.copy( defaultDesktopCameraPosition );
      context.camera.lookAt( defaultDesktopLookAt );

    }

    function nextInteractionSequence() {

      interactionSequence += 1;
      return interactionSequence;

    }

    function clearNodeSelectionOwnership() {

      selectedNodeSource = null;
      selectedNodeSelectionSequence = - 1;

    }

    function clearFlowSelectionOwnership() {

      selectedFlowSource = null;
      selectedFlowSelectionSequence = - 1;

    }

    function resetSelectionOwnershipTracking() {

      clearNodeSelectionOwnership();
      clearFlowSelectionOwnership();

    }

    function resolveSelectionSource( source ) {

      if ( typeof source !== 'string' ) {

        return null;

      }

      const normalizedSource = source.trim();
      return normalizedSource.length > 0 ? normalizedSource : null;

    }

    function resolveLatestHoverEntry( map, kind, activeSelection = null ) {

      let nextEntry = null;
      let nextSequence = - 1;

      map.forEach( ( entry, source ) => {

        const nextSource = entry?.source || source;
        const candidate = {
          id: entry?.id || null,
          kind,
          source: nextSource,
          sequence: entry?.sequence ?? - 1,
        };

        if ( ! candidate.id ) {

          return;

        }

        const isSelectionBlockingHover = activeSelection
          && activeSelection.source !== null
          && activeSelection.sequence >= 0;
        // Once live selection ownership is known, only a newer hover from that
        // same source can temporarily override the selected tooltip.
        const isEligible = ! isSelectionBlockingHover
          || (
            candidate.source === activeSelection.source
            && candidate.sequence > activeSelection.sequence
          );

        if ( ! isEligible || candidate.sequence <= nextSequence ) {

          return;

        }

        nextSequence = candidate.sequence;
        nextEntry = candidate;

      } );

      return nextEntry;

    }

    function getActiveSelectionOwnership() {

      if ( currentSceneState.selectedFlowId ) {

        return {
          kind: 'flow',
          id: currentSceneState.selectedFlowId,
          source: selectedFlowSource,
          sequence: selectedFlowSelectionSequence,
        };

      }

      if ( currentSceneState.selectedNodeId ) {

        return {
          kind: 'node',
          id: currentSceneState.selectedNodeId,
          source: selectedNodeSource,
          sequence: selectedNodeSelectionSequence,
        };

      }

      return null;

    }

    function clearHoverEntriesForSource( source ) {

      if ( typeof source !== 'string' || source.length === 0 ) {

        return false;

      }

      const deletedNodeHover = nodeHoverBySource.delete( source );
      const deletedFlowHover = flowHoverBySource.delete( source );
      return deletedNodeHover || deletedFlowHover;

    }

    function resolveHoverState() {

      const activeSelection = getActiveSelectionOwnership();
      const hoveredNodeEntry = resolveLatestHoverEntry( nodeHoverBySource, 'node', activeSelection );
      const hoveredFlowEntry = resolveLatestHoverEntry( flowHoverBySource, 'flow', activeSelection );

      currentHoveredEntry = hoveredNodeEntry;

      if ( hoveredFlowEntry && ( ! currentHoveredEntry || hoveredFlowEntry.sequence > currentHoveredEntry.sequence ) ) {

        currentHoveredEntry = hoveredFlowEntry;

      }

      currentHoveredNodeId = currentHoveredEntry?.kind === 'node' ? currentHoveredEntry.id : null;
      currentHoveredFlowId = currentHoveredEntry?.kind === 'flow' ? currentHoveredEntry.id : null;

    }

    function updateHoverMap( map, source, id, isHovered ) {

      if ( isHovered ) {

        const sequence = nextInteractionSequence();
        map.set( source, {
          id,
          source,
          sequence,
        } );

      } else {

        const entry = map.get( source );

        if ( entry?.id === id ) {

          map.delete( source );

        }

      }

      resolveHoverState();
      updateHighlightsAndTooltip();

    }

    function clearHoverState() {

      nodeHoverBySource.clear();
      flowHoverBySource.clear();
      resolveHoverState();
      updateHighlightsAndTooltip();

    }

    function resolveNodeColorHex( node ) {

      return new THREE.Color( palettes.regions[ node.region ] || palettes.regions.Other ).getHex();

    }

    function getDefaultStatusText() {

      if ( loadStatus === 'loading' ) {

        return 'Loading local migration bundle...';

      }

      if ( loadStatus === 'error' ) {

        return 'Local bundle missing.';

      }

      if ( currentSceneState.visibleFlowCount === 0 ) {

        return 'No visible routes for this filter.';

      }

      return 'Select a route, then submit.';

    }

    function getPanelBodyText() {

      if ( loadStatus === 'loading' ) {

        return 'Loading local migration bundle...';

      }

      if ( loadStatus === 'error' ) {

        return `${loadError?.message || 'Demo 2 could not load its local migration bundle.'}\nExpected: demo2Nodes.json, demo2Flows.csv,\nworld-atlas-countries-110m.json.`;

      }

      return 'Drag the globe to rotate or reposition.\nSelect a node, then choose a route.';

    }

    function getSelectedFlowAnswerLabel() {

      const selectedFlow = getSelectedFlow();

      return selectedFlow
        ? `${selectedFlow.label} (${selectedFlow.year})`
        : null;

    }

    function createBoundaryGeometryFromTopology( topology ) {

      const countriesObject = topology?.objects?.countries;

      if ( ! countriesObject ) {

        return null;

      }

      const boundaryMesh = buildTopojsonMesh( topology, countriesObject );
      const lineCoordinates = boundaryMesh?.type === 'LineString'
        ? [ boundaryMesh.coordinates ]
        : boundaryMesh?.coordinates;

      if ( ! Array.isArray( lineCoordinates ) || lineCoordinates.length === 0 ) {

        return null;

      }

      const positions = [];
      const boundaryRadius = globe.radius + globe.boundaryLift;

      lineCoordinates.forEach( ( line ) => {

        if ( ! Array.isArray( line ) || line.length < 2 ) {

          return;

        }

        for ( let index = 1; index < line.length; index += 1 ) {

          appendSurfaceSegmentPositions(
            positions,
            line[ index - 1 ],
            line[ index ],
            boundaryRadius,
          );

        }

      } );

      if ( positions.length === 0 ) {

        return null;

      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
      return geometry;

    }

    function ensureBoundaryLines() {

      if ( currentBoundaryLines || ! dataset?.boundaryTopology ) {

        return;

      }

      const geometry = createBoundaryGeometryFromTopology( dataset.boundaryTopology );

      if ( ! geometry ) {

        return;

      }

      currentBoundaryLines = createTrackedLineSegments(
        staticObjects,
        globeBoundaryRoot,
        geometry,
        new THREE.LineBasicMaterial( {
          color: globe.boundaryColor,
          linewidth: globe.boundaryLineWidthFallback,
          transparent: true,
          opacity: globe.boundaryOpacity,
          depthWrite: false,
          toneMapped: false,
        } ),
      );
      currentBoundaryLines.renderOrder = 3;
      currentBoundaryLines.frustumCulled = false;

    }

    const panelShell = createFloatingOrbitPanelShell( context, {
      panelRoot: xrPanelRoot,
      namePrefix: 'demo2-panel',
      width: xrPanel.width,
      height: xrPanel.height,
      titleBarHeight: xrPanel.titleBarHeight,
      titleBarY: xrPanel.titleY,
      dragSurfaceHeight: xrPanel.dragSurfaceHeight,
      backgroundColor: xrPanel.backgroundColor,
      backgroundEmissive: xrPanel.backgroundEmissive,
      backgroundOpacity: xrPanel.backgroundOpacity,
      bodyInsetColor: xrPanel.bodyInsetColor,
      bodyInsetOpacity: xrPanel.bodyInsetOpacity,
      edgeColor: xrPanel.edgeColor,
      edgeOpacity: xrPanel.edgeOpacity,
      edgeMode: 'line',
      titleBarColor: xrPanel.titleBarColor,
      titleBarEmissive: xrPanel.titleBarEmissive,
      surfacePanelZ: xrPanel.surfacePanelZ,
      surfaceDragZ: xrPanel.surfaceDragZ,
      panelInitialOffset: xrPanel.panelInitialOffset,
      panelInitialYawDeg: xrPanel.panelInitialYawDeg,
      orbitCenterMode: xrPanel.orbitCenterMode,
      followCameraHeight: xrPanel.followCameraHeight,
      heightFollowOffset: xrPanel.heightFollowOffset,
      minPanelHeight: xrPanel.minPanelHeight,
      maxPanelHeight: xrPanel.maxPanelHeight,
      heightSmoothing: xrPanel.heightSmoothing,
      onDragMove() {

        commitCurrentPanelTransformToSceneState();
        updateXrPanelVisualState();

      },
      onDragEnd( payload ) {

        commitCurrentPanelTransformToSceneState();
        maybeLogPanelTransform( `${payload?.source || 'scene'}-panel-drag-end`, {
          flushImmediately: getSceneStateLoggingConfig().flushOnPanelDragEnd === true,
        } );
        updateXrPanelVisualState();

      },
    } );
    const panelBackground = panelShell.meshes.background;
    const panelBorder = panelShell.meshes.edge;
    const titleBarMesh = panelShell.meshes.titleBar;
    const panelTitle = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelTitle, text: 'Demo 2 Migration Globe' },
      new THREE.Vector3( 0, xrPanel.titleY, xrPanel.contentZ ),
    );
    const panelBodyText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelBody, text: 'Drag the globe to rotate.\nSelect a node to refocus, then choose a route.' },
      new THREE.Vector3( 0, xrPanel.bodyTopY, xrPanel.contentZ ),
    );
    const panelMetaText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelMeta, text: 'Loading data...' },
      new THREE.Vector3( 0, xrPanel.metaY, xrPanel.contentZ ),
    );
    const panelSelectionText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelSelection, text: 'Focus Afghanistan\nNo route yet' },
      new THREE.Vector3( 0, xrPanel.selectionY, xrPanel.contentZ ),
    );
    const panelFooterText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelStatus, text: 'Loading local migration bundle...' },
      new THREE.Vector3( 0, xrPanel.footerY, xrPanel.contentZ ),
    );

    function updateXrPanelVisualState() {

      const isButtonHovered = [ ...xrButtons.values() ].some( ( button ) => button.hoverSources.size > 0 );
      const isPanelHovered = panelShell.isPanelHovered() || panelShell.isTitleBarHovered() || isButtonHovered;
      const isDragAffordanceActive = panelShell.isTitleBarHovered() || panelShell.isDragging();

      panelBackground.material.emissive.setHex( isPanelHovered ? 0x0d1a28 : xrPanel.backgroundEmissive );
      panelBorder.material.color.setHex(
        panelShell.isDragging()
          ? xrPanel.dragAccentColor
          : ( isDragAffordanceActive ? xrPanel.hoverAccentColor : xrPanel.edgeColor ),
      );
      panelBorder.material.opacity = panelShell.isDragging() ? 0.32 : ( isPanelHovered ? 0.24 : xrPanel.edgeOpacity );
      titleBarMesh.material.emissive.setHex(
        isDragAffordanceActive ? xrPanel.titleBarHoverEmissive : xrPanel.titleBarEmissive,
      );

    }

    function syncXrButtonVisuals() {

      xrButtons.forEach( ( button ) => {

        const isHovered = button.hoverSources.size > 0;
        const isDisabled = button.disabled === true;
        button.mesh.material.color.setHex( isDisabled ? xrPanel.buttonDisabledColor : xrPanel.buttonColor );
        button.mesh.material.emissive.setHex(
          isDisabled
            ? xrPanel.buttonDisabledEmissive
            : ( isHovered ? xrPanel.buttonHoverEmissive : xrPanel.buttonEmissive ),
        );
        button.text.setText( button.label );

      } );

      updateXrPanelVisualState();

    }

    function createXrButton( key, {
      label,
      position,
      onPress,
    } ) {

      const mesh = createTrackedMesh(
        staticObjects,
        xrPanelRoot,
        new THREE.BoxGeometry( xrPanel.buttonWidth, xrPanel.buttonHeight, 0.03 ),
        new THREE.MeshStandardMaterial( {
          color: xrPanel.buttonColor,
          emissive: xrPanel.buttonEmissive,
          roughness: 0.72,
          metalness: 0.06,
        } ),
      );
      mesh.position.set( position.x, position.y, xrPanel.contentZ + 0.012 );
      const text = createTrackedTextPlane(
        staticObjects,
        xrPanelRoot,
        { ...labelStyles.panelButton, text: label },
        new THREE.Vector3( position.x, position.y, xrPanel.contentZ + 0.03 ),
      );
      const button = {
        key,
        label,
        mesh,
        text,
        hoverSources: new Set(),
        disabled: false,
      };

      uiSurfaces.push( createSceneUiSurface( context, {
        parent: xrPanelRoot,
        width: xrPanel.buttonWidth,
        height: xrPanel.buttonHeight,
        position: [ position.x, position.y, xrPanel.contentZ + 0.045 ],
        name: `demo2-xr-button-${key}`,
        handlers: {
          onHoverChange( payload ) {

            if ( payload.isHovered ) {

              button.hoverSources.add( payload.source );

            } else {

              button.hoverSources.delete( payload.source );

            }

            syncXrButtonVisuals();

          },
          onSelectStart( payload ) {

            if ( button.disabled === true || context.getInteractionPolicy?.()?.canInteract === false ) {

              return;

            }

            onPress?.( payload.source );

          },
        },
      } ) );

      xrButtons.set( key, button );
    }

    function buildXrPanelButtons() {

      const rowOffset = xrPanel.buttonWidth + xrPanel.buttonGap;

      createXrButton( 'year-prev', {
        label: buildButtonLabel( 'Year', '-' ),
        position: new THREE.Vector3( - rowOffset, xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          shiftYear( - 1, source );

        },
      } );
      createXrButton( 'year-next', {
        label: buildButtonLabel( 'Year', '+' ),
        position: new THREE.Vector3( 0, xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          shiftYear( 1, source );

        },
      } );
      createXrButton( 'direction', {
        label: buildButtonLabel( 'Mode', 'Outbound' ),
        position: new THREE.Vector3( rowOffset, xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          cycleDirectionMode( source );

        },
      } );
      createXrButton( 'threshold-prev', {
        label: buildButtonLabel( 'Flow', '-' ),
        position: new THREE.Vector3( - rowOffset, xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          shiftThreshold( - 1, source );

        },
      } );
      createXrButton( 'threshold-next', {
        label: buildButtonLabel( 'Flow', '+' ),
        position: new THREE.Vector3( 0, xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          shiftThreshold( 1, source );

        },
      } );
      createXrButton( 'labels', {
        label: buildButtonLabel( 'Labels', 'On' ),
        position: new THREE.Vector3( rowOffset, xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          toggleLabels( source );

        },
      } );
      createXrButton( 'reset-filters', {
        label: buildButtonLabel( 'Reset', 'Filters' ),
        position: new THREE.Vector3( - rowOffset, xrPanel.buttonRow3Y, 0 ),
        onPress( source ) {

          resetFilters( source );

        },
      } );
      createXrButton( 'reset-view', {
        label: buildButtonLabel( 'Reset', 'View' ),
        position: new THREE.Vector3( 0, xrPanel.buttonRow3Y, 0 ),
        onPress( source ) {

          resetView( source );

        },
      } );
      createXrButton( 'submit', {
        label: buildButtonLabel( 'Task', 'Submit' ),
        position: new THREE.Vector3( rowOffset, xrPanel.buttonRow3Y, 0 ),
        onPress( source ) {

          submitTask( source );

        },
      } );

    }

    function updateNodeVisuals( tooltipState = null ) {

      if ( ! dataset ) {

        return;

      }

      const stockDomain = dataset.stockDomainByYear.get( currentSceneState.geoYear ) || { min: 1, max: 1 };
      const focusedCountryId = currentSceneState.focusedCountryId;
      const selectedNodeId = currentSceneState.selectedNodeId;
      const hoveredNodeId = currentHoveredNodeId;
      const labelsEnabled = currentSceneState.labelsVisible === true;
      const isTooltipActive = labelsEnabled && tooltipState?.visible === true;
      const suppressedNodeId = tooltipState?.suppressedNodeId || null;
      const tooltipAnchor = tooltipState?.anchor || null;
      const tooltipSuppressionRadius = globe.tooltipLabelSuppressionRadius ?? 0.22;
      const tooltipSuppressedOpacity = globe.tooltipSuppressedOpacity ?? 0.08;

      dataset.nodeList.forEach( ( node ) => {

        const entry = nodeEntriesById.get( node.id );

        if ( ! entry ) {

          return;

        }

        const stockValue = Number.parseFloat( node.stockByYear?.[ String( currentSceneState.geoYear ) ] ) || 0;
        const normalizedAlpha = stockDomain.max > stockDomain.min
          ? THREE.MathUtils.clamp( ( Math.sqrt( stockValue ) - Math.sqrt( stockDomain.min ) ) / ( Math.sqrt( stockDomain.max ) - Math.sqrt( stockDomain.min ) ), 0, 1 )
          : 0.5;
        const radiusScale = THREE.MathUtils.lerp( globe.nodeMinScale, globe.nodeMaxScale, normalizedAlpha );

        entry.currentRadius = globe.nodeBaseRadius * radiusScale;
        entry.mesh.scale.setScalar( radiusScale );
        entry.mesh.material.color.setHex( resolveNodeColorHex( node ) );
        entry.mesh.material.emissive.setHex(
          node.id === hoveredNodeId
            ? globe.nodeHoverEmissive
            : globe.nodeEmissive,
        );
        let labelVisible = labelsEnabled;
        let labelOpacity = node.id === focusedCountryId || node.id === selectedNodeId ? 1 : 0.84;

        if ( labelVisible && isTooltipActive ) {

          if ( suppressedNodeId === node.id ) {

            labelVisible = false;

          } else if ( tooltipAnchor && entry.label.sprite.position.distanceTo( tooltipAnchor ) <= tooltipSuppressionRadius ) {

            labelOpacity = Math.min( labelOpacity, tooltipSuppressedOpacity );

          }

        }

        entry.label.sprite.visible = labelVisible;
        entry.label.sprite.material.opacity = labelOpacity;
        entry.label.sprite.material.needsUpdate = true;

      } );

      const focusedEntry = focusedCountryId ? nodeEntriesById.get( focusedCountryId ) : null;
      const selectedEntry = selectedNodeId ? nodeEntriesById.get( selectedNodeId ) : null;
      const hoveredEntry = hoveredNodeId ? nodeEntriesById.get( hoveredNodeId ) : null;

      focusHalo.visible = Boolean( focusedEntry );
      selectedNodeHalo.visible = Boolean( selectedEntry );
      hoverNodeHalo.visible = Boolean( hoveredEntry );

      if ( focusedEntry ) {

        focusHalo.position.copy( focusedEntry.mesh.position );
        focusHalo.scale.setScalar( Math.max( 1.2, focusedEntry.currentRadius / globe.nodeBaseRadius ) );

      }

      if ( selectedEntry ) {

        selectedNodeHalo.position.copy( selectedEntry.mesh.position );
        selectedNodeHalo.scale.setScalar( Math.max( 1.05, selectedEntry.currentRadius / globe.nodeBaseRadius ) );

      }

      if ( hoveredEntry ) {

        hoverNodeHalo.position.copy( hoveredEntry.mesh.position );
        hoverNodeHalo.scale.setScalar( Math.max( 1.05, hoveredEntry.currentRadius / globe.nodeBaseRadius ) );

      }

    }

    function clearVisibleFlowMeshes() {

      currentVisibleFlowEntries = [];
      currentFlowEntryById = new Map();
      clearTrackedCollection( dynamicObjects );

    }

    function getVisibleFlows() {

      if ( ! dataset ) {

        return [];

      }

      const focusedCountryId = currentSceneState.focusedCountryId || dataset.defaultFocusedCountryId;
      const flowsForYear = dataset.flowListByYear.get( currentSceneState.geoYear ) || [];

      return flowsForYear.filter( ( flow ) => {

        if ( flow.value < currentSceneState.minFlowThreshold ) {

          return false;

        }

        if ( currentSceneState.flowDirectionMode === DEMO2_DIRECTION_MODES.ALL ) {

          return flow.originId === focusedCountryId || flow.destinationId === focusedCountryId;

        }

        if ( currentSceneState.flowDirectionMode === DEMO2_DIRECTION_MODES.INBOUND ) {

          return flow.destinationId === focusedCountryId;

        }

        return flow.originId === focusedCountryId;

      } );

    }

    function rebuildVisibleFlows() {

      clearVisibleFlowMeshes();
      currentVisibleFlows = getVisibleFlows()
        .slice()
        .sort( ( flowA, flowB ) => flowA.value - flowB.value );
      currentSceneState.visibleFlowCount = currentVisibleFlows.length;

      currentVisibleFlows.forEach( ( flow ) => {

        const originEntry = nodeEntriesById.get( flow.originId );
        const destinationEntry = nodeEntriesById.get( flow.destinationId );

        if ( ! originEntry || ! destinationEntry ) {

          return;

        }

        const curve = new THREE.CatmullRomCurve3(
          createArcPoints(
            originEntry.mesh.position,
            destinationEntry.mesh.position,
            globe.radius + globe.nodeLift,
            globe.arcHeight,
            globe.arcSegments,
          ),
        );
        const radiusAlpha = dataset.maxFlowValue > 0
          ? Math.sqrt( flow.value / dataset.maxFlowValue )
          : 0.5;
        const tubeRadius = THREE.MathUtils.lerp( globe.arcRadiusMin, globe.arcRadiusMax, radiusAlpha );
        const mesh = createInteractiveTrackedMesh(
          dynamicObjects,
          globeArcRoot,
          new THREE.TubeGeometry( curve, globe.arcSegments, tubeRadius, 8, false ),
          new THREE.MeshBasicMaterial( {
            color: globe.arcColor,
            transparent: true,
            opacity: globe.arcOpacity,
            depthWrite: false,
            toneMapped: false,
          } ),
          {
            onHoverChange( payload ) {

              updateHoverMap( flowHoverBySource, payload.source, flow.flowId, payload.isHovered );

            },
            onSelectStart( payload ) {

              if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                return;

              }

              setSelectedFlowId( flow.flowId, {
                source: payload.source,
                shouldLog: true,
              } );

            },
          },
        );
        mesh.renderOrder = 4;
        const midpoint = curve.getPoint( 0.5 );
        const entry = {
          flow,
          mesh,
          midpoint,
        };
        currentVisibleFlowEntries.push( entry );
        currentFlowEntryById.set( flow.flowId, entry );

      } );

    }

    function updateFlowVisuals() {

      currentVisibleFlowEntries.forEach( ( entry ) => {

        const isSelected = entry.flow.flowId === currentSceneState.selectedFlowId;
        const isHovered = entry.flow.flowId === currentHoveredFlowId;
        const color = isSelected
          ? globe.arcSelectedColor
          : ( isHovered ? globe.arcHoverColor : globe.arcColor );
        const opacity = isSelected
          ? globe.arcSelectedOpacity
          : ( isHovered ? globe.arcHoverOpacity : globe.arcOpacity );

        entry.mesh.material.color.setHex( color );
        entry.mesh.material.opacity = opacity;
        entry.mesh.renderOrder = isSelected ? 8 : ( isHovered ? 7 : 4 );

      } );

    }

    function updateHighlightsAndTooltip() {

      const hoveredFlowEntry = currentHoveredFlowId ? currentFlowEntryById.get( currentHoveredFlowId ) : null;
      const selectedFlowEntry = currentSceneState.selectedFlowId ? currentFlowEntryById.get( currentSceneState.selectedFlowId ) : null;
      const hoveredNodeEntry = currentHoveredNodeId ? nodeEntriesById.get( currentHoveredNodeId ) : null;
      const selectedNodeEntry = currentSceneState.selectedNodeId ? nodeEntriesById.get( currentSceneState.selectedNodeId ) : null;
      const tooltipState = {
        visible: false,
        text: '',
        anchor: tempTooltipAnchor,
        suppressedNodeId: null,
      };

      if ( hoveredFlowEntry ) {

        tooltipState.visible = true;
        tooltipState.text = `${hoveredFlowEntry.flow.label}\n${hoveredFlowEntry.flow.year} | ${formatFlowValue( hoveredFlowEntry.flow.value )}`;
        tooltipState.anchor.copy( hoveredFlowEntry.midpoint ).normalize().multiplyScalar( hoveredFlowEntry.midpoint.length() + globe.tooltipForwardOffset );

      } else if ( hoveredNodeEntry ) {

        const stockValue = Number.parseFloat( hoveredNodeEntry.node.stockByYear?.[ String( currentSceneState.geoYear ) ] ) || 0;
        tooltipState.visible = true;
        tooltipState.text = `${hoveredNodeEntry.node.name}\nImmigrant stock ${formatFlowValue( stockValue )} | ${hoveredNodeEntry.node.region}`;
        tooltipState.anchor.copy( hoveredNodeEntry.label.sprite.position );
        tooltipState.suppressedNodeId = hoveredNodeEntry.node.id;

      } else if ( selectedFlowEntry ) {

        tooltipState.visible = true;
        tooltipState.text = `${selectedFlowEntry.flow.label}\nSelected route | ${formatFlowValue( selectedFlowEntry.flow.value )}`;
        tooltipState.anchor.copy( selectedFlowEntry.midpoint ).normalize().multiplyScalar( selectedFlowEntry.midpoint.length() + globe.tooltipForwardOffset );

      } else if ( selectedNodeEntry ) {

        const stockValue = Number.parseFloat( selectedNodeEntry.node.stockByYear?.[ String( currentSceneState.geoYear ) ] ) || 0;
        tooltipState.visible = true;
        tooltipState.text = `${selectedNodeEntry.node.name}\nSelected focus | ${formatFlowValue( stockValue )} stock`;
        tooltipState.anchor.copy( selectedNodeEntry.label.sprite.position );
        tooltipState.suppressedNodeId = selectedNodeEntry.node.id;

      }

      updateNodeVisuals( tooltipState );
      updateFlowVisuals();

      if ( tooltipState.visible ) {

        tooltip.setText( tooltipState.text );
        tooltip.sprite.position.copy( tooltipState.anchor );
        tooltip.sprite.visible = true;
        return;

      }

      tooltip.sprite.visible = false;

    }

    function normalizeCurrentSceneState() {

      currentSceneState = normalizeDemo2SceneState(
        currentSceneState,
        defaultSceneState,
        {
          supportedYears: dataset?.supportedYears || null,
          defaultYear: dataset?.initialYear || DEMO2_DEFAULT_YEAR,
          defaultTaskId: DEMO2_DEFAULT_TASK_ID,
          defaultFocusedCountryId: dataset?.defaultFocusedCountryId || DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
        },
      );

      if ( dataset && ! dataset.nodeById.has( currentSceneState.focusedCountryId ) ) {

        currentSceneState.focusedCountryId = dataset.defaultFocusedCountryId;

      }

      if ( dataset && currentSceneState.selectedNodeId && ! dataset.nodeById.has( currentSceneState.selectedNodeId ) ) {

        currentSceneState.selectedNodeId = null;
        clearNodeSelectionOwnership();

      }

      const visibleFlowIds = new Set( getVisibleFlows().map( ( flow ) => flow.flowId ) );

      if ( currentSceneState.selectedFlowId && ! visibleFlowIds.has( currentSceneState.selectedFlowId ) ) {

        currentSceneState.selectedFlowId = null;
        currentSceneState.taskAnswer = null;
        currentSceneState.taskSubmitted = false;
        clearFlowSelectionOwnership();

      }

      currentSceneState.visibleFlowCount = visibleFlowIds.size;
      currentSceneState.globeYawDeg = normalizeAngleDegrees( currentSceneState.globeYawDeg );
      currentSceneState.globeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
        currentSceneState.globeAnchorPosition,
        defaultGlobeAnchorPosition,
      );

    }

    function syncDataDrivenScene() {

      normalizeCurrentSceneState();
      applyGlobeAnchorPosition();
      applyGlobeYaw();
      ensureBoundaryLines();

      if ( dataset && nodeEntriesById.size === 0 ) {

        dataset.nodeList.forEach( ( node ) => {

          const surfacePosition = latLonToVector3( node.lat, node.lon, globe.radius + globe.nodeLift );
          const labelPosition = surfacePosition.clone().normalize().multiplyScalar( globe.radius + globe.nodeLift + globe.labelLift );
          const mesh = createInteractiveTrackedMesh(
            staticObjects,
            globeNodeRoot,
            new THREE.SphereGeometry( globe.nodeBaseRadius, 18, 18 ),
            new THREE.MeshStandardMaterial( {
              color: resolveNodeColorHex( node ),
              emissive: globe.nodeEmissive,
              roughness: 0.38,
              metalness: 0.06,
            } ),
            {
              onHoverChange( payload ) {

                updateHoverMap( nodeHoverBySource, payload.source, node.id, payload.isHovered );

              },
              onSelectStart( payload ) {

                if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                  return;

                }

                focusCountry( node.id, {
                  source: payload.source,
                  shouldLog: true,
                } );

              },
            },
          );
          mesh.position.copy( surfacePosition );
          const label = createTrackedTextSprite(
            staticObjects,
            globeLabelRoot,
            { ...labelStyles.nodeLabel, text: node.name },
            labelPosition,
          );
          nodeEntriesById.set( node.id, {
            node,
            mesh,
            label,
            currentRadius: globe.nodeBaseRadius,
          } );

        } );

      }

      rebuildVisibleFlows();
      updateHighlightsAndTooltip();

    }

    function getCurrentSceneStateSnapshot() {

      return {
        demoId: currentSceneState.demoId,
        taskId: currentSceneState.taskId,
        geoYear: currentSceneState.geoYear,
        flowDirectionMode: currentSceneState.flowDirectionMode,
        minFlowThreshold: currentSceneState.minFlowThreshold,
        focusedCountryId: currentSceneState.focusedCountryId,
        selectedNodeId: currentSceneState.selectedNodeId,
        selectedFlowId: currentSceneState.selectedFlowId,
        labelsVisible: currentSceneState.labelsVisible,
        visibleFlowCount: currentSceneState.visibleFlowCount,
        globeYawDeg: currentSceneState.globeYawDeg,
        globeAnchorPosition: normalizeDemo2GlobeAnchorPosition(
          currentSceneState.globeAnchorPosition,
          defaultGlobeAnchorPosition,
        ),
        taskAnswer: currentSceneState.taskAnswer,
        taskSubmitted: currentSceneState.taskSubmitted,
        panelPosition: normalizeDemo2PanelPosition( currentSceneState.panelPosition, null ),
        panelQuaternion: normalizeDemo2PanelQuaternion( currentSceneState.panelQuaternion, null ),
      };

    }

    function getAnswerSummary() {

      return {
        xrDemoId: currentSceneState.demoId,
        xrTaskId: currentSceneState.taskId,
        xrGeoYear: currentSceneState.geoYear,
        xrGeoDirectionMode: currentSceneState.flowDirectionMode,
        xrGeoThreshold: currentSceneState.minFlowThreshold,
        xrGeoFocusedCountryId: currentSceneState.focusedCountryId,
        xrGeoSelectedNodeId: currentSceneState.selectedNodeId,
        xrGeoSelectedFlowId: currentSceneState.selectedFlowId,
        xrGeoVisibleFlowCount: currentSceneState.visibleFlowCount,
        xrGeoLabelsVisible: currentSceneState.labelsVisible,
        xrGeoGlobeYawDeg: currentSceneState.globeYawDeg,
      };

    }

    function focusCountry( countryId, {
      source = 'scene-focus',
      shouldLog = true,
    } = {} ) {

      if ( ! dataset?.nodeById.has( countryId ) ) {

        return;

      }

      const changed = currentSceneState.focusedCountryId !== countryId || currentSceneState.selectedNodeId !== countryId;
      const selectionSource = resolveSelectionSource( source );
      const selectionSequence = nextInteractionSequence();

      currentSceneState.focusedCountryId = countryId;
      currentSceneState.selectedNodeId = countryId;
      currentSceneState.selectedFlowId = null;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      selectedNodeSource = selectionSource;
      selectedNodeSelectionSequence = selectionSequence;
      clearFlowSelectionOwnership();
      clearHoverEntriesForSource( source );
      resolveHoverState();
      syncDataDrivenScene();
      syncAllUi();

      if ( changed && shouldLog ) {

        recordSceneChange( 'focusCountry', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnFocusChange === true,
        } );

      }

    }

    function setSelectedFlowId( flowId, {
      source = 'scene-selection',
      shouldLog = true,
    } = {} ) {

      const nextFlow = currentVisibleFlows.find( ( flow ) => flow.flowId === flowId ) || null;
      const changed = currentSceneState.selectedFlowId !== nextFlow?.flowId;

      if ( ! nextFlow ) {

        return;

      }

      const selectionSource = resolveSelectionSource( source );
      const selectionSequence = nextInteractionSequence();
      currentSceneState.selectedFlowId = nextFlow.flowId;
      currentSceneState.taskAnswer = nextFlow.flowId;
      currentSceneState.taskSubmitted = false;
      selectedFlowSource = selectionSource;
      selectedFlowSelectionSequence = selectionSequence;
      clearHoverEntriesForSource( source );
      resolveHoverState();
      updateHighlightsAndTooltip();
      syncAllUi();

      if ( changed && shouldLog ) {

        recordSceneChange( 'selection', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnSelectionChange === true,
        } );

      }

    }

    function setYear( nextYear, {
      source = 'scene-year',
      shouldLog = true,
    } = {} ) {

      if ( ! dataset ) {

        return;

      }

      const supportedYears = dataset.supportedYears;

      if ( ! supportedYears.includes( nextYear ) || nextYear === currentSceneState.geoYear ) {

        return;

      }

      currentSceneState.geoYear = nextYear;
      currentSceneState.selectedFlowId = null;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      clearFlowSelectionOwnership();
      syncDataDrivenScene();
      syncAllUi();

      if ( shouldLog ) {

        recordSceneChange( 'year', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnYearChange === true,
        } );

      }

    }

    function shiftYear( delta, source ) {

      if ( ! dataset ) {

        return;

      }

      const currentIndex = dataset.supportedYears.indexOf( currentSceneState.geoYear );

      if ( currentIndex < 0 ) {

        return;

      }

      const nextIndex = THREE.MathUtils.clamp( currentIndex + delta, 0, dataset.supportedYears.length - 1 );
      setYear( dataset.supportedYears[ nextIndex ], {
        source,
        shouldLog: true,
      } );

    }

    function setThreshold( threshold, {
      source = 'scene-threshold',
      shouldLog = true,
    } = {} ) {

      if ( ! DEMO2_THRESHOLD_PRESETS.includes( threshold ) || threshold === currentSceneState.minFlowThreshold ) {

        return;

      }

      currentSceneState.minFlowThreshold = threshold;
      currentSceneState.selectedFlowId = null;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      clearFlowSelectionOwnership();
      syncDataDrivenScene();
      syncAllUi();

      if ( shouldLog ) {

        recordSceneChange( 'threshold', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnThresholdChange === true,
        } );

      }

    }

    function shiftThreshold( delta, source ) {

      const currentIndex = DEMO2_THRESHOLD_PRESETS.indexOf( currentSceneState.minFlowThreshold );
      const nextIndex = THREE.MathUtils.clamp( currentIndex + delta, 0, DEMO2_THRESHOLD_PRESETS.length - 1 );
      setThreshold( DEMO2_THRESHOLD_PRESETS[ nextIndex ], {
        source,
        shouldLog: true,
      } );

    }

    function setDirectionMode( directionMode, {
      source = 'scene-direction',
      shouldLog = true,
    } = {} ) {

      if ( directionMode !== DEMO2_DIRECTION_MODES.ALL && directionMode !== DEMO2_DIRECTION_MODES.OUTBOUND && directionMode !== DEMO2_DIRECTION_MODES.INBOUND ) {

        return;

      }

      if ( directionMode === currentSceneState.flowDirectionMode ) {

        return;

      }

      currentSceneState.flowDirectionMode = directionMode;
      currentSceneState.selectedFlowId = null;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      clearFlowSelectionOwnership();
      syncDataDrivenScene();
      syncAllUi();

      if ( shouldLog ) {

        recordSceneChange( 'directionMode', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnDirectionModeChange === true,
        } );

      }

    }

    function cycleDirectionMode( source = 'scene-direction-cycle' ) {

      const modes = [
        DEMO2_DIRECTION_MODES.ALL,
        DEMO2_DIRECTION_MODES.OUTBOUND,
        DEMO2_DIRECTION_MODES.INBOUND,
      ];
      const currentIndex = modes.indexOf( currentSceneState.flowDirectionMode );
      const nextMode = modes[ ( currentIndex + 1 ) % modes.length ];

      setDirectionMode( nextMode, {
        source,
        shouldLog: true,
      } );

    }

    function toggleLabels( source = 'scene-label-toggle' ) {

      currentSceneState.labelsVisible = ! currentSceneState.labelsVisible;
      updateHighlightsAndTooltip();
      syncAllUi();
      recordSceneChange( 'labels', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnLabelsToggle === true,
      } );

    }

    function resetView( source = 'scene-reset-view' ) {

      currentSceneState.globeYawDeg = DEMO2_DEFAULT_GLOBE_YAW_DEG;
      currentSceneState.globeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
        defaultGlobeAnchorPosition,
        defaultGlobeAnchorPosition,
      );
      applyGlobeAnchorPosition();
      applyGlobeYaw();
      updateHighlightsAndTooltip();
      syncAllUi();
      resetDesktopCameraView();
      const didLog = recordSceneChange( 'resetView', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnResetView === true,
      } );

      if ( didLog ) {

        rememberGlobeYawAsLogged( currentSceneState.globeYawDeg );
        rememberGlobeAnchorAsLogged( currentSceneState.globeAnchorPosition );

      }

    }

    function resetFilters( source = 'scene-reset-filters' ) {

      currentSceneState.geoYear = dataset?.initialYear || DEMO2_DEFAULT_YEAR;
      currentSceneState.minFlowThreshold = DEMO2_DEFAULT_THRESHOLD;
      currentSceneState.flowDirectionMode = DEMO2_DIRECTION_MODES.OUTBOUND;
      currentSceneState.focusedCountryId = dataset?.defaultFocusedCountryId || DEMO2_DEFAULT_FOCUSED_COUNTRY_ID;
      currentSceneState.selectedNodeId = currentSceneState.focusedCountryId;
      currentSceneState.selectedFlowId = null;
      currentSceneState.labelsVisible = true;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      resetSelectionOwnershipTracking();
      syncDataDrivenScene();
      syncAllUi();
      recordSceneChange( 'resetFilters', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnResetFilters === true,
      } );

    }

    function submitTask( source = 'scene-submit' ) {

      if ( ! currentSceneState.selectedFlowId ) {

        return;

      }

      currentSceneState.taskAnswer = currentSceneState.selectedFlowId;
      currentSceneState.taskSubmitted = true;
      syncAllUi();
      recordSceneChange( 'taskSubmit', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnTaskSubmit === true,
      } );

    }

    function buildDesktopPanel() {

      const node = document.createElement( 'section' );
      node.setAttribute( 'style', desktopPanel.root );
      node.appendChild( createStyledElement( 'p', desktopPanel.eyebrow, 'reVISit-XR Demo 2' ) );
      node.appendChild( createStyledElement( 'h2', desktopPanel.title, 'Migration Globe Baseline' ) );
      node.appendChild( createStyledElement( 'p', desktopPanel.body, 'A local Afghanistan-centered migration globe with direct globe dragging, floor-handle repositioning, semantic provenance, reactive answers, and replay hydration.' ) );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Task' ) );
      desktopRefs.taskValue = createStyledElement( 'p', desktopPanel.detail, 'Loading Demo 2 task...' );
      node.appendChild( desktopRefs.taskValue );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Filters' ) );
      desktopRefs.metaValue = createStyledElement( 'p', desktopPanel.value, 'Loading data...' );
      node.appendChild( desktopRefs.metaValue );

      const rowYear = document.createElement( 'div' );
      rowYear.setAttribute( 'style', desktopPanel.buttonRow );
      desktopRefs.yearPrevButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Year -' );
      desktopRefs.yearNextButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Year +' );
      desktopRefs.yearPrevButton.addEventListener( 'click', () => shiftYear( - 1, 'desktop-year-prev' ) );
      desktopRefs.yearNextButton.addEventListener( 'click', () => shiftYear( 1, 'desktop-year-next' ) );
      rowYear.appendChild( desktopRefs.yearPrevButton );
      rowYear.appendChild( desktopRefs.yearNextButton );
      node.appendChild( rowYear );

      const rowThreshold = document.createElement( 'div' );
      rowThreshold.setAttribute( 'style', desktopPanel.buttonRow );
      desktopRefs.thresholdPrevButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Threshold -' );
      desktopRefs.thresholdNextButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Threshold +' );
      desktopRefs.thresholdPrevButton.addEventListener( 'click', () => shiftThreshold( - 1, 'desktop-threshold-prev' ) );
      desktopRefs.thresholdNextButton.addEventListener( 'click', () => shiftThreshold( 1, 'desktop-threshold-next' ) );
      rowThreshold.appendChild( desktopRefs.thresholdPrevButton );
      rowThreshold.appendChild( desktopRefs.thresholdNextButton );
      node.appendChild( rowThreshold );

      const rowMode = document.createElement( 'div' );
      rowMode.setAttribute( 'style', desktopPanel.buttonRow );
      desktopRefs.directionButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Mode: Outbound' );
      desktopRefs.labelsButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Labels: On' );
      desktopRefs.directionButton.addEventListener( 'click', () => cycleDirectionMode( 'desktop-direction-button' ) );
      desktopRefs.labelsButton.addEventListener( 'click', () => toggleLabels( 'desktop-labels-button' ) );
      rowMode.appendChild( desktopRefs.directionButton );
      rowMode.appendChild( desktopRefs.labelsButton );
      node.appendChild( rowMode );

      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'View' ) );
      const rowView = document.createElement( 'div' );
      rowView.setAttribute( 'style', desktopPanel.buttonRow );
      desktopRefs.resetFiltersButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Reset Filters' );
      desktopRefs.resetViewButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Reset View' );
      desktopRefs.resetFiltersButton.addEventListener( 'click', () => resetFilters( 'desktop-reset-filters' ) );
      desktopRefs.resetViewButton.addEventListener( 'click', () => resetView( 'desktop-reset-view' ) );
      rowView.appendChild( desktopRefs.resetFiltersButton );
      rowView.appendChild( desktopRefs.resetViewButton );
      node.appendChild( rowView );

      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Focus' ) );
      desktopRefs.focusValue = createStyledElement( 'p', desktopPanel.detail, 'Focus Afghanistan' );
      node.appendChild( desktopRefs.focusValue );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Selection' ) );
      desktopRefs.selectionValue = createStyledElement( 'p', desktopPanel.detail, 'No route selected yet.' );
      node.appendChild( desktopRefs.selectionValue );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Status' ) );
      desktopRefs.statusValue = createStyledElement( 'p', desktopPanel.status, 'Loading local migration bundle...' );
      node.appendChild( desktopRefs.statusValue );
      desktopRefs.submitButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Submit Current Route' );
      desktopRefs.submitButton.addEventListener( 'click', () => submitTask( 'desktop-submit-button' ) );
      node.appendChild( desktopRefs.submitButton );

      context.setDesktopPanelNode( node );

    }

    function syncDesktopPanel() {

      if ( ! desktopRefs.taskValue ) {

        return;

      }

      const task = getCurrentTask();
      const focusedNode = getFocusedNode();
      const selectedNode = getSelectedNode();
      const selectedFlow = getSelectedFlow();
      const isReady = loadStatus === 'ready';
      const canInteract = context.getInteractionPolicy?.()?.canInteract !== false;
      const controlsEnabled = isReady && canInteract;

      desktopRefs.taskValue.textContent = `${task.prompt} ${task.hint}`;
      desktopRefs.metaValue.textContent = isReady
        ? `Year ${currentSceneState.geoYear} | ${formatDirectionMode( currentSceneState.flowDirectionMode )} | ${formatThreshold( currentSceneState.minFlowThreshold )} | ${currentSceneState.visibleFlowCount} visible`
        : 'Loading local migration bundle...';
      desktopRefs.focusValue.textContent = focusedNode
        ? `Focus ${focusedNode.name} | Labels ${currentSceneState.labelsVisible ? 'On' : 'Off'} | Yaw ${Math.round( currentSceneState.globeYawDeg )}\u00b0`
        : 'Focus Afghanistan';
      desktopRefs.selectionValue.textContent = selectedFlow
        ? `${selectedFlow.label} | ${selectedFlow.year} | ${formatFlowValue( selectedFlow.value )}`
        : (
          selectedNode
            ? `Focused node: ${selectedNode.name}`
            : 'No route selected yet.'
        );
      desktopRefs.statusValue.textContent = loadStatus === 'error'
        ? loadError?.message || 'Demo 2 could not load its local migration bundle.'
        : (
          currentSceneState.taskSubmitted
            ? `Submitted answer:\n${getSelectedFlowAnswerLabel() || currentSceneState.taskAnswer}`
            : getDefaultStatusText()
        );

      [
        desktopRefs.yearPrevButton,
        desktopRefs.yearNextButton,
        desktopRefs.thresholdPrevButton,
        desktopRefs.thresholdNextButton,
        desktopRefs.directionButton,
        desktopRefs.labelsButton,
        desktopRefs.resetFiltersButton,
        desktopRefs.resetViewButton,
      ].forEach( ( button ) => {

        button.disabled = ! controlsEnabled;
        button.setAttribute( 'style', getButtonStyle( desktopPanel, controlsEnabled ) );

      } );

      desktopRefs.directionButton.textContent = `Mode: ${formatDirectionMode( currentSceneState.flowDirectionMode )}`;
      desktopRefs.labelsButton.textContent = `Labels: ${currentSceneState.labelsVisible ? 'On' : 'Off'}`;
      desktopRefs.submitButton.disabled = ! controlsEnabled || ! selectedFlow;
      desktopRefs.submitButton.textContent = selectedFlow ? 'Submit Current Route' : 'Pick Route First';
      desktopRefs.submitButton.setAttribute( 'style', getButtonStyle( desktopPanel, controlsEnabled && Boolean( selectedFlow ) ) );

    }

    function syncXrPanel() {

      const task = getCurrentTask();
      const focusedNode = getFocusedNode();
      const selectedFlow = getSelectedFlow();
      const isReady = loadStatus === 'ready';
      const canInteract = context.getInteractionPolicy?.()?.canInteract !== false;
      const controlsEnabled = isReady && canInteract;
      const compactMode = formatDirectionMode( currentSceneState.flowDirectionMode ).toLowerCase();
      const compactThreshold = formatCompactThreshold( currentSceneState.minFlowThreshold );
      const visibleRouteLabel = `${currentSceneState.visibleFlowCount} ${currentSceneState.visibleFlowCount === 1 ? 'route' : 'routes'}`;

      panelTitle.setText?.( 'Demo 2 Migration Globe' );
      panelBodyText.setText( getPanelBodyText() );
      panelMetaText.setText(
        isReady
          ? `${currentSceneState.geoYear} | ${compactMode} | ${compactThreshold} | ${visibleRouteLabel}`
          : 'Loading data...',
      );
      panelSelectionText.setText(
        selectedFlow
          ? `Focus ${truncateLabel( focusedNode?.name || 'Afghanistan', 14 )}\nRoute ${truncateLabel( selectedFlow.destinationName, 14 )}`
          : `Focus ${truncateLabel( focusedNode?.name || 'Afghanistan', 14 )}\nNo route yet`,
      );
      panelFooterText.setText(
        loadStatus === 'error'
          ? 'Local bundle missing.'
          : (
            currentSceneState.taskSubmitted
              ? `Submitted:\n${getSelectedFlowAnswerLabel() || currentSceneState.taskAnswer}`
              : getDefaultStatusText()
          ),
      );

      xrButtons.get( 'year-prev' ).disabled = ! controlsEnabled;
      xrButtons.get( 'year-prev' ).label = buildButtonLabel( 'Year', '-' );
      xrButtons.get( 'year-next' ).disabled = ! controlsEnabled;
      xrButtons.get( 'year-next' ).label = buildButtonLabel( 'Year', '+' );
      xrButtons.get( 'direction' ).disabled = ! controlsEnabled;
      xrButtons.get( 'direction' ).label = buildButtonLabel( 'Mode', formatDirectionMode( currentSceneState.flowDirectionMode ) );
      xrButtons.get( 'threshold-prev' ).disabled = ! controlsEnabled;
      xrButtons.get( 'threshold-prev' ).label = buildButtonLabel( 'Flow', '-' );
      xrButtons.get( 'threshold-next' ).disabled = ! controlsEnabled;
      xrButtons.get( 'threshold-next' ).label = buildButtonLabel( 'Flow', '+' );
      xrButtons.get( 'labels' ).disabled = ! controlsEnabled;
      xrButtons.get( 'labels' ).label = buildButtonLabel( 'Labels', currentSceneState.labelsVisible ? 'On' : 'Off' );
      xrButtons.get( 'reset-filters' ).disabled = ! controlsEnabled;
      xrButtons.get( 'reset-filters' ).label = buildButtonLabel( 'Reset', 'Filters' );
      xrButtons.get( 'reset-view' ).disabled = ! controlsEnabled;
      xrButtons.get( 'reset-view' ).label = buildButtonLabel( 'Reset', 'View' );
      xrButtons.get( 'submit' ).disabled = ! controlsEnabled || ! selectedFlow;
      xrButtons.get( 'submit' ).label = buildButtonLabel( 'Task', selectedFlow ? 'Submit' : 'Pick Route' );

      syncXrButtonVisuals();

    }

    function syncAllUi() {

      syncDesktopPanel();
      syncXrPanel();

    }

    function applySceneState( sceneState, {
      source = 'scene-state',
      useExactPanelTransform = false,
      forceDefaultPanel = false,
    } = {} ) {

      if ( source === 'replay-scene' ) {

        clearHoverState();
        resetSelectionOwnershipTracking();
        activeGlobeDrag = null;
        activeGlobeMove = null;

      }

      currentSceneState = normalizeDemo2SceneState(
        sceneState,
        currentSceneState,
        {
          supportedYears: dataset?.supportedYears || null,
          defaultYear: dataset?.initialYear || DEMO2_DEFAULT_YEAR,
          defaultTaskId: DEMO2_DEFAULT_TASK_ID,
          defaultFocusedCountryId: dataset?.defaultFocusedCountryId || DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
        },
      );

      const nextPanelPosition = normalizeDemo2PanelPosition( currentSceneState.panelPosition, null );
      const nextPanelQuaternion = normalizeDemo2PanelQuaternion( currentSceneState.panelQuaternion, null );

      if ( nextPanelPosition && nextPanelQuaternion ) {

        const appliedPanelState = panelShell.applyPanelTransform(
          nextPanelPosition,
          nextPanelQuaternion,
          { useExactTransform: useExactPanelTransform },
        );
        const committedPanelState = commitPanelTransformToSceneState(
          appliedPanelState.panelPosition,
          appliedPanelState.panelQuaternion,
        );
        rememberPanelTransformAsLogged( committedPanelState );

      } else if ( forceDefaultPanel === true || ( context.getPresentationMode?.() !== PRESENTATION_MODES.DESKTOP && ! panelShell.hasPlacementInitialized() ) ) {

        const defaultPanelState = panelShell.placeAtDefault();
        const committedPanelState = commitPanelTransformToSceneState(
          defaultPanelState.panelPosition,
          defaultPanelState.panelQuaternion,
        );
        rememberPanelTransformAsLogged( committedPanelState );

      }

      syncDataDrivenScene();
      rememberGlobeYawAsLogged( currentSceneState.globeYawDeg );
      rememberGlobeAnchorAsLogged( currentSceneState.globeAnchorPosition );
      syncAllUi();

    }

    function ensureXrPanelPlacement( {
      forceDefault = false,
      useExactTransform = false,
    } = {} ) {

      const nextPanelPosition = normalizeDemo2PanelPosition( currentSceneState.panelPosition, null );
      const nextPanelQuaternion = normalizeDemo2PanelQuaternion( currentSceneState.panelQuaternion, null );
      const nextPanelState = panelShell.ensurePlacement( {
        panelPosition: nextPanelPosition,
        panelQuaternion: nextPanelQuaternion,
        forceDefault,
        useExactTransform,
      } );

      if ( ! nextPanelState ) {

        return;

      }

      if ( nextPanelPosition && nextPanelQuaternion ) {

        rememberPanelTransformAsLogged( {
          panelPosition: nextPanelPosition,
          panelQuaternion: nextPanelQuaternion,
        } );
        return;

      }

      const committedPanelState = commitPanelTransformToSceneState(
        nextPanelState.panelPosition,
        nextPanelState.panelQuaternion,
      );
      rememberPanelTransformAsLogged( committedPanelState );

    }

    buildDesktopPanel();
    buildXrPanelButtons();
    syncAllUi();

    return {
      activate() {

        context.sceneContentRoot.add( root );
        xrPanelRoot.visible = context.getPresentationMode?.() !== PRESENTATION_MODES.DESKTOP;
        resetDesktopCameraView();

        loadDemo2Dataset()
          .then( ( loadedDataset ) => {

            dataset = loadedDataset;
            loadStatus = 'ready';
            loadError = null;
            const task = getCurrentTask();

            if ( task?.defaultFocusedCountryId ) {

              currentSceneState.focusedCountryId = task.defaultFocusedCountryId;

            }

            currentSceneState.selectedNodeId = currentSceneState.focusedCountryId;
            applySceneState( currentSceneState, {
              source: 'dataset-ready',
              forceDefaultPanel: true,
            } );

          } )
          .catch( ( error ) => {

            loadStatus = 'error';
            loadError = error;
            syncAllUi();

          } );

      },
      dispose() {

        clearHoverState();
        resetSelectionOwnershipTracking();
        clearVisibleFlowMeshes();
        clearTrackedCollection( uiSurfaces );
        clearTrackedCollection( staticObjects );
        root.removeFromParent();
        context.clearDesktopPanel();

      },
      update( deltaSeconds ) {

        panelShell.updateRuntimePlacement( { deltaSeconds } );

      },
      getSceneStateForReplay() {

        return getCurrentSceneStateSnapshot();

      },
      applySceneStateFromReplay( sceneState ) {

        applySceneState( sceneState, {
          source: 'replay-scene',
          useExactPanelTransform: true,
          forceDefaultPanel: true,
        } );

      },
      getAnswerSummary() {

        return getAnswerSummary();

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

          return {
            title: 'Demo 2 - Migration Globe',
            body: 'Inspect Afghanistan-centered migration routes on a globe, select a route, and submit a semantic answer for replay.',
            note: 'Replay restores year, threshold, direction mode, focus, route selection, label state, globe yaw, and task submission.',
          };

        }

        return {
          title: 'Demo 2 - Migration Globe',
          body: 'Use the desktop panel to filter an immersive migration globe baseline built for study embedding and semantic replay.',
          note: 'VR and desktop are the primary paper-facing modes for Demo 2.',
        };

      },
      onPresentationModeChange( presentationMode ) {

        xrPanelRoot.visible = presentationMode !== PRESENTATION_MODES.DESKTOP;
        clearHoverState();
        resetSelectionOwnershipTracking();
        xrButtons.forEach( ( button ) => button.hoverSources.clear() );

        if ( presentationMode !== PRESENTATION_MODES.DESKTOP ) {

          ensureXrPanelPlacement();

        }

        syncAllUi();

      },
    };

  },
} );
