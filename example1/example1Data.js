const csvAssetUrl = new URL( './data/per-capita-energy-stacked.csv', import.meta.url );
const metadataAssetUrl = new URL( './data/per-capita-energy-stacked.metadata.json', import.meta.url );

export const EXAMPLE1_COUNTRIES = Object.freeze( [
  'United States',
  'China',
  'India',
  'Germany',
  'France',
  'Brazil',
] );

export const EXAMPLE1_SOURCES = Object.freeze( [
  'Coal',
  'Oil',
  'Gas',
  'Nuclear',
  'Hydropower',
  'Wind',
  'Solar',
  'Other renewables',
] );

export const EXAMPLE1_SOURCE_COLORS = Object.freeze( {
  Coal: '#596474',
  Oil: '#b06b54',
  Gas: '#d99a59',
  Nuclear: '#d6c372',
  Hydropower: '#5c87d4',
  Wind: '#77bfd9',
  Solar: '#f0b74a',
  'Other renewables': '#7dbb97',
} );

const SOURCE_METADATA_KEYS = Object.freeze( {
  Coal: 'Coal per capita (kWh)',
  Oil: 'Oil per capita (kWh)',
  Gas: 'Gas per capita (kWh)',
  Nuclear: 'Nuclear per capita (kWh - equivalent)',
  Hydropower: 'Hydro per capita (kWh - equivalent)',
  Wind: 'Wind per capita (kWh - equivalent)',
  Solar: 'Solar per capita (kWh - equivalent)',
  'Other renewables': 'Other renewables per capita (kWh - equivalent)',
} );

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

    return [];

  }

  const headers = splitCsvLine( lines[ 0 ] ).map( ( header ) => header.trim() );

  return lines.slice( 1 ).map( ( line ) => {

    const values = splitCsvLine( line );
    const row = {};

    headers.forEach( ( header, index ) => {

      row[ header ] = values[ index ] ?? '';

    } );

    return row;

  } );

}

function buildDatumKey( year, country, source ) {

  return `${year}|${country}|${source}`;

}

function buildSourceDescriptions( metadataColumns ) {

  return Object.fromEntries(
    EXAMPLE1_SOURCES.map( ( source ) => {

      const metadataKey = SOURCE_METADATA_KEYS[ source ];
      const metadata = metadataColumns?.[ metadataKey ];

      return [
        source,
        {
          title: stripMarkdown( metadata?.titleShort || source ),
          description: stripMarkdown( metadata?.descriptionShort || '' ),
          unit: stripMarkdown( metadata?.shortUnit || metadata?.unit || 'kWh' ),
        },
      ];

    } ),
  );

}

export function getExample1AssetUrls() {

  return {
    csvUrl: csvAssetUrl.toString(),
    metadataUrl: metadataAssetUrl.toString(),
  };

}

export async function loadExample1Dataset() {

  if ( datasetPromise ) {

    return datasetPromise;

  }

  datasetPromise = Promise.all( [
    fetch( csvAssetUrl ),
    fetch( metadataAssetUrl ),
  ] ).then( async ( [ csvResponse, metadataResponse ] ) => {

    if ( ! csvResponse.ok ) {

      throw new Error( `Unable to load Example 1 CSV (${csvResponse.status}).` );

    }

    if ( ! metadataResponse.ok ) {

      throw new Error( `Unable to load Example 1 metadata (${metadataResponse.status}).` );

    }

    const csvText = await csvResponse.text();
    const metadata = await metadataResponse.json();
    const parsedRows = parseCsv( csvText );
    const countrySet = new Set( EXAMPLE1_COUNTRIES );
    const years = new Set();
    const valueLookup = new Map();
    let maxValue = 0;

    for ( const row of parsedRows ) {

      const country = row.Entity?.trim();
      const year = Number.parseInt( row.Year, 10 );

      if ( ! countrySet.has( country ) || ! Number.isFinite( year ) ) {

        continue;

      }

      years.add( year );

      for ( const source of EXAMPLE1_SOURCES ) {

        const rawValue = Number.parseFloat( row[ source ] );
        const value = Number.isFinite( rawValue ) ? Math.max( 0, rawValue ) : 0;
        valueLookup.set( buildDatumKey( year, country, source ), value );
        maxValue = Math.max( maxValue, value );

      }

    }

    const orderedYears = [ ...years ].sort( ( yearA, yearB ) => yearA - yearB );
    const initialYear = orderedYears.at( - 1 ) ?? 0;
    const sourceDescriptions = buildSourceDescriptions( metadata?.columns );
    const chartSubtitle = stripMarkdown( metadata?.chart?.subtitle || '' );
    const chartCitation = stripMarkdown( metadata?.chart?.citation || '' );
    const unit = sourceDescriptions.Coal?.unit || 'kWh';

    return {
      csvUrl: csvAssetUrl.toString(),
      metadataUrl: metadataAssetUrl.toString(),
      metadata,
      years: orderedYears,
      countries: [ ...EXAMPLE1_COUNTRIES ],
      sources: [ ...EXAMPLE1_SOURCES ],
      initialYear,
      maxValue: Math.max( maxValue, 1 ),
      title: stripMarkdown( metadata?.chart?.title || 'Per capita primary energy consumption by source' ),
      subtitle: chartSubtitle,
      citation: chartCitation,
      chartUrl: metadata?.chart?.originalChartUrl || '',
      unit,
      sourceDescriptions,
      getValue( year, country, source ) {

        return valueLookup.get( buildDatumKey( year, country, source ) ) || 0;

      },
    };

  } );

  return datasetPromise;

}
