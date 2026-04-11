import { DEMO3_DEFAULT_TASK_ID } from './demo3Conditions.js';

export const DEMO3_TASKS = Object.freeze( {
  'strongest-life-increase': Object.freeze( {
    id: 'strongest-life-increase',
    shortLabel: 'Regional Gain',
    prompt: 'Arrange the workspace to compare the regional views. Which world region shows the strongest life-expectancy increase from 2000 to the latest available year?',
    hint: 'Select the region, then submit from the summary view or desktop panel.',
    expectedAnswerId: 'region:africa',
    expectedAnswerLabel: 'Africa',
  } ),
} );

export function getDemo3Task( taskId = DEMO3_DEFAULT_TASK_ID ) {

  return DEMO3_TASKS[ taskId ] || DEMO3_TASKS[ DEMO3_DEFAULT_TASK_ID ];

}
