import * as THREE from 'three';
import { createTextSprite } from '../scenes/core/textSprite.js';

function createPlaceholderScene( sceneLabel, bodyText ) {

  return function buildPlaceholder( context ) {

    const root = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry( 1.6, 0.9 ),
      new THREE.MeshStandardMaterial( {
        color: 0x142033,
        emissive: 0x08111f,
        roughness: 0.82,
        metalness: 0.06,
      } ),
    );
    panel.position.set( 0, 1.35, - 1.6 );
    root.add( panel );

    const title = createTextSprite( {
      text: `${sceneLabel}\nReserved For Future Work`,
      worldHeight: 0.34,
      fontSize: 66,
      backgroundColor: 'rgba(10, 16, 28, 0.0)',
      borderColor: 'rgba(255, 255, 255, 0.0)',
      borderWidth: 0,
    } );
    title.sprite.position.set( 0, 1.47, - 1.59 );
    root.add( title.sprite );

    const subtitle = createTextSprite( {
      text: bodyText,
      worldHeight: 0.2,
      fontSize: 38,
      backgroundColor: 'rgba(8, 12, 20, 0.62)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
    } );
    subtitle.sprite.position.set( 0, 1.12, - 1.58 );
    root.add( subtitle.sprite );

    return {
      activate() {

        context.sceneContentRoot.add( root );
        context.setDesktopPanelContent( `
          <h2>${sceneLabel}</h2>
          <p>${bodyText}</p>
          <p>Example data and interaction design are reserved for a future scene-authoring pass.</p>
        ` );

      },
      dispose() {

        root.removeFromParent();
        title.dispose();
        subtitle.dispose();
        context.clearDesktopPanel();

      },
      update() {},
      getSceneStateForReplay() {

        return {};

      },
      applySceneStateFromReplay() {},
      getHudContent() {

        return {
          title: sceneLabel,
          body: 'This placeholder scene reserves a slot for a future XR demonstration.',
          note: 'Use the scene registry to replace this module with real content later without changing the embedding URL format.',
        };

      },
    };

  };

}

export const example2SceneDefinition = Object.freeze( {
  sceneKey: 'example2',
  queryValue: '2',
  label: 'Example 2 Placeholder',
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
  } ),
  normalizeSceneState() {

    return {};

  },
  createScene: createPlaceholderScene(
    'Example 2 Placeholder',
    'This reserved slot keeps the multi-scene package structure stable while future demonstration content is authored.',
  ),
} );
