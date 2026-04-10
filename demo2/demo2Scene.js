import * as THREE from 'three';
import { mesh as buildTopojsonMesh } from 'topojson-client';
import { INTERACTORS, PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
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
    const demo2RaycastRoles = Object.freeze( {
      NODE: 'node',
      FLOW: 'flow',
      GLOBE_SHELL: 'globe-shell',
      GLOBE_HANDLE: 'globe-handle',
    } );
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
    const tempResolverRay = new THREE.Ray();
    const tempResolverNodeWorldCenter = new THREE.Vector3();
    const tempResolverShellContactPoint = new THREE.Vector3();
    const tempResolverCandidateWorldPoint = new THREE.Vector3();
    let interactionSequence = 0;
    let xrSourceActivitySequence = 0;
    const xrSourceActivityBySource = new Map();
    let dataset = null;
    let loadStatus = 'loading';
    let loadError = null;
    let currentSceneState = { ...defaultSceneState };
    let currentHoveredNodeId = null;
    let currentHoveredFlowId = null;
    let currentLocalTargetRecord = null;
    let currentLocalTargetSource = null;
    let currentTooltipTargetRecord = null;
    let activeTooltipSourceLabel = 'semantic-baseline';
    let activeTooltipOwnership = 'semantic-baseline';
    let activeTooltipFallbackReason = null;
    let selectedNodeSource = null;
    let selectedFlowSource = null;
    let selectedNodeSelectionSequence = - 1;
    let selectedFlowSelectionSequence = - 1;
    let currentVisibleFlows = [];
    let currentVisibleFlowEntries = [];
    let currentFlowEntryById = new Map();
    let currentFlowTargetIds = [];
    let currentBoundaryLines = null;
    let activeGlobeDrag = null;
    let activeGlobeMove = null;
    let lastLoggedGlobeYawDeg = currentSceneState.globeYawDeg;
    let lastGlobeYawLogAt = 0;
    let lastGlobeAnchorLogAt = 0;
    let dominantXrTooltipSource = null;
    let xrReplayHoverLockActive = false;
    let lastResolverDebug = null;

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
        baseDispose();

      };
      return mesh;

    }

    function setDemo2RaycastRole( object3D, role, targetId = null ) {

      if ( object3D ) {

        object3D.userData.demo2RaycastRole = role;
        object3D.userData.demo2RaycastId = typeof targetId === 'string' && targetId.trim().length > 0
          ? targetId.trim()
          : null;

      }

      return object3D;

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

    function attachDemo2TargetToObject( object3D, targetRecord, role = null ) {

      if ( ! object3D || ! targetRecord ) {

        return object3D;

      }

      targetRecordByObject.set( object3D, targetRecord );
      setDemo2RaycastRole( object3D, role || targetRecord.role || targetRecord.kind, targetRecord.id );
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

    function resolveDemo2NodeRayMissDistance( nodeId, resolverContext ) {

      if ( ! nodeId || ! resolverContext?.rayOrigin || ! resolverContext?.rayDirection ) {

        return null;

      }

      const nodeEntry = nodeEntriesById.get( nodeId );

      if ( ! nodeEntry?.hitProxy ) {

        return null;

      }

      nodeEntry.hitProxy.getWorldPosition( tempResolverNodeWorldCenter );
      tempResolverRay.origin.copy( resolverContext.rayOrigin );
      tempResolverRay.direction.copy( resolverContext.rayDirection ).normalize();
      return Math.sqrt( tempResolverRay.distanceSqToPoint( tempResolverNodeWorldCenter ) );

    }

    function resolveDemo2ShellContactDistance( hit, firstHit ) {

      if ( ! hit?.object || ! firstHit?.point ) {

        return null;

      }

      const role = resolveDemo2RaycastRole( hit );
      tempResolverShellContactPoint.copy( firstHit.point );

      if ( role === demo2RaycastRoles.NODE ) {

        const nodeId = resolveDemo2RaycastTargetId( hit.object );
        const nodeEntry = nodeEntriesById.get( nodeId );

        if ( ! nodeEntry?.hitProxy ) {

          return null;

        }

        nodeEntry.hitProxy.getWorldPosition( tempResolverCandidateWorldPoint );
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
      const distance = typeof hit?.distance === 'number' ? hit.distance : null;
      const distanceFromFirst = isFiniteNumber( distance ) && isFiniteNumber( firstHit?.distance )
        ? distance - firstHit.distance
        : null;
      const rayMissDistance = role === demo2RaycastRoles.NODE
        ? resolveDemo2NodeRayMissDistance( id, resolverContext )
        : null;
      const shellContactDistance = resolveDemo2RaycastRole( firstHit ) === demo2RaycastRoles.GLOBE_SHELL
        ? resolveDemo2ShellContactDistance( hit, firstHit )
        : null;

      return {
        hit,
        role,
        id,
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
      const distanceLabel = formatDebugDistance( candidate.distance );
      const missLabel = isFiniteNumber( candidate.rayMissDistance )
        ? ` miss=${formatDebugDistance( candidate.rayMissDistance )}`
        : '';
      const contactLabel = isFiniteNumber( candidate.shellContactDistance )
        ? ` contact=${formatDebugDistance( candidate.shellContactDistance )}`
        : '';
      return `${targetLabel}@${distanceLabel}${missLabel}${contactLabel}`;

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

    function resolveDemo2RaycastIntersection( sceneIntersections, resolverContext = null ) {

      const resolution = resolverContext?.pointerType === 'xr'
        ? resolveDemo2XrRaycastIntersection( sceneIntersections, resolverContext )
        : resolveDemo2DesktopRaycastIntersection( sceneIntersections, resolverContext );

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

          beginLocalXrInteraction( payload.source );

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
          clearHoverState( {
            source: payload.source,
            invalidateSharedHover: true,
          } );

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
    attachDemo2TargetToObject(
      globeHandleInteraction,
      registerDemo2TargetRecord( {
        targetId: buildDemo2TargetId( demo2RaycastRoles.GLOBE_HANDLE, demo2RaycastRoles.GLOBE_HANDLE ),
        kind: demo2RaycastRoles.GLOBE_HANDLE,
        role: demo2RaycastRoles.GLOBE_HANDLE,
        id: demo2RaycastRoles.GLOBE_HANDLE,
        priority: 4,
      } ),
      demo2RaycastRoles.GLOBE_HANDLE,
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

    function isXrControllerSource( source ) {

      return xrControllerSources.includes( source );

    }

    function nextXrSourceActivitySequence() {

      xrSourceActivitySequence += 1;
      return xrSourceActivitySequence;

    }

    function markDominantXrTooltipSource( source ) {

      if ( ! isXrControllerSource( source ) ) {

        return false;

      }

      dominantXrTooltipSource = source;
      xrSourceActivityBySource.set( source, nextXrSourceActivitySequence() );
      return true;

    }

    function hasXrButtonHoverForSource( source ) {

      for ( const button of xrButtons.values() ) {

        if ( button.hoverSources.has( source ) ) {

          return true;

        }

      }

      return false;

    }

    function hasLiveXrSourcePresence( source ) {

      if ( ! isXrControllerSource( source ) ) {

        return false;

      }

      return Boolean(
        localTargetBySource.has( source )
        || hasXrButtonHoverForSource( source )
        || activeGlobeDrag?.source === source
        || activeGlobeMove?.source === source
      );

    }

    function resolveMostRecentActiveXrSource() {

      let nextSource = null;
      let nextSequence = - 1;

      xrControllerSources.forEach( ( source ) => {

        if ( ! hasLiveXrSourcePresence( source ) ) {

          return;

        }

        const sequence = Math.max(
          localTargetBySource.get( source )?.sequence ?? - 1,
          xrSourceActivityBySource.get( source ) ?? - 1,
        );

        if ( sequence <= nextSequence ) {

          return;

        }

        nextSequence = sequence;
        nextSource = source;

      } );

      return nextSource;

    }

    function syncDominantXrTooltipSource() {

      if ( dominantXrTooltipSource && hasLiveXrSourcePresence( dominantXrTooltipSource ) ) {

        return dominantXrTooltipSource;

      }

      dominantXrTooltipSource = resolveMostRecentActiveXrSource();
      return dominantXrTooltipSource;

    }

    function setXrReplayHoverLockActive( isLocked ) {

      xrReplayHoverLockActive = Boolean( isLocked );

      if ( xrReplayHoverLockActive ) {

        xrControllerSources.forEach( ( source ) => {

          localTargetBySource.delete( source );

        } );
        dominantXrTooltipSource = null;

      }

    }

    function beginLocalXrInteraction( source ) {

      if ( ! isXrControllerSource( source ) ) {

        return false;

      }

      setXrReplayHoverLockActive( false );
      return markDominantXrTooltipSource( source );

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
      ownerType = 'hover-event',
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

        if ( previousEntry.ownerType !== ownerType ) {

          localTargetBySource.set( normalizedSource, {
            ...previousEntry,
            ownerType,
          } );

        }

        return false;

      }

      localTargetBySource.set( normalizedSource, {
        source: normalizedSource,
        targetId: targetRecord.targetId,
        kind: targetRecord.kind,
        id: targetRecord.id,
        sequence: Number.isInteger( sequence ) ? sequence : nextInteractionSequence(),
        ownerType,
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

    function resolveActiveXrTooltipSource() {

      if ( xrReplayHoverLockActive ) {

        return null;

      }

      const dominantSource = syncDominantXrTooltipSource();

      if ( dominantSource && localTargetBySource.has( dominantSource ) ) {

        return dominantSource;

      }

      return resolveMostRecentLocalXrSource() || dominantSource || null;

    }

    function resolveLocalTooltipOwnership( localEntry ) {

      return localEntry?.ownerType === 'sceneSelection'
        ? 'local-selection'
        : 'local-hover';

    }

    function resolveSemanticTooltipTargetState( {
      isImmersive = false,
      isReplaySemantic = false,
    } = {} ) {

      if ( isReplaySemantic ) {

        if ( currentSceneState.selectedFlowId ) {

          return {
            targetRecord: targetRecordsById.get( buildDemo2TargetId( 'flow', currentSceneState.selectedFlowId ) ) || null,
            ownership: 'replay-semantic',
            sourceLabel: 'replay-scene',
            fallbackReason: `selectedFlowId=${currentSceneState.selectedFlowId}`,
          };

        }

        if ( currentSceneState.selectedNodeId ) {

          return {
            targetRecord: targetRecordsById.get( buildDemo2TargetId( 'node', currentSceneState.selectedNodeId ) ) || null,
            ownership: 'replay-semantic',
            sourceLabel: 'replay-scene',
            fallbackReason: `selectedNodeId=${currentSceneState.selectedNodeId}`,
          };

        }

        if ( currentSceneState.focusedCountryId ) {

          return {
            targetRecord: targetRecordsById.get( buildDemo2TargetId( 'node', currentSceneState.focusedCountryId ) ) || null,
            ownership: 'replay-semantic',
            sourceLabel: 'replay-scene',
            fallbackReason: `focusedCountryId=${currentSceneState.focusedCountryId}`,
          };

        }

        return {
          targetRecord: null,
          ownership: 'replay-semantic',
          sourceLabel: 'replay-scene',
          fallbackReason: 'none',
        };

      }

      if ( isImmersive ) {

        if ( currentSceneState.selectedNodeId ) {

          return {
            targetRecord: targetRecordsById.get( buildDemo2TargetId( 'node', currentSceneState.selectedNodeId ) ) || null,
            ownership: 'semantic-baseline',
            sourceLabel: 'semantic-baseline',
            fallbackReason: `selectedNodeId=${currentSceneState.selectedNodeId}`,
          };

        }

        if ( currentSceneState.focusedCountryId ) {

          return {
            targetRecord: targetRecordsById.get( buildDemo2TargetId( 'node', currentSceneState.focusedCountryId ) ) || null,
            ownership: 'semantic-baseline',
            sourceLabel: 'semantic-baseline',
            fallbackReason: `focusedCountryId=${currentSceneState.focusedCountryId}`,
          };

        }

        return {
          targetRecord: null,
          ownership: 'semantic-baseline',
          sourceLabel: 'semantic-baseline',
          fallbackReason: 'none',
        };

      }

      if ( currentSceneState.selectedFlowId ) {

        return {
          targetRecord: targetRecordsById.get( buildDemo2TargetId( 'flow', currentSceneState.selectedFlowId ) ) || null,
          ownership: 'semantic-baseline',
          sourceLabel: 'semantic-baseline',
          fallbackReason: `selectedFlowId=${currentSceneState.selectedFlowId}`,
        };

      }

      if ( currentSceneState.selectedNodeId ) {

        return {
          targetRecord: targetRecordsById.get( buildDemo2TargetId( 'node', currentSceneState.selectedNodeId ) ) || null,
          ownership: 'semantic-baseline',
          sourceLabel: 'semantic-baseline',
          fallbackReason: `selectedNodeId=${currentSceneState.selectedNodeId}`,
        };

      }

      if ( currentSceneState.focusedCountryId ) {

        return {
          targetRecord: targetRecordsById.get( buildDemo2TargetId( 'node', currentSceneState.focusedCountryId ) ) || null,
          ownership: 'semantic-baseline',
          sourceLabel: 'semantic-baseline',
          fallbackReason: `focusedCountryId=${currentSceneState.focusedCountryId}`,
        };

      }

      return {
        targetRecord: null,
        ownership: 'semantic-baseline',
        sourceLabel: 'semantic-baseline',
        fallbackReason: 'none',
      };

    }

    function resolveHoverState() {

      const presentationMode = context.getPresentationMode?.();
      const isImmersive = presentationMode === PRESENTATION_MODES.IMMERSIVE_VR
        || presentationMode === PRESENTATION_MODES.IMMERSIVE_AR;
      const activeSource = isImmersive
        ? resolveActiveXrTooltipSource()
        : INTERACTORS.DESKTOP_POINTER;
      const activeLocalEntry = activeSource ? localTargetBySource.get( activeSource ) : null;

      currentLocalTargetSource = activeLocalEntry ? activeSource : null;
      currentLocalTargetRecord = activeLocalEntry?.targetId
        ? ( targetRecordsById.get( activeLocalEntry.targetId ) || null )
        : null;
      currentHoveredNodeId = currentLocalTargetRecord?.kind === 'node' ? currentLocalTargetRecord.id : null;
      currentHoveredFlowId = currentLocalTargetRecord?.kind === 'flow' ? currentLocalTargetRecord.id : null;

      if ( currentLocalTargetRecord ) {

        currentTooltipTargetRecord = currentLocalTargetRecord;
        activeTooltipOwnership = resolveLocalTooltipOwnership( activeLocalEntry );
        activeTooltipSourceLabel = activeTooltipOwnership === 'local-selection'
          ? `${currentLocalTargetSource || 'local'}:selection`
          : `${currentLocalTargetSource || 'local'}:hover`;
        activeTooltipFallbackReason = null;
        return;

      }

      const semanticTooltipState = resolveSemanticTooltipTargetState( {
        isImmersive,
        isReplaySemantic: xrReplayHoverLockActive,
      } );
      currentTooltipTargetRecord = semanticTooltipState.targetRecord;
      activeTooltipOwnership = semanticTooltipState.ownership;
      activeTooltipSourceLabel = semanticTooltipState.sourceLabel;
      activeTooltipFallbackReason = semanticTooltipState.fallbackReason;

    }

    function updateHoverMap( map, kind, source, id, isHovered ) {

      const normalizedSource = resolveSelectionSource( source );

      if ( ! normalizedSource ) {

        resolveHoverState();
        updateHighlightsAndTooltip();
        return;

      }

      if ( xrReplayHoverLockActive && isXrControllerSource( normalizedSource ) ) {

        clearHoverEntriesForSource( normalizedSource );

        resolveHoverState();
        updateHighlightsAndTooltip();
        return;

      }

      if ( isHovered ) {

        if ( isXrControllerSource( normalizedSource ) ) {

          markDominantXrTooltipSource( normalizedSource );

        }

        const targetRecord = targetRecordsById.get( buildDemo2TargetId( kind, id ) ) || null;

        if ( targetRecord?.targetId ) {

          setLocalTargetRecordForSource( normalizedSource, targetRecord, {
            ownerType: 'hover-event',
          } );

        }

      } else {

        const entry = localTargetBySource.get( normalizedSource );
        const targetId = buildDemo2TargetId( kind, id );

        if ( entry?.targetId === targetId || ! id ) {

          clearHoverEntriesForSource( normalizedSource );

        }

      }

      resolveHoverState();
      updateHighlightsAndTooltip();

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

      syncDominantXrTooltipSource();
      resolveHoverState();
      updateHighlightsAndTooltip();

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

        syncDominantXrTooltipSource();
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
      const previousDominantSource = dominantXrTooltipSource;

      xrControllerSources.forEach( ( source ) => {

        if ( xrReplayHoverLockActive ) {

          didChange = clearHoverEntriesForSource( source ) || didChange;
          return;

        }

        const interactorState = context.getSceneInteractorState?.( source ) || null;
        const selectionTargetRecord = resolveGeoTargetRecordFromSceneEntry( interactorState?.sceneSelection );
        const hoveredTargetRecord = resolveGeoTargetRecordFromSceneEntry( interactorState?.hoveredSceneEntry );
        const nextTargetRecord = selectionTargetRecord || hoveredTargetRecord || null;
        const nextSourceMode = selectionTargetRecord
          ? 'sceneSelection'
          : ( hoveredTargetRecord ? 'hoveredSceneEntry' : null );

        const didSourceChange = nextTargetRecord
          ? setLocalTargetRecordForSource( source, nextTargetRecord, {
            ownerType: nextSourceMode,
          } )
          : clearHoverEntriesForSource( source );

        if ( didSourceChange && nextTargetRecord ) {

          markDominantXrTooltipSource( source );

        }

        didChange = didSourceChange || didChange;

      } );

      const nextDominantSource = syncDominantXrTooltipSource();

      if ( ! didChange && previousDominantSource === nextDominantSource ) {

        return false;

      }

      resolveHoverState();
      updateHighlightsAndTooltip();
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

        return `${source}:${entry.targetId}#${entry.sequence ?? '-'}(${entry.ownerType || 'hover-event'})`;

      } );

      return parts.join( ' | ' );

    }

    function formatDebugTargetRecordSummary( targetRecord ) {

      if ( ! targetRecord?.kind || ! targetRecord?.id ) {

        return 'none';

      }

      return `${targetRecord.kind}:${targetRecord.id}`;

    }

    function resolvePrimaryDebugSource() {

      if ( dominantXrTooltipSource ) {

        return dominantXrTooltipSource;

      }

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
        `tooltip ${activeTooltipOwnership}:${activeTooltipSourceLabel} -> ${formatDebugTargetRecordSummary( currentTooltipTargetRecord )}`,
        `fallback ${activeTooltipFallbackReason || 'none'}`,
        `local ${formatDebugLocalTargetSummary()}`,
        `xr dominant:${dominantXrTooltipSource || '-'} lock:${xrReplayHoverLockActive ? 'on' : 'off'}`,
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

              markDominantXrTooltipSource( payload.source );
              button.hoverSources.add( payload.source );

            } else {

              button.hoverSources.delete( payload.source );
              syncDominantXrTooltipSource();

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
        entry.hitProxy.scale.setScalar( radiusScale );
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

              updateHoverMap( null, 'flow', payload.source, flow.flowId, payload.isHovered );

            },
            onSelectStart( payload ) {

              if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                return;

              }

              beginLocalXrInteraction( payload.source );
              updateHoverMap( null, 'flow', payload.source, flow.flowId, true );
              setSelectedFlowId( flow.flowId, {
                source: payload.source,
                shouldLog: true,
              } );

            },
          },
        );
        const midpoint = curve.getPoint( 0.5 );
        const targetRecord = registerDemo2TargetRecord( {
          targetId: buildDemo2TargetId( 'flow', flow.flowId ),
          kind: 'flow',
          role: demo2RaycastRoles.FLOW,
          id: flow.flowId,
          data: flow,
          priority: 2,
          buildTooltipText( { selected = false } = {} ) {

            return selected
              ? `${flow.label}\nSelected route | ${formatFlowValue( flow.value )}`
              : `${flow.label}\n${flow.year} | ${formatFlowValue( flow.value )}`;

          },
          getAnchor( out ) {

            out.copy( midpoint ).normalize().multiplyScalar( midpoint.length() + globe.tooltipForwardOffset );
            return out;

          },
        } );
        currentFlowTargetIds.push( targetRecord.targetId );
        attachDemo2TargetToObject( interactionMesh, targetRecord, demo2RaycastRoles.FLOW );
        const entry = {
          flow,
          visibleMesh,
          interactionMesh,
          midpoint,
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

      } );

    }

    function updateHighlightsAndTooltip() {

      resolveHoverState();
      const tooltipState = {
        visible: false,
        text: '',
        anchor: tempTooltipAnchor,
        suppressedNodeId: null,
      };

      if ( currentTooltipTargetRecord?.buildTooltipText && currentTooltipTargetRecord?.getAnchor ) {

        const isSelectedTooltip = activeTooltipOwnership !== 'local-hover';
        tooltipState.visible = true;
        tooltipState.text = currentTooltipTargetRecord.buildTooltipText( {
          selected: isSelectedTooltip,
          sceneState: currentSceneState,
        } );
        currentTooltipTargetRecord.getAnchor( tooltipState.anchor, {
          selected: isSelectedTooltip,
          sceneState: currentSceneState,
        } );
        tooltipState.suppressedNodeId = currentTooltipTargetRecord.kind === 'node'
          ? currentTooltipTargetRecord.id
          : null;

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

                updateHoverMap( null, 'node', payload.source, node.id, payload.isHovered );

              },
              onSelectStart( payload ) {

                if ( context.getInteractionPolicy?.()?.canInteract === false ) {

                  return;

                }

                beginLocalXrInteraction( payload.source );
                updateHoverMap( null, 'node', payload.source, node.id, true );
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
          const targetRecord = registerDemo2TargetRecord( {
            targetId: buildDemo2TargetId( 'node', node.id ),
            kind: 'node',
            role: demo2RaycastRoles.NODE,
            id: node.id,
            data: node,
            priority: 3,
            buildTooltipText( { selected = false } = {} ) {

              const stockValue = Number.parseFloat( node.stockByYear?.[ String( currentSceneState.geoYear ) ] ) || 0;
              return selected
                ? `${node.name}\nSelected focus | ${formatFlowValue( stockValue )} stock`
                : `${node.name}\nImmigrant stock ${formatFlowValue( stockValue )} | ${node.region}`;

            },
            getAnchor( out ) {

              out.copy( label.sprite.position );
              return out;

            },
          } );
          attachDemo2TargetToObject( hitProxy, targetRecord, demo2RaycastRoles.NODE );
          nodeEntriesById.set( node.id, {
            node,
            mesh,
            hitProxy,
            label,
            currentRadius: globe.nodeBaseRadius,
            targetRecord,
          } );

        } );

      }

      rebuildVisibleFlows();
      pruneLocalTargetState();
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

      if ( desktopRefs.debugValue ) {

        desktopRefs.debugValue.textContent = getDebugPanelText();

      }

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

        clearHoverState( { invalidateAllSharedHover: true } );
        resetSelectionOwnershipTracking();
        dominantXrTooltipSource = null;
        xrSourceActivityBySource.clear();
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
        dominantXrTooltipSource = null;
        xrSourceActivityBySource.clear();
        xrButtons.forEach( ( button ) => button.hoverSources.clear() );

        if ( presentationMode !== PRESENTATION_MODES.DESKTOP ) {

          ensureXrPanelPlacement();

        }

        syncAllUi();

      },
    };

  },
} );
