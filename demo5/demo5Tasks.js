export const DEMO5_DEFAULT_TASK_ID = 'tallest-landmark';

export const demo5Tasks = Object.freeze( {
  [ DEMO5_DEFAULT_TASK_ID ]: Object.freeze( {
    id: DEMO5_DEFAULT_TASK_ID,
    prompt: 'Which landmark is tallest?',
    hint: 'Compare the authored scale views, then select and submit the tallest landmark.',
    expectedAnswerId: 'burj_khalifa',
  } ),
} );

export function getDemo5Task( taskId = DEMO5_DEFAULT_TASK_ID ) {

  return demo5Tasks[ taskId ] || demo5Tasks[ DEMO5_DEFAULT_TASK_ID ];

}
