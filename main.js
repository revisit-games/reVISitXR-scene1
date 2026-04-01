import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

const scene = new THREE.Scene();
const defaultBackground = new THREE.Color( 0x0b1320 );
const defaultFog = new THREE.Fog( 0x0b1320, 6, 18 );
scene.background = defaultBackground;
scene.fog = defaultFog;

const initialDesktopCameraPosition = new THREE.Vector3( 0, 1.6, 3 );
const initialDesktopCameraQuaternion = new THREE.Quaternion();

const camera = new THREE.PerspectiveCamera( 70, window.innerWidth / window.innerHeight, 0.1, 100 );
camera.position.copy( initialDesktopCameraPosition );
camera.quaternion.copy( initialDesktopCameraQuaternion );

const xrOrigin = new THREE.Group();
scene.add( xrOrigin );
xrOrigin.add( camera );

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

const tempWorldPosition = new THREE.Vector3();
const tempWorldQuaternion = new THREE.Quaternion();
const tempDirection = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempUp = new THREE.Vector3();
const dragPoint = new THREE.Vector3();
const dragNormal = new THREE.Vector3();
const desktopEuler = new THREE.Euler( 0, 0, 0, 'YXZ' );

const desktopState = {
  activePointerId: null,
  hovered: null,
  selected: null,
  mode: null,
  dragPlane: new THREE.Plane(),
  dragOffset: new THREE.Vector3(),
  lastPointer: new THREE.Vector2(),
};

const hoverColor = 0x163244;
const grabbedColor = 0x235f7d;
const idleColor = 0x000000;
const defaultRayLength = 5;
const mousePanFactor = 0.003;
const mouseRotateFactor = 0.005;
const keyboardMoveSpeed = 2.4;
const wheelMoveStep = 0.45;

const pressedKeys = new Set();
const clock = new THREE.Clock();

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
    hudBody.textContent = 'Point at the cube with either controller and hold the trigger to grab it. The bright dot shows where the controller ray hits.';
    hudNote.textContent = 'When you exit VR, desktop mode inherits the last headset pose. The next VR or AR entry starts from the fixed initial XR origin again.';
    return;

  }

  if ( currentMode === 'immersive-ar' ) {

    hudTitle.textContent = 'WebXR AR Mode';
    hudBody.textContent = 'AR, VR, and desktop share the same scene state. The cube and pedestal stay where you leave them, while passthrough remains visible behind the virtual content.';
    hudNote.textContent = 'Point at the cube with either controller and hold the trigger to grab it. If the browser reports AR NOT SUPPORTED, immersive-ar is not exposed on this device.';
    return;

  }

  hudTitle.textContent = 'Desktop Debug Mode';
  hudBody.textContent = 'Left drag the cube to move it. Left drag empty space pans the camera. Right drag rotates the camera view.';
  hudNote.textContent = 'In a normal Quest browser page, controller-specific pose/button data is not reliably exposed to the webpage outside an immersive XR session. Desktop pointer controls remain available, and the Quest browser may map its page cursor to them.';

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

function resetXROriginToInitial() {

  xrOrigin.position.set( 0, 0, 0 );
  xrOrigin.quaternion.identity();
  xrOrigin.scale.set( 1, 1, 1 );

}

function resetCameraForXRSession() {

  resetXROriginToInitial();
  camera.position.set( 0, 0, 0 );
  camera.quaternion.identity();
  camera.scale.set( 1, 1, 1 );
  camera.updateMatrixWorld( true );

}

function flattenXRToDesktopCamera() {

  camera.updateMatrixWorld( true );
  camera.getWorldPosition( tempWorldPosition );
  camera.getWorldQuaternion( tempWorldQuaternion );

  resetXROriginToInitial();

  camera.position.copy( tempWorldPosition );
  camera.quaternion.copy( tempWorldQuaternion );
  camera.updateMatrixWorld( true );

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

  camera.updateMatrixWorld( true );
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

function panDesktopCamera( deltaX, deltaY ) {

  const panScale = mousePanFactor * Math.max( camera.position.distanceTo( cube.position ), 1.5 );

  tempRight.set( 1, 0, 0 ).applyQuaternion( camera.quaternion );
  tempUp.set( 0, 1, 0 ).applyQuaternion( camera.quaternion );

  camera.position.addScaledVector( tempRight, - deltaX * panScale );
  camera.position.addScaledVector( tempUp, deltaY * panScale );
  camera.updateMatrixWorld( true );

}

function rotateDesktopCamera( deltaX, deltaY ) {

  desktopEuler.setFromQuaternion( camera.quaternion );
  desktopEuler.y -= deltaX * mouseRotateFactor;
  desktopEuler.x -= deltaY * mouseRotateFactor;
  desktopEuler.x = THREE.MathUtils.clamp( desktopEuler.x, - Math.PI / 2 + 0.05, Math.PI / 2 - 0.05 );

  camera.quaternion.setFromEuler( desktopEuler );
  camera.updateMatrixWorld( true );

}

function moveCameraForward( distance ) {

  tempDirection.set( 0, 0, - 1 ).applyQuaternion( camera.quaternion ).normalize();
  camera.position.addScaledVector( tempDirection, distance );
  camera.updateMatrixWorld( true );

}

function moveCameraRight( distance ) {

  tempRight.set( 1, 0, 0 ).applyQuaternion( camera.quaternion ).normalize();
  camera.position.addScaledVector( tempRight, distance );
  camera.updateMatrixWorld( true );

}

function updateKeyboardMovement( deltaSeconds ) {

  const keyboardBlockedByPointer =
    desktopState.mode === 'object' ||
    desktopState.mode === 'pan';

  if ( renderer.xr.isPresenting || keyboardBlockedByPointer || pressedKeys.size === 0 ) {

    return;

  }

  let forward = 0;
  let right = 0;

  if ( pressedKeys.has( 'KeyW' ) ) forward += 1;
  if ( pressedKeys.has( 'KeyS' ) ) forward -= 1;
  if ( pressedKeys.has( 'KeyD' ) ) right += 1;
  if ( pressedKeys.has( 'KeyA' ) ) right -= 1;

  if ( forward === 0 && right === 0 ) {

    return;

  }

  const distance = keyboardMoveSpeed * deltaSeconds;

  if ( forward !== 0 ) {

    moveCameraForward( forward * distance );

  }

  if ( right !== 0 ) {

    moveCameraRight( right * distance );

  }

}

function updateDesktopHover() {

  if ( renderer.xr.isPresenting || desktopState.mode !== null ) {

    return;

  }

  const intersections = getDesktopIntersections();
  desktopState.hovered = intersections[ 0 ]?.object ?? null;
  renderer.domElement.style.cursor = desktopState.hovered ? 'grab' : 'default';

}

function releaseDesktopInteraction() {

  if ( desktopState.mode === 'object' && desktopState.selected ) {

    desktopState.selected.userData.grabbedBy = null;

  }

  desktopState.mode = null;
  desktopState.selected = null;
  desktopState.activePointerId = null;
  renderer.domElement.style.cursor = desktopState.hovered ? 'grab' : 'default';

}

function onPointerDown( event ) {

  if ( renderer.xr.isPresenting ) {

    return;

  }

  if ( event.button !== 0 && event.button !== 2 ) {

    return;

  }

  setPointerFromEvent( event );
  desktopState.activePointerId = event.pointerId;
  desktopState.lastPointer.set( event.clientX, event.clientY );

  if ( event.button === 2 ) {

    desktopState.mode = 'rotate';
    renderer.domElement.setPointerCapture( event.pointerId );
    renderer.domElement.style.cursor = 'grabbing';
    return;

  }

  const intersections = getDesktopIntersections();

  if ( intersections.length > 0 ) {

    const hit = intersections[ 0 ];
    desktopState.mode = 'object';
    desktopState.selected = hit.object;
    desktopState.hovered = hit.object;
    hit.object.userData.grabbedBy = desktopGrabber;

    camera.getWorldDirection( dragNormal );
    desktopState.dragPlane.setFromNormalAndCoplanarPoint( dragNormal, hit.object.position );
    desktopState.dragOffset.copy( hit.object.position ).sub( hit.point );

    renderer.domElement.setPointerCapture( event.pointerId );
    renderer.domElement.style.cursor = 'grabbing';
    return;

  }

  desktopState.mode = 'pan';
  renderer.domElement.setPointerCapture( event.pointerId );
  renderer.domElement.style.cursor = 'grabbing';

}

function onPointerMove( event ) {

  if ( renderer.xr.isPresenting ) {

    return;

  }

  setPointerFromEvent( event );

  if ( desktopState.activePointerId !== event.pointerId || desktopState.mode === null ) {

    updateDesktopHover();
    return;

  }

  const deltaX = event.clientX - desktopState.lastPointer.x;
  const deltaY = event.clientY - desktopState.lastPointer.y;
  desktopState.lastPointer.set( event.clientX, event.clientY );

  if ( desktopState.mode === 'object' && desktopState.selected ) {

    camera.updateMatrixWorld( true );
    raycaster.setFromCamera( pointer, camera );

    if ( raycaster.ray.intersectPlane( desktopState.dragPlane, dragPoint ) ) {

      desktopState.selected.position.copy( dragPoint ).add( desktopState.dragOffset );

    }

    return;

  }

  if ( desktopState.mode === 'pan' ) {

    panDesktopCamera( deltaX, deltaY );
    return;

  }

  if ( desktopState.mode === 'rotate' ) {

    rotateDesktopCamera( deltaX, deltaY );

  }

}

function onPointerUp( event ) {

  if ( desktopState.activePointerId !== event.pointerId ) {

    return;

  }

  if ( renderer.domElement.hasPointerCapture( event.pointerId ) ) {

    renderer.domElement.releasePointerCapture( event.pointerId );

  }

  releaseDesktopInteraction();
  updateDesktopHover();

}

function onPointerLeave() {

  if ( renderer.xr.isPresenting || desktopState.mode !== null ) {

    return;

  }

  desktopState.hovered = null;
  renderer.domElement.style.cursor = 'default';

}

function onPointerCancel() {

  if ( desktopState.activePointerId !== null && renderer.domElement.hasPointerCapture( desktopState.activePointerId ) ) {

    renderer.domElement.releasePointerCapture( desktopState.activePointerId );

  }

  releaseDesktopInteraction();
  desktopState.hovered = null;
  renderer.domElement.style.cursor = 'default';

}

function onKeyDown( event ) {

  if ( renderer.xr.isPresenting ) {

    return;

  }

  if ( event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD' ) {

    pressedKeys.add( event.code );
    event.preventDefault();

  }

}

function onKeyUp( event ) {

  pressedKeys.delete( event.code );

}

function onWindowBlur() {

  pressedKeys.clear();
  onPointerCancel();

}

function onWheel( event ) {

  if ( renderer.xr.isPresenting ) {

    return;

  }

  const direction = Math.sign( event.deltaY );

  if ( direction === 0 ) {

    return;

  }

  moveCameraForward( - direction * wheelMoveStep );
  event.preventDefault();

}

function startXRObjectGrab( controller, object ) {

  object.userData.grabbedBy = controller;
  controller.attach( object );
  controller.userData.selected = object;
  controller.userData.mode = 'object';
  controller.userData.hovered = null;

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

function releaseControllerAction( controller ) {

  if ( controller.userData.mode === 'object' ) {

    releaseControllerObject( controller );

  }

  controller.userData.mode = null;
  controller.userData.hovered = null;

  const cursor = controller.getObjectByName( 'cursor' );
  if ( cursor ) {

    cursor.visible = false;

  }

}

function releaseAllXRControllerActions() {

  for ( const controller of controllers ) {

    releaseControllerAction( controller );

  }

}

function buildController( index ) {

  const controller = renderer.xr.getController( index );
  controller.userData.index = index;
  controller.userData.mode = null;
  controller.userData.selected = null;
  controller.userData.hovered = null;
  controller.addEventListener( 'disconnected', () => releaseControllerAction( controller ) );

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

  if ( ! renderer.xr.isPresenting ) {

    return;

  }

  const intersections = getXRIntersections( controller );

  if ( intersections.length === 0 ) {

    return;

  }

  startXRObjectGrab( controller, intersections[ 0 ].object );

}

function onSelectEnd( event ) {

  releaseControllerAction( event.target );

}

function updateControllerState( controller ) {

  const line = controller.getObjectByName( 'ray' );
  const cursor = controller.getObjectByName( 'cursor' );

  if ( ! renderer.xr.isPresenting ) {

    controller.userData.hovered = null;
    controller.userData.mode = null;
    line.scale.z = defaultRayLength;
    cursor.visible = false;
    return;

  }

  if ( controller.userData.mode === 'object' ) {

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

  const deltaSeconds = Math.min( clock.getDelta(), 0.05 );
  updateKeyboardMovement( deltaSeconds );

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

  releaseDesktopInteraction();
  desktopState.hovered = null;
  renderer.domElement.style.cursor = 'default';

  resetCameraForXRSession();

  const blendMode = renderer.xr.getEnvironmentBlendMode();
  const isPassthroughStyle = blendMode === 'alpha-blend' || blendMode === 'additive';

  setPresentationMode( isPassthroughStyle ? 'immersive-ar' : 'immersive-vr' );

  if ( isPassthroughStyle ) {

    void alignARViewToFloor();

  }

} );

renderer.xr.addEventListener( 'sessionend', () => {

  releaseAllXRControllerActions();
  flattenXRToDesktopCamera();
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
window.addEventListener( 'blur', onWindowBlur );
window.addEventListener( 'keydown', onKeyDown );
window.addEventListener( 'keyup', onKeyUp );
renderer.domElement.addEventListener( 'contextmenu', ( event ) => event.preventDefault() );
renderer.domElement.addEventListener( 'pointerdown', onPointerDown );
renderer.domElement.addEventListener( 'pointermove', onPointerMove );
renderer.domElement.addEventListener( 'pointerup', onPointerUp );
renderer.domElement.addEventListener( 'pointercancel', onPointerCancel );
renderer.domElement.addEventListener( 'pointerleave', onPointerLeave );
renderer.domElement.addEventListener( 'wheel', onWheel, { passive: false } );
renderer.setAnimationLoop( animate );
