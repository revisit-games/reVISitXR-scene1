import * as THREE from 'three';
import { PRESENTATION_MODES } from '../logging/xrLoggingSchema.js';
import {
  EXAMPLE1_SOURCE_COLORS,
  loadExample1Dataset,
} from './example1Data.js';
import { createTextSprite } from '../scenes/core/textSprite.js';

const BAR_WIDTH = 0.32;
const BAR_DEPTH = 0.26;
const COUNTRY_SPACING = 0.62;
const SOURCE_SPACING = 0.48;
const MAX_BAR_HEIGHT = 2.6;
const BAR_BASE_Y = 0.12;
const BAR_ANIMATION_DURATION = 0.42;
const XR_PANEL_TRACK_LENGTH = 0.84;
const XR_PANEL_HEIGHT = 1.2;
const XR_PANEL_WIDTH = 0.96;

const panelStyles = {
  root: 'display:flex;flex-direction:column;gap:12px;padding:16px 18px;border:1px solid rgba(255,255,255,0.12);border-radius:16px;background:rgba(8,12,20,0.82);backdrop-filter:blur(12px);box-shadow:0 18px 44px rgba(0,0,0,0.3);',
  label: 'font-size:0.78rem;letter-spacing:0.08em;text-transform:uppercase;color:rgba(238,243,255,0.7);margin:0;',
  title: 'margin:0;font-size:1.02rem;font-weight:700;color:#f4f8ff;',
  body: 'margin:0;font-size:0.92rem;line-height:1.5;color:rgba(238,243,255,0.86);',
  detail: 'margin:0;font-size:0.86rem;line-height:1.45;color:rgba(238,243,255,0.74);',
  slider: 'width:100%;accent-color:#7aa6ff;',
};

function formatValue( value, unit ) {

  return `${new Intl.NumberFormat( 'en-US', {
    maximumFractionDigits: 0,
  } ).format( value )} ${unit} / person`;

}

function buildDatumId( country, source ) {

  return `${country}|${source}`;

}

function parseDatumId( datumId ) {

  if ( typeof datumId !== 'string' ) {

    return null;

  }

  const [ country, source ] = datumId.split( '|' );

  if ( ! country || ! source ) {

    return null;

  }

  return { country, source };

}

function getEmptySceneState( fallbackState = {} ) {

  return {
    selectedYear: Number.isFinite( fallbackState?.selectedYear ) ? fallbackState.selectedYear : null,
    selectedDatumId: typeof fallbackState?.selectedDatumId === 'string' ? fallbackState.selectedDatumId : null,
  };

}

function createPanelSectionLabel( text ) {

  const element = document.createElement( 'p' );
  element.setAttribute( 'style', panelStyles.label );
  element.textContent = text;
  return element;

}

export const example1SceneDefinition = Object.freeze( {
  sceneKey: 'example1',
  queryValue: '1',
  label: 'Example 1 Energy Matrix',
  templateConfig: Object.freeze( {
    showFloor: true,
    showGrid: true,
    showPedestal: false,
    showTemplateCube: false,
    enableDefaultObjectManipulation: false,
  } ),
  normalizeSceneState( candidateState, fallbackState ) {

    return {
      selectedYear: Number.isFinite( candidateState?.selectedYear )
        ? candidateState.selectedYear
        : ( Number.isFinite( fallbackState?.selectedYear ) ? fallbackState.selectedYear : null ),
      selectedDatumId: typeof candidateState?.selectedDatumId === 'string'
        ? candidateState.selectedDatumId
        : ( typeof fallbackState?.selectedDatumId === 'string' ? fallbackState.selectedDatumId : null ),
    };

  },
  createScene( context ) {

    const root = new THREE.Group();
    root.position.set( 0, 0, - 2.1 );

    const chartRoot = new THREE.Group();
    const labelRoot = new THREE.Group();
    const xrPanelRoot = new THREE.Group();
    root.add( chartRoot );
    root.add( labelRoot );
    root.add( xrPanelRoot );

    const tempObject = new THREE.Object3D();
    const tempVector = new THREE.Vector3();
    const tempVector2 = new THREE.Vector3();
    const tempForward = new THREE.Vector3();
    const tempRight = new THREE.Vector3();
    const tempQuaternion = new THREE.Quaternion();
    const sliderPlane = new THREE.Plane();
    const sliderIntersection = new THREE.Vector3();

    const loadingSprite = createTextSprite( {
      text: 'Loading Example 1 dataset...',
      worldHeight: 0.3,
      fontSize: 54,
    } );
    loadingSprite.sprite.position.set( 0, 1.4, 0 );
    root.add( loadingSprite.sprite );

    const titleSprite = createTextSprite( {
      text: 'Example 1',
      worldHeight: 0.28,
      fontSize: 62,
      backgroundColor: 'rgba(8, 12, 20, 0.68)',
      borderColor: 'rgba(122, 166, 255, 0.2)',
    } );
    const yearSprite = createTextSprite( {
      text: 'Year: --',
      worldHeight: 0.18,
      fontSize: 44,
      backgroundColor: 'rgba(8, 12, 20, 0.68)',
      borderColor: 'rgba(255, 255, 255, 0.14)',
    } );
    const footerSprite = createTextSprite( {
      text: 'Source loading...',
      worldHeight: 0.14,
      fontSize: 28,
      backgroundColor: 'rgba(8, 12, 20, 0.58)',
      borderColor: 'rgba(255, 255, 255, 0.08)',
    } );
    const tooltipSprite = createTextSprite( {
      text: '',
      worldHeight: 0.22,
      fontSize: 36,
      backgroundColor: 'rgba(6, 10, 18, 0.88)',
      borderColor: 'rgba(255, 255, 255, 0.18)',
    } );
    tooltipSprite.sprite.visible = false;

    labelRoot.add( titleSprite.sprite );
    labelRoot.add( yearSprite.sprite );
    labelRoot.add( footerSprite.sprite );
    labelRoot.add( tooltipSprite.sprite );

    titleSprite.sprite.position.set( 0, 3.38, 0 );
    yearSprite.sprite.position.set( 0, 3.02, 0 );
    footerSprite.sprite.position.set( 0, 0.28, 2.18 );

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry( 5.6, 0.12, 4.6 ),
      new THREE.MeshStandardMaterial( {
        color: 0x101826,
        emissive: 0x050b14,
        roughness: 0.9,
        metalness: 0.08,
      } ),
    );
    platform.position.set( 0, 0.02, 0 );
    chartRoot.add( platform );

    const highlightMesh = new THREE.Mesh(
      new THREE.BoxGeometry( 1, 1, 1 ),
      new THREE.MeshBasicMaterial( {
        color: 0xf7f0ca,
        wireframe: true,
        transparent: true,
        opacity: 0.95,
        toneMapped: false,
      } ),
    );
    highlightMesh.visible = false;
    chartRoot.add( highlightMesh );

    const panelBackground = new THREE.Mesh(
      new THREE.PlaneGeometry( XR_PANEL_WIDTH, XR_PANEL_HEIGHT ),
      new THREE.MeshStandardMaterial( {
        color: 0x101924,
        emissive: 0x08111a,
        roughness: 0.84,
        metalness: 0.06,
        side: THREE.DoubleSide,
      } ),
    );
    panelBackground.position.set( 0, 1.15, 0 );
    xrPanelRoot.add( panelBackground );

    const panelTitleSprite = createTextSprite( {
      text: 'Energy Year',
      worldHeight: 0.18,
      fontSize: 42,
      backgroundColor: 'rgba(0,0,0,0)',
      borderColor: 'rgba(0,0,0,0)',
      borderWidth: 0,
    } );
    const panelYearSprite = createTextSprite( {
      text: '--',
      worldHeight: 0.22,
      fontSize: 48,
      backgroundColor: 'rgba(8, 12, 20, 0.72)',
      borderColor: 'rgba(122, 166, 255, 0.18)',
    } );
    panelTitleSprite.sprite.position.set( 0, 1.52, 0.01 );
    panelYearSprite.sprite.position.set( 0, 1.25, 0.01 );
    xrPanelRoot.add( panelTitleSprite.sprite );
    xrPanelRoot.add( panelYearSprite.sprite );

    const sliderTrack = new THREE.Mesh(
      new THREE.BoxGeometry( XR_PANEL_TRACK_LENGTH, 0.03, 0.03 ),
      new THREE.MeshStandardMaterial( {
        color: 0x6e8fb8,
        emissive: 0x14263b,
        roughness: 0.68,
        metalness: 0.14,
      } ),
    );
    sliderTrack.position.set( 0, 0.88, 0.03 );
    xrPanelRoot.add( sliderTrack );

    const sliderKnob = new THREE.Mesh(
      new THREE.CylinderGeometry( 0.045, 0.045, 0.05, 20 ),
      new THREE.MeshStandardMaterial( {
        color: 0xf4f8ff,
        emissive: 0x1e324a,
        roughness: 0.4,
        metalness: 0.08,
      } ),
    );
    sliderKnob.rotation.z = Math.PI * 0.5;
    sliderKnob.position.set( 0, 0.88, 0.06 );
    xrPanelRoot.add( sliderKnob );
    xrPanelRoot.visible = false;

    const countryLabelSprites = [];
    const sourceLabelSprites = [];
    let barsMesh = null;
    let desktopPanel = null;
    let desktopYearValue = null;
    let desktopSlider = null;
    let desktopSelectionValue = null;
    let desktopCitationValue = null;
    let dataset = null;
    let loadStatus = 'loading';
    let selectedYear = null;
    let selectedDatumId = null;
    let pendingSceneState = getEmptySceneState();
    let currentHoveredDatumId = null;
    const hoveredDatumIdsBySource = new Map();
    const instanceEntries = [];
    const currentHeights = [];
    const startHeights = [];
    const targetHeights = [];
    let animationElapsed = BAR_ANIMATION_DURATION;
    let barMatrixDirty = false;
    let xrDragSource = null;

    function disposeLabels() {

      countryLabelSprites.splice( 0 ).forEach( ( spriteController ) => spriteController.dispose() );
      sourceLabelSprites.splice( 0 ).forEach( ( spriteController ) => spriteController.dispose() );

    }

    function getIndexForYear( year ) {

      const index = dataset?.years.indexOf( year ) ?? - 1;
      return index >= 0 ? index : 0;

    }

    function getBarHeightForValue( value ) {

      if ( ! dataset ) {

        return 0.01;

      }

      return Math.max( value > 0 ? 0.03 : 0.008, value / dataset.maxValue * MAX_BAR_HEIGHT );

    }

    function getDatumForId( datumId ) {

      const parsedDatumId = parseDatumId( datumId );

      if ( ! parsedDatumId || ! dataset ) {

        return null;

      }

      const instanceIndex = instanceEntries.findIndex( ( entry ) => entry.datumId === datumId );

      if ( instanceIndex < 0 ) {

        return null;

      }

      const value = dataset.getValue( selectedYear, parsedDatumId.country, parsedDatumId.source );

      return {
        datumId,
        country: parsedDatumId.country,
        source: parsedDatumId.source,
        instanceIndex,
        value,
        ...instanceEntries[ instanceIndex ],
      };

    }

    function getActiveDatum() {

      return getDatumForId( currentHoveredDatumId ) || getDatumForId( selectedDatumId );

    }

    function updateDesktopSelectionText() {

      if ( ! desktopSelectionValue ) {

        return;

      }

      const pinnedDatum = getDatumForId( selectedDatumId );

      if ( ! pinnedDatum ) {

        desktopSelectionValue.textContent = 'No bar pinned yet. Hover for a quick tooltip or click/select a bar to pin it.';
        return;

      }

      desktopSelectionValue.textContent = `${pinnedDatum.country} - ${pinnedDatum.source} - ${selectedYear} - ${formatValue( pinnedDatum.value, dataset.unit )}`;

    }

    function updateDesktopPanel() {

      if ( ! desktopYearValue || ! desktopSlider ) {

        return;

      }

      if ( ! dataset ) {

        desktopYearValue.textContent = 'Loading dataset...';
        desktopSlider.disabled = true;
        updateDesktopSelectionText();
        return;

      }

      desktopSlider.disabled = false;
      desktopSlider.min = '0';
      desktopSlider.max = String( dataset.years.length - 1 );
      desktopSlider.step = '1';
      desktopSlider.value = String( getIndexForYear( selectedYear ) );
      desktopYearValue.textContent = `Showing ${selectedYear}`;
      desktopCitationValue.textContent = dataset.citation;
      updateDesktopSelectionText();

    }

    function updateTextOverlays() {

      if ( ! dataset ) {

        yearSprite.setText( 'Year: --' );
        panelYearSprite.setText( '--' );
        footerSprite.setText( 'OWID dataset loading...' );
        return;

      }

      yearSprite.setText( `Year ${selectedYear}` );
      panelYearSprite.setText( String( selectedYear ) );
      footerSprite.setText( `${dataset.citation}\nOWID chart reference` );

    }

    function updateBarsImmediatelyFromCurrentHeights() {

      if ( ! barsMesh ) {

        return;

      }

      for ( let index = 0; index < instanceEntries.length; index += 1 ) {

        const entry = instanceEntries[ index ];
        const height = currentHeights[ index ] ?? 0.01;
        tempObject.position.set( entry.x, BAR_BASE_Y + height * 0.5, entry.z );
        tempObject.scale.set( BAR_WIDTH, height, BAR_DEPTH );
        tempObject.updateMatrix();
        barsMesh.setMatrixAt( index, tempObject.matrix );

      }

      barsMesh.instanceMatrix.needsUpdate = true;
      barMatrixDirty = false;

    }

    function applyTargetHeightsForYear( year ) {

      if ( ! dataset ) {

        return;

      }

      for ( let index = 0; index < instanceEntries.length; index += 1 ) {

        const entry = instanceEntries[ index ];
        startHeights[ index ] = currentHeights[ index ] ?? 0.01;
        targetHeights[ index ] = getBarHeightForValue( dataset.getValue( year, entry.country, entry.source ) );

      }

      animationElapsed = 0;
      barMatrixDirty = true;

    }

    function updateTooltipAndHighlight() {

      const activeDatum = getActiveDatum();

      if ( ! activeDatum ) {

        highlightMesh.visible = false;
        tooltipSprite.sprite.visible = false;
        return;

      }

      const currentHeight = currentHeights[ activeDatum.instanceIndex ] ?? 0.01;
      highlightMesh.visible = true;
      highlightMesh.position.set( activeDatum.x, BAR_BASE_Y + currentHeight * 0.5, activeDatum.z );
      highlightMesh.scale.set( BAR_WIDTH + 0.04, currentHeight + 0.06, BAR_DEPTH + 0.04 );

      tooltipSprite.setText(
        `${activeDatum.country}\n${activeDatum.source}\n${selectedYear} - ${formatValue( activeDatum.value, dataset.unit )}`,
      );
      tooltipSprite.sprite.visible = true;
      tooltipSprite.sprite.position.set( activeDatum.x, BAR_BASE_Y + currentHeight + 0.34, activeDatum.z );

    }

    function updateHoveredDatumFromSource( source, datumId ) {

      if ( datumId ) {

        hoveredDatumIdsBySource.delete( source );
        hoveredDatumIdsBySource.set( source, datumId );

      } else {

        hoveredDatumIdsBySource.delete( source );

      }

      const nextHoveredDatumId = [ ...hoveredDatumIdsBySource.values() ].at( - 1 ) ?? null;

      if ( nextHoveredDatumId === currentHoveredDatumId ) {

        return;

      }

      currentHoveredDatumId = nextHoveredDatumId;
      updateTooltipAndHighlight();

    }

    function setSelectedDatumId( nextDatumId, { source = 'scene', shouldLog = true } = {} ) {

      const normalizedDatumId = typeof nextDatumId === 'string' ? nextDatumId : null;

      if ( normalizedDatumId === selectedDatumId ) {

        return;

      }

      selectedDatumId = normalizedDatumId;
      updateDesktopSelectionText();
      updateTooltipAndHighlight();

      if ( shouldLog ) {

        const parsedDatum = parseDatumId( normalizedDatumId );
        const label = parsedDatum
          ? `Select ${parsedDatum.country} ${parsedDatum.source}`
          : 'Clear Example 1 Selection';
        context.recordSceneStateChange( { source, label } );

      }

    }

    function setSelectedYear( nextYear, {
      source = 'scene',
      shouldLog = true,
      animate = true,
    } = {} ) {

      if ( ! dataset || ! Number.isFinite( nextYear ) || ! dataset.years.includes( nextYear ) ) {

        return;

      }

      if ( nextYear === selectedYear ) {

        return;

      }

      selectedYear = nextYear;

      if ( animate ) {

        applyTargetHeightsForYear( nextYear );

      } else {

        for ( let index = 0; index < instanceEntries.length; index += 1 ) {

          const entry = instanceEntries[ index ];
          const height = getBarHeightForValue( dataset.getValue( nextYear, entry.country, entry.source ) );
          currentHeights[ index ] = height;
          startHeights[ index ] = height;
          targetHeights[ index ] = height;

        }

        updateBarsImmediatelyFromCurrentHeights();

      }

      updateDesktopPanel();
      updateTextOverlays();
      updateTooltipAndHighlight();

      if ( shouldLog ) {

        context.recordSceneStateChange( {
          source,
          label: `Change Example 1 Year To ${nextYear}`,
        } );

      }

    }

    function buildChart() {

      if ( ! dataset ) {

        return;

      }

      disposeLabels();

      if ( barsMesh ) {

        context.unregisterRaycastTarget( barsMesh );
        barsMesh.removeFromParent();
        barsMesh.geometry.dispose();
        barsMesh.material.dispose();
        barsMesh = null;

      }

      const chartWidth = ( dataset.countries.length - 1 ) * COUNTRY_SPACING;
      const chartDepth = ( dataset.sources.length - 1 ) * SOURCE_SPACING;
      platform.scale.set(
        ( chartWidth + 1.8 ) / 5.6,
        1,
        ( chartDepth + 1.8 ) / 4.6,
      );

      const geometry = new THREE.BoxGeometry( 1, 1, 1 );
      const material = new THREE.MeshStandardMaterial( {
        color: 0xffffff,
        roughness: 0.38,
        metalness: 0.08,
      } );
      barsMesh = new THREE.InstancedMesh( geometry, material, dataset.countries.length * dataset.sources.length );
      barsMesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
      barsMesh.castShadow = true;
      barsMesh.receiveShadow = true;
      chartRoot.add( barsMesh );

      instanceEntries.splice( 0 );

      let instanceIndex = 0;
      dataset.countries.forEach( ( country, countryIndex ) => {

        const x = countryIndex * COUNTRY_SPACING - chartWidth * 0.5;
        const labelSprite = createTextSprite( {
          text: country,
          worldHeight: 0.16,
          fontSize: 32,
          backgroundColor: 'rgba(8, 12, 20, 0.68)',
          borderColor: 'rgba(255, 255, 255, 0.08)',
        } );
        labelSprite.sprite.position.set( x, 0.22, chartDepth * 0.5 + 0.44 );
        labelRoot.add( labelSprite.sprite );
        countryLabelSprites.push( labelSprite );

        dataset.sources.forEach( ( source, sourceIndex ) => {

          if ( countryIndex === 0 ) {

            const zLabel = sourceIndex * SOURCE_SPACING - chartDepth * 0.5;
            const sourceLabel = createTextSprite( {
              text: source,
              worldHeight: 0.14,
              fontSize: 30,
              backgroundColor: 'rgba(8, 12, 20, 0.68)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
            } );
            sourceLabel.sprite.position.set( - chartWidth * 0.5 - 0.64, 0.32, zLabel );
            labelRoot.add( sourceLabel.sprite );
            sourceLabelSprites.push( sourceLabel );

          }

          const z = sourceIndex * SOURCE_SPACING - chartDepth * 0.5;
          const datumId = buildDatumId( country, source );
          const color = new THREE.Color( EXAMPLE1_SOURCE_COLORS[ source ] );
          instanceEntries.push( {
            datumId,
            country,
            source,
            instanceIndex,
            x,
            z,
          } );
          barsMesh.setColorAt( instanceIndex, color );
          currentHeights[ instanceIndex ] = 0.01;
          startHeights[ instanceIndex ] = 0.01;
          targetHeights[ instanceIndex ] = 0.01;
          instanceIndex += 1;

        } );

      } );

      if ( barsMesh.instanceColor ) {

        barsMesh.instanceColor.needsUpdate = true;

      }

      titleSprite.setText( dataset.title );
      footerSprite.setText( `${dataset.citation}\n${dataset.chartUrl}` );

      const xAxisLabel = createTextSprite( {
        text: 'Country',
        worldHeight: 0.14,
        fontSize: 32,
        backgroundColor: 'rgba(8, 12, 20, 0.62)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      } );
      xAxisLabel.sprite.position.set( 0, 0.48, chartDepth * 0.5 + 0.82 );
      labelRoot.add( xAxisLabel.sprite );
      countryLabelSprites.push( xAxisLabel );

      const zAxisLabel = createTextSprite( {
        text: 'Energy Source',
        worldHeight: 0.14,
        fontSize: 32,
        backgroundColor: 'rgba(8, 12, 20, 0.62)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      } );
      zAxisLabel.sprite.position.set( - chartWidth * 0.5 - 1.02, 0.74, 0 );
      labelRoot.add( zAxisLabel.sprite );
      sourceLabelSprites.push( zAxisLabel );

      const yAxisLabel = createTextSprite( {
        text: `Per-capita energy\n(${dataset.unit})`,
        worldHeight: 0.18,
        fontSize: 34,
        backgroundColor: 'rgba(8, 12, 20, 0.62)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
      } );
      yAxisLabel.sprite.position.set( chartWidth * 0.5 + 0.8, 1.8, 0 );
      labelRoot.add( yAxisLabel.sprite );
      sourceLabelSprites.push( yAxisLabel );

      context.registerRaycastTarget( barsMesh, {
        onHoverChange( payload ) {

          const datumId = payload.isHovered && Number.isInteger( payload.instanceId )
            ? instanceEntries[ payload.instanceId ]?.datumId ?? null
            : null;
          updateHoveredDatumFromSource( payload.source, datumId );

        },
        onSelectStart( payload ) {

          if ( Number.isInteger( payload.instanceId ) ) {

            setSelectedDatumId( instanceEntries[ payload.instanceId ]?.datumId ?? null, {
              source: payload.source,
              shouldLog: true,
            } );

          }

        },
      } );

      setSelectedYear( pendingSceneState.selectedYear ?? dataset.initialYear, {
        source: 'scene-init',
        shouldLog: false,
        animate: false,
      } );
      setSelectedDatumId( pendingSceneState.selectedDatumId, {
        source: 'scene-init',
        shouldLog: false,
      } );
      updateDesktopPanel();
      updateTextOverlays();
      updateTooltipAndHighlight();
      loadingSprite.sprite.visible = false;

    }

    function getSliderRatioForYear( year ) {

      if ( ! dataset || dataset.years.length <= 1 ) {

        return 0;

      }

      return getIndexForYear( year ) / ( dataset.years.length - 1 );

    }

    function syncXRSliderKnob() {

      if ( ! dataset ) {

        sliderKnob.position.x = - XR_PANEL_TRACK_LENGTH * 0.5;
        return;

      }

      const ratio = getSliderRatioForYear( selectedYear );
      sliderKnob.position.x = THREE.MathUtils.lerp( - XR_PANEL_TRACK_LENGTH * 0.5, XR_PANEL_TRACK_LENGTH * 0.5, ratio );

    }

    function updateYearFromXRRay( rayOrigin, rayDirection, source ) {

      if ( ! dataset ) {

        return;

      }

      sliderTrack.updateMatrixWorld( true );
      sliderTrack.getWorldPosition( tempVector );
      sliderTrack.getWorldQuaternion( tempQuaternion );

      tempForward.set( 0, 0, 1 ).applyQuaternion( tempQuaternion );
      sliderPlane.setFromNormalAndCoplanarPoint( tempForward, tempVector );

      const ray = new THREE.Ray( rayOrigin.clone(), rayDirection.clone() );

      if ( ! ray.intersectPlane( sliderPlane, sliderIntersection ) ) {

        return;

      }

      const localPoint = sliderTrack.worldToLocal( sliderIntersection.clone() );
      const ratio = THREE.MathUtils.clamp( localPoint.x / XR_PANEL_TRACK_LENGTH + 0.5, 0, 1 );
      const nextIndex = Math.round( ratio * ( dataset.years.length - 1 ) );
      const nextYear = dataset.years[ nextIndex ];
      setSelectedYear( nextYear, { source, shouldLog: true, animate: true } );
      syncXRSliderKnob();

    }

    function buildDesktopPanel() {

      desktopPanel = document.createElement( 'section' );
      desktopPanel.className = 'scene-panel-card';
      desktopPanel.setAttribute( 'style', panelStyles.root );

      const eyebrow = createPanelSectionLabel( 'Scene 1 - Semantic Replay' );
      desktopPanel.appendChild( eyebrow );

      const title = document.createElement( 'h2' );
      title.setAttribute( 'style', panelStyles.title );
      title.textContent = 'Per capita primary energy consumption by source';
      desktopPanel.appendChild( title );

      const subtitle = document.createElement( 'p' );
      subtitle.setAttribute( 'style', panelStyles.body );
      subtitle.textContent = 'Explore how the selected year reshapes a 3D country-by-source energy matrix. Hover or select bars to inspect a country-source pair in detail.';
      desktopPanel.appendChild( subtitle );

      const sliderLabel = createPanelSectionLabel( 'Year' );
      desktopPanel.appendChild( sliderLabel );

      desktopYearValue = document.createElement( 'p' );
      desktopYearValue.setAttribute( 'style', panelStyles.body );
      desktopYearValue.textContent = 'Loading dataset...';
      desktopPanel.appendChild( desktopYearValue );

      desktopSlider = document.createElement( 'input' );
      desktopSlider.type = 'range';
      desktopSlider.disabled = true;
      desktopSlider.setAttribute( 'style', panelStyles.slider );
      desktopSlider.addEventListener( 'input', () => {

        if ( ! dataset ) {

          return;

        }

        const nextIndex = Number.parseInt( desktopSlider.value, 10 );
        const nextYear = dataset.years[ nextIndex ];
        setSelectedYear( nextYear, {
          source: 'desktop-year-slider',
          shouldLog: true,
          animate: true,
        } );
        syncXRSliderKnob();

      } );
      desktopPanel.appendChild( desktopSlider );

      const selectionLabel = createPanelSectionLabel( 'Pinned Selection' );
      desktopPanel.appendChild( selectionLabel );

      desktopSelectionValue = document.createElement( 'p' );
      desktopSelectionValue.setAttribute( 'style', panelStyles.detail );
      desktopSelectionValue.textContent = 'No bar pinned yet.';
      desktopPanel.appendChild( desktopSelectionValue );

      const citationLabel = createPanelSectionLabel( 'Source' );
      desktopPanel.appendChild( citationLabel );

      desktopCitationValue = document.createElement( 'p' );
      desktopCitationValue.setAttribute( 'style', panelStyles.detail );
      desktopCitationValue.textContent = 'Loading citation...';
      desktopPanel.appendChild( desktopCitationValue );

      context.setDesktopPanelNode( desktopPanel );

    }

    function clearPinnedSelection( source = 'scene' ) {

      setSelectedDatumId( null, { source, shouldLog: true } );

    }

    function loadDatasetIfNeeded() {

      if ( loadStatus !== 'loading' ) {

        return;

      }

      loadExample1Dataset().then( ( nextDataset ) => {

        dataset = nextDataset;
        loadStatus = 'ready';
        buildChart();
        updateDesktopPanel();
        syncXRSliderKnob();

      } ).catch( ( error ) => {

        console.error( 'Example 1 dataset failed to load.', error );
        loadStatus = 'error';
        loadingSprite.setText( 'Example 1 failed to load.\nCheck the local OWID dataset files.' );
        if ( desktopYearValue ) {

          desktopYearValue.textContent = 'Dataset loading failed.';
          desktopSlider.disabled = true;
          desktopCitationValue.textContent = String( error.message || error );

        }

      } );

    }

    function applySceneState( nextSceneState, options = {} ) {

      pendingSceneState = example1SceneDefinition.normalizeSceneState( nextSceneState, pendingSceneState );

      if ( ! dataset ) {

        return;

      }

      setSelectedYear( pendingSceneState.selectedYear ?? dataset.initialYear, {
        source: options.source || 'scene-state',
        shouldLog: options.shouldLog === true,
        animate: options.animate !== false,
      } );
      setSelectedDatumId( pendingSceneState.selectedDatumId, {
        source: options.source || 'scene-state',
        shouldLog: options.shouldLog === true,
      } );
      syncXRSliderKnob();

    }

    const sliderHandlers = {
      onSelectStart( payload ) {

        xrDragSource = payload.source;
        updateYearFromXRRay( payload.rayOrigin, payload.rayDirection, payload.source );

      },
      onSelectMove( payload ) {

        if ( xrDragSource === payload.source ) {

          updateYearFromXRRay( payload.rayOrigin, payload.rayDirection, payload.source );

        }

      },
      onSelectEnd( payload ) {

        if ( xrDragSource === payload.source ) {

          xrDragSource = null;

        }

      },
    };

    context.registerRaycastTarget( sliderTrack, sliderHandlers );
    context.registerRaycastTarget( sliderKnob, sliderHandlers );

    function positionXRPanelNearUser() {

      context.camera.updateMatrixWorld( true );
      context.camera.getWorldPosition( tempVector );
      context.camera.getWorldDirection( tempForward );
      context.camera.getWorldQuaternion( tempQuaternion );

      tempForward.y = 0;
      if ( tempForward.lengthSq() < 1e-6 ) {

        tempForward.set( 0, 0, - 1 );

      } else {

        tempForward.normalize();

      }

      tempRight.set( 1, 0, 0 ).applyQuaternion( tempQuaternion );
      tempRight.y = 0;
      if ( tempRight.lengthSq() < 1e-6 ) {

        tempRight.set( 1, 0, 0 );

      } else {

        tempRight.normalize();

      }

      xrPanelRoot.position.copy( tempVector )
        .addScaledVector( tempForward, 1.05 )
        .addScaledVector( tempRight, 0.72 );
      xrPanelRoot.position.y = Math.max( 1.0, tempVector.y - 0.2 );
      xrPanelRoot.lookAt( tempVector2.copy( tempVector ).setY( xrPanelRoot.position.y ) );
      xrPanelRoot.visible = context.getPresentationMode() !== PRESENTATION_MODES.DESKTOP;

    }

    return {
      activate() {

        context.sceneContentRoot.add( root );
        buildDesktopPanel();
        loadDatasetIfNeeded();
        updateDesktopPanel();
        updateTextOverlays();
        syncXRSliderKnob();
        positionXRPanelNearUser();

      },
      dispose() {

        context.unregisterRaycastTarget( sliderTrack );
        context.unregisterRaycastTarget( sliderKnob );
        if ( barsMesh ) {

          context.unregisterRaycastTarget( barsMesh );
          barsMesh.geometry.dispose();
          barsMesh.material.dispose();

        }

        root.removeFromParent();
        loadingSprite.dispose();
        titleSprite.dispose();
        yearSprite.dispose();
        footerSprite.dispose();
        tooltipSprite.dispose();
        panelTitleSprite.dispose();
        panelYearSprite.dispose();
        disposeLabels();
        context.clearDesktopPanel();

      },
      update( deltaSeconds ) {

        if ( dataset && animationElapsed < BAR_ANIMATION_DURATION ) {

          animationElapsed = Math.min( BAR_ANIMATION_DURATION, animationElapsed + deltaSeconds );
          const alpha = THREE.MathUtils.smoothstep( animationElapsed / BAR_ANIMATION_DURATION, 0, 1 );

          for ( let index = 0; index < instanceEntries.length; index += 1 ) {

            currentHeights[ index ] = THREE.MathUtils.lerp( startHeights[ index ], targetHeights[ index ], alpha );

          }

          barMatrixDirty = true;

        }

        if ( barMatrixDirty ) {

          updateBarsImmediatelyFromCurrentHeights();
          updateTooltipAndHighlight();

        }

      },
      getSceneStateForReplay() {

        return {
          selectedYear,
          selectedDatumId,
        };

      },
      applySceneStateFromReplay( sceneState ) {

        applySceneState( sceneState, {
          source: 'replay-scene',
          shouldLog: false,
          animate: true,
        } );

      },
      getHudContent( presentationMode ) {

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_VR ) {

          return {
            title: 'Example 1 - Energy Matrix',
            body: 'Use the floating year panel to scrub through time, then point at bars to inspect country-source details. Controller rays can pin a bar selection without dragging the chart itself.',
            note: 'Replay stores only compact scene semantics such as the selected year and pinned datum, so the bar matrix reconstructs from scene state instead of dozens of bar transforms.',
          };

        }

        if ( presentationMode === PRESENTATION_MODES.IMMERSIVE_AR ) {

          return {
            title: 'Example 1 - Energy Matrix',
            body: 'The bar matrix remains world-anchored while AR passthrough stays visible. Use the in-world year panel to snap between supported years and select bars for details.',
            note: 'This example intentionally treats the chart as authored scene content rather than a cluster of draggable objects, keeping replay compact and reusable.',
          };

        }

        return {
          title: 'Example 1 - Energy Matrix',
          body: 'Use the desktop year slider to scrub through the OWID dataset, then hover or click bars to inspect country-source values for the selected year.',
          note: 'Scene replay records `selectedYear` and the pinned datum id instead of raw bar transforms, so future authored scenes can use the same semantic replay pattern.',
        };

      },
      onPresentationModeChange( presentationMode ) {

        xrPanelRoot.visible = presentationMode !== PRESENTATION_MODES.DESKTOP;

        if ( presentationMode !== PRESENTATION_MODES.DESKTOP ) {

          positionXRPanelNearUser();

        }

      },
      handleBackgroundSelect( payload ) {

        clearPinnedSelection( payload?.source || 'scene-background' );

      },
    };

  },
} );
