import * as THREE from 'three';

const DEFAULT_WORLD_UP = new THREE.Vector3( 0, 1, 0 );

export const SITUATED_PLACEMENT_SOURCES = Object.freeze( {
  XR_HIT_TEST: 'xr-hit-test',
  FLOOR_PLANE_FALLBACK: 'floor-plane-fallback',
  DESKTOP_DEFAULT: 'desktop-default',
  REPLAY: 'replay',
} );

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function vector3FromValue( value, fallback = [ 0, 0, 0 ] ) {

  if ( value?.isVector3 ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 3 && value.every( isFiniteNumber ) ) {

    return new THREE.Vector3( value[ 0 ], value[ 1 ], value[ 2 ] );

  }

  return vector3FromValue( fallback, [ 0, 0, 0 ] );

}

function quaternionFromValue( value, fallback = [ 0, 0, 0, 1 ] ) {

  if ( value?.isQuaternion ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 4 && value.every( isFiniteNumber ) ) {

    return new THREE.Quaternion( value[ 0 ], value[ 1 ], value[ 2 ], value[ 3 ] ).normalize();

  }

  return quaternionFromValue( fallback, [ 0, 0, 0, 1 ] );

}

function numberFromValue( value, fallback = 1 ) {

  return isFiniteNumber( value ) ? value : fallback;

}

function vector3ToArray( vector ) {

  return [ vector.x, vector.y, vector.z ];

}

function quaternionToArray( quaternion ) {

  return [ quaternion.x, quaternion.y, quaternion.z, quaternion.w ];

}

function getTransformSnapshot( object ) {

  return {
    position: vector3ToArray( object.position ),
    quaternion: quaternionToArray( object.quaternion ),
    scale: object.scale.x,
  };

}

function applyTransform( object, {
  position = null,
  quaternion = null,
  yawRad = null,
  scale = null,
} = {} ) {

  if ( position ) {

    object.position.copy( vector3FromValue( position, object.position ) );

  }

  if ( quaternion ) {

    object.quaternion.copy( quaternionFromValue( quaternion, object.quaternion ) );

  } else if ( isFiniteNumber( yawRad ) ) {

    object.quaternion.setFromAxisAngle( DEFAULT_WORLD_UP, yawRad );

  }

  if ( scale !== null && scale !== undefined ) {

    object.scale.setScalar( Math.max( 0.001, numberFromValue( scale, object.scale.x ) ) );

  }

}

export function createSituatedAnchor( context, {
  parent = context?.sceneContentRoot || context?.scene || null,
  name = 'situated-anchor',
  floorY = 0,
  overlayLift = 0.012,
  placementSurfaceSize = 4,
  defaultPreviewPosition = [ 0, 0.012, - 1.35 ],
  defaultPreviewQuaternion = [ 0, 0, 0, 1 ],
  defaultScale = 1,
  onPreviewMove = null,
  onConfirmPlacement = null,
  shouldAcceptPlacementPayload = null,
  preservePlacementPoseY = false,
} = {} ) {

  const root = new THREE.Group();
  const previewRoot = new THREE.Group();
  const anchorRoot = new THREE.Group();
  const placementPlane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), - floorY );
  const placementRay = new THREE.Ray();
  const placementPoint = new THREE.Vector3();
  let placementStatus = {
    source: SITUATED_PLACEMENT_SOURCES.DESKTOP_DEFAULT,
    surfaceDetected: false,
  };
  let placementEnabled = false;
  let surfaceRegistered = false;

  root.name = `${name}-root`;
  previewRoot.name = `${name}-preview-root`;
  anchorRoot.name = `${name}-anchor-root`;
  anchorRoot.visible = false;

  root.add( previewRoot );
  root.add( anchorRoot );
  parent?.add( root );

  const placementSurfaceGeometry = new THREE.PlaneGeometry(
    Math.max( 0.1, placementSurfaceSize ),
    Math.max( 0.1, placementSurfaceSize ),
  );
  const placementSurfaceMaterial = new THREE.MeshBasicMaterial( {
    color: 0xffffff,
    transparent: true,
    opacity: 0.001,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  } );
  const placementSurface = new THREE.Mesh( placementSurfaceGeometry, placementSurfaceMaterial );
  placementSurface.name = `${name}-placement-surface`;
  placementSurface.rotation.x = - Math.PI * 0.5;
  placementSurface.position.y = floorY;
  placementSurface.visible = false;
  root.add( placementSurface );

  applyTransform( previewRoot, {
    position: defaultPreviewPosition,
    quaternion: defaultPreviewQuaternion,
    scale: defaultScale,
  } );
  previewRoot.position.y = floorY + overlayLift;
  previewRoot.visible = true;

  function getTransformPlacementSource( transform = {} ) {

    return transform.placementSource || transform.source || placementStatus.source;

  }

  function shouldPreserveTransformY( transform = {} ) {

    if ( preservePlacementPoseY !== true ) {

      return false;

    }

    const source = getTransformPlacementSource( transform );
    return (
      source === SITUATED_PLACEMENT_SOURCES.XR_HIT_TEST ||
      source === SITUATED_PLACEMENT_SOURCES.REPLAY
    );

  }

  function getPlacementY( point, transform = {} ) {

    return shouldPreserveTransformY( transform )
      ? point.y + overlayLift
      : floorY + overlayLift;

  }

  function isPlacementPayloadAccepted( payload ) {

    return typeof shouldAcceptPlacementPayload !== 'function' || shouldAcceptPlacementPayload( payload ) === true;

  }

  function buildPlacementTransformFromPoint( point, {
    quaternion = previewRoot.quaternion,
    scale = previewRoot.scale.x,
    source = SITUATED_PLACEMENT_SOURCES.FLOOR_PLANE_FALLBACK,
    surfaceDetected = false,
  } = {} ) {

    return {
      position: [ point.x, getPlacementY( point, { source } ), point.z ],
      quaternion: quaternionToArray( quaternion ),
      scale,
      placementSource: source,
      surfaceDetected,
    };

  }

  function setPreviewTransform( transform = {} ) {

    applyTransform( previewRoot, {
      position: transform.position,
      quaternion: transform.quaternion,
      yawRad: transform.yawRad,
      scale: transform.scale,
    } );

    if ( ! shouldPreserveTransformY( transform ) ) {

      previewRoot.position.y = floorY + overlayLift;

    }

    if ( typeof transform.placementSource === 'string' || typeof transform.source === 'string' ) {

      placementStatus.source = transform.placementSource || transform.source;

    }

    if ( typeof transform.surfaceDetected === 'boolean' ) {

      placementStatus.surfaceDetected = transform.surfaceDetected;

    }

    return {
      ...getTransformSnapshot( previewRoot ),
      placementSource: placementStatus.source,
      surfaceDetected: placementStatus.surfaceDetected,
    };

  }

  function setPreviewFromWorldPoint( point, options = {} ) {

    const nextTransform = buildPlacementTransformFromPoint( point, options );
    return setPreviewTransform( nextTransform );

  }

  function setPreviewFromRay( rayOrigin, rayDirection, options = {} ) {

    if ( ! rayOrigin || ! rayDirection ) {

      return null;

    }

    placementRay.set(
      vector3FromValue( rayOrigin, [ 0, floorY + 1, 0 ] ),
      vector3FromValue( rayDirection, [ 0, - 1, 0 ] ).normalize(),
    );

    const hitPoint = placementRay.intersectPlane( placementPlane, placementPoint );

    if ( ! hitPoint ) {

      return null;

    }

    return setPreviewFromWorldPoint( hitPoint, options );

  }

  function setPreviewFromPlacementPose( {
    position = null,
    quaternion = null,
    scale = previewRoot.scale.x,
    source = SITUATED_PLACEMENT_SOURCES.XR_HIT_TEST,
    surfaceDetected = true,
  } = {} ) {

    if ( ! position ) {

      return null;

    }

    const point = vector3FromValue( position, defaultPreviewPosition );
    return setPreviewTransform( {
      position: [ point.x, getPlacementY( point, { source } ), point.z ],
      quaternion,
      scale,
      placementSource: source,
      surfaceDetected,
    } );

  }

  function setAnchorTransform( transform = {} ) {

    applyTransform( anchorRoot, {
      position: transform.position,
      quaternion: transform.quaternion,
      yawRad: transform.yawRad,
      scale: transform.scale,
    } );

    if ( ! shouldPreserveTransformY( transform ) ) {

      anchorRoot.position.y = floorY + overlayLift;

    }

    if ( typeof transform.placementSource === 'string' || typeof transform.source === 'string' ) {

      placementStatus.source = transform.placementSource || transform.source;

    }

    if ( typeof transform.surfaceDetected === 'boolean' ) {

      placementStatus.surfaceDetected = transform.surfaceDetected;

    }

    return {
      ...getTransformSnapshot( anchorRoot ),
      placementSource: placementStatus.source,
      surfaceDetected: placementStatus.surfaceDetected,
    };

  }

  function confirmPlacement( transform = null ) {

    if ( transform ) {

      setPreviewTransform( transform );

    }

    const nextTransform = setAnchorTransform( {
      ...getTransformSnapshot( previewRoot ),
      placementSource: placementStatus.source,
      surfaceDetected: placementStatus.surfaceDetected,
    } );
    anchorRoot.visible = true;
    previewRoot.visible = false;
    setPlacementEnabled( false );
    return {
      ...nextTransform,
      placementSource: placementStatus.source,
      surfaceDetected: placementStatus.surfaceDetected,
    };

  }

  function resetPlacement( transform = null ) {

    if ( transform ) {

      setPreviewTransform( transform );

    }

    anchorRoot.visible = false;
    previewRoot.visible = true;
    setPlacementEnabled( true );
    return {
      ...getTransformSnapshot( previewRoot ),
      placementSource: placementStatus.source,
      surfaceDetected: placementStatus.surfaceDetected,
    };

  }

  function updatePreviewFromPayload( payload ) {

    if ( payload?.point ) {

      return setPreviewFromWorldPoint( payload.point );

    }

    return setPreviewFromRay( payload?.rayOrigin, payload?.rayDirection );

  }

  const placementSurfaceHandlers = {
    onHoverChange( payload ) {

      if ( ! placementEnabled || payload?.isHovered !== true || ! isPlacementPayloadAccepted( payload ) ) {

        return;

      }

      const transform = updatePreviewFromPayload( payload );

      if ( transform ) {

        onPreviewMove?.( payload, transform );

      }

    },
    onSelectStart( payload ) {

      if ( ! placementEnabled || ! isPlacementPayloadAccepted( payload ) ) {

        return;

      }

      if (
        placementStatus.source !== SITUATED_PLACEMENT_SOURCES.XR_HIT_TEST ||
        placementStatus.surfaceDetected !== true
      ) {

        updatePreviewFromPayload( payload );

      }

      const transform = confirmPlacement();
      onConfirmPlacement?.( payload, transform );

    },
  };

  function setPlacementEnabled( nextEnabled ) {

    placementEnabled = nextEnabled === true;
    placementSurface.visible = placementEnabled;

    if ( placementEnabled && ! surfaceRegistered ) {

      context?.registerRaycastTarget?.( placementSurface, placementSurfaceHandlers );
      surfaceRegistered = true;

    } else if ( ! placementEnabled && surfaceRegistered ) {

      context?.unregisterRaycastTarget?.( placementSurface );
      surfaceRegistered = false;

    }

  }

  return {
    root,
    previewRoot,
    anchorRoot,
    placementSurface,
    setPlacementEnabled,
    setPreviewTransform,
    setPreviewFromWorldPoint,
    setPreviewFromRay,
    setPreviewFromPlacementPose,
    setPreviewVisible( visible ) {

      previewRoot.visible = visible === true;

    },
    setAnchorTransform,
    setAnchorVisible( visible ) {

      anchorRoot.visible = visible === true;

    },
    getAnchorTransform() {

      return getTransformSnapshot( anchorRoot );

    },
    getPreviewTransform() {

      return getTransformSnapshot( previewRoot );

    },
    getPlacementStatus() {

      return { ...placementStatus };

    },
    confirmPlacement,
    resetPlacement,
    dispose() {

      setPlacementEnabled( false );
      root.removeFromParent();
      placementSurfaceGeometry.dispose();
      placementSurfaceMaterial.dispose();

    },
  };

}
