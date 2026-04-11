import * as THREE from 'three';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { loadDemo3Dataset } from './demo3Data.js';
import { demo3LoggingConfig } from './demo3LoggingConfig.js';
import { getDemo3Task } from './demo3Tasks.js';
import { demo3VisualConfig } from './demo3VisualConfig.js';
import {
  DEMO3_DEFAULT_LAYOUT_MODE,
  DEMO3_DEFAULT_TASK_ID,
  DEMO3_LAYOUT_MODES,
  DEMO3_VIEW_ID_LIST,
  DEMO3_VIEW_IDS,
  normalizeDemo3LayoutMode,
  normalizeDemo3SceneState,
  normalizeDemo3ViewId,
  parseDemo3Conditions,
} from './demo3Conditions.js';

const PANEL_TITLES = Object.freeze( {
  [ DEMO3_VIEW_IDS.TREND ]: 'Trend View',
  [ DEMO3_VIEW_IDS.RANKING ]: 'Ranking View',
  [ DEMO3_VIEW_IDS.COMPARISON ]: 'Comparison View',
  [ DEMO3_VIEW_IDS.SUMMARY ]: 'Summary View',
} );

const LAYOUT_CYCLE = Object.freeze( [
  DEMO3_LAYOUT_MODES.COMPARE,
  DEMO3_LAYOUT_MODES.FOCUS,
  DEMO3_LAYOUT_MODES.SURROUND,
  DEMO3_LAYOUT_MODES.FREE,
] );

const DEFAULT_PANEL_QUATERNION = Object.freeze( [ 0, 0, 0, 1 ] );
const WORLD_UP = new THREE.Vector3( 0, 1, 0 );

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function createStyledElement( tagName, style, text = '' ) {

  const element = document.createElement( tagName );
  element.setAttribute( 'style', style );
  element.textContent = text;
  return element;

}

function formatCompactNumber( value, { maximumFractionDigits = 1 } = {} ) {

  if ( ! isFiniteNumber( value ) ) {

    return '--';

  }

  return new Intl.NumberFormat( 'en-US', { maximumFractionDigits } ).format( value );

}

function formatLifeExpectancy( value ) {

  return isFiniteNumber( value )
    ? `${formatCompactNumber( value, { maximumFractionDigits: 1 } )} years`
    : '--';

}

function formatLifeChange( value ) {

  if ( ! isFiniteNumber( value ) ) {

    return '--';

  }

  return `${value >= 0 ? '+' : ''}${formatCompactNumber( value, { maximumFractionDigits: 2 } )} years`;

}

function formatCurrency( value ) {

  if ( ! isFiniteNumber( value ) ) {

    return '--';

  }

  return `$${new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits: value >= 1000 ? 0 : 1,
  } ).format( value )}`;

}

function formatPopulation( value ) {

  if ( ! isFiniteNumber( value ) || value <= 0 ) {

    return '--';

  }

  if ( value >= 1e9 ) {

    return `${formatCompactNumber( value / 1e9, { maximumFractionDigits: 2 } )}B`;

  }

  if ( value >= 1e6 ) {

    return `${formatCompactNumber( value / 1e6, { maximumFractionDigits: 1 } )}M`;

  }

  return formatCompactNumber( value, { maximumFractionDigits: 0 } );

}

function formatViewLabel( viewId ) {

  return PANEL_TITLES[ viewId ] || viewId;

}

function formatLayoutLabel( layoutMode ) {

  if ( layoutMode === DEMO3_LAYOUT_MODES.FREE ) {

    return 'Free';

  }

  if ( layoutMode === DEMO3_LAYOUT_MODES.FOCUS ) {

    return 'Focus';

  }

  if ( layoutMode === DEMO3_LAYOUT_MODES.SURROUND ) {

    return 'Surround';

  }

  return 'Compare';

}

function truncateLabel( value, maxLength = 20 ) {

  const label = String( value || '' );
  return label.length <= maxLength
    ? label
    : `${label.slice( 0, maxLength - 3 ).trimEnd()}...`;

}

function cloneArray( value ) {

  return Array.isArray( value ) ? [ ...value ] : [];

}

function clonePanelLayouts( panelLayouts = {} ) {

  const cloned = {};

  DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => {

    const layout = panelLayouts[ viewId ];

    if ( layout ) {

      cloned[ viewId ] = {
        position: cloneArray( layout.position ),
        quaternion: cloneArray( layout.quaternion ),
        slotId: layout.slotId || null,
        pinned: Boolean( layout.pinned ),
      };

    }

  } );

  return cloned;

}

function vector3FromArray( value, fallback = [ 0, 0, 0 ] ) {

  const source = Array.isArray( value ) && value.length === 3 ? value : fallback;
  return new THREE.Vector3(
    isFiniteNumber( source[ 0 ] ) ? source[ 0 ] : fallback[ 0 ],
    isFiniteNumber( source[ 1 ] ) ? source[ 1 ] : fallback[ 1 ],
    isFiniteNumber( source[ 2 ] ) ? source[ 2 ] : fallback[ 2 ],
  );

}

function quaternionFromYawDegrees( yawDeg = 0 ) {

  return new THREE.Quaternion().setFromAxisAngle(
    WORLD_UP,
    THREE.MathUtils.degToRad( isFiniteNumber( yawDeg ) ? yawDeg : 0 ),
  );

}

function quaternionFromArray( value, fallback = DEFAULT_PANEL_QUATERNION ) {

  const source = Array.isArray( value ) && value.length === 4 ? value : fallback;
  return new THREE.Quaternion(
    isFiniteNumber( source[ 0 ] ) ? source[ 0 ] : fallback[ 0 ],
    isFiniteNumber( source[ 1 ] ) ? source[ 1 ] : fallback[ 1 ],
    isFiniteNumber( source[ 2 ] ) ? source[ 2 ] : fallback[ 2 ],
    isFiniteNumber( source[ 3 ] ) ? source[ 3 ] : fallback[ 3 ],
  ).normalize();

}

function vector3ToArray( vector ) {

  return [
    Number.parseFloat( vector.x.toFixed( 4 ) ),
    Number.parseFloat( vector.y.toFixed( 4 ) ),
    Number.parseFloat( vector.z.toFixed( 4 ) ),
  ];

}

function quaternionToArray( quaternion ) {

  return [
    Number.parseFloat( quaternion.x.toFixed( 5 ) ),
    Number.parseFloat( quaternion.y.toFixed( 5 ) ),
    Number.parseFloat( quaternion.z.toFixed( 5 ) ),
    Number.parseFloat( quaternion.w.toFixed( 5 ) ),
  ];

}

function lerpInRange( value, domainMin, domainMax, rangeMin, rangeMax ) {

  if ( ! isFiniteNumber( value ) || ! isFiniteNumber( domainMin ) || ! isFiniteNumber( domainMax ) || domainMin === domainMax ) {

    return ( rangeMin + rangeMax ) * 0.5;

  }

  const alpha = THREE.MathUtils.clamp( ( value - domainMin ) / ( domainMax - domainMin ), 0, 1 );
  return THREE.MathUtils.lerp( rangeMin, rangeMax, alpha );

}

function jsonStringifyCompact( value ) {

  try {

    return JSON.stringify( value ?? null );

  } catch ( error ) {

    return 'null';

  }

}

function createMaterial( { color = 0xffffff, opacity = 1, transparent = null, side = THREE.DoubleSide, depthWrite = false } = {} ) {

  return new THREE.MeshBasicMaterial( {
    color,
    transparent: transparent === null ? opacity < 1 : transparent,
    opacity,
    side,
    depthWrite,
    toneMapped: false,
  } );

}

function createLineMaterial( { color = 0xffffff, opacity = 1 } = {} ) {

  return new THREE.LineBasicMaterial( {
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    toneMapped: false,
  } );

}

function createTrackedMesh( collection, parent, geometry, material, { name = '', position = null, renderOrder = null } = {} ) {

  const mesh = new THREE.Mesh( geometry, material );
  mesh.name = name;

  if ( position ) {

    mesh.position.copy( position );

  }

  if ( renderOrder !== null ) {

    mesh.renderOrder = renderOrder;

  }

  parent.add( mesh );
  collection.push( {
    object3D: mesh,
    dispose() {

      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();

    },
  } );
  return mesh;

}

function createTrackedLine( collection, parent, points, material, { name = '', renderOrder = null } = {} ) {

  const geometry = new THREE.BufferGeometry().setFromPoints( points );
  const line = new THREE.Line( geometry, material );
  line.name = name;

  if ( renderOrder !== null ) {

    line.renderOrder = renderOrder;

  }

  parent.add( line );
  collection.push( {
    object3D: line,
    dispose() {

      line.removeFromParent();
      geometry.dispose();
      material.dispose();

    },
  } );
  return line;

}

function createTrackedLineSegments( collection, parent, positions, material, { name = '', renderOrder = null } = {} ) {

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
  const lineSegments = new THREE.LineSegments( geometry, material );
  lineSegments.name = name;

  if ( renderOrder !== null ) {

    lineSegments.renderOrder = renderOrder;

  }

  parent.add( lineSegments );
  collection.push( {
    object3D: lineSegments,
    dispose() {

      lineSegments.removeFromParent();
      geometry.dispose();
      material.dispose();

    },
  } );
  return lineSegments;

}

function createTrackedTextPlane( collection, parent, options, position, { name = '', renderOrder = null } = {} ) {

  const controller = createTextPlane( options );
  controller.mesh.name = name;
  controller.mesh.position.copy( position );

  if ( renderOrder !== null ) {

    controller.mesh.renderOrder = renderOrder;

  }

  parent.add( controller.mesh );
  collection.push( {
    object3D: controller.mesh,
    dispose() {

      controller.mesh.removeFromParent();
      controller.dispose();

    },
  } );
  return controller;

}

function createRectangleMesh( collection, parent, width, height, material, position, options = {} ) {

  return createTrackedMesh(
    collection,
    parent,
    new THREE.PlaneGeometry( Math.max( 0.001, width ), Math.max( 0.001, height ) ),
    material,
    { ...options, position },
  );

}

function createCircleMesh( collection, parent, radius, material, position, options = {} ) {

  return createTrackedMesh(
    collection,
    parent,
    new THREE.CircleGeometry( Math.max( 0.001, radius ), 32 ),
    material,
    { ...options, position },
  );

}

function createPlaneBorder( collection, parent, width, height, material, z, name, renderOrder ) {

  const x = width * 0.5;
  const y = height * 0.5;
  const positions = [
    - x, - y, z, x, - y, z,
    x, - y, z, x, y, z,
    x, y, z, - x, y, z,
    - x, y, z, - x, - y, z,
  ];

  return createTrackedLineSegments( collection, parent, positions, material, { name, renderOrder } );

}

function getButtonStyle( desktopPanelStyle, isEnabled ) {

  return isEnabled ? desktopPanelStyle.button : desktopPanelStyle.buttonDisabled;

}

export const demo3SceneDefinition = Object.freeze( {
  sceneKey: 'demo3',
  queryValue: '3',
  label: 'Demo 3 Analytic Workspace',
  loggingConfig: demo3LoggingConfig,
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return normalizeDemo3SceneState( candidateState, fallbackState, { defaultTaskId: DEMO3_DEFAULT_TASK_ID } );

  },
  createScene( context ) {

    const { workspace, panels: panelStyle, charts, buttons, text, desktopPanel, palette } = demo3VisualConfig;
    const root = new THREE.Group();
    const panelByViewId = new Map();
    const staticEntries = [];
    const hoverBySource = new Map();
    const desktopRefs = {};
    const task = getDemo3Task( DEMO3_DEFAULT_TASK_ID );
    const defaultSceneState = parseDemo3Conditions( window.location.search, { defaultTaskId: DEMO3_DEFAULT_TASK_ID } );
    const dragRay = new THREE.Ray();
    const dragPoint = new THREE.Vector3();
    const dragPlane = new THREE.Plane();
    const tempWorldDirection = new THREE.Vector3();

    let currentSceneState = normalizeDemo3SceneState( defaultSceneState, defaultSceneState, { defaultTaskId: DEMO3_DEFAULT_TASK_ID } );
    let dataset = null;
    let loadStatus = 'idle';
    let loadError = null;
    let hoverSequence = 0;
    let currentHoveredDatumId = null;
    let currentHoveredViewId = null;
    let activePanelDrag = null;

    root.name = 'demo3-workspace-root';

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || demo3LoggingConfig.sceneState;

    }

    function getDemo3LoggingTuning() {

      return context.getLoggingConfig?.()?.demo3 || demo3LoggingConfig.demo3;

    }

    function getStableSceneLabel( key ) {

      return getDemo3LoggingTuning().stableLabels?.[ key ] || key;

    }

    function recordSceneChange( labelKey, source, { flushImmediately = false } = {} ) {

      return context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( labelKey ),
        flushImmediately,
      } ) === true;

    }

    function getPanelPresetTransform( viewId, layoutMode = currentSceneState.layoutMode ) {

      const normalizedMode = normalizeDemo3LayoutMode( layoutMode, DEMO3_DEFAULT_LAYOUT_MODE );

      if ( normalizedMode === DEMO3_LAYOUT_MODES.FOCUS ) {

        const focusPreset = demo3VisualConfig.layouts.focus;

        if ( viewId === currentSceneState.focusedViewId ) {

          return focusPreset.trend;

        }

        const sideSlots = [ focusPreset.ranking, focusPreset.comparison, focusPreset.summary ];
        const sideViewIds = DEMO3_VIEW_ID_LIST.filter( ( candidateViewId ) => candidateViewId !== currentSceneState.focusedViewId );
        return sideSlots[ Math.max( 0, sideViewIds.indexOf( viewId ) ) ] || demo3VisualConfig.layouts.compare[ viewId ];

      }

      if ( normalizedMode === DEMO3_LAYOUT_MODES.SURROUND ) {

        return demo3VisualConfig.layouts.surround[ viewId ] || demo3VisualConfig.layouts.compare[ viewId ];

      }

      return demo3VisualConfig.layouts.compare[ viewId ];

    }

    function presetTransformToPanelLayout( transform = {}, viewId = DEMO3_VIEW_IDS.TREND ) {

      const position = vector3FromArray( transform.position, workspace.center );
      const quaternion = quaternionFromYawDegrees( transform.yawDeg || 0 );

      return {
        position: vector3ToArray( position ),
        quaternion: quaternionToArray( quaternion ),
        slotId: transform.slotId || `${currentSceneState.layoutMode}-${viewId}`,
        pinned: currentSceneState.pinnedViewIds.includes( viewId ),
      };

    }

    function getFallbackPanelLayout( viewId, layoutMode = currentSceneState.layoutMode ) {

      return presetTransformToPanelLayout( getPanelPresetTransform( viewId, layoutMode ), viewId );

    }

    function applyPanelLayout( viewId, layout, { scale = 1 } = {} ) {

      const panel = panelByViewId.get( viewId );

      if ( ! panel ) {

        return;

      }

      const fallbackLayout = getFallbackPanelLayout( viewId );
      const normalizedLayout = layout || fallbackLayout;
      panel.root.position.copy( vector3FromArray( normalizedLayout.position, fallbackLayout.position ) );
      panel.root.quaternion.copy( quaternionFromArray( normalizedLayout.quaternion, fallbackLayout.quaternion ) );
      panel.root.scale.setScalar( Math.max( 0.2, scale ) );

    }

    function getCurrentPanelLayout( viewId, { slotId = null } = {} ) {

      const panel = panelByViewId.get( viewId );

      if ( ! panel ) {

        return getFallbackPanelLayout( viewId );

      }

      return {
        position: vector3ToArray( panel.root.position ),
        quaternion: quaternionToArray( panel.root.quaternion ),
        slotId: slotId || currentSceneState.panelLayouts[ viewId ]?.slotId || getFallbackPanelLayout( viewId ).slotId,
        pinned: currentSceneState.pinnedViewIds.includes( viewId ),
      };

    }

    function commitPanelLayout( viewId, { slotId = null } = {} ) {

      currentSceneState.panelLayouts = {
        ...currentSceneState.panelLayouts,
        [ viewId ]: getCurrentPanelLayout( viewId, { slotId } ),
      };

    }

    function commitAllPanelLayouts() {

      DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => commitPanelLayout( viewId ) );

    }

    function applyPanelLayoutsFromSceneState() {

      DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => {

        const transform = getPanelPresetTransform( viewId );
        const layout = currentSceneState.panelLayouts[ viewId ] || getFallbackPanelLayout( viewId );
        const scale = currentSceneState.layoutMode === DEMO3_LAYOUT_MODES.FOCUS ? ( transform.scale || 1 ) : 1;
        applyPanelLayout( viewId, layout, { scale } );

      } );

    }

    function applyLayoutModeTransforms( layoutMode, { respectPinned = true, commit = true } = {} ) {

      const normalizedMode = normalizeDemo3LayoutMode( layoutMode, DEMO3_DEFAULT_LAYOUT_MODE );

      if ( normalizedMode === DEMO3_LAYOUT_MODES.FREE ) {

        DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => {

          const panel = panelByViewId.get( viewId );

          if ( panel ) {

            panel.root.scale.setScalar( 1 );

          }

          if ( commit ) {

            commitPanelLayout( viewId );

          }

        } );
        return;

      }

      DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => {

        const isPinned = currentSceneState.pinnedViewIds.includes( viewId );

        if ( respectPinned && isPinned ) {

          const panel = panelByViewId.get( viewId );

          if ( panel ) {

            panel.root.scale.setScalar( 1 );

          }

          if ( commit ) {

            commitPanelLayout( viewId );

          }

          return;

        }

        const transform = getPanelPresetTransform( viewId, normalizedMode );
        const layout = presetTransformToPanelLayout( transform, viewId );
        const scale = normalizedMode === DEMO3_LAYOUT_MODES.FOCUS ? ( transform.scale || 1 ) : 1;
        applyPanelLayout( viewId, layout, { scale } );

        if ( commit ) {

          currentSceneState.panelLayouts = {
            ...currentSceneState.panelLayouts,
            [ viewId ]: layout,
          };

        }

      } );

    }

    function getRegionByDatumId( datumId ) {

      return dataset && typeof datumId === 'string'
        ? dataset.regionByDatumId.get( datumId ) || null
        : null;

    }

    function getSelectedRegion() {

      return getRegionByDatumId( currentSceneState.selectedDatumId );

    }

    function resolveRegionColor( region ) {

      return new THREE.Color( palette[ region?.regionName ] || palette.Other || '#9aa7b5' );

    }

    function resolveHoverState() {

      let latestHover = null;

      hoverBySource.forEach( ( entry ) => {

        if ( ! latestHover || entry.sequence > latestHover.sequence ) {

          latestHover = entry;

        }

      } );

      currentHoveredDatumId = latestHover?.datumId ?? null;
      currentHoveredViewId = latestHover?.viewId ?? null;

    }

    function getHoveredDatumIdForView( viewId ) {

      if ( currentSceneState.linkedHighlightEnabled ) {

        return currentHoveredDatumId;

      }

      let latestLocalHover = null;

      hoverBySource.forEach( ( entry ) => {

        if ( entry.viewId === viewId && ( ! latestLocalHover || entry.sequence > latestLocalHover.sequence ) ) {

          latestLocalHover = entry;

        }

      } );

      return latestLocalHover?.datumId ?? null;

    }

    function getRegionVisualState( region, viewId ) {

      const selectedDatumId = currentSceneState.selectedDatumId;
      const hoveredDatumId = getHoveredDatumIdForView( viewId );
      const hasActiveLinkedDatum = currentSceneState.linkedHighlightEnabled && Boolean( selectedDatumId || currentHoveredDatumId );
      const selectedInThisView = selectedDatumId === region.datumId && (
        currentSceneState.linkedHighlightEnabled ||
        viewId === currentSceneState.selectedViewId ||
        viewId === DEMO3_VIEW_IDS.SUMMARY
      );
      const hoveredInThisView = hoveredDatumId === region.datumId;
      const highlighted = selectedInThisView || hoveredInThisView;

      return {
        selected: selectedInThisView,
        hovered: hoveredInThisView,
        highlighted,
        muted: hasActiveLinkedDatum && ! highlighted,
      };

    }

    function getStyledRegionMaterial( region, viewId, { baseOpacity = 0.9 } = {} ) {

      const state = getRegionVisualState( region, viewId );
      const color = state.selected
        ? new THREE.Color( charts.selectedColor )
        : ( state.hovered ? new THREE.Color( charts.hoverColor ) : resolveRegionColor( region ) );
      const opacity = state.muted ? charts.linkedMutedOpacity : baseOpacity;

      return createMaterial( {
        color,
        opacity,
        transparent: opacity < 1,
        depthWrite: false,
      } );

    }

    function createInteractiveMesh( collection, parent, geometry, material, handlers, { name = '', position = null, renderOrder = null, userData = null } = {} ) {

      const mesh = new THREE.Mesh( geometry, material );
      mesh.name = name;

      if ( position ) {

        mesh.position.copy( position );

      }

      if ( renderOrder !== null ) {

        mesh.renderOrder = renderOrder;

      }

      if ( userData ) {

        Object.assign( mesh.userData, userData );

      }

      parent.add( mesh );
      context.registerRaycastTarget?.( mesh, handlers );
      collection.push( {
        object3D: mesh,
        dispose() {

          context.unregisterRaycastTarget?.( mesh );
          mesh.removeFromParent();
          geometry.dispose();
          material.dispose();

        },
      } );
      return mesh;

    }

    function clearPanelDynamicObjects( panel ) {

      panel.dynamicEntries.forEach( ( entry ) => entry.dispose?.() );
      panel.dynamicEntries.length = 0;

    }

    function clearAllPanelDynamicObjects() {

      panelByViewId.forEach( ( panel ) => clearPanelDynamicObjects( panel ) );

    }

    function updatePanelHover( viewId, source, isHovered ) {

      const panel = panelByViewId.get( viewId );

      if ( ! panel ) {

        return;

      }

      if ( isHovered ) {

        panel.hoverSources.add( source );

      } else {

        panel.hoverSources.delete( source );

      }

      updatePanelShellVisuals();

    }

    function updateDatumHover( source, viewId, datumId, isHovered ) {

      if ( isHovered && datumId ) {

        hoverBySource.set( source, { viewId, datumId, sequence: hoverSequence += 1 } );

      } else {

        const currentEntry = hoverBySource.get( source );

        if ( currentEntry?.datumId === datumId || currentEntry?.viewId === viewId ) {

          hoverBySource.delete( source );

        }

      }

      resolveHoverState();
      renderAllPanelContent();
      syncDesktopPanel();

    }

    function clearHoverState() {

      hoverBySource.forEach( ( _entry, source ) => context.invalidateSceneHoverForSource?.( source ) );
      hoverBySource.clear();
      resolveHoverState();

    }

    function setSelectedViewId( viewId, { source = 'scene-select-view', shouldLog = false } = {} ) {

      const normalizedViewId = normalizeDemo3ViewId( viewId, currentSceneState.selectedViewId );

      if ( normalizedViewId === currentSceneState.selectedViewId ) {

        return;

      }

      currentSceneState.selectedViewId = normalizedViewId;
      updatePanelShellVisuals();
      syncDesktopPanel();

      if ( shouldLog ) {

        recordSceneChange( 'selectView', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnSelectViewChange === true,
        } );

      }

    }

    function setFocusedViewId( viewId, { source = 'scene-focus-view', shouldLog = false } = {} ) {

      const normalizedViewId = normalizeDemo3ViewId( viewId, currentSceneState.focusedViewId );

      if ( normalizedViewId === currentSceneState.focusedViewId ) {

        return;

      }

      currentSceneState.focusedViewId = normalizedViewId;

      if ( currentSceneState.layoutMode === DEMO3_LAYOUT_MODES.FOCUS ) {

        applyLayoutModeTransforms( DEMO3_LAYOUT_MODES.FOCUS, { respectPinned: true, commit: true } );

      }

      updatePanelShellVisuals();
      renderAllPanelContent();
      syncDesktopPanel();

      if ( shouldLog ) {

        recordSceneChange( 'focusView', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnFocusViewChange === true,
        } );

      }

    }

    function activateView( viewId, { source = 'scene-view', shouldLog = false } = {} ) {

      setSelectedViewId( viewId, { source, shouldLog } );
      setFocusedViewId( viewId, { source, shouldLog } );

    }

    function setSelectedDatumId( datumId, { source = 'scene-select-datum', viewId = currentSceneState.selectedViewId, shouldLog = false } = {} ) {

      const normalizedDatumId = getRegionByDatumId( datumId ) ? datumId : null;

      if ( normalizedDatumId === currentSceneState.selectedDatumId && viewId === currentSceneState.selectedViewId ) {

        return;

      }

      currentSceneState.selectedDatumId = normalizedDatumId;

      if ( viewId ) {

        currentSceneState.selectedViewId = normalizeDemo3ViewId( viewId, currentSceneState.selectedViewId );
        currentSceneState.focusedViewId = normalizeDemo3ViewId( viewId, currentSceneState.focusedViewId );

      }

      renderAllPanelContent();
      updatePanelShellVisuals();
      syncDesktopPanel();

      if ( shouldLog ) {

        recordSceneChange( 'selection', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnSelectionChange === true,
        } );

      }

    }

    function setLayoutMode( layoutMode, { source = 'scene-layout-mode', shouldLog = false } = {} ) {

      const normalizedMode = normalizeDemo3LayoutMode( layoutMode, currentSceneState.layoutMode );

      if ( normalizedMode === currentSceneState.layoutMode && normalizedMode !== DEMO3_LAYOUT_MODES.FREE ) {

        return;

      }

      currentSceneState.layoutMode = normalizedMode;
      applyLayoutModeTransforms( normalizedMode, { respectPinned: true, commit: true } );
      clearHoverState();
      renderAllPanelContent();
      updatePanelShellVisuals();
      syncDesktopPanel();

      if ( shouldLog ) {

        recordSceneChange( 'layoutMode', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnLayoutModeChange === true,
        } );

      }

    }

    function cycleLayoutMode( source = 'scene-layout-cycle' ) {

      const currentIndex = LAYOUT_CYCLE.indexOf( currentSceneState.layoutMode );
      const nextIndex = currentIndex >= 0 ? ( currentIndex + 1 ) % LAYOUT_CYCLE.length : 0;
      setLayoutMode( LAYOUT_CYCLE[ nextIndex ], { source, shouldLog: true } );

    }

    function toggleLinkedHighlighting( source = 'scene-linked-highlight-toggle' ) {

      currentSceneState.linkedHighlightEnabled = ! currentSceneState.linkedHighlightEnabled;
      clearHoverState();
      renderAllPanelContent();
      syncDesktopPanel();
      recordSceneChange( 'linkedHighlight', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnLinkedHighlightToggle === true,
      } );

    }

    function toggleFocusedPinnedView( source = 'scene-pin-focused-view' ) {

      const viewId = currentSceneState.focusedViewId;
      const pinned = new Set( currentSceneState.pinnedViewIds );

      if ( pinned.has( viewId ) ) {

        pinned.delete( viewId );

      } else {

        pinned.add( viewId );

      }

      currentSceneState.pinnedViewIds = [ ...pinned ].filter( ( candidateViewId ) => DEMO3_VIEW_ID_LIST.includes( candidateViewId ) );
      commitPanelLayout( viewId );
      renderAllPanelContent();
      updatePanelShellVisuals();
      syncDesktopPanel();
      recordSceneChange( 'movePanel', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnPanelDragEnd === true,
      } );

    }

    function resetWorkspace( source = 'scene-reset-workspace' ) {

      currentSceneState = normalizeDemo3SceneState( {
        ...parseDemo3Conditions( '', { defaultTaskId: DEMO3_DEFAULT_TASK_ID } ),
        taskId: currentSceneState.taskId || DEMO3_DEFAULT_TASK_ID,
        layoutMode: DEMO3_DEFAULT_LAYOUT_MODE,
      }, defaultSceneState, { defaultTaskId: DEMO3_DEFAULT_TASK_ID } );
      clearHoverState();
      applyLayoutModeTransforms( currentSceneState.layoutMode, { respectPinned: false, commit: true } );
      renderAllPanelContent();
      updatePanelShellVisuals();
      syncDesktopPanel();
      recordSceneChange( 'resetWorkspace', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnResetWorkspace === true,
      } );

    }

    function submitTaskAnswer( source = 'scene-task-submit' ) {

      if ( ! currentSceneState.selectedDatumId ) {

        return;

      }

      currentSceneState.taskAnswer = currentSceneState.selectedDatumId;
      currentSceneState.taskSubmitted = true;
      renderAllPanelContent();
      syncDesktopPanel();
      recordSceneChange( 'taskSubmit', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnTaskSubmit === true,
      } );

    }

    function getDragIntersection( payload, target = dragPoint ) {

      if ( ! activePanelDrag || ! payload?.rayOrigin || ! payload?.rayDirection ) {

        return null;

      }

      dragRay.origin.copy( payload.rayOrigin );
      dragRay.direction.copy( payload.rayDirection ).normalize();
      return dragRay.intersectPlane( activePanelDrag.dragPlane, target );

    }

    function beginPanelDrag( viewId, payload ) {

      const panel = panelByViewId.get( viewId );

      if ( ! panel ) {

        return false;

      }

      activateView( viewId, { source: payload.source || 'scene-panel-drag-start', shouldLog: false } );
      context.camera.getWorldDirection( tempWorldDirection ).normalize();
      panel.root.getWorldPosition( dragPoint );
      dragPlane.setFromNormalAndCoplanarPoint( tempWorldDirection, payload.point || dragPoint );

      const startPoint = payload.point?.clone?.() || dragPoint.clone();
      activePanelDrag = {
        viewId,
        dragPlane: dragPlane.clone(),
        offset: panel.root.position.clone().sub( startPoint ),
        didMove: false,
      };

      currentSceneState.layoutMode = DEMO3_LAYOUT_MODES.FREE;
      DEMO3_VIEW_ID_LIST.forEach( ( candidateViewId ) => {

        const candidatePanel = panelByViewId.get( candidateViewId );

        if ( candidatePanel ) {

          candidatePanel.root.scale.setScalar( 1 );

        }

      } );
      syncDesktopPanel();
      return true;

    }

    function updatePanelDrag( payload ) {

      if ( ! activePanelDrag ) {

        return false;

      }

      const panel = panelByViewId.get( activePanelDrag.viewId );
      const nextPoint = getDragIntersection( payload );

      if ( ! panel || ! nextPoint ) {

        return false;

      }

      panel.root.position.copy( nextPoint ).add( activePanelDrag.offset );
      activePanelDrag.didMove = true;
      return true;

    }

    function endPanelDrag( payload ) {

      if ( ! activePanelDrag ) {

        return false;

      }

      const { viewId, didMove } = activePanelDrag;
      activePanelDrag = null;
      commitPanelLayout( viewId );
      renderAllPanelContent();
      updatePanelShellVisuals();
      syncDesktopPanel();

      if ( didMove ) {

        recordSceneChange( 'movePanel', payload.source || 'scene-panel-drag-end', {
          flushImmediately: getSceneStateLoggingConfig().flushOnPanelDragEnd === true,
        } );

      }

      return true;

    }

    function applyVisibilityAndOrder() {

      const visibleViewIds = new Set( currentSceneState.visibleViewIds );
      const orderedViewIds = [
        ...currentSceneState.panelOrder.filter( ( viewId ) => DEMO3_VIEW_ID_LIST.includes( viewId ) ),
        ...DEMO3_VIEW_ID_LIST.filter( ( viewId ) => ! currentSceneState.panelOrder.includes( viewId ) ),
      ];

      orderedViewIds.forEach( ( viewId ) => {

        const panel = panelByViewId.get( viewId );

        if ( panel ) {

          panel.root.visible = visibleViewIds.has( viewId );
          root.add( panel.root );

        }

      } );

    }

    function updatePanelShellVisuals() {

      panelByViewId.forEach( ( panel, viewId ) => {

        const isFocused = currentSceneState.focusedViewId === viewId;
        const isSelected = currentSceneState.selectedViewId === viewId;
        const isPinned = currentSceneState.pinnedViewIds.includes( viewId );
        const isHovered = panel.hoverSources.size > 0;
        const edgeColor = isPinned
          ? panelStyle.pinnedEdgeColor
          : ( isSelected ? panelStyle.selectedEdgeColor : ( isFocused ? panelStyle.focusEdgeColor : panelStyle.edgeColor ) );
        const edgeOpacity = isFocused || isSelected || isPinned ? 0.88 : panelStyle.edgeOpacity;

        panel.edgeMaterial.color.setHex( edgeColor );
        panel.edgeMaterial.opacity = edgeOpacity;
        panel.titleMaterial.color.setHex( isFocused ? 0x21445c : panelStyle.titleColor );
        panel.titleMaterial.opacity = isHovered ? 0.98 : 0.92;
        panel.backgroundMaterial.opacity = isFocused ? Math.min( 1, panelStyle.backgroundOpacity + 0.04 ) : panelStyle.backgroundOpacity;
        const nextTitle = `${isPinned ? 'Pinned ' : ''}${formatViewLabel( viewId )}${isFocused ? ' Focused' : ''}`;
        panel.titleController.setText?.( nextTitle );

      } );

    }

    function getChartPosition( x, y, z = workspace.contentZ ) {

      return new THREE.Vector3( x, y, z );

    }

    function createChartAxes( panel, { xLabel = '', yLabel = '' } = {} ) {

      const z = workspace.contentZ + 0.004;
      const positions = [
        charts.left, charts.bottom, z, charts.right, charts.bottom, z,
        charts.left, charts.bottom, z, charts.left, charts.top, z,
      ];

      createTrackedLineSegments(
        panel.dynamicEntries,
        panel.contentRoot,
        positions,
        createLineMaterial( { color: charts.axisColor, opacity: charts.axisOpacity } ),
        { name: `${panel.viewId}-axes`, renderOrder: panelStyle.renderOrderBase + 3 },
      );

      if ( xLabel ) {

        createTrackedTextPlane( panel.dynamicEntries, panel.contentRoot, { ...text.chartLabel, text: xLabel }, getChartPosition( 0, charts.bottom - 0.055, workspace.contentZ + 0.014 ), { name: `${panel.viewId}-x-label`, renderOrder: panelStyle.renderOrderBase + 8 } );

      }

      if ( yLabel ) {

        createTrackedTextPlane(
          panel.dynamicEntries,
          panel.contentRoot,
          { ...text.chartLabel, text: yLabel, fixedWidth: 150, minWidth: 150, maxTextWidth: 128 },
          getChartPosition( charts.left + 0.03, charts.top + 0.035, workspace.contentZ + 0.014 ),
          { name: `${panel.viewId}-y-label`, renderOrder: panelStyle.renderOrderBase + 8 },
        );

      }

    }

    function createRegionProxy( panel, region, geometry, position ) {

      return createInteractiveMesh(
        panel.dynamicEntries,
        panel.contentRoot,
        geometry,
        createMaterial( { opacity: panelStyle.markProxyOpacity, transparent: true, depthWrite: false } ),
        {
          onHoverChange( payload ) {

            updateDatumHover( payload.source, panel.viewId, region.datumId, payload.isHovered );

          },
          onSelectStart( payload ) {

            setSelectedDatumId( region.datumId, {
              source: payload.source || `${panel.viewId}-mark-select`,
              viewId: panel.viewId,
              shouldLog: true,
            } );

          },
        },
        {
          name: `demo3-${panel.viewId}-${region.regionId}-proxy`,
          position,
          renderOrder: panelStyle.renderOrderBase + 20,
          userData: { demo3Role: 'datum', demo3ViewId: panel.viewId, demo3DatumId: region.datumId },
        },
      );

    }

    function renderLoadingPanel( panel ) {

      const message = loadStatus === 'error'
        ? `Data unavailable\n${loadError?.message || 'Unknown error'}`
        : 'Loading local OWID data...';

      createTrackedTextPlane(
        panel.dynamicEntries,
        panel.contentRoot,
        { ...text.summaryBody, planeHeight: 0.22, text: message, textAlign: 'center' },
        getChartPosition( 0, - 0.02, workspace.contentZ + 0.035 ),
        { name: `${panel.viewId}-loading`, renderOrder: panelStyle.renderOrderBase + 10 },
      );

    }

    function renderTrendView( panel ) {

      if ( loadStatus !== 'ready' || ! dataset ) {

        renderLoadingPanel( panel );
        return;

      }

      createChartAxes( panel, { xLabel: `${dataset.startYear} to ${dataset.endYear}`, yLabel: 'Life expectancy' } );

      const lifeDomain = dataset.domains.lifeExpectancy;

      dataset.regionList.forEach( ( region ) => {

        const points = region.yearlySeries.map( ( yearEntry ) => new THREE.Vector3(
          lerpInRange( yearEntry.year, dataset.startYear, dataset.endYear, charts.left, charts.right ),
          lerpInRange( yearEntry.lifeExpectancy, lifeDomain.min, lifeDomain.max, charts.bottom, charts.top ),
          workspace.contentZ + 0.018,
        ) );
        const state = getRegionVisualState( region, panel.viewId );

        createTrackedLine(
          panel.dynamicEntries,
          panel.contentRoot,
          points,
          createLineMaterial( {
            color: state.selected ? charts.selectedColor : ( state.hovered ? charts.hoverColor : resolveRegionColor( region ).getHex() ),
            opacity: state.muted ? charts.linkedMutedOpacity : charts.lineOpacity,
          } ),
          { name: `demo3-trend-${region.regionId}`, renderOrder: panelStyle.renderOrderBase + 5 },
        );

        const endPoint = points.at( - 1 ) || new THREE.Vector3();
        createCircleMesh(
          panel.dynamicEntries,
          panel.contentRoot,
          state.highlighted ? charts.markRadius * 1.55 : charts.markRadius,
          getStyledRegionMaterial( region, panel.viewId ),
          endPoint.clone().setZ( workspace.contentZ + 0.032 ),
          { name: `demo3-trend-${region.regionId}-endpoint`, renderOrder: panelStyle.renderOrderBase + 10 },
        );
        createRegionProxy( panel, region, new THREE.CircleGeometry( charts.markProxyRadius, 24 ), endPoint.clone().setZ( workspace.contentZ + 0.06 ) );

        if ( state.highlighted || dataset.regionList.length <= 7 ) {

          createTrackedTextPlane(
            panel.dynamicEntries,
            panel.contentRoot,
            {
              ...text.chartLabel,
              text: truncateLabel( region.regionName, 16 ),
              fixedWidth: 120,
              minWidth: 120,
              maxTextWidth: 98,
              textColor: state.highlighted ? '#fff6dd' : '#dcecf5',
            },
            getChartPosition(
              THREE.MathUtils.clamp( endPoint.x + 0.055, charts.left + 0.055, charts.right - 0.055 ),
              THREE.MathUtils.clamp( endPoint.y, charts.bottom + 0.02, charts.top - 0.02 ),
              workspace.contentZ + 0.05,
            ),
            { name: `demo3-trend-${region.regionId}-label`, renderOrder: panelStyle.renderOrderBase + 12 },
          );

        }

      } );

    }

    function renderRankingView( panel ) {

      if ( loadStatus !== 'ready' || ! dataset ) {

        renderLoadingPanel( panel );
        return;

      }

      createChartAxes( panel, { xLabel: 'Regions ranked by gain', yLabel: 'Increase' } );

      const rankingRegions = dataset.rankingRegionIds.map( ( regionId ) => dataset.regionById.get( regionId ) ).filter( Boolean );
      const maxChange = Math.max( 0.1, dataset.domains.lifeExpectancyChange.max );
      const span = charts.right - charts.left;
      const step = span / Math.max( 1, rankingRegions.length );

      rankingRegions.forEach( ( region, index ) => {

        const x = charts.left + step * ( index + 0.5 );
        const barHeight = lerpInRange( region.lifeExpectancyChange, 0, maxChange, 0.025, charts.top - charts.bottom );
        const y = charts.bottom + barHeight * 0.5;
        const state = getRegionVisualState( region, panel.viewId );
        const width = Math.min( charts.barWidth, step * 0.72 );

        createRectangleMesh(
          panel.dynamicEntries,
          panel.contentRoot,
          width,
          barHeight,
          getStyledRegionMaterial( region, panel.viewId, { baseOpacity: 0.92 } ),
          getChartPosition( x, y, workspace.contentZ + 0.03 ),
          { name: `demo3-ranking-${region.regionId}-bar`, renderOrder: panelStyle.renderOrderBase + 8 },
        );
        createRegionProxy(
          panel,
          region,
          new THREE.PlaneGeometry( Math.max( width, charts.markProxyRadius ), Math.max( barHeight, charts.barProxyHeight ) ),
          getChartPosition( x, Math.max( y, charts.bottom + charts.barProxyHeight * 0.5 ), workspace.contentZ + 0.062 ),
        );
        createTrackedTextPlane(
          panel.dynamicEntries,
          panel.contentRoot,
          {
            ...text.chartLabel,
            text: `${region.regionName.split( ' ' ).map( ( part ) => part[ 0 ] ).join( '' )}\n${formatCompactNumber( region.lifeExpectancyChange, { maximumFractionDigits: 1 } )}`,
            fixedWidth: 86,
            minWidth: 86,
            maxTextWidth: 70,
            textColor: state.highlighted ? '#fff6dd' : '#dcecf5',
          },
          getChartPosition( x, charts.bottom - 0.06, workspace.contentZ + 0.044 ),
          { name: `demo3-ranking-${region.regionId}-label`, renderOrder: panelStyle.renderOrderBase + 12 },
        );

      } );

    }

    function renderComparisonView( panel ) {

      if ( loadStatus !== 'ready' || ! dataset ) {

        renderLoadingPanel( panel );
        return;

      }

      createChartAxes( panel, { xLabel: `GDP per capita, ${dataset.endYear}`, yLabel: 'CO2 per person' } );

      const gdpDomain = dataset.domains.gdpPerCapita;
      const co2Domain = dataset.domains.co2PerCapita;
      const maxPopulation = Math.max( ...dataset.regionList.map( ( region ) => region.latestPopulation ) );

      dataset.regionList.forEach( ( region ) => {

        const x = lerpInRange( Math.log10( Math.max( 100, region.latestGdpPerCapita ) ), gdpDomain.min, gdpDomain.max, charts.left, charts.right );
        const y = lerpInRange( Math.log10( Math.max( 0.001, region.latestCo2PerCapita ) ), co2Domain.min, co2Domain.max, charts.bottom, charts.top );
        const state = getRegionVisualState( region, panel.viewId );
        const radius = charts.markRadius * THREE.MathUtils.lerp( 0.85, 1.85, Math.sqrt( Math.max( 0.02, region.latestPopulation / maxPopulation ) ) );

        createCircleMesh(
          panel.dynamicEntries,
          panel.contentRoot,
          state.highlighted ? radius * 1.2 : radius,
          getStyledRegionMaterial( region, panel.viewId ),
          getChartPosition( x, y, workspace.contentZ + 0.035 ),
          { name: `demo3-comparison-${region.regionId}-dot`, renderOrder: panelStyle.renderOrderBase + 9 },
        );
        createRegionProxy(
          panel,
          region,
          new THREE.CircleGeometry( Math.max( charts.markProxyRadius, radius * 1.8 ), 24 ),
          getChartPosition( x, y, workspace.contentZ + 0.064 ),
        );

        if ( state.highlighted || dataset.regionList.length <= 7 ) {

          createTrackedTextPlane(
            panel.dynamicEntries,
            panel.contentRoot,
            {
              ...text.chartLabel,
              text: truncateLabel( region.regionName, 14 ),
              fixedWidth: 104,
              minWidth: 104,
              maxTextWidth: 82,
              textColor: state.highlighted ? '#fff6dd' : '#dcecf5',
            },
            getChartPosition(
              THREE.MathUtils.clamp( x, charts.left + 0.05, charts.right - 0.05 ),
              THREE.MathUtils.clamp( y + 0.045, charts.bottom + 0.035, charts.top - 0.015 ),
              workspace.contentZ + 0.052,
            ),
            { name: `demo3-comparison-${region.regionId}-label`, renderOrder: panelStyle.renderOrderBase + 12 },
          );

        }

      } );

    }

    function renderSummaryButton( panel, key, label, columnIndex, rowIndex, onPress ) {

      const width = buttons.width;
      const height = buttons.height;
      const gap = buttons.gap;
      const x = ( columnIndex - 2 ) * ( width + gap );
      const y = buttons.y + rowIndex * ( height + 0.026 );
      const hoverSources = new Set();
      const material = createMaterial( { color: buttons.color, opacity: 0.94 } );

      createRectangleMesh( panel.dynamicEntries, panel.contentRoot, width, height, material, getChartPosition( x, y, workspace.contentZ + 0.045 ), { name: `demo3-summary-button-${key}`, renderOrder: panelStyle.renderOrderBase + 14 } );
      createTrackedTextPlane( panel.dynamicEntries, panel.contentRoot, { ...text.button, text: label }, getChartPosition( x, y, workspace.contentZ + 0.058 ), { name: `demo3-summary-button-${key}-label`, renderOrder: panelStyle.renderOrderBase + 16 } );

      const surface = createSceneUiSurface( context, {
        parent: panel.contentRoot,
        width,
        height,
        position: [ x, y, workspace.contentZ + 0.073 ],
        name: `demo3-summary-button-${key}-surface`,
        handlers: {
          onHoverChange( payload ) {

            if ( payload.isHovered ) {

              hoverSources.add( payload.source );

            } else {

              hoverSources.delete( payload.source );

            }

            material.color.setHex( hoverSources.size > 0 ? buttons.hoverEmissive : buttons.color );

          },
          onSelectStart( payload ) {

            onPress?.( payload );

          },
        },
      } );
      panel.dynamicEntries.push( surface );

    }

    function buildSummaryText() {

      if ( loadStatus === 'loading' || loadStatus === 'idle' ) {

        return 'Loading the local OWID workspace bundle...\n\nThe four panels will show trend, ranking, comparison, and task context once the data is ready.';

      }

      if ( loadStatus === 'error' ) {

        return `Demo 3 data could not load.\n\n${loadError?.message || 'Unknown error'}\n\nRequired files live under demo3/data/.`;

      }

      const selectedRegion = getSelectedRegion();
      const hoveredRegion = getRegionByDatumId( currentHoveredDatumId );
      const taskAnswerRegion = getRegionByDatumId( currentSceneState.taskAnswer );
      const activeRegion = selectedRegion || hoveredRegion;
      const answerText = currentSceneState.taskSubmitted
        ? `Submitted: ${taskAnswerRegion?.regionName || 'No selected region'}`
        : 'Submission: not submitted';
      const regionText = activeRegion
        ? [
          `${activeRegion.regionName}`,
          `Life expectancy: ${formatLifeExpectancy( activeRegion.startLifeExpectancy )} to ${formatLifeExpectancy( activeRegion.endLifeExpectancy )}`,
          `Change: ${formatLifeChange( activeRegion.lifeExpectancyChange )}`,
          `GDP/person: ${formatCurrency( activeRegion.latestGdpPerCapita )}`,
          `CO2/person: ${formatCompactNumber( activeRegion.latestCo2PerCapita, { maximumFractionDigits: 2 } )} t`,
          `Population: ${formatPopulation( activeRegion.latestPopulation )}`,
        ].join( '\n' )
        : 'Select a region mark in any view to answer the task.';

      return [
        task.prompt,
        '',
        regionText,
        '',
        `Layout: ${formatLayoutLabel( currentSceneState.layoutMode )}`,
        `Focus: ${formatViewLabel( currentSceneState.focusedViewId )}`,
        `Linked highlighting: ${currentSceneState.linkedHighlightEnabled ? 'On' : 'Off'}`,
        answerText,
      ].join( '\n' );

    }

    function renderSummaryView( panel ) {

      createTrackedTextPlane(
        panel.dynamicEntries,
        panel.contentRoot,
        { ...text.summaryBody, text: buildSummaryText() },
        getChartPosition( 0, 0.035, workspace.contentZ + 0.035 ),
        { name: 'demo3-summary-body', renderOrder: panelStyle.renderOrderBase + 10 },
      );

      renderSummaryButton( panel, 'layout', `Layout\n${formatLayoutLabel( currentSceneState.layoutMode )}`, 0, 0, ( payload ) => cycleLayoutMode( payload.source || 'xr-summary-layout-button' ) );
      renderSummaryButton( panel, 'linked', `Linked\n${currentSceneState.linkedHighlightEnabled ? 'On' : 'Off'}`, 1, 0, ( payload ) => toggleLinkedHighlighting( payload.source || 'xr-summary-linked-button' ) );
      renderSummaryButton( panel, 'pin', `${currentSceneState.pinnedViewIds.includes( currentSceneState.focusedViewId ) ? 'Unpin' : 'Pin'}\nFocus`, 2, 0, ( payload ) => toggleFocusedPinnedView( payload.source || 'xr-summary-pin-button' ) );
      renderSummaryButton( panel, 'reset', 'Reset\nWorkspace', 3, 0, ( payload ) => resetWorkspace( payload.source || 'xr-summary-reset-button' ) );
      renderSummaryButton( panel, 'submit', currentSceneState.taskSubmitted ? 'Submitted' : 'Submit', 4, 0, ( payload ) => submitTaskAnswer( payload.source || 'xr-summary-submit-button' ) );

    }

    function renderAllPanelContent() {

      panelByViewId.forEach( ( panel ) => {

        clearPanelDynamicObjects( panel );

        if ( panel.viewId === DEMO3_VIEW_IDS.TREND ) {

          renderTrendView( panel );

        } else if ( panel.viewId === DEMO3_VIEW_IDS.RANKING ) {

          renderRankingView( panel );

        } else if ( panel.viewId === DEMO3_VIEW_IDS.COMPARISON ) {

          renderComparisonView( panel );

        } else {

          renderSummaryView( panel );

        }

      } );
      applyVisibilityAndOrder();

    }

    function createWorkspacePanel( viewId ) {

      const panelRoot = new THREE.Group();
      const contentRoot = new THREE.Group();
      const width = workspace.panelWidth;
      const height = workspace.panelHeight;
      const titleY = height * 0.5 - workspace.titleBarHeight * 0.5;
      const dynamicEntries = [];
      const hoverSources = new Set();
      const backgroundMaterial = createMaterial( { color: panelStyle.backgroundColor, opacity: panelStyle.backgroundOpacity } );
      const bodyMaterial = createMaterial( { color: panelStyle.bodyColor, opacity: panelStyle.bodyOpacity } );
      const titleMaterial = createMaterial( { color: panelStyle.titleColor, opacity: 0.92 } );
      const edgeMaterial = createLineMaterial( { color: panelStyle.edgeColor, opacity: panelStyle.edgeOpacity } );

      panelRoot.name = `demo3-panel-${viewId}`;
      contentRoot.name = `demo3-panel-${viewId}-content`;
      panelRoot.add( contentRoot );
      root.add( panelRoot );

      createRectangleMesh( staticEntries, panelRoot, width, height, backgroundMaterial, new THREE.Vector3( 0, 0, 0 ), { name: `demo3-panel-${viewId}-background`, renderOrder: panelStyle.renderOrderBase } );
      createRectangleMesh( staticEntries, panelRoot, width - 0.045, height - workspace.titleBarHeight - 0.058, bodyMaterial, new THREE.Vector3( 0, - workspace.titleBarHeight * 0.42, workspace.contentZ * 0.35 ), { name: `demo3-panel-${viewId}-body`, renderOrder: panelStyle.renderOrderBase + 1 } );
      createRectangleMesh( staticEntries, panelRoot, width - 0.026, workspace.titleBarHeight, titleMaterial, new THREE.Vector3( 0, titleY, workspace.contentZ * 0.5 ), { name: `demo3-panel-${viewId}-titlebar`, renderOrder: panelStyle.renderOrderBase + 2 } );
      const edge = createPlaneBorder( staticEntries, panelRoot, width, height, edgeMaterial, workspace.contentZ + 0.012, `demo3-panel-${viewId}-edge`, panelStyle.renderOrderBase + 3 );

      const titleController = createTextPlane( { ...text.panelTitle, text: formatViewLabel( viewId ) } );
      titleController.mesh.position.set( 0, titleY, workspace.contentZ + 0.03 );
      titleController.mesh.renderOrder = panelStyle.renderOrderBase + 12;
      panelRoot.add( titleController.mesh );
      staticEntries.push( {
        object3D: titleController.mesh,
        dispose() {

          titleController.mesh.removeFromParent();
          titleController.dispose();

        },
      } );

      staticEntries.push( createSceneUiSurface( context, {
        parent: panelRoot,
        width,
        height,
        position: [ 0, 0, workspace.contentZ + 0.02 ],
        name: `demo3-panel-${viewId}-background-surface`,
        handlers: {
          onHoverChange( payload ) {

            updatePanelHover( viewId, payload.source, payload.isHovered );

          },
          onSelectStart( payload ) {

            activateView( viewId, { source: payload.source || `${viewId}-panel-select`, shouldLog: true } );

          },
        },
      } ) );
      staticEntries.push( createSceneUiSurface( context, {
        parent: panelRoot,
        width: width - 0.026,
        height: workspace.titleBarHeight,
        position: [ 0, titleY, workspace.dragSurfaceZ ],
        name: `demo3-panel-${viewId}-titlebar-surface`,
        handlers: {
          onHoverChange( payload ) {

            updatePanelHover( viewId, payload.source, payload.isHovered );

          },
          onSelectStart( payload ) {

            beginPanelDrag( viewId, payload );

          },
          onSelectMove( payload ) {

            updatePanelDrag( payload );

          },
          onSelectEnd( payload ) {

            endPanelDrag( payload );

          },
        },
      } ) );

      const panel = {
        viewId,
        root: panelRoot,
        contentRoot,
        dynamicEntries,
        hoverSources,
        backgroundMaterial,
        titleMaterial,
        edgeMaterial: edge.material,
        titleController,
      };
      panelByViewId.set( viewId, panel );
      return panel;

    }

    function buildWorkspacePanels() {

      DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => createWorkspacePanel( viewId ) );
      applyLayoutModeTransforms( currentSceneState.layoutMode, { respectPinned: false, commit: true } );
      updatePanelShellVisuals();
      renderAllPanelContent();

    }

    function applySceneState( sceneState, { source = 'scene-state' } = {} ) {

      currentSceneState = normalizeDemo3SceneState( sceneState, currentSceneState, { defaultTaskId: DEMO3_DEFAULT_TASK_ID } );

      if ( dataset && currentSceneState.selectedDatumId && ! getRegionByDatumId( currentSceneState.selectedDatumId ) ) {

        currentSceneState.selectedDatumId = null;

      }

      if ( dataset && currentSceneState.taskAnswer && ! getRegionByDatumId( currentSceneState.taskAnswer ) ) {

        currentSceneState.taskAnswer = null;

      }

      clearHoverState();
      applyPanelLayoutsFromSceneState();
      applyVisibilityAndOrder();
      updatePanelShellVisuals();
      renderAllPanelContent();
      syncDesktopPanel();

      if ( source === 'replay-scene' ) {

        activePanelDrag = null;

      }

    }

    function getSceneStateForStorage() {

      return {
        demoId: currentSceneState.demoId,
        taskId: currentSceneState.taskId,
        layoutMode: currentSceneState.layoutMode,
        focusedViewId: currentSceneState.focusedViewId,
        selectedViewId: currentSceneState.selectedViewId,
        selectedDatumId: currentSceneState.selectedDatumId,
        linkedHighlightEnabled: currentSceneState.linkedHighlightEnabled,
        visibleViewIds: cloneArray( currentSceneState.visibleViewIds ),
        pinnedViewIds: cloneArray( currentSceneState.pinnedViewIds ),
        panelLayouts: clonePanelLayouts( currentSceneState.panelLayouts ),
        panelOrder: cloneArray( currentSceneState.panelOrder ),
        taskAnswer: currentSceneState.taskAnswer,
        taskSubmitted: currentSceneState.taskSubmitted,
      };

    }

    function getAnswerSummary() {

      return {
        xrDemoId: currentSceneState.demoId,
        xrTaskId: currentSceneState.taskId,
        xrWorkspaceLayoutMode: currentSceneState.layoutMode,
        xrWorkspaceFocusedViewId: currentSceneState.focusedViewId,
        xrWorkspaceSelectedViewId: currentSceneState.selectedViewId,
        xrWorkspaceSelectedDatumId: currentSceneState.selectedDatumId,
        xrWorkspaceLinkedHighlight: currentSceneState.linkedHighlightEnabled,
        xrWorkspaceVisibleViewIdsJson: jsonStringifyCompact( currentSceneState.visibleViewIds ),
        xrWorkspacePinnedViewIdsJson: jsonStringifyCompact( currentSceneState.pinnedViewIds ),
        xrWorkspacePanelLayoutJson: jsonStringifyCompact( currentSceneState.panelLayouts ),
      };

    }

    function rebuildDesktopRegionButtons() {

      if ( ! desktopRefs.regionRow || ! desktopRefs.regionButtons ) {

        return;

      }

      desktopRefs.regionRow.replaceChildren();
      desktopRefs.regionButtons.clear();

      if ( loadStatus !== 'ready' || ! dataset ) {

        const loading = createStyledElement( 'p', desktopPanel.detail, loadStatus === 'error' ? 'Data unavailable.' : 'Loading regions...' );
        desktopRefs.regionRow.appendChild( loading );
        return;

      }

      dataset.rankingRegionIds
        .map( ( regionId ) => dataset.regionById.get( regionId ) )
        .filter( Boolean )
        .forEach( ( region ) => {

          const button = createStyledElement( 'button', desktopPanel.button, region.regionName );
          button.type = 'button';
          button.addEventListener( 'click', () => {

            setSelectedDatumId( region.datumId, {
              source: `desktop-region-${region.regionId}`,
              viewId: currentSceneState.selectedViewId,
              shouldLog: true,
            } );

          } );
          desktopRefs.regionButtons.set( region.datumId, button );
          desktopRefs.regionRow.appendChild( button );

        } );

    }

    function syncDesktopPanel() {

      if ( ! desktopRefs.status ) {

        return;

      }

      const selectedRegion = getSelectedRegion();
      const taskAnswerRegion = getRegionByDatumId( currentSceneState.taskAnswer );
      desktopRefs.status.textContent = [
        `Layout: ${formatLayoutLabel( currentSceneState.layoutMode )}`,
        `Focus: ${formatViewLabel( currentSceneState.focusedViewId )}`,
        `Selected view: ${formatViewLabel( currentSceneState.selectedViewId )}`,
        `Linked highlighting: ${currentSceneState.linkedHighlightEnabled ? 'On' : 'Off'}`,
        currentSceneState.taskSubmitted ? `Submitted answer: ${taskAnswerRegion?.regionName || 'No selected region'}` : 'Task not submitted',
      ].join( '\n' );
      desktopRefs.detail.textContent = selectedRegion
        ? `${selectedRegion.regionName}: ${formatLifeChange( selectedRegion.lifeExpectancyChange )} from ${dataset?.startYear || 2000} to ${dataset?.endYear || 'latest'}.\nGDP/person ${formatCurrency( selectedRegion.latestGdpPerCapita )}, CO2/person ${formatCompactNumber( selectedRegion.latestCo2PerCapita, { maximumFractionDigits: 2 } )} t, population ${formatPopulation( selectedRegion.latestPopulation )}.`
        : 'Select a region in the 3D workspace or from the region buttons.';

      desktopRefs.layoutButtons?.forEach( ( button, layoutMode ) => {

        const active = currentSceneState.layoutMode === layoutMode;
        button.textContent = active ? `${formatLayoutLabel( layoutMode )} Active` : formatLayoutLabel( layoutMode );
        button.setAttribute( 'style', getButtonStyle( desktopPanel, true ) );

      } );
      desktopRefs.viewButtons?.forEach( ( button, viewId ) => {

        const active = currentSceneState.focusedViewId === viewId || currentSceneState.selectedViewId === viewId;
        const label = formatViewLabel( viewId ).replace( ' View', '' );
        button.textContent = active ? `${label} Active` : label;
        button.setAttribute( 'style', getButtonStyle( desktopPanel, true ) );

      } );
      desktopRefs.regionButtons?.forEach( ( button, datumId ) => {

        const active = currentSceneState.selectedDatumId === datumId;
        button.setAttribute( 'style', getButtonStyle( desktopPanel, true ) );
        button.textContent = `${active ? '* ' : ''}${getRegionByDatumId( datumId )?.regionName || datumId}`;

      } );

      const linkedButton = desktopRefs.actionButtons?.get( 'linked' );
      const pinButton = desktopRefs.actionButtons?.get( 'pin' );
      const submitButton = desktopRefs.actionButtons?.get( 'submit' );

      if ( linkedButton ) {

        linkedButton.textContent = `Linked ${currentSceneState.linkedHighlightEnabled ? 'On' : 'Off'}`;

      }

      if ( pinButton ) {

        pinButton.textContent = currentSceneState.pinnedViewIds.includes( currentSceneState.focusedViewId ) ? 'Unpin Focus' : 'Pin Focus';

      }

      if ( submitButton ) {

        submitButton.disabled = ! currentSceneState.selectedDatumId;
        submitButton.textContent = currentSceneState.taskSubmitted ? 'Submitted' : 'Submit';
        submitButton.setAttribute( 'style', getButtonStyle( desktopPanel, Boolean( currentSceneState.selectedDatumId ) ) );

      }

    }

    function buildDesktopPanel() {

      const node = createStyledElement( 'section', desktopPanel.root );
      const eyebrow = createStyledElement( 'p', desktopPanel.eyebrow, 'Demo 3 Workspace' );
      const titleNode = createStyledElement( 'h2', desktopPanel.title, 'Regional Development Workspace' );
      const body = createStyledElement( 'p', desktopPanel.body, task.prompt );
      const status = createStyledElement( 'p', desktopPanel.status, '' );
      const detail = createStyledElement( 'p', desktopPanel.detail, '' );
      const layoutLabel = createStyledElement( 'p', desktopPanel.sectionLabel, 'Layout' );
      const layoutRow = createStyledElement( 'div', desktopPanel.buttonRow );
      const viewLabel = createStyledElement( 'p', desktopPanel.sectionLabel, 'Views' );
      const viewRow = createStyledElement( 'div', desktopPanel.buttonRow );
      const regionLabel = createStyledElement( 'p', desktopPanel.sectionLabel, 'Regions' );
      const regionRow = createStyledElement( 'div', desktopPanel.buttonRow );
      const actionLabel = createStyledElement( 'p', desktopPanel.sectionLabel, 'Actions' );
      const actionRow = createStyledElement( 'div', desktopPanel.buttonRow );

      desktopRefs.status = status;
      desktopRefs.detail = detail;
      desktopRefs.layoutButtons = new Map();
      desktopRefs.viewButtons = new Map();
      desktopRefs.regionRow = regionRow;
      desktopRefs.regionButtons = new Map();
      desktopRefs.actionButtons = new Map();

      LAYOUT_CYCLE.forEach( ( layoutMode ) => {

        const button = createStyledElement( 'button', desktopPanel.button, formatLayoutLabel( layoutMode ) );
        button.type = 'button';
        button.addEventListener( 'click', () => setLayoutMode( layoutMode, { source: `desktop-layout-${layoutMode}`, shouldLog: true } ) );
        desktopRefs.layoutButtons.set( layoutMode, button );
        layoutRow.appendChild( button );

      } );

      DEMO3_VIEW_ID_LIST.forEach( ( viewId ) => {

        const button = createStyledElement( 'button', desktopPanel.button, formatViewLabel( viewId ).replace( ' View', '' ) );
        button.type = 'button';
        button.addEventListener( 'click', () => activateView( viewId, { source: `desktop-view-${viewId}`, shouldLog: true } ) );
        desktopRefs.viewButtons.set( viewId, button );
        viewRow.appendChild( button );

      } );

      [
        [ 'linked', 'Linked', () => toggleLinkedHighlighting( 'desktop-linked-highlight-button' ) ],
        [ 'pin', 'Pin Focus', () => toggleFocusedPinnedView( 'desktop-pin-focused-view-button' ) ],
        [ 'cycle', 'Cycle Layout', () => cycleLayoutMode( 'desktop-layout-cycle-button' ) ],
        [ 'reset', 'Reset', () => resetWorkspace( 'desktop-reset-workspace-button' ) ],
        [ 'submit', 'Submit', () => submitTaskAnswer( 'desktop-task-submit-button' ) ],
      ].forEach( ( [ key, label, handler ] ) => {

        const button = createStyledElement( 'button', desktopPanel.button, label );
        button.type = 'button';
        button.addEventListener( 'click', handler );
        desktopRefs.actionButtons.set( key, button );
        actionRow.appendChild( button );

      } );

      node.append( eyebrow, titleNode, body, status, detail, layoutLabel, layoutRow, viewLabel, viewRow, regionLabel, regionRow, actionLabel, actionRow );
      context.setDesktopPanelNode?.( node );
      syncDesktopPanel();

    }

    function disposeStaticEntries() {

      staticEntries.forEach( ( entry ) => entry.dispose?.() );
      staticEntries.length = 0;

    }

    function loadDataset() {

      loadStatus = 'loading';
      renderAllPanelContent();
      rebuildDesktopRegionButtons();
      syncDesktopPanel();

      loadDemo3Dataset()
        .then( ( loadedDataset ) => {

          dataset = loadedDataset;
          loadStatus = 'ready';
          loadError = null;

          if ( currentSceneState.selectedDatumId && ! getRegionByDatumId( currentSceneState.selectedDatumId ) ) {

            currentSceneState.selectedDatumId = null;

          }

          if ( currentSceneState.taskAnswer && ! getRegionByDatumId( currentSceneState.taskAnswer ) ) {

            currentSceneState.taskAnswer = null;

          }

          renderAllPanelContent();
          rebuildDesktopRegionButtons();
          syncDesktopPanel();

        } )
        .catch( ( error ) => {

          loadStatus = 'error';
          loadError = error;
          dataset = null;
          renderAllPanelContent();
          rebuildDesktopRegionButtons();
          syncDesktopPanel();

        } );

    }

    return {
      activate() {

        context.sceneContentRoot.add( root );
        buildWorkspacePanels();
        buildDesktopPanel();
        loadDataset();

      },
      dispose() {

        activePanelDrag = null;
        clearHoverState();
        clearAllPanelDynamicObjects();
        disposeStaticEntries();
        root.removeFromParent();
        context.clearDesktopPanel?.();

      },
      update() {},
      getSceneStateForReplay() {

        commitAllPanelLayouts();
        return getSceneStateForStorage();

      },
      applySceneStateFromReplay( sceneState ) {

        applySceneState( sceneState, { source: 'replay-scene' } );

      },
      getAnswerSummary() {

        return getAnswerSummary();

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

          return {
            title: 'Demo 3 - Analytic Workspace',
            body: 'Use the four floating views to compare regional life expectancy, ranking, GDP, CO2, and task details in one coordinated XR workspace.',
            note: 'Workspace layout, panel transforms, linked highlighting, selection, and task submission are restored through semantic replay state.',
          };

        }

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

          return {
            title: 'Demo 3 - Analytic Workspace',
            body: 'AR is not the primary target for Demo 3, but the same authored workspace and semantic state model remain available.',
            note: 'Desktop and VR are the paper-facing validation modes for this scene.',
          };

        }

        return {
          title: 'Demo 3 - Analytic Workspace',
          body: 'Use the desktop controls or select marks directly in the 3D workspace to compare coordinated regional views.',
          note: 'Switch layouts, focus panels, select regions, submit an answer, and replay the workspace semantically.',
        };

      },
      onPresentationModeChange() {

        activePanelDrag = null;
        clearHoverState();
        updatePanelShellVisuals();
        renderAllPanelContent();
        syncDesktopPanel();

      },
      handleBackgroundSelect( payload = {} ) {

        clearHoverState();
        renderAllPanelContent();
        syncDesktopPanel();

        if ( payload.source ) {

          context.invalidateSceneHoverForSource?.( payload.source );

        }

      },
    };

  },
} );
