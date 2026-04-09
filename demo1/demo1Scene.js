import * as THREE from 'three';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createFloatingOrbitPanelShell } from '../scenes/core/floatingOrbitPanelShell.js';
import { loadDemo1Dataset } from './demo1Data.js';
import { demo1VisualConfig } from './demo1VisualConfig.js';
import { demo1LoggingConfig } from './demo1LoggingConfig.js';
import {
  DEMO1_COLOR_ENCODINGS,
  DEMO1_DEFAULT_YEAR,
  DEMO1_NAV_MODES,
  normalizeDemo1PanelPosition,
  normalizeDemo1PanelQuaternion,
  DEMO1_SCALE_LIMITS,
  normalizeDemo1ScaleFactor,
  normalizeDemo1SceneState,
  parseDemo1Conditions,
} from './demo1Conditions.js';
import { getDemo1Task } from './demo1Tasks.js';

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

function formatCurrency( value ) {

  if ( ! isFiniteNumber( value ) ) {

    return '--';

  }

  return `$${new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits: value >= 1000 ? 0 : 1,
  } ).format( value )}`;

}

function formatScaleFactor( value ) {

  return `${formatCompactNumber( value, { maximumFractionDigits: 2 } )}x`;

}

function formatPopulation( value ) {

  if ( ! isFiniteNumber( value ) || value <= 0 ) {

    return 'n/a';

  }

  if ( value >= 1e9 ) {

    return `${formatCompactNumber( value / 1e9, { maximumFractionDigits: 2 } )}B`;

  }

  if ( value >= 1e6 ) {

    return `${formatCompactNumber( value / 1e6, { maximumFractionDigits: 1 } )}M`;

  }

  if ( value >= 1e3 ) {

    return `${formatCompactNumber( value / 1e3, { maximumFractionDigits: 1 } )}K`;

  }

  return formatCompactNumber( value, { maximumFractionDigits: 0 } );

}

function formatAxisTick( value ) {

  if ( ! isFiniteNumber( value ) ) {

    return '--';

  }

  if ( value >= 1000 ) {

    return formatCurrency( value );

  }

  if ( value >= 1 ) {

    return formatCompactNumber( value, { maximumFractionDigits: 1 } );

  }

  return value.toFixed( 2 );

}

function lerpInRange( value, domainMin, domainMax, rangeMin, rangeMax ) {

  if ( ! isFiniteNumber( value ) || ! isFiniteNumber( domainMin ) || ! isFiniteNumber( domainMax ) || domainMin === domainMax ) {

    return ( rangeMin + rangeMax ) * 0.5;

  }

  const alpha = THREE.MathUtils.clamp( ( value - domainMin ) / ( domainMax - domainMin ), 0, 1 );
  return THREE.MathUtils.lerp( rangeMin, rangeMax, alpha );

}

function getButtonStyle( desktopPanelStyle, isEnabled ) {

  return isEnabled ? desktopPanelStyle.button : desktopPanelStyle.buttonDisabled;

}

function createTrackedMesh( collection, parent, geometry, material ) {

  const mesh = new THREE.Mesh( geometry, material );
  parent.add( mesh );
  collection.push( {
    object3D: mesh,
    dispose() {

      geometry.dispose();
      material.dispose();

    },
  } );
  return mesh;

}

function createTrackedLineSegments( collection, parent, geometry, material ) {

  const lineSegments = new THREE.LineSegments( geometry, material );
  parent.add( lineSegments );
  collection.push( {
    object3D: lineSegments,
    dispose() {

      geometry.dispose();
      material.dispose();

    },
  } );
  return lineSegments;

}

function createTrackedTextPlane( collection, parent, options, position, rotation = null ) {

  const controller = createTextPlane( options );
  controller.mesh.position.copy( position );

  if ( rotation ) {

    controller.mesh.rotation.copy( rotation );

  }

  parent.add( controller.mesh );
  collection.push( {
    object3D: controller.mesh,
    dispose() {

      controller.dispose();

    },
  } );
  return controller;

}

function buildButtonLabel( label, state ) {

  return `${label}\n${state}`;

}

export const demo1SceneDefinition = Object.freeze( {
  sceneKey: 'demo1',
  queryValue: '1',
  label: 'Demo 1 Scatterplot Baseline',
  loggingConfig: demo1LoggingConfig,
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return normalizeDemo1SceneState(
      candidateState,
      fallbackState,
      { defaultYear: DEMO1_DEFAULT_YEAR },
    );

  },
  createScene( context ) {

    const { plot, overview, xrPanel, desktopPanel, palettes, labelStyles } = demo1VisualConfig;
    const defaultSceneState = parseDemo1Conditions( window.location.search, {
      defaultYear: DEMO1_DEFAULT_YEAR,
    } );
    const root = new THREE.Group();
    const mainPlotRoot = new THREE.Group();
    const mainScaleRoot = new THREE.Group();
    const mainDynamicRoot = new THREE.Group();
    const overviewRoot = new THREE.Group();
    const overviewDynamicRoot = new THREE.Group();
    const xrPanelRoot = new THREE.Group();
    const dynamicObjects = [];
    const staticObjects = [];
    const uiSurfaces = [];
    const xrButtons = new Map();
    const pointHoverBySource = new Map();
    const tempMatrix = new THREE.Matrix4();
    const tempScaleVector = new THREE.Vector3();
    const tempMainWorldPosition = new THREE.Vector3();
    const tempMainLocalPosition = new THREE.Vector3();
    const lastLoggedPanelPosition = new THREE.Vector3();
    const lastLoggedPanelQuaternion = new THREE.Quaternion();
    const unitQuaternion = new THREE.Quaternion();
    const panelShell = createFloatingOrbitPanelShell( context, {
      panelRoot: xrPanelRoot,
      namePrefix: 'demo1-panel',
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
      faceOrbitCenter: true,
      lockVerticalOrientation: true,
      onPanelHoverChange( payload ) {

        updateHoveredPointFromSource( payload.source, null );
        updateXrPanelVisualState();

      },
      onTitleBarHoverChange( payload ) {

        updateHoveredPointFromSource( payload.source, null );
        updateXrPanelVisualState();

      },
      onDragStart( payload ) {

        updateHoveredPointFromSource( payload.source, null );
        updateXrPanelVisualState();

      },
      onDragMove( payload ) {

        if ( getDemo1LoggingTuning().logPanelTransformOnPanelDrag === true ) {

          recordPanelTransformIfNeeded( payload.source );

        }

        updateXrPanelVisualState();

      },
      onDragEnd( payload ) {

        if ( getDemo1LoggingTuning().logPanelTransformOnPanelDragEnd === true ) {

          recordPanelTransformIfNeeded( payload.source, {
            force: true,
            flushImmediately: getSceneStateLoggingConfig().flushOnPanelDragEnd === true,
          } );

        }

        updateXrPanelVisualState();

      },
    } );
    const panelBackground = panelShell.meshes.background;
    const panelBorder = panelShell.meshes.edge;
    const titleBarMesh = panelShell.meshes.titleBar;
    const panelTitle = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelTitle, text: 'Demo 1 Scatterplot' },
      new THREE.Vector3( 0, xrPanel.titleY, xrPanel.contentZ ),
    );
    const panelBodyText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelBody, text: 'Loading Demo 1 task...' },
      new THREE.Vector3( 0, xrPanel.bodyTopY, xrPanel.contentZ ),
    );
    const panelMetaText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelMeta, text: 'Preparing local OWID bundle...' },
      new THREE.Vector3( 0, xrPanel.metaY, xrPanel.contentZ ),
    );
    const panelSelectionText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelMeta, text: 'No point selected yet.' },
      new THREE.Vector3( 0, xrPanel.selectionY, xrPanel.contentZ ),
    );
    const panelFooterText = createTrackedTextPlane(
      staticObjects,
      xrPanelRoot,
      { ...labelStyles.panelMeta, text: 'Drag the title bar to move the panel. Use the buttons to navigate.' },
      new THREE.Vector3( 0, xrPanel.footerY, xrPanel.contentZ ),
    );
    const tooltip = createTextSprite( { ...labelStyles.tooltip, text: '' } );
    const selectedHighlightMain = new THREE.Mesh(
      new THREE.SphereGeometry( 1, 18, 14 ),
      new THREE.MeshBasicMaterial( {
        color: plot.selectedHighlightColor,
        transparent: true,
        opacity: plot.highlightOpacity,
        wireframe: true,
        toneMapped: false,
      } ),
    );
    const hoverHighlightMain = new THREE.Mesh(
      new THREE.SphereGeometry( 1, 18, 14 ),
      new THREE.MeshBasicMaterial( {
        color: plot.hoverHighlightColor,
        transparent: true,
        opacity: plot.highlightOpacity,
        wireframe: true,
        toneMapped: false,
      } ),
    );
    const selectedHighlightOverview = new THREE.Mesh(
      new THREE.SphereGeometry( 1, 18, 14 ),
      new THREE.MeshBasicMaterial( {
        color: plot.selectedHighlightColor,
        transparent: true,
        opacity: plot.highlightOpacity,
        wireframe: true,
        toneMapped: false,
      } ),
    );
    const hoverHighlightOverview = new THREE.Mesh(
      new THREE.SphereGeometry( 1, 18, 14 ),
      new THREE.MeshBasicMaterial( {
        color: plot.hoverHighlightColor,
        transparent: true,
        opacity: plot.highlightOpacity,
        wireframe: true,
        toneMapped: false,
      } ),
    );
    const desktopRefs = {
      navButton: null,
      overviewButton: null,
      submitButton: null,
      scaleSlider: null,
      scaleValue: null,
      taskValue: null,
      metaValue: null,
      selectionValue: null,
      statusValue: null,
    };

    let dataset = null;
    let loadStatus = 'loading';
    let loadError = null;
    let mainPointsMesh = null;
    let overviewPointsMesh = null;
    let currentPointEntries = [];
    let pointEntryById = new Map();
    let currentHoveredPointId = null;
    let hoverSequence = 0;
    let scaleCommitTimer = null;
    let lastPanelStateLogAt = 0;
    let currentSceneState = normalizeDemo1SceneState( defaultSceneState, null, {
      defaultYear: DEMO1_DEFAULT_YEAR,
    } );
    let lastLoggedScaleFactor = currentSceneState.scaleFactor;

    root.add( mainPlotRoot );
    root.add( overviewRoot );
    root.add( xrPanelRoot );
    mainPlotRoot.position.fromArray( plot.rootPosition );
    mainPlotRoot.add( mainScaleRoot );
    mainScaleRoot.add( mainDynamicRoot );
    overviewRoot.position.fromArray( overview.position );
    overviewRoot.add( overviewDynamicRoot );
    xrPanelRoot.visible = false;
    overviewRoot.visible = false;
    selectedHighlightMain.visible = false;
    hoverHighlightMain.visible = false;
    selectedHighlightOverview.visible = false;
    hoverHighlightOverview.visible = false;
    tooltip.sprite.visible = false;
    tooltip.sprite.renderOrder = 30;
    mainScaleRoot.add( selectedHighlightMain );
    mainScaleRoot.add( hoverHighlightMain );
    overviewDynamicRoot.add( selectedHighlightOverview );
    overviewDynamicRoot.add( hoverHighlightOverview );
    root.add( tooltip.sprite );

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || {
        minIntervalMs: 420,
        positionEpsilon: 0.04,
        quaternionAngleThresholdDeg: 3.5,
        flushOnNavModeChange: true,
        flushOnOverviewToggle: true,
        flushOnScaleChange: false,
        flushOnSelectionChange: true,
        flushOnTaskSubmit: true,
        flushOnPanelDragEnd: true,
      };

    }

    function getDemo1LoggingTuning() {

      return context.getLoggingConfig?.()?.demo1 || {
        scaleCommitDebounceMs: 320,
        scaleCommitMinDelta: 0.04,
        panelTransformCommitMinIntervalMs: 420,
        logPanelTransformOnPanelDrag: true,
        logPanelTransformOnPanelDragEnd: true,
        stableLabels: {
          navMode: 'Switch Demo 1 Nav Mode',
          overview: 'Toggle Demo 1 Overview',
          scale: 'Scale Demo 1 Plot',
          selection: 'Select Demo 1 Point',
          taskSubmit: 'Submit Demo 1 Task',
          movePanel: 'Move Demo 1 Panel',
        },
      };

    }

    function getCurrentPanelSceneState() {

      return panelShell.getPanelSceneState();

    }

    function getCommittedPanelSceneState() {

      const panelPosition = normalizeDemo1PanelPosition( currentSceneState.panelPosition, null );
      const panelQuaternion = normalizeDemo1PanelQuaternion( currentSceneState.panelQuaternion, null );

      if ( ! panelPosition || ! panelQuaternion ) {

        return null;

      }

      return {
        panelPosition,
        panelQuaternion,
      };

    }

    function commitPanelTransformToSceneState( panelPosition, panelQuaternion ) {

      const committedPanelState = {
        panelPosition: normalizeDemo1PanelPosition( panelPosition, null ),
        panelQuaternion: normalizeDemo1PanelQuaternion( panelQuaternion, null ),
      };

      currentSceneState.panelPosition = committedPanelState.panelPosition;
      currentSceneState.panelQuaternion = committedPanelState.panelQuaternion;

      return committedPanelState;

    }

    function commitCurrentPanelTransformToSceneState() {

      const nextPanelState = getCurrentPanelSceneState();
      return commitPanelTransformToSceneState( nextPanelState.panelPosition, nextPanelState.panelQuaternion );

    }

    function rememberPanelTransformAsLogged( panelState = getCommittedPanelSceneState() ?? getCurrentPanelSceneState(), now = performance.now() ) {

      lastLoggedPanelPosition.fromArray( panelState.panelPosition );
      lastLoggedPanelQuaternion.fromArray( panelState.panelQuaternion );
      lastPanelStateLogAt = now;

    }

    function recordPanelTransformIfNeeded( source, {
      force = false,
      flushImmediately = false,
    } = {} ) {

      const loggingConfig = getSceneStateLoggingConfig();
      const demo1Logging = getDemo1LoggingTuning();
      const nextState = getCurrentPanelSceneState();
      const positionChanged = lastLoggedPanelPosition.distanceTo( new THREE.Vector3().fromArray( nextState.panelPosition ) ) > loggingConfig.positionEpsilon;
      const rotationChanged = 2 * Math.acos( Math.min( 1, Math.max( - 1, Math.abs( lastLoggedPanelQuaternion.dot( new THREE.Quaternion().fromArray( nextState.panelQuaternion ) ) ) ) ) ) * 180 / Math.PI > loggingConfig.quaternionAngleThresholdDeg;
      const now = performance.now();
      const commitMinInterval = Number.isFinite( demo1Logging.panelTransformCommitMinIntervalMs )
        ? demo1Logging.panelTransformCommitMinIntervalMs
        : loggingConfig.minIntervalMs;

      if ( ! force ) {

        if ( ! positionChanged && ! rotationChanged ) {

          return false;

        }

        if ( now - lastPanelStateLogAt < Math.max( loggingConfig.minIntervalMs, commitMinInterval ) ) {

          return false;

        }

      }

      const committedPanelState = commitCurrentPanelTransformToSceneState();
      const didLog = context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( 'movePanel' ),
        flushImmediately,
      } ) === true;

      if ( didLog ) {

        rememberPanelTransformAsLogged( committedPanelState, now );

      }

      return didLog;

    }

    function getStableSceneLabel( key ) {

      return getDemo1LoggingTuning().stableLabels?.[ key ] || key;

    }

    function recordSceneChange( labelKey, source, {
      flushImmediately = false,
    } = {} ) {

      const didLog = context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( labelKey ),
        flushImmediately,
      } ) === true;

      if ( didLog ) {

        lastLoggedScaleFactor = currentSceneState.scaleFactor;

      }

      return didLog;

    }

    function clearScaleCommitTimer() {

      if ( scaleCommitTimer !== null ) {

        clearTimeout( scaleCommitTimer );
        scaleCommitTimer = null;

      }

    }

    function commitScaleChange( source = 'scene-scale', {
      force = false,
    } = {} ) {

      clearScaleCommitTimer();

      if ( ! force && Math.abs( currentSceneState.scaleFactor - lastLoggedScaleFactor ) < getDemo1LoggingTuning().scaleCommitMinDelta ) {

        return false;

      }

      return recordSceneChange( 'scale', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnScaleChange === true,
      } );

    }

    function scheduleScaleCommit( source = 'scene-scale' ) {

      clearScaleCommitTimer();
      scaleCommitTimer = setTimeout( () => {

        scaleCommitTimer = null;
        commitScaleChange( source );

      }, getDemo1LoggingTuning().scaleCommitDebounceMs );

    }

    function resolvePointColorHex( point ) {

      if ( currentSceneState.colorEncoding === DEMO1_COLOR_ENCODINGS.INCOME ) {

        return palettes.income[ point.incomeTier ] || palettes.income[ '5000-15000' ];

      }

      return palettes.region[ point.region ] || palettes.region.Other;

    }

    function getPopulationRadius( point ) {

      if ( ! dataset?.populationAvailable || ! dataset.domains.population || ! isFiniteNumber( point.population ) || point.population <= 0 ) {

        return plot.pointBaseRadius;

      }

      const domainMin = Math.cbrt( dataset.domains.population.min );
      const domainMax = Math.cbrt( dataset.domains.population.max );

      if ( domainMin === domainMax ) {

        return plot.pointBaseRadius;

      }

      const normalized = THREE.MathUtils.clamp(
        ( Math.cbrt( point.population ) - domainMin ) / ( domainMax - domainMin ),
        0,
        1,
      );
      return THREE.MathUtils.lerp( plot.pointMinRadius, plot.pointMaxRadius, normalized );

    }

    function getMainPointPosition( point ) {

      return new THREE.Vector3(
        lerpInRange(
          dataset.transformGdp( point.gdpPerCapita ),
          dataset.domains.transformedGdp.min,
          dataset.domains.transformedGdp.max,
          - plot.width * 0.5,
          plot.width * 0.5,
        ),
        plot.baseY + lerpInRange(
          point.lifeExpectancy,
          dataset.domains.lifeExpectancy.min,
          dataset.domains.lifeExpectancy.max,
          0,
          plot.height,
        ),
        lerpInRange(
          dataset.transformCo2( point.co2PerCapita ),
          dataset.domains.transformedCo2.min,
          dataset.domains.transformedCo2.max,
          - plot.depth * 0.5,
          plot.depth * 0.5,
        ),
      );

    }

    function getOverviewPointPosition( point ) {

      return new THREE.Vector3(
        lerpInRange(
          dataset.transformGdp( point.gdpPerCapita ),
          dataset.domains.transformedGdp.min,
          dataset.domains.transformedGdp.max,
          - overview.width * 0.5,
          overview.width * 0.5,
        ),
        lerpInRange(
          point.lifeExpectancy,
          dataset.domains.lifeExpectancy.min,
          dataset.domains.lifeExpectancy.max,
          0,
          overview.height,
        ),
        lerpInRange(
          dataset.transformCo2( point.co2PerCapita ),
          dataset.domains.transformedCo2.min,
          dataset.domains.transformedCo2.max,
          - overview.depth * 0.5,
          overview.depth * 0.5,
        ),
      );

    }

    function getCurrentTask() {

      return getDemo1Task( currentSceneState.taskId );

    }

    function getCurrentSelectedPoint() {

      return dataset?.getPoint( currentSceneState.dataYear, currentSceneState.selectedPointId ) || null;

    }

    function getCurrentDisplayPoint() {

      return dataset?.getPoint( currentSceneState.dataYear, currentHoveredPointId ) || getCurrentSelectedPoint();

    }

    function getSceneStateForStorage() {

      return {
        demoId: currentSceneState.demoId,
        dataYear: currentSceneState.dataYear,
        taskId: currentSceneState.taskId,
        navMode: currentSceneState.navMode,
        colorEncoding: currentSceneState.colorEncoding,
        overviewEnabled: currentSceneState.overviewEnabled,
        overviewVisible: currentSceneState.overviewVisible,
        overviewToggleCount: currentSceneState.overviewToggleCount,
        scaleFactor: currentSceneState.scaleFactor,
        selectedPointId: currentSceneState.selectedPointId,
        selectedPointIds: [ ...currentSceneState.selectedPointIds ],
        selectionCount: currentSceneState.selectionCount,
        taskAnswer: currentSceneState.taskAnswer,
        taskSubmitted: currentSceneState.taskSubmitted,
        panelPosition: normalizeDemo1PanelPosition( currentSceneState.panelPosition, null ),
        panelQuaternion: normalizeDemo1PanelQuaternion( currentSceneState.panelQuaternion, null ),
      };

    }

    function getAnswerSummary() {

      return {
        xrDemoId: currentSceneState.demoId,
        xrTaskId: currentSceneState.taskId,
        xrNavMode: currentSceneState.navMode,
        xrOverviewVisible: currentSceneState.overviewVisible,
        xrOverviewToggleCount: currentSceneState.overviewToggleCount,
        xrScaleFactor: Number.parseFloat( currentSceneState.scaleFactor.toFixed( 3 ) ),
        xrSelectedPointCount: currentSceneState.selectionCount,
        xrSelectedPointIdsJson: JSON.stringify( currentSceneState.selectedPointIds ),
        xrLastSelectedPointId: currentSceneState.selectedPointId,
      };

    }

    function resolveHoverState() {

      let nextHovered = null;

      pointHoverBySource.forEach( ( entry ) => {

        if ( ! nextHovered || entry.sequence > nextHovered.sequence ) {

          nextHovered = entry;

        }

      } );

      currentHoveredPointId = nextHovered?.pointId ?? null;

    }

    function updateHighlightsAndTooltip() {

      const selectedPointId = currentSceneState.selectedPointId;
      const hoveredPointId = currentHoveredPointId;
      const selectedEntry = selectedPointId ? pointEntryById.get( selectedPointId ) : null;
      const hoveredEntry = hoveredPointId ? pointEntryById.get( hoveredPointId ) : null;
      const activePoint = getCurrentDisplayPoint();
      const activeEntry = hoveredEntry || selectedEntry;

      selectedHighlightMain.visible = Boolean( selectedEntry );
      selectedHighlightOverview.visible = Boolean( selectedEntry ) && overviewRoot.visible;
      hoverHighlightMain.visible = Boolean( hoveredEntry );
      hoverHighlightOverview.visible = Boolean( hoveredEntry ) && overviewRoot.visible;

      if ( selectedEntry ) {

        selectedHighlightMain.position.copy( selectedEntry.mainPosition );
        selectedHighlightMain.scale.setScalar( selectedEntry.mainRadius * 2.4 );
        selectedHighlightOverview.position.copy( selectedEntry.overviewPosition );
        selectedHighlightOverview.scale.setScalar( selectedEntry.overviewRadius * 2.8 );

      }

      if ( hoveredEntry ) {

        hoverHighlightMain.position.copy( hoveredEntry.mainPosition );
        hoverHighlightMain.scale.setScalar( hoveredEntry.mainRadius * 2.1 );
        hoverHighlightOverview.position.copy( hoveredEntry.overviewPosition );
        hoverHighlightOverview.scale.setScalar( hoveredEntry.overviewRadius * 2.5 );

      }

      if ( ! activePoint || ! activeEntry ) {

        tooltip.sprite.visible = false;
        return;

      }

      tempMainLocalPosition.copy( activeEntry.mainPosition );
      tempMainLocalPosition.y += activeEntry.mainRadius + plot.tooltipLift;
      tempMainLocalPosition.z += plot.tooltipForwardOffset;
      tempMainWorldPosition.copy( tempMainLocalPosition );
      mainScaleRoot.localToWorld( tempMainWorldPosition );
      tooltip.sprite.position.copy( tempMainWorldPosition );
      tooltip.setText(
        `${activePoint.entity}\nGDP ${formatCurrency( activePoint.gdpPerCapita )} | Life ${formatCompactNumber( activePoint.lifeExpectancy )} years\nCO2 ${formatCompactNumber( activePoint.co2PerCapita, { maximumFractionDigits: 2 } )} t/person | Pop ${formatPopulation( activePoint.population )}`,
      );
      tooltip.sprite.visible = true;

    }

    function clearHoverState() {

      pointHoverBySource.clear();
      currentHoveredPointId = null;
      updateHighlightsAndTooltip();

    }

    function updateHoveredPointFromSource( source, pointId ) {

      if ( pointId ) {

        pointHoverBySource.set( source, {
          pointId,
          sequence: hoverSequence += 1,
        } );

      } else {

        pointHoverBySource.delete( source );

      }

      resolveHoverState();
      updateHighlightsAndTooltip();

    }

    function normalizeCurrentSceneState() {

      const normalizedState = normalizeDemo1SceneState(
        currentSceneState,
        defaultSceneState,
        {
          supportedYears: dataset?.supportedYears || null,
          defaultYear: dataset?.initialYear || DEMO1_DEFAULT_YEAR,
        },
      );
      const selectedPoint = dataset?.getPoint( normalizedState.dataYear, normalizedState.selectedPointId );

      if ( ! selectedPoint ) {

        normalizedState.selectedPointId = null;
        normalizedState.selectedPointIds = [];
        normalizedState.selectionCount = 0;

        if ( normalizedState.taskSubmitted ) {

          normalizedState.taskSubmitted = false;
          normalizedState.taskAnswer = null;

        }

      }

      currentSceneState = normalizedState;
      return normalizedState;

    }

    function applyMainPlotScale() {

      mainScaleRoot.scale.setScalar( currentSceneState.scaleFactor );

    }

    function clearPointMeshes() {

      clearHoverState();
      pointEntryById = new Map();
      currentPointEntries = [];

      if ( mainPointsMesh ) {

        context.unregisterRaycastTarget( mainPointsMesh );
        mainPointsMesh.removeFromParent();
        mainPointsMesh.geometry.dispose();
        mainPointsMesh.material.dispose();
        mainPointsMesh = null;

      }

      if ( overviewPointsMesh ) {

        context.unregisterRaycastTarget( overviewPointsMesh );
        overviewPointsMesh.removeFromParent();
        overviewPointsMesh.geometry.dispose();
        overviewPointsMesh.material.dispose();
        overviewPointsMesh = null;

      }

    }

    function clearDynamicObjects() {

      clearPointMeshes();

      dynamicObjects.splice( 0 ).forEach( ( entry ) => {

        entry.object3D?.removeFromParent();
        entry.dispose?.();

      } );

    }

    function createAxisLabels() {

      const axisOrigin = new THREE.Vector3( - plot.width * 0.5, plot.baseY, - plot.depth * 0.5 );
      const axisPoints = [
        axisOrigin,
        new THREE.Vector3( plot.width * 0.5, plot.baseY, - plot.depth * 0.5 ),
        axisOrigin,
        new THREE.Vector3( - plot.width * 0.5, plot.baseY + plot.height, - plot.depth * 0.5 ),
        axisOrigin,
        new THREE.Vector3( - plot.width * 0.5, plot.baseY, plot.depth * 0.5 ),
      ];

      const platformMesh = createTrackedMesh(
        dynamicObjects,
        mainDynamicRoot,
        new THREE.BoxGeometry(
          plot.width + plot.platformPaddingX,
          plot.platformHeight,
          plot.depth + plot.platformPaddingZ,
        ),
        new THREE.MeshStandardMaterial( {
          color: plot.platformColor,
          emissive: plot.platformEmissive,
          roughness: 0.9,
          metalness: 0.04,
        } ),
      );
      platformMesh.position.set( 0, plot.platformHeight * 0.5, 0 );

      createTrackedLineSegments(
        dynamicObjects,
        mainDynamicRoot,
        new THREE.BufferGeometry().setFromPoints( axisPoints ),
        new THREE.LineBasicMaterial( {
          color: plot.axisColor,
          transparent: true,
          opacity: plot.axisOpacity,
          toneMapped: false,
        } ),
      );

      createTrackedTextPlane(
        dynamicObjects,
        mainDynamicRoot,
        { ...labelStyles.axisTitle, text: `${dataset.axisMetadata.x.title}\n(${dataset.axisMetadata.x.note})` },
        new THREE.Vector3( 0, plot.baseY + plot.height + 0.08, - plot.depth * 0.5 - 0.34 ),
      );
      createTrackedTextPlane(
        dynamicObjects,
        mainDynamicRoot,
        { ...labelStyles.axisTitle, text: `${dataset.axisMetadata.y.title}\n${dataset.axisMetadata.y.unit}` },
        new THREE.Vector3( - plot.width * 0.5 - 0.12, plot.baseY + plot.height + 0.16, - plot.depth * 0.5 - 0.08 ),
      );
      createTrackedTextPlane(
        dynamicObjects,
        mainDynamicRoot,
        { ...labelStyles.axisTitle, text: `${dataset.axisMetadata.z.title}\n(${dataset.axisMetadata.z.note})` },
        new THREE.Vector3( - plot.width * 0.5 - 0.42, plot.baseY + plot.height + 0.02, 0 ),
        new THREE.Euler( 0, Math.PI * 0.5, 0 ),
      );

      const xTicks = [ 1000, 5000, 15000, 30000, 60000 ]
        .filter( ( value ) => value >= dataset.domains.gdpPerCapita.min && value <= dataset.domains.gdpPerCapita.max );
      const zTicks = [ 0.01, 0.1, 1, 5, 20 ]
        .filter( ( value ) => value >= Math.max( 0.01, dataset.domains.co2PerCapita.min ) && value <= dataset.domains.co2PerCapita.max );
      const yTicks = Array.from( { length: plot.axisTickCount }, ( _, index ) => (
        dataset.domains.lifeExpectancy.min + ( index / Math.max( 1, plot.axisTickCount - 1 ) ) * ( dataset.domains.lifeExpectancy.max - dataset.domains.lifeExpectancy.min )
      ) );

      xTicks.forEach( ( value ) => {

        const x = lerpInRange(
          dataset.transformGdp( value ),
          dataset.domains.transformedGdp.min,
          dataset.domains.transformedGdp.max,
          - plot.width * 0.5,
          plot.width * 0.5,
        );
        createTrackedTextPlane(
          dynamicObjects,
          mainDynamicRoot,
          { ...labelStyles.tick, text: formatAxisTick( value ) },
          new THREE.Vector3( x, plot.baseY - 0.06, - plot.depth * 0.5 - 0.05 ),
        );

      } );

      yTicks.forEach( ( value ) => {

        const y = plot.baseY + lerpInRange(
          value,
          dataset.domains.lifeExpectancy.min,
          dataset.domains.lifeExpectancy.max,
          0,
          plot.height,
        );
        createTrackedTextPlane(
          dynamicObjects,
          mainDynamicRoot,
          { ...labelStyles.tick, text: formatAxisTick( value ) },
          new THREE.Vector3( - plot.width * 0.5 - 0.08, y, - plot.depth * 0.5 ),
          new THREE.Euler( 0, Math.PI * 0.5, 0 ),
        );

      } );

      zTicks.forEach( ( value ) => {

        const z = lerpInRange(
          dataset.transformCo2( value ),
          dataset.domains.transformedCo2.min,
          dataset.domains.transformedCo2.max,
          - plot.depth * 0.5,
          plot.depth * 0.5,
        );
        createTrackedTextPlane(
          dynamicObjects,
          mainDynamicRoot,
          { ...labelStyles.tick, text: formatAxisTick( value ) },
          new THREE.Vector3( - plot.width * 0.5 - 0.03, plot.baseY + 0.04, z ),
          new THREE.Euler( 0, Math.PI * 0.5, 0 ),
        );

      } );

      const overviewFrame = createTrackedMesh(
        dynamicObjects,
        overviewDynamicRoot,
        new THREE.BoxGeometry( overview.width + 0.08, overview.height + 0.08, overview.depth + 0.08 ),
        new THREE.MeshStandardMaterial( {
          color: overview.backgroundColor,
          emissive: overview.backgroundColor,
          transparent: true,
          opacity: overview.backgroundOpacity,
          roughness: 0.92,
          metalness: 0.02,
        } ),
      );
      overviewFrame.position.set( 0, overview.height * 0.5, 0 );
    }

    function rebuildPointMeshes() {

      clearPointMeshes();

      if ( loadStatus !== 'ready' || ! dataset ) {

        updateHighlightsAndTooltip();
        return;

      }

      const pointsForYear = dataset.getPointsForYear( currentSceneState.dataYear );

      if ( pointsForYear.length === 0 ) {

        updateHighlightsAndTooltip();
        return;

      }

      mainPointsMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry( 1, 18, 14 ),
        new THREE.MeshStandardMaterial( {
          color: 0xffffff,
          emissive: plot.pointEmissive,
          roughness: 0.46,
          metalness: 0.04,
        } ),
        pointsForYear.length,
      );
      overviewPointsMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry( 1, 14, 10 ),
        new THREE.MeshStandardMaterial( {
          color: 0xffffff,
          emissive: 0x07111a,
          roughness: 0.5,
          metalness: 0.03,
        } ),
        pointsForYear.length,
      );
      mainPointsMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
      overviewPointsMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
      mainDynamicRoot.add( mainPointsMesh );
      overviewDynamicRoot.add( overviewPointsMesh );
      currentPointEntries = pointsForYear.map( ( point, index ) => {

        const mainPosition = getMainPointPosition( point );
        const mainRadius = getPopulationRadius( point );
        const overviewPosition = getOverviewPointPosition( point );
        const overviewRadius = Math.max( 0.009, mainRadius * overview.pointScale );
        const colorHex = resolvePointColorHex( point );

        tempScaleVector.set( mainRadius, mainRadius, mainRadius );
        tempMatrix.compose( mainPosition, unitQuaternion, tempScaleVector );
        mainPointsMesh.setMatrixAt( index, tempMatrix );
        mainPointsMesh.setColorAt( index, new THREE.Color( colorHex ) );

        tempScaleVector.set( overviewRadius, overviewRadius, overviewRadius );
        tempMatrix.compose( overviewPosition, unitQuaternion, tempScaleVector );
        overviewPointsMesh.setMatrixAt( index, tempMatrix );
        overviewPointsMesh.setColorAt( index, new THREE.Color( colorHex ) );

        return {
          point,
          pointId: point.id,
          mainPosition,
          overviewPosition,
          mainRadius,
          overviewRadius,
          instanceIndex: index,
        };

      } );
      pointEntryById = new Map( currentPointEntries.map( ( entry ) => [ entry.pointId, entry ] ) );
      mainPointsMesh.instanceMatrix.needsUpdate = true;
      overviewPointsMesh.instanceMatrix.needsUpdate = true;

      if ( mainPointsMesh.instanceColor ) {

        mainPointsMesh.instanceColor.needsUpdate = true;

      }

      if ( overviewPointsMesh.instanceColor ) {

        overviewPointsMesh.instanceColor.needsUpdate = true;

      }

      context.registerRaycastTarget( mainPointsMesh, {
        onHoverChange( payload ) {

          const pointId = payload.isHovered && Number.isInteger( payload.instanceId )
            ? currentPointEntries[ payload.instanceId ]?.pointId ?? null
            : null;
          updateHoveredPointFromSource( payload.source, pointId );

        },
        onSelectStart( payload ) {

          if ( Number.isInteger( payload.instanceId ) ) {

            setSelectedPointId( currentPointEntries[ payload.instanceId ]?.pointId ?? null, {
              source: payload.source,
              shouldLog: true,
            } );

          }

        },
      } );
      context.registerRaycastTarget( overviewPointsMesh, {
        onHoverChange( payload ) {

          const pointId = payload.isHovered && Number.isInteger( payload.instanceId )
            ? currentPointEntries[ payload.instanceId ]?.pointId ?? null
            : null;
          updateHoveredPointFromSource( payload.source, pointId );

        },
        onSelectStart( payload ) {

          if ( Number.isInteger( payload.instanceId ) ) {

            setSelectedPointId( currentPointEntries[ payload.instanceId ]?.pointId ?? null, {
              source: payload.source,
              shouldLog: true,
            } );

          }

        },
      } );

      updateHighlightsAndTooltip();

    }

    function syncOverviewVisibility() {

      const shouldShowOverview = (
        loadStatus === 'ready' &&
        currentSceneState.navMode === DEMO1_NAV_MODES.OVERVIEW &&
        currentSceneState.overviewVisible === true
      );
      overviewRoot.visible = shouldShowOverview;
      selectedHighlightOverview.visible = shouldShowOverview && Boolean( currentSceneState.selectedPointId );
      hoverHighlightOverview.visible = shouldShowOverview && Boolean( currentHoveredPointId );

      if ( ! shouldShowOverview ) {

        pointHoverBySource.clear();
        resolveHoverState();
        updateHighlightsAndTooltip();

      }

    }

    function syncDesktopPanel() {

      if ( ! desktopRefs.taskValue ) {

        return;

      }

      const task = getCurrentTask();
      const selectedPoint = getCurrentSelectedPoint();
      const isReady = loadStatus === 'ready';
      const overviewEnabled = currentSceneState.navMode === DEMO1_NAV_MODES.OVERVIEW;

      desktopRefs.taskValue.textContent = `${task.prompt} ${task.hint}`;
      desktopRefs.metaValue.textContent = isReady
        ? `Year ${currentSceneState.dataYear} | Color ${currentSceneState.colorEncoding} | Scale ${formatScaleFactor( currentSceneState.scaleFactor )}`
        : 'Loading local OWID bundle...';
      desktopRefs.selectionValue.textContent = selectedPoint
        ? `${selectedPoint.entity} | ${selectedPoint.region} | GDP ${formatCurrency( selectedPoint.gdpPerCapita )} | CO2 ${formatCompactNumber( selectedPoint.co2PerCapita, { maximumFractionDigits: 2 } )} t/person`
        : 'No point selected yet.';
      desktopRefs.statusValue.textContent = loadStatus === 'error'
        ? loadError?.message || 'Demo 1 could not load its local data bundle.'
        : (
          currentSceneState.taskSubmitted
            ? `Submitted answer: ${currentSceneState.taskAnswer}`
            : 'Use wheel zoom or the slider to scale the plot, then select a point and submit.'
        );
      desktopRefs.navButton.textContent = `Mode: ${currentSceneState.navMode === DEMO1_NAV_MODES.OVERVIEW ? 'Overview' : 'Scale'}`;
      desktopRefs.overviewButton.textContent = overviewEnabled
        ? `Overview: ${currentSceneState.overviewVisible ? 'Visible' : 'Hidden'}`
        : 'Overview Disabled';
      desktopRefs.overviewButton.disabled = ! isReady || ! overviewEnabled;
      desktopRefs.overviewButton.setAttribute( 'style', getButtonStyle( desktopPanel, isReady && overviewEnabled ) );
      desktopRefs.navButton.disabled = ! isReady;
      desktopRefs.navButton.setAttribute( 'style', getButtonStyle( desktopPanel, isReady ) );
      desktopRefs.submitButton.disabled = ! isReady || ! selectedPoint;
      desktopRefs.submitButton.setAttribute( 'style', getButtonStyle( desktopPanel, isReady && Boolean( selectedPoint ) ) );
      desktopRefs.scaleSlider.disabled = ! isReady;
      desktopRefs.scaleSlider.min = String( DEMO1_SCALE_LIMITS.min );
      desktopRefs.scaleSlider.max = String( DEMO1_SCALE_LIMITS.max );
      desktopRefs.scaleSlider.step = '0.01';
      desktopRefs.scaleSlider.value = String( currentSceneState.scaleFactor );
      desktopRefs.scaleValue.textContent = `Scale ${formatScaleFactor( currentSceneState.scaleFactor )}`;

    }

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

    function syncXrPanel() {

      const task = getCurrentTask();
      const selectedPoint = getCurrentSelectedPoint();
      const isReady = loadStatus === 'ready';
      const overviewEnabled = currentSceneState.navMode === DEMO1_NAV_MODES.OVERVIEW;

      panelBodyText.setText( `${task.prompt}\n${task.hint}` );
      panelMetaText.setText(
        isReady
          ? `Year ${currentSceneState.dataYear} | Color ${currentSceneState.colorEncoding} | Scale ${formatScaleFactor( currentSceneState.scaleFactor )}`
          : 'Loading local OWID bundle...',
      );
      panelSelectionText.setText(
        selectedPoint
          ? `${selectedPoint.entity} | ${selectedPoint.region} | GDP ${formatCurrency( selectedPoint.gdpPerCapita )}`
          : 'No point selected yet.',
      );
      panelFooterText.setText(
        loadStatus === 'error'
          ? `${loadError?.message || 'Missing local Demo 1 files.'}\nExpected: demo1/data/*.csv + *.metadata.json`
          : (
            currentSceneState.taskSubmitted
              ? `Submitted answer: ${currentSceneState.taskAnswer}`
              : 'Drag the title bar to move the panel. Use the buttons to switch mode, adjust scale, and submit.'
          ),
      );

      const navButton = xrButtons.get( 'nav' );
      const overviewButton = xrButtons.get( 'overview' );
      const scaleMinusButton = xrButtons.get( 'scale-minus' );
      const scalePlusButton = xrButtons.get( 'scale-plus' );
      const submitButton = xrButtons.get( 'submit' );

      if ( navButton ) {

        navButton.label = buildButtonLabel(
          'Mode',
          currentSceneState.navMode === DEMO1_NAV_MODES.OVERVIEW ? 'Overview' : 'Scale',
        );
        navButton.disabled = ! isReady;

      }

      if ( overviewButton ) {

        overviewButton.label = buildButtonLabel(
          'Overview',
          overviewEnabled
            ? ( currentSceneState.overviewVisible ? 'Visible' : 'Hidden' )
            : 'Disabled',
        );
        overviewButton.disabled = ! isReady || ! overviewEnabled;

      }

      if ( scaleMinusButton ) {

        scaleMinusButton.label = buildButtonLabel( 'Scale', '- 0.1' );
        scaleMinusButton.disabled = ! isReady;

      }

      if ( scalePlusButton ) {

        scalePlusButton.label = buildButtonLabel( 'Scale', '+ 0.1' );
        scalePlusButton.disabled = ! isReady;

      }

      if ( submitButton ) {

        submitButton.label = buildButtonLabel( 'Task', selectedPoint ? 'Submit' : 'Pick Point' );
        submitButton.disabled = ! isReady || ! selectedPoint;

      }

      syncXrButtonVisuals();

    }

    function syncAllUi() {

      syncOverviewVisibility();
      applyMainPlotScale();
      syncDesktopPanel();
      syncXrPanel();
      updateHighlightsAndTooltip();

    }

    function setSelectedPointId( pointId, {
      source = 'scene',
      shouldLog = true,
    } = {} ) {

      const normalizedPointId = typeof pointId === 'string' && pointId.trim().length > 0
        ? pointId
        : null;

      if ( normalizedPointId === currentSceneState.selectedPointId ) {

        return;

      }

      currentSceneState.selectedPointId = normalizedPointId;
      currentSceneState.selectedPointIds = normalizedPointId ? [ normalizedPointId ] : [];
      currentSceneState.selectionCount = currentSceneState.selectedPointIds.length;

      if ( currentSceneState.taskSubmitted ) {

        currentSceneState.taskSubmitted = false;
        currentSceneState.taskAnswer = null;

      }

      syncAllUi();

      if ( shouldLog ) {

        recordSceneChange( 'selection', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnSelectionChange === true,
        } );

      }

    }

    function setScaleFactor( nextScaleFactor, {
      source = 'scene-scale',
      shouldLog = true,
    } = {} ) {

      const normalizedScaleFactor = normalizeDemo1ScaleFactor( nextScaleFactor, currentSceneState.scaleFactor );

      if ( normalizedScaleFactor === currentSceneState.scaleFactor ) {

        return;

      }

      currentSceneState.scaleFactor = normalizedScaleFactor;
      syncAllUi();

      if ( shouldLog ) {

        scheduleScaleCommit( source );

      }

    }

    function setNavMode( nextNavMode, {
      source = 'scene-nav',
      shouldLog = true,
    } = {} ) {

      const normalizedNavMode = nextNavMode === DEMO1_NAV_MODES.OVERVIEW
        ? DEMO1_NAV_MODES.OVERVIEW
        : DEMO1_NAV_MODES.SCALE;

      if ( normalizedNavMode === currentSceneState.navMode ) {

        return;

      }

      currentSceneState.navMode = normalizedNavMode;
      currentSceneState.overviewEnabled = normalizedNavMode === DEMO1_NAV_MODES.OVERVIEW;
      currentSceneState.overviewVisible = normalizedNavMode === DEMO1_NAV_MODES.OVERVIEW;
      clearHoverState();
      syncAllUi();

      if ( shouldLog ) {

        recordSceneChange( 'navMode', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnNavModeChange === true,
        } );

      }

    }

    function toggleOverviewVisible( source = 'scene-overview' ) {

      if ( currentSceneState.navMode !== DEMO1_NAV_MODES.OVERVIEW ) {

        return;

      }

      currentSceneState.overviewVisible = ! currentSceneState.overviewVisible;
      currentSceneState.overviewToggleCount += 1;
      clearHoverState();
      syncAllUi();
      recordSceneChange( 'overview', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnOverviewToggle === true,
      } );

    }

    function submitTask( source = 'scene-submit' ) {

      if ( ! currentSceneState.selectedPointId ) {

        return;

      }

      currentSceneState.taskAnswer = currentSceneState.selectedPointId;
      currentSceneState.taskSubmitted = true;
      syncAllUi();
      recordSceneChange( 'taskSubmit', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnTaskSubmit === true,
      } );

    }

    function buildDesktopPanel() {

      const node = document.createElement( 'section' );
      node.setAttribute( 'style', desktopPanel.root );
      node.appendChild( createStyledElement( 'p', desktopPanel.eyebrow, 'reVISit-XR Demo 1' ) );
      node.appendChild( createStyledElement( 'h2', desktopPanel.title, 'Scatterplot Navigation Baseline' ) );
      node.appendChild( createStyledElement( 'p', desktopPanel.body, 'A local OWID world-development scatterplot with semantic provenance, reactive answers, and replay hydration.' ) );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Task' ) );
      desktopRefs.taskValue = createStyledElement( 'p', desktopPanel.detail, 'Loading Demo 1 task...' );
      node.appendChild( desktopRefs.taskValue );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Navigation' ) );
      const navRow = document.createElement( 'div' );
      navRow.setAttribute( 'style', desktopPanel.buttonRow );
      desktopRefs.navButton = createStyledElement( 'button', desktopPanel.button, 'Mode: Scale' );
      desktopRefs.overviewButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Overview Disabled' );
      desktopRefs.navButton.addEventListener( 'click', () => {

        setNavMode(
          currentSceneState.navMode === DEMO1_NAV_MODES.SCALE ? DEMO1_NAV_MODES.OVERVIEW : DEMO1_NAV_MODES.SCALE,
          { source: 'desktop-nav-button', shouldLog: true },
        );

      } );
      desktopRefs.overviewButton.addEventListener( 'click', () => toggleOverviewVisible( 'desktop-overview-button' ) );
      navRow.appendChild( desktopRefs.navButton );
      navRow.appendChild( desktopRefs.overviewButton );
      node.appendChild( navRow );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Scale' ) );
      desktopRefs.scaleValue = createStyledElement( 'p', desktopPanel.value, 'Scale 1.00x' );
      node.appendChild( desktopRefs.scaleValue );
      desktopRefs.scaleSlider = document.createElement( 'input' );
      desktopRefs.scaleSlider.type = 'range';
      desktopRefs.scaleSlider.setAttribute( 'style', desktopPanel.slider );
      desktopRefs.scaleSlider.addEventListener( 'input', () => {

        setScaleFactor( Number.parseFloat( desktopRefs.scaleSlider.value ), {
          source: 'desktop-scale-slider',
          shouldLog: true,
        } );

      } );
      desktopRefs.scaleSlider.addEventListener( 'change', () => commitScaleChange( 'desktop-scale-slider', { force: true } ) );
      node.appendChild( desktopRefs.scaleSlider );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Selection' ) );
      desktopRefs.selectionValue = createStyledElement( 'p', desktopPanel.detail, 'No point selected yet.' );
      node.appendChild( desktopRefs.selectionValue );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Status' ) );
      desktopRefs.statusValue = createStyledElement( 'p', desktopPanel.status, 'Loading local OWID bundle...' );
      node.appendChild( desktopRefs.statusValue );
      node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Scene Summary' ) );
      desktopRefs.metaValue = createStyledElement( 'p', desktopPanel.detail, 'Year 2023 | Color region | Scale 1.00x' );
      node.appendChild( desktopRefs.metaValue );
      desktopRefs.submitButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Submit Current Selection' );
      desktopRefs.submitButton.addEventListener( 'click', () => submitTask( 'desktop-submit-button' ) );
      node.appendChild( desktopRefs.submitButton );
      context.setDesktopPanelNode( node );

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

      mesh.position.set( position.x, position.y, xrPanel.contentZ + 0.012 );
      uiSurfaces.push( createSceneUiSurface( context, {
        parent: xrPanelRoot,
        width: xrPanel.buttonWidth,
        height: xrPanel.buttonHeight,
        position: [ position.x, position.y, xrPanel.contentZ + 0.045 ],
        name: `demo1-xr-button-${key}`,
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

            onPress( payload.source );

          },
        },
      } ) );
      xrButtons.set( key, button );
    }

    function buildXrPanelButtons() {

      createXrButton( 'nav', {
        label: buildButtonLabel( 'Mode', 'Scale' ),
        position: new THREE.Vector3( - xrPanel.buttonWidth - xrPanel.buttonGap, xrPanel.buttonRowTopY, 0 ),
        onPress( source ) {

          setNavMode(
            currentSceneState.navMode === DEMO1_NAV_MODES.SCALE ? DEMO1_NAV_MODES.OVERVIEW : DEMO1_NAV_MODES.SCALE,
            { source, shouldLog: true },
          );

        },
      } );
      createXrButton( 'overview', {
        label: buildButtonLabel( 'Overview', 'Disabled' ),
        position: new THREE.Vector3( 0, xrPanel.buttonRowTopY, 0 ),
        onPress( source ) {

          toggleOverviewVisible( source );

        },
      } );
      createXrButton( 'submit', {
        label: buildButtonLabel( 'Task', 'Pick Point' ),
        position: new THREE.Vector3( xrPanel.buttonWidth + xrPanel.buttonGap, xrPanel.buttonRowTopY, 0 ),
        onPress( source ) {

          submitTask( source );

        },
      } );
      createXrButton( 'scale-minus', {
        label: buildButtonLabel( 'Scale', '- 0.1' ),
        position: new THREE.Vector3( - 0.18, xrPanel.buttonRowBottomY, 0 ),
        onPress( source ) {

          setScaleFactor( currentSceneState.scaleFactor - 0.1, { source, shouldLog: true } );

        },
      } );
      createXrButton( 'scale-plus', {
        label: buildButtonLabel( 'Scale', '+ 0.1' ),
        position: new THREE.Vector3( 0.18, xrPanel.buttonRowBottomY, 0 ),
        onPress( source ) {

          setScaleFactor( currentSceneState.scaleFactor + 0.1, { source, shouldLog: true } );

        },
      } );

    }

    function syncDataDrivenScene() {

      normalizeCurrentSceneState();
      applyMainPlotScale();

      if ( loadStatus === 'ready' && dataset ) {

        clearDynamicObjects();
        createAxisLabels();
        rebuildPointMeshes();

      } else {

        clearDynamicObjects();

      }

      syncAllUi();

    }

    function applySceneState( sceneState, {
      source = 'scene-state',
      useExactPanelTransform = false,
      forceDefaultPanel = false,
    } = {} ) {

      if ( source === 'replay-scene' ) {

        clearScaleCommitTimer();
        clearHoverState();

      }

      currentSceneState = normalizeDemo1SceneState(
        sceneState,
        currentSceneState,
        {
          supportedYears: dataset?.supportedYears || null,
          defaultYear: dataset?.initialYear || DEMO1_DEFAULT_YEAR,
        },
      );

      const nextPanelPosition = normalizeDemo1PanelPosition( currentSceneState.panelPosition, null );
      const nextPanelQuaternion = normalizeDemo1PanelQuaternion( currentSceneState.panelQuaternion, null );
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

    }

    function ensureXrPanelPlacement( {
      forceDefault = false,
      useExactTransform = false,
    } = {} ) {

      const nextPanelPosition = normalizeDemo1PanelPosition( currentSceneState.panelPosition, null );
      const nextPanelQuaternion = normalizeDemo1PanelQuaternion( currentSceneState.panelQuaternion, null );
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

    function onWheel( event ) {

      if (
        loadStatus !== 'ready' ||
        context.getPresentationMode?.() !== PRESENTATION_MODES.DESKTOP ||
        context.getInteractionPolicy?.()?.canInteract === false
      ) {

        return;

      }

      event.preventDefault();
      const delta = - event.deltaY * 0.0012;
      setScaleFactor( currentSceneState.scaleFactor + delta, {
        source: 'desktop-wheel',
        shouldLog: true,
      } );

    }

    buildDesktopPanel();
    buildXrPanelButtons();
    syncAllUi();

    return {
      activate() {

        context.sceneContentRoot.add( root );
        ensureXrPanelPlacement();
        context.renderer.domElement.addEventListener( 'wheel', onWheel, { passive: false } );
        loadDemo1Dataset().then( ( loadedDataset ) => {

          dataset = loadedDataset;
          loadStatus = 'ready';
          loadError = null;
          currentSceneState = normalizeDemo1SceneState(
            currentSceneState,
            parseDemo1Conditions( window.location.search, {
              supportedYears: loadedDataset.supportedYears,
              defaultYear: loadedDataset.initialYear,
            } ),
            {
              supportedYears: loadedDataset.supportedYears,
              defaultYear: loadedDataset.initialYear,
            },
          );
          syncDataDrivenScene();

        } ).catch( ( error ) => {

          loadStatus = 'error';
          loadError = error;
          dataset = null;
          syncDataDrivenScene();

        } );

      },
      dispose() {

        clearScaleCommitTimer();
        pointHoverBySource.clear();
        context.renderer.domElement.removeEventListener( 'wheel', onWheel );
        uiSurfaces.forEach( ( surface ) => surface.dispose() );
        panelShell.dispose();
        clearDynamicObjects();
        staticObjects.forEach( ( entry ) => {

          entry.object3D?.removeFromParent();
          entry.dispose?.();

        } );
        tooltip.dispose();
        selectedHighlightMain.geometry.dispose();
        selectedHighlightMain.material.dispose();
        hoverHighlightMain.geometry.dispose();
        hoverHighlightMain.material.dispose();
        selectedHighlightOverview.geometry.dispose();
        selectedHighlightOverview.material.dispose();
        hoverHighlightOverview.geometry.dispose();
        hoverHighlightOverview.material.dispose();
        root.removeFromParent();
        context.clearDesktopPanel();

      },
      update( deltaSeconds ) {

        if ( context.getPresentationMode?.() !== PRESENTATION_MODES.DESKTOP ) {

          panelShell.updateRuntimePlacement( { deltaSeconds } );

        }

      },
      getSceneStateForReplay() {

        return getSceneStateForStorage();

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
            title: 'Demo 1 - Scatterplot Baseline',
            body: 'Select points in a 3D world-development scatterplot and compare scale-only navigation with overview-assisted navigation.',
            note: 'Replay restores semantic scene state: nav mode, overview visibility, scale, selection, and task submission.',
          };

        }

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

          return {
            title: 'Demo 1 - Scatterplot Baseline',
            body: 'AR is not the target mode for this demo, but the scatterplot scene still uses the same semantic replay pipeline.',
            note: 'Desktop and VR are the primary paper-facing modes for Demo 1.',
          };

        }

        return {
          title: 'Demo 1 - Scatterplot Baseline',
          body: 'Use the desktop panel and wheel zoom to navigate a semantic 3D scatterplot baseline built for study embedding and replay.',
          note: 'Switch between scale-only and overview-assisted navigation from the scene controls.',
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
