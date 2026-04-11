import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3( 0, 1, 0 );
const DEFAULT_QUATERNION = new THREE.Quaternion();

function numberOr( value, fallback ) {

  return Number.isFinite( value ) ? value : fallback;

}

function colorOr( value, fallback ) {

  return typeof value === 'number' || typeof value === 'string' ? value : fallback;

}

function vector3FromValue( value, fallback = new THREE.Vector3() ) {

  if ( value?.isVector3 ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 3 ) {

    return new THREE.Vector3(
      numberOr( value[ 0 ], fallback.x ),
      numberOr( value[ 1 ], fallback.y ),
      numberOr( value[ 2 ], fallback.z ),
    );

  }

  return fallback.clone();

}

function quaternionFromValue( value, fallback = DEFAULT_QUATERNION ) {

  if ( value?.isQuaternion ) {

    return value.clone();

  }

  if ( Array.isArray( value ) && value.length === 4 ) {

    return new THREE.Quaternion(
      numberOr( value[ 0 ], fallback.x ),
      numberOr( value[ 1 ], fallback.y ),
      numberOr( value[ 2 ], fallback.z ),
      numberOr( value[ 3 ], fallback.w ),
    );

  }

  return fallback.clone();

}

function normalizeAngleRadians( angle ) {

  return Math.atan2( Math.sin( angle ), Math.cos( angle ) );

}

function createStandardMaterial( {
  color,
  emissive = 0x000000,
  opacity = 1,
  roughness = 0.36,
  metalness = 0.14,
} ) {

  return new THREE.MeshStandardMaterial( {
    color,
    emissive,
    transparent: opacity < 1,
    opacity,
    roughness,
    metalness,
  } );

}

function createBasicMaterial( {
  color,
  opacity = 1,
  side = THREE.DoubleSide,
} ) {

  return new THREE.MeshBasicMaterial( {
    color,
    transparent: opacity < 1,
    opacity,
    side,
    depthWrite: false,
    toneMapped: false,
  } );

}

function disposeMesh( mesh ) {

  mesh.removeFromParent();
  mesh.geometry?.dispose?.();
  mesh.material?.dispose?.();

}

export function createXYMoveHandle( context, {
  parent = context?.sceneContentRoot || null,
  name = 'xy-move-handle',
  floorY = 0,
  lineRadius = 0.01,
  ringRadius = 0.17,
  ringTubeRadius = 0.012,
  discRadius = 0.14,
  discHeight = 0.012,
  showDisc = true,
  arrowRadius = 0.028,
  arrowLength = 0.05,
  arrowSegments = 12,
  arrowOffset = 0.17,
  arrowLift = 0.065,
  interactiveRadius = 0.2,
  interactiveHeight = 0.14,
  minMoveDistance = 0.005,
  lineColor = 0x88c9f3,
  lineEmissive = 0x133349,
  lineOpacity = 0.8,
  ringColor = 0x7fc9ff,
  ringEmissive = 0x17364a,
  ringOpacity = 0.82,
  discColor = 0x2c4860,
  discOpacity = 0.26,
  arrowColor = 0xbfe7ff,
  arrowEmissive = 0x1b4760,
  arrowOpacity = 0.86,
  hitColor = 0xffffff,
  hitOpacity = 0,
  renderOrder = 1,
  getAnchorWorldPosition = null,
  targetObject = null,
  anchorLocalPosition = null,
  attachmentLocalPosition = null,
  allowedRotate = false,
  rotateRingRadius = 0.25,
  rotateRingTubeRadius = 0.01,
  rotateArrowRadius = 0.024,
  rotateArrowLength = 0.052,
  rotateArrowColor = 0x8df7a4,
  rotateArrowEmissive = 0x1d5a34,
  rotateArrowOpacity = 0.88,
  rotateInteractiveRadius = 0.255,
  rotateInteractiveTubeRadius = 0.034,
  minRotateAngleDeg = 1.25,
  getTargetPosition = () => new THREE.Vector3(),
  setTargetPosition = () => {},
  getTargetQuaternion = () => DEFAULT_QUATERNION,
  setTargetQuaternion = () => {},
  onDragStart = null,
  onDragMove = null,
  onDragEnd = null,
  onRotateStart = null,
  onRotateMove = null,
  onRotateEnd = null,
  decorateHitMesh = null,
} = {} ) {

  const root = new THREE.Group();
  const canRotate = allowedRotate === true;
  const dragPlane = new THREE.Plane( WORLD_UP, - numberOr( floorY, 0 ) );
  const dragRay = new THREE.Ray();
  const dragHit = new THREE.Vector3();
  const tempTargetPosition = new THREE.Vector3();
  const tempAnchorPosition = new THREE.Vector3();
  const tempAnchorLocalPosition = new THREE.Vector3();
  const tempTargetQuaternion = new THREE.Quaternion();
  const tempYawQuaternion = new THREE.Quaternion();
  const tempNextQuaternion = new THREE.Quaternion();
  const tempParentQuaternion = new THREE.Quaternion();
  const tempParentLocal = new THREE.Vector3();
  const rotationVisuals = [];
  const rotationArrowUp = new THREE.Vector3( 0, 1, 0 );
  let activeDrag = null;
  let activeRotate = null;
  let enabled = true;

  root.name = name;
  parent?.add( root );

  const line = new THREE.Mesh(
    new THREE.CylinderGeometry( Math.max( 0.001, lineRadius ), Math.max( 0.001, lineRadius ), 1, 18 ),
    createStandardMaterial( {
      color: colorOr( lineColor, 0x88c9f3 ),
      emissive: colorOr( lineEmissive, 0x133349 ),
      opacity: numberOr( lineOpacity, 0.8 ),
      roughness: 0.38,
      metalness: 0.16,
    } ),
  );
  line.name = `${name}-line`;
  line.renderOrder = renderOrder;
  root.add( line );

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry( Math.max( 0.001, ringRadius ), Math.max( 0.001, ringTubeRadius ), 20, 64 ),
    createStandardMaterial( {
      color: colorOr( ringColor, 0x7fc9ff ),
      emissive: colorOr( ringEmissive, 0x17364a ),
      opacity: numberOr( ringOpacity, 0.82 ),
      roughness: 0.34,
      metalness: 0.18,
    } ),
  );
  ring.name = `${name}-ring`;
  ring.rotation.x = Math.PI * 0.5;
  ring.renderOrder = renderOrder + 1;
  root.add( ring );

  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry( Math.max( 0.001, discRadius ), Math.max( 0.001, discRadius ), Math.max( 0.001, discHeight ), 48 ),
    createBasicMaterial( {
      color: colorOr( discColor, 0x2c4860 ),
      opacity: numberOr( discOpacity, 0.26 ),
    } ),
  );
  disc.name = `${name}-disc`;
  disc.visible = showDisc !== false;
  disc.renderOrder = renderOrder;
  root.add( disc );

  const arrowConfigs = [
    { position: [ arrowOffset, arrowLift, 0 ], rotation: [ 0, 0, - Math.PI * 0.5 ] },
    { position: [ - arrowOffset, arrowLift, 0 ], rotation: [ 0, 0, Math.PI * 0.5 ] },
    { position: [ 0, arrowLift, arrowOffset ], rotation: [ Math.PI * 0.5, 0, 0 ] },
    { position: [ 0, arrowLift, - arrowOffset ], rotation: [ - Math.PI * 0.5, 0, 0 ] },
  ];
  const arrows = arrowConfigs.map( ( arrowConfig, index ) => {

    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry( Math.max( 0.001, arrowRadius ), Math.max( 0.001, arrowLength ), Math.max( 6, Math.round( arrowSegments ) ) ),
      createStandardMaterial( {
        color: colorOr( arrowColor, 0xbfe7ff ),
        emissive: colorOr( arrowEmissive, 0x1b4760 ),
        opacity: numberOr( arrowOpacity, 0.86 ),
        roughness: 0.26,
        metalness: 0.12,
      } ),
    );
    arrow.name = `${name}-arrow-${index}`;
    arrow.position.fromArray( arrowConfig.position );
    arrow.rotation.set( arrowConfig.rotation[ 0 ], arrowConfig.rotation[ 1 ], arrowConfig.rotation[ 2 ] );
    arrow.renderOrder = renderOrder + 2;
    root.add( arrow );
    return arrow;

  } );

  const hitMesh = new THREE.Mesh(
    new THREE.CylinderGeometry( Math.max( 0.001, interactiveRadius ), Math.max( 0.001, interactiveRadius ), Math.max( 0.001, interactiveHeight ), 48 ),
    createBasicMaterial( {
      color: colorOr( hitColor, 0xffffff ),
      opacity: numberOr( hitOpacity, 0 ),
    } ),
  );
  hitMesh.name = `${name}-hit`;
  hitMesh.renderOrder = renderOrder + 3;
  root.add( hitMesh );

  if ( canRotate ) {

    const rotateArcAngle = Math.PI * 0.68;
    const rotateRadius = Math.max( 0.001, rotateRingRadius );
    const rotateTube = Math.max( 0.001, rotateRingTubeRadius );
    const rotateMaterialOptions = {
      color: colorOr( rotateArrowColor, 0x8df7a4 ),
      emissive: colorOr( rotateArrowEmissive, 0x1d5a34 ),
      opacity: numberOr( rotateArrowOpacity, 0.88 ),
      roughness: 0.24,
      metalness: 0.1,
    };
    const rotateArrowConfigs = [
      { startAngle: - Math.PI * 0.9 },
      { startAngle: Math.PI * 0.1 },
    ];

    rotateArrowConfigs.forEach( ( config, index ) => {

      const endAngle = config.startAngle + rotateArcAngle;
      const arcGeometry = new THREE.TorusGeometry( rotateRadius, rotateTube, 14, 42, rotateArcAngle );
      arcGeometry.rotateZ( config.startAngle );
      arcGeometry.rotateX( Math.PI * 0.5 );
      const arc = new THREE.Mesh(
        arcGeometry,
        createStandardMaterial( rotateMaterialOptions ),
      );
      arc.name = `${name}-rotate-arrow-arc-${index}`;
      arc.renderOrder = renderOrder + 4;
      root.add( arc );

      const headPosition = new THREE.Vector3(
        Math.cos( endAngle ) * rotateRadius,
        0,
        Math.sin( endAngle ) * rotateRadius,
      );
      const headDirection = new THREE.Vector3(
        - Math.sin( endAngle ),
        0,
        Math.cos( endAngle ),
      ).normalize();
      const head = new THREE.Mesh(
        new THREE.ConeGeometry(
          Math.max( 0.001, rotateArrowRadius ),
          Math.max( 0.001, rotateArrowLength ),
          Math.max( 8, Math.round( arrowSegments ) ),
        ),
        createStandardMaterial( rotateMaterialOptions ),
      );
      head.name = `${name}-rotate-arrow-head-${index}`;
      head.position.copy( headPosition );
      head.quaternion.setFromUnitVectors( rotationArrowUp, headDirection );
      head.renderOrder = renderOrder + 5;
      root.add( head );
      rotationVisuals.push( {
        arc,
        head,
        headPosition,
      } );

    } );

  }

  const rotateHitMesh = canRotate
    ? new THREE.Mesh(
      new THREE.TorusGeometry(
        Math.max( 0.001, rotateInteractiveRadius ),
        Math.max( 0.001, rotateInteractiveTubeRadius ),
        12,
        64,
      ),
      createBasicMaterial( {
        color: colorOr( hitColor, 0xffffff ),
        opacity: numberOr( hitOpacity, 0 ),
      } ),
    )
    : null;

  if ( rotateHitMesh ) {

    rotateHitMesh.name = `${name}-rotate-hit`;
    rotateHitMesh.rotation.x = Math.PI * 0.5;
    rotateHitMesh.renderOrder = renderOrder + 6;
    root.add( rotateHitMesh );

  }

  decorateHitMesh?.( hitMesh );
  context?.registerRaycastTarget?.( hitMesh, {
    onSelectStart( payload ) {

      if ( ! enabled || context?.getInteractionPolicy?.()?.canInteract === false ) {

        return;

      }

      const hitPoint = resolvePlaneHit( payload );

      if ( ! hitPoint ) {

        return;

      }

      const startPosition = readTargetPosition();
      activeDrag = {
        source: payload.source,
        startPosition: startPosition.clone(),
        lastPosition: startPosition.clone(),
        offsetX: startPosition.x - hitPoint.x,
        offsetZ: startPosition.z - hitPoint.z,
        didMove: false,
      };
      onDragStart?.( payload );

    },
    onSelectMove( payload ) {

      if ( ! activeDrag || activeDrag.source !== payload.source ) {

        return;

      }

      const hitPoint = resolvePlaneHit( payload );

      if ( ! hitPoint ) {

        return;

      }

      const currentPosition = readTargetPosition();
      const nextPosition = currentPosition.clone();
      nextPosition.x = hitPoint.x + activeDrag.offsetX;
      nextPosition.y = currentPosition.y;
      nextPosition.z = hitPoint.z + activeDrag.offsetZ;

      if ( horizontalDistance( nextPosition, activeDrag.lastPosition ) <= Math.max( 0, minMoveDistance ) ) {

        return;

      }

      activeDrag.didMove = true;
      activeDrag.lastPosition.copy( nextPosition );
      setTargetPosition( nextPosition.clone() );
      syncFromTarget();
      onDragMove?.( payload, nextPosition.clone() );

    },
    onSelectEnd( payload ) {

      if ( ! activeDrag || activeDrag.source !== payload.source ) {

        return;

      }

      const didMove = activeDrag.didMove;
      activeDrag = null;
      const finalPosition = readTargetPosition();
      syncFromTarget();
      onDragEnd?.( payload, finalPosition.clone(), didMove );

    },
  } );

  if ( rotateHitMesh ) {

    context?.registerRaycastTarget?.( rotateHitMesh, {
      onSelectStart( payload ) {

        if ( ! enabled || context?.getInteractionPolicy?.()?.canInteract === false ) {

          return;

        }

        const hitPoint = resolvePlaneHit( payload );

        if ( ! hitPoint ) {

          return;

        }

        const anchorPosition = readAnchorWorldPosition();
        activeRotate = {
          source: payload.source,
          anchorPosition: anchorPosition.clone(),
          startAngle: Math.atan2( hitPoint.z - anchorPosition.z, hitPoint.x - anchorPosition.x ),
          startQuaternion: readTargetQuaternion().clone(),
          lastYaw: 0,
          didRotate: false,
        };
        onRotateStart?.( payload );

      },
      onSelectMove( payload ) {

        if ( ! activeRotate || activeRotate.source !== payload.source ) {

          return;

        }

        const hitPoint = resolvePlaneHit( payload );

        if ( ! hitPoint ) {

          return;

        }

        const currentAngle = Math.atan2(
          hitPoint.z - activeRotate.anchorPosition.z,
          hitPoint.x - activeRotate.anchorPosition.x,
        );
        const deltaYawRad = normalizeAngleRadians( currentAngle - activeRotate.startAngle );
        const minRotateAngleRad = THREE.MathUtils.degToRad( Math.max( 0, numberOr( minRotateAngleDeg, 1.25 ) ) );

        if ( Math.abs( normalizeAngleRadians( deltaYawRad - activeRotate.lastYaw ) ) <= minRotateAngleRad ) {

          return;

        }

        activeRotate.didRotate = true;
        activeRotate.lastYaw = deltaYawRad;
        tempYawQuaternion.setFromAxisAngle( WORLD_UP, deltaYawRad );
        tempNextQuaternion.copy( activeRotate.startQuaternion ).premultiply( tempYawQuaternion );
        setTargetQuaternion( tempNextQuaternion.clone() );
        syncFromTarget();
        onRotateMove?.( payload, tempNextQuaternion.clone(), deltaYawRad );

      },
      onSelectEnd( payload ) {

        if ( ! activeRotate || activeRotate.source !== payload.source ) {

          return;

        }

        const didRotate = activeRotate.didRotate;
        activeRotate = null;
        const finalQuaternion = readTargetQuaternion().clone();
        syncFromTarget();
        onRotateEnd?.( payload, finalQuaternion, didRotate );

      },
    } );

  }

  function readTargetPosition() {

    tempTargetPosition.copy( vector3FromValue( getTargetPosition?.(), tempTargetPosition ) );
    return tempTargetPosition;

  }

  function readAnchorWorldPosition() {

    if ( typeof getAnchorWorldPosition === 'function' ) {

      tempAnchorPosition.copy( vector3FromValue( getAnchorWorldPosition(), readTargetPosition() ) );
      return tempAnchorPosition;

    }

    if ( targetObject?.localToWorld ) {

      tempAnchorLocalPosition.copy(
        vector3FromValue( anchorLocalPosition ?? attachmentLocalPosition, tempAnchorLocalPosition.set( 0, 0, 0 ) ),
      );
      tempAnchorPosition.copy( tempAnchorLocalPosition );
      targetObject.updateMatrixWorld?.( true );
      targetObject.localToWorld( tempAnchorPosition );
      return tempAnchorPosition;

    }

    tempAnchorPosition.copy( readTargetPosition() );
    return tempAnchorPosition;

  }

  function readTargetQuaternion() {

    tempTargetQuaternion.copy( quaternionFromValue( getTargetQuaternion?.(), DEFAULT_QUATERNION ) );
    return tempTargetQuaternion;

  }

  function resolvePlaneHit( payload ) {

    if ( ! payload?.rayOrigin || ! payload?.rayDirection ) {

      return null;

    }

    dragRay.origin.copy( payload.rayOrigin );
    dragRay.direction.copy( payload.rayDirection ).normalize();
    return dragRay.intersectPlane( dragPlane, dragHit );

  }

  function horizontalDistance( positionA, positionB ) {

    const dx = positionA.x - positionB.x;
    const dz = positionA.z - positionB.z;
    return Math.sqrt( dx * dx + dz * dz );

  }

  function syncFromTarget() {

    const anchorPosition = readAnchorWorldPosition().clone();
    const localFloorY = numberOr( floorY, 0 ) - anchorPosition.y;
    const lineHeight = Math.max( 0.05, Math.abs( localFloorY ) );

    if ( parent ) {

      parent.updateMatrixWorld?.( true );
      tempParentLocal.copy( anchorPosition );
      parent.worldToLocal?.( tempParentLocal );
      root.position.copy( tempParentLocal );
      parent.getWorldQuaternion?.( tempParentQuaternion );
      root.quaternion.copy( tempParentQuaternion ).invert();

    } else {

      root.position.copy( anchorPosition );
      root.quaternion.identity();

    }

    line.position.set( 0, localFloorY * 0.5, 0 );
    line.scale.set( 1, lineHeight, 1 );
    ring.position.set( 0, localFloorY + Math.max( 0.001, ringTubeRadius ), 0 );
    disc.position.set( 0, localFloorY + Math.max( 0.001, discHeight ) * 0.5, 0 );
    arrows.forEach( ( arrow, index ) => {

      const config = arrowConfigs[ index ];
      arrow.position.set( config.position[ 0 ], localFloorY + arrowLift, config.position[ 2 ] );

    } );
    hitMesh.position.set( 0, localFloorY + Math.max( 0.001, interactiveHeight ) * 0.5, 0 );

    rotationVisuals.forEach( ( visual ) => {

      const rotateLift = Math.max( 0.001, rotateRingTubeRadius );
      visual.arc.position.set( 0, localFloorY + rotateLift, 0 );
      visual.head.position.set(
        visual.headPosition.x,
        localFloorY + rotateLift,
        visual.headPosition.z,
      );

    } );

    if ( rotateHitMesh ) {

      rotateHitMesh.position.set( 0, localFloorY + Math.max( 0.001, rotateInteractiveTubeRadius ), 0 );

    }

  }

  function setVisible( isVisible ) {

    root.visible = Boolean( isVisible );
    hitMesh.visible = root.visible && enabled;
    if ( rotateHitMesh ) {

      rotateHitMesh.visible = root.visible && enabled;

    }

  }

  function setEnabled( isEnabled ) {

    enabled = Boolean( isEnabled );
    hitMesh.visible = root.visible && enabled;
    if ( rotateHitMesh ) {

      rotateHitMesh.visible = root.visible && enabled;

    }

  }

  function dispose() {

    if ( rotateHitMesh ) {

      context?.unregisterRaycastTarget?.( rotateHitMesh );
      disposeMesh( rotateHitMesh );

    }

    rotationVisuals.forEach( ( visual ) => {

      disposeMesh( visual.head );
      disposeMesh( visual.arc );

    } );
    context?.unregisterRaycastTarget?.( hitMesh );
    disposeMesh( hitMesh );
    arrows.forEach( disposeMesh );
    disposeMesh( disc );
    disposeMesh( ring );
    disposeMesh( line );
    root.removeFromParent();

  }

  syncFromTarget();
  setVisible( true );

  return {
    root,
    hitMesh,
    rotateHitMesh,
    dispose,
    setVisible,
    setEnabled,
    syncFromTarget,
    isDragging() {

      return activeDrag !== null;

    },
    isRotating() {

      return activeRotate !== null;

    },
  };

}
