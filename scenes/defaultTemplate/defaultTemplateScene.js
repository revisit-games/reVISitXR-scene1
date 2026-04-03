import { PRESENTATION_MODES } from '../../logging/xrLoggingSchema.js';

function getTemplateHudContent( presentationMode ) {

  if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

    return {
      title: 'Default Template Scene',
      body: 'Point at the template cube with either controller and hold the trigger to grab it. The bright dot shows where the controller ray hits.',
      note: 'This default scene keeps the shared floor, grid, pedestal, and cube so future scene authors have a reusable XR starting point.',
    };

  }

  if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

    return {
      title: 'Default Template Scene',
      body: 'AR, VR, and desktop share the same template scene state. The cube and pedestal remain available as baseline interactables while passthrough stays visible behind the content.',
      note: 'Future scenes can inherit the same floor, grid, lighting, and template interaction defaults, then selectively turn pieces off.',
    };

  }

  return {
    title: 'Default Template Scene',
    body: 'Left drag the template cube to move it. Left drag empty space pans the camera, and right drag rotates the desktop view.',
    note: 'Use this scene as the reusable starting point for future reVISit-XR demonstrations before swapping in scene-specific content.',
  };

}

export const defaultTemplateSceneDefinition = Object.freeze( {
  sceneKey: 'default-template',
  queryValue: null,
  label: 'Default Template',
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: true,
    showTemplateCube: true,
    enableDefaultObjectManipulation: true,
  } ),
  normalizeSceneState() {

    return {};

  },
  createScene() {

    return {
      activate() {},
      dispose() {},
      update() {},
      getSceneStateForReplay() {

        return {};

      },
      applySceneStateFromReplay() {},
      getHudContent( presentationMode ) {

        return getTemplateHudContent( presentationMode );

      },
    };

  },
} );
