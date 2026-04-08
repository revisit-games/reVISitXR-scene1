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
  followCameraHeight = false,
  heightFollowOffset = null,
  minPanelHeight = null,
  maxPanelHeight = null,
  heightSmoothing = 0,
  dragMode = 'orbital-horizontal',
  faceOrbitCenter = true,
  lockVerticalOrientation = true,
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
  const tempCameraPosition = new THREE.Vector3();
  const tempOrbitVector = new THREE.Vector3();
  const tempLookDirection = new THREE.Vector3();
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

  function getCurrentCameraWorldY() {

    context.camera.updateMatrixWorld( true );
    context.camera.getWorldPosition( tempCameraPosition );
    return tempCameraPosition.y;

  }

  function clampPanelHeight( y ) {

    let nextY = y;

    if ( Number.isFinite( minPanelHeight ) ) {

      nextY = Math.max( minPanelHeight, nextY );

    }

    if ( Number.isFinite( maxPanelHeight ) ) {

      const upperBound = Number.isFinite( minPanelHeight )
        ? Math.max( minPanelHeight, maxPanelHeight )
        : maxPanelHeight;
      nextY = Math.min( upperBound, nextY );

    }

    return nextY;

  }

  function getResolvedOrbitRadius() {

    if ( Number.isFinite( orbitRadius ) ) {

      return Math.max( minOrbitRadius, orbitRadius );

    }

    return Math.max( minOrbitRadius, derivedOrbitRadius ?? 0 );

  }

  function getResolvedHeightFollowOffset() {

    if ( Number.isFinite( heightFollowOffset ) ) {

      return heightFollowOffset;

    }

    if ( Number.isFinite( orbitHeightOffset ) ) {

      return orbitHeightOffset;

    }

    return - initialOffset.down;

  }

  function getResolvedOrbitHeightOffset() {

    if ( Number.isFinite( orbitHeightOffset ) ) {

      return orbitHeightOffset;

    }

    return derivedOrbitHeightOffset ?? 0;

  }

  function getTargetPanelY() {

    if ( followCameraHeight ) {

      return clampPanelHeight( getCurrentCameraWorldY() + getResolvedHeightFollowOffset() );

    }

    return clampPanelHeight( orbitCenter.y + getResolvedOrbitHeightOffset() );

  }

  function resolvePanelY( {
    currentY = panelRoot.position.y,
    deltaSeconds = null,
    exactY = null,
  } = {} ) {

    if ( Number.isFinite( exactY ) ) {

      return clampPanelHeight( exactY );

    }

    const targetY = getTargetPanelY();

    if (
      followCameraHeight &&
      Number.isFinite( heightSmoothing ) &&
      heightSmoothing > 0 &&
      Number.isFinite( deltaSeconds ) &&
      deltaSeconds > 0
    ) {

      return clampPanelHeight( THREE.MathUtils.damp( currentY, targetY, heightSmoothing, deltaSeconds ) );

    }

    return targetY;

  }

  function orientPanelTowardOrbitCenter() {

    if ( ! faceOrbitCenter || ! hasOrbitCenter ) {

      return;

    }

    panelRoot.getWorldPosition( tempPosition );

    if ( lockVerticalOrientation ) {

      tempLookDirection.set(
        orbitCenter.x - tempPosition.x,
        0,
        orbitCenter.z - tempPosition.z,
      );

      if ( tempLookDirection.lengthSq() < 1e-6 ) {

        panelRoot.getWorldDirection( tempLookDirection );
        tempLookDirection.y = 0;

        if ( tempLookDirection.lengthSq() < 1e-6 ) {

          updateCameraBasis();
          tempLookDirection.copy( tempForward );

        }

      }

      if ( tempLookDirection.lengthSq() < 1e-6 ) {

        tempLookDirection.set( 0, 0, - 1 );

      } else {

        tempLookDirection.normalize();

      }

      tempTarget.copy( tempPosition ).add( tempLookDirection );
      panelRoot.up.copy( worldUp );
      panelRoot.lookAt( tempTarget );
      return;

    }

    tempTarget.copy( orbitCenter );
    panelRoot.up.copy( worldUp );
    panelRoot.lookAt( tempTarget );

  }

  function syncOrbitFromCurrentTransform( {
    includeFixedHeightOffset = ! followCameraHeight,
  } = {} ) {

    if ( ! hasOrbitCenter ) {

      return;

    }

    panelRoot.getWorldPosition( tempPosition );
    const dx = tempPosition.x - orbitCenter.x;
    const dz = tempPosition.z - orbitCenter.z;

    if ( ! Number.isFinite( orbitRadius ) ) {

      derivedOrbitRadius = Math.max( minOrbitRadius, Math.sqrt( dx * dx + dz * dz ) );

    }

    if ( includeFixedHeightOffset && ! Number.isFinite( orbitHeightOffset ) ) {

      derivedOrbitHeightOffset = tempPosition.y - orbitCenter.y;

    }

  }

  function applyOrbitalPositionFromPoint( point, {
    deltaSeconds = null,
    exactY = null,
    quaternion = null,
    preserveQuaternion = false,
  } = {} ) {

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
      resolvePanelY( {
        currentY: panelRoot.position.y,
        deltaSeconds,
        exactY,
      } ),
      orbitCenter.z + tempOrbitVector.z,
    );

    if ( preserveQuaternion && quaternion ) {

      panelRoot.quaternion.copy( quaternion );

    } else {

      orientPanelTowardOrbitCenter();

    }

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
    tempPosition.y = followCameraHeight
      ? clampPanelHeight( getCurrentCameraWorldY() + getResolvedHeightFollowOffset() )
      : clampPanelHeight( orbitCenter.y - initialOffset.down );

    if ( ! Number.isFinite( orbitRadius ) ) {

      derivedOrbitRadius = Math.max(
        minOrbitRadius,
        Math.sqrt(
          ( tempPosition.x - orbitCenter.x ) ** 2 +
          ( tempPosition.z - orbitCenter.z ) ** 2,
        ),
      );

    }

    if ( ! followCameraHeight && ! Number.isFinite( orbitHeightOffset ) ) {

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

  function applyLiveWorldTransform( position, quaternion ) {

    const nextPosition = toVector3( position, panelRoot.position );
    const nextQuaternion = toQuaternion( quaternion, panelRoot.quaternion );

    if ( ! hasOrbitCenter ) {

      captureOrbitCenterFromCamera();

    }

    if ( ! hasOrbitCenter ) {

      return applyWorldTransform( position, quaternion );

    }

    if ( ! Number.isFinite( orbitRadius ) ) {

      const dx = nextPosition.x - orbitCenter.x;
      const dz = nextPosition.z - orbitCenter.z;
      derivedOrbitRadius = Math.max( minOrbitRadius, Math.sqrt( dx * dx + dz * dz ) );

    }

    if ( ! followCameraHeight && ! Number.isFinite( orbitHeightOffset ) ) {

      derivedOrbitHeightOffset = nextPosition.y - orbitCenter.y;

    }

    applyOrbitalPositionFromPoint( nextPosition, {
      exactY: followCameraHeight ? null : nextPosition.y,
      quaternion: nextQuaternion,
      preserveQuaternion: ! faceOrbitCenter,
    } );

    return getPanelSceneState();

  }

  function updateRuntimePlacement( { deltaSeconds = null } = {} ) {

    if ( ! followCameraHeight || ! hasOrbitCenter || activeDragSource !== null ) {

      return false;

    }

    panelRoot.getWorldPosition( tempPosition );
    const nextY = resolvePanelY( {
      currentY: tempPosition.y,
      deltaSeconds,
    } );

    if ( Math.abs( nextY - tempPosition.y ) <= 1e-4 ) {

      return false;

    }

    panelRoot.position.y = nextY;
    orientPanelTowardOrbitCenter();
    panelRoot.updateMatrixWorld( true );

    return true;

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
    updateDrag( payload );
    return true;

  }

  function updateDrag( payload ) {

    if ( activeDragSource !== payload.source || ! hasOrbitCenter || dragMode !== 'orbital-horizontal' ) {

      return false;

    }

    const dragPlaneHeight = followCameraHeight
      ? panelRoot.getWorldPosition( tempPosition ).y
      : orbitCenter.y + getResolvedOrbitHeightOffset();
    dragPlane.set( worldUp, - dragPlaneHeight );
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
    applyLiveWorldTransform,
    getPanelSceneState,
    syncOrbitFromCurrentTransform,
    updateRuntimePlacement,
    isFollowingCameraHeight() {

      return followCameraHeight;

    },
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
