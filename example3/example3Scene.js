import * as THREE from 'three';
import { createTextSprite } from '../scenes/core/textSprite.js';

export const example3SceneDefinition = Object.freeze( {
  sceneKey: 'example3',
  queryValue: '3',
  label: 'Example 3 Placeholder',
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
  createScene( context ) {

    const root = new THREE.Group();
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry( 1.6, 0.9 ),
      new THREE.MeshStandardMaterial( {
        color: 0x132031,
        emissive: 0x07111a,
        roughness: 0.84,
        metalness: 0.04,
      } ),
    );
    panel.position.set( 0, 1.35, - 1.6 );
    root.add( panel );

    const title = createTextSprite( {
      text: 'Example 3 Placeholder',
      worldHeight: 0.24,
      fontSize: 58,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgba(0, 0, 0, 0)',
      borderWidth: 0,
    } );
    title.sprite.position.set( 0, 1.47, - 1.59 );
    root.add( title.sprite );

    const subtitle = createTextSprite( {
      text: 'Reserved for a future\nscene-authoring example',
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
          <section style="display:flex;flex-direction:column;gap:12px;padding:16px 18px;border:1px solid rgba(255,255,255,0.12);border-radius:16px;background:rgba(8,12,20,0.82);backdrop-filter:blur(12px);box-shadow:0 18px 44px rgba(0,0,0,0.3);">
            <h2 style="margin:0;font-size:1.02rem;font-weight:700;color:#f4f8ff;">Example 3 Placeholder</h2>
            <p style="margin:0;font-size:0.92rem;line-height:1.5;color:rgba(238,243,255,0.86);">This reserved slot stays intentionally lightweight so future scene-authoring work can drop in a third demo without changing the package scaffolding.</p>
            <p style="margin:0;font-size:0.86rem;line-height:1.45;color:rgba(238,243,255,0.74);">No dataset or scene-specific replay state is active yet.</p>
          </section>
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
          title: 'Example 3 Placeholder',
          body: 'This placeholder scene keeps the third URL slot reserved for a future XR demonstration.',
          note: 'Replace this module with real content later without changing the public `?scene=3` embedding URL.',
        };

      },
    };

  },
} );
