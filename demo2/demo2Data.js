const NODES_URL = new URL( './data/demo2Nodes.json', import.meta.url );
const FLOWS_URL = new URL( './data/demo2Flows.csv', import.meta.url );
const BOUNDARIES_URL = new URL( './data/geo/world-atlas-countries-110m.json', import.meta.url );

export const DEMO2_REQUIRED_DATA_FILES = Object.freeze( [
  'demo2/data/demo2Nodes.json',
  'demo2/data/demo2Flows.csv',
  'demo2/data/geo/world-atlas-countries-110m.json',
] );

let datasetPromise = null;

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

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function createDatasetError( message, cause = null ) {

  const error = new Error( message );
  error.expectedDataFiles = DEMO2_REQUIRED_DATA_FILES;

  if ( cause ) {

    error.cause = cause;

  }

  return error;

}

async function fetchRequiredJson( url, label ) {

  const response = await fetch( url );

  if ( ! response.ok ) {

    throw createDatasetError( `Unable to load ${label} (${response.status}).` );

  }

  return response.json();

}

async function fetchRequiredText( url, label ) {

  const response = await fetch( url );

  if ( ! response.ok ) {

    throw createDatasetError( `Unable to load ${label} (${response.status}).` );

  }

  return response.text();

}

function getNodeStockValue( node, year ) {

  const rawValue = node?.stockByYear?.[ String( year ) ];
  const numericValue = Number.parseFloat( rawValue );
  return isFiniteNumber( numericValue ) ? numericValue : 0;

}

export async function loadDemo2Dataset() {

  if ( datasetPromise ) {

    return datasetPromise;

  }

  datasetPromise = Promise.all( [
    fetchRequiredJson( NODES_URL, 'demo2Nodes.json' ),
    fetchRequiredText( FLOWS_URL, 'demo2Flows.csv' ),
    fetchRequiredJson( BOUNDARIES_URL, 'world-atlas-countries-110m.json' ),
  ] ).then( ( [ rawNodes, rawFlowsCsv, boundaryTopology ] ) => {

    if ( ! Array.isArray( rawNodes ) || rawNodes.length === 0 ) {

      throw createDatasetError( 'demo2Nodes.json is empty or invalid.' );

    }

    const nodeList = rawNodes
      .filter( ( node ) => typeof node?.id === 'string' && node.id.trim().length === 3 )
      .map( ( node ) => ( {
        id: node.id.trim().toUpperCase(),
        name: typeof node.name === 'string' && node.name.trim().length > 0 ? node.name.trim() : node.id.trim().toUpperCase(),
        lat: Number.parseFloat( node.lat ),
        lon: Number.parseFloat( node.lon ),
        region: typeof node.region === 'string' && node.region.trim().length > 0 ? node.region.trim() : 'Other',
        stockByYear: typeof node.stockByYear === 'object' && node.stockByYear !== null ? node.stockByYear : {},
      } ) )
      .filter( ( node ) => isFiniteNumber( node.lat ) && isFiniteNumber( node.lon ) );

    const nodeById = new Map( nodeList.map( ( node ) => [ node.id, node ] ) );

    const parsedFlows = parseCsv( rawFlowsCsv );
    const flowList = parsedFlows.rows
      .map( ( row ) => {

        const year = Number.parseInt( row.year, 10 );
        const value = Number.parseFloat( row.value );
        const originId = row.originId?.trim().toUpperCase();
        const destinationId = row.destinationId?.trim().toUpperCase();
        const originNode = nodeById.get( originId );
        const destinationNode = nodeById.get( destinationId );

        if ( ! originNode || ! destinationNode || ! isFiniteNumber( year ) || ! isFiniteNumber( value ) ) {

          return null;

        }

        return {
          flowId: typeof row.flowId === 'string' && row.flowId.trim().length > 0
            ? row.flowId.trim()
            : `${year}:${originId}->${destinationId}`,
          year,
          originId,
          destinationId,
          value,
          originName: originNode.name,
          destinationName: destinationNode.name,
          label: `${originNode.name} -> ${destinationNode.name}`,
        };

      } )
      .filter( Boolean );

    const supportedYears = [ ...new Set( flowList.map( ( flow ) => flow.year ) ) ].sort( ( valueA, valueB ) => valueA - valueB );
    const flowListByYear = new Map();
    const flowById = new Map( flowList.map( ( flow ) => [ flow.flowId, flow ] ) );

    supportedYears.forEach( ( year ) => {

      flowListByYear.set(
        year,
        flowList
          .filter( ( flow ) => flow.year === year )
          .sort( ( flowA, flowB ) => flowB.value - flowA.value ),
      );

    } );

    const stockDomainByYear = new Map();

    supportedYears.forEach( ( year ) => {

      const values = nodeList.map( ( node ) => getNodeStockValue( node, year ) ).filter( ( value ) => value > 0 );
      stockDomainByYear.set( year, {
        min: values.length > 0 ? Math.min( ...values ) : 1,
        max: values.length > 0 ? Math.max( ...values ) : 1,
      } );

    } );

    return Object.freeze( {
      nodeList: Object.freeze( nodeList ),
      nodeById,
      flowList: Object.freeze( flowList ),
      flowById,
      flowListByYear,
      supportedYears: Object.freeze( supportedYears ),
      stockDomainByYear,
      initialYear: supportedYears.includes( 2024 ) ? 2024 : supportedYears.at( - 1 ),
      defaultFocusedCountryId: 'AFG',
      maxFlowValue: flowList.reduce( ( maxValue, flow ) => Math.max( maxValue, flow.value ), 0 ),
      boundaryTopology,
    } );

  } ).catch( ( error ) => {

    datasetPromise = null;

    if ( error?.expectedDataFiles ) {

      throw error;

    }

    throw createDatasetError( 'Demo 2 could not load its local migration bundle.', error );

  } );

  return datasetPromise;

}
