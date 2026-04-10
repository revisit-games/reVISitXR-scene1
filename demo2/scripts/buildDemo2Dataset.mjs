import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { demo2DatasetSelectionConfig } from '../config/demo2DatasetSelectionConfig.mjs';
import { demo2CountryMetadata } from '../config/demo2CountryMetadata.mjs';

const __dirname = path.dirname( fileURLToPath( import.meta.url ) );
const demo2Dir = path.resolve( __dirname, '..' );
const flowRawPath = path.join( demo2Dir, 'data/raw/owid-migration-flows-export.csv' );
const stockRawPath = path.join( demo2Dir, 'data/raw/owid-migrant-stock-total.csv' );
const nodesOutputPath = path.join( demo2Dir, 'data/demo2Nodes.json' );
const flowsOutputPath = path.join( demo2Dir, 'data/demo2Flows.csv' );

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

function normalizeCode( value ) {

  return typeof value === 'string' && value.trim().length === 3
    ? value.trim().toUpperCase()
    : null;

}

function normalizeYear( value ) {

  const numericValue = Number.parseInt( value, 10 );
  return Number.isFinite( numericValue ) ? numericValue : null;

}

function normalizeValue( value ) {

  const numericValue = Number.parseFloat( value );
  return Number.isFinite( numericValue ) ? numericValue : null;

}

function uniqueOrdered( values ) {

  return [ ...new Set( values ) ];

}

function latLonToUnitVector( latDeg, lonDeg ) {

  const phi = ( Math.PI / 180 ) * ( 90 - latDeg );
  const theta = ( Math.PI / 180 ) * ( lonDeg + 180 );

  return {
    x: - Math.sin( phi ) * Math.cos( theta ),
    y: Math.cos( phi ),
    z: Math.sin( phi ) * Math.sin( theta ),
  };

}

function getAngularSeparationDegrees( metadataA, metadataB ) {

  const vectorA = latLonToUnitVector( metadataA.lat, metadataA.lon );
  const vectorB = latLonToUnitVector( metadataB.lat, metadataB.lon );
  const dot = Math.max( - 1, Math.min( 1, ( vectorA.x * vectorB.x ) + ( vectorA.y * vectorB.y ) + ( vectorA.z * vectorB.z ) ) );
  return ( Math.acos( dot ) * 180 ) / Math.PI;

}

function validateConfiguredMetadata( codes ) {

  const missingCodes = codes.filter( ( code ) => ! demo2CountryMetadata[ code ] );

  if ( missingCodes.length > 0 ) {

    throw new Error( `Missing country metadata for: ${missingCodes.join( ', ' )}` );

  }

}

function getFlowValueForYear( flowValuesByCode, destinationId, year ) {

  return flowValuesByCode.get( destinationId )?.get( year ) ?? null;

}

function formatMaybeInteger( value ) {

  return Number.isInteger( value ) ? String( value ) : String( Number.parseFloat( value.toFixed( 3 ) ) );

}

function buildFlowCsvText( flowRows ) {

  const headers = [ 'flowId', 'year', 'originId', 'destinationId', 'value' ];
  const lines = [ headers.join( ',' ) ];

  flowRows.forEach( ( row ) => {

    lines.push( headers.map( ( header ) => row[ header ] ).join( ',' ) );

  } );

  return `${lines.join( '\n' )}\n`;

}

function createSelectedDestinationIds( flowValuesByCode, config ) {

  const {
    selectionYear,
    maxDestinationCount,
    requiredDestinationIds,
    preferredDestinationIds,
    minAngularSeparationDeg,
  } = config;
  const rankedCodes = [ ...flowValuesByCode.keys() ]
    .sort( ( codeA, codeB ) => {

      const valueA = getFlowValueForYear( flowValuesByCode, codeA, selectionYear ) ?? - 1;
      const valueB = getFlowValueForYear( flowValuesByCode, codeB, selectionYear ) ?? - 1;
      return valueB - valueA;

    } );
  const selectedDestinationIds = [];
  const warnings = [];
  const seedCodes = uniqueOrdered( [
    ...requiredDestinationIds,
    ...preferredDestinationIds,
  ] );

  function maybeAddCode( code, {
    allowSpacingViolation = false,
  } = {} ) {

    if ( selectedDestinationIds.includes( code ) || selectedDestinationIds.length >= maxDestinationCount ) {

      return;

    }

    if ( ! flowValuesByCode.has( code ) ) {

      throw new Error( `Configured destination ${code} is missing from the raw Afghanistan flow export.` );

    }

    const metadata = demo2CountryMetadata[ code ];

    if ( ! metadata ) {

      throw new Error( `Configured destination ${code} is missing scene-local metadata.` );

    }

    if ( ! allowSpacingViolation ) {

      const collision = selectedDestinationIds.find( ( existingCode ) => {

        const existingMetadata = demo2CountryMetadata[ existingCode ];
        return getAngularSeparationDegrees( metadata, existingMetadata ) < minAngularSeparationDeg;

      } );

      if ( collision ) {

        return;

      }

    }

    selectedDestinationIds.push( code );

    if ( allowSpacingViolation ) {

      selectedDestinationIds.forEach( ( existingCode ) => {

        if ( existingCode === code ) {

          return;

        }

        const separation = getAngularSeparationDegrees( metadata, demo2CountryMetadata[ existingCode ] );

        if ( separation < minAngularSeparationDeg ) {

          warnings.push(
            `Spacing warning: ${code} vs ${existingCode} = ${separation.toFixed( 1 )}deg (< ${minAngularSeparationDeg}deg)`,
          );

        }

      } );

    }

  }

  seedCodes.forEach( ( code ) => maybeAddCode( code, { allowSpacingViolation: true } ) );

  rankedCodes.forEach( ( code ) => maybeAddCode( code ) );

  rankedCodes.forEach( ( code ) => maybeAddCode( code, { allowSpacingViolation: true } ) );

  return {
    selectedDestinationIds,
    warnings,
  };

}

async function main() {

  const flowCsvText = await readFile( flowRawPath, 'utf8' );
  const stockCsvText = await readFile( stockRawPath, 'utf8' );
  const flowRows = parseCsv( flowCsvText );
  const stockRows = parseCsv( stockCsvText );
  const config = demo2DatasetSelectionConfig;
  const originId = normalizeCode( config.originId );
  const supportedYears = uniqueOrdered( config.supportedYears.map( normalizeYear ).filter( Number.isFinite ) );

  if ( ! originId ) {

    throw new Error( 'demo2DatasetSelectionConfig.originId must be a 3-letter country code.' );

  }

  validateConfiguredMetadata( [ originId, ...config.requiredDestinationIds, ...config.preferredDestinationIds ] );

  const flowColumn = 'Emigrants from Afghanistan: Where did they move to?';
  const flowValuesByCode = new Map();

  flowRows.forEach( ( row ) => {

    const code = normalizeCode( row.Code );
    const year = normalizeYear( row.Year );
    const value = normalizeValue( row[ flowColumn ] );

    if ( ! code || ! supportedYears.includes( year ) || value === null || code === originId ) {

      return;

    }

    if ( ! flowValuesByCode.has( code ) ) {

      flowValuesByCode.set( code, new Map() );

    }

    flowValuesByCode.get( code ).set( year, value );

  } );

  const {
    selectedDestinationIds,
    warnings: spacingWarnings,
  } = createSelectedDestinationIds( flowValuesByCode, config );

  if ( selectedDestinationIds.length !== config.maxDestinationCount ) {

    throw new Error( `Expected ${config.maxDestinationCount} destinations but selected ${selectedDestinationIds.length}.` );

  }

  const stockValuesByCode = new Map();

  stockRows.forEach( ( row ) => {

    const code = normalizeCode( row.Code );
    const year = normalizeYear( row.Year );
    const value = normalizeValue( row[ 'Total number of international immigrants' ] );

    if ( ! code || ! supportedYears.includes( year ) || value === null ) {

      return;

    }

    if ( ! stockValuesByCode.has( code ) ) {

      stockValuesByCode.set( code, new Map() );

    }

    stockValuesByCode.get( code ).set( year, value );

  } );

  const nodeCodes = [ originId, ...selectedDestinationIds ];
  const missingStockCodes = nodeCodes.filter( ( code ) => ! stockValuesByCode.has( code ) );

  if ( missingStockCodes.length > 0 ) {

    throw new Error( `Missing stock rows for: ${missingStockCodes.join( ', ' ) }` );

  }

  const flowRowsToWrite = [];

  selectedDestinationIds.forEach( ( destinationId ) => {

    supportedYears.forEach( ( year ) => {

      const value = getFlowValueForYear( flowValuesByCode, destinationId, year );

      if ( value === null ) {

        throw new Error( `Missing ${originId} -> ${destinationId} flow for ${year}.` );

      }

      flowRowsToWrite.push( {
        flowId: `${year}:${originId}->${destinationId}`,
        year: String( year ),
        originId,
        destinationId,
        value: formatMaybeInteger( value ),
      } );

    } );

  } );

  const nodesToWrite = nodeCodes.map( ( code ) => {

    const metadata = demo2CountryMetadata[ code ];
    const stockByYear = {};

    supportedYears.forEach( ( year ) => {

      const value = stockValuesByCode.get( code )?.get( year );

      if ( value === null || value === undefined ) {

        throw new Error( `Missing stock value for ${code} in ${year}.` );

      }

      stockByYear[ String( year ) ] = value;

    } );

    return {
      id: code,
      name: metadata.name,
      lat: metadata.lat,
      lon: metadata.lon,
      region: metadata.region,
      stockByYear,
    };

  } );

  await writeFile( nodesOutputPath, `${JSON.stringify( nodesToWrite, null, 2 )}\n`, 'utf8' );
  await writeFile( flowsOutputPath, buildFlowCsvText( flowRowsToWrite ), 'utf8' );

  const selectionYearRows = selectedDestinationIds.map( ( destinationId ) => ( {
    destinationId,
    name: demo2CountryMetadata[ destinationId ].name,
    selectionYearValue: getFlowValueForYear( flowValuesByCode, destinationId, config.selectionYear ),
  } ) );

  console.log( '[demo2] Generated runtime bundle.' );
  console.log( `[demo2] Origin: ${originId}` );
  console.log( `[demo2] Years: ${supportedYears.join( ', ' )}` );
  console.log( `[demo2] Destinations (${selectedDestinationIds.length}): ${selectedDestinationIds.join( ', ' )}` );
  console.table( selectionYearRows );

  if ( spacingWarnings.length > 0 ) {

    console.warn( '[demo2] Angular-separation warnings:' );
    spacingWarnings.forEach( ( warning ) => console.warn( `  - ${warning}` ) );

  } else {

    console.log( '[demo2] No angular-separation warnings.' );

  }

}

main().catch( ( error ) => {

  console.error( '[demo2] Failed to generate runtime bundle.' );
  console.error( error );
  process.exitCode = 1;

} );
