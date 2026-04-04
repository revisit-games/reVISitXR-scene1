import * as THREE from 'three';

function applyOptionalTransform( mesh, {
  position = null,
  rotation = null,
  quaternion = null,
  scale = null,
} = {} ) {

  if ( position ) {

    mesh.position.copy(
      position.isVector3
        ? position
        : new THREE.Vector3().fromArray( position ),
    );

  }

  if ( quaternion ) {

    mesh.quaternion.copy(
      quaternion.isQuaternion
        ? quaternion
        : new THREE.Quaternion().fromArray( quaternion ),
    );

  } else if ( rotation ) {

    if ( rotation.isEuler ) {

      mesh.rotation.copy( rotation );

    } else {

      mesh.rotation.set( rotation[ 0 ] || 0, rotation[ 1 ] || 0, rotation[ 2 ] || 0 );

    }

  }

  if ( scale ) {

    mesh.scale.copy(
      scale.isVector3
        ? scale
        : new THREE.Vector3().fromArray( scale ),
    );

  }

}

export function createSceneUiSurface( context, {
  parent = context?.sceneContentRoot || null,
  width = 1,
  height = 1,
  name = '',
  position = null,
  rotation = null,
  quaternion = null,
  scale = null,
  material = null,
  handlers = {},
} = {} ) {

  const geometry = new THREE.PlaneGeometry( width, height );
  const ownsMaterial = ! material;
  const meshMaterial = material || new THREE.MeshBasicMaterial( {
    color: 0xffffff,
    transparent: true,
    opacity: 0.001,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  } );
  const mesh = new THREE.Mesh( geometry, meshMaterial );
  mesh.name = name;

  applyOptionalTransform( mesh, {
    position,
    rotation,
    quaternion,
    scale,
  } );

  parent?.add( mesh );
  context?.registerRaycastTarget?.( mesh, handlers );

  return {
    mesh,
    dispose() {

      context?.unregisterRaycastTarget?.( mesh );
      mesh.removeFromParent();
      geometry.dispose();

      if ( ownsMaterial ) {

        meshMaterial.dispose();

      }

    },
  };

}
