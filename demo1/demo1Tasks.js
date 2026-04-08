import { DEMO1_DEFAULT_TASK_ID } from './demo1Conditions.js';

export const DEMO1_TASKS = Object.freeze( {
  'target-a': Object.freeze( {
    id: 'target-a',
    shortLabel: 'Named Target',
    prompt: 'Find and select India in the scatterplot, then submit your answer.',
    hint: 'Use the tooltip to confirm the country label before submitting.',
    expectedAnswerId: 'IND',
  } ),
  'target-b': Object.freeze( {
    id: 'target-b',
    shortLabel: 'Relative Position',
    prompt: 'Which country sits farther right in the plot: India or the United States? Select that country, then submit.',
    hint: 'Farther right means higher GDP per capita on the x-axis.',
    expectedAnswerId: 'USA',
  } ),
  'target-c': Object.freeze( {
    id: 'target-c',
    shortLabel: 'Overview Search',
    prompt: 'Use the overview to locate South Africa, select it, then submit your answer.',
    hint: 'This task is meant to showcase overview-assisted spatial search.',
    expectedAnswerId: 'ZAF',
  } ),
} );

export function getDemo1Task( taskId = DEMO1_DEFAULT_TASK_ID ) {

  return DEMO1_TASKS[ taskId ] || DEMO1_TASKS[ DEMO1_DEFAULT_TASK_ID ];

}
