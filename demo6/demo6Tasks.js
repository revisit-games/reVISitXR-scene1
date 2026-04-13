export const DEMO6_DEFAULT_TASK_ID = 'slice-rush-score';

export const demo6Tasks = Object.freeze( {
  [ DEMO6_DEFAULT_TASK_ID ]: Object.freeze( {
    id: DEMO6_DEFAULT_TASK_ID,
    prompt: 'Play one Slice Rush round, avoid bombs, and submit your final score.',
    expectedAnswerType: 'score',
  } ),
} );

export function getDemo6Task( taskId = DEMO6_DEFAULT_TASK_ID ) {

  return demo6Tasks[ taskId ] || demo6Tasks[ DEMO6_DEFAULT_TASK_ID ];

}
