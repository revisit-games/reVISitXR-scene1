import * as THREE from 'three';

const DEFAULT_INITIAL_OFFSET = Object.freeze( {
  forward: 0.9,
  left: 0.5,
  down: 0.22,
} );

function cloneOffsetConfig( offset = {} ) {

  return {
    forward: Number.isFinite( offset.forward ) ? offset.forward : DEFAULT_INITIAL_OFFSET.forward,
    left: Number.isFinite( offset.left ) ? offset.left : DEFAULT_INITIAL_OFFSET.left,
    down: Number.isFinite( offset.down ) ? offset.down : DEFAULT_INITIAL_OFFSET.down,
  };

}

function toVector3( value, fallback = null ) {

  if ( value?.isVector3 ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 3 && value.every( Number.isFinite ) ) {

    return new THREE.Vector3().fromArray( value );

  }

  return fallback ? fallback.clone() : null;

}

function toQuaternion( value, fallback = null ) {

  if ( value?.isQuaternion ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 4 && value.every( Number.isFinite ) ) {

    return new THREE.Quaternion().fromArray( value );

  }

  return fallback ? fallback.clone() : null;

}

export function createFloatingOrbitPanel( context, {
  panelRoot,
  panelInitialOffset = DEFAULT_INITIAL_OFFSET,
  panelInitialYawDeg = 0,
  orbitCenterMode = 'immersive-entry-camera',
  orbitRadius = null,
  orbitHeightOffset = null,
  dragMode = 'orbital-horizontal',
  faceOrbitCenter = true,
  minOrbitRadius = 0.25,
} = {} ) {

  if ( ! panelRoot ) {

    throw new Error( 'createFloatingOrbitPanel requires a panelRoot.' );

  }

  const initialOffset = cloneOffsetConfig( panelInitialOffset );
  const orbitCenter = new THREE.Vector3();
  const tempPosition = new THREE.Vector3();
  const tempTarget = new THREE.Vector3();
  const tempForward = new THREE.Vector3();
  const tempRight = new THREE.Vector3();
  const tempLeft = new THREE.Vector3();
  const tempOffset = new THREE.Vector3();
  const tempOrbitVector = new THREE.Vector3();
  const tempQuaternion = new THREE.Quaternion();
  const yawQuaternion = new THREE.Quaternion();
  const dragPlane = new THREE.Plane();
  const dragIntersection = new THREE.Vector3();
  const dragRay = new THREE.Ray();
  const worldUp = new THREE.Vector3( 0, 1, 0 );

  let hasOrbitCenter = false;
  let localDragEnabled = true;
  let activeDragSource = null;
  let derivedOrbitRadius = Number.isFinite( orbitRadius ) ? orbitRadius : null;
  let derivedOrbitHeightOffset = Number.isFinite( orbitHeightOffset ) ? orbitHeightOffset : null;

  function updateCameraBasis() {

    context.camera.updateMatrixWorld( true );
    context.camera.getWorldDirection( tempForward );
    context.camera.getWorldQuaternion( tempQuaternion );

    tempForward.y = 0;
    if ( tempForward.lengthSq() < 1e-6 ) {

      tempForward.set( 0, 0, - 1 );

    } else {

      tempForward.normalize();

    }

    tempRight.set( 1, 0, 0 ).applyQuaternion( tempQuaternion );
    tempRight.y = 0;
    if ( tempRight.lengthSq() < 1e-6 ) {

      tempRight.set( 1, 0, 0 );

    } else {

      tempRight.normalize();

    }

    tempLeft.copy( tempRight ).multiplyScalar( - 1 );

  }

  function captureOrbitCenterFromCamera() {

    if ( orbitCenterMode !== 'immersive-entry-camera' ) {

      return null;

    }

    context.camera.updateMatrixWorld( true );
    context.camera.getWorldPosition( orbitCenter );
    hasOrbitCenter = true;
    syncOrbitFromCurrentTransform();
    return orbitCenter.clone();

  }

  function getResolvedOrbitRadius() {

    if ( Number.isFinite( orbitRadius ) ) {

      return Math.max( minOrbitRadius, orbitRadius );

    }

    return Math.max( minOrbitRadius, derivedOrbitRadius ?? 0 );

  }

  function getResolvedOrbitHeightOffset() {

    if ( Number.isFinite( orbitHeightOffset ) ) {

      return orbitHeightOffset;

    }

    return derivedOrbitHeightOffset ?? 0;

  }

  function orientPanelTowardOrbitCenter() {

    if ( ! faceOrbitCenter || ! hasOrbitCenter ) {

      return;

    }

    tempTarget.copy( orbitCenter );
    panelRoot.lookAt( tempTarget );

  }

  function syncOrbitFromCurrentTransform() {

    if ( ! hasOrbitCenter ) {

      return;

    }

    panelRoot.getWorldPosition( tempPosition );
    const dx = tempPosition.x - orbitCenter.x;
    const dz = tempPosition.z - orbitCenter.z;

    if ( ! Number.isFinite( orbitRadius ) ) {

      derivedOrbitRadius = Math.max( minOrbitRadius, Math.sqrt( dx * dx + dz * dz ) );

    }

    if ( ! Number.isFinite( orbitHeightOffset ) ) {

      derivedOrbitHeightOffset = tempPosition.y - orbitCenter.y;

    }

  }

  function applyOrbitalPositionFromPoint( point ) {

    if ( ! hasOrbitCenter ) {

      return false;

    }

    tempOrbitVector.set(
      point.x - orbitCenter.x,
      0,
      point.z - orbitCenter.z,
    );

    if ( tempOrbitVector.lengthSq() < 1e-6 ) {

      if ( panelRoot.position.lengthSq() > 0 ) {

        tempOrbitVector.set(
          panelRoot.position.x - orbitCenter.x,
          0,
          panelRoot.position.z - orbitCenter.z,
        );

      }

      if ( tempOrbitVector.lengthSq() < 1e-6 ) {

        updateCameraBasis();
        tempOrbitVector.copy( tempForward );

      }

    }

    tempOrbitVector.normalize().multiplyScalar( getResolvedOrbitRadius() );
    panelRoot.position.set(
      orbitCenter.x + tempOrbitVector.x,
      orbitCenter.y + getResolvedOrbitHeightOffset(),
      orbitCenter.z + tempOrbitVector.z,
    );
    orientPanelTowardOrbitCenter();
    panelRoot.updateMatrixWorld( true );

    return true;

  }

  function getPanelSceneState() {

    return {
      panelPosition: panelRoot.position.toArray(),
      panelQuaternion: panelRoot.quaternion.toArray(),
    };

  }

  function placeAtDefault() {

    if ( ! hasOrbitCenter ) {

      captureOrbitCenterFromCamera();

    }

    updateCameraBasis();

    tempOffset.copy( tempForward ).multiplyScalar( initialOffset.forward );
    tempOffset.addScaledVector( tempLeft, initialOffset.left );

    if ( Math.abs( panelInitialYawDeg ) > 1e-4 ) {

      yawQuaternion.setFromAxisAngle( worldUp, THREE.MathUtils.degToRad( panelInitialYawDeg ) );
      tempOffset.applyQuaternion( yawQuaternion );

    }

    tempPosition.copy( orbitCenter ).add( tempOffset );
    tempPosition.y = orbitCenter.y - initialOffset.down;

    if ( ! Number.isFinite( orbitRadius ) ) {

      derivedOrbitRadius = Math.max(
        minOrbitRadius,
        Math.sqrt(
          ( tempPosition.x - orbitCenter.x ) ** 2 +
          ( tempPosition.z - orbitCenter.z ) ** 2,
        ),
      );

    }

    if ( ! Number.isFinite( orbitHeightOffset ) ) {

      derivedOrbitHeightOffset = tempPosition.y - orbitCenter.y;

    }

    applyOrbitalPositionFromPoint( tempPosition );
    return getPanelSceneState();

  }

  function applyWorldTransform( position, quaternion ) {

    const nextPosition = toVector3( position, panelRoot.position );
    const nextQuaternion = toQuaternion( quaternion, panelRoot.quaternion );

    panelRoot.position.copy( nextPosition );
    panelRoot.quaternion.copy( nextQuaternion );
    panelRoot.updateMatrixWorld( true );
    syncOrbitFromCurrentTransform();

    return getPanelSceneState();

  }

  function setLocalDragEnabled( isEnabled ) {

    localDragEnabled = isEnabled !== false;

  }

  function beginDrag( payload ) {

    if ( ! localDragEnabled || dragMode !== 'orbital-horizontal' ) {

      return false;

    }

    if ( ! hasOrbitCenter ) {

      captureOrbitCenterFromCamera();

    }

    syncOrbitFromCurrentTransform();
    activeDragSource = payload.source;
    return updateDrag( payload );

  }

  function updateDrag( payload ) {

    if ( activeDragSource !== payload.source || ! hasOrbitCenter || dragMode !== 'orbital-horizontal' ) {

      return false;

    }

    dragPlane.set( worldUp, - ( orbitCenter.y + getResolvedOrbitHeightOffset() ) );
    dragRay.origin.copy( payload.rayOrigin );
    dragRay.direction.copy( payload.rayDirection );

    if ( ! dragRay.intersectPlane( dragPlane, dragIntersection ) ) {

      return false;

    }

    return applyOrbitalPositionFromPoint( dragIntersection );

  }

  function endDrag( payload ) {

    if ( activeDragSource !== payload.source ) {

      return false;

    }

    activeDragSource = null;
    return true;

  }

  return {
    captureOrbitCenterFromCamera,
    hasOrbitCenter() {

      return hasOrbitCenter;

    },
    placeAtDefault,
    applyWorldTransform,
    getPanelSceneState,
    syncOrbitFromCurrentTransform,
    setLocalDragEnabled,
    isDragEnabled() {

      return localDragEnabled;

    },
    isDragging() {

      return activeDragSource !== null;

    },
    beginDrag,
    updateDrag,
    endDrag,
  };

}
