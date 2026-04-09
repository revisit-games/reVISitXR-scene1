import * as THREE from 'three';
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
  DEMO2_GLOBE_YAW_STEP_DEG,
  DEMO2_THRESHOLD_PRESETS,
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
    const lastLoggedPanelPosition = new THREE.Vector3();
    const lastLoggedPanelQuaternion = new THREE.Quaternion();
    const tempTooltipPosition = new THREE.Vector3();
    let hoverSequence = 0;
    let dataset = null;
    let loadStatus = 'loading';
    let loadError = null;
    let currentSceneState = { ...defaultSceneState };
    let currentHoveredNodeId = null;
    let currentHoveredFlowId = null;
    let currentVisibleFlows = [];
    let currentVisibleFlowEntries = [];
    let currentFlowEntryById = new Map();

    root.add( globeRoot );
    root.add( xrPanelRoot );
    globeRoot.position.fromArray( globe.rootPosition );
    globeRoot.add( globeYawRoot );
    globeYawRoot.add( globeArcRoot );
    globeYawRoot.add( globeNodeRoot );
    globeYawRoot.add( globeLabelRoot );

    const defaultDesktopCameraPosition = new THREE.Vector3( 0, 1.46, 0.12 );
    const defaultDesktopLookAt = new THREE.Vector3( 0, globe.rootPosition[ 1 ], globe.rootPosition[ 2 ] );

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

    function resolveHoverId( map ) {

      let nextId = null;
      let nextSequence = - 1;

      map.forEach( ( entry ) => {

        if ( entry.sequence > nextSequence ) {

          nextSequence = entry.sequence;
          nextId = entry.id;

        }

      } );

      return nextId;

    }

    function resolveHoverState() {

      currentHoveredNodeId = resolveHoverId( nodeHoverBySource );
      currentHoveredFlowId = resolveHoverId( flowHoverBySource );

    }

    function updateHoverMap( map, source, id, isHovered ) {

      if ( isHovered ) {

        hoverSequence += 1;
        map.set( source, {
          id,
          sequence: hoverSequence,
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

      const focusedNode = getFocusedNode();

      if ( loadStatus === 'loading' ) {

        return 'Loading local migration bundle...';

      }

      if ( loadStatus === 'error' ) {

        return loadError?.message || 'Demo 2 could not load its local migration bundle.';

      }

      if ( currentSceneState.visibleFlowCount === 0 ) {

        return `${focusedNode?.name || 'Current focus'} has no visible routes for ${formatDirectionMode( currentSceneState.flowDirectionMode ).toLowerCase()} mode at ${formatThreshold( currentSceneState.minFlowThreshold )}.`;

      }

      return 'Select a node to refocus the globe, then select a route and submit your answer.';

    }

    function getSelectedFlowAnswerLabel() {

      const selectedFlow = getSelectedFlow();

      return selectedFlow
        ? `${selectedFlow.label} (${selectedFlow.year})`
        : null;

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
      { ...labelStyles.panelBody, text: 'Loading Demo 2 task...' },
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
      { ...labelStyles.panelSelection, text: 'Focus Afghanistan\nNo route selected' },
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
      const halfOffset = rowOffset * 0.5;

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
      createXrButton( 'rotate-left', {
        label: buildButtonLabel( 'Globe', 'Left' ),
        position: new THREE.Vector3( - rowOffset, xrPanel.buttonRow3Y, 0 ),
        onPress( source ) {

          rotateGlobe( - DEMO2_GLOBE_YAW_STEP_DEG, { source, shouldLog: true } );

        },
      } );
      createXrButton( 'rotate-right', {
        label: buildButtonLabel( 'Globe', 'Right' ),
        position: new THREE.Vector3( 0, xrPanel.buttonRow3Y, 0 ),
        onPress( source ) {

          rotateGlobe( DEMO2_GLOBE_YAW_STEP_DEG, { source, shouldLog: true } );

        },
      } );
      createXrButton( 'reset-filters', {
        label: buildButtonLabel( 'Reset', 'Filters' ),
        position: new THREE.Vector3( rowOffset, xrPanel.buttonRow3Y, 0 ),
        onPress( source ) {

          resetFilters( source );

        },
      } );
      createXrButton( 'reset-view', {
        label: buildButtonLabel( 'Reset', 'View' ),
        position: new THREE.Vector3( - halfOffset, xrPanel.buttonRow4Y, 0 ),
        onPress( source ) {

          resetView( source );

        },
      } );
      createXrButton( 'submit', {
        label: buildButtonLabel( 'Task', 'Submit' ),
        position: new THREE.Vector3( halfOffset, xrPanel.buttonRow4Y, 0 ),
        onPress( source ) {

          submitTask( source );

        },
      } );

    }

    function updateNodeVisuals() {

      if ( ! dataset ) {

        return;

      }

      const stockDomain = dataset.stockDomainByYear.get( currentSceneState.geoYear ) || { min: 1, max: 1 };
      const focusedCountryId = currentSceneState.focusedCountryId;
      const selectedNodeId = currentSceneState.selectedNodeId;
      const hoveredNodeId = currentHoveredNodeId;

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
        entry.label.sprite.visible = currentSceneState.labelsVisible === true;
        entry.label.sprite.material.opacity = node.id === focusedCountryId || node.id === selectedNodeId ? 1 : 0.84;

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

      updateNodeVisuals();
      updateFlowVisuals();

      const hoveredFlowEntry = currentHoveredFlowId ? currentFlowEntryById.get( currentHoveredFlowId ) : null;
      const selectedFlowEntry = currentSceneState.selectedFlowId ? currentFlowEntryById.get( currentSceneState.selectedFlowId ) : null;
      const hoveredNodeEntry = currentHoveredNodeId ? nodeEntriesById.get( currentHoveredNodeId ) : null;
      const selectedNodeEntry = currentSceneState.selectedNodeId ? nodeEntriesById.get( currentSceneState.selectedNodeId ) : null;

      if ( hoveredFlowEntry ) {

        tooltip.setText(
          `${hoveredFlowEntry.flow.label}\n${hoveredFlowEntry.flow.year} | ${formatFlowValue( hoveredFlowEntry.flow.value )}`,
        );
        tempTooltipPosition.copy( hoveredFlowEntry.midpoint ).normalize().multiplyScalar( hoveredFlowEntry.midpoint.length() + globe.tooltipForwardOffset );
        tooltip.sprite.position.copy( tempTooltipPosition );
        tooltip.sprite.visible = true;
        return;

      }

      if ( hoveredNodeEntry ) {

        const stockValue = Number.parseFloat( hoveredNodeEntry.node.stockByYear?.[ String( currentSceneState.geoYear ) ] ) || 0;
        tooltip.setText(
          `${hoveredNodeEntry.node.name}\nImmigrant stock ${formatFlowValue( stockValue )} | ${hoveredNodeEntry.node.region}`,
        );
        tooltip.sprite.position.copy( hoveredNodeEntry.label.sprite.position );
        tooltip.sprite.visible = true;
        return;

      }

      if ( selectedFlowEntry ) {

        tooltip.setText(
          `${selectedFlowEntry.flow.label}\nSelected route | ${formatFlowValue( selectedFlowEntry.flow.value )}`,
        );
        tempTooltipPosition.copy( selectedFlowEntry.midpoint ).normalize().multiplyScalar( selectedFlowEntry.midpoint.length() + globe.tooltipForwardOffset );
        tooltip.sprite.position.copy( tempTooltipPosition );
        tooltip.sprite.visible = true;
        return;

      }

      if ( selectedNodeEntry ) {

        const stockValue = Number.parseFloat( selectedNodeEntry.node.stockByYear?.[ String( currentSceneState.geoYear ) ] ) || 0;
        tooltip.setText(
          `${selectedNodeEntry.node.name}\nSelected focus | ${formatFlowValue( stockValue )} stock`,
        );
        tooltip.sprite.position.copy( selectedNodeEntry.label.sprite.position );
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

      }

      const visibleFlowIds = new Set( getVisibleFlows().map( ( flow ) => flow.flowId ) );

      if ( currentSceneState.selectedFlowId && ! visibleFlowIds.has( currentSceneState.selectedFlowId ) ) {

        currentSceneState.selectedFlowId = null;
        currentSceneState.taskAnswer = null;
        currentSceneState.taskSubmitted = false;

      }

      currentSceneState.visibleFlowCount = visibleFlowIds.size;
      currentSceneState.globeYawDeg = normalizeAngleDegrees( currentSceneState.globeYawDeg );

    }

    function syncDataDrivenScene() {

      normalizeCurrentSceneState();
      applyGlobeYaw();

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

      currentSceneState.focusedCountryId = countryId;
      currentSceneState.selectedNodeId = countryId;
      currentSceneState.selectedFlowId = null;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
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

      if ( ! nextFlow || currentSceneState.selectedFlowId === nextFlow.flowId ) {

        return;

      }

      currentSceneState.selectedFlowId = nextFlow.flowId;
      currentSceneState.taskAnswer = nextFlow.flowId;
      currentSceneState.taskSubmitted = false;
      updateHighlightsAndTooltip();
      syncAllUi();

      if ( shouldLog ) {

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

    function rotateGlobe( deltaDegrees, {
      source = 'scene-globe-rotate',
      shouldLog = true,
    } = {} ) {

      if ( ! isFiniteNumber( deltaDegrees ) || deltaDegrees === 0 ) {

        return;

      }

      currentSceneState.globeYawDeg = normalizeAngleDegrees( currentSceneState.globeYawDeg + deltaDegrees );
      applyGlobeYaw();
      updateHighlightsAndTooltip();
      syncAllUi();

      if ( shouldLog ) {

        recordSceneChange( 'rotateGlobe', source, {
          flushImmediately: true,
        } );

      }

    }

    function resetView( source = 'scene-reset-view' ) {

      currentSceneState.globeYawDeg = DEMO2_DEFAULT_GLOBE_YAW_DEG;
      applyGlobeYaw();
      updateHighlightsAndTooltip();
      syncAllUi();
      resetDesktopCameraView();
      recordSceneChange( 'resetView', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnResetView === true,
      } );

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
      node.appendChild( createStyledElement( 'p', desktopPanel.body, 'A local Afghanistan-centered migration globe with semantic provenance, reactive answers, and replay hydration.' ) );
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
      desktopRefs.rotateLeftButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Rotate Left' );
      desktopRefs.rotateRightButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Rotate Right' );
      desktopRefs.resetFiltersButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Reset Filters' );
      desktopRefs.resetViewButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Reset View' );
      desktopRefs.rotateLeftButton.addEventListener( 'click', () => rotateGlobe( - DEMO2_GLOBE_YAW_STEP_DEG, { source: 'desktop-rotate-left', shouldLog: true } ) );
      desktopRefs.rotateRightButton.addEventListener( 'click', () => rotateGlobe( DEMO2_GLOBE_YAW_STEP_DEG, { source: 'desktop-rotate-right', shouldLog: true } ) );
      desktopRefs.resetFiltersButton.addEventListener( 'click', () => resetFilters( 'desktop-reset-filters' ) );
      desktopRefs.resetViewButton.addEventListener( 'click', () => resetView( 'desktop-reset-view' ) );
      rowView.appendChild( desktopRefs.rotateLeftButton );
      rowView.appendChild( desktopRefs.rotateRightButton );
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
        desktopRefs.rotateLeftButton,
        desktopRefs.rotateRightButton,
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

      panelTitle.setText?.( 'Demo 2 Migration Globe' );
      panelBodyText.setText( `${task.prompt}\n${task.hint}` );
      panelMetaText.setText(
        isReady
          ? `${currentSceneState.geoYear} | ${formatDirectionMode( currentSceneState.flowDirectionMode ).toLowerCase()} | ${formatThreshold( currentSceneState.minFlowThreshold )} | ${currentSceneState.visibleFlowCount} visible`
          : 'Loading data...',
      );
      panelSelectionText.setText(
        selectedFlow
          ? `Focus ${truncateLabel( focusedNode?.name || 'Afghanistan', 18 )}\nRoute ${truncateLabel( selectedFlow.destinationName, 18 )}`
          : `Focus ${truncateLabel( focusedNode?.name || 'Afghanistan', 18 )}\nNo route selected`,
      );
      panelFooterText.setText(
        loadStatus === 'error'
          ? `${loadError?.message || 'Missing local Demo 2 files.'}\nExpected files:\ndemo2/data/demo2Nodes.json + demo2Flows.csv`
          : (
            currentSceneState.taskSubmitted
              ? `Submitted answer:\n${getSelectedFlowAnswerLabel() || currentSceneState.taskAnswer}`
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
      xrButtons.get( 'rotate-left' ).disabled = ! controlsEnabled;
      xrButtons.get( 'rotate-left' ).label = buildButtonLabel( 'Globe', 'Left' );
      xrButtons.get( 'rotate-right' ).disabled = ! controlsEnabled;
      xrButtons.get( 'rotate-right' ).label = buildButtonLabel( 'Globe', 'Right' );
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
        xrButtons.forEach( ( button ) => button.hoverSources.clear() );

        if ( presentationMode !== PRESENTATION_MODES.DESKTOP ) {

          ensureXrPanelPlacement();

        }

        syncAllUi();

      },
    };

  },
} );
