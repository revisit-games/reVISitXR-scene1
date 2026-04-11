const GDP_CSV_URL = new URL( './data/gdp-per-capita-worldbank.csv', import.meta.url );
const GDP_METADATA_URL = new URL( './data/gdp-per-capita-worldbank.metadata.json', import.meta.url );
const LIFE_CSV_URL = new URL( './data/life-expectancy.csv', import.meta.url );
const LIFE_METADATA_URL = new URL( './data/life-expectancy.metadata.json', import.meta.url );
const CO2_CSV_URL = new URL( './data/co-emissions-per-capita.csv', import.meta.url );
const CO2_METADATA_URL = new URL( './data/co-emissions-per-capita.metadata.json', import.meta.url );
const POPULATION_CSV_URL = new URL( './data/population-unwpp.csv', import.meta.url );
const POPULATION_METADATA_URL = new URL( './data/population-unwpp.metadata.json', import.meta.url );

export const DEMO3_REQUIRED_DATA_FILES = Object.freeze( [
  'demo3/data/gdp-per-capita-worldbank.csv',
  'demo3/data/gdp-per-capita-worldbank.metadata.json',
  'demo3/data/life-expectancy.csv',
  'demo3/data/life-expectancy.metadata.json',
  'demo3/data/co-emissions-per-capita.csv',
  'demo3/data/co-emissions-per-capita.metadata.json',
  'demo3/data/population-unwpp.csv',
  'demo3/data/population-unwpp.metadata.json',
] );

const REGION_FALLBACK = 'Other';
const START_YEAR = 2000;

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

  csvRows.forEach( ( row ) => {

    const entity = row.Entity?.trim();
    const code = row.Code?.trim();
    const year = Number.parseInt( row.Year, 10 );
    const value = Number.parseFloat( row[ valueColumn ] );

    if ( ! entity || ! code || code.length !== 3 || ! Number.isFinite( year ) || ! Number.isFinite( value ) ) {

      return;

    }

    rowsByKey.set( buildKey( code, year ), {
      entity,
      code,
      year,
      value,
      region: regionColumn ? ( row[ regionColumn ]?.trim() || REGION_FALLBACK ) : null,
    } );

  } );

  return rowsByKey;

}

function normalizeRegionId( regionName ) {

  return String( regionName || REGION_FALLBACK )
    .toLowerCase()
    .replace( /[^a-z0-9]+/g, '-' )
    .replace( /^-+|-+$/g, '' ) || 'other';

}

function createDatasetError( message, cause = null ) {

  const error = new Error( message );
  error.expectedDataFiles = DEMO3_REQUIRED_DATA_FILES;

  if ( cause ) {

    error.cause = cause;

  }

  return error;

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

function getDomain( values, fallback = [ 0, 1 ] ) {

  const finiteValues = values.filter( ( value ) => Number.isFinite( value ) );

  if ( finiteValues.length === 0 ) {

    return { min: fallback[ 0 ], max: fallback[ 1 ] };

  }

  const minValue = Math.min( ...finiteValues );
  const maxValue = Math.max( ...finiteValues );

  if ( minValue === maxValue ) {

    return { min: minValue - 1, max: maxValue + 1 };

  }

  return { min: minValue, max: maxValue };

}

function emptyAggregate( regionName ) {

  return {
    regionName,
    population: 0,
    weightedLife: 0,
    weightedGdp: 0,
    weightedCo2: 0,
    countries: new Set(),
  };

}

function finalizeAggregate( aggregate, year ) {

  const population = aggregate.population;

  if ( population <= 0 ) {

    return null;

  }

  return {
    year,
    regionName: aggregate.regionName,
    lifeExpectancy: aggregate.weightedLife / population,
    gdpPerCapita: aggregate.weightedGdp / population,
    co2PerCapita: aggregate.weightedCo2 / population,
    population,
    countryCount: aggregate.countries.size,
  };

}

function formatRegionDatumId( regionId ) {

  return `region:${regionId}`;

}

export async function loadDemo3Dataset() {

  if ( datasetPromise ) {

    return datasetPromise;

  }

  datasetPromise = Promise.all( [
    fetchRequiredText( GDP_CSV_URL, 'Demo 3 GDP CSV' ),
    fetchRequiredJson( GDP_METADATA_URL, 'Demo 3 GDP metadata' ),
    fetchRequiredText( LIFE_CSV_URL, 'Demo 3 life expectancy CSV' ),
    fetchRequiredJson( LIFE_METADATA_URL, 'Demo 3 life expectancy metadata' ),
    fetchRequiredText( CO2_CSV_URL, 'Demo 3 CO2 CSV' ),
    fetchRequiredJson( CO2_METADATA_URL, 'Demo 3 CO2 metadata' ),
    fetchRequiredText( POPULATION_CSV_URL, 'Demo 3 population CSV' ),
    fetchRequiredJson( POPULATION_METADATA_URL, 'Demo 3 population metadata' ),
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
    const populationCsv = parseCsv( populationCsvText );

    if ( gdpCsv.rows.length === 0 || lifeCsv.rows.length === 0 || co2Csv.rows.length === 0 || populationCsv.rows.length === 0 ) {

      throw createDatasetError( 'Demo 3 could not build a workspace dataset because one or more required CSV files were empty.' );

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
    const populationRowsByKey = parseNumericCsvRows( populationCsv.rows, {
      valueColumn: populationCsv.headers.at( - 1 ),
    } );
    const joinedRows = [];

    for ( const [ key, gdpRow ] of gdpRowsByKey.entries() ) {

      const lifeRow = lifeRowsByKey.get( key );
      const co2Row = co2RowsByKey.get( key );
      const populationRow = populationRowsByKey.get( key );

      if ( ! lifeRow || ! co2Row || ! populationRow || gdpRow.value <= 0 || lifeRow.value <= 0 || co2Row.value < 0 || populationRow.value <= 0 ) {

        continue;

      }

      joinedRows.push( {
        entity: gdpRow.entity,
        code: gdpRow.code,
        year: gdpRow.year,
        regionName: gdpRow.region || REGION_FALLBACK,
        lifeExpectancy: lifeRow.value,
        gdpPerCapita: gdpRow.value,
        co2PerCapita: co2Row.value,
        population: populationRow.value,
      } );

    }

    if ( joinedRows.length === 0 ) {

      throw createDatasetError( 'Demo 3 could not build a workspace dataset because the OWID files had no shared country-year rows.' );

    }

    const supportedYears = [ ...new Set( joinedRows.map( ( row ) => row.year ) ) ].sort( ( yearA, yearB ) => yearA - yearB );
    const startYear = supportedYears.includes( START_YEAR ) ? START_YEAR : supportedYears[ 0 ];
    const endYear = supportedYears.at( - 1 );
    const yearlyRegionAggregates = new Map();

    supportedYears.forEach( ( year ) => {

      const aggregatesByRegion = new Map();

      joinedRows
        .filter( ( row ) => row.year === year )
        .forEach( ( row ) => {

          if ( ! aggregatesByRegion.has( row.regionName ) ) {

            aggregatesByRegion.set( row.regionName, emptyAggregate( row.regionName ) );

          }

          const aggregate = aggregatesByRegion.get( row.regionName );
          aggregate.population += row.population;
          aggregate.weightedLife += row.lifeExpectancy * row.population;
          aggregate.weightedGdp += row.gdpPerCapita * row.population;
          aggregate.weightedCo2 += row.co2PerCapita * row.population;
          aggregate.countries.add( row.code );

        } );

      yearlyRegionAggregates.set(
        year,
        new Map(
          [ ...aggregatesByRegion.entries() ]
            .map( ( [ regionName, aggregate ] ) => [ regionName, finalizeAggregate( aggregate, year ) ] )
            .filter( ( [ , aggregate ] ) => Boolean( aggregate ) ),
        ),
      );

    } );

    const startAggregates = yearlyRegionAggregates.get( startYear ) || new Map();
    const endAggregates = yearlyRegionAggregates.get( endYear ) || new Map();
    const regionNames = [ ...startAggregates.keys() ]
      .filter( ( regionName ) => endAggregates.has( regionName ) )
      .sort();
    const regionList = regionNames.map( ( regionName ) => {

      const regionId = normalizeRegionId( regionName );
      const startAggregate = startAggregates.get( regionName );
      const endAggregate = endAggregates.get( regionName );
      const yearlySeries = supportedYears
        .filter( ( year ) => year >= startYear && year <= endYear )
        .map( ( year ) => yearlyRegionAggregates.get( year )?.get( regionName ) || null )
        .filter( Boolean );

      return Object.freeze( {
        regionId,
        datumId: formatRegionDatumId( regionId ),
        regionName,
        startLifeExpectancy: startAggregate.lifeExpectancy,
        endLifeExpectancy: endAggregate.lifeExpectancy,
        lifeExpectancyChange: endAggregate.lifeExpectancy - startAggregate.lifeExpectancy,
        latestGdpPerCapita: endAggregate.gdpPerCapita,
        latestCo2PerCapita: endAggregate.co2PerCapita,
        latestPopulation: endAggregate.population,
        countryCount: endAggregate.countryCount,
        yearlySeries: Object.freeze( yearlySeries ),
      } );

    } );
    const rankingRegionIds = regionList
      .slice()
      .sort( ( regionA, regionB ) => (
        regionB.lifeExpectancyChange - regionA.lifeExpectancyChange ||
        regionA.regionName.localeCompare( regionB.regionName )
      ) )
      .map( ( region ) => region.regionId );
    const regionById = new Map( regionList.map( ( region ) => [ region.regionId, region ] ) );
    const regionByDatumId = new Map( regionList.map( ( region ) => [ region.datumId, region ] ) );
    const strongestRegion = regionById.get( rankingRegionIds[ 0 ] ) || null;

    return Object.freeze( {
      demoId: 'demo3-analytic-workspace',
      title: 'Regional Development Workspace',
      subtitle: 'Population-weighted region summaries from local OWID country-year rows.',
      startYear,
      endYear,
      supportedYears: Object.freeze( supportedYears ),
      rowCount: joinedRows.length,
      regionList: Object.freeze( regionList ),
      regionById,
      regionByDatumId,
      rankingRegionIds: Object.freeze( rankingRegionIds ),
      expectedAnswerDatumId: strongestRegion?.datumId || null,
      requiredDataFiles: [ ...DEMO3_REQUIRED_DATA_FILES ],
      citation: [
        stripMarkdown( gdpMetadata?.chart?.citation || '' ),
        stripMarkdown( lifeMetadata?.chart?.citation || '' ),
        stripMarkdown( co2Metadata?.chart?.citation || '' ),
        stripMarkdown( populationMetadata?.chart?.citation || '' ),
      ].filter( Boolean ).join( ' | ' ),
      chartUrls: Object.freeze( {
        gdp: gdpMetadata?.chart?.originalChartUrl || '',
        lifeExpectancy: lifeMetadata?.chart?.originalChartUrl || '',
        co2: co2Metadata?.chart?.originalChartUrl || '',
        population: populationMetadata?.chart?.originalChartUrl || '',
      } ),
      domains: Object.freeze( {
        lifeExpectancy: Object.freeze( getDomain(
          regionList.flatMap( ( region ) => region.yearlySeries.map( ( yearEntry ) => yearEntry.lifeExpectancy ) ),
          [ 45, 85 ],
        ) ),
        lifeExpectancyChange: Object.freeze( getDomain(
          regionList.map( ( region ) => region.lifeExpectancyChange ),
          [ 0, 10 ],
        ) ),
        gdpPerCapita: Object.freeze( getDomain(
          regionList.map( ( region ) => Math.log10( Math.max( 100, region.latestGdpPerCapita ) ) ),
          [ 2, 5 ],
        ) ),
        co2PerCapita: Object.freeze( getDomain(
          regionList.map( ( region ) => Math.log10( Math.max( 0.001, region.latestCo2PerCapita ) ) ),
          [ - 3, 2 ],
        ) ),
      } ),
    } );

  } ).catch( ( error ) => {

    datasetPromise = null;
    throw error?.expectedDataFiles
      ? error
      : createDatasetError(
        'Demo 3 failed to load the local OWID bundle. Make sure the required files exist under demo3/data/.',
        error,
      );

  } );

  return datasetPromise;

}
