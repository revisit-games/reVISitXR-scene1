import * as THREE from 'three';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createSituatedAnchor } from '../scenes/core/situatedAnchor.js';
import {
  DEMO4_LAYER_MODES,
  DEMO4_PLACEMENT_MODES,
  normalizeDemo4MetricId,
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
} = {} ) {

  return new THREE.MeshBasicMaterial( {
    color,
    transparent: true,
    opacity,
    side,
    depthWrite,
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

function buildAnchorTransformFromState( sceneState ) {

  return {
    position: sceneState.arAnchorPosition,
    quaternion: sceneState.arAnchorQuaternion,
    scale: sceneState.arScaleFactor,
  };

}

export const demo4SceneDefinition = Object.freeze( {
  sceneKey: 'demo4',
  queryValue: '4',
  label: 'Demo 4 Situated AR Overlay',
  loggingConfig: demo4LoggingConfig,
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
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
    let controlPanelRoot = null;
    let detailRoot = null;
    let panelBodyText = null;
    let detailText = null;
    let placementPromptText = null;

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
        `Metric: ${metric?.label || currentSceneState.metricId}`,
        `Time: ${timeSlice?.label || currentSceneState.timeIndex}`,
        `Layer: ${currentSceneState.layerMode}`,
        `Visible sites: ${currentSceneState.visibleSiteIds.length}/${DEMO4_SITE_IDS.length}`,
        selectionText,
        currentSceneState.taskSubmitted ? 'Task submitted' : 'Task not submitted',
      ].join( '\n' );

    }

    function updateAnchorStateFromTransform( transform ) {

      currentSceneState.arAnchorPosition = Array.isArray( transform?.position )
        ? [ ...transform.position ]
        : vector3ToArray( placementAnchor.anchorRoot.position );
      currentSceneState.arAnchorQuaternion = Array.isArray( transform?.quaternion )
        ? [ ...transform.quaternion ]
        : quaternionToArray( placementAnchor.anchorRoot.quaternion );
      currentSceneState.arScaleFactor = isFiniteNumber( transform?.scale )
        ? transform.scale
        : placementAnchor.anchorRoot.scale.x;

    }

    function applyPlacementStateToAnchor() {

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

    function confirmPlacement( source, transform = null ) {

      if ( placementConfirmInProgress ) {

        return;

      }

      placementConfirmInProgress = true;
      const finalTransform = transform || placementAnchor.confirmPlacement();
      updateAnchorStateFromTransform( finalTransform );
      currentSceneState.arPlacementConfirmed = true;
      currentSceneState.placementMode = DEMO4_PLACEMENT_MODES.ANCHORED;
      currentSceneState.placementCount += 1;
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

    function selectSite( siteId, source ) {

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
      syncVisuals();

      if ( changed ) {

        recordSceneChange( 'siteSelection', source || 'demo4-site-selection', {
          flushImmediately: getSceneStateLoggingConfig().flushOnSiteSelection === true,
        } );

      }

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

    function createPlacementVisuals() {

      createFootprintVisuals( placementAnchor.previewRoot, { preview: true } );
      placementPromptText = createTrackedTextSprite(
        disposables,
        placementAnchor.previewRoot,
        {
          ...demo4VisualConfig.text.label,
          text: 'Select floor to place overlay',
          worldHeight: 0.085,
          fixedWidth: 260,
          maxTextWidth: 230,
        },
        [ 0, 0.18, 0 ],
        { name: 'demo4-placement-prompt', renderOrder: 20 },
      );

    }

    function createMarker( site ) {

      const markerStyle = demo4VisualConfig.markers;
      const group = new THREE.Group();
      group.name = `demo4-marker-${site.id}`;
      group.position.copy( vector3FromArray( site.localPosition ) );
      placementAnchor.anchorRoot.add( group );

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

          if ( ! currentSceneState.arPlacementConfirmed ) {

            return;

          }

          setFocusedSiteFromHover( site.id, payload.source || 'unknown', payload.isHovered === true );

        },
        onSelectStart( payload ) {

          if (
            ! currentSceneState.arPlacementConfirmed ||
            ! currentSceneState.visibleSiteIds.includes( site.id )
          ) {

            return;

          }

          selectSite( site.id, payload.source || 'demo4-site-select' );

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

    }

    function createControlButton( key, label, position, onPress, {
      width = 0.15,
      height = 0.064,
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
      controlPanelRoot = new THREE.Group();
      controlPanelRoot.name = 'demo4-control-panel-root';
      controlPanelRoot.position.copy( vector3FromArray( panel.position ) );
      placementAnchor.anchorRoot.add( controlPanelRoot );

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

      createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        { ...demo4VisualConfig.text.panelTitle, text: 'Campus Commons' },
        [ 0, 0.205, 0.022 ],
        { name: 'demo4-panel-title', renderOrder: 17 },
      );
      panelBodyText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        { ...demo4VisualConfig.text.panelBody, text: '' },
        [ 0, 0.078, 0.022 ],
        { name: 'demo4-panel-body', renderOrder: 17 },
      );

      DEMO4_METRIC_IDS.forEach( ( metricId, index ) => {

        const metric = getDemo4Metric( metricId );
        createControlButton(
          `metric-${metricId}`,
          metric?.label || metricId,
          [ - 0.22 + index * 0.22, - 0.08 ],
          ( source ) => setMetric( metricId, source ),
          {
            width: 0.19,
            isActive: () => currentSceneState.metricId === metricId,
          },
        );

      } );

      dataset.timeSlices.forEach( ( timeSlice, index ) => {

        createControlButton(
          `time-${timeSlice.id}`,
          timeSlice.label,
          [ - 0.22 + index * 0.22, - 0.155 ],
          ( source ) => setTimeIndex( timeSlice.index, source ),
          {
            width: 0.19,
            isActive: () => currentSceneState.timeIndex === timeSlice.index,
          },
        );

      } );

      createControlButton( 'layer', 'Layer', [ - 0.255, - 0.23 ], ( source ) => toggleLayerMode( source ), {
        width: 0.13,
        isActive: () => currentSceneState.layerMode === DEMO4_LAYER_MODES.ALERTS,
      } );
      createControlButton( 'labels', 'Labels', [ - 0.105, - 0.23 ], ( source ) => toggleLabels( source ), {
        width: 0.13,
        isActive: () => currentSceneState.labelsVisible,
      } );
      createControlButton( 'detail', 'Detail', [ 0.045, - 0.23 ], ( source ) => toggleDetail( source ), {
        width: 0.13,
        isActive: () => currentSceneState.detailExpanded,
      } );
      createControlButton( 'reset', 'Reset', [ 0.195, - 0.23 ], ( source ) => resetPlacement( source ), {
        width: 0.13,
      } );
      createControlButton( 'submit', 'Submit', [ 0.325, - 0.23 ], ( source ) => submitTask( source ), {
        width: 0.11,
        isActive: () => currentSceneState.taskSubmitted,
        isEnabled: () => Boolean( currentSceneState.taskAnswer ),
      } );

    }

    function createDetailCard() {

      const { detail } = demo4VisualConfig;
      detailRoot = new THREE.Group();
      detailRoot.name = 'demo4-detail-card-root';
      detailRoot.position.copy( vector3FromArray( detail.position ) );
      placementAnchor.anchorRoot.add( detailRoot );
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

    function createAnchoredOverlayVisuals() {

      createFootprintVisuals( placementAnchor.anchorRoot );
      dataset.sites.forEach( createMarker );
      createControlPanel();
      createDetailCard();

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

    function syncControlPanel() {

      if ( ! controlPanelRoot ) {

        return;

      }

      controlPanelRoot.visible = currentSceneState.arPlacementConfirmed;
      panelBodyText?.setText( getPanelStatusText() );
      buttonRecords.forEach( updateButtonVisualState );

    }

    function syncDetailCard() {

      if ( ! detailRoot || ! detailText ) {

        return;

      }

      const activeSite = getActiveSite();
      detailRoot.visible = currentSceneState.arPlacementConfirmed && Boolean( activeSite );
      detailText.setText( activeSite
        ? getSiteSummaryText( activeSite.id, { expanded: currentSceneState.detailExpanded } )
        : 'Select a site marker to inspect local readings.' );

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
      desktopRefs.confirmButton.disabled = currentSceneState.arPlacementConfirmed;
      desktopRefs.submitButton.disabled = ! currentSceneState.taskAnswer;

    }

    function syncVisuals() {

      syncDerivedVisibleSiteIds();
      applyPlacementStateToAnchor();
      placementPromptText?.setText( currentSceneState.arPlacementConfirmed
        ? 'Overlay placed'
        : 'Select floor to place overlay' );
      syncMarkerVisuals();
      syncControlPanel();
      syncDetailCard();
      syncDesktopPanel();

    }

    function getSceneStateForStorage() {

      syncDerivedVisibleSiteIds();
      return {
        demoId: currentSceneState.demoId,
        taskId: currentSceneState.taskId,
        arPlacementConfirmed: currentSceneState.arPlacementConfirmed,
        placementMode: currentSceneState.placementMode,
        placementCount: currentSceneState.placementCount,
        arAnchorPosition: [ ...currentSceneState.arAnchorPosition ],
        arAnchorQuaternion: [ ...currentSceneState.arAnchorQuaternion ],
        arScaleFactor: currentSceneState.arScaleFactor,
        metricId: currentSceneState.metricId,
        timeIndex: currentSceneState.timeIndex,
        layerMode: currentSceneState.layerMode,
        labelsVisible: currentSceneState.labelsVisible,
        selectedSiteId: currentSceneState.selectedSiteId,
        focusedSiteId: currentSceneState.focusedSiteId,
        detailExpanded: currentSceneState.detailExpanded,
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
      };

      return {
        xrDemoId: state.demoId,
        xrTaskId: state.taskId,
        xrArPlacementConfirmed: state.arPlacementConfirmed,
        xrArPlacementMode: state.placementMode,
        xrArMetricId: state.metricId,
        xrArTimeIndex: state.timeIndex,
        xrArLayerMode: state.layerMode,
        xrArLabelsVisible: state.labelsVisible,
        xrArSelectedSiteId: state.selectedSiteId,
        xrArFocusedSiteId: state.focusedSiteId,
        xrArDetailExpanded: state.detailExpanded,
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

      const submitButton = document.createElement( 'button' );
      submitButton.type = 'button';
      submitButton.textContent = 'Submit answer';
      submitButton.addEventListener( 'click', () => submitTask( 'desktop-task-submit' ) );
      controlRow.appendChild( submitButton );

      [ confirmButton, resetButton, layerButton, labelsButton, detailButton, submitButton ].forEach( ( button ) => {

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
        button.addEventListener( 'click', () => selectSite( siteId, `desktop-site-${siteId}` ) );
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
      onConfirmPlacement( payload, transform ) {

        confirmPlacement( payload?.source || 'demo4-placement-surface', transform );

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
        syncVisuals();

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

        const isPlaced = currentSceneState.arPlacementConfirmed;
        const modeLabel = presentationMode === 'immersive-ar' ? 'AR' : 'desktop';

        return {
          title: 'Demo 4 Situated AR Overlay',
          body: isPlaced
            ? `Inspect the anchored campus overlay in ${modeLabel}. Switch metric/time, select a site, then submit your answer.`
            : `Place the campus overlay on the floor preview in ${modeLabel}. Desktop can use the side panel confirm button.`,
          note: 'Placement, metric, time slice, layer, labels, site selection, detail state, and answer submission are stored as semantic replay state.',
        };

      },
      handleBackgroundSelect( payload = {} ) {

        void payload;

      },
    };

  },
} );
