import * as THREE from 'three';
import { INTERACTORS, PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createSeededRandom, randomBetween, normalizeSeed } from '../scenes/core/seededRandom.js';
import {
  DEMO6_DEFAULT_ROUND_CONFIG_ID,
  DEMO6_DEFAULT_SEED,
  DEMO6_ROUND_STATES,
  DEMO6_TARGET_STATUSES,
  DEMO6_TARGET_TYPES,
  getDemo6RoundConfig,
  normalizeDemo6SceneState,
  parseDemo6Conditions,
} from './demo6Conditions.js';
import { DEMO6_DEFAULT_TASK_ID, getDemo6Task } from './demo6Tasks.js';
import { demo6LoggingConfig } from './demo6LoggingConfig.js';
import { demo6VisualConfig } from './demo6VisualConfig.js';

const HALF_PI = Math.PI * 0.5;
const tempVectorA = new THREE.Vector3();
const tempVectorB = new THREE.Vector3();
const tempVectorC = new THREE.Vector3();

const DEMO6_AUDIO_URLS = Object.freeze( {
  bomb: new URL( './audio/bomb.wav', import.meta.url ).href,
  fruit: new URL( './audio/fruit.wav', import.meta.url ).href,
  slicing: new URL( './audio/slicing.wav', import.meta.url ).href,
  gamestart: new URL( './audio/gamestart.wav', import.meta.url ).href,
} );

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function vector3FromArray( value, fallback = [ 0, 0, 0 ] ) {

  const source = Array.isArray( value ) && value.length === 3 ? value : fallback;
  return new THREE.Vector3(
    isFiniteNumber( source[ 0 ] ) ? source[ 0 ] : fallback[ 0 ],
    isFiniteNumber( source[ 1 ] ) ? source[ 1 ] : fallback[ 1 ],
    isFiniteNumber( source[ 2 ] ) ? source[ 2 ] : fallback[ 2 ],
  );

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
    transparent: opacity < 1,
    opacity,
    side,
    depthWrite,
    depthTest,
    toneMapped: false,
  } );

}

function createStandardMaterial( {
  color = 0xffffff,
  emissive = 0x000000,
  opacity = 1,
  roughness = 0.68,
  metalness = 0.04,
} = {} ) {

  return new THREE.MeshStandardMaterial( {
    color,
    emissive,
    transparent: opacity < 1,
    opacity,
    roughness,
    metalness,
  } );

}

function disposeMaterial( material, disposedMaterials ) {

  if ( ! material || disposedMaterials.has( material ) ) {

    return;

  }

  disposedMaterials.add( material );
  [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'alphaMap',
    'aoMap',
  ].forEach( ( key ) => {

    const texture = material[ key ];

    if ( texture?.dispose ) {

      texture.dispose();

    }

  } );
  material.dispose?.();

}

function disposeObjectTree( object, {
  disposeRoot = false,
  disposedGeometries = new Set(),
  disposedMaterials = new Set(),
} = {} ) {

  object?.traverse?.( ( child ) => {

    if ( child.geometry && ! disposedGeometries.has( child.geometry ) ) {

      disposedGeometries.add( child.geometry );
      child.geometry.dispose?.();

    }

    if ( Array.isArray( child.material ) ) {

      child.material.forEach( ( material ) => disposeMaterial( material, disposedMaterials ) );

    } else {

      disposeMaterial( child.material, disposedMaterials );

    }

  } );

  if ( disposeRoot ) {

    object.removeFromParent();

  }

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

    mesh.position.fromArray( position );

  }

  if ( rotation ) {

    mesh.rotation.set( rotation[ 0 ] || 0, rotation[ 1 ] || 0, rotation[ 2 ] || 0 );

  }

  if ( renderOrder !== null ) {

    mesh.renderOrder = renderOrder;

  }

  parent?.add( mesh );
  collection.push( {
    dispose() {

      mesh.removeFromParent();
      geometry.dispose?.();
      material.dispose?.();

    },
  } );
  return mesh;

}

function createTrackedTextPlane( collection, parent, options, position, {
  name = '',
  renderOrder = null,
  depthTest = false,
} = {} ) {

  const controller = createTextPlane( options );
  controller.mesh.name = name;
  controller.mesh.position.copy( vector3FromArray( position ) );

  if ( renderOrder !== null ) {

    controller.mesh.renderOrder = renderOrder;

  }

  if ( controller.mesh.material ) {

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

function formatAccuracy( accuracy ) {

  return `${Math.round( ( Number.isFinite( accuracy ) ? accuracy : 0 ) * 100 )}%`;

}

function createRoundSeed() {

  return normalizeSeed( `slice-${Date.now().toString( 36 )}-${Math.floor( Math.random() * 100000 ).toString( 36 )}` );

}

function getTargetPositionAt( target, elapsedMs ) {

  const t = Math.max( 0, ( elapsedMs - target.spawnTimeMs ) / 1000 );
  return tempVectorA
    .fromArray( target.start )
    .addScaledVector( tempVectorB.fromArray( target.velocity ), t )
    .addScaledVector( tempVectorC.fromArray( target.gravity ), t * t * 0.5 )
    .clone();

}

function segmentSphereIntersectionRatio( from, to, center, radius ) {

  const segment = tempVectorA.copy( to ).sub( from );
  const lengthSq = segment.lengthSq();

  if ( lengthSq <= 0.000001 ) {

    return null;

  }

  const ratio = THREE.MathUtils.clamp(
    tempVectorB.copy( center ).sub( from ).dot( segment ) / lengthSq,
    0,
    1,
  );
  const closest = tempVectorC.copy( from ).addScaledVector( segment, ratio );
  return closest.distanceToSquared( center ) <= radius * radius ? ratio : null;

}

function rayBoxIntersectionRange( origin, direction, box ) {

  let minDistance = 0;
  let maxDistance = Infinity;
  const axes = [ 'x', 'y', 'z' ];

  for ( const axis of axes ) {

    const component = direction[ axis ];
    const originValue = origin[ axis ];
    const minValue = box.min[ axis ];
    const maxValue = box.max[ axis ];

    if ( Math.abs( component ) < 0.000001 ) {

      if ( originValue < minValue || originValue > maxValue ) {

        return null;

      }

      continue;

    }

    const distanceA = ( minValue - originValue ) / component;
    const distanceB = ( maxValue - originValue ) / component;
    const nearDistance = Math.min( distanceA, distanceB );
    const farDistance = Math.max( distanceA, distanceB );
    minDistance = Math.max( minDistance, nearDistance );
    maxDistance = Math.min( maxDistance, farDistance );

    if ( maxDistance < minDistance ) {

      return null;

    }

  }

  return {
    near: Math.max( 0, minDistance ),
    far: maxDistance,
  };

}

function raySphereIntersectionDistance( origin, direction, center, radius, minDistance = 0, maxDistance = Infinity ) {

  const closestDistance = THREE.MathUtils.clamp(
    tempVectorA.copy( center ).sub( origin ).dot( direction ),
    minDistance,
    maxDistance,
  );
  const closestPoint = tempVectorB.copy( origin ).addScaledVector( direction, closestDistance );
  return closestPoint.distanceToSquared( center ) <= radius * radius ? closestDistance : null;

}

function buildSpawnPlan( seed, configId, durationOverrideMs = null ) {

  const config = getDemo6RoundConfig( configId );
  const random = createSeededRandom( `${seed}:${config.id}` );
  const fruitColors = demo6VisualConfig.targets.fruitColors;
  const durationMs = Number.isFinite( durationOverrideMs ) ? durationOverrideMs : config.durationMs;
  const targetCount = Math.min(
    config.targetCount,
    Math.max( 1, Math.floor( ( durationMs - config.firstSpawnMs ) / config.spawnCadenceMs ) + 1 ),
  );
  const targets = [];

  for ( let index = 0; index < targetCount; index += 1 ) {

    const type = random() <= config.fruitWeight ? DEMO6_TARGET_TYPES.FRUIT : DEMO6_TARGET_TYPES.BOMB;
    const radius = type === DEMO6_TARGET_TYPES.BOMB
      ? config.bombRadius
      : randomBetween( random, config.fruitRadiusRange[ 0 ], config.fruitRadiusRange[ 1 ] );

    targets.push( {
      id: `target-${index}`,
      index,
      type,
      spawnTimeMs: config.firstSpawnMs + index * config.spawnCadenceMs,
      lifetimeMs: config.targetLifetimeMs,
      radius,
      color: fruitColors[ index % fruitColors.length ],
      start: [
        randomBetween( random, config.spawnXRange[ 0 ], config.spawnXRange[ 1 ] ),
        randomBetween( random, config.spawnYRange[ 0 ], config.spawnYRange[ 1 ] ),
        randomBetween( random, config.spawnZRange[ 0 ], config.spawnZRange[ 1 ] ),
      ],
      velocity: [
        randomBetween( random, config.velocityXRange[ 0 ], config.velocityXRange[ 1 ] ),
        randomBetween( random, config.velocityYRange[ 0 ], config.velocityYRange[ 1 ] ),
        randomBetween( random, config.velocityZRange[ 0 ], config.velocityZRange[ 1 ] ),
      ],
      gravity: [ ...config.gravity ],
    } );

  }

  return targets;

}

export const demo6SceneDefinition = Object.freeze( {
  sceneKey: 'demo6',
  queryValue: '6',
  label: 'Demo 6 XR Mini-Game Replay',
  supportedImmersiveModes: Object.freeze( {
    ar: false,
    vr: true,
  } ),
  loggingConfig: demo6LoggingConfig,
  templateConfig: Object.freeze( {
    showFloor: false,
    showGrid: false,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
    modeOverrides: Object.freeze( {
      desktop: Object.freeze( {
        showFloor: false,
        showGrid: false,
      } ),
      'immersive-vr': Object.freeze( {
        showFloor: false,
        showGrid: false,
      } ),
      'immersive-ar': Object.freeze( {
        showFloor: false,
        showGrid: false,
      } ),
      analysis: Object.freeze( {
        showFloor: false,
        showGrid: false,
      } ),
    } ),
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return normalizeDemo6SceneState( candidateState, fallbackState, { defaultTaskId: DEMO6_DEFAULT_TASK_ID } );

  },
  createScene( context ) {

    const task = getDemo6Task( DEMO6_DEFAULT_TASK_ID );
    const root = new THREE.Group();
    const targetRoot = new THREE.Group();
    const bladeAfterimageRoot = new THREE.Group();
    const hudRoot = new THREE.Group();
    const controlRoot = new THREE.Group();
    const disposables = [];
    const targetRecords = new Map();
    const buttonRecords = new Map();
    const desktopRefs = {};
    const playBounds = new THREE.Box3();
    const defaultSceneState = parseDemo6Conditions( window.location.search, { defaultTaskId: DEMO6_DEFAULT_TASK_ID } );
    const queryHasSeed = new URLSearchParams( window.location.search ).has( 'seed' );
    let currentSceneState = normalizeDemo6SceneState( defaultSceneState, defaultSceneState );
    let spawnPlan = buildSpawnPlan( currentSceneState.roundSeed, currentSceneState.roundConfigId, currentSceneState.durationMs );
    let currentPresentationMode = context.getPresentationMode?.() || PRESENTATION_MODES.DESKTOP;
    let disposed = false;
    let lastClockSampleElapsedMs = 0;
    let bladeAfterimageGeometryDirty = true;
    const liveBladeAfterimageSegments = [];
    const lastBladeBySource = new Map();

    const previousCameraSettings = {
      near: context.camera.near,
      far: context.camera.far,
      fov: context.camera.fov,
    };
    const previousSceneSettings = {
      fog: context.scene.fog,
      background: context.scene.background,
    };

    root.name = 'demo6-slice-rush-root';
    targetRoot.name = 'demo6-target-root';
    bladeAfterimageRoot.name = 'demo6-live-blade-afterimage-root';
    hudRoot.name = 'demo6-hud-root';
    controlRoot.name = 'demo6-control-root';
    root.add( targetRoot, bladeAfterimageRoot, hudRoot, controlRoot );

    const hudPosition = vector3FromArray( demo6VisualConfig.hud.position );
    hudRoot.position.copy( hudPosition );
    hudRoot.lookAt( new THREE.Vector3( hudPosition.x, hudPosition.y, 0 ) );
    const controlPosition = vector3FromArray( demo6VisualConfig.controls.position );
    controlRoot.position.copy( controlPosition );
    controlRoot.lookAt( new THREE.Vector3( controlPosition.x, controlPosition.y, 0 ) );

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || demo6LoggingConfig.sceneState;

    }

    function getDemo6LoggingTuning() {

      return context.getLoggingConfig?.()?.demo6 || demo6LoggingConfig.demo6;

    }

    function getStableSceneLabel( key ) {

      return getDemo6LoggingTuning().stableLabels?.[ key ] || key;

    }

    function recordSceneChange( labelKey, source, { flushImmediately = false } = {} ) {

      return context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( labelKey ),
        flushImmediately,
      } ) === true;

    }

    function canAcceptGameplayInput() {

      const policy = context.getInteractionPolicy?.();
      return policy?.canInteract !== false && policy?.isAnalysisSession !== true;

    }

    function recomputeAccuracy() {

      const attempts = currentSceneState.hits + currentSceneState.misses + currentSceneState.bombHits;
      currentSceneState.accuracy = attempts > 0 ? Number( ( currentSceneState.hits / attempts ).toFixed( 4 ) ) : 0;

    }

    function rebuildSpawnPlan() {

      spawnPlan = buildSpawnPlan( currentSceneState.roundSeed, currentSceneState.roundConfigId, currentSceneState.durationMs );

    }

    function updatePlayBounds() {

      const playArea = demo6VisualConfig.playArea;
      const center = vector3FromArray( playArea.center );
      const halfWidth = playArea.width * 0.5;
      const halfHeight = playArea.height * 0.5;
      const halfDepth = playArea.depth * 0.5;
      playBounds.min.set( center.x - halfWidth, center.y - halfHeight, center.z - halfDepth );
      playBounds.max.set( center.x + halfWidth, center.y + halfHeight, center.z + halfDepth );

    }

    function playSound( key ) {

      if ( typeof Audio === 'undefined' || ! DEMO6_AUDIO_URLS[ key ] ) {

        return;

      }

      const audio = new Audio( DEMO6_AUDIO_URLS[ key ] );
      audio.volume = demo6VisualConfig.audio?.volume ?? 0.72;
      const playPromise = audio.play?.();

      if ( playPromise?.catch ) {

        playPromise.catch( () => {} );

      }

    }

    function getOutcomeMap() {

      return new Map( currentSceneState.targetOutcomes.map( ( outcome ) => [ outcome.id, outcome ] ) );

    }

    function setTargetOutcome( target, status, source, atMs = currentSceneState.elapsedMs ) {

      const nextOutcome = {
        id: target.id,
        type: target.type,
        status,
        atMs: Math.round( atMs ),
        source: source || null,
      };
      const existing = currentSceneState.targetOutcomes.filter( ( outcome ) => outcome.id !== target.id );
      existing.push( nextOutcome );
      currentSceneState.targetOutcomes = existing.slice( 0, spawnPlan.length );
      currentSceneState.lastEvent = status;
      currentSceneState.lastEventTargetId = target.id;
      currentSceneState.lastEventAtMs = Math.round( currentSceneState.elapsedMs );
      return nextOutcome;

    }

    function createTargetRecord( index ) {

      const group = new THREE.Group();
      group.name = `demo6-target-${index}`;
      group.visible = false;

      const fruitMaterial = createStandardMaterial( {
        color: demo6VisualConfig.targets.fruitColors[ index % demo6VisualConfig.targets.fruitColors.length ],
        emissive: demo6VisualConfig.targets.fruitEmissive,
        roughness: demo6VisualConfig.targets.fruitRoughness,
      } );
      const fruit = new THREE.Mesh( new THREE.IcosahedronGeometry( 1, 1 ), fruitMaterial );
      fruit.name = `demo6-fruit-${index}`;
      fruit.castShadow = true;
      fruit.receiveShadow = true;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry( 0.11, 0.08, 0.42, 8 ),
        createStandardMaterial( { color: 0x5f3b18, roughness: 0.86 } ),
      );
      stem.position.set( 0.06, 0.9, 0 );
      stem.rotation.z = THREE.MathUtils.degToRad( - 18 );
      const fruitGroup = new THREE.Group();
      fruitGroup.name = `demo6-fruit-group-${index}`;
      fruitGroup.add( fruit, stem );

      const bomb = new THREE.Mesh(
        new THREE.SphereGeometry( 1, 18, 14 ),
        createStandardMaterial( {
          color: demo6VisualConfig.targets.bombColor,
          emissive: demo6VisualConfig.targets.bombEmissive,
          roughness: 0.48,
          metalness: 0.12,
        } ),
      );
      bomb.name = `demo6-bomb-${index}`;
      const fuse = new THREE.Mesh(
        new THREE.CylinderGeometry( 0.08, 0.08, 0.58, 8 ),
        createStandardMaterial( { color: demo6VisualConfig.targets.bombAccentColor, emissive: 0x2d0207 } ),
      );
      fuse.position.set( 0.24, 0.82, 0 );
      fuse.rotation.z = THREE.MathUtils.degToRad( - 28 );
      const bombGroup = new THREE.Group();
      bombGroup.name = `demo6-bomb-group-${index}`;
      bombGroup.add( bomb, fuse );

      group.add( fruitGroup, bombGroup );
      targetRoot.add( group );
      targetRecords.set( `target-${index}`, {
        group,
        fruitGroup,
        bombGroup,
        fruit,
        bomb,
        fruitMaterial,
        bombMaterial: bomb.material,
      } );

    }

    function createPlayArea() {

      updatePlayBounds();
      const playArea = demo6VisualConfig.playArea;
      const center = vector3FromArray( playArea.center );
      const backZ = playBounds.min.z;

      createTrackedMesh(
        disposables,
        root,
        new THREE.PlaneGeometry( playArea.floorWidth, playArea.floorDepth ),
        createBasicMaterial( {
          color: demo6VisualConfig.environment.groundColor,
          opacity: demo6VisualConfig.environment.groundOpacity,
        } ),
        {
          name: 'demo6-ground',
          position: [ 0, 0, - 2.7 ],
          rotation: [ - HALF_PI, 0, 0 ],
          renderOrder: - 2,
        },
      );

      const wallMaterialOptions = {
        color: demo6VisualConfig.environment.laneColor,
        opacity: demo6VisualConfig.environment.laneOpacity,
        depthWrite: false,
      };

      const backWall = createTrackedMesh(
        disposables,
        root,
        new THREE.PlaneGeometry( playArea.width, playArea.height ),
        createBasicMaterial( wallMaterialOptions ),
        {
          name: 'demo6-play-room-back-wall',
          position: [ center.x, center.y, backZ ],
          renderOrder: - 3,
        },
      );

      const sideWallMaterialOptions = {
        ...wallMaterialOptions,
        opacity: demo6VisualConfig.environment.sideWallOpacity,
      };
      const sideWallGeometry = new THREE.PlaneGeometry( playArea.depth, playArea.height );
      const sideWallMaterial = createBasicMaterial( sideWallMaterialOptions );
      const leftWall = new THREE.Mesh( sideWallGeometry, sideWallMaterial );
      const rightWall = new THREE.Mesh( sideWallGeometry.clone(), sideWallMaterial.clone() );
      leftWall.name = 'demo6-play-room-left-wall';
      rightWall.name = 'demo6-play-room-right-wall';
      leftWall.position.set( playBounds.min.x, center.y, center.z );
      rightWall.position.set( playBounds.max.x, center.y, center.z );
      leftWall.rotation.y = HALF_PI;
      rightWall.rotation.y = HALF_PI;
      leftWall.renderOrder = - 3;
      rightWall.renderOrder = - 3;
      root.add( leftWall, rightWall );
      [ backWall, leftWall, rightWall ].forEach( ( wall ) => {

        wall.userData.demo6RoomWall = true;

      } );
      context.registerRaycastTarget?.( backWall, {} );
      context.registerRaycastTarget?.( leftWall, {} );
      context.registerRaycastTarget?.( rightWall, {} );
      disposables.push( {
        dispose() {

          context.unregisterRaycastTarget?.( backWall );
          context.unregisterRaycastTarget?.( leftWall );
          context.unregisterRaycastTarget?.( rightWall );
          leftWall.removeFromParent();
          rightWall.removeFromParent();
          sideWallGeometry.dispose();
          leftWall.material.dispose();
          rightWall.geometry.dispose();
          rightWall.material.dispose();

        },
      } );

      const halfWidth = playArea.width * 0.5;
      const halfHeight = playArea.height * 0.5;
      const positions = new Float32Array( [
        center.x - halfWidth, center.y - halfHeight, backZ,
        center.x + halfWidth, center.y - halfHeight, backZ,
        center.x + halfWidth, center.y - halfHeight, backZ,
        center.x + halfWidth, center.y + halfHeight, backZ,
        center.x + halfWidth, center.y + halfHeight, backZ,
        center.x - halfWidth, center.y + halfHeight, backZ,
        center.x - halfWidth, center.y + halfHeight, backZ,
        center.x - halfWidth, center.y - halfHeight, backZ,
      ] );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
      const line = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial( {
          color: demo6VisualConfig.environment.laneLineColor,
          transparent: true,
          opacity: demo6VisualConfig.environment.laneLineOpacity,
          toneMapped: false,
        } ),
      );
      line.name = 'demo6-play-lane-outline';
      root.add( line );
      disposables.push( {
        dispose() {

          line.removeFromParent();
          geometry.dispose();
          line.material.dispose();

        },
      } );

    }

    const bladeAfterimageGeometry = new THREE.BufferGeometry();
    const bladeAfterimageMaterial = new THREE.LineBasicMaterial( {
      vertexColors: true,
      transparent: true,
      opacity: demo6VisualConfig.blade.liveOpacity,
      toneMapped: false,
    } );
    const bladeAfterimageLines = new THREE.LineSegments( bladeAfterimageGeometry, bladeAfterimageMaterial );
    bladeAfterimageLines.name = 'demo6-live-blade-afterimages';
    bladeAfterimageLines.renderOrder = 20;
    bladeAfterimageRoot.add( bladeAfterimageLines );
    disposables.push( {
      dispose() {

        bladeAfterimageLines.removeFromParent();
        bladeAfterimageGeometry.dispose();
        bladeAfterimageMaterial.dispose();

      },
    } );

    let hudTextController = null;
    let statusTextController = null;

    function createHud() {

      createTrackedMesh(
        disposables,
        hudRoot,
        new THREE.PlaneGeometry( demo6VisualConfig.hud.width, demo6VisualConfig.hud.height ),
        createBasicMaterial( {
          color: demo6VisualConfig.hud.backgroundColor,
          opacity: demo6VisualConfig.hud.backgroundOpacity,
          depthTest: false,
        } ),
        {
          name: 'demo6-hud-background',
          renderOrder: 30,
        },
      );
      hudTextController = createTrackedTextPlane(
        disposables,
        hudRoot,
        {
          ...demo6VisualConfig.text.hud,
          text: 'Slice Rush',
          textColor: demo6VisualConfig.hud.accentTextColor,
        },
        [ 0, 0.19, 0.025 ],
        { name: 'demo6-hud-score', renderOrder: 34, depthTest: false },
      );
      statusTextController = createTrackedTextPlane(
        disposables,
        hudRoot,
        {
          ...demo6VisualConfig.text.status,
          text: task.prompt,
          textColor: demo6VisualConfig.hud.textColor,
        },
        [ 0, - 0.16, 0.025 ],
        { name: 'demo6-hud-status', renderOrder: 34, depthTest: false },
      );

    }

    function createButton( {
      key,
      label,
      x,
      onPress,
    } ) {

      const controls = demo6VisualConfig.controls;
      const mesh = createTrackedMesh(
        disposables,
        controlRoot,
        new THREE.PlaneGeometry( controls.buttonWidth, controls.buttonHeight ),
        createBasicMaterial( {
          color: controls.buttonColor,
          opacity: 0.98,
          depthTest: false,
        } ),
        {
          name: `demo6-button-${key}`,
          position: [ x, 0, 0 ],
          renderOrder: 30,
        },
      );
      const text = createTrackedTextPlane(
        disposables,
        controlRoot,
        {
          ...demo6VisualConfig.text.button,
          text: label,
          textColor: controls.textColor,
        },
        [ x, 0, 0.025 ],
        { name: `demo6-button-${key}-label`, renderOrder: 35, depthTest: false },
      );
      const record = {
        key,
        label,
        mesh,
        text,
        hovered: false,
      };
      buttonRecords.set( key, record );
      disposables.push( createSceneUiSurface( context, {
        parent: controlRoot,
        width: controls.buttonWidth,
        height: controls.buttonHeight,
        name: `demo6-button-${key}-surface`,
        position: [ x, 0, 0.05 ],
        handlers: {
          onHoverChange( payload ) {

            record.hovered = payload.isHovered === true;
            syncButtons();

          },
          onSelectStart( payload ) {

            if ( ! canAcceptGameplayInput() ) {

              return;

            }

            onPress( payload.source || `demo6-${key}` );

          },
        },
      } ) );

    }

    function createControls() {

      const gap = demo6VisualConfig.controls.buttonGap;
      createButton( {
        key: 'start',
        label: 'Start',
        x: - gap,
        onPress: ( source ) => startRound( source ),
      } );
      createButton( {
        key: 'reset',
        label: 'Reset',
        x: 0,
        onPress: ( source ) => resetScene( source ),
      } );
      createButton( {
        key: 'submit',
        label: 'Submit',
        x: gap,
        onPress: ( source ) => submitTask( source ),
      } );

    }

    function createDesktopSlicePlane() {

      disposables.push( createSceneUiSurface( context, {
        parent: root,
        width: demo6VisualConfig.playArea.desktopSlicePlaneWidth,
        height: demo6VisualConfig.playArea.desktopSlicePlaneHeight,
        name: 'demo6-desktop-slice-plane',
        position: demo6VisualConfig.playArea.desktopSlicePlanePosition,
        handlers: {
          onSelectStart( payload ) {

            if ( payload.pointerType !== 'desktop' || ! canAcceptGameplayInput() ) {

              return;

            }

            beginDesktopSlice( payload );

          },
          onSelectMove( payload ) {

            if ( payload.pointerType !== 'desktop' || ! canAcceptGameplayInput() ) {

              return;

            }

            continueDesktopSlice( payload );

          },
          onSelectEnd( payload ) {

            lastBladeBySource.delete( payload.source || INTERACTORS.DESKTOP_POINTER );

          },
        },
      } ) );

    }

    function syncButtons() {

      buttonRecords.forEach( ( record ) => {

        const active = (
          ( record.key === 'start' && currentSceneState.roundState === DEMO6_ROUND_STATES.RUNNING ) ||
          ( record.key === 'submit' && currentSceneState.taskSubmitted )
        );
        record.mesh.material.color.setHex(
          active
            ? demo6VisualConfig.controls.buttonActiveColor
            : ( record.hovered ? demo6VisualConfig.controls.buttonHoverColor : demo6VisualConfig.controls.buttonColor ),
        );

      } );

    }

    function getTargetVisualStatus( target, resultMap ) {

      const outcome = resultMap.get( target.id );

      if ( outcome ) {

        return outcome.status;

      }

      if ( currentSceneState.roundState === DEMO6_ROUND_STATES.IDLE || currentSceneState.elapsedMs < target.spawnTimeMs ) {

        return DEMO6_TARGET_STATUSES.PENDING;

      }

      if ( currentSceneState.elapsedMs <= target.spawnTimeMs + target.lifetimeMs ) {

        return DEMO6_TARGET_STATUSES.ACTIVE;

      }

      return target.type === DEMO6_TARGET_TYPES.FRUIT
        ? DEMO6_TARGET_STATUSES.MISSED
        : DEMO6_TARGET_STATUSES.PENDING;

    }

    function syncTargets() {

      const outcomeMap = getOutcomeMap();
      targetRecords.forEach( ( record ) => {

        record.group.visible = false;

      } );

      spawnPlan.forEach( ( target ) => {

        const record = targetRecords.get( target.id );

        if ( ! record ) {

          return;

        }

        const status = getTargetVisualStatus( target, outcomeMap );
        const visible = status === DEMO6_TARGET_STATUSES.ACTIVE;
        const position = getTargetPositionAt( target, currentSceneState.elapsedMs );
        record.group.position.copy( position );
        record.group.visible = visible;
        record.fruitGroup.visible = target.type === DEMO6_TARGET_TYPES.FRUIT;
        record.bombGroup.visible = target.type === DEMO6_TARGET_TYPES.BOMB;

        if ( record.fruitMaterial.color ) {

          record.fruitMaterial.color.setHex(
            target.color,
          );
          record.fruitMaterial.opacity = 1;
          record.fruitMaterial.transparent = false;

        }

        if ( record.bombMaterial.color ) {

          record.bombMaterial.color.setHex( demo6VisualConfig.targets.bombColor );

        }

        if ( visible ) {

          record.group.scale.setScalar( target.radius );

        } else {

          record.group.scale.setScalar( 0.001 );

        }

      } );

    }

    function syncLiveBladeAfterimages() {

      if ( ! bladeAfterimageGeometryDirty ) {

        return;

      }

      bladeAfterimageGeometryDirty = false;
      const positions = [];
      const colors = [];
      const nowMs = performance.now();
      const lifetimeMs = demo6VisualConfig.blade.afterimageLifetimeMs;

      liveBladeAfterimageSegments.forEach( ( segment ) => {

        positions.push( ...segment.from, ...segment.to );
        const color = new THREE.Color( demo6VisualConfig.blade.colors[ segment.source ] || 0xffffff );
        const fade = THREE.MathUtils.clamp( 1 - ( nowMs - segment.createdAtMs ) / lifetimeMs, 0, 1 );
        colors.push(
          color.r * fade, color.g * fade, color.b * fade,
          color.r * fade, color.g * fade, color.b * fade,
        );

      } );

      bladeAfterimageGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
      bladeAfterimageGeometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );

      if ( positions.length > 0 ) {

        bladeAfterimageGeometry.computeBoundingSphere();

      }

    }

    function appendLiveBladeAfterimage( source, from, to ) {

      liveBladeAfterimageSegments.push( {
        source,
        from: [ Number( from.x.toFixed( 4 ) ), Number( from.y.toFixed( 4 ) ), Number( from.z.toFixed( 4 ) ) ],
        to: [ Number( to.x.toFixed( 4 ) ), Number( to.y.toFixed( 4 ) ), Number( to.z.toFixed( 4 ) ) ],
        createdAtMs: performance.now(),
      } );

      if ( liveBladeAfterimageSegments.length > demo6VisualConfig.blade.afterimageMaxSegments ) {

        liveBladeAfterimageSegments.splice( 0, liveBladeAfterimageSegments.length - demo6VisualConfig.blade.afterimageMaxSegments );

      }

      bladeAfterimageGeometryDirty = true;

    }

    function pruneLiveBladeAfterimages() {

      const nowMs = performance.now();
      const lifetimeMs = demo6VisualConfig.blade.afterimageLifetimeMs;
      const originalLength = liveBladeAfterimageSegments.length;

      for ( let index = liveBladeAfterimageSegments.length - 1; index >= 0; index -= 1 ) {

        if ( nowMs - liveBladeAfterimageSegments[ index ].createdAtMs > lifetimeMs ) {

          liveBladeAfterimageSegments.splice( index, 1 );

        }

      }

      if ( liveBladeAfterimageSegments.length !== originalLength ) {

        bladeAfterimageGeometryDirty = true;

      }

      if ( liveBladeAfterimageSegments.length > 0 ) {

        bladeAfterimageGeometryDirty = true;

      }

    }

    function syncHud() {

      const timeLeft = Math.max( 0, Math.ceil( ( currentSceneState.durationMs - currentSceneState.elapsedMs ) / 1000 ) );
      hudTextController?.setText(
        `Score ${currentSceneState.score}  Combo ${currentSceneState.combo}  Time ${timeLeft}s`,
      );
      statusTextController?.setText( [
        `Hits ${currentSceneState.hits} | Misses ${currentSceneState.misses} | Bombs ${currentSceneState.bombHits} | Accuracy ${formatAccuracy( currentSceneState.accuracy )}`,
        `${currentSceneState.roundState.toUpperCase()} | Seed ${currentSceneState.roundSeed} | Last ${currentSceneState.lastEvent}`,
      ].join( '\n' ) );

      if ( desktopRefs.status ) {

        desktopRefs.status.textContent = [
          `Round: ${currentSceneState.roundState}`,
          `Score: ${currentSceneState.score}`,
          `Combo: ${currentSceneState.combo} / max ${currentSceneState.comboMax}`,
          `Hits/Misses/Bombs: ${currentSceneState.hits}/${currentSceneState.misses}/${currentSceneState.bombHits}`,
          `Accuracy: ${formatAccuracy( currentSceneState.accuracy )}`,
          `Elapsed: ${Math.round( currentSceneState.elapsedMs )} ms`,
          `Seed: ${currentSceneState.roundSeed}`,
          `Last: ${currentSceneState.lastEvent}${currentSceneState.lastEventTargetId ? ` (${currentSceneState.lastEventTargetId})` : ''}`,
        ].join( '\n' );

      }

    }

    function syncVisuals() {

      syncTargets();
      pruneLiveBladeAfterimages();
      syncLiveBladeAfterimages();
      syncHud();
      syncButtons();

    }

    function applyTargetHit( target, source ) {

      if ( target.type === DEMO6_TARGET_TYPES.BOMB ) {

        currentSceneState.score = Math.max( 0, currentSceneState.score - demo6VisualConfig.scoring.bombPenalty );
        currentSceneState.combo = 0;
        currentSceneState.bombHits += 1;
        setTargetOutcome( target, DEMO6_TARGET_STATUSES.BOMB_HIT, source );
        recomputeAccuracy();
        playSound( 'bomb' );
        syncTargets();
        syncHud();
        recordSceneChange( 'bombHit', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnBombHit,
        } );
        return true;

      }

      currentSceneState.score += demo6VisualConfig.scoring.fruitScore;
      currentSceneState.combo += 1;
      currentSceneState.comboMax = Math.max( currentSceneState.comboMax, currentSceneState.combo );
      currentSceneState.hits += 1;
      setTargetOutcome( target, DEMO6_TARGET_STATUSES.SLICED, source );
      recomputeAccuracy();
      playSound( 'fruit' );
      playSound( 'slicing' );
      syncTargets();
      syncHud();
      recordSceneChange( 'sliceTarget', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnSliceTarget,
      } );
      return false;

    }

    function collectSegmentSliceCandidates( source, from, to, outcomeMap ) {

      const candidates = [];

      spawnPlan.forEach( ( target ) => {

        if ( outcomeMap.has( target.id ) ) {

          return;

        }

        if (
          currentSceneState.elapsedMs < target.spawnTimeMs ||
          currentSceneState.elapsedMs > target.spawnTimeMs + target.lifetimeMs
        ) {

          return;

        }

        const center = getTargetPositionAt( target, currentSceneState.elapsedMs );
        const ratio = segmentSphereIntersectionRatio(
          from,
          to,
          center,
          target.radius * demo6VisualConfig.blade.desktopHitRadiusScale,
        );

        if ( ratio !== null ) {

          candidates.push( {
            target,
            ratio,
            source,
          } );

        }

      } );

      return candidates;

    }

    function collectPointSliceCandidates( source, point, outcomeMap ) {

      const candidates = [];

      spawnPlan.forEach( ( target ) => {

        if ( outcomeMap.has( target.id ) ) {

          return;

        }

        if (
          currentSceneState.elapsedMs < target.spawnTimeMs ||
          currentSceneState.elapsedMs > target.spawnTimeMs + target.lifetimeMs
        ) {

          return;

        }

        const center = getTargetPositionAt( target, currentSceneState.elapsedMs );
        const distance = point.distanceTo( center );

        if ( distance <= target.radius * demo6VisualConfig.blade.desktopHitRadiusScale ) {

          candidates.push( {
            target,
            ratio: distance,
            source,
          } );

        }

      } );

      return candidates;

    }

    function collectRaySliceCandidates( source, origin, direction, outcomeMap ) {

      updatePlayBounds();
      const range = rayBoxIntersectionRange( origin, direction, playBounds );

      if ( ! range || ! Number.isFinite( range.far ) || range.far <= range.near ) {

        return [];

      }

      const from = tempVectorA.copy( origin ).addScaledVector( direction, range.near ).clone();
      const to = tempVectorB.copy( origin ).addScaledVector( direction, range.far ).clone();
      const candidates = [];
      appendLiveBladeAfterimage( source, from, to );

      spawnPlan.forEach( ( target ) => {

        if ( outcomeMap.has( target.id ) ) {

          return;

        }

        if (
          currentSceneState.elapsedMs < target.spawnTimeMs ||
          currentSceneState.elapsedMs > target.spawnTimeMs + target.lifetimeMs
        ) {

          return;

        }

        const center = getTargetPositionAt( target, currentSceneState.elapsedMs );
        const distance = raySphereIntersectionDistance(
          origin,
          direction,
          center,
          target.radius * demo6VisualConfig.blade.rayHitRadiusScale,
          range.near,
          range.far,
        );

        if ( distance !== null ) {

          candidates.push( {
            target,
            ratio: distance,
            source,
          } );

        }

      } );

      return candidates;

    }

    function applySliceCandidates( candidates, source ) {

      candidates
        .sort( ( a, b ) => a.ratio - b.ratio )
        .slice( 0, demo6VisualConfig.blade.maxHitsPerRay )
        .some( ( candidate ) => applyTargetHit( candidate.target, candidate.source || source ) === true );

    }

    function updateBladeFromPoint( source, point ) {

      if ( ! point || currentSceneState.roundState !== DEMO6_ROUND_STATES.RUNNING ) {

        return;

      }

      const next = point.clone();
      const previous = lastBladeBySource.get( source );
      const outcomeMap = getOutcomeMap();
      lastBladeBySource.set( source, {
        position: next.clone(),
        elapsedMs: currentSceneState.elapsedMs,
      } );

      if ( ! previous ) {

        applySliceCandidates( collectPointSliceCandidates( source, next, outcomeMap ), source );
        return;

      }

      appendLiveBladeAfterimage( source, previous.position, next );
      applySliceCandidates( collectSegmentSliceCandidates( source, previous.position, next, outcomeMap ), source );

    }

    function updateVrBlades() {

      if ( currentSceneState.roundState !== DEMO6_ROUND_STATES.RUNNING || currentPresentationMode !== PRESENTATION_MODES.IMMERSIVE_VR ) {

        return;

      }

      context.getSceneInteractorPoseSnapshots?.().forEach( ( pose ) => {

        if ( pose.isPresenting !== true || pose.isConnected !== true ) {

          return;

        }

        const origin = vector3FromArray( pose.rayOrigin );
        const direction = vector3FromArray( pose.rayDirection, [ 0, 0, - 1 ] ).normalize();
        applySliceCandidates(
          collectRaySliceCandidates( pose.source, origin, direction, getOutcomeMap() ),
          pose.source,
        );

      } );

    }

    function beginDesktopSlice( payload ) {

      lastBladeBySource.delete( payload.source || INTERACTORS.DESKTOP_POINTER );
      continueDesktopSlice( payload );

    }

    function continueDesktopSlice( payload ) {

      if ( currentSceneState.roundState !== DEMO6_ROUND_STATES.RUNNING || ! payload.point ) {

        return;

      }

      updateBladeFromPoint( payload.source || INTERACTORS.DESKTOP_POINTER, payload.point );

    }

    function markExpiredTargets() {

      if ( currentSceneState.roundState !== DEMO6_ROUND_STATES.RUNNING ) {

        return;

      }

      const outcomeMap = getOutcomeMap();

      spawnPlan.forEach( ( target ) => {

        if (
          target.type !== DEMO6_TARGET_TYPES.FRUIT ||
          outcomeMap.has( target.id ) ||
          currentSceneState.elapsedMs <= target.spawnTimeMs + target.lifetimeMs
        ) {

          return;

        }

        currentSceneState.misses += 1;
        currentSceneState.combo = 0;
        setTargetOutcome( target, DEMO6_TARGET_STATUSES.MISSED, 'demo6-clock' );
        recomputeAccuracy();
        recordSceneChange( 'missTarget', 'demo6-clock', {
          flushImmediately: getSceneStateLoggingConfig().flushOnMissTarget,
        } );

      } );

    }

    function startRound( source = 'demo6-start' ) {

      if ( ! canAcceptGameplayInput() ) {

        return;

      }

      currentSceneState = normalizeDemo6SceneState( {
        ...parseDemo6Conditions( '', { defaultTaskId: DEMO6_DEFAULT_TASK_ID } ),
        roundState: DEMO6_ROUND_STATES.RUNNING,
        roundSeed: queryHasSeed ? currentSceneState.roundSeed : createRoundSeed(),
        roundConfigId: currentSceneState.roundConfigId || DEMO6_DEFAULT_ROUND_CONFIG_ID,
        durationMs: currentSceneState.durationMs,
        lastEvent: 'round-start',
      }, currentSceneState );
      rebuildSpawnPlan();
      lastBladeBySource.clear();
      lastClockSampleElapsedMs = 0;
      liveBladeAfterimageSegments.length = 0;
      bladeAfterimageGeometryDirty = true;
      syncVisuals();
      playSound( 'gamestart' );
      recordSceneChange( 'startRound', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnStartRound,
      } );

    }

    function endRound( source = 'demo6-clock', { shouldLog = true } = {} ) {

      if ( currentSceneState.roundState === DEMO6_ROUND_STATES.ENDED ) {

        return;

      }

      currentSceneState.elapsedMs = currentSceneState.durationMs;
      markExpiredTargets();
      currentSceneState.roundState = DEMO6_ROUND_STATES.ENDED;
      currentSceneState.combo = 0;
      currentSceneState.lastEvent = 'round-end';
      currentSceneState.lastEventTargetId = null;
      currentSceneState.lastEventAtMs = currentSceneState.elapsedMs;
      recomputeAccuracy();
      syncVisuals();

      if ( shouldLog ) {

        recordSceneChange( 'endRound', source, {
          flushImmediately: getSceneStateLoggingConfig().flushOnEndRound,
        } );

      }

    }

    function resetScene( source = 'demo6-reset' ) {

      if ( ! canAcceptGameplayInput() ) {

        return;

      }

      currentSceneState = normalizeDemo6SceneState( {
        ...parseDemo6Conditions( '', { defaultTaskId: DEMO6_DEFAULT_TASK_ID } ),
        roundSeed: currentSceneState.roundSeed || DEMO6_DEFAULT_SEED,
        roundConfigId: currentSceneState.roundConfigId || DEMO6_DEFAULT_ROUND_CONFIG_ID,
        durationMs: currentSceneState.durationMs,
        lastEvent: 'reset',
      }, currentSceneState );
      rebuildSpawnPlan();
      lastBladeBySource.clear();
      liveBladeAfterimageSegments.length = 0;
      bladeAfterimageGeometryDirty = true;
      syncVisuals();
      recordSceneChange( 'resetScene', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnResetScene,
      } );

    }

    function submitTask( source = 'demo6-submit' ) {

      if ( ! canAcceptGameplayInput() ) {

        return;

      }

      currentSceneState.taskAnswer = currentSceneState.score;
      currentSceneState.taskSubmitted = true;
      currentSceneState.lastEvent = 'task-submit';
      currentSceneState.lastEventTargetId = null;
      currentSceneState.lastEventAtMs = Math.round( currentSceneState.elapsedMs );
      syncVisuals();
      recordSceneChange( 'taskSubmit', source, {
        flushImmediately: getSceneStateLoggingConfig().flushOnTaskSubmit,
      } );

    }

    function advanceRound( deltaSeconds ) {

      if ( currentSceneState.roundState !== DEMO6_ROUND_STATES.RUNNING ) {

        return;

      }

      currentSceneState.elapsedMs = Math.min(
        currentSceneState.durationMs,
        currentSceneState.elapsedMs + deltaSeconds * 1000,
      );
      markExpiredTargets();

      if ( currentSceneState.elapsedMs >= currentSceneState.durationMs ) {

        endRound( 'demo6-clock' );
        return;

      }

      if ( currentSceneState.elapsedMs - lastClockSampleElapsedMs >= getDemo6LoggingTuning().clockSampleIntervalMs ) {

        lastClockSampleElapsedMs = currentSceneState.elapsedMs;
        currentSceneState.lastEvent = 'clock-sample';
        currentSceneState.lastEventTargetId = null;
        currentSceneState.lastEventAtMs = Math.round( currentSceneState.elapsedMs );
        recordSceneChange( 'roundClock', 'demo6-clock', { flushImmediately: false } );

      }

    }

    function createDesktopPanel() {

      const style = demo6VisualConfig.desktopPanel;
      const node = document.createElement( 'section' );
      node.setAttribute( 'style', style.root );
      const title = document.createElement( 'h2' );
      title.textContent = 'Demo 6 Slice Rush';
      title.setAttribute( 'style', style.title );
      const status = document.createElement( 'pre' );
      status.setAttribute( 'style', style.status );
      const controls = document.createElement( 'div' );
      controls.setAttribute( 'style', style.controls );

      [
        [ 'Start', () => startRound( 'desktop-panel-start' ) ],
        [ 'Reset', () => resetScene( 'desktop-panel-reset' ) ],
        [ 'Submit', () => submitTask( 'desktop-panel-submit' ) ],
      ].forEach( ( [ label, handler ] ) => {

        const button = document.createElement( 'button' );
        button.type = 'button';
        button.textContent = label;
        button.setAttribute( 'style', style.button );
        button.addEventListener( 'click', handler );
        controls.appendChild( button );

      } );

      node.append( title, status, controls );
      desktopRefs.status = status;
      context.setDesktopPanelNode?.( node );

    }

    function getSceneStateForStorage() {

      return {
        ...currentSceneState,
        targetOutcomes: currentSceneState.targetOutcomes.map( ( outcome ) => ( { ...outcome } ) ),
      };

    }

    function getAnswerSummary() {

      const state = normalizeDemo6SceneState( getSceneStateForStorage(), currentSceneState );

      return {
        xrDemoId: state.demoId,
        xrTaskId: state.taskId,
        xrGameScore: state.score,
        xrGameCombo: state.combo,
        xrGameComboMax: state.comboMax,
        xrGameHits: state.hits,
        xrGameMisses: state.misses,
        xrGameAccuracy: state.accuracy,
        xrGameBombHits: state.bombHits,
        xrGameRoundSeed: state.roundSeed,
        xrGameRoundState: state.roundState,
        xrGameElapsedMs: Math.round( state.elapsedMs ),
        xrGameLastEvent: state.lastEvent,
      };

    }

    function applySceneEnvironment() {

      context.camera.near = demo6VisualConfig.camera.near;
      context.camera.far = demo6VisualConfig.camera.far;
      context.camera.fov = demo6VisualConfig.camera.fov;
      context.camera.updateProjectionMatrix();
      context.scene.background = new THREE.Color( demo6VisualConfig.environment.backgroundColor );

      if ( demo6VisualConfig.environment.fogEnabled === false ) {

        context.scene.fog = null;

      } else {

        context.scene.fog = new THREE.Fog(
          demo6VisualConfig.environment.fogColor,
          demo6VisualConfig.environment.fogNear,
          demo6VisualConfig.environment.fogFar,
        );

      }

    }

    function restoreSceneEnvironment() {

      context.camera.near = previousCameraSettings.near;
      context.camera.far = previousCameraSettings.far;
      context.camera.fov = previousCameraSettings.fov;
      context.camera.updateProjectionMatrix();
      context.scene.background = previousSceneSettings.background;
      context.scene.fog = previousSceneSettings.fog;

    }

    createPlayArea();

    for ( let index = 0; index < getDemo6RoundConfig( currentSceneState.roundConfigId ).targetCount; index += 1 ) {

      createTargetRecord( index );

    }

    createHud();
    createControls();
    createDesktopSlicePlane();
    createDesktopPanel();
    applySceneEnvironment();
    syncVisuals();

    return {
      activate() {

        context.sceneContentRoot.add( root );
        applySceneEnvironment();
        syncVisuals();

      },
      dispose() {

        disposed = true;
        context.clearDesktopPanel?.();
        disposables.splice( 0 ).reverse().forEach( ( disposable ) => disposable.dispose?.() );
        targetRecords.forEach( ( record ) => disposeObjectTree( record.group, { disposeRoot: true } ) );
        targetRecords.clear();
        root.removeFromParent();
        restoreSceneEnvironment();

      },
      getSceneStateForReplay() {

        return normalizeDemo6SceneState( getSceneStateForStorage(), currentSceneState );

      },
      applySceneStateFromReplay( sceneState ) {

        currentSceneState = normalizeDemo6SceneState( sceneState, currentSceneState );
        rebuildSpawnPlan();
        lastBladeBySource.clear();
        liveBladeAfterimageSegments.length = 0;
        bladeAfterimageGeometryDirty = true;
        syncVisuals();

      },
      update( deltaSeconds = 0, frameContext = {} ) {

        if ( disposed ) {

          return;

        }

        currentPresentationMode = frameContext.presentationMode || context.getPresentationMode?.() || currentPresentationMode;

        if ( frameContext.interactionPolicy?.isAnalysisSession !== true && frameContext.interactionPolicy?.canInteract !== false ) {

          advanceRound( deltaSeconds );
          updateVrBlades();

        }

        syncVisuals();

      },
      getAnswerSummary() {

        return getAnswerSummary();

      },
      onPresentationModeChange( nextMode ) {

        currentPresentationMode = nextMode;
        applySceneEnvironment();
        syncVisuals();

      },
    };

  },
} );
