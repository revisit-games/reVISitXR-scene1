import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import { createSceneUiSurface } from '../scenes/core/sceneUiSurface.js';
import { createTextPlane } from '../scenes/core/textPlane.js';
import { createXYMoveHandle } from '../scenes/core/xyMoveHandle.js';
import {
  DEMO5_COMPARISON_MODES,
  DEMO5_VIEWPOINT_PRESETS,
  normalizeDemo5ControlPanelPosition,
  normalizeDemo5ControlPanelQuaternion,
  normalizeDemo5ComparisonMode,
  normalizeDemo5LandmarkId,
  normalizeDemo5SceneState,
  normalizeDemo5ViewpointPresetId,
  parseDemo5Conditions,
} from './demo5Conditions.js';
import {
  DEMO5_DEFAULT_SELECTED_LANDMARK_ID,
  demo5PeopleModels,
  getDemo5Landmark,
  getDemo5Landmarks,
} from './demo5Data.js';
import { DEMO5_DEFAULT_TASK_ID, getDemo5Task } from './demo5Tasks.js';
import { demo5LoggingConfig } from './demo5LoggingConfig.js';
import { demo5VisualConfig } from './demo5VisualConfig.js';

const HALF_PI = Math.PI * 0.5;
const DEFAULT_QUATERNION = Object.freeze( [ 0, 0, 0, 1 ] );
const WORLD_UP = new THREE.Vector3( 0, 1, 0 );
const tempBox = new THREE.Box3();
const tempSize = new THREE.Vector3();
const tempCenter = new THREE.Vector3();
const tempQuaternion = new THREE.Quaternion();

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

function quaternionFromArray( value, fallback = DEFAULT_QUATERNION ) {

  const source = Array.isArray( value ) && value.length === 4 ? value : fallback;
  return new THREE.Quaternion(
    isFiniteNumber( source[ 0 ] ) ? source[ 0 ] : fallback[ 0 ],
    isFiniteNumber( source[ 1 ] ) ? source[ 1 ] : fallback[ 1 ],
    isFiniteNumber( source[ 2 ] ) ? source[ 2 ] : fallback[ 2 ],
    isFiniteNumber( source[ 3 ] ) ? source[ 3 ] : fallback[ 3 ],
  ).normalize();

}

function jsonStringifyCompact( value ) {

  try {

    return JSON.stringify( value );

  } catch {

    return '{}';

  }

}

function formatHeight( meters ) {

  if ( ! isFiniteNumber( meters ) ) {

    return '--';

  }

  const digits = meters >= 100 ? 0 : 2;
  return `${new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits: digits,
  } ).format( meters )} m`;

}

function formatModeLabel( comparisonMode ) {

  if ( comparisonMode === DEMO5_COMPARISON_MODES.DISTANT_COMPARISON ) {

    return 'Distant';

  }

  if ( comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON ) {

    return 'Miniature';

  }

  return 'Real scale';

}

function formatViewpointLabel( viewpointPresetId ) {

  if ( viewpointPresetId === DEMO5_VIEWPOINT_PRESETS.DISTANT_COMPARISON ) {

    return 'Distant';

  }

  if ( viewpointPresetId === DEMO5_VIEWPOINT_PRESETS.ELEVATED_OVERVIEW ) {

    return 'Overview';

  }

  if ( viewpointPresetId === DEMO5_VIEWPOINT_PRESETS.HIGH_VANTAGE ) {

    return 'High';

  }

  return 'Base';

}

function createStandardMaterial( {
  color = 0xffffff,
  emissive = 0x000000,
  opacity = 1,
  metalness = 0.03,
  roughness = 0.76,
} = {} ) {

  return new THREE.MeshStandardMaterial( {
    color,
    emissive,
    transparent: opacity < 1,
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
    transparent: opacity < 1,
    opacity,
    side,
    depthWrite,
    depthTest,
    toneMapped: false,
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

  if ( ! object ) {

    return {
      disposedGeometries,
      disposedMaterials,
    };

  }

  object.traverse( ( child ) => {

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

  return {
    disposedGeometries,
    disposedMaterials,
  };

}

function disposeChildren( parent ) {

  const disposedGeometries = new Set();
  const disposedMaterials = new Set();

  [ ...parent.children ].forEach( ( child ) => {

    disposeObjectTree( child, {
      disposeRoot: true,
      disposedGeometries,
      disposedMaterials,
    } );

  } );

}

function createTrackedTextPlane( collection, parent, options, position, {
  name = '',
  rotation = null,
  quaternion = null,
  renderOrder = null,
  depthTest = null,
} = {} ) {

  const controller = createTextPlane( options );
  controller.mesh.name = name;
  controller.mesh.position.copy( vector3FromArray( position ) );

  if ( quaternion ) {

    controller.mesh.quaternion.copy( quaternionFromArray( quaternion ) );

  } else if ( rotation ) {

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
    dispose() {

      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();

    },
  } );
  return mesh;

}

function applyObjectRenderingDefaults( object, {
  opacity = 1,
} = {} ) {

  object.traverse( ( child ) => {

    if ( ! child.isMesh ) {

      return;

    }

    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray( child.material ) ? child.material : [ child.material ];
    materials.filter( Boolean ).forEach( ( material ) => {

      if ( isFiniteNumber( opacity ) && opacity < 1 ) {

        material.transparent = true;
        material.opacity = Math.min( material.opacity ?? 1, opacity );

      }

      if ( material.color && child.userData.demo5OriginalColor === undefined ) {

        child.userData.demo5OriginalColor = material.color.getHex();

      }

    } );

  } );

}

function setObjectTintState( object, {
  selected = false,
  hovered = false,
  muted = false,
  accentColor = 0xffffff,
} = {} ) {

  object.traverse( ( child ) => {

    if ( ! child.isMesh ) {

      return;

    }

    const materials = Array.isArray( child.material ) ? child.material : [ child.material ];
    materials.filter( Boolean ).forEach( ( material ) => {

      if ( material.emissive ) {

        material.emissive.setHex( selected ? 0x3a3515 : ( hovered ? 0x242119 : 0x000000 ) );

      }

      if ( material.color && typeof child.userData.demo5OriginalColor === 'number' ) {

        material.color.setHex( selected ? accentColor : child.userData.demo5OriginalColor );

      }

      if ( muted || selected || hovered ) {

        material.transparent = true;
        material.opacity = selected ? 1 : ( hovered ? 0.92 : demo5VisualConfig.landmarks.unselectedOpacity );

      } else if ( material.opacity !== undefined ) {

        material.opacity = demo5VisualConfig.landmarks.modelOpacity;

      }

    } );

  } );

}

function normalizeObjectToHeight( object, targetHeightMeters ) {

  object.updateMatrixWorld( true );
  tempBox.setFromObject( object );
  tempBox.getSize( tempSize );

  const rawHeight = Math.max( tempSize.y, 0.0001 );
  const scale = targetHeightMeters / rawHeight;
  object.scale.multiplyScalar( scale );
  object.updateMatrixWorld( true );
  tempBox.setFromObject( object );
  tempBox.getCenter( tempCenter );
  object.position.x -= tempCenter.x;
  object.position.z -= tempCenter.z;
  object.position.y -= tempBox.min.y;
  object.updateMatrixWorld( true );
  tempBox.setFromObject( object );
  tempBox.getSize( tempSize );

  return {
    height: tempSize.y,
    footprintRadius: Math.max( tempSize.x, tempSize.z ) * 0.5,
    box: tempBox.clone(),
  };

}

function loadWithLoader( loader, url ) {

  return new Promise( ( resolve, reject ) => {

    loader.load( url, resolve, undefined, reject );

  } );

}

async function loadObjectWithFallback( assetUrls, label ) {

  const gltfLoader = new GLTFLoader();
  const objLoader = new OBJLoader();

  try {

    const gltf = await loadWithLoader( gltfLoader, assetUrls.glb );
    return {
      object: gltf.scene,
      format: 'glb',
    };

  } catch ( glbError ) {

    try {

      const object = await loadWithLoader( objLoader, assetUrls.obj );
      return {
        object,
        format: 'obj',
      };

    } catch ( objError ) {

      throw new Error( `Unable to load ${label}: ${glbError?.message || glbError}; ${objError?.message || objError}` );

    }

  }

}

function getLayoutForMode( comparisonMode ) {

  if ( comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON ) {

    return demo5VisualConfig.layout.miniatureComparison;

  }

  if ( comparisonMode === DEMO5_COMPARISON_MODES.DISTANT_COMPARISON ) {

    return demo5VisualConfig.layout.distantComparison;

  }

  return demo5VisualConfig.layout.realScale;

}

function getDisplayHeight( landmark, comparisonMode ) {

  return landmark.heightMeters * getLayoutForMode( comparisonMode ).scale;

}

function getButtonStyle( style, enabled, active = false ) {

  if ( ! enabled ) {

    return style.disabledButton;

  }

  return active ? style.activeButton : style.button;

}

function createLookAtQuaternion( position, target ) {

  const matrix = new THREE.Matrix4().lookAt( position, target, WORLD_UP );
  return tempQuaternion.setFromRotationMatrix( matrix ).clone();

}

export const demo5SceneDefinition = Object.freeze( {
  sceneKey: 'demo5',
  queryValue: '5',
  label: 'Demo 5 Landmark Scale Visceralization',
  supportedImmersiveModes: Object.freeze( {
    ar: false,
    vr: true,
  } ),
  loggingConfig: demo5LoggingConfig,
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

    return normalizeDemo5SceneState( candidateState, fallbackState, { defaultTaskId: DEMO5_DEFAULT_TASK_ID } );

  },
  createScene( context ) {

    const task = getDemo5Task( DEMO5_DEFAULT_TASK_ID );
    const root = new THREE.Group();
    const worldRoot = new THREE.Group();
    const landmarkRoot = new THREE.Group();
    const annotationRoot = new THREE.Group();
    const controlPanelRoot = new THREE.Group();
    const disposables = [];
    const landmarkRecords = new Map();
    const labelRecords = new Map();
    const buttonRecords = new Map();
    const desktopRefs = {};
    const loadedPeopleTemplates = new Map();
    const defaultSceneState = parseDemo5Conditions( window.location.search, { defaultTaskId: DEMO5_DEFAULT_TASK_ID } );
    let currentSceneState = normalizeDemo5SceneState( defaultSceneState, defaultSceneState );
    let disposed = false;
    let currentPresentationMode = context.getPresentationMode?.() || PRESENTATION_MODES.DESKTOP;
    let unsupportedImmersiveMode = null;
    let loadStatus = 'loading';
    let loadError = null;
    let hoveredLandmarkId = null;
    let controlPanelMoveHandle = null;
    let selectedLabelController = null;

    const previousCameraSettings = {
      near: context.camera.near,
      far: context.camera.far,
      fov: context.camera.fov,
    };
    const previousSceneSettings = {
      fog: context.scene.fog,
      background: context.scene.background,
    };

    root.name = 'demo5-landmark-scale-root';
    worldRoot.name = 'demo5-world-root';
    landmarkRoot.name = 'demo5-landmark-root';
    annotationRoot.name = 'demo5-annotation-root';
    controlPanelRoot.name = 'demo5-control-panel-root';
    controlPanelRoot.position.copy( vector3FromArray( currentSceneState.controlPanelPosition, demo5VisualConfig.panel.position ) );
    controlPanelRoot.quaternion.copy( quaternionFromArray( currentSceneState.controlPanelQuaternion ) );
    root.add( worldRoot );
    root.add( controlPanelRoot );
    worldRoot.add( landmarkRoot );
    worldRoot.add( annotationRoot );

    function getSceneStateLoggingConfig() {

      return context.getLoggingConfig?.()?.sceneState || demo5LoggingConfig.sceneState;

    }

    function getDemo5LoggingTuning() {

      return context.getLoggingConfig?.()?.demo5 || demo5LoggingConfig.demo5;

    }

    function getStableSceneLabel( key ) {

      return getDemo5LoggingTuning().stableLabels?.[ key ] || key;

    }

    function recordSceneChange( labelKey, source, { flushImmediately = false } = {} ) {

      return context.recordSceneStateChange?.( {
        source,
        label: getStableSceneLabel( labelKey ),
        flushImmediately,
      } ) === true;

    }

    const ground = createTrackedMesh(
      disposables,
      worldRoot,
      new THREE.PlaneGeometry( 1, 1 ),
      createBasicMaterial( {
        color: demo5VisualConfig.environment.groundColor,
        opacity: demo5VisualConfig.environment.groundOpacity,
      } ),
      {
        name: 'demo5-ground-plane',
        position: [ 0, demo5VisualConfig.environment.groundY, 0 ],
        rotation: [ - HALF_PI, 0, 0 ],
        renderOrder: 0,
      },
    );
    ground.receiveShadow = true;

    if ( demo5VisualConfig.environment.skyDomeEnabled === true ) {

      const skyDome = createTrackedMesh(
        disposables,
        root,
        new THREE.SphereGeometry( demo5VisualConfig.environment.skyDomeRadius, 48, 24 ),
        createBasicMaterial( {
          color: demo5VisualConfig.environment.skyDomeColor,
          opacity: demo5VisualConfig.environment.skyDomeOpacity,
          side: THREE.BackSide,
          depthWrite: false,
          depthTest: false,
        } ),
        {
          name: 'demo5-clear-sky-dome',
          renderOrder: - 100,
        },
      );
      skyDome.frustumCulled = false;

    }

    const ambientLight = new THREE.AmbientLight( 0xfff5df, 0.72 );
    ambientLight.name = 'demo5-ambient-light';
    root.add( ambientLight );
    disposables.push( {
      dispose() {

        ambientLight.removeFromParent();

      },
    } );

    const sunLight = new THREE.DirectionalLight( 0xffffff, 1.35 );
    sunLight.name = 'demo5-low-sun';
    sunLight.position.set( - 140, 340, 220 );
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set( 1024, 1024 );
    root.add( sunLight );
    disposables.push( {
      dispose() {

        sunLight.removeFromParent();

      },
    } );

    function createFallbackLandmarkModel( landmark ) {

      const group = new THREE.Group();
      group.name = `demo5-fallback-${landmark.id}`;
      const radius = Math.max(
        demo5VisualConfig.landmarks.fallbackMinRadius,
        Math.min(
          demo5VisualConfig.landmarks.fallbackMaxRadius,
          landmark.heightMeters * demo5VisualConfig.landmarks.fallbackRadiusFactor,
        ),
      );
      const material = createStandardMaterial( {
        color: landmark.color,
        opacity: 0.86,
        roughness: 0.82,
      } );
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry( radius * 0.42, radius * 0.78, landmark.heightMeters * 0.86, 28 ),
        material,
      );
      shaft.name = `demo5-fallback-${landmark.id}-shaft`;
      shaft.position.y = landmark.heightMeters * 0.43;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      group.add( shaft );

      const cap = new THREE.Mesh(
        new THREE.ConeGeometry( radius * 0.66, landmark.heightMeters * 0.14, 28 ),
        material.clone(),
      );
      cap.name = `demo5-fallback-${landmark.id}-cap`;
      cap.position.y = landmark.heightMeters * 0.93;
      cap.castShadow = true;
      group.add( cap );
      applyObjectRenderingDefaults( group );
      return {
        group,
        footprintRadius: radius,
      };

    }

    function createHumanFallbacks( record ) {

      const group = new THREE.Group();
      group.name = `demo5-human-fallbacks-${record.landmark.id}`;
      const spacing = Math.max( 0.4, demo5VisualConfig.people.spacingMeters );

      [ - spacing * 0.5, spacing * 0.5 ].forEach( ( xOffset, index ) => {

        const person = new THREE.Group();
        person.name = `demo5-human-fallback-${record.landmark.id}-${index}`;
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry( 0.16, 0.19, 1.25, 14 ),
          createStandardMaterial( {
            color: demo5VisualConfig.people.color,
            roughness: 0.68,
          } ),
        );
        body.position.y = 0.625;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry( 0.18, 16, 12 ),
          createStandardMaterial( {
            color: demo5VisualConfig.people.accentColor,
            roughness: 0.62,
          } ),
        );
        head.position.y = 1.44;
        person.add( body, head );
        person.position.x = xOffset;
        group.add( person );

      } );

      applyObjectRenderingDefaults( group );
      return group;

    }

    function rebuildRuler( record ) {

      if ( ! record.rulerGroup ) {

        return;

      }

      disposeChildren( record.rulerGroup );
      const landmark = record.landmark;
      const radius = Math.max( record.footprintRadius + 3, 7 );
      const tickInterval = currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON
        ? demo5VisualConfig.ruler.miniatureTickMeters
        : demo5VisualConfig.ruler.realTickMeters;
      const points = [
        radius, 0, 0,
        radius, landmark.heightMeters, 0,
      ];
      const tickLength = Math.max( 1.5, radius * demo5VisualConfig.ruler.tickLengthFactor );

      for ( let y = tickInterval; y < landmark.heightMeters; y += tickInterval ) {

        points.push(
          radius - tickLength * 0.5, y, 0,
          radius + tickLength * 0.5, y, 0,
        );

      }

      points.push(
        radius - tickLength * 0.72, landmark.heightMeters, 0,
        radius + tickLength * 0.72, landmark.heightMeters, 0,
      );

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( points, 3 ) );
      const material = new THREE.LineBasicMaterial( {
        color: demo5VisualConfig.ruler.color,
        transparent: true,
        opacity: demo5VisualConfig.ruler.opacity,
        toneMapped: false,
      } );
      const line = new THREE.LineSegments( geometry, material );
      line.name = `demo5-ruler-line-${landmark.id}`;
      record.rulerGroup.add( line );

    }

    function updateLandmarkAuxiliaryGeometry( record ) {

      const radius = Math.max( record.footprintRadius + 2, 4 );
      record.hitProxy.position.y = record.landmark.heightMeters * 0.5;
      record.hitProxy.scale.set( radius + 5, record.landmark.heightMeters, radius + 5 );
      record.baseDisc.scale.set( radius, radius, 1 );
      record.selectedRing.scale.setScalar( radius + 2 );
      record.hoverRing.scale.setScalar( radius + 3.5 );
      record.shadow.scale.set( radius * 2.2, radius * 0.9, 1 );
      record.shadow.position.set( radius * 0.32, 0.018, - radius * 0.7 );

      const peopleOffset = Math.max(
        radius + demo5VisualConfig.people.frontClearanceMeters,
        demo5VisualConfig.people.minFrontDistanceMeters,
      );
      record.humanFallbackGroup.position.set( 0, 0, peopleOffset );
      record.humanModelGroup.position.copy( record.humanFallbackGroup.position );
      rebuildRuler( record );

    }

    function createLandmarkRaycastHandlers( record ) {

      return {
        onHoverChange( payload ) {

          hoveredLandmarkId = payload.isHovered
            ? record.landmark.id
            : ( hoveredLandmarkId === record.landmark.id ? null : hoveredLandmarkId );
          syncLandmarkVisuals();

        },
        onSelectStart( payload ) {

          selectLandmark( record.landmark.id, payload.source || `demo5-landmark-${record.landmark.id}` );

        },
      };

    }

    function registerLandmarkRaycastTarget( record, target, kind ) {

      if ( ! target || record.raycastTargets.has( target ) ) {

        return;

      }

      target.userData.demo5LandmarkId = record.landmark.id;
      target.userData.demo5RaycastTargetKind = kind;
      context.registerRaycastTarget?.( target, record.raycastHandlers );
      record.raycastTargets.add( target );

      if ( kind === 'model' ) {

        record.modelRaycastTargets.add( target );

      }

    }

    function unregisterLandmarkRaycastTarget( record, target ) {

      if ( ! target || ! record.raycastTargets.has( target ) ) {

        return;

      }

      context.unregisterRaycastTarget?.( target );
      record.raycastTargets.delete( target );
      record.modelRaycastTargets.delete( target );

      if ( target.userData.demo5LandmarkId === record.landmark.id ) {

        delete target.userData.demo5LandmarkId;
        delete target.userData.demo5RaycastTargetKind;

      }

    }

    function unregisterLandmarkModelRaycastTargets( record ) {

      [ ...record.modelRaycastTargets ].forEach( ( target ) => unregisterLandmarkRaycastTarget( record, target ) );
      record.modelRaycastTargets.clear();

    }

    function unregisterAllLandmarkRaycastTargets( record ) {

      [ ...record.raycastTargets ].forEach( ( target ) => unregisterLandmarkRaycastTarget( record, target ) );
      record.raycastTargets.clear();
      record.modelRaycastTargets.clear();

    }

    function refreshLandmarkModelRaycastTargets( record ) {

      unregisterLandmarkModelRaycastTargets( record );

      if ( ! record.loadedObject ) {

        return;

      }

      record.loadedObject.traverse( ( child ) => {

        if ( child.isMesh ) {

          registerLandmarkRaycastTarget( record, child, 'model' );

        }

      } );

    }

    function createLandmarkRecord( landmark ) {

      const group = new THREE.Group();
      group.name = `demo5-landmark-${landmark.id}`;
      const modelHolder = new THREE.Group();
      modelHolder.name = `demo5-model-holder-${landmark.id}`;
      group.add( modelHolder );

      const fallback = createFallbackLandmarkModel( landmark );
      modelHolder.add( fallback.group );

      const hitProxy = new THREE.Mesh(
        new THREE.CylinderGeometry( 1, 1, 1, 32, 1, false ),
        createBasicMaterial( {
          color: 0xffffff,
          opacity: 0,
          depthWrite: false,
        } ),
      );
      hitProxy.name = `demo5-hit-proxy-${landmark.id}`;
      hitProxy.position.y = landmark.heightMeters * 0.5;
      hitProxy.scale.set( fallback.footprintRadius + 6, landmark.heightMeters, fallback.footprintRadius + 6 );
      group.add( hitProxy );

      const baseDisc = new THREE.Mesh(
        new THREE.CircleGeometry( 1, 48 ),
        createBasicMaterial( {
          color: demo5VisualConfig.landmarks.baseDiscColor,
          opacity: demo5VisualConfig.landmarks.baseDiscOpacity,
        } ),
      );
      baseDisc.name = `demo5-base-disc-${landmark.id}`;
      baseDisc.rotation.x = - HALF_PI;
      baseDisc.position.y = 0.015;
      group.add( baseDisc );

      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry( 1, 56 ),
        createBasicMaterial( {
          color: demo5VisualConfig.landmarks.shadowColor,
          opacity: demo5VisualConfig.landmarks.shadowOpacity,
          depthWrite: false,
        } ),
      );
      shadow.name = `demo5-shadow-cue-${landmark.id}`;
      shadow.rotation.x = - HALF_PI;
      shadow.rotation.z = THREE.MathUtils.degToRad( - 16 );
      shadow.position.set( 3, 0.018, - 7 );
      group.add( shadow );

      const selectedRing = new THREE.Mesh(
        new THREE.TorusGeometry( 1, 0.045, 10, 72 ),
        createBasicMaterial( {
          color: demo5VisualConfig.landmarks.selectedRingColor,
          opacity: demo5VisualConfig.landmarks.selectedRingOpacity,
        } ),
      );
      selectedRing.name = `demo5-selected-ring-${landmark.id}`;
      selectedRing.rotation.x = HALF_PI;
      selectedRing.position.y = 0.08;
      group.add( selectedRing );

      const hoverRing = new THREE.Mesh(
        new THREE.TorusGeometry( 1, 0.035, 8, 72 ),
        createBasicMaterial( {
          color: demo5VisualConfig.landmarks.hoverRingColor,
          opacity: demo5VisualConfig.landmarks.hoverRingOpacity,
        } ),
      );
      hoverRing.name = `demo5-hover-ring-${landmark.id}`;
      hoverRing.rotation.x = HALF_PI;
      hoverRing.position.y = 0.13;
      group.add( hoverRing );

      const record = {
        landmark,
        group,
        modelHolder,
        hitProxy,
        baseDisc,
        shadow,
        selectedRing,
        hoverRing,
        humanFallbackGroup: null,
        humanModelGroup: new THREE.Group(),
        loadedObject: null,
        assetFormat: 'fallback',
        loadStatus: 'fallback',
        loadError: null,
        footprintRadius: fallback.footprintRadius,
        rulerGroup: new THREE.Group(),
        raycastHandlers: null,
        raycastTargets: new Set(),
        modelRaycastTargets: new Set(),
      };
      record.raycastHandlers = createLandmarkRaycastHandlers( record );
      record.humanFallbackGroup = createHumanFallbacks( record );
      record.humanModelGroup.name = `demo5-human-models-${landmark.id}`;
      record.rulerGroup.name = `demo5-ruler-${landmark.id}`;
      group.add( record.humanFallbackGroup, record.humanModelGroup, record.rulerGroup );
      landmarkRoot.add( group );
      registerLandmarkRaycastTarget( record, hitProxy, 'proxy' );

      landmarkRecords.set( landmark.id, record );
      updateLandmarkAuxiliaryGeometry( record );
      disposables.push( {
        dispose() {

          unregisterAllLandmarkRaycastTargets( record );
          group.removeFromParent();
          disposeObjectTree( group );

        },
      } );

      return record;

    }

    function createAnnotationRecords() {

      getDemo5Landmarks().forEach( ( landmark ) => {

        const baseLabel = createTrackedTextPlane(
          disposables,
          annotationRoot,
          {
            ...demo5VisualConfig.text.baseLabel,
            text: landmark.label,
          },
          [ 0, 0, 0 ],
          { name: `demo5-base-label-${landmark.id}`, renderOrder: 24, depthTest: false },
        );
        const heightLabel = createTrackedTextPlane(
          disposables,
          annotationRoot,
          {
            ...demo5VisualConfig.text.heightLabel,
            text: formatHeight( landmark.heightMeters ),
          },
          [ 0, 0, 0 ],
          { name: `demo5-height-label-${landmark.id}`, renderOrder: 25, depthTest: false },
        );
        labelRecords.set( landmark.id, {
          baseLabel,
          heightLabel,
        } );

      } );

      selectedLabelController = createTrackedTextPlane(
        disposables,
        root,
        {
          ...demo5VisualConfig.text.selectedLabel,
          text: '',
        },
        [ 0, 1.4, - 1.75 ],
        { name: 'demo5-selected-near-user-label', renderOrder: 42, depthTest: false },
      );
      selectedLabelController.mesh.visible = false;

    }

    function getLandmarkDisplayPosition( landmarkId ) {

      const layout = getLayoutForMode( currentSceneState.comparisonMode );
      return vector3FromArray( layout.positions[ landmarkId ], [ 0, 0, 0 ] );

    }

    function getLandmarkDisplayFootprintRadius( landmarkId ) {

      const layout = getLayoutForMode( currentSceneState.comparisonMode );
      const record = landmarkRecords.get( landmarkId );
      return Math.max( record?.footprintRadius || 0, 0 ) * layout.scale;

    }

    function getCurrentLayoutBounds() {

      const layout = getLayoutForMode( currentSceneState.comparisonMode );
      let minX = Infinity;
      let maxX = - Infinity;
      let minZ = Infinity;
      let maxZ = - Infinity;
      let maxY = 0;

      getDemo5Landmarks().forEach( ( landmark ) => {

        const position = vector3FromArray( layout.positions[ landmark.id ], [ 0, 0, 0 ] );
        const record = landmarkRecords.get( landmark.id );
        const radius = Math.max( record?.footprintRadius || 0, 0 ) * layout.scale;
        const displayHeight = landmark.heightMeters * layout.scale;
        minX = Math.min( minX, position.x - radius );
        maxX = Math.max( maxX, position.x + radius );
        minZ = Math.min( minZ, position.z - radius );
        maxZ = Math.max( maxZ, position.z + radius );
        maxY = Math.max( maxY, displayHeight );

      } );

      if ( ! Number.isFinite( minX ) || ! Number.isFinite( maxX ) || ! Number.isFinite( minZ ) || ! Number.isFinite( maxZ ) ) {

        return {
          center: new THREE.Vector3(),
          width: 0,
          depth: 0,
          height: 0,
        };

      }

      return {
        center: new THREE.Vector3(
          ( minX + maxX ) * 0.5,
          0,
          ( minZ + maxZ ) * 0.5,
        ),
        width: maxX - minX,
        depth: maxZ - minZ,
        height: maxY,
      };

    }

    function getCurrentLayoutCenter() {

      return getCurrentLayoutBounds().center;

    }

    function getBaseViewDistance( landmarkId ) {

      const config = demo5VisualConfig.viewpoints.vr.base_near_selected;
      const radius = getLandmarkDisplayFootprintRadius( landmarkId );

      if ( currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON ) {

        return Math.max(
          config.miniatureMinDistanceMeters,
          radius + config.miniatureClearanceMeters,
        );

      }

      return Math.max(
        config.minDistanceMeters,
        radius + config.clearanceMeters,
      );

    }

    function getDefaultViewpointForComparisonMode( comparisonMode ) {

      if ( comparisonMode === DEMO5_COMPARISON_MODES.REAL_SCALE ) {

        return DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED;

      }

      return DEMO5_VIEWPOINT_PRESETS.DISTANT_COMPARISON;

    }

    function resolveVRViewPlacement( vrConfig, isMiniature, layoutBounds ) {

      if ( isMiniature ) {

        return {
          distance: vrConfig.miniatureDistanceMeters,
          height: vrConfig.miniatureHeightMeters,
        };

      }

      const widthDistance = Math.max( 0, layoutBounds.width ) * ( vrConfig.realDistanceWidthFactor || 0 );
      const heightDistance = Math.max( 0, layoutBounds.height ) * ( vrConfig.realDistanceHeightFactor || 0 );
      const unclampedDistance = Math.max(
        vrConfig.realMinDistanceMeters || 0,
        widthDistance,
        heightDistance,
      );
      const maxDistance = Number.isFinite( vrConfig.realMaxDistanceMeters )
        ? vrConfig.realMaxDistanceMeters
        : unclampedDistance;
      const unclampedHeight = Math.max(
        vrConfig.realMinHeightMeters || 0,
        Math.max( 0, layoutBounds.height ) * ( vrConfig.realHeightFactor || 0 ),
      );
      const maxHeight = Number.isFinite( vrConfig.realMaxHeightMeters )
        ? vrConfig.realMaxHeightMeters
        : unclampedHeight;

      return {
        distance: THREE.MathUtils.clamp( unclampedDistance, 0, maxDistance ),
        height: THREE.MathUtils.clamp( unclampedHeight, 0, maxHeight ),
      };

    }

    function syncControlPanelTransformFromState() {

      if ( controlPanelMoveHandle?.isDragging?.() || controlPanelMoveHandle?.isRotating?.() ) {

        return;

      }

      const panelPosition = normalizeDemo5ControlPanelPosition(
        currentSceneState.controlPanelPosition,
        demo5VisualConfig.panel.position,
      );
      const panelQuaternion = normalizeDemo5ControlPanelQuaternion( currentSceneState.controlPanelQuaternion );
      controlPanelRoot.position.copy( vector3FromArray( panelPosition, demo5VisualConfig.panel.position ) );
      controlPanelRoot.quaternion.copy( quaternionFromArray( panelQuaternion ) );
      controlPanelMoveHandle?.syncFromTarget?.();

    }

    function commitControlPanelTransform( source, { shouldLog = true } = {} ) {

      currentSceneState.controlPanelPosition = normalizeDemo5ControlPanelPosition(
        controlPanelRoot.position.toArray(),
        demo5VisualConfig.panel.position,
      );
      currentSceneState.controlPanelQuaternion = normalizeDemo5ControlPanelQuaternion(
        controlPanelRoot.quaternion.toArray(),
      );

      if ( shouldLog ) {

        recordSceneChange( 'controlPanelTransform', source || 'demo5-control-panel-transform', {
          flushImmediately: getSceneStateLoggingConfig().flushOnControlPanelTransformEnd === true,
        } );

      }

    }

    function getSelectedLandmark() {

      return getDemo5Landmark( currentSceneState.selectedLandmarkId )
        || getDemo5Landmark( DEMO5_DEFAULT_SELECTED_LANDMARK_ID );

    }

    function rebuildAllRulers() {

      landmarkRecords.forEach( ( record ) => rebuildRuler( record ) );

    }

    function syncLayout() {

      const layout = getLayoutForMode( currentSceneState.comparisonMode );
      ground.scale.set( layout.groundWidth, layout.groundDepth, 1 );
      getDemo5Landmarks().forEach( ( landmark ) => {

        const record = landmarkRecords.get( landmark.id );

        if ( ! record ) {

          return;

        }

        record.group.position.copy( vector3FromArray( layout.positions[ landmark.id ], [ 0, 0, 0 ] ) );
        record.group.scale.setScalar( layout.scale );

      } );

      rebuildAllRulers();

    }

    function syncLandmarkVisuals() {

      const layoutScale = getLayoutForMode( currentSceneState.comparisonMode ).scale;
      const isMiniature = currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON;

      landmarkRecords.forEach( ( record, landmarkId ) => {

        const selected = currentSceneState.selectedLandmarkId === landmarkId;
        const hovered = hoveredLandmarkId === landmarkId;
        const selectedRingRadius = Math.max(
          record.footprintRadius + 2,
          isMiniature ? 0.14 / layoutScale : 0,
        );
        const hoverRingRadius = Math.max(
          record.footprintRadius + 3.5,
          isMiniature ? 0.18 / layoutScale : 0,
        );
        record.selectedRing.scale.setScalar( selectedRingRadius );
        record.hoverRing.scale.setScalar( hoverRingRadius );
        record.selectedRing.visible = selected;
        record.hoverRing.visible = hovered && ! selected;
        record.shadow.visible = currentSceneState.shadowCueVisible;
        record.rulerGroup.visible = currentSceneState.rulerCueVisible;
        record.humanFallbackGroup.visible = currentSceneState.humanReferenceVisible && record.humanModelGroup.children.length === 0;
        record.humanModelGroup.visible = currentSceneState.humanReferenceVisible && record.humanModelGroup.children.length > 0;
        setObjectTintState( record.modelHolder, {
          selected,
          hovered,
          muted: ! selected && currentSceneState.selectedLandmarkId !== null,
          accentColor: record.landmark.color,
        } );

      } );

    }

    function syncAnnotationLabels() {

      const miniature = currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON;
      const labelConfig = demo5VisualConfig.labels;
      const labelLift = miniature ? labelConfig.miniatureHeightLiftMeters : labelConfig.realHeightLiftMeters;
      const baseLabelHeight = miniature ? labelConfig.miniatureBaseLiftMeters : labelConfig.realBaseLiftMeters;
      const baseLabelForward = miniature ? labelConfig.miniatureBaseForwardMeters : labelConfig.realBaseForwardMeters;
      const baseModeScale = miniature
        ? labelConfig.miniatureScale
        : (
          currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.DISTANT_COMPARISON
            ? labelConfig.distantScale
            : labelConfig.realScale
        );

      getDemo5Landmarks().forEach( ( landmark ) => {

        const labels = labelRecords.get( landmark.id );

        if ( ! labels ) {

          return;

        }

        const position = getLandmarkDisplayPosition( landmark.id );
        const displayHeight = getDisplayHeight( landmark, currentSceneState.comparisonMode );
        const selected = landmark.id === currentSceneState.selectedLandmarkId;
        const hideSelectedLocalLabel = selected && ! miniature;
        labels.baseLabel.mesh.visible = currentSceneState.annotationsVisible && ! hideSelectedLocalLabel;
        labels.heightLabel.mesh.visible = currentSceneState.annotationsVisible && currentSceneState.quantLabelsVisible;
        labels.baseLabel.mesh.position.set(
          position.x,
          baseLabelHeight,
          position.z + baseLabelForward,
        );
        labels.heightLabel.mesh.position.set(
          position.x,
          displayHeight + labelLift,
          position.z,
        );
        labels.baseLabel.mesh.material.opacity = selected ? 1 : 0.82;
        labels.heightLabel.mesh.material.opacity = selected ? 1 : 0.88;
        labels.baseLabel.setText( landmark.label );
        labels.heightLabel.setText( `${formatHeight( landmark.heightMeters )}\n${miniature ? 'miniature scale' : 'real height'}` );
        labels.baseLabel.mesh.scale.multiplyScalar( baseModeScale * ( selected ? labelConfig.selectedBaseScale : 1 ) );
        labels.heightLabel.mesh.scale.multiplyScalar( baseModeScale * ( selected ? labelConfig.selectedHeightScale : 1 ) );

      } );

    }

    function syncSelectedLandmarkLabel() {

      if ( ! selectedLabelController ) {

        return;

      }

      const selectedLandmark = getSelectedLandmark();

      if ( ! selectedLandmark ) {

        selectedLabelController.mesh.visible = false;
        return;

      }

      const labelConfig = demo5VisualConfig.labels;
      const selectedPosition = getLandmarkDisplayPosition( selectedLandmark.id );
      const displayHeight = getDisplayHeight( selectedLandmark, currentSceneState.comparisonMode );
      const selectedWorld = selectedPosition.clone();
      selectedWorld.y = Math.min( Math.max( displayHeight * 0.04, 1.4 ), 4.2 );
      worldRoot.updateMatrixWorld( true );
      worldRoot.localToWorld( selectedWorld );

      const cameraWorld = new THREE.Vector3();
      context.camera.updateMatrixWorld( true );
      context.camera.getWorldPosition( cameraWorld );

      const forward = selectedWorld.clone().sub( cameraWorld );
      forward.y = 0;

      if ( forward.lengthSq() < 0.0001 ) {

        context.camera.getWorldDirection( forward );
        forward.y = 0;

      }

      if ( forward.lengthSq() < 0.0001 ) {

        forward.set( 0, 0, - 1 );

      }

      forward.normalize();
      const right = new THREE.Vector3().crossVectors( forward, WORLD_UP ).normalize();
      const labelWorld = cameraWorld.clone()
        .addScaledVector( forward, labelConfig.selectedNearDistanceMeters )
        .addScaledVector( right, labelConfig.selectedNearLateralOffsetMeters );
      labelWorld.y = Math.max(
        labelConfig.selectedNearMinY,
        cameraWorld.y + labelConfig.selectedNearEyeOffsetMeters,
      );

      root.updateMatrixWorld( true );
      root.worldToLocal( labelWorld );
      selectedLabelController.mesh.position.copy( labelWorld );

      if ( selectedLabelController.mesh.userData.textContent !== selectedLandmark.label ) {

        selectedLabelController.setText( selectedLandmark.label );

      }

      selectedLabelController.mesh.visible = true;
      selectedLabelController.mesh.material.opacity = 1;

    }

    function syncWorldRootForVR() {

      worldRoot.position.set( 0, 0, 0 );
      worldRoot.quaternion.identity();
      const isMiniature = currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON;
      const vrConfig = demo5VisualConfig.viewpoints.vr[ currentSceneState.viewpointPresetId ];

      if ( currentSceneState.viewpointPresetId === DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED ) {

        const selectedPosition = getLandmarkDisplayPosition( currentSceneState.selectedLandmarkId );
        const distance = getBaseViewDistance( currentSceneState.selectedLandmarkId );
        worldRoot.position.set(
          ( vrConfig.targetX || 0 ) - selectedPosition.x,
          0,
          - distance - selectedPosition.z,
        );
        return;

      }

      const layoutBounds = getCurrentLayoutBounds();
      const layoutCenter = layoutBounds.center;
      const { distance, height } = resolveVRViewPlacement( vrConfig, isMiniature, layoutBounds );
      worldRoot.position.set(
        - layoutCenter.x,
        - height,
        - distance - layoutCenter.z,
      );

    }

    function syncCameraForDesktop() {

      worldRoot.position.set( 0, 0, 0 );
      worldRoot.quaternion.identity();
      const selectedLandmark = getSelectedLandmark();
      const selectedPosition = getLandmarkDisplayPosition( selectedLandmark.id );
      const isMiniature = currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON;
      let cameraPosition = null;
      let target = null;

      if ( currentSceneState.viewpointPresetId === DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED ) {

        const preset = demo5VisualConfig.viewpoints.desktop.base_near_selected;
        const displayHeight = getDisplayHeight( selectedLandmark, currentSceneState.comparisonMode );

        if ( isMiniature ) {

          cameraPosition = selectedPosition.clone().add( new THREE.Vector3( 0, 0.88, 1.9 ) );
          target = selectedPosition.clone().add( new THREE.Vector3( 0, Math.max( 0.45, displayHeight * 0.52 ), 0 ) );

        } else {

          const selectedOffset = vector3FromArray( preset.selectedOffset );
          selectedOffset.z = Math.max( selectedOffset.z, getBaseViewDistance( selectedLandmark.id ) );
          cameraPosition = selectedPosition.clone().add( selectedOffset );
          target = selectedPosition.clone().add( new THREE.Vector3(
            0,
            THREE.MathUtils.clamp(
              selectedLandmark.heightMeters * preset.selectedTargetHeightRatio,
              preset.selectedTargetMinY,
              preset.selectedTargetMaxY,
            ),
            0,
          ) );

        }

      } else {

        const preset = demo5VisualConfig.viewpoints.desktop[ currentSceneState.viewpointPresetId ];
        cameraPosition = vector3FromArray( isMiniature ? preset.miniaturePosition : preset.realPosition );
        target = vector3FromArray( isMiniature ? preset.miniatureTarget : preset.realTarget );

      }

      context.camera.position.copy( cameraPosition );
      context.camera.quaternion.copy( createLookAtQuaternion( cameraPosition, target ) );
      context.camera.updateMatrixWorld( true );

    }

    function syncViewpoint() {

      if ( currentPresentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

        syncWorldRootForVR();
        return;

      }

      syncCameraForDesktop();

    }

    function orientBillboards() {

      const cameraWorld = new THREE.Vector3();
      context.camera.updateMatrixWorld( true );
      context.camera.getWorldPosition( cameraWorld );

      labelRecords.forEach( ( labels ) => {

        labels.baseLabel.mesh.lookAt( cameraWorld );
        labels.heightLabel.mesh.lookAt( cameraWorld );

      } );

      if ( selectedLabelController?.mesh.visible ) {

        selectedLabelController.mesh.lookAt( cameraWorld );

      }

    }

    function syncStatusText() {

      const selected = getSelectedLandmark();
      const modeLabel = formatModeLabel( currentSceneState.comparisonMode );
      const viewLabel = formatViewpointLabel( currentSceneState.viewpointPresetId );
      const submittedLabel = currentSceneState.taskSubmitted
        ? `Submitted: ${getDemo5Landmark( currentSceneState.taskAnswer )?.label || currentSceneState.taskAnswer}`
        : 'Not submitted';

      if ( desktopRefs.status ) {

        desktopRefs.status.textContent = [
          `${modeLabel} | ${viewLabel} viewpoint`,
          `Selected: ${selected?.label || 'None'} (${formatHeight( selected?.heightMeters )})`,
          submittedLabel,
        ].join( '\n' );

      }

      if ( desktopRefs.detail ) {

        desktopRefs.detail.textContent = selected
          ? `${selected.label}: ${formatHeight( selected.heightMeters )}. Source: ${selected.sourceLabel}.\n${currentSceneState.comparisonMode === DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON ? 'Miniature mode preserves height ratios in a table-scale model.' : 'Real-scale modes preserve meter-to-world-unit height.'}`
          : 'Select a landmark to inspect its scale.';

      }

      const statusText = buttonRecords.get( 'status' );

      if ( statusText?.textController ) {

        statusText.textController.setText( [
          `${modeLabel} | ${viewLabel}`,
          selected ? `${selected.label}: ${formatHeight( selected.heightMeters )}` : 'No selection',
          currentSceneState.taskSubmitted ? 'Answer submitted' : task.prompt,
        ].join( '\n' ) );

      }

    }

    function syncButtons() {

      buttonRecords.forEach( ( record ) => {

        if ( record.kind === 'status' ) {

          return;

        }

        const active = (
          record.landmarkId === currentSceneState.selectedLandmarkId ||
          record.comparisonMode === currentSceneState.comparisonMode ||
          record.viewpointPresetId === currentSceneState.viewpointPresetId ||
          ( record.toggleKey && currentSceneState[ record.toggleKey ] === true ) ||
          ( record.key === 'submit' && currentSceneState.taskSubmitted )
        );
        const hovered = record.hoverSources.size > 0;
        record.mesh.material.color.setHex(
          active
            ? demo5VisualConfig.panel.buttonActiveColor
            : ( hovered ? demo5VisualConfig.panel.buttonHoverColor : demo5VisualConfig.panel.buttonColor ),
        );
        record.textController?.setText( record.getLabel?.( active ) || record.label );

      } );

      const style = demo5VisualConfig.desktopPanel;
      desktopRefs.landmarkButtons?.forEach( ( button, landmarkId ) => {

        button.setAttribute( 'style', getButtonStyle( style, true, landmarkId === currentSceneState.selectedLandmarkId ) );

      } );
      desktopRefs.modeButtons?.forEach( ( button, mode ) => {

        button.setAttribute( 'style', getButtonStyle( style, true, mode === currentSceneState.comparisonMode ) );

      } );
      desktopRefs.viewButtons?.forEach( ( button, viewpointId ) => {

        button.setAttribute( 'style', getButtonStyle( style, true, viewpointId === currentSceneState.viewpointPresetId ) );

      } );
      desktopRefs.toggleButtons?.forEach( ( button, toggleKey ) => {

        button.setAttribute( 'style', getButtonStyle( style, true, currentSceneState[ toggleKey ] === true ) );

      } );

      if ( desktopRefs.submitButton ) {

        desktopRefs.submitButton.textContent = currentSceneState.taskSubmitted ? 'Submitted' : 'Submit selected';
        desktopRefs.submitButton.setAttribute( 'style', getButtonStyle( style, true, currentSceneState.taskSubmitted ) );

      }

    }

    function syncVisuals() {

      currentSceneState = normalizeDemo5SceneState( currentSceneState, currentSceneState );
      syncLayout();
      syncLandmarkVisuals();
      syncAnnotationLabels();
      syncViewpoint();
      syncSelectedLandmarkLabel();
      syncControlPanelTransformFromState();
      syncStatusText();
      syncButtons();
      orientBillboards();

    }

    function selectLandmark( landmarkId, source, { shouldLog = true } = {} ) {

      const nextLandmarkId = normalizeDemo5LandmarkId( landmarkId, currentSceneState.selectedLandmarkId );

      if ( nextLandmarkId === currentSceneState.selectedLandmarkId ) {

        return;

      }

      currentSceneState.selectedLandmarkId = nextLandmarkId;
      currentSceneState.taskAnswer = null;
      currentSceneState.taskSubmitted = false;
      syncVisuals();

      if ( shouldLog ) {

        recordSceneChange( 'landmarkSelection', source || 'demo5-landmark-selection', {
          flushImmediately: getSceneStateLoggingConfig().flushOnLandmarkSelectionChange === true,
        } );

      }

    }

    function setComparisonMode( comparisonMode, source, { shouldLog = true } = {} ) {

      const nextMode = normalizeDemo5ComparisonMode( comparisonMode, currentSceneState.comparisonMode );
      const nextViewpointId = getDefaultViewpointForComparisonMode( nextMode );

      if (
        nextMode === currentSceneState.comparisonMode &&
        nextViewpointId === currentSceneState.viewpointPresetId
      ) {

        return;

      }

      currentSceneState.comparisonMode = nextMode;
      currentSceneState.viewpointPresetId = nextViewpointId;
      syncVisuals();

      if ( shouldLog ) {

        recordSceneChange( 'comparisonMode', source || 'demo5-comparison-mode', {
          flushImmediately: getSceneStateLoggingConfig().flushOnComparisonModeSwitch === true,
        } );

      }

    }

    function setViewpointPreset( viewpointPresetId, source, { shouldLog = true } = {} ) {

      const nextViewpointId = normalizeDemo5ViewpointPresetId( viewpointPresetId, currentSceneState.viewpointPresetId );

      if ( nextViewpointId === currentSceneState.viewpointPresetId ) {

        return;

      }

      currentSceneState.viewpointPresetId = nextViewpointId;
      syncVisuals();

      if ( shouldLog ) {

        recordSceneChange( 'viewpointPreset', source || 'demo5-viewpoint-preset', {
          flushImmediately: getSceneStateLoggingConfig().flushOnViewpointPresetSwitch === true,
        } );

      }

    }

    function toggleBooleanState( key, labelKey, source, flushKey ) {

      currentSceneState[ key ] = ! currentSceneState[ key ];
      syncVisuals();
      recordSceneChange( labelKey, source || `demo5-${key}`, {
        flushImmediately: getSceneStateLoggingConfig()[ flushKey ] === true,
      } );

    }

    function resetScene( source, { shouldLog = true } = {} ) {

      currentSceneState = normalizeDemo5SceneState( parseDemo5Conditions( '', { defaultTaskId: DEMO5_DEFAULT_TASK_ID } ), defaultSceneState );
      hoveredLandmarkId = null;
      syncVisuals();

      if ( shouldLog ) {

        recordSceneChange( 'resetScene', source || 'demo5-reset-scene', {
          flushImmediately: getSceneStateLoggingConfig().flushOnResetScene === true,
        } );

      }

    }

    function submitTask( source, { shouldLog = true } = {} ) {

      currentSceneState.taskAnswer = normalizeDemo5LandmarkId(
        currentSceneState.selectedLandmarkId,
        DEMO5_DEFAULT_SELECTED_LANDMARK_ID,
      );
      currentSceneState.taskSubmitted = true;
      syncVisuals();

      if ( shouldLog ) {

        recordSceneChange( 'taskSubmit', source || 'demo5-task-submit', {
          flushImmediately: getSceneStateLoggingConfig().flushOnTaskSubmit === true,
        } );

      }

    }

    function createPanelFrame() {

      const panel = demo5VisualConfig.panel;
      createTrackedMesh(
        disposables,
        controlPanelRoot,
        new THREE.PlaneGeometry( panel.width, panel.height ),
        createBasicMaterial( {
          color: panel.backgroundColor,
          opacity: panel.backgroundOpacity,
        } ),
        {
          name: 'demo5-panel-background',
          position: [ 0, 0, 0 ],
          renderOrder: 30,
        },
      );
      createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo5VisualConfig.text.panelTitle,
          text: 'Control Panel',
        },
        [ 0, panel.rowY.title, 0.025 ],
        { name: 'demo5-panel-title', renderOrder: 34, depthTest: false },
      );
      const statusText = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo5VisualConfig.text.status,
          text: 'Loading landmark models...',
        },
        [ - 0.34, panel.rowY.status, 0.025 ],
        { name: 'demo5-panel-status', renderOrder: 34, depthTest: false },
      );
      buttonRecords.set( 'status', {
        kind: 'status',
        textController: statusText,
      } );

    }

    function createPanelButton( {
      key,
      label,
      position,
      width = demo5VisualConfig.panel.buttonWidth,
      height = demo5VisualConfig.panel.buttonHeight,
      onPress,
      getLabel = null,
      landmarkId = null,
      comparisonMode = null,
      viewpointPresetId = null,
      toggleKey = null,
    } ) {

      const panel = demo5VisualConfig.panel;
      const mesh = createTrackedMesh(
        disposables,
        controlPanelRoot,
        new THREE.PlaneGeometry( width, height ),
        createBasicMaterial( {
          color: panel.buttonColor,
          opacity: 0.98,
        } ),
        {
          name: `demo5-button-${key}`,
          position: [ position[ 0 ], position[ 1 ], 0.018 ],
          renderOrder: 33,
        },
      );
      const textController = createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo5VisualConfig.text.panelButton,
          text: label,
        },
        [ position[ 0 ], position[ 1 ], 0.038 ],
        { name: `demo5-button-${key}-label`, renderOrder: 35, depthTest: false },
      );
      const record = {
        key,
        label,
        mesh,
        textController,
        hoverSources: new Set(),
        getLabel,
        landmarkId,
        comparisonMode,
        viewpointPresetId,
        toggleKey,
      };
      buttonRecords.set( key, record );
      disposables.push( createSceneUiSurface( context, {
        parent: controlPanelRoot,
        width,
        height,
        name: `demo5-button-${key}-surface`,
        position: [ position[ 0 ], position[ 1 ], 0.055 ],
        handlers: {
          onHoverChange( payload ) {

            if ( payload.isHovered ) {

              record.hoverSources.add( payload.source );

            } else {

              record.hoverSources.delete( payload.source );

            }

            syncButtons();

          },
          onSelectStart( payload ) {

            if ( context.getInteractionPolicy?.()?.canInteract === false ) {

              return;

            }

            onPress?.( payload.source || `demo5-button-${key}` );

          },
        },
      } ) );

    }

    function buildInScenePanel() {

      createPanelFrame();
      const panel = demo5VisualConfig.panel;
      const landmarkColumns = [ - 0.64, 0.64 ];
      const landmarkRows = [ panel.rowY.landmarksTop, panel.rowY.landmarksBottom ];
      const columns4 = [ - 0.9, - 0.3, 0.3, 0.9 ];
      const columns3 = [ - 0.62, 0, 0.62 ];

      getDemo5Landmarks().forEach( ( landmark, index ) => {

        createPanelButton( {
          key: `landmark-${landmark.id}`,
          label: landmark.label,
          width: 1.18,
          position: [ landmarkColumns[ index % 2 ], landmarkRows[ Math.floor( index / 2 ) ] ],
          onPress: ( source ) => selectLandmark( landmark.id, source ),
          landmarkId: landmark.id,
        } );

      } );

      [
        [ DEMO5_COMPARISON_MODES.REAL_SCALE, 'Real' ],
        [ DEMO5_COMPARISON_MODES.DISTANT_COMPARISON, 'Distant' ],
        [ DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON, 'Mini' ],
      ].forEach( ( [ mode, label ], index ) => {

        createPanelButton( {
          key: `mode-${mode}`,
          label,
          position: [ columns3[ index ], panel.rowY.modes ],
          onPress: ( source ) => setComparisonMode( mode, source ),
          comparisonMode: mode,
        } );

      } );

      [
        [ DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED, 'Base' ],
        [ DEMO5_VIEWPOINT_PRESETS.DISTANT_COMPARISON, 'Far' ],
        [ DEMO5_VIEWPOINT_PRESETS.ELEVATED_OVERVIEW, 'Overview' ],
        [ DEMO5_VIEWPOINT_PRESETS.HIGH_VANTAGE, 'High' ],
      ].forEach( ( [ viewpointId, label ], index ) => {

        createPanelButton( {
          key: `view-${viewpointId}`,
          label,
          position: [ columns4[ index ], panel.rowY.views ],
          onPress: ( source ) => setViewpointPreset( viewpointId, source ),
          viewpointPresetId: viewpointId,
        } );

      } );

      [
        [ 'humanReferenceVisible', 'People', 'humanReference', 'flushOnHumanReferenceToggle' ],
        [ 'shadowCueVisible', 'Shadow', 'shadowCue', 'flushOnShadowCueToggle' ],
        [ 'rulerCueVisible', 'Ruler', 'rulerCue', 'flushOnRulerCueToggle' ],
        [ 'quantLabelsVisible', 'Meters', 'quantLabels', 'flushOnQuantLabelsToggle' ],
      ].forEach( ( [ key, label, labelKey, flushKey ], index ) => {

        createPanelButton( {
          key: `toggle-${key}`,
          label,
          width: 0.68,
          position: [ columns4[ index ], panel.rowY.cues ],
          onPress: ( source ) => toggleBooleanState( key, labelKey, source, flushKey ),
          toggleKey: key,
          getLabel: ( active ) => `${label} ${active ? 'On' : 'Off'}`,
        } );

      } );

      createPanelButton( {
        key: 'reset',
        label: 'Reset',
        width: 0.72,
        position: [ - 0.42, panel.rowY.actions ],
        onPress: ( source ) => resetScene( source ),
      } );
      createPanelButton( {
        key: 'submit',
        label: 'Submit',
        width: 0.72,
        position: [ 0.42, panel.rowY.actions ],
        onPress: ( source ) => submitTask( source ),
      } );

      createTrackedTextPlane(
        disposables,
        controlPanelRoot,
        {
          ...demo5VisualConfig.text.panelFooter,
          text: 'Use authored views. Select one landmark, then submit.',
        },
        [ 0, panel.rowY.footer, 0.026 ],
        { name: 'demo5-panel-footer', renderOrder: 34, depthTest: false },
      );

    }

    function attachControlPanelMoveHandle() {

      const panel = demo5VisualConfig.panel;
      controlPanelMoveHandle = createXYMoveHandle( context, {
        parent: root,
        name: 'demo5-control-panel-xy-move-handle',
        ...demo5VisualConfig.controlPanel.xyMoveHandle,
        targetObject: controlPanelRoot,
        anchorLocalPosition: [ 0, - panel.height * 0.5 - 0.06, 0 ],
        getTargetPosition: () => controlPanelRoot.position,
        setTargetPosition( nextPosition ) {

          controlPanelRoot.position.set( nextPosition.x, controlPanelRoot.position.y, nextPosition.z );
          controlPanelMoveHandle?.syncFromTarget?.();

        },
        getTargetQuaternion: () => controlPanelRoot.quaternion,
        setTargetQuaternion( nextQuaternion ) {

          controlPanelRoot.quaternion.copy( nextQuaternion );
          controlPanelMoveHandle?.syncFromTarget?.();

        },
        onDragEnd( payload, _finalPosition, didMove ) {

          commitControlPanelTransform( payload.source || 'demo5-control-panel-move-end', {
            shouldLog: didMove === true,
          } );

        },
        onRotateEnd( payload, _finalQuaternion, didRotate ) {

          commitControlPanelTransform( payload.source || 'demo5-control-panel-rotate-end', {
            shouldLog: didRotate === true,
          } );

        },
      } );
      disposables.push( {
        dispose() {

          controlPanelMoveHandle?.dispose?.();
          controlPanelMoveHandle = null;

        },
      } );

    }

    function createDesktopButton( label, handler ) {

      const button = document.createElement( 'button' );
      button.type = 'button';
      button.textContent = label;
      button.setAttribute( 'style', demo5VisualConfig.desktopPanel.button );
      button.addEventListener( 'click', handler );
      return button;

    }

    function createDesktopPanel() {

      const style = demo5VisualConfig.desktopPanel;
      const node = document.createElement( 'section' );
      node.setAttribute( 'style', style.root );

      const eyebrow = document.createElement( 'p' );
      eyebrow.setAttribute( 'style', style.eyebrow );
      eyebrow.textContent = 'reVISit-XR Demo 5';

      const title = document.createElement( 'h2' );
      title.setAttribute( 'style', style.title );
      title.textContent = 'Landmark Scale Visceralization';

      const body = document.createElement( 'p' );
      body.setAttribute( 'style', style.body );
      body.textContent = `${task.prompt}\n${task.hint}`;

      const status = document.createElement( 'p' );
      status.setAttribute( 'style', style.status );

      const detail = document.createElement( 'p' );
      detail.setAttribute( 'style', style.detail );

      const landmarkLabel = document.createElement( 'p' );
      landmarkLabel.setAttribute( 'style', style.sectionLabel );
      landmarkLabel.textContent = 'Landmark';
      const landmarkRow = document.createElement( 'div' );
      landmarkRow.setAttribute( 'style', style.buttonRow );
      const landmarkButtons = new Map();
      getDemo5Landmarks().forEach( ( landmark ) => {

        const button = createDesktopButton( landmark.label, () => selectLandmark( landmark.id, `desktop-landmark-${landmark.id}` ) );
        landmarkButtons.set( landmark.id, button );
        landmarkRow.appendChild( button );

      } );

      const modeLabel = document.createElement( 'p' );
      modeLabel.setAttribute( 'style', style.sectionLabel );
      modeLabel.textContent = 'Scale mode';
      const modeRow = document.createElement( 'div' );
      modeRow.setAttribute( 'style', style.buttonRow );
      const modeButtons = new Map();
      [
        DEMO5_COMPARISON_MODES.REAL_SCALE,
        DEMO5_COMPARISON_MODES.DISTANT_COMPARISON,
        DEMO5_COMPARISON_MODES.MINIATURE_COMPARISON,
      ].forEach( ( mode ) => {

        const button = createDesktopButton( formatModeLabel( mode ), () => setComparisonMode( mode, `desktop-mode-${mode}` ) );
        modeButtons.set( mode, button );
        modeRow.appendChild( button );

      } );

      const viewLabel = document.createElement( 'p' );
      viewLabel.setAttribute( 'style', style.sectionLabel );
      viewLabel.textContent = 'Viewpoint';
      const viewRow = document.createElement( 'div' );
      viewRow.setAttribute( 'style', style.buttonRow );
      const viewButtons = new Map();
      [
        DEMO5_VIEWPOINT_PRESETS.BASE_NEAR_SELECTED,
        DEMO5_VIEWPOINT_PRESETS.DISTANT_COMPARISON,
        DEMO5_VIEWPOINT_PRESETS.ELEVATED_OVERVIEW,
        DEMO5_VIEWPOINT_PRESETS.HIGH_VANTAGE,
      ].forEach( ( viewpointId ) => {

        const button = createDesktopButton( formatViewpointLabel( viewpointId ), () => setViewpointPreset( viewpointId, `desktop-view-${viewpointId}` ) );
        viewButtons.set( viewpointId, button );
        viewRow.appendChild( button );

      } );

      const cueLabel = document.createElement( 'p' );
      cueLabel.setAttribute( 'style', style.sectionLabel );
      cueLabel.textContent = 'Cues';
      const cueRow = document.createElement( 'div' );
      cueRow.setAttribute( 'style', style.buttonRow );
      const toggleButtons = new Map();
      [
        [ 'humanReferenceVisible', 'People', 'humanReference', 'flushOnHumanReferenceToggle' ],
        [ 'shadowCueVisible', 'Shadows', 'shadowCue', 'flushOnShadowCueToggle' ],
        [ 'rulerCueVisible', 'Ruler', 'rulerCue', 'flushOnRulerCueToggle' ],
        [ 'quantLabelsVisible', 'Height labels', 'quantLabels', 'flushOnQuantLabelsToggle' ],
      ].forEach( ( [ key, label, labelKey, flushKey ] ) => {

        const button = createDesktopButton( label, () => toggleBooleanState( key, labelKey, `desktop-toggle-${key}`, flushKey ) );
        toggleButtons.set( key, button );
        cueRow.appendChild( button );

      } );

      const actionLabel = document.createElement( 'p' );
      actionLabel.setAttribute( 'style', style.sectionLabel );
      actionLabel.textContent = 'Task';
      const actionRow = document.createElement( 'div' );
      actionRow.setAttribute( 'style', style.buttonRow );
      const resetButton = createDesktopButton( 'Reset', () => resetScene( 'desktop-reset-scene' ) );
      const submitButton = createDesktopButton( 'Submit selected', () => submitTask( 'desktop-task-submit' ) );
      actionRow.append( resetButton, submitButton );

      node.append(
        eyebrow,
        title,
        body,
        status,
        detail,
        landmarkLabel,
        landmarkRow,
        modeLabel,
        modeRow,
        viewLabel,
        viewRow,
        cueLabel,
        cueRow,
        actionLabel,
        actionRow,
      );

      Object.assign( desktopRefs, {
        status,
        detail,
        landmarkButtons,
        modeButtons,
        viewButtons,
        toggleButtons,
        submitButton,
      } );
      context.setDesktopPanelNode?.( node );

    }

    function rebuildHumanReferencesForRecord( record ) {

      record.humanModelGroup.clear();

      const templates = demo5PeopleModels
        .map( ( person ) => loadedPeopleTemplates.get( person.id ) )
        .filter( Boolean );

      templates.forEach( ( template, index ) => {

        const clone = template.object.clone( true );
        clone.name = `demo5-human-reference-${record.landmark.id}-${template.id}`;
        clone.position.x = ( index - ( templates.length - 1 ) * 0.5 ) * demo5VisualConfig.people.spacingMeters;
        clone.position.y = 0;
        clone.position.z = 0;
        clone.rotation.y = index % 2 === 0 ? THREE.MathUtils.degToRad( 18 ) : THREE.MathUtils.degToRad( - 16 );
        applyObjectRenderingDefaults( clone );
        record.humanModelGroup.add( clone );

      } );

      syncLandmarkVisuals();

    }

    function rebuildAllHumanReferences() {

      landmarkRecords.forEach( ( record ) => rebuildHumanReferencesForRecord( record ) );

    }

    function updateLoadStatus() {

      const records = [ ...landmarkRecords.values() ];
      const readyCount = records.filter( ( record ) => record.loadStatus === 'ready' ).length;
      const errorCount = records.filter( ( record ) => record.loadStatus === 'error' ).length;

      if ( errorCount > 0 ) {

        loadStatus = readyCount > 0 ? 'partial' : 'error';

      } else if ( readyCount === records.length ) {

        loadStatus = 'ready';

      } else {

        loadStatus = 'loading';

      }

    }

    async function loadLandmarkModel( record ) {

      record.loadStatus = 'loading';

      try {

        const { object, format } = await loadObjectWithFallback( record.landmark.assetUrls, record.landmark.label );

        if ( disposed ) {

          disposeObjectTree( object, { disposeRoot: true } );
          return;

        }

        object.name = `demo5-loaded-${record.landmark.id}-${format}`;
        const normalized = normalizeObjectToHeight( object, record.landmark.heightMeters );
        applyObjectRenderingDefaults( object, {
          opacity: demo5VisualConfig.landmarks.modelOpacity,
        } );
        unregisterLandmarkModelRaycastTargets( record );
        disposeChildren( record.modelHolder );
        record.modelHolder.add( object );
        record.loadedObject = object;
        record.assetFormat = format;
        record.loadStatus = 'ready';
        record.loadError = null;
        record.footprintRadius = Math.max( normalized.footprintRadius, record.footprintRadius * 0.6 );
        updateLandmarkAuxiliaryGeometry( record );
        refreshLandmarkModelRaycastTargets( record );
        updateLoadStatus();
        syncVisuals();

      } catch ( error ) {

        console.warn( error );
        record.loadStatus = 'error';
        record.loadError = error;
        loadError = error;
        updateLoadStatus();
        syncVisuals();

      }

    }

    async function loadPeopleModel( person ) {

      try {

        const { object, format } = await loadObjectWithFallback( person.assetUrls, person.label );

        if ( disposed ) {

          disposeObjectTree( object, { disposeRoot: true } );
          return;

        }

        object.name = `demo5-loaded-${person.id}-${format}`;
        normalizeObjectToHeight( object, person.intendedHeightMeters );
        applyObjectRenderingDefaults( object );
        loadedPeopleTemplates.set( person.id, {
          id: person.id,
          object,
          format,
        } );
        rebuildAllHumanReferences();
        syncVisuals();

      } catch ( error ) {

        console.warn( `Unable to load ${person.label}; keeping simple human reference geometry.`, error );

      }

    }

    function loadAssets() {

      getDemo5Landmarks().forEach( ( landmark ) => {

        const record = landmarkRecords.get( landmark.id );

        if ( record ) {

          void loadLandmarkModel( record );

        }

      } );

      demo5PeopleModels.forEach( ( person ) => {

        void loadPeopleModel( person );

      } );

    }

    function getSceneStateForStorage() {

      return {
        demoId: currentSceneState.demoId,
        taskId: currentSceneState.taskId,
        landmarkSetId: currentSceneState.landmarkSetId,
        selectedLandmarkId: currentSceneState.selectedLandmarkId,
        comparisonMode: currentSceneState.comparisonMode,
        viewpointPresetId: currentSceneState.viewpointPresetId,
        annotationsVisible: currentSceneState.annotationsVisible,
        humanReferenceVisible: currentSceneState.humanReferenceVisible,
        shadowCueVisible: currentSceneState.shadowCueVisible,
        rulerCueVisible: currentSceneState.rulerCueVisible,
        quantLabelsVisible: currentSceneState.quantLabelsVisible,
        taskAnswer: currentSceneState.taskAnswer,
        taskSubmitted: currentSceneState.taskSubmitted,
        controlPanelPosition: normalizeDemo5ControlPanelPosition(
          currentSceneState.controlPanelPosition,
          demo5VisualConfig.panel.position,
        ),
        controlPanelQuaternion: normalizeDemo5ControlPanelQuaternion( currentSceneState.controlPanelQuaternion ),
      };

    }

    function getAnswerSummary() {

      const state = getSceneStateForStorage();

      return {
        xrDemoId: state.demoId,
        xrTaskId: state.taskId,
        xrVisceralLandmarkSetId: state.landmarkSetId,
        xrVisceralSelectedLandmarkId: state.selectedLandmarkId,
        xrVisceralComparisonMode: state.comparisonMode,
        xrVisceralViewpointPresetId: state.viewpointPresetId,
        xrVisceralAnnotationsVisible: state.annotationsVisible,
        xrVisceralHumanReferenceVisible: state.humanReferenceVisible,
        xrVisceralShadowCueVisible: state.shadowCueVisible,
        xrVisceralRulerCueVisible: state.rulerCueVisible,
        xrVisceralQuantLabelsVisible: state.quantLabelsVisible,
        xrVisceralStateSummaryJson: jsonStringifyCompact( state ),
        xrStateSummaryJson: jsonStringifyCompact( state ),
      };

    }

    function applySceneEnvironment() {

      context.camera.near = demo5VisualConfig.camera.near;
      context.camera.far = demo5VisualConfig.camera.far;
      context.camera.fov = demo5VisualConfig.camera.fov;
      context.camera.updateProjectionMatrix();
      context.scene.background = new THREE.Color( demo5VisualConfig.environment.backgroundColor );

      if ( demo5VisualConfig.environment.fogEnabled === false ) {

        context.scene.fog = null;

      } else {

        context.scene.fog = new THREE.Fog(
          demo5VisualConfig.environment.fogColor,
          demo5VisualConfig.environment.fogNear,
          demo5VisualConfig.environment.fogFar,
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

    getDemo5Landmarks().forEach( createLandmarkRecord );
    createAnnotationRecords();
    buildInScenePanel();
    attachControlPanelMoveHandle();
    createDesktopPanel();
    applySceneEnvironment();
    syncVisuals();

    return {
      activate() {

        context.sceneContentRoot.add( root );
        applySceneEnvironment();
        loadAssets();
        syncVisuals();

      },
      dispose() {

        disposed = true;
        context.clearDesktopPanel?.();
        disposables.splice( 0 ).reverse().forEach( ( disposable ) => disposable.dispose?.() );
        loadedPeopleTemplates.forEach( ( template ) => disposeObjectTree( template.object, { disposeRoot: true } ) );
        loadedPeopleTemplates.clear();
        root.removeFromParent();
        restoreSceneEnvironment();

      },
      getSceneStateForReplay() {

        return normalizeDemo5SceneState( getSceneStateForStorage(), currentSceneState );

      },
      applySceneStateFromReplay( sceneState ) {

        currentSceneState = normalizeDemo5SceneState( sceneState, currentSceneState );
        hoveredLandmarkId = null;
        syncVisuals();

      },
      update() {

        syncSelectedLandmarkLabel();
        orientBillboards();

      },
      getAnswerSummary() {

        return getAnswerSummary();

      },
      resolveRaycastIntersection( intersections ) {

        const firstHit = intersections[ 0 ] || null;

        if ( firstHit?.object?.userData?.demo5RaycastTargetKind !== 'proxy' ) {

          return firstHit;

        }

        const proxyLandmarkId = firstHit.object.userData.demo5LandmarkId;
        return intersections.find( ( hit ) => (
          hit?.object?.userData?.demo5RaycastTargetKind === 'model' &&
          hit.object.userData.demo5LandmarkId === proxyLandmarkId
        ) ) || firstHit;

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR || unsupportedImmersiveMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

          return {
            title: 'Demo 5 Is VR First',
            body: 'This landmark scale scene uses authored VR viewpoints and a desktop fallback. AR is intentionally disabled for this scene.',
            note: 'Use Start VR or desktop controls to continue.',
          };

        }

        const selected = getSelectedLandmark();
        const loadLine = loadStatus === 'ready'
          ? 'All landmark models loaded.'
          : ( loadStatus === 'partial' ? 'Some models are using fallback geometry.' : ( loadError ? 'Model loading fallback is active.' : 'Loading local landmark models.' ) );

        return {
          title: 'Demo 5 Landmark Scale Visceralization',
          body: `Compare landmark heights through authored scale views. Current selection: ${selected?.label || 'none'}.`,
          note: `${task.prompt} Semantic replay restores landmark, mode, viewpoint, cues, and answer state. ${loadLine}`,
        };

      },
      handleBackgroundSelect( payload = {} ) {

        hoveredLandmarkId = null;
        syncLandmarkVisuals();

        if ( payload.source ) {

          context.invalidateSceneHoverForSource?.( payload.source );

        }

      },
      onPresentationModeChange( presentationMode ) {

        currentPresentationMode = presentationMode;
        unsupportedImmersiveMode = presentationMode === PRESENTATION_MODES.IMMERSIVE_AR
          ? PRESENTATION_MODES.IMMERSIVE_AR
          : null;
        applySceneEnvironment();
        syncVisuals();

      },
      onUnsupportedImmersiveMode( mode ) {

        unsupportedImmersiveMode = mode;
        syncVisuals();

      },
      getDebugState() {

        return {
          loadStatus,
          loadedLandmarks: [ ...landmarkRecords.values() ].map( ( record ) => ( {
            id: record.landmark.id,
            status: record.loadStatus,
            format: record.assetFormat,
            footprintRadius: record.footprintRadius,
          } ) ),
          loadedPeople: [ ...loadedPeopleTemplates.keys() ],
          sceneState: getSceneStateForStorage(),
        };

      },
    };

  },
} );
