import rawSiteReadings from './data/siteReadings.json';

function isFiniteNumber( value ) {

  return typeof value === 'number' && Number.isFinite( value );

}

function cloneArray( value ) {

  return Array.isArray( value ) ? [ ...value ] : [];

}

function normalizeMetric( metric ) {

  return {
    id: String( metric?.id || '' ),
    label: String( metric?.label || metric?.id || '' ),
    unit: String( metric?.unit || '' ),
    alertThreshold: isFiniteNumber( metric?.alertThreshold ) ? metric.alertThreshold : Number.POSITIVE_INFINITY,
  };

}

function normalizeTimeSlice( timeSlice, index ) {

  return {
    id: String( timeSlice?.id || `time-${index}` ),
    label: String( timeSlice?.label || timeSlice?.id || `Time ${index + 1}` ),
    index,
  };

}

function normalizeSite( site, metricIds, timeSliceIds ) {

  const readings = {};

  timeSliceIds.forEach( ( timeId ) => {

    const sourceReadings = site?.readings?.[ timeId ] || {};
    readings[ timeId ] = {};

    metricIds.forEach( ( metricId ) => {

      readings[ timeId ][ metricId ] = isFiniteNumber( sourceReadings[ metricId ] )
        ? sourceReadings[ metricId ]
        : 0;

    } );

  } );

  return {
    id: String( site?.id || '' ),
    label: String( site?.label || site?.id || '' ),
    shortLabel: String( site?.shortLabel || site?.label || site?.id || '' ),
    localPosition: Array.isArray( site?.localPosition ) && site.localPosition.length === 3
      ? site.localPosition.map( ( value ) => ( isFiniteNumber( value ) ? value : 0 ) )
      : [ 0, 0, 0 ],
    readings,
  };

}

function normalizeDataset( rawDataset ) {

  const metrics = ( Array.isArray( rawDataset?.metrics ) ? rawDataset.metrics : [] )
    .map( normalizeMetric )
    .filter( ( metric ) => metric.id );
  const timeSlices = ( Array.isArray( rawDataset?.timeSlices ) ? rawDataset.timeSlices : [] )
    .map( normalizeTimeSlice )
    .filter( ( timeSlice ) => timeSlice.id );
  const metricIds = metrics.map( ( metric ) => metric.id );
  const timeSliceIds = timeSlices.map( ( timeSlice ) => timeSlice.id );
  const sites = ( Array.isArray( rawDataset?.sites ) ? rawDataset.sites : [] )
    .map( ( site ) => normalizeSite( site, metricIds, timeSliceIds ) )
    .filter( ( site ) => site.id );
  const siteById = new Map( sites.map( ( site ) => [ site.id, site ] ) );
  const metricById = new Map( metrics.map( ( metric ) => [ metric.id, metric ] ) );
  const timeSliceById = new Map( timeSlices.map( ( timeSlice ) => [ timeSlice.id, timeSlice ] ) );

  return Object.freeze( {
    datasetId: String( rawDataset?.datasetId || 'demo4-site-readings' ),
    label: String( rawDataset?.label || 'Campus Commons Monitoring Overlay' ),
    metrics: Object.freeze( metrics ),
    metricIds: Object.freeze( metricIds ),
    metricById,
    timeSlices: Object.freeze( timeSlices ),
    timeSliceIds: Object.freeze( timeSliceIds ),
    timeSliceById,
    sites: Object.freeze( sites ),
    siteIds: Object.freeze( sites.map( ( site ) => site.id ) ),
    siteById,
  } );

}

export const demo4Dataset = normalizeDataset( rawSiteReadings );
export const DEMO4_SITE_IDS = Object.freeze( cloneArray( demo4Dataset.siteIds ) );
export const DEMO4_METRIC_IDS = Object.freeze( cloneArray( demo4Dataset.metricIds ) );
export const DEMO4_TIME_SLICE_IDS = Object.freeze( cloneArray( demo4Dataset.timeSliceIds ) );

export function getDemo4Dataset() {

  return demo4Dataset;

}

export function getDemo4Metric( metricId ) {

  return demo4Dataset.metricById.get( metricId ) || demo4Dataset.metrics[ 0 ] || null;

}

export function getDemo4TimeSlice( timeIndexOrId ) {

  if ( typeof timeIndexOrId === 'string' ) {

    return demo4Dataset.timeSliceById.get( timeIndexOrId ) || demo4Dataset.timeSlices[ 0 ] || null;

  }

  const index = isFiniteNumber( timeIndexOrId ) ? Math.round( timeIndexOrId ) : 0;
  return demo4Dataset.timeSlices[ Math.max( 0, Math.min( demo4Dataset.timeSlices.length - 1, index ) ) ] || null;

}

export function getDemo4Site( siteId ) {

  return demo4Dataset.siteById.get( siteId ) || null;

}

export function getDemo4Reading( siteId, metricId, timeIndex ) {

  const site = getDemo4Site( siteId );
  const timeSlice = getDemo4TimeSlice( timeIndex );

  if ( ! site || ! timeSlice ) {

    return 0;

  }

  const value = site.readings?.[ timeSlice.id ]?.[ metricId ];
  return isFiniteNumber( value ) ? value : 0;

}

export function getDemo4VisibleSiteIds( {
  metricId = demo4Dataset.metricIds[ 0 ],
  timeIndex = 0,
  layerMode = 'all',
} = {} ) {

  if ( layerMode !== 'alerts' ) {

    return [ ...demo4Dataset.siteIds ];

  }

  const metric = getDemo4Metric( metricId );
  const threshold = metric?.alertThreshold ?? Number.POSITIVE_INFINITY;

  return demo4Dataset.siteIds.filter( ( siteId ) => (
    getDemo4Reading( siteId, metricId, timeIndex ) >= threshold
  ) );

}

export function formatDemo4Reading( value, metricId ) {

  const metric = getDemo4Metric( metricId );

  if ( metricId === 'co2' ) {

    return `${Math.round( value )} ${metric?.unit || 'ppm'}`;

  }

  if ( metricId === 'noise' ) {

    return `${Math.round( value )} ${metric?.unit || 'dBA'}`;

  }

  return `${Math.round( value )}${metric?.unit || '%'}`;

}
