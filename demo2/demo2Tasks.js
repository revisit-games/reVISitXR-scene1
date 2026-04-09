import { DEMO2_DEFAULT_TASK_ID } from './demo2Conditions.js';

export const DEMO2_TASKS = Object.freeze( {
  'afg-strongest-outbound': Object.freeze( {
    id: 'afg-strongest-outbound',
    shortLabel: 'Outbound Route',
    prompt: 'Find the strongest outbound destination from Afghanistan in the current year and submit the selected route.',
    hint: 'Use year, threshold, and direction controls to inspect the arcs before submitting.',
    defaultFocusedCountryId: 'AFG',
  } ),
} );

export function getDemo2Task( taskId = DEMO2_DEFAULT_TASK_ID ) {

  return DEMO2_TASKS[ taskId ] || DEMO2_TASKS[ DEMO2_DEFAULT_TASK_ID ];

}
