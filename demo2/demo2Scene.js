import * as THREE from 'three';
import { mesh as buildTopojsonMesh } from 'topojson-client';
import { INTERACTORS, PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import { createTextSprite } from '../scenes/core/textSprite.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createFloatingOrbitPanelShell } from '../scenes/core/floatingOrbitPanelShell.js';
import { createXYMoveHandle } from '../scenes/core/xyMoveHandle.js';
import { loadDemo2Dataset } from './demo2Data.js';
import { demo2VisualConfig } from './demo2VisualConfig.js';
import { demo2LoggingConfig } from './demo2LoggingConfig.js';
import {
  DEMO2_DEFAULT_FOCUSED_COUNTRY_ID,
  DEMO2_DEFAULT_GLOBE_YAW_DEG,
  DEMO2_DEFAULT_MAP_DISPLAY_MODE,
  DEMO2_DEFAULT_TASK_ID,
  DEMO2_DEFAULT_THRESHOLD,
  DEMO2_DEFAULT_YEAR,
  DEMO2_DIRECTION_MODES,
  DEMO2_MAP_DISPLAY_MODES,
  DEMO2_THRESHOLD_PRESETS,
  normalizeDemo2GlobeAnchorPosition,
  normalizeDemo2PanelPosition,
  normalizeDemo2PanelQuaternion,
  normalizeDemo2SceneState,
  normalizeMapDisplayMode,
  parseDemo2Conditions,
} from './demo2Conditions.js';
import { getDemo2Task } from './demo2Tasks.js';

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function pickNumber( value, fallback ) {

  return isFiniteNumber( value ) ? value : fallback;

}

function pickColor( value, fallback ) {

  return typeof value === 'number' || typeof value === 'string' ? value : fallback;

}

function resolveDemo2GlobeMoveHandleConfig( globe = {} ) {

  const nested = globe.xyMoveHandle || {};

  return {
    withXYMoveBar: nested.withXYMoveBar !== false,
    floorY: pickNumber( nested.floorY, pickNumber( globe.handleFloorY, 0.035 ) ),
    lineRadius: pickNumber( nested.lineRadius, pickNumber( globe.handleLineRadius, 0.01 ) ),
    ringRadius: pickNumber( nested.ringRadius, pickNumber( globe.handleRingRadius, 0.17 ) ),
    ringTubeRadius: pickNumber( nested.ringTubeRadius, pickNumber( globe.handleRingTubeRadius, 0.012 ) ),
    discRadius: pickNumber( nested.discRadius, pickNumber( globe.handleDiscRadius, 0.14 ) ),
    discHeight: pickNumber( nested.discHeight, 0.012 ),
    showDisc: nested.showDisc !== false,
    arrowOffset: pickNumber( nested.arrowOffset, pickNumber( globe.handleArrowOffset, 0.17 ) ),
    arrowLift: pickNumber( nested.arrowLift, pickNumber( globe.handleArrowLift, 0.065 ) ),
    interactiveRadius: pickNumber( nested.interactiveRadius, pickNumber( globe.handleInteractiveRadius, 0.2 ) ),
    interactiveHeight: pickNumber( nested.interactiveHeight, 0.14 ),
    minMoveDistance: pickNumber( nested.minMoveDistance, 0.005 ),
    lineColor: pickColor( nested.lineColor, 0x88c9f3 ),
    lineEmissive: pickColor( nested.lineEmissive, 0x133349 ),
    lineOpacity: pickNumber( nested.lineOpacity, 0.8 ),
    ringColor: pickColor( nested.ringColor, 0x7fc9ff ),
    ringEmissive: pickColor( nested.ringEmissive, 0x17364a ),
    ringOpacity: pickNumber( nested.ringOpacity, 0.82 ),
    discColor: pickColor( nested.discColor, 0x2c4860 ),
    discOpacity: pickNumber( nested.discOpacity, 0.26 ),
    arrowColor: pickColor( nested.arrowColor, 0xbfe7ff ),
    arrowEmissive: pickColor( nested.arrowEmissive, 0x1b4760 ),
    arrowOpacity: pickNumber( nested.arrowOpacity, 0.86 ),
  };

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

function formatMapDisplayMode( value ) {

  if ( value === DEMO2_MAP_DISPLAY_MODES.FLAT ) {

    return '2D';

  }

  if ( value === DEMO2_MAP_DISPLAY_MODES.BOTH ) {

    return 'Both';

  }

  return '3D';

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

function latLonToFlatMapVector3( latDeg, lonDeg, flatMapConfig, lift = flatMapConfig.nodeLift || 0 ) {

  const width = Math.max( 0.01, flatMapConfig.width || 1 );
  const height = Math.max( 0.01, flatMapConfig.height || 1 );

  return new THREE.Vector3(
    ( lonDeg / 180 ) * ( width / 2 ),
    lift,
    - ( latDeg / 90 ) * ( height / 2 ),
  );

}

function createFlatArcPoints( start, end, arcHeight, segments ) {

  const safeSegments = Math.max( 4, Math.round( segments ) );
  const points = [];
  const baseY = Math.max( start.y, end.y );

  for ( let index = 0; index <= safeSegments; index += 1 ) {

    const t = index / safeSegments;
    const point = start.clone().lerp( end, t );
    point.y = baseY + Math.sin( Math.PI * t ) * arcHeight;
    points.push( point );

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

function appendFlatMapSegmentPositions( positions, startCoordinate, endCoordinate, flatMapConfig ) {

  const startLon = startCoordinate?.[ 0 ];
  const startLat = startCoordinate?.[ 1 ];
  const endLon = endCoordinate?.[ 0 ];
  const endLat = endCoordinate?.[ 1 ];

  if (
    ! isFiniteNumber( startLon ) ||
    ! isFiniteNumber( startLat ) ||
    ! isFiniteNumber( endLon ) ||
    ! isFiniteNumber( endLat ) ||
    Math.abs( startLon - endLon ) > 180
  ) {

    return;

  }

  const lift = flatMapConfig.boundaryLift || 0;
  const startPoint = latLonToFlatMapVector3( startLat, startLon, flatMapConfig, lift );
  const endPoint = latLonToFlatMapVector3( endLat, endLon, flatMapConfig, lift );

  positions.push(
    startPoint.x, startPoint.y, startPoint.z,
    endPoint.x, endPoint.y, endPoint.z,
  );

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

    const { globe, flatMap = {}, interaction = {}, xrPanel, desktopPanel, palettes, labelStyles } = demo2VisualConfig;
    const debugRayEnabled = new URLSearchParams( window.location.search ).get( 'debugRay' ) === '1';
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
    const flatMapRoot = new THREE.Group();
    const flatMapBoundaryRoot = new THREE.Group();
    const flatMapArcRoot = new THREE.Group();
    const flatMapNodeRoot = new THREE.Group();
    const flatMapLabelRoot = new THREE.Group();
    const xrPanelRoot = new THREE.Group();
    const staticObjects = [];
    const dynamicObjects = [];
    const uiSurfaces = [];
    const xrButtons = new Map();
    const desktopRefs = {};
    const nodeEntriesById = new Map();
    const targetRecordsById = new Map();
    const targetRecordByObject = new WeakMap();
    const localTargetBySource = new Map();
    const mapRaycastObjectsBySpace = new Map( [
      [ DEMO2_MAP_DISPLAY_MODES.GLOBE, new Set() ],
      [ DEMO2_MAP_DISPLAY_MODES.FLAT, new Set() ],
    ] );
    const demo2MapSpaces = Object.freeze( {
      GLOBE: DEMO2_MAP_DISPLAY_MODES.GLOBE,
      FLAT: DEMO2_MAP_DISPLAY_MODES.FLAT,
    } );
    const demo2RaycastRoles = Object.freeze( {
      NODE: 'node',
      FLOW: 'flow',
      GLOBE_SHELL: 'globe-shell',
      GLOBE_HANDLE: 'globe-handle',
    } );
    const defaultGlobeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
      globe.anchorDefaultPosition || globe.rootPosition,
    );
    const globeMoveHandleConfig = resolveDemo2GlobeMoveHandleConfig( globe );
    const lastLoggedPanelPosition = new THREE.Vector3();
    const lastLoggedPanelQuaternion = new THREE.Quaternion();
    const lastLoggedGlobeAnchorPosition = new THREE.Vector3().fromArray( defaultGlobeAnchorPosition );
    const globeInteractionSphere = new THREE.Sphere( new THREE.Vector3(), globe.interactionRadius );
    const tempGlobeWorldCenter = new THREE.Vector3();
    const tempGlobeWorldHit = new THREE.Vector3();
    const tempGlobeLocalHit = new THREE.Vector3();
    const tempGlobeRay = new THREE.Ray();
    const tempGlobeAnchorPosition = new THREE.Vector3();
    const tempResolverRay = new THREE.Ray();
    const tempResolverNodeWorldCenter = new THREE.Vector3();
    const tempResolverShellContactPoint = new THREE.Vector3();
    const tempResolverCandidateWorldPoint = new THREE.Vector3();
    const labelDefaultTintColor = new THREE.Color( 0xffffff );
    const labelSelectedTintColor = new THREE.Color( 0xffffff ).lerp(
      new THREE.Color( interaction.selectedLabelAccentColor ?? globe.selectedNodeHaloColor ?? 0xffd59a ),
      THREE.MathUtils.clamp( interaction.selectedLabelAccentStrength ?? 0.58, 0, 1 ),
    );
    let interactionSequence = 0;
    let dataset = null;
    let loadStatus = 'loading';
    let loadError = null;
    let currentSceneState = { ...defaultSceneState };
    let currentHoveredNodeId = null;
    let currentHoveredFlowId = null;
    let currentLocalTargetRecord = null;
    let currentLocalTargetSource = null;
    let selectedNodeSource = null;
    let selectedFlowSource = null;
    let currentVisibleFlows = [];
    let currentVisibleFlowEntries = [];
    let currentFlowEntryById = new Map();
    let currentFlowTargetIds = [];
    let currentBoundaryLines = null;
    let currentFlatBoundaryLines = null;
    let activeGlobeDrag = null;
    let activeGlobeMove = null;
    let globeMoveHandle = null;
    let lastLoggedGlobeYawDeg = currentSceneState.globeYawDeg;
    let lastGlobeYawLogAt = 0;
    let lastGlobeAnchorLogAt = 0;
    let xrReplayHoverLockActive = false;
    let lastResolverDebug = null;

    root.add( globeRoot );
    root.add( flatMapRoot );
    root.add( xrPanelRoot );
    globeRoot.position.fromArray( defaultGlobeAnchorPosition );
    flatMapRoot.position.fromArray( flatMap.position || [ 0, 0, 0 ] );
    globeRoot.add( globeYawRoot );
    globeYawRoot.add( globeBoundaryRoot );
    globeYawRoot.add( globeArcRoot );
    globeYawRoot.add( globeNodeRoot );
    globeYawRoot.add( globeLabelRoot );
    flatMapRoot.add( flatMapBoundaryRoot );
    flatMapRoot.add( flatMapArcRoot );
    flatMapRoot.add( flatMapNodeRoot );
    flatMapRoot.add( flatMapLabelRoot );

    const defaultDesktopCameraPosition = new THREE.Vector3( 0, 1.46, 0.12 );
    const defaultDesktopLookAt = new THREE.Vector3( 0, defaultGlobeAnchorPosition[ 1 ], defaultGlobeAnchorPosition[ 2 ] );
    const interactiveSources = [
      INTERACTORS.CONTROLLER_0,
      INTERACTORS.CONTROLLER_1,
      INTERACTORS.DESKTOP_POINTER,
    ];
    const xrControllerSources = [
      INTERACTORS.CONTROLLER_0,
      INTERACTORS.CONTROLLER_1,
    ];

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
        unregisterDemo2MapRaycastObject( mesh );
        baseDispose();

      };
      return mesh;

    }

    function isDemo2MapSpace( mapSpace ) {

      return mapSpace === demo2MapSpaces.GLOBE || mapSpace === demo2MapSpaces.FLAT;

    }

    function isDemo2MapSpaceActive( mapSpace, displayMode = currentSceneState.mapDisplayMode ) {

      if ( ! isDemo2MapSpace( mapSpace ) ) {

        return true;

      }

      const normalizedMode = normalizeMapDisplayMode( displayMode );

      return normalizedMode === DEMO2_MAP_DISPLAY_MODES.BOTH || normalizedMode === mapSpace;

    }

    function registerDemo2MapRaycastObject( object3D, mapSpace ) {

      if ( ! object3D || ! isDemo2MapSpace( mapSpace ) ) {

        return object3D;

      }

      object3D.userData.demo2MapSpace = mapSpace;
      mapRaycastObjectsBySpace.get( mapSpace )?.add( object3D );

      if ( isDemo2MapSpaceActive( mapSpace ) ) {

        object3D.layers.enable( 0 );

      } else {

        object3D.layers.disable( 0 );

      }

      return object3D;

    }

    function unregisterDemo2MapRaycastObject( object3D ) {

      if ( ! object3D ) {

        return;

      }

      mapRaycastObjectsBySpace.forEach( ( objects ) => objects.delete( object3D ) );

    }

    function setDemo2RaycastRole( object3D, role, targetId = null, mapSpace = null ) {

      if ( object3D ) {

        object3D.userData.demo2RaycastRole = role;
        object3D.userData.demo2RaycastId = typeof targetId === 'string' && targetId.trim().length > 0
          ? targetId.trim()
          : null;
        registerDemo2MapRaycastObject( object3D, mapSpace );

      }

      return object3D;

    }

    function resolveDemo2MapSpace( hitOrObject ) {

      let currentObject = hitOrObject?.object || hitOrObject || null;

      while ( currentObject ) {

        if ( isDemo2MapSpace( currentObject.userData?.demo2MapSpace ) ) {

          return currentObject.userData.demo2MapSpace;

        }

        currentObject = currentObject.parent;

      }

      return null;

    }

    function resolveDemo2RaycastRole( hit ) {

      let currentObject = hit?.object || null;

      while ( currentObject ) {

        if ( typeof currentObject.userData?.demo2RaycastRole === 'string' ) {

          return currentObject.userData.demo2RaycastRole;

        }

        currentObject = currentObject.parent;

      }

      return null;

    }

    function resolveDemo2RaycastTargetId( object3D ) {

      let currentObject = object3D;

      while ( currentObject ) {

        if ( typeof currentObject.userData?.demo2RaycastId === 'string' && currentObject.userData.demo2RaycastId.length > 0 ) {

          return currentObject.userData.demo2RaycastId;

        }

        currentObject = currentObject.parent;

      }

      return null;

    }

    function buildDemo2TargetId( kind, id ) {

      return `${kind}:${id}`;

    }

    function registerDemo2TargetRecord( targetRecord ) {

      if ( targetRecord?.targetId ) {

        targetRecordsById.set( targetRecord.targetId, targetRecord );

      }

      return targetRecord;

    }

    function unregisterDemo2TargetRecord( targetId ) {

      if ( typeof targetId === 'string' && targetId.length > 0 ) {

        targetRecordsById.delete( targetId );

      }

    }

    function attachDemo2TargetToObject( object3D, targetRecord, role = null, mapSpace = null ) {

      if ( ! object3D || ! targetRecord ) {

        return object3D;

      }

      targetRecordByObject.set( object3D, targetRecord );
      setDemo2RaycastRole( object3D, role || targetRecord.role || targetRecord.kind, targetRecord.id, mapSpace );
      return object3D;

    }

    function resolveDemo2TargetRecordFromObject( object3D ) {

      let currentObject = object3D;

      while ( currentObject ) {

        const targetRecord = targetRecordByObject.get( currentObject );

        if ( targetRecord ) {

          return targetRecord;

        }

        currentObject = currentObject.parent;

      }

      return null;

    }

    function resolveDemo2TargetRecordFromHit( hit ) {

      return resolveDemo2TargetRecordFromObject( hit?.object || null );

    }

    function sampleCurveSegmentPoints( curve, startT, endT, segments ) {

      const normalizedStart = THREE.MathUtils.clamp( startT, 0, 1 );
      const normalizedEnd = THREE.MathUtils.clamp( endT, normalizedStart, 1 );
      const safeSegments = Math.max( 4, Math.round( segments ) );
      const points = [];

      for ( let index = 0; index <= safeSegments; index += 1 ) {

        const t = THREE.MathUtils.lerp( normalizedStart, normalizedEnd, index / safeSegments );
        points.push( curve.getPoint( t ) );

      }

      return points;

    }

    function collectDemo2FrontHitCluster( sceneIntersections, maxDistanceDelta = globe.frontHitClusterDistance ) {

      const firstHit = sceneIntersections?.[ 0 ] ?? null;

      if ( ! firstHit ) {

        return [];

      }

      const maxDistanceBand = Math.max( 0, maxDistanceDelta || 0 );
      const cluster = [ firstHit ];

      for ( let index = 1; index < sceneIntersections.length; index += 1 ) {

        const hit = sceneIntersections[ index ];

        if ( ( hit.distance - firstHit.distance ) > maxDistanceBand ) {

          break;

        }

        cluster.push( hit );

      }

      return cluster;

    }

    function findNearestDemo2HitByRole( hits, role ) {

      return hits.find( ( hit ) => resolveDemo2RaycastRole( hit ) === role ) || null;

    }

    function resolveDemo2NodeRayMissDistance( nodeId, resolverContext, mapSpace = null ) {

      if ( ! nodeId || ! resolverContext?.rayOrigin || ! resolverContext?.rayDirection ) {

        return null;

      }

      const nodeEntry = nodeEntriesById.get( nodeId );

      const hitProxy = mapSpace === demo2MapSpaces.FLAT
        ? nodeEntry?.flatHitProxy
        : nodeEntry?.hitProxy;

      if ( ! hitProxy ) {

        return null;

      }

      hitProxy.getWorldPosition( tempResolverNodeWorldCenter );
      tempResolverRay.origin.copy( resolverContext.rayOrigin );
      tempResolverRay.direction.copy( resolverContext.rayDirection ).normalize();
      return Math.sqrt( tempResolverRay.distanceSqToPoint( tempResolverNodeWorldCenter ) );

    }

    function resolveDemo2ShellContactDistance( hit, firstHit ) {

      if ( ! hit?.object || ! firstHit?.point ) {

        return null;

      }

      const role = resolveDemo2RaycastRole( hit );
      const mapSpace = resolveDemo2MapSpace( hit );
      tempResolverShellContactPoint.copy( firstHit.point );

      if ( role === demo2RaycastRoles.NODE ) {

        const nodeId = resolveDemo2RaycastTargetId( hit.object );
        const nodeEntry = nodeEntriesById.get( nodeId );
        const hitProxy = mapSpace === demo2MapSpaces.FLAT
          ? nodeEntry?.flatHitProxy
          : nodeEntry?.hitProxy;

        if ( ! hitProxy ) {

          return null;

        }

        hitProxy.getWorldPosition( tempResolverCandidateWorldPoint );
        return tempResolverCandidateWorldPoint.distanceTo( tempResolverShellContactPoint );

      }

      if ( role === demo2RaycastRoles.FLOW && hit.point ) {

        tempResolverCandidateWorldPoint.copy( hit.point );
        return tempResolverCandidateWorldPoint.distanceTo( tempResolverShellContactPoint );

      }

      return null;

    }

    function buildDemo2ResolverCandidate( hit, firstHit, resolverContext ) {

      const role = resolveDemo2RaycastRole( hit ) || 'other';
      const id = resolveDemo2RaycastTargetId( hit.object );
      const mapSpace = resolveDemo2MapSpace( hit );
      const distance = typeof hit?.distance === 'number' ? hit.distance : null;
      const distanceFromFirst = isFiniteNumber( distance ) && isFiniteNumber( firstHit?.distance )
        ? distance - firstHit.distance
        : null;
      const rayMissDistance = role === demo2RaycastRoles.NODE
        ? resolveDemo2NodeRayMissDistance( id, resolverContext, mapSpace )
        : null;
      const shellContactDistance = resolveDemo2RaycastRole( firstHit ) === demo2RaycastRoles.GLOBE_SHELL
        ? resolveDemo2ShellContactDistance( hit, firstHit )
        : null;

      return {
        hit,
        role,
        id,
        mapSpace,
        distance,
        distanceFromFirst,
        rayMissDistance,
        shellContactDistance,
      };

    }

    function formatResolverCandidateSummary( candidate ) {

      if ( ! candidate ) {

        return 'none';

      }

      const targetLabel = candidate.id ? `${candidate.role}:${candidate.id}` : candidate.role;
      const mapSpaceLabel = candidate.mapSpace ? ` ${candidate.mapSpace}` : '';
      const distanceLabel = formatDebugDistance( candidate.distance );
      const missLabel = isFiniteNumber( candidate.rayMissDistance )
        ? ` miss=${formatDebugDistance( candidate.rayMissDistance )}`
        : '';
      const contactLabel = isFiniteNumber( candidate.shellContactDistance )
        ? ` contact=${formatDebugDistance( candidate.shellContactDistance )}`
        : '';
      return `${targetLabel}${mapSpaceLabel}@${distanceLabel}${missLabel}${contactLabel}`;

    }

    function buildDemo2ResolverResult( {
      resolvedHit = null,
      firstCandidate = null,
      candidateRecords = [],
      clusterRecords = [],
      overrideReason = 'preserve-first-hit',
      shellAssistSummary = null,
    } = {} ) {

      const resolvedCandidate = candidateRecords.find( ( candidate ) => candidate.hit === resolvedHit )
        || clusterRecords.find( ( candidate ) => candidate.hit === resolvedHit )
        || null;
      const didOverride = Boolean(
        firstCandidate?.hit
        && resolvedCandidate?.hit
        && firstCandidate.hit !== resolvedCandidate.hit
      );

      return {
        resolvedHit,
        resolvedCandidate,
        firstCandidate,
        candidateRecords,
        clusterRecords,
        didOverride,
        overrideReason,
        shellAssistSummary,
      };

    }

    function updateDemo2ResolverDebugState( resolverContext, {
      firstCandidate = null,
      resolvedHit = null,
      resolvedCandidate = null,
      candidateRecords = [],
      clusterRecords = [],
      didOverride = false,
      overrideReason = 'preserve-first-hit',
      shellAssistSummary = null,
    } = {} ) {

      if ( ! debugRayEnabled ) {

        return;

      }

      const limit = Math.max( 1, globe.debugCandidateLimit || 5 );
      lastResolverDebug = {
        source: resolverContext?.source || null,
        pointerType: resolverContext?.pointerType || null,
        phase: resolverContext?.phase || null,
        rawFirstHitSummary: formatResolverCandidateSummary( firstCandidate ),
        resolvedHitSummary: formatResolverCandidateSummary( resolvedCandidate ),
        candidateSummaries: candidateRecords.slice( 0, limit ).map( formatResolverCandidateSummary ),
        clusterSummaries: clusterRecords.slice( 0, limit ).map( formatResolverCandidateSummary ),
        didOverride,
        overrideReason,
        overrideFromSummary: didOverride ? formatResolverCandidateSummary( firstCandidate ) : null,
        overrideToSummary: didOverride ? formatResolverCandidateSummary( resolvedCandidate ) : null,
        resolvedHitObject: resolvedHit?.object ?? null,
        shellAssistSummary,
      };

    }

    function resolveDemo2DesktopRaycastIntersection( sceneIntersections, resolverContext ) {

      const firstHit = sceneIntersections?.[ 0 ] ?? null;

      if ( ! firstHit ) {

        return buildDemo2ResolverResult( {
          resolvedHit: null,
          firstCandidate: null,
          candidateRecords: [],
          clusterRecords: [],
          overrideReason: 'no-hit',
        } );

      }

      const candidateRecords = sceneIntersections.map( ( hit ) => buildDemo2ResolverCandidate( hit, firstHit, resolverContext ) );
      const firstCandidate = candidateRecords[ 0 ] || null;
      const firstRole = firstCandidate?.role || null;

      if (
        firstRole !== demo2RaycastRoles.NODE
        && firstRole !== demo2RaycastRoles.FLOW
        && firstRole !== demo2RaycastRoles.GLOBE_SHELL
      ) {

        return buildDemo2ResolverResult( {
          resolvedHit: firstHit,
          firstCandidate,
          candidateRecords,
          clusterRecords: [ firstCandidate ],
          overrideReason: 'preserve-non-geo',
        } );

      }

      const clusterHits = collectDemo2FrontHitCluster( sceneIntersections, globe.frontHitClusterDistance );
      const clusterRecords = clusterHits.map( ( hit ) => buildDemo2ResolverCandidate( hit, firstHit, resolverContext ) );
      const nearestNodeHit = findNearestDemo2HitByRole( clusterHits, demo2RaycastRoles.NODE );

      if ( nearestNodeHit ) {

        return buildDemo2ResolverResult( {
          resolvedHit: nearestNodeHit,
          firstCandidate,
          candidateRecords,
          clusterRecords,
          overrideReason: firstCandidate?.hit === nearestNodeHit ? 'preserve-first-node' : 'desktop-front-cluster-node',
        } );

      }

      const nearestFlowHit = findNearestDemo2HitByRole( clusterHits, demo2RaycastRoles.FLOW );

      if ( nearestFlowHit ) {

        return buildDemo2ResolverResult( {
          resolvedHit: nearestFlowHit,
          firstCandidate,
          candidateRecords,
          clusterRecords,
          overrideReason: firstCandidate?.hit === nearestFlowHit ? 'preserve-first-flow' : 'desktop-front-cluster-flow',
        } );

      }

      return buildDemo2ResolverResult( {
        resolvedHit: firstHit,
        firstCandidate,
        candidateRecords,
        clusterRecords,
        overrideReason: firstRole === demo2RaycastRoles.GLOBE_SHELL ? 'desktop-shell-blank-surface' : 'preserve-first-hit',
      } );

    }

    function resolveDemo2XrRaycastIntersection( sceneIntersections, resolverContext ) {

      const firstHit = sceneIntersections?.[ 0 ] ?? null;

      if ( ! firstHit ) {

        return buildDemo2ResolverResult( {
          resolvedHit: null,
          firstCandidate: null,
          candidateRecords: [],
          clusterRecords: [],
          overrideReason: 'no-hit',
        } );

      }

      const candidateRecords = sceneIntersections.map( ( hit ) => buildDemo2ResolverCandidate( hit, firstHit, resolverContext ) );
      const firstCandidate = candidateRecords[ 0 ] || null;
      const firstRole = firstCandidate?.role || null;

      if ( firstRole === demo2RaycastRoles.GLOBE_HANDLE ) {

        return buildDemo2ResolverResult( {
          resolvedHit: firstHit,
          firstCandidate,
          candidateRecords,
          clusterRecords: [ firstCandidate ],
          overrideReason: 'preserve-handle',
        } );

      }

      if (
        firstRole !== demo2RaycastRoles.NODE
        && firstRole !== demo2RaycastRoles.FLOW
        && firstRole !== demo2RaycastRoles.GLOBE_SHELL
      ) {

        return buildDemo2ResolverResult( {
          resolvedHit: firstHit,
          firstCandidate,
          candidateRecords,
          clusterRecords: [ firstCandidate ],
          overrideReason: 'preserve-non-geo',
        } );

      }

      const clusterHits = collectDemo2FrontHitCluster(
        sceneIntersections,
        globe.xrFrontHitClusterDistance || globe.frontHitClusterDistance,
      );
      const clusterRecords = clusterHits.map( ( hit ) => buildDemo2ResolverCandidate( hit, firstHit, resolverContext ) );

      if ( firstRole === demo2RaycastRoles.NODE ) {

        return buildDemo2ResolverResult( {
          resolvedHit: firstHit,
          firstCandidate,
          candidateRecords,
          clusterRecords,
          overrideReason: 'preserve-first-node',
        } );

      }

      if ( firstRole === demo2RaycastRoles.FLOW ) {

        return buildDemo2ResolverResult( {
          resolvedHit: firstHit,
          firstCandidate,
          candidateRecords,
          clusterRecords,
          overrideReason: 'preserve-first-flow',
        } );

      }

      const shellAssistCandidates = clusterRecords.filter( ( candidate ) => (
        candidate.role === demo2RaycastRoles.NODE
        || candidate.role === demo2RaycastRoles.FLOW
      ) );
      const bestShellAssistCandidate = shellAssistCandidates.reduce( ( bestCandidate, candidate ) => {

        if ( ! isFiniteNumber( candidate.shellContactDistance ) ) {

          return bestCandidate;

        }

        if ( ! bestCandidate ) {

          return candidate;

        }

        if ( candidate.shellContactDistance < bestCandidate.shellContactDistance ) {

          return candidate;

        }

        if (
          candidate.shellContactDistance === bestCandidate.shellContactDistance
          && ( candidate.distance ?? Infinity ) < ( bestCandidate.distance ?? Infinity )
        ) {

          return candidate;

        }

        return bestCandidate;

      }, null );
      const maxShellAssistContactDistance = Math.max( 0, globe.xrShellAssistMaxContactDistance ?? Infinity );
      const shellAssistSummary = bestShellAssistCandidate
        ? `best ${formatResolverCandidateSummary( bestShellAssistCandidate )} <= ${formatDebugDistance( maxShellAssistContactDistance )}`
        : `best none <= ${formatDebugDistance( maxShellAssistContactDistance )}`;

      if (
        bestShellAssistCandidate?.hit
        && isFiniteNumber( bestShellAssistCandidate.shellContactDistance )
        && bestShellAssistCandidate.shellContactDistance <= maxShellAssistContactDistance
      ) {

        return buildDemo2ResolverResult( {
          resolvedHit: bestShellAssistCandidate.hit,
          firstCandidate,
          candidateRecords,
          clusterRecords,
          overrideReason: 'shell-assist-contact-proximity',
          shellAssistSummary,
        } );

      }

      return buildDemo2ResolverResult( {
        resolvedHit: firstHit,
        firstCandidate,
        candidateRecords,
        clusterRecords,
        overrideReason: 'shell-blank-surface',
        shellAssistSummary,
      } );

    }

    function filterDemo2RaycastIntersectionsByMapMode( sceneIntersections ) {

      if ( ! Array.isArray( sceneIntersections ) || sceneIntersections.length === 0 ) {

        return [];

      }

      return sceneIntersections.filter( ( hit ) => isDemo2MapSpaceActive( resolveDemo2MapSpace( hit ) ) );

    }

    function resolveDemo2RaycastIntersection( sceneIntersections, resolverContext = null ) {

      const filteredIntersections = filterDemo2RaycastIntersectionsByMapMode( sceneIntersections );
      const resolution = resolverContext?.pointerType === 'xr'
        ? resolveDemo2XrRaycastIntersection( filteredIntersections, resolverContext )
        : resolveDemo2DesktopRaycastIntersection( filteredIntersections, resolverContext );

      updateDemo2ResolverDebugState( resolverContext, resolution );
      return resolution.resolvedHit ?? null;

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

          beginLocalXrInteraction( payload.source );

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
          clearHoverState( {
            source: payload.source,
            invalidateSharedHover: true,
          } );

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
          updateSceneHighlights();
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
    attachDemo2TargetToObject(
      globeInteractionShell,
      registerDemo2TargetRecord( {
        targetId: buildDemo2TargetId( demo2RaycastRoles.GLOBE_SHELL, demo2RaycastRoles.GLOBE_SHELL ),
        kind: demo2RaycastRoles.GLOBE_SHELL,
        role: demo2RaycastRoles.GLOBE_SHELL,
        id: demo2RaycastRoles.GLOBE_SHELL,
        priority: 0,
      } ),
      demo2RaycastRoles.GLOBE_SHELL,
      demo2MapSpaces.GLOBE,
    );
    globeInteractionShell.renderOrder = 1;

    const flatMapBackground = createTrackedMesh(
      staticObjects,
      flatMapRoot,
      new THREE.PlaneGeometry( flatMap.width, flatMap.height ),
      new THREE.MeshBasicMaterial( {
        color: flatMap.backgroundColor,
        transparent: true,
        opacity: flatMap.backgroundOpacity,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      } ),
    );
    flatMapBackground.rotation.x = - Math.PI * 0.5;
    flatMapBackground.renderOrder = 1;

    const flatMapHalfWidth = flatMap.width * 0.5;
    const flatMapHalfHeight = flatMap.height * 0.5;
    const flatMapBorderGeometry = new THREE.BufferGeometry();
    flatMapBorderGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( [
      - flatMapHalfWidth, flatMap.boundaryLift, - flatMapHalfHeight,
      flatMapHalfWidth, flatMap.boundaryLift, - flatMapHalfHeight,
      flatMapHalfWidth, flatMap.boundaryLift, - flatMapHalfHeight,
      flatMapHalfWidth, flatMap.boundaryLift, flatMapHalfHeight,
      flatMapHalfWidth, flatMap.boundaryLift, flatMapHalfHeight,
      - flatMapHalfWidth, flatMap.boundaryLift, flatMapHalfHeight,
      - flatMapHalfWidth, flatMap.boundaryLift, flatMapHalfHeight,
      - flatMapHalfWidth, flatMap.boundaryLift, - flatMapHalfHeight,
    ], 3 ) );
    const flatMapBorder = createTrackedLineSegments(
      staticObjects,
      flatMapRoot,
      flatMapBorderGeometry,
      new THREE.LineBasicMaterial( {
        color: flatMap.backgroundEdgeColor,
        transparent: true,
        opacity: flatMap.backgroundEdgeOpacity,
        toneMapped: false,
      } ),
    );
    flatMapBorder.renderOrder = 2;

    if ( globeMoveHandleConfig.withXYMoveBar ) {

      const globeHandleTargetId = buildDemo2TargetId( demo2RaycastRoles.GLOBE_HANDLE, demo2RaycastRoles.GLOBE_HANDLE );
      const globeHandleTargetRecord = registerDemo2TargetRecord( {
        targetId: globeHandleTargetId,
        kind: demo2RaycastRoles.GLOBE_HANDLE,
        role: demo2RaycastRoles.GLOBE_HANDLE,
        id: demo2RaycastRoles.GLOBE_HANDLE,
        priority: 4,
      } );

      globeMoveHandle = createXYMoveHandle( context, {
        parent: root,
        name: 'demo2-globe-xy-move-handle',
        ...globeMoveHandleConfig,
        getTargetPosition: () => globeRoot.position,
        setTargetPosition( nextPosition ) {

          currentSceneState.globeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
            [
              nextPosition.x,
              defaultGlobeAnchorPosition[ 1 ],
              nextPosition.z,
            ],
            defaultGlobeAnchorPosition,
          );
          applyGlobeAnchorPosition();

        },
        onDragStart( payload ) {

          beginLocalXrInteraction( payload.source );
          activeGlobeMove = {
            source: payload.source,
            hasMoved: false,
          };
          clearHoverState( {
            source: payload.source,
            invalidateSharedHover: true,
          } );

        },
        onDragMove( payload ) {

          if ( activeGlobeMove?.source === payload.source ) {

            activeGlobeMove.hasMoved = true;

          }

          recordGlobeAnchorIfNeeded( `${payload.source}-globe-handle-drag` );

        },
        onDragEnd( payload, _finalPosition, didMove ) {

          const shouldFlush = activeGlobeMove?.hasMoved === true || didMove === true;
          activeGlobeMove = null;

          if ( shouldFlush ) {

            recordGlobeAnchorIfNeeded( `${payload.source}-globe-handle-drag-end`, {
              force: true,
              flushImmediately: getSceneStateLoggingConfig().flushOnGlobeMoveEnd === true,
            } );

          }

        },
        decorateHitMesh( mesh ) {

          attachDemo2TargetToObject(
            mesh,
            globeHandleTargetRecord,
            demo2RaycastRoles.GLOBE_HANDLE,
            demo2MapSpaces.GLOBE,
          );

        },
      } );
      staticObjects.push( {
        object3D: globeMoveHandle.root,
        dispose() {

          unregisterDemo2MapRaycastObject( globeMoveHandle.hitMesh );
          unregisterDemo2TargetRecord( globeHandleTargetId );
          globeMoveHandle.dispose();

        },
      } );

    }

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

    const flatFocusHalo = createTrackedMesh(
      staticObjects,
      flatMapNodeRoot,
      new THREE.TorusGeometry( flatMap.nodeRadius * 2.15, flatMap.nodeRadius * 0.18, 10, 36 ),
      new THREE.MeshBasicMaterial( {
        color: globe.focusHaloColor,
        transparent: true,
        opacity: globe.haloOpacity,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    const flatSelectedNodeHalo = createTrackedMesh(
      staticObjects,
      flatMapNodeRoot,
      new THREE.TorusGeometry( flatMap.nodeRadius * 1.82, flatMap.nodeRadius * 0.2, 10, 36 ),
      new THREE.MeshBasicMaterial( {
        color: globe.selectedNodeHaloColor,
        transparent: true,
        opacity: interaction.selectedNodeHaloOpacity ?? globe.haloOpacity,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    const flatHoverNodeHalo = createTrackedMesh(
      staticObjects,
      flatMapNodeRoot,
      new THREE.TorusGeometry( flatMap.nodeRadius * 1.82, flatMap.nodeRadius * 0.18, 10, 36 ),
      new THREE.MeshBasicMaterial( {
        color: globe.hoverHaloColor,
        transparent: true,
        opacity: globe.haloOpacity,
        depthWrite: false,
        toneMapped: false,
      } ),
    );
    [ flatFocusHalo, flatSelectedNodeHalo, flatHoverNodeHalo ].forEach( ( halo ) => {

      halo.rotation.x = - Math.PI * 0.5;
      halo.renderOrder = 8;
      halo.visible = false;

    } );

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

      return dataset.flowById?.get( currentSceneState.selectedFlowId ) || null;

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
      globeMoveHandle?.syncFromTarget();

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

    function applyMapDisplayModeVisibility() {

      currentSceneState.mapDisplayMode = normalizeMapDisplayMode( currentSceneState.mapDisplayMode );
      const isGlobeVisible = currentSceneState.mapDisplayMode === DEMO2_MAP_DISPLAY_MODES.GLOBE
        || currentSceneState.mapDisplayMode === DEMO2_MAP_DISPLAY_MODES.BOTH;
      const isFlatVisible = currentSceneState.mapDisplayMode === DEMO2_MAP_DISPLAY_MODES.FLAT
        || currentSceneState.mapDisplayMode === DEMO2_MAP_DISPLAY_MODES.BOTH;

      globeRoot.visible = isGlobeVisible;
      flatMapRoot.visible = isFlatVisible;

      mapRaycastObjectsBySpace.get( demo2MapSpaces.GLOBE )?.forEach( ( object3D ) => {

        if ( isGlobeVisible ) {

          object3D.layers.enable( 0 );

        } else {

          object3D.layers.disable( 0 );

        }

      } );

      mapRaycastObjectsBySpace.get( demo2MapSpaces.FLAT )?.forEach( ( object3D ) => {

        if ( isFlatVisible ) {

          object3D.layers.enable( 0 );

        } else {

          object3D.layers.disable( 0 );

        }

      } );

      if ( ! isGlobeVisible ) {

        activeGlobeDrag = null;
        activeGlobeMove = null;

      }

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

    function isXrControllerSource( source ) {

      return xrControllerSources.includes( source );

    }

    function setXrReplayHoverLockActive( isLocked ) {

      xrReplayHoverLockActive = Boolean( isLocked );

      if ( xrReplayHoverLockActive ) {

        xrControllerSources.forEach( ( source ) => {

          localTargetBySource.delete( source );

        } );

      }

    }

    function beginLocalXrInteraction( source ) {

      if ( ! isXrControllerSource( source ) ) {

        return false;

      }

      setXrReplayHoverLockActive( false );
      return true;

    }

    function clearNodeSelectionOwnership() {

      selectedNodeSource = null;

    }

    function clearFlowSelectionOwnership() {

      selectedFlowSource = null;

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

    function invalidateSceneHoverCacheForSource( source ) {

      const normalizedSource = resolveSelectionSource( source );

      if ( ! normalizedSource ) {

        return false;

      }

      context.invalidateSceneHoverForSource?.( normalizedSource );
      return true;

    }

    function invalidateAllSceneHoverCaches() {

      interactiveSources.forEach( ( source ) => {

        context.invalidateSceneHoverForSource?.( source );

      } );

    }

    function clearHoverEntriesForSource( source ) {

      const normalizedSource = resolveSelectionSource( source );

      if ( ! normalizedSource ) {

        return false;

      }

      return localTargetBySource.delete( normalizedSource );

    }

    function resolveGeoTargetRecordFromSceneEntry( sceneEntry ) {

      const targetRecord = resolveDemo2TargetRecordFromObject(
        sceneEntry?.object || sceneEntry?.hit?.object || null,
      );

      return targetRecord?.kind === 'node' || targetRecord?.kind === 'flow'
        ? targetRecord
        : null;

    }

    function setLocalTargetRecordForSource( source, targetRecord, {
      sequence = null,
    } = {} ) {

      const normalizedSource = resolveSelectionSource( source );

      if ( ! normalizedSource ) {

        return false;

      }

      if ( ! targetRecord?.targetId ) {

        return localTargetBySource.delete( normalizedSource );

      }

      const previousEntry = localTargetBySource.get( normalizedSource ) || null;

      if ( previousEntry?.targetId === targetRecord.targetId ) {

        return false;

      }

      localTargetBySource.set( normalizedSource, {
        source: normalizedSource,
        targetId: targetRecord.targetId,
        kind: targetRecord.kind,
        id: targetRecord.id,
        sequence: Number.isInteger( sequence ) ? sequence : nextInteractionSequence(),
      } );

      return true;

    }

    function resolveMostRecentLocalXrSource() {

      let nextSource = null;
      let nextSequence = - 1;

      xrControllerSources.forEach( ( source ) => {

        const sequence = localTargetBySource.get( source )?.sequence ?? - 1;

        if ( sequence <= nextSequence ) {

          return;

        }

        nextSequence = sequence;
        nextSource = source;

      } );

      return nextSource;

    }

    function resolveHoverState() {

      const presentationMode = context.getPresentationMode?.();
      const isImmersive = presentationMode === PRESENTATION_MODES.IMMERSIVE_VR
        || presentationMode === PRESENTATION_MODES.IMMERSIVE_AR;
      const activeSource = isImmersive
        ? ( xrReplayHoverLockActive ? null : resolveMostRecentLocalXrSource() )
        : INTERACTORS.DESKTOP_POINTER;
      const activeLocalEntry = activeSource ? localTargetBySource.get( activeSource ) : null;

      currentLocalTargetSource = activeLocalEntry ? activeSource : null;
      currentLocalTargetRecord = activeLocalEntry?.targetId
        ? ( targetRecordsById.get( activeLocalEntry.targetId ) || null )
        : null;
      currentHoveredNodeId = currentLocalTargetRecord?.kind === 'node' ? currentLocalTargetRecord.id : null;
      currentHoveredFlowId = currentLocalTargetRecord?.kind === 'flow' ? currentLocalTargetRecord.id : null;

    }

    function updateHoverState( kind, source, id, isHovered ) {

      const normalizedSource = resolveSelectionSource( source );

      if ( ! normalizedSource ) {

        resolveHoverState();
        updateSceneHighlights();
        return;

      }

      if ( xrReplayHoverLockActive && isXrControllerSource( normalizedSource ) ) {

        clearHoverEntriesForSource( normalizedSource );

        resolveHoverState();
        updateSceneHighlights();
        return;

      }

      if ( isHovered ) {

        const targetRecord = targetRecordsById.get( buildDemo2TargetId( kind, id ) ) || null;

        if ( targetRecord?.targetId ) {

          setLocalTargetRecordForSource( normalizedSource, targetRecord );

        }

      } else {

        const entry = localTargetBySource.get( normalizedSource );
        const targetId = buildDemo2TargetId( kind, id );

        if ( entry?.targetId === targetId || ! id ) {

          clearHoverEntriesForSource( normalizedSource );

        }

      }

      resolveHoverState();
      updateSceneHighlights();

    }

    function clearHoverState( {
      source = null,
      invalidateSharedHover = false,
      invalidateAllSharedHover = false,
    } = {} ) {

      if ( source ) {

        clearHoverEntriesForSource( source );

      } else {

        localTargetBySource.clear();

      }

      if ( invalidateAllSharedHover ) {

        invalidateAllSceneHoverCaches();

      } else if ( invalidateSharedHover ) {

        invalidateSceneHoverCacheForSource( source );

      }

      resolveHoverState();
      updateSceneHighlights();

    }

    function pruneLocalTargetState() {

      let didChange = false;

      localTargetBySource.forEach( ( entry, source ) => {

        if ( ! entry?.targetId || ! targetRecordsById.has( entry.targetId ) ) {

          localTargetBySource.delete( source );
          didChange = true;

        }

      } );

      if ( didChange ) {

        resolveHoverState();

      }

    }

    function syncXrLocalTargetsFromInteractorState() {

      const presentationMode = context.getPresentationMode?.();
      const isImmersive = presentationMode === PRESENTATION_MODES.IMMERSIVE_VR
        || presentationMode === PRESENTATION_MODES.IMMERSIVE_AR;

      if ( ! isImmersive ) {

        return false;

      }

      let didChange = false;

      xrControllerSources.forEach( ( source ) => {

        if ( xrReplayHoverLockActive ) {

          didChange = clearHoverEntriesForSource( source ) || didChange;
          return;

        }

        const interactorState = context.getSceneInteractorState?.( source ) || null;
        const selectionTargetRecord = resolveGeoTargetRecordFromSceneEntry( interactorState?.sceneSelection );
        const hoveredTargetRecord = resolveGeoTargetRecordFromSceneEntry( interactorState?.hoveredSceneEntry );
        const nextTargetRecord = selectionTargetRecord || hoveredTargetRecord || null;
        const didSourceChange = nextTargetRecord
          ? setLocalTargetRecordForSource( source, nextTargetRecord )
          : clearHoverEntriesForSource( source );

        didChange = didSourceChange || didChange;

      } );

      if ( ! didChange ) {

        return false;

      }

      resolveHoverState();
      updateSceneHighlights();
      return true;

    }

    function formatDebugDistance( distance ) {

      return isFiniteNumber( distance ) ? distance.toFixed( 3 ) : '--';

    }

    function formatDebugHitSummary( hitLike ) {

      const hit = hitLike?.hit || hitLike;

      if ( ! hit?.object ) {

        return 'none';

      }

      const role = resolveDemo2RaycastRole( hit ) || 'other';
      const targetId = resolveDemo2RaycastTargetId( hit.object );
      const targetLabel = targetId ? `${role}:${targetId}` : role;
      return `${targetLabel}@${formatDebugDistance( hit.distance )}`;

    }

    function formatDebugCacheSummary( source ) {

      const interactorState = context.getSceneInteractorState?.( source ) || null;
      const hoveredLabel = formatDebugHitSummary( interactorState?.hoveredSceneEntry );
      const selectionLabel = formatDebugHitSummary( interactorState?.sceneSelection );
      return `${source} h:${hoveredLabel} s:${selectionLabel}`;

    }

    function formatDebugLocalTargetSummary() {

      const parts = interactiveSources.map( ( source ) => {

        const entry = localTargetBySource.get( source );

        if ( ! entry?.targetId ) {

          return `${source}:-`;

        }

        return `${source}:${entry.targetId}#${entry.sequence ?? '-'}`;

      } );

      return parts.join( ' | ' );

    }

    function resolvePrimaryDebugSource() {

      const liveResolverSource = interactiveSources.find( ( source ) => {

        const debugState = context.getSceneInteractionDebugState?.( source ) || null;
        return Boolean( debugState?.rawFirstSceneHit || debugState?.resolvedSceneHit );

      } );

      if ( liveResolverSource ) {

        return liveResolverSource;

      }

      if ( lastResolverDebug?.source ) {

        return lastResolverDebug.source;

      }

      if ( currentLocalTargetSource ) {

        return currentLocalTargetSource;

      }

      if ( selectedFlowSource ) {

        return selectedFlowSource;

      }

      if ( selectedNodeSource ) {

        return selectedNodeSource;

      }

      if ( activeGlobeDrag?.source ) {

        return activeGlobeDrag.source;

      }

      if ( activeGlobeMove?.source ) {

        return activeGlobeMove.source;

      }

      const activeControllerSource = interactiveSources.find( ( source ) => {

        const debugState = context.getSceneInteractionDebugState?.( source ) || null;
        return Boolean(
          debugState?.hoveredSceneEntry
          || debugState?.sceneSelection
          || debugState?.rawFirstSceneHit
          || debugState?.resolvedSceneHit,
        );

      } );

      if ( activeControllerSource ) {

        return activeControllerSource;

      }

      return context.getPresentationMode?.() === PRESENTATION_MODES.DESKTOP
        ? INTERACTORS.DESKTOP_POINTER
        : INTERACTORS.CONTROLLER_0;

    }

    function getDebugPanelText() {

      if ( ! debugRayEnabled ) {

        return '';

      }

      const debugSource = resolvePrimaryDebugSource();
      const debugState = context.getSceneInteractionDebugState?.( debugSource ) || null;
      const hasLiveSceneDebug = Boolean( debugState?.rawFirstSceneHit || debugState?.resolvedSceneHit );
      const headerBits = [
        debugSource || 'none',
        lastResolverDebug?.pointerType || debugState?.pointerType || '-',
        lastResolverDebug?.phase || debugState?.phase || '-',
      ];
      const candidateSummary = hasLiveSceneDebug && lastResolverDebug?.candidateSummaries?.length
        ? lastResolverDebug.candidateSummaries.join( ' | ' )
        : 'none';
      const clusterSummary = hasLiveSceneDebug && lastResolverDebug?.clusterSummaries?.length
        ? lastResolverDebug.clusterSummaries.join( ' | ' )
        : 'none';
      const overrideSummary = ! hasLiveSceneDebug
        ? 'override none'
        : (
          lastResolverDebug?.didOverride
            ? `override yes: ${lastResolverDebug.overrideFromSummary || 'none'} -> ${lastResolverDebug.overrideToSummary || 'none'} | ${lastResolverDebug.overrideReason || 'unknown'}`
            : `override no | ${lastResolverDebug?.overrideReason || 'preserve-first-hit'}`
        );
      const interactionPolicy = context.getInteractionPolicy?.() || null;

      return [
        `Debug ${headerBits.join( ' | ' )}`,
        `raw ${hasLiveSceneDebug ? ( lastResolverDebug?.rawFirstHitSummary || formatDebugHitSummary( debugState?.rawFirstSceneHit ) ) : 'none'}`,
        `resolved ${hasLiveSceneDebug ? ( lastResolverDebug?.resolvedHitSummary || formatDebugHitSummary( debugState?.resolvedSceneHit ) ) : 'none'}`,
        overrideSummary,
        `top ${candidateSummary}`,
        `cluster ${clusterSummary}`,
        `shell ${lastResolverDebug?.shellAssistSummary || 'inactive'}`,
        `hover N:${currentHoveredNodeId || '-'} F:${currentHoveredFlowId || '-'}`,
        `selected N:${currentSceneState.selectedNodeId || '-'} F:${currentSceneState.selectedFlowId || '-'}`,
        `map ${currentSceneState.mapDisplayMode} labels ${currentSceneState.labelsVisible ? 'on' : 'off'} mode:${interaction.tooltipMode || 'static-labels-only'}`,
        `local ${formatDebugLocalTargetSummary()}`,
        `xr hover lock:${xrReplayHoverLockActive ? 'on' : 'off'}`,
        `replay recv:${interactionPolicy?.hasReceivedReplayState === true ? 'on' : 'off'} apply:${interactionPolicy?.isApplyingReplayState === true ? 'on' : 'off'}`,
        `selection owners N:${selectedNodeSource || '-'} F:${selectedFlowSource || '-'}`,
        `live ${formatDebugCacheSummary( INTERACTORS.CONTROLLER_0 )}`,
        `live ${formatDebugCacheSummary( INTERACTORS.CONTROLLER_1 )}`,
      ].join( '\n' );

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

      if ( currentSceneState.mapDisplayMode === DEMO2_MAP_DISPLAY_MODES.FLAT ) {

        return 'Use the map view to select a node,\nthen choose a route.';

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

    function createFlatMapBoundaryGeometryFromTopology( topology ) {

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

      lineCoordinates.forEach( ( line ) => {

        if ( ! Array.isArray( line ) || line.length < 2 ) {

          return;

        }

        for ( let index = 1; index < line.length; index += 1 ) {

          appendFlatMapSegmentPositions(
            positions,
            line[ index - 1 ],
            line[ index ],
            flatMap,
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

      if ( ! dataset?.boundaryTopology ) {

        return;

      }

      if ( ! currentBoundaryLines ) {

        const geometry = createBoundaryGeometryFromTopology( dataset.boundaryTopology );

        if ( geometry ) {

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

      }

      if ( ! currentFlatBoundaryLines ) {

        const flatGeometry = createFlatMapBoundaryGeometryFromTopology( dataset.boundaryTopology );

        if ( flatGeometry ) {

          currentFlatBoundaryLines = createTrackedLineSegments(
            staticObjects,
            flatMapBoundaryRoot,
            flatGeometry,
            new THREE.LineBasicMaterial( {
              color: flatMap.boundaryColor,
              transparent: true,
              opacity: flatMap.boundaryOpacity,
              depthWrite: false,
              toneMapped: false,
            } ),
          );
          currentFlatBoundaryLines.renderOrder = 3;
          currentFlatBoundaryLines.frustumCulled = false;

        }

      }

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
    const panelDebugText = debugRayEnabled
      ? createTrackedTextPlane(
        staticObjects,
        xrPanelRoot,
        { ...labelStyles.panelDebug, text: 'Debug waiting for scene hits...' },
        new THREE.Vector3( 0, xrPanel.debugY, xrPanel.contentZ ),
      )
      : null;

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

            beginLocalXrInteraction( payload.source );
            onPress?.( payload.source );

          },
        },
      } ) );

      xrButtons.set( key, button );
    }

    function buildXrPanelButtons() {

      const columnOffset = xrPanel.buttonWidth + xrPanel.buttonGap;
      const columnX = [
        - columnOffset * 2,
        - columnOffset,
        0,
        columnOffset,
        columnOffset * 2,
      ];

      createXrButton( 'year-prev', {
        label: buildButtonLabel( 'Year', '-' ),
        position: new THREE.Vector3( columnX[ 0 ], xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          shiftYear( - 1, source );

        },
      } );
      createXrButton( 'year-next', {
        label: buildButtonLabel( 'Year', '+' ),
        position: new THREE.Vector3( columnX[ 1 ], xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          shiftYear( 1, source );

        },
      } );
      createXrButton( 'direction', {
        label: buildButtonLabel( 'Mode', 'Outbound' ),
        position: new THREE.Vector3( columnX[ 2 ], xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          cycleDirectionMode( source );

        },
      } );
      createXrButton( 'threshold-prev', {
        label: buildButtonLabel( 'Flow', '-' ),
        position: new THREE.Vector3( columnX[ 3 ], xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          shiftThreshold( - 1, source );

        },
      } );
      createXrButton( 'threshold-next', {
        label: buildButtonLabel( 'Flow', '+' ),
        position: new THREE.Vector3( columnX[ 4 ], xrPanel.buttonRow1Y, 0 ),
        onPress( source ) {

          shiftThreshold( 1, source );

        },
      } );
      createXrButton( 'labels', {
        label: buildButtonLabel( 'Labels', 'On' ),
        position: new THREE.Vector3( columnX[ 0 ], xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          toggleLabels( source );

        },
      } );
      createXrButton( 'map-display', {
        label: buildButtonLabel( 'Map', '3D' ),
        position: new THREE.Vector3( columnX[ 1 ], xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          cycleMapDisplayMode( source );

        },
      } );
      createXrButton( 'reset-filters', {
        label: buildButtonLabel( 'Reset', 'Filters' ),
        position: new THREE.Vector3( columnX[ 2 ], xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          resetFilters( source );

        },
      } );
      createXrButton( 'reset-view', {
        label: buildButtonLabel( 'Reset', 'View' ),
        position: new THREE.Vector3( columnX[ 3 ], xrPanel.buttonRow2Y, 0 ),
        onPress( source ) {

          resetView( source );

        },
      } );
      createXrButton( 'submit', {
        label: buildButtonLabel( 'Task', 'Submit' ),
        position: new THREE.Vector3( columnX[ 4 ], xrPanel.buttonRow2Y, 0 ),
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
      const labelsEnabled = currentSceneState.labelsVisible === true;

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
        entry.flatCurrentRadius = flatMap.nodeRadius * radiusScale;
        entry.mesh.scale.setScalar( radiusScale );
        entry.hitProxy.scale.setScalar( radiusScale );
        entry.mesh.material.color.setHex( resolveNodeColorHex( node ) );
        entry.mesh.material.emissive.setHex(
          node.id === hoveredNodeId
            ? globe.nodeHoverEmissive
            : globe.nodeEmissive,
        );
        if ( entry.flatMesh ) {

          entry.flatMesh.scale.setScalar( radiusScale );
          entry.flatMesh.material.color.setHex( resolveNodeColorHex( node ) );
          entry.flatMesh.material.emissive.setHex(
            node.id === hoveredNodeId
              ? globe.nodeHoverEmissive
              : globe.nodeEmissive,
          );

        }
        entry.flatHitProxy?.scale.setScalar( radiusScale );
        let labelVisible = labelsEnabled;
        let labelOpacity = interaction.defaultLabelOpacity ?? 0.84;
        const isSelectedNode = node.id === selectedNodeId;

        if ( node.id === focusedCountryId ) {

          labelOpacity = interaction.focusedLabelOpacity ?? 1;

        }

        if ( isSelectedNode ) {

          labelOpacity = interaction.selectedLabelOpacity ?? 1;

        }

        entry.label.sprite.visible = labelVisible;
        entry.label.sprite.material.opacity = labelOpacity;
        entry.label.sprite.material.color.copy(
          isSelectedNode ? labelSelectedTintColor : labelDefaultTintColor,
        );
        entry.label.sprite.material.needsUpdate = true;

        if ( entry.flatLabel?.sprite ) {

          entry.flatLabel.sprite.visible = labelVisible;
          entry.flatLabel.sprite.material.opacity = labelOpacity;
          entry.flatLabel.sprite.material.color.copy(
            isSelectedNode ? labelSelectedTintColor : labelDefaultTintColor,
          );
          entry.flatLabel.sprite.material.needsUpdate = true;

        }

      } );

      const focusedEntry = focusedCountryId ? nodeEntriesById.get( focusedCountryId ) : null;
      const selectedEntry = selectedNodeId ? nodeEntriesById.get( selectedNodeId ) : null;
      const hoveredEntry = hoveredNodeId ? nodeEntriesById.get( hoveredNodeId ) : null;

      focusHalo.visible = Boolean( focusedEntry );
      selectedNodeHalo.visible = Boolean( selectedEntry );
      hoverNodeHalo.visible = Boolean( hoveredEntry );
      flatFocusHalo.visible = Boolean( focusedEntry?.flatMesh );
      flatSelectedNodeHalo.visible = Boolean( selectedEntry?.flatMesh );
      flatHoverNodeHalo.visible = Boolean( hoveredEntry?.flatMesh );

      if ( focusedEntry ) {

        focusHalo.position.copy( focusedEntry.mesh.position );
        focusHalo.scale.setScalar( Math.max( 1.2, focusedEntry.currentRadius / globe.nodeBaseRadius ) );

        if ( focusedEntry.flatMesh ) {

          flatFocusHalo.position.copy( focusedEntry.flatMesh.position );
          flatFocusHalo.position.y = flatMap.nodeLift + 0.01;
          flatFocusHalo.scale.setScalar( Math.max( 1.2, focusedEntry.flatCurrentRadius / flatMap.nodeRadius ) );

        }

      }

      if ( selectedEntry ) {

        selectedNodeHalo.material.opacity = interaction.selectedNodeHaloOpacity ?? globe.haloOpacity;
        selectedNodeHalo.position.copy( selectedEntry.mesh.position );
        selectedNodeHalo.scale.setScalar( Math.max( 1.05, selectedEntry.currentRadius / globe.nodeBaseRadius ) );

        if ( selectedEntry.flatMesh ) {

          flatSelectedNodeHalo.material.opacity = interaction.selectedNodeHaloOpacity ?? globe.haloOpacity;
          flatSelectedNodeHalo.position.copy( selectedEntry.flatMesh.position );
          flatSelectedNodeHalo.position.y = flatMap.nodeLift + 0.012;
          flatSelectedNodeHalo.scale.setScalar( Math.max( 1.05, selectedEntry.flatCurrentRadius / flatMap.nodeRadius ) );

        }

      }

      if ( hoveredEntry ) {

        hoverNodeHalo.position.copy( hoveredEntry.mesh.position );
        hoverNodeHalo.scale.setScalar( Math.max( 1.05, hoveredEntry.currentRadius / globe.nodeBaseRadius ) );

        if ( hoveredEntry.flatMesh ) {

          flatHoverNodeHalo.position.copy( hoveredEntry.flatMesh.position );
          flatHoverNodeHalo.position.y = flatMap.nodeLift + 0.014;
          flatHoverNodeHalo.scale.setScalar( Math.max( 1.05, hoveredEntry.flatCurrentRadius / flatMap.nodeRadius ) );

        }

      }

    }

    function clearVisibleFlowMeshes() {

      currentFlowTargetIds.forEach( unregisterDemo2TargetRecord );
      currentFlowTargetIds = [];
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
        const visibleMesh = createTrackedMesh(
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
        );
        visibleMesh.renderOrder = 4;
        const proxyCurve = new THREE.CatmullRomCurve3(
          sampleCurveSegmentPoints(
            curve,
            globe.flowProxyTrimStart ?? 0.18,
            globe.flowProxyTrimEnd ?? 0.82,
            Math.max( 10, globe.arcSegments ),
          ),
        );
        const proxyRadius = Math.max(
          globe.flowProxyMinRadius ?? 0.012,
          tubeRadius * ( globe.flowProxyRadiusFactor ?? 2.4 ),
        );
        const interactionMesh = createInteractiveTrackedMesh(
          dynamicObjects,
          globeArcRoot,
          new THREE.TubeGeometry( proxyCurve, Math.max( 10, globe.arcSegments ), proxyRadius, 8, false ),
          new THREE.MeshBasicMaterial( {
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
          } ),
          {
            onHoverChange( payload ) {

              updateHoverState( 'flow', payload.source, flow.flowId, payload.isHovered );

            },
            onSelectStart( payload ) {

              if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                return;

              }

              beginLocalXrInteraction( payload.source );
              updateHoverState( 'flow', payload.source, flow.flowId, true );
              setSelectedFlowId( flow.flowId, {
                source: payload.source,
                shouldLog: true,
              } );

            },
          },
        );
        const flatOriginPosition = originEntry.flatMesh?.position || null;
        const flatDestinationPosition = destinationEntry.flatMesh?.position || null;
        let flatVisibleMesh = null;
        let flatInteractionMesh = null;

        if ( flatOriginPosition && flatDestinationPosition ) {

          const flatSegments = Math.max( 4, flatMap.flowSegments );
          const flatCurve = new THREE.CatmullRomCurve3(
            createFlatArcPoints(
              flatOriginPosition,
              flatDestinationPosition,
              flatMap.flowArcHeight,
              flatSegments,
            ),
          );
          const flatTubeRadius = THREE.MathUtils.lerp( flatMap.flowRadiusMin, flatMap.flowRadiusMax, radiusAlpha );

          flatVisibleMesh = createTrackedMesh(
            dynamicObjects,
            flatMapArcRoot,
            new THREE.TubeGeometry( flatCurve, flatSegments, flatTubeRadius, 8, false ),
            new THREE.MeshBasicMaterial( {
              color: flatMap.flowColor,
              transparent: true,
              opacity: flatMap.flowOpacity,
              depthWrite: false,
              toneMapped: false,
            } ),
          );
          flatVisibleMesh.renderOrder = 4;

          const flatProxyCurve = new THREE.CatmullRomCurve3(
            sampleCurveSegmentPoints(
              flatCurve,
              flatMap.flowProxyTrimStart ?? 0.12,
              flatMap.flowProxyTrimEnd ?? 0.88,
              Math.max( 10, flatSegments ),
            ),
          );
          const flatProxyRadius = Math.max(
            flatMap.flowProxyMinRadius ?? 0.012,
            flatTubeRadius * ( flatMap.flowProxyRadiusFactor ?? 2.6 ),
          );

          flatInteractionMesh = createInteractiveTrackedMesh(
            dynamicObjects,
            flatMapArcRoot,
            new THREE.TubeGeometry( flatProxyCurve, Math.max( 10, flatSegments ), flatProxyRadius, 8, false ),
            new THREE.MeshBasicMaterial( {
              color: 0xffffff,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              toneMapped: false,
            } ),
            {
              onHoverChange( payload ) {

                updateHoverState( 'flow', payload.source, flow.flowId, payload.isHovered );

              },
              onSelectStart( payload ) {

                if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                  return;

                }

                beginLocalXrInteraction( payload.source );
                updateHoverState( 'flow', payload.source, flow.flowId, true );
                setSelectedFlowId( flow.flowId, {
                  source: payload.source,
                  shouldLog: true,
                } );

              },
            },
          );

        }

        const targetRecord = registerDemo2TargetRecord( {
          targetId: buildDemo2TargetId( 'flow', flow.flowId ),
          kind: 'flow',
          role: demo2RaycastRoles.FLOW,
          id: flow.flowId,
          data: flow,
          priority: 2,
        } );
        currentFlowTargetIds.push( targetRecord.targetId );
        attachDemo2TargetToObject( interactionMesh, targetRecord, demo2RaycastRoles.FLOW, demo2MapSpaces.GLOBE );
        attachDemo2TargetToObject( flatInteractionMesh, targetRecord, demo2RaycastRoles.FLOW, demo2MapSpaces.FLAT );
        const entry = {
          flow,
          visibleMesh,
          interactionMesh,
          flatVisibleMesh,
          flatInteractionMesh,
          targetRecord,
        };
        currentVisibleFlowEntries.push( entry );
        currentFlowEntryById.set( flow.flowId, entry );

      } );

      pruneLocalTargetState();

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

        entry.visibleMesh.material.color.setHex( color );
        entry.visibleMesh.material.opacity = opacity;
        entry.visibleMesh.renderOrder = isSelected ? 8 : ( isHovered ? 7 : 4 );

        if ( entry.flatVisibleMesh ) {

          const flatColor = isSelected
            ? flatMap.flowSelectedColor
            : ( isHovered ? flatMap.flowHoverColor : flatMap.flowColor );
          const flatOpacity = isSelected
            ? flatMap.flowSelectedOpacity
            : ( isHovered ? flatMap.flowHoverOpacity : flatMap.flowOpacity );

          entry.flatVisibleMesh.material.color.setHex( flatColor );
          entry.flatVisibleMesh.material.opacity = flatOpacity;
          entry.flatVisibleMesh.renderOrder = isSelected ? 8 : ( isHovered ? 7 : 4 );

        }

      } );

    }

    function updateSceneHighlights() {

      resolveHoverState();
      updateNodeVisuals();
      updateFlowVisuals();

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
          const mesh = createTrackedMesh(
            staticObjects,
            globeNodeRoot,
            new THREE.SphereGeometry( globe.nodeBaseRadius, 18, 18 ),
            new THREE.MeshStandardMaterial( {
              color: resolveNodeColorHex( node ),
              emissive: globe.nodeEmissive,
              roughness: 0.38,
              metalness: 0.06,
            } ),
          );
          mesh.position.copy( surfacePosition );
          const hitProxy = createInteractiveTrackedMesh(
            staticObjects,
            globeNodeRoot,
            new THREE.SphereGeometry( globe.nodeHitProxyRadius, 18, 18 ),
            new THREE.MeshBasicMaterial( {
              color: 0xffffff,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              toneMapped: false,
            } ),
            {
              onHoverChange( payload ) {

                updateHoverState( 'node', payload.source, node.id, payload.isHovered );

              },
              onSelectStart( payload ) {

                if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                  return;

                }

                beginLocalXrInteraction( payload.source );
                updateHoverState( 'node', payload.source, node.id, true );
                focusCountry( node.id, {
                  source: payload.source,
                  shouldLog: true,
                } );

              },
            },
          );
          hitProxy.position.copy( surfacePosition );
          const label = createTrackedTextSprite(
            staticObjects,
            globeLabelRoot,
            { ...labelStyles.nodeLabel, text: node.name },
            labelPosition,
          );
          const flatPosition = latLonToFlatMapVector3( node.lat, node.lon, flatMap, flatMap.nodeLift );
          const flatLabelPosition = latLonToFlatMapVector3( node.lat, node.lon, flatMap, flatMap.nodeLift + flatMap.labelLift );
          const flatMesh = createTrackedMesh(
            staticObjects,
            flatMapNodeRoot,
            new THREE.SphereGeometry( flatMap.nodeRadius, 16, 16 ),
            new THREE.MeshStandardMaterial( {
              color: resolveNodeColorHex( node ),
              emissive: globe.nodeEmissive,
              roughness: 0.42,
              metalness: 0.05,
            } ),
          );
          flatMesh.position.copy( flatPosition );
          flatMesh.renderOrder = 5;
          const flatHitProxy = createInteractiveTrackedMesh(
            staticObjects,
            flatMapNodeRoot,
            new THREE.SphereGeometry( flatMap.nodeHitProxyRadius, 16, 16 ),
            new THREE.MeshBasicMaterial( {
              color: 0xffffff,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              toneMapped: false,
            } ),
            {
              onHoverChange( payload ) {

                updateHoverState( 'node', payload.source, node.id, payload.isHovered );

              },
              onSelectStart( payload ) {

                if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                  return;

                }

                beginLocalXrInteraction( payload.source );
                updateHoverState( 'node', payload.source, node.id, true );
                focusCountry( node.id, {
                  source: payload.source,
                  shouldLog: true,
                } );

              },
            },
          );
          flatHitProxy.position.copy( flatPosition );
          const flatLabel = createTrackedTextSprite(
            staticObjects,
            flatMapLabelRoot,
            { ...labelStyles.nodeLabel, text: node.name },
            flatLabelPosition,
          );
          const targetRecord = registerDemo2TargetRecord( {
            targetId: buildDemo2TargetId( 'node', node.id ),
            kind: 'node',
            role: demo2RaycastRoles.NODE,
            id: node.id,
            data: node,
            priority: 3,
          } );
          attachDemo2TargetToObject( hitProxy, targetRecord, demo2RaycastRoles.NODE, demo2MapSpaces.GLOBE );
          attachDemo2TargetToObject( flatHitProxy, targetRecord, demo2RaycastRoles.NODE, demo2MapSpaces.FLAT );
          nodeEntriesById.set( node.id, {
            node,
            mesh,
            hitProxy,
            label,
            flatMesh,
            flatHitProxy,
            flatLabel,
            currentRadius: globe.nodeBaseRadius,
            flatCurrentRadius: flatMap.nodeRadius,
            targetRecord,
          } );

        } );

      }

      rebuildVisibleFlows();
      pruneLocalTargetState();
      applyMapDisplayModeVisibility();
      updateSceneHighlights();

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
        mapDisplayMode: currentSceneState.mapDisplayMode,
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
        xrGeoMapDisplayMode: currentSceneState.mapDisplayMode,
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

      currentSceneState.focusedCountryId = countryId;
      currentSceneState.selectedNodeId = countryId;
      currentSceneState.selectedFlowId = null;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      selectedNodeSource = selectionSource;
      clearFlowSelectionOwnership();
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
      currentSceneState.selectedFlowId = nextFlow.flowId;
      currentSceneState.taskAnswer = nextFlow.flowId;
      currentSceneState.taskSubmitted = false;
      selectedFlowSource = selectionSource;
      resolveHoverState();
      updateSceneHighlights();
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
      updateSceneHighlights();
      syncAllUi();
      recordSceneChange( 'labels', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnLabelsToggle === true,
      } );

    }

    function cycleMapDisplayMode( source = 'scene-map-display-mode-cycle' ) {

      const modes = [
        DEMO2_MAP_DISPLAY_MODES.GLOBE,
        DEMO2_MAP_DISPLAY_MODES.FLAT,
        DEMO2_MAP_DISPLAY_MODES.BOTH,
      ];
      const currentIndex = modes.indexOf( normalizeMapDisplayMode( currentSceneState.mapDisplayMode ) );
      const nextMode = modes[ ( currentIndex + 1 ) % modes.length ];

      if ( nextMode === currentSceneState.mapDisplayMode ) {

        return;

      }

      currentSceneState.mapDisplayMode = nextMode;
      applyMapDisplayModeVisibility();
      clearHoverState( { invalidateAllSharedHover: true } );
      updateSceneHighlights();
      syncAllUi();
      recordSceneChange( 'mapDisplayMode', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnMapDisplayModeChange === true,
      } );

    }

    function resetView( source = 'scene-reset-view' ) {

      currentSceneState.globeYawDeg = DEMO2_DEFAULT_GLOBE_YAW_DEG;
      currentSceneState.mapDisplayMode = DEMO2_DEFAULT_MAP_DISPLAY_MODE;
      currentSceneState.globeAnchorPosition = normalizeDemo2GlobeAnchorPosition(
        defaultGlobeAnchorPosition,
        defaultGlobeAnchorPosition,
      );
      applyGlobeAnchorPosition();
      applyGlobeYaw();
      applyMapDisplayModeVisibility();
      clearHoverState( { invalidateAllSharedHover: true } );
      updateSceneHighlights();
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
      clearHoverState( { invalidateAllSharedHover: true } );
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
      desktopRefs.mapDisplayModeButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Map: 3D' );
      desktopRefs.resetFiltersButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Reset Filters' );
      desktopRefs.resetViewButton = createStyledElement( 'button', desktopPanel.buttonDisabled, 'Reset View' );
      desktopRefs.mapDisplayModeButton.addEventListener( 'click', () => cycleMapDisplayMode( 'desktop-map-display-mode-button' ) );
      desktopRefs.resetFiltersButton.addEventListener( 'click', () => resetFilters( 'desktop-reset-filters' ) );
      desktopRefs.resetViewButton.addEventListener( 'click', () => resetView( 'desktop-reset-view' ) );
      rowView.appendChild( desktopRefs.mapDisplayModeButton );
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

      if ( debugRayEnabled ) {

        node.appendChild( createStyledElement( 'p', desktopPanel.sectionLabel, 'Debug' ) );
        desktopRefs.debugValue = createStyledElement( 'p', desktopPanel.debug, 'Debug waiting for scene hits...' );
        node.appendChild( desktopRefs.debugValue );

      }

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
        ? `Year ${currentSceneState.geoYear} | ${formatDirectionMode( currentSceneState.flowDirectionMode )} | Map ${formatMapDisplayMode( currentSceneState.mapDisplayMode )} | ${formatThreshold( currentSceneState.minFlowThreshold )} | ${currentSceneState.visibleFlowCount} visible`
        : 'Loading local migration bundle...';
      desktopRefs.focusValue.textContent = focusedNode
        ? `Focus ${focusedNode.name} | Map ${formatMapDisplayMode( currentSceneState.mapDisplayMode )} | Labels ${currentSceneState.labelsVisible ? 'On' : 'Off'} | Yaw ${Math.round( currentSceneState.globeYawDeg )}\u00b0`
        : 'Focus Afghanistan';
      desktopRefs.selectionValue.textContent = selectedFlow
        ? [
          `Selected node: ${selectedNode?.name || focusedNode?.name || 'Afghanistan'}`,
          `Selected route: ${selectedFlow.label} | ${selectedFlow.year} | ${formatFlowValue( selectedFlow.value )}`,
        ].join( '\n' )
        : (
          selectedNode
            ? `Selected node: ${selectedNode.name}\nSelected route: none`
            : 'Selected node: none\nSelected route: none'
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
        desktopRefs.mapDisplayModeButton,
        desktopRefs.resetFiltersButton,
        desktopRefs.resetViewButton,
      ].forEach( ( button ) => {

        button.disabled = ! controlsEnabled;
        button.setAttribute( 'style', getButtonStyle( desktopPanel, controlsEnabled ) );

      } );

      desktopRefs.directionButton.textContent = `Mode: ${formatDirectionMode( currentSceneState.flowDirectionMode )}`;
      desktopRefs.labelsButton.textContent = `Labels: ${currentSceneState.labelsVisible ? 'On' : 'Off'}`;
      desktopRefs.mapDisplayModeButton.textContent = `Map: ${formatMapDisplayMode( currentSceneState.mapDisplayMode )}`;
      desktopRefs.submitButton.disabled = ! controlsEnabled || ! selectedFlow;
      desktopRefs.submitButton.textContent = selectedFlow ? 'Submit Current Route' : 'Pick Route First';
      desktopRefs.submitButton.setAttribute( 'style', getButtonStyle( desktopPanel, controlsEnabled && Boolean( selectedFlow ) ) );

      if ( desktopRefs.debugValue ) {

        desktopRefs.debugValue.textContent = getDebugPanelText();

      }

    }

    function syncXrPanel() {

      const task = getCurrentTask();
      const focusedNode = getFocusedNode();
      const selectedNode = getSelectedNode();
      const selectedFlow = getSelectedFlow();
      const isReady = loadStatus === 'ready';
      const canInteract = context.getInteractionPolicy?.()?.canInteract !== false;
      const controlsEnabled = isReady && canInteract;
      const compactMode = formatDirectionMode( currentSceneState.flowDirectionMode ).toLowerCase();
      const compactThreshold = formatCompactThreshold( currentSceneState.minFlowThreshold );
      const visibleRouteLabel = `${currentSceneState.visibleFlowCount} ${currentSceneState.visibleFlowCount === 1 ? 'route' : 'routes'}`;
      const selectedNodeLabel = selectedNode?.name || focusedNode?.name || 'Afghanistan';
      const focusedNodeLabel = focusedNode?.name || selectedNodeLabel;

      panelTitle.setText?.( 'Demo 2 Migration Globe' );
      panelBodyText.setText( getPanelBodyText() );
      panelMetaText.setText(
        isReady
          ? `${currentSceneState.geoYear} | ${compactMode} | map ${formatMapDisplayMode( currentSceneState.mapDisplayMode )} | ${compactThreshold} | ${visibleRouteLabel}`
          : 'Loading data...',
      );
      panelSelectionText.setText(
        selectedFlow
          ? `Node ${truncateLabel( selectedNodeLabel, 13 )} | Focus ${truncateLabel( focusedNodeLabel, 13 )}\nRoute ${truncateLabel( selectedFlow.destinationName, 11 )} | ${selectedFlow.year} | ${formatFlowValue( selectedFlow.value )}`
          : `Node ${truncateLabel( selectedNodeLabel, 13 )} | Focus ${truncateLabel( focusedNodeLabel, 13 )}\nRoute none`,
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
      panelDebugText?.setText( getDebugPanelText() );

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
      xrButtons.get( 'map-display' ).disabled = ! controlsEnabled;
      xrButtons.get( 'map-display' ).label = buildButtonLabel( 'Map', formatMapDisplayMode( currentSceneState.mapDisplayMode ) );
      xrButtons.get( 'reset-filters' ).disabled = ! controlsEnabled;
      xrButtons.get( 'reset-filters' ).label = buildButtonLabel( 'Reset', 'Filters' );
      xrButtons.get( 'reset-view' ).disabled = ! controlsEnabled;
      xrButtons.get( 'reset-view' ).label = buildButtonLabel( 'Reset', 'View' );
      xrButtons.get( 'submit' ).disabled = ! controlsEnabled || ! selectedFlow;
      xrButtons.get( 'submit' ).label = buildButtonLabel( 'Task', selectedFlow ? 'Submit' : 'Pick Route' );

      syncXrButtonVisuals();

    }

    function syncDebugUi() {

      if ( ! debugRayEnabled ) {

        return;

      }

      const debugText = getDebugPanelText();

      if ( desktopRefs.debugValue ) {

        desktopRefs.debugValue.textContent = debugText;

      }

      panelDebugText?.setText( debugText );

    }

    function syncAllUi() {

      syncDesktopPanel();
      syncXrPanel();
      syncDebugUi();

    }

    function applySceneState( sceneState, {
      source = 'scene-state',
      useExactPanelTransform = false,
      forceDefaultPanel = false,
    } = {} ) {

      if ( source === 'replay-scene' ) {

        setXrReplayHoverLockActive( true );
        clearHoverState( { invalidateAllSharedHover: true } );
        resetSelectionOwnershipTracking();
        activeGlobeDrag = null;
        activeGlobeMove = null;

      } else if ( context.getInteractionPolicy?.()?.hasReceivedReplayState !== true ) {

        setXrReplayHoverLockActive( false );

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
      applyMapDisplayModeVisibility();

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
    applyMapDisplayModeVisibility();
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

        clearHoverState( { invalidateAllSharedHover: true } );
        resetSelectionOwnershipTracking();
        setXrReplayHoverLockActive( false );
        clearVisibleFlowMeshes();
        clearTrackedCollection( uiSurfaces );
        clearTrackedCollection( staticObjects );
        root.removeFromParent();
        context.clearDesktopPanel();

      },
      update( deltaSeconds ) {

        panelShell.updateRuntimePlacement( { deltaSeconds } );
        syncXrLocalTargetsFromInteractorState();

        if ( debugRayEnabled ) {

          syncDebugUi();

        }

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
      resolveRaycastIntersection( sceneIntersections, resolverContext ) {

        return resolveDemo2RaycastIntersection( sceneIntersections, resolverContext );

      },
      onPresentationModeChange( presentationMode ) {

        xrPanelRoot.visible = presentationMode !== PRESENTATION_MODES.DESKTOP;
        clearHoverState( { invalidateAllSharedHover: true } );
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
