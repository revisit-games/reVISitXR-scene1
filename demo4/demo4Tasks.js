export const DEMO4_DEFAULT_TASK_ID = 'midday-highest-co2';

export const demo4Tasks = Object.freeze( {
  [ DEMO4_DEFAULT_TASK_ID ]: Object.freeze( {
    id: DEMO4_DEFAULT_TASK_ID,
    prompt: 'At midday, using the CO2 metric, which site has the highest reading?',
    hint: 'Switch to Midday and CO2, then compare the anchored site markers.',
    expectedAnswerId: 'site:classroom',
  } ),
} );

export function getDemo4Task( taskId = DEMO4_DEFAULT_TASK_ID ) {

  return demo4Tasks[ taskId ] || demo4Tasks[ DEMO4_DEFAULT_TASK_ID ];

}
