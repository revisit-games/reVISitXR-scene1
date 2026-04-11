import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3( 0, 1, 0 );

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
  getTargetPosition = () => new THREE.Vector3(),
  setTargetPosition = () => {},
  onDragStart = null,
  onDragMove = null,
  onDragEnd = null,
  decorateHitMesh = null,
} = {} ) {

  const root = new THREE.Group();
  const dragPlane = new THREE.Plane( WORLD_UP, - numberOr( floorY, 0 ) );
  const dragRay = new THREE.Ray();
  const dragHit = new THREE.Vector3();
  const tempTargetPosition = new THREE.Vector3();
  const tempParentQuaternion = new THREE.Quaternion();
  const tempParentLocal = new THREE.Vector3();
  let activeDrag = null;
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

  function readTargetPosition() {

    tempTargetPosition.copy( vector3FromValue( getTargetPosition?.(), tempTargetPosition ) );
    return tempTargetPosition;

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

    const targetPosition = readTargetPosition().clone();
    const localFloorY = numberOr( floorY, 0 ) - targetPosition.y;
    const lineHeight = Math.max( 0.05, Math.abs( localFloorY ) );

    if ( parent ) {

      parent.updateMatrixWorld?.( true );
      tempParentLocal.copy( targetPosition );
      parent.worldToLocal?.( tempParentLocal );
      root.position.copy( tempParentLocal );
      parent.getWorldQuaternion?.( tempParentQuaternion );
      root.quaternion.copy( tempParentQuaternion ).invert();

    } else {

      root.position.copy( targetPosition );
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

  }

  function setVisible( isVisible ) {

    root.visible = Boolean( isVisible );
    hitMesh.visible = root.visible && enabled;

  }

  function setEnabled( isEnabled ) {

    enabled = Boolean( isEnabled );
    hitMesh.visible = root.visible && enabled;

  }

  function dispose() {

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
    dispose,
    setVisible,
    setEnabled,
    syncFromTarget,
    isDragging() {

      return activeDrag !== null;

    },
  };

}
