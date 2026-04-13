function hashSeedToUint32( seed ) {

  const text = String( seed ?? '0' );
  let hash = 2166136261;

  for ( let index = 0; index < text.length; index += 1 ) {

    hash ^= text.charCodeAt( index );
    hash = Math.imul( hash, 16777619 );

  }

  return hash >>> 0;

}

export function normalizeSeed( value, fallbackValue = 'seed-1' ) {

  if ( typeof value === 'number' && Number.isFinite( value ) ) {

    return String( Math.floor( Math.abs( value ) ) );

  }

  if ( typeof value === 'string' && value.trim().length > 0 ) {

    return value.trim();

  }

  return String( fallbackValue );

}

export function createSeededRandom( seed ) {

  let state = hashSeedToUint32( normalizeSeed( seed ) );

  return function seededRandom() {

    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
    t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
    return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

  };

}

export function randomBetween( random, minValue, maxValue ) {

  return minValue + ( maxValue - minValue ) * random();

}
