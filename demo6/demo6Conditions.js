import { normalizeSeed } from '../scenes/core/seededRandom.js';
import { DEMO6_DEFAULT_TASK_ID } from './demo6Tasks.js';

export const DEMO6_ID = 'demo6-slice-rush';

export const DEMO6_ROUND_STATES = Object.freeze( {
  IDLE: 'idle',
  RUNNING: 'running',
  ENDED: 'ended',
} );

export const DEMO6_TARGET_TYPES = Object.freeze( {
  FRUIT: 'fruit',
  BOMB: 'bomb',
} );

export const DEMO6_TARGET_STATUSES = Object.freeze( {
  PENDING: 'pending',
  ACTIVE: 'active',
  SLICED: 'sliced',
  MISSED: 'missed',
  BOMB_HIT: 'bomb-hit',
} );

export const DEMO6_DEFAULT_ROUND_CONFIG_ID = 'standard-v1';
export const DEMO6_DEFAULT_SEED = 'slice-rush-v1';
export const DEMO6_MAX_TARGET_OUTCOMES = 80;

export const DEMO6_ROUND_CONFIGS = Object.freeze( {
  [ DEMO6_DEFAULT_ROUND_CONFIG_ID ]: Object.freeze( {
    id: DEMO6_DEFAULT_ROUND_CONFIG_ID,
    durationMs: 45000,
    targetCount: 52,
    spawnCadenceMs: 850,
    firstSpawnMs: 700,
    targetLifetimeMs: 2600,
    fruitWeight: 0.82,
    gravity: Object.freeze( [ 0, - 1.85, 0 ] ),
    spawnXRange: Object.freeze( [ - 1.2, 1.2 ] ),
    spawnYRange: Object.freeze( [ 0.42, 0.72 ] ),
    spawnZRange: Object.freeze( [ - 3.35, - 3.05 ] ),
    velocityXRange: Object.freeze( [ - 0.42, 0.42 ] ),
    velocityYRange: Object.freeze( [ 3.25, 4.45 ] ),
    velocityZRange: Object.freeze( [ - 0.18, 0.35 ] ),
    fruitRadiusRange: Object.freeze( [ 0.16, 0.22 ] ),
    bombRadius: 0.19,
  } ),
} );

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function clamp( value, minValue, maxValue ) {

  return Math.min( maxValue, Math.max( minValue, value ) );

}

function normalizeStringId( value, fallbackValue = null ) {

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallbackValue;

}

function normalizeInteger( value, fallbackValue, minValue, maxValue ) {

  const parsed = Number.parseInt( value, 10 );

  if ( Number.isFinite( parsed ) ) {

    return clamp( parsed, minValue, maxValue );

  }

  return fallbackValue;

}

function normalizeNumber( value, fallbackValue, minValue, maxValue ) {

  const numeric = Number( value );

  if ( Number.isFinite( numeric ) ) {

    return clamp( numeric, minValue, maxValue );

  }

  return fallbackValue;

}

function normalizeRoundState( value, fallbackValue = DEMO6_ROUND_STATES.IDLE ) {

  return Object.values( DEMO6_ROUND_STATES ).includes( value ) ? value : fallbackValue;

}

export function getDemo6RoundConfig( configId = DEMO6_DEFAULT_ROUND_CONFIG_ID ) {

  return DEMO6_ROUND_CONFIGS[ configId ] || DEMO6_ROUND_CONFIGS[ DEMO6_DEFAULT_ROUND_CONFIG_ID ];

}

export function normalizeDemo6RoundConfigId( value, fallbackValue = DEMO6_DEFAULT_ROUND_CONFIG_ID ) {

  return DEMO6_ROUND_CONFIGS[ value ] ? value : fallbackValue;

}

function normalizeTargetOutcome( outcome ) {

  if ( ! outcome || typeof outcome !== 'object' ) {

    return null;

  }

  const id = normalizeStringId( outcome.id, null );
  const type = Object.values( DEMO6_TARGET_TYPES ).includes( outcome.type ) ? outcome.type : null;
  const status = Object.values( DEMO6_TARGET_STATUSES ).includes( outcome.status ) ? outcome.status : null;

  if ( ! id || ! type || ! status ) {

    return null;

  }

  return {
    id,
    type,
    status,
    atMs: isFiniteNumber( outcome.atMs )
      ? Math.max( 0, Math.round( outcome.atMs ) )
      : ( isFiniteNumber( outcome.slicedAtMs ) ? Math.max( 0, Math.round( outcome.slicedAtMs ) ) : null ),
    source: normalizeStringId( outcome.source, normalizeStringId( outcome.slicedByInteractor, null ) ),
  };

}

export function parseDemo6Conditions( search = window.location.search, {
  defaultTaskId = DEMO6_DEFAULT_TASK_ID,
} = {} ) {

  const searchParams = new URLSearchParams( search );
  const roundConfigId = normalizeDemo6RoundConfigId( searchParams.get( 'config' ) );
  const roundConfig = getDemo6RoundConfig( roundConfigId );
  const parsedDuration = Number.parseInt( searchParams.get( 'duration' ), 10 );
  const durationMs = Number.isFinite( parsedDuration )
    ? clamp( parsedDuration, 10000, 120000 )
    : roundConfig.durationMs;

  return {
    demoId: DEMO6_ID,
    taskId: normalizeStringId( searchParams.get( 'task' ), defaultTaskId ),
    roundState: DEMO6_ROUND_STATES.IDLE,
    roundSeed: normalizeSeed( searchParams.get( 'seed' ), DEMO6_DEFAULT_SEED ),
    roundConfigId,
    elapsedMs: 0,
    durationMs,
    score: 0,
    combo: 0,
    comboMax: 0,
    hits: 0,
    misses: 0,
    bombHits: 0,
    accuracy: 0,
    targetOutcomes: [],
    lastEvent: 'idle',
    lastEventTargetId: null,
    lastEventAtMs: 0,
    taskAnswer: null,
    taskSubmitted: false,
  };

}

export function normalizeDemo6SceneState( candidateState, fallbackState = null, {
  defaultTaskId = DEMO6_DEFAULT_TASK_ID,
} = {} ) {

  const parsedDefaults = parseDemo6Conditions( '', { defaultTaskId } );
  const fallback = fallbackState && typeof fallbackState === 'object'
    ? fallbackState
    : parsedDefaults;
  const roundConfigId = normalizeDemo6RoundConfigId(
    candidateState?.roundConfigId,
    normalizeDemo6RoundConfigId( fallback.roundConfigId ),
  );
  const roundConfig = getDemo6RoundConfig( roundConfigId );
  const durationMs = normalizeInteger(
    candidateState?.durationMs,
    normalizeInteger( fallback.durationMs, roundConfig.durationMs, 10000, 120000 ),
    10000,
    120000,
  );
  const hits = normalizeInteger( candidateState?.hits, normalizeInteger( fallback.hits, 0, 0, 9999 ), 0, 9999 );
  const misses = normalizeInteger( candidateState?.misses, normalizeInteger( fallback.misses, 0, 0, 9999 ), 0, 9999 );
  const bombHits = normalizeInteger( candidateState?.bombHits, normalizeInteger( fallback.bombHits, 0, 0, 9999 ), 0, 9999 );
  const attempts = hits + misses + bombHits;

  return {
    demoId: normalizeStringId( candidateState?.demoId, fallback.demoId || DEMO6_ID ),
    taskId: normalizeStringId( candidateState?.taskId, fallback.taskId || defaultTaskId ),
    roundState: normalizeRoundState( candidateState?.roundState, normalizeRoundState( fallback.roundState ) ),
    roundSeed: normalizeSeed( candidateState?.roundSeed, normalizeSeed( fallback.roundSeed, DEMO6_DEFAULT_SEED ) ),
    roundConfigId,
    elapsedMs: normalizeInteger( candidateState?.elapsedMs, normalizeInteger( fallback.elapsedMs, 0, 0, durationMs ), 0, durationMs ),
    durationMs,
    score: normalizeInteger( candidateState?.score, normalizeInteger( fallback.score, 0, 0, 999999 ), 0, 999999 ),
    combo: normalizeInteger( candidateState?.combo, normalizeInteger( fallback.combo, 0, 0, 9999 ), 0, 9999 ),
    comboMax: normalizeInteger( candidateState?.comboMax, normalizeInteger( fallback.comboMax, 0, 0, 9999 ), 0, 9999 ),
    hits,
    misses,
    bombHits,
    accuracy: normalizeNumber(
      candidateState?.accuracy,
      attempts > 0 ? hits / attempts : normalizeNumber( fallback.accuracy, 0, 0, 1 ),
      0,
      1,
    ),
    targetOutcomes: Array.isArray( candidateState?.targetOutcomes )
      ? candidateState.targetOutcomes.map( normalizeTargetOutcome ).filter( Boolean ).slice( 0, DEMO6_MAX_TARGET_OUTCOMES )
      : (
          Array.isArray( candidateState?.targetResults )
            ? candidateState.targetResults.map( normalizeTargetOutcome ).filter( Boolean ).slice( 0, DEMO6_MAX_TARGET_OUTCOMES )
            : (
                Array.isArray( fallback.targetOutcomes )
                  ? fallback.targetOutcomes.map( normalizeTargetOutcome ).filter( Boolean ).slice( 0, DEMO6_MAX_TARGET_OUTCOMES )
                  : (
                      Array.isArray( fallback.targetResults )
                        ? fallback.targetResults.map( normalizeTargetOutcome ).filter( Boolean ).slice( 0, DEMO6_MAX_TARGET_OUTCOMES )
                        : []
                    )
              )
        ),
    lastEvent: normalizeStringId( candidateState?.lastEvent, fallback.lastEvent || 'idle' ),
    lastEventTargetId: normalizeStringId( candidateState?.lastEventTargetId, fallback.lastEventTargetId || null ),
    lastEventAtMs: normalizeInteger( candidateState?.lastEventAtMs, normalizeInteger( fallback.lastEventAtMs, 0, 0, durationMs ), 0, durationMs ),
    taskAnswer: isFiniteNumber( candidateState?.taskAnswer )
      ? candidateState.taskAnswer
      : ( isFiniteNumber( fallback.taskAnswer ) ? fallback.taskAnswer : null ),
    taskSubmitted: typeof candidateState?.taskSubmitted === 'boolean'
      ? candidateState.taskSubmitted
      : Boolean( fallback.taskSubmitted ),
  };

}
