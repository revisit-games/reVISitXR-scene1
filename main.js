import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const scene = new THREE.Scene();
const defaultBackground = new THREE.Color( 0x0b1320 );
const defaultFog = new THREE.Fog( 0x0b1320, 6, 18 );
scene.background = defaultBackground;
scene.fog = defaultFog;

const camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.set( 0, 1.6, 3 );

const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType( 'local-floor' );
renderer.domElement.style.touchAction = 'none';
document.body.appendChild( renderer.domElement );

const hudTitle = document.querySelector( '#hud-title' );
const hudBody = document.querySelector( '#hud-body' );
const hudNote = document.querySelector( '#hud-note' );

const light = new THREE.HemisphereLight( 0xdbe7ff, 0x2a1e12, 1.6 );
scene.add( light );

const keyLight = new THREE.DirectionalLight( 0xffffff, 1.6 );
keyLight.position.set( 3, 5, 2 );
keyLight.castShadow = true;
keyLight.shadow.mapSize.set( 1024, 1024 );
scene.add( keyLight );

const environmentRoot = new THREE.Group();
scene.add( environmentRoot );

const floor = new THREE.Mesh(
  new THREE.CircleGeometry( 8, 64 ),
  new THREE.MeshStandardMaterial( {
    color: 0x263449,
    roughness: 0.96,
    metalness: 0.05,
  } )
);
floor.rotation.x = - Math.PI / 2;
floor.receiveShadow = true;
environmentRoot.add( floor );

const grid = new THREE.GridHelper( 8, 20, 0x7aa6ff, 0x335077 );
grid.position.y = 0.01;
environmentRoot.add( grid );

const cubeMaterial = new THREE.MeshStandardMaterial( {
  color: 0x4dd0a8,
  emissive: 0x000000,
  roughness: 0.35,
  metalness: 0.08,
} );

const cube = new THREE.Mesh( new THREE.BoxGeometry( 0.35, 0.35, 0.35 ), cubeMaterial );
cube.castShadow = true;
cube.receiveShadow = true;
cube.userData.grabbedBy = null;
scene.add( cube );

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry( 0.23, 0.26, 0.8, 32 ),
  new THREE.MeshStandardMaterial( {
    color: 0xb8c7dc,
    roughness: 0.82,
    metalness: 0.18,
  } )
);
pedestal.receiveShadow = true;
scene.add( pedestal );

const interactables = [ cube ];
const controllers = [];
const raycaster = new THREE.Raycaster();
const controllerModelFactory = new XRControllerModelFactory();
const pointer = new THREE.Vector2();
const desktopGrabber = { type: 'desktop-pointer' };
const dragPoint = new THREE.Vector3();
const dragNormal = new THREE.Vector3();

const desktopState = {
  activePointerId: null,
  hovered: null,
  selected: null,
  dragPlane: new THREE.Plane(),
  dragOffset: new THREE.Vector3(),
};

const hoverColor = 0x163244;
const grabbedColor = 0x235f7d;
const idleColor = 0x000000;
const defaultRayLength = 5;

let currentMode = 'desktop';

function applyButtonPlacement( button, left ) {

  button.style.setProperty( 'left', left, 'important' );
  button.style.setProperty( 'width', '180px', 'important' );
  button.style.setProperty( 'bottom', '20px', 'important' );

}

const arButton = ARButton.createButton( renderer, {
  optionalFeatures: [ 'local-floor', 'bounded-floor' ],
} );
applyButtonPlacement( arButton, '20px' );
document.body.appendChild( arButton );

const vrButton = VRButton.createButton( renderer, {
  optionalFeatures: [ 'local-floor', 'bounded-floor' ],
} );
applyButtonPlacement( vrButton, '220px' );
document.body.appendChild( vrButton );

function initializeSceneLayout() {

  cube.position.set( 0, 1.4, - 1.2 );
  pedestal.position.set( cube.position.x, 0.4, cube.position.z );

}

function setEnvironmentVisibility( visible ) {

  environmentRoot.visible = visible;

}

function updateHud() {

  if ( ! hudTitle || ! hudBody || ! hudNote ) {

    return;

  }

  if ( currentMode === 'immersive-vr' ) {

    hudTitle.textContent = 'WebXR VR Mode';
    hudBody.textContent = 'Point at the cube with a controller. Hold the trigger to grab it, and look for the bright cursor dot at the end of the ray when you are on target.';
    hudNote.textContent = 'Desktop mouse dragging is paused while an XR session is active.';
    return;

  }

  if ( currentMode === 'immersive-ar' ) {

    hudTitle.textContent = 'WebXR AR Mode';
    hudBody.textContent = 'AR, VR, and desktop now share the same scene state. The cube and pedestal should stay exactly where you left them, while passthrough remains visible behind the virtual content.';
    hudNote.textContent = 'If the AR button says AR NOT SUPPORTED, your current Quest Browser build is not exposing immersive-ar on this device.';
    return;

  }

  hudTitle.textContent = 'Desktop Debug Mode';
  hudBody.textContent = 'Drag the cube with your mouse on desktop. Enter VR to test controller grabbing, or try AR if your browser/device exposes immersive-ar.';
  hudNote.textContent = 'Use HTTPS on Quest. The AR behavior here is a minimal passthrough-style setup intended for fast iteration, not yet a full spatial anchoring workflow.';

}

function setPresentationMode( mode ) {

  currentMode = mode;

  if ( mode === 'immersive-ar' ) {

    scene.background = null;
    scene.fog = null;
    setEnvironmentVisibility( false );

  } else {

    scene.background = defaultBackground;
    scene.fog = defaultFog;
    setEnvironmentVisibility( true );

  }

  updateHud();

}

async function alignARViewToFloor() {

  const session = renderer.xr.getSession();

  if ( ! session ) {

    return;

  }

  try {

    const floorReferenceSpace = await session.requestReferenceSpace( 'local-floor' );
    renderer.xr.setReferenceSpace( floorReferenceSpace );

  } catch ( error ) {

    console.warn( 'AR local-floor reference space unavailable, keeping default local space.', error );

  }

}

function releaseDesktopDrag() {

  if ( desktopState.selected ) {

    desktopState.selected.userData.grabbedBy = null;

  }

  desktopState.selected = null;
  desktopState.activePointerId = null;
  renderer.domElement.style.cursor = desktopState.hovered ? 'grab' : 'default';

}

function releaseControllerObject( controller ) {

  const selected = controller.userData.selected;

  if ( ! selected ) {

    return;

  }

  scene.attach( selected );
  selected.userData.grabbedBy = null;
  controller.userData.selected = null;

}

function releaseAllXRSelections() {

  for ( const controller of controllers ) {

    releaseControllerObject( controller );
    controller.userData.hovered = null;

    const cursor = controller.getObjectByName( 'cursor' );
    if ( cursor ) {

      cursor.visible = false;

    }

  }

}

function refreshInteractableAppearance() {

  for ( const object of interactables ) {

    const hoveredByController = controllers.some( ( controller ) => controller.userData.hovered === object );
    const hovered = hoveredByController || desktopState.hovered === object;

    if ( object.userData.grabbedBy ) {

      object.material.emissive.setHex( grabbedColor );

    } else if ( hovered ) {

      object.material.emissive.setHex( hoverColor );

    } else {

      object.material.emissive.setHex( idleColor );

    }

  }

}

function setPointerFromEvent( event ) {

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
  pointer.y = - ( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;

}

function getDesktopIntersections() {

  raycaster.setFromCamera( pointer, camera );
  return raycaster.intersectObjects( interactables, false ).filter( ( hit ) => {

    return hit.object.userData.grabbedBy === null || hit.object.userData.grabbedBy === desktopGrabber;

  } );

}

function getXRIntersections( controller ) {

  raycaster.setFromXRController( controller );
  return raycaster.intersectObjects( interactables, false ).filter( ( hit ) => {

    return hit.object.userData.grabbedBy === null || hit.object.userData.grabbedBy === controller;

  } );

}

function updateDesktopHover() {

  if ( renderer.xr.isPresenting || desktopState.selected ) {

    return;

  }

  const intersections = getDesktopIntersections();
  desktopState.hovered = intersections[ 0 ]?.object ?? null;
  renderer.domElement.style.cursor = desktopState.hovered ? 'grab' : 'default';

}

function onPointerMove( event ) {

  if ( renderer.xr.isPresenting ) {

    return;

  }

  setPointerFromEvent( event );

  if ( desktopState.selected ) {

    raycaster.setFromCamera( pointer, camera );

    if ( raycaster.ray.intersectPlane( desktopState.dragPlane, dragPoint ) ) {

      desktopState.selected.position.copy( dragPoint ).add( desktopState.dragOffset );

    }

    renderer.domElement.style.cursor = 'grabbing';
    return;

  }

  updateDesktopHover();

}

function onPointerDown( event ) {

  if ( renderer.xr.isPresenting || event.button !== 0 ) {

    return;

  }

  setPointerFromEvent( event );
  const intersections = getDesktopIntersections();

  if ( intersections.length === 0 ) {

    desktopState.hovered = null;
    renderer.domElement.style.cursor = 'default';
    return;

  }

  const hit = intersections[ 0 ];
  const object = hit.object;
  desktopState.activePointerId = event.pointerId;
  desktopState.selected = object;
  desktopState.hovered = object;
  object.userData.grabbedBy = desktopGrabber;

  camera.getWorldDirection( dragNormal );
  desktopState.dragPlane.setFromNormalAndCoplanarPoint( dragNormal, object.position );
  desktopState.dragOffset.copy( object.position ).sub( hit.point );

  renderer.domElement.setPointerCapture( event.pointerId );
  renderer.domElement.style.cursor = 'grabbing';

}

function onPointerUp( event ) {

  if ( desktopState.activePointerId !== event.pointerId ) {

    return;

  }

  if ( renderer.domElement.hasPointerCapture( event.pointerId ) ) {

    renderer.domElement.releasePointerCapture( event.pointerId );

  }

  releaseDesktopDrag();
  updateDesktopHover();

}

function onPointerLeave() {

  if ( renderer.xr.isPresenting || desktopState.selected ) {

    return;

  }

  desktopState.hovered = null;
  renderer.domElement.style.cursor = 'default';

}

function buildController( index ) {

  const controller = renderer.xr.getController( index );
  controller.userData.selected = null;
  controller.userData.hovered = null;
  controller.addEventListener( 'selectstart', onSelectStart );
  controller.addEventListener( 'selectend', onSelectEnd );

  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints( [
      new THREE.Vector3( 0, 0, 0 ),
      new THREE.Vector3( 0, 0, - 1 ),
    ] ),
    new THREE.LineBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0.9 } )
  );
  line.name = 'ray';
  line.scale.z = defaultRayLength;
  controller.add( line );

  const cursor = new THREE.Mesh(
    new THREE.SphereGeometry( 0.015, 16, 16 ),
    new THREE.MeshBasicMaterial( { color: 0xffffff, toneMapped: false } )
  );
  cursor.name = 'cursor';
  cursor.visible = false;
  controller.add( cursor );

  const grip = renderer.xr.getControllerGrip( index );
  grip.add( controllerModelFactory.createControllerModel( grip ) );

  scene.add( controller );
  scene.add( grip );
  controllers.push( controller );

}

function onSelectStart( event ) {

  const controller = event.target;
  const intersections = getXRIntersections( controller );

  if ( intersections.length === 0 ) {

    return;

  }

  const object = intersections[ 0 ].object;
  object.userData.grabbedBy = controller;
  controller.attach( object );
  controller.userData.selected = object;
  controller.userData.hovered = null;

  const cursor = controller.getObjectByName( 'cursor' );
  if ( cursor ) {

    cursor.visible = false;

  }

}

function onSelectEnd( event ) {

  releaseControllerObject( event.target );

}

function updateControllerState( controller ) {

  const line = controller.getObjectByName( 'ray' );
  const cursor = controller.getObjectByName( 'cursor' );

  if ( controller.userData.selected ) {

    controller.userData.hovered = null;
    line.scale.z = 0.6;
    cursor.visible = false;
    return;

  }

  const intersections = getXRIntersections( controller );
  const hit = intersections[ 0 ];

  if ( hit ) {

    controller.userData.hovered = hit.object;
    line.scale.z = hit.distance;
    cursor.position.set( 0, 0, - Math.max( 0.04, hit.distance - 0.01 ) );
    cursor.visible = true;

  } else {

    controller.userData.hovered = null;
    line.scale.z = defaultRayLength;
    cursor.visible = false;

  }

}

function animate() {

  for ( const controller of controllers ) {

    updateControllerState( controller );

  }

  refreshInteractableAppearance();
  renderer.render( scene, camera );

}

function onWindowResize() {

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize( window.innerWidth, window.innerHeight );

}

renderer.xr.addEventListener( 'sessionstart', () => {

  releaseDesktopDrag();
  desktopState.hovered = null;
  renderer.domElement.style.cursor = 'default';

  const blendMode = renderer.xr.getEnvironmentBlendMode();
  const isPassthroughStyle = blendMode === 'alpha-blend' || blendMode === 'additive';
  setPresentationMode( isPassthroughStyle ? 'immersive-ar' : 'immersive-vr' );

  if ( isPassthroughStyle ) {

    void alignARViewToFloor();

  }

} );

renderer.xr.addEventListener( 'sessionend', () => {

  releaseAllXRSelections();
  desktopState.hovered = null;
  renderer.xr.setReferenceSpace( null );
  renderer.xr.setReferenceSpaceType( 'local-floor' );
  setPresentationMode( 'desktop' );

} );

initializeSceneLayout();
buildController( 0 );
buildController( 1 );
updateHud();

window.addEventListener( 'resize', onWindowResize );
window.addEventListener( 'blur', releaseDesktopDrag );
renderer.domElement.addEventListener( 'pointermove', onPointerMove );
renderer.domElement.addEventListener( 'pointerdown', onPointerDown );
renderer.domElement.addEventListener( 'pointerup', onPointerUp );
renderer.domElement.addEventListener( 'pointerleave', onPointerLeave );
renderer.setAnimationLoop( animate );
