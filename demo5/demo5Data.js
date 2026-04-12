export const DEMO5_LANDMARK_SET_ID = 'landmark-skyscraper-heights-v1';

export const demo5Landmarks = Object.freeze( [
  Object.freeze( {
    id: 'burj_khalifa',
    label: 'Burj Khalifa',
    shortLabel: 'Burj',
    heightMeters: 828,
    sourceLabel: 'Burj Khalifa official facts and figures',
    sourceUrl: 'https://www.burjkhalifa.ae/en/the-tower/facts-figures/',
    assetUrls: Object.freeze( {
      glb: new URL( '../models/khalifa.glb', import.meta.url ).href,
      obj: new URL( '../models/khalifa.obj', import.meta.url ).href,
    } ),
    color: 0xd7f3a2,
  } ),
  Object.freeze( {
    id: 'cn_tower',
    label: 'CN Tower',
    shortLabel: 'CN',
    heightMeters: 553.33,
    sourceLabel: 'CN Tower official site',
    sourceUrl: 'https://www.cntower.ca/',
    assetUrls: Object.freeze( {
      glb: new URL( '../models/cn_tower.glb', import.meta.url ).href,
      obj: new URL( '../models/cn_tower.obj', import.meta.url ).href,
    } ),
    color: 0x9bd8ff,
  } ),
  Object.freeze( {
    id: 'oriental_pearl',
    label: 'Oriental Pearl Tower',
    shortLabel: 'Pearl',
    heightMeters: 468,
    sourceLabel: 'The Skyscraper Center / CTBUH',
    sourceUrl: 'https://www.skyscrapercenter.com/',
    assetUrls: Object.freeze( {
      glb: new URL( '../models/oriental_pearl.glb', import.meta.url ).href,
      obj: new URL( '../models/oriental_pearl.obj', import.meta.url ).href,
    } ),
    color: 0xffc779,
  } ),
  Object.freeze( {
    id: 'statue_of_liberty',
    label: 'Statue of Liberty',
    shortLabel: 'Liberty',
    heightMeters: 92.99,
    sourceLabel: 'National Park Service Statue of Liberty FAQ',
    sourceUrl: 'https://www.nps.gov/stli/faqs.htm',
    assetUrls: Object.freeze( {
      glb: new URL( '../models/statue_of_liberty.glb', import.meta.url ).href,
      obj: new URL( '../models/statue_of_liberty.obj', import.meta.url ).href,
    } ),
    color: 0x85dcc7,
  } ),
] );

export const demo5PeopleModels = Object.freeze( [
  Object.freeze( {
    id: 'people1',
    label: 'Human reference 1',
    intendedHeightMeters: 1.75,
    assetUrls: Object.freeze( {
      glb: new URL( '../models/people1.glb', import.meta.url ).href,
      obj: new URL( '../models/people1.obj', import.meta.url ).href,
    } ),
  } ),
  Object.freeze( {
    id: 'people2',
    label: 'Human reference 2',
    intendedHeightMeters: 1.72,
    assetUrls: Object.freeze( {
      glb: new URL( '../models/people2.glb', import.meta.url ).href,
      obj: new URL( '../models/people2.obj', import.meta.url ).href,
    } ),
  } ),
] );

export const DEMO5_LANDMARK_IDS = Object.freeze( demo5Landmarks.map( ( landmark ) => landmark.id ) );
export const DEMO5_DEFAULT_SELECTED_LANDMARK_ID = 'statue_of_liberty';

const landmarkById = new Map( demo5Landmarks.map( ( landmark ) => [ landmark.id, landmark ] ) );

export function getDemo5Landmark( landmarkId ) {

  return landmarkById.get( landmarkId ) || null;

}

export function getDemo5Landmarks() {

  return demo5Landmarks;

}

export function getDemo5TallestLandmark() {

  return demo5Landmarks.reduce( ( tallest, landmark ) => (
    landmark.heightMeters > tallest.heightMeters ? landmark : tallest
  ), demo5Landmarks[ 0 ] );

}
