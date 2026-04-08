const GDP_CSV_URL = new URL( './data/gdp-per-capita-worldbank.csv', import.meta.url );
const GDP_METADATA_URL = new URL( './data/gdp-per-capita-worldbank.metadata.json', import.meta.url );
const LIFE_CSV_URL = new URL( './data/life-expectancy.csv', import.meta.url );
const LIFE_METADATA_URL = new URL( './data/life-expectancy.metadata.json', import.meta.url );
const CO2_CSV_URL = new URL( './data/co-emissions-per-capita.csv', import.meta.url );
const CO2_METADATA_URL = new URL( './data/co-emissions-per-capita.metadata.json', import.meta.url );
const POPULATION_CSV_URL = new URL( './data/population-unwpp.csv', import.meta.url );
const POPULATION_METADATA_URL = new URL( './data/population-unwpp.metadata.json', import.meta.url );

export const DEMO1_REQUIRED_DATA_FILES = Object.freeze( [
  'demo1/data/gdp-per-capita-worldbank.csv',
  'demo1/data/gdp-per-capita-worldbank.metadata.json',
  'demo1/data/life-expectancy.csv',
  'demo1/data/life-expectancy.metadata.json',
  'demo1/data/co-emissions-per-capita.csv',
  'demo1/data/co-emissions-per-capita.metadata.json',
] );

export const DEMO1_OPTIONAL_DATA_FILES = Object.freeze( [
  'demo1/data/population-unwpp.csv',
  'demo1/data/population-unwpp.metadata.json',
] );

const REGION_FALLBACK = 'Other';
const CO2_LOG_MIN = 0.001;
const GDP_LOG_MIN = 100;

let datasetPromise = null;

function stripMarkdown( value = '' ) {

  return value
    .replace( /\[([^\]]+)\]\(([^)]+)\)/g, '$1' )
    .replace( /[`*_>#]/g, '' )
    .replace( /\s+/g, ' ' )
    .trim();

}

function splitCsvLine( line ) {

  const fields = [];
  let currentField = '';
  let isInsideQuotes = false;

  for ( let index = 0; index < line.length; index += 1 ) {

    const character = line[ index ];
    const nextCharacter = line[ index + 1 ];

    if ( character === '"' ) {

      if ( isInsideQuotes && nextCharacter === '"' ) {

        currentField += '"';
        index += 1;
        continue;

      }

      isInsideQuotes = ! isInsideQuotes;
      continue;

    }

    if ( character === ',' && ! isInsideQuotes ) {

      fields.push( currentField );
      currentField = '';
      continue;

    }

    currentField += character;

  }

  fields.push( currentField );
  return fields;

}

function parseCsv( csvText ) {

  const lines = csvText
    .replace( /^\uFEFF/, '' )
    .split( /\r?\n/ )
    .filter( ( line ) => line.trim().length > 0 );

  if ( lines.length === 0 ) {

    return { rows: [], headers: [] };

  }

  const headers = splitCsvLine( lines[ 0 ] ).map( ( header ) => header.trim() );
  const rows = lines.slice( 1 ).map( ( line ) => {

    const values = splitCsvLine( line );
    const row = {};

    headers.forEach( ( header, index ) => {

      row[ header ] = values[ index ] ?? '';

    } );

    return row;

  } );

  return { rows, headers };

}

function buildKey( code, year ) {

  return `${code}|${year}`;

}

function parseNumericCsvRows( csvRows, {
  valueColumn,
  regionColumn = null,
} = {} ) {

  const rowsByKey = new Map();

  for ( const row of csvRows ) {

    const entity = row.Entity?.trim();
    const code = row.Code?.trim();
    const year = Number.parseInt( row.Year, 10 );
    const value = Number.parseFloat( row[ valueColumn ] );

    if ( ! entity || ! code || code.length !== 3 || ! Number.isFinite( year ) || ! Number.isFinite( value ) ) {

      continue;

    }

    rowsByKey.set( buildKey( code, year ), {
      entity,
      code,
      year,
      value,
      region: regionColumn ? ( row[ regionColumn ]?.trim() || REGION_FALLBACK ) : null,
    } );

  }

  return rowsByKey;

}

function createDatasetError( message, cause = null ) {

  const error = new Error( message );
  error.expectedDataFiles = DEMO1_REQUIRED_DATA_FILES;

  if ( cause ) {

    error.cause = cause;

  }

  return error;

}

function getIncomeTier( gdpPerCapita ) {

  if ( gdpPerCapita < 5000 ) {

    return '<5000';

  }

  if ( gdpPerCapita < 15000 ) {

    return '5000-15000';

  }

  if ( gdpPerCapita < 30000 ) {

    return '15000-30000';

  }

  return '>=30000';

}

function transformGdp( value ) {

  return Math.log10( Math.max( GDP_LOG_MIN, value ) );

}

function transformCo2( value ) {

  return Math.log10( Math.max( CO2_LOG_MIN, value ) );

}

function getDomain( values, fallback = [ 0, 1 ] ) {

  if ( values.length === 0 ) {

    return { min: fallback[ 0 ], max: fallback[ 1 ] };

  }

  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  values.forEach( ( value ) => {

    minValue = Math.min( minValue, value );
    maxValue = Math.max( maxValue, value );

  } );

  if ( ! Number.isFinite( minValue ) || ! Number.isFinite( maxValue ) || minValue === maxValue ) {

    return { min: fallback[ 0 ], max: fallback[ 1 ] };

  }

  return { min: minValue, max: maxValue };

}

async function fetchRequiredText( url, label ) {

  const response = await fetch( url );

  if ( ! response.ok ) {

    throw createDatasetError( `Unable to load ${label} (${response.status}).` );

  }

  return response.text();

}

async function fetchRequiredJson( url, label ) {

  const response = await fetch( url );

  if ( ! response.ok ) {

    throw createDatasetError( `Unable to load ${label} (${response.status}).` );

  }

  return response.json();

}

async function fetchOptionalText( url ) {

  try {

    const response = await fetch( url );

    if ( ! response.ok ) {

      return null;

    }

    return response.text();

  } catch {

    return null;

  }

}

async function fetchOptionalJson( url ) {

  try {

    const response = await fetch( url );

    if ( ! response.ok ) {

      return null;

    }

    return response.json();

  } catch {

    return null;

  }

}

export function getDemo1ExpectedDataFiles() {

  return {
    required: [ ...DEMO1_REQUIRED_DATA_FILES ],
    optional: [ ...DEMO1_OPTIONAL_DATA_FILES ],
  };

}

export async function loadDemo1Dataset() {

  if ( datasetPromise ) {

    return datasetPromise;

  }

  datasetPromise = Promise.all( [
    fetchRequiredText( GDP_CSV_URL, 'Demo 1 GDP CSV' ),
    fetchRequiredJson( GDP_METADATA_URL, 'Demo 1 GDP metadata' ),
    fetchRequiredText( LIFE_CSV_URL, 'Demo 1 life expectancy CSV' ),
    fetchRequiredJson( LIFE_METADATA_URL, 'Demo 1 life expectancy metadata' ),
    fetchRequiredText( CO2_CSV_URL, 'Demo 1 CO2 CSV' ),
    fetchRequiredJson( CO2_METADATA_URL, 'Demo 1 CO2 metadata' ),
    fetchOptionalText( POPULATION_CSV_URL ),
    fetchOptionalJson( POPULATION_METADATA_URL ),
  ] ).then( ( [
    gdpCsvText,
    gdpMetadata,
    lifeCsvText,
    lifeMetadata,
    co2CsvText,
    co2Metadata,
    populationCsvText,
    populationMetadata,
  ] ) => {

    const gdpCsv = parseCsv( gdpCsvText );
    const lifeCsv = parseCsv( lifeCsvText );
    const co2Csv = parseCsv( co2CsvText );
    const populationCsv = populationCsvText ? parseCsv( populationCsvText ) : { rows: [], headers: [] };

    if ( gdpCsv.rows.length === 0 || lifeCsv.rows.length === 0 || co2Csv.rows.length === 0 ) {

      throw createDatasetError(
        'Demo 1 could not build a scatterplot dataset because one or more required CSV files were empty.',
      );

    }

    const gdpRowsByKey = parseNumericCsvRows( gdpCsv.rows, {
      valueColumn: 'GDP per capita',
      regionColumn: 'World region according to OWID',
    } );
    const lifeRowsByKey = parseNumericCsvRows( lifeCsv.rows, {
      valueColumn: lifeCsv.headers.at( - 1 ),
    } );
    const co2RowsByKey = parseNumericCsvRows( co2Csv.rows, {
      valueColumn: co2Csv.headers.at( - 1 ),
    } );
    const populationRowsByKey = populationCsv.rows.length > 0
      ? parseNumericCsvRows( populationCsv.rows, { valueColumn: populationCsv.headers.at( - 1 ) } )
      : new Map();
    const pointsByYear = new Map();
    const pointByYearAndId = new Map();
    const allPoints = [];
    const regionSet = new Set();
    const populationValues = [];

    for ( const [ key, gdpRow ] of gdpRowsByKey.entries() ) {

      const lifeRow = lifeRowsByKey.get( key );
      const co2Row = co2RowsByKey.get( key );

      if ( ! lifeRow || ! co2Row ) {

        continue;

      }

      if ( gdpRow.value <= 0 || lifeRow.value <= 0 || co2Row.value < 0 ) {

        continue;

      }

      const populationRow = populationRowsByKey.get( key );
      const point = {
        id: gdpRow.code,
        code: gdpRow.code,
        entity: gdpRow.entity,
        year: gdpRow.year,
        gdpPerCapita: gdpRow.value,
        lifeExpectancy: lifeRow.value,
        co2PerCapita: co2Row.value,
        population: populationRow && populationRow.value > 0 ? populationRow.value : null,
        region: gdpRow.region || REGION_FALLBACK,
        incomeTier: getIncomeTier( gdpRow.value ),
      };

      if ( point.population ) {

        populationValues.push( point.population );

      }

      regionSet.add( point.region );
      allPoints.push( point );

      if ( ! pointsByYear.has( point.year ) ) {

        pointsByYear.set( point.year, [] );

      }

      pointsByYear.get( point.year ).push( point );
      pointByYearAndId.set( `${point.year}|${point.id}`, point );

    }

    if ( allPoints.length === 0 ) {

      throw createDatasetError(
        'Demo 1 could not build a scatterplot dataset because the required OWID files had no shared country-year rows.',
      );

    }

    const supportedYears = [ ...pointsByYear.keys() ].sort( ( yearA, yearB ) => yearA - yearB );
    const initialYear = supportedYears.at( - 1 ) ?? 2023;
    const gdpValues = allPoints.map( ( point ) => point.gdpPerCapita );
    const lifeValues = allPoints.map( ( point ) => point.lifeExpectancy );
    const co2Values = allPoints.map( ( point ) => point.co2PerCapita );
    const transformedGdpValues = allPoints.map( ( point ) => transformGdp( point.gdpPerCapita ) );
    const transformedCo2Values = allPoints.map( ( point ) => transformCo2( point.co2PerCapita ) );

    supportedYears.forEach( ( year ) => {

      pointsByYear.get( year ).sort( ( pointA, pointB ) => pointA.entity.localeCompare( pointB.entity ) );

    } );

    return {
      demoId: 'demo1-scatterplot',
      title: 'World Development Scatterplot',
      subtitle: 'GDP per capita, life expectancy, and CO2 emissions per capita for shared country-year rows from local OWID bundles.',
      citation: [
        stripMarkdown( gdpMetadata?.chart?.citation || '' ),
        stripMarkdown( lifeMetadata?.chart?.citation || '' ),
        stripMarkdown( co2Metadata?.chart?.citation || '' ),
      ].filter( Boolean ).join( ' | ' ),
      chartUrls: Object.freeze( {
        gdp: gdpMetadata?.chart?.originalChartUrl || '',
        lifeExpectancy: lifeMetadata?.chart?.originalChartUrl || '',
        co2: co2Metadata?.chart?.originalChartUrl || '',
        population: populationMetadata?.chart?.originalChartUrl || '',
      } ),
      supportedYears,
      initialYear,
      requiredDataFiles: [ ...DEMO1_REQUIRED_DATA_FILES ],
      optionalDataFiles: [ ...DEMO1_OPTIONAL_DATA_FILES ],
      pointCount: allPoints.length,
      regionCategories: [ ...regionSet ].sort(),
      incomeTierCategories: [ '<5000', '5000-15000', '15000-30000', '>=30000' ],
      populationAvailable: populationValues.length > 0,
      domains: Object.freeze( {
        gdpPerCapita: Object.freeze( getDomain( gdpValues, [ GDP_LOG_MIN, 100000 ] ) ),
        transformedGdp: Object.freeze( getDomain( transformedGdpValues, [ 2, 5 ] ) ),
        lifeExpectancy: Object.freeze( getDomain( lifeValues, [ 20, 90 ] ) ),
        co2PerCapita: Object.freeze( getDomain( co2Values, [ 0, 20 ] ) ),
        transformedCo2: Object.freeze( getDomain( transformedCo2Values, [ - 3, 2 ] ) ),
        population: populationValues.length > 0
          ? Object.freeze( getDomain( populationValues, [ 1, 1 ] ) )
          : null,
      } ),
      axisMetadata: Object.freeze( {
        x: Object.freeze( {
          title: 'GDP per capita',
          unit: stripMarkdown( gdpMetadata?.columns?.['GDP per capita, PPP (constant 2021 international $)']?.unit || 'international-$ in 2021 prices' ),
          note: 'log scale',
        } ),
        y: Object.freeze( {
          title: 'Life expectancy',
          unit: stripMarkdown( lifeMetadata?.columns?.[ lifeCsv.headers.at( - 1 ) ]?.unit || 'years' ),
          note: '',
        } ),
        z: Object.freeze( {
          title: 'CO2 emissions per capita',
          unit: stripMarkdown( co2Metadata?.columns?.[ co2Csv.headers.at( - 1 ) ]?.unit || 'tonnes per person' ),
          note: 'log scale',
        } ),
      } ),
      getPointsForYear( year ) {

        return pointsByYear.get( year ) || [];

      },
      getPoint( year, pointId ) {

        return pointByYearAndId.get( `${year}|${pointId}` ) || null;

      },
      transformGdp,
      transformCo2,
    };

  } ).catch( ( error ) => {

    datasetPromise = null;
    throw error?.expectedDataFiles
      ? error
      : createDatasetError(
        'Demo 1 failed to load the local OWID bundle. Make sure the required files exist under demo1/data/.',
        error,
      );

  } );

  return datasetPromise;

}
