import { defaultTemplateSceneDefinition } from '../defaultTemplate/defaultTemplateScene.js';
import { demo1SceneDefinition } from '../../demo1/demo1Scene.js';
import { demo2SceneDefinition } from '../../demo2/demo2Scene.js';
import { example3SceneDefinition } from '../../example3/example3Scene.js';
import { example1SceneDefinition } from '../../example1/example1Scene.js';

const sceneDefinitions = [
  defaultTemplateSceneDefinition,
  demo1SceneDefinition,
  example1SceneDefinition,
  demo2SceneDefinition,
  example3SceneDefinition,
];

const sceneDefinitionByKey = new Map(
  sceneDefinitions.map( ( definition ) => [ definition.sceneKey, definition ] ),
);

const sceneDefinitionByQueryValue = new Map(
  sceneDefinitions
    .filter( ( definition ) => definition.queryValue !== null )
    .map( ( definition ) => [ definition.queryValue, definition ] ),
);

export function getSceneDefinitionByKey( sceneKey ) {

  return sceneDefinitionByKey.get( sceneKey ) || defaultTemplateSceneDefinition;

}

export function getAllSceneDefinitions() {

  return [ ...sceneDefinitions ];

}

export function resolveSceneDefinitionFromSearch( search = window.location.search ) {

  const searchParams = new URLSearchParams( search );
  const sceneQueryValue = searchParams.get( 'scene' );

  if ( ! sceneQueryValue ) {

    return {
      sceneDefinition: defaultTemplateSceneDefinition,
      warning: null,
    };

  }

  const sceneDefinition = sceneDefinitionByQueryValue.get( sceneQueryValue );

  if ( sceneDefinition ) {

    return {
      sceneDefinition,
      warning: null,
    };

  }

  return {
    sceneDefinition: defaultTemplateSceneDefinition,
    warning: `Unknown scene query "${sceneQueryValue}". Falling back to the default template scene.`,
  };

}
