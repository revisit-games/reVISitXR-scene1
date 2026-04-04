import * as THREE from 'three';

const DEFAULT_FONT_FAMILY = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
const VALID_TEXT_ALIGNS = new Set( [ 'left', 'center', 'right' ] );

function drawRoundedRect( context, x, y, width, height, radius ) {

  const clampedRadius = Math.min( radius, width * 0.5, height * 0.5 );
  context.beginPath();
  context.moveTo( x + clampedRadius, y );
  context.lineTo( x + width - clampedRadius, y );
  context.quadraticCurveTo( x + width, y, x + width, y + clampedRadius );
  context.lineTo( x + width, y + height - clampedRadius );
  context.quadraticCurveTo( x + width, y + height, x + width - clampedRadius, y + height );
  context.lineTo( x + clampedRadius, y + height );
  context.quadraticCurveTo( x, y + height, x, y + height - clampedRadius );
  context.lineTo( x, y + clampedRadius );
  context.quadraticCurveTo( x, y, x + clampedRadius, y );
  context.closePath();

}

function normalizeTextAlign( textAlign ) {

  return VALID_TEXT_ALIGNS.has( textAlign ) ? textAlign : 'left';

}

function normalizePadding( padding, horizontalPadding, verticalPadding ) {

  return {
    horizontal: Number.isFinite( horizontalPadding ) ? horizontalPadding : padding,
    vertical: Number.isFinite( verticalPadding ) ? verticalPadding : padding,
  };

}

function buildFontShorthand( fontWeight, fontSize, fontFamily ) {

  return `${fontWeight} ${fontSize}px ${fontFamily}`;

}

function measureLineWidth( context, line ) {

  return context.measureText( line ).width;

}

function splitLongToken( context, token, maxWidth ) {

  if ( token.length <= 1 || measureLineWidth( context, token ) <= maxWidth ) {

    return [ token ];

  }

  const segments = [];
  let current = '';

  for ( const character of token ) {

    const candidate = current + character;

    if ( current && measureLineWidth( context, candidate ) > maxWidth ) {

      segments.push( current );
      current = character;

    } else {

      current = candidate;

    }

  }

  if ( current ) {

    segments.push( current );

  }

  return segments;

}

function wrapSingleLine( context, line, maxWidth ) {

  if ( ! Number.isFinite( maxWidth ) || maxWidth <= 0 || measureLineWidth( context, line ) <= maxWidth ) {

    return [ line ];

  }

  const words = line.trim().split( /\s+/ ).filter( Boolean );

  if ( words.length === 0 ) {

    return [ '' ];

  }

  const wrappedLines = [];
  let currentLine = '';

  for ( const word of words ) {

    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if ( measureLineWidth( context, candidate ) <= maxWidth ) {

      currentLine = candidate;
      continue;

    }

    if ( currentLine ) {

      wrappedLines.push( currentLine );

    }

    if ( measureLineWidth( context, word ) <= maxWidth ) {

      currentLine = word;
      continue;

    }

    const splitWord = splitLongToken( context, word, maxWidth );
    wrappedLines.push( ...splitWord.slice( 0, - 1 ) );
    currentLine = splitWord.at( - 1 ) || '';

  }

  if ( currentLine || wrappedLines.length === 0 ) {

    wrappedLines.push( currentLine );

  }

  return wrappedLines;

}

function wrapText( context, text, maxWidth ) {

  const rawLines = text.split( '\n' );
  const wrappedLines = [];

  for ( const line of rawLines ) {

    wrappedLines.push( ...wrapSingleLine( context, line, maxWidth ) );

  }

  return wrappedLines.length > 0 ? wrappedLines : [ '' ];

}

function normalizeNumber( value, fallback ) {

  return Number.isFinite( value ) ? value : fallback;

}

export function createTextSprite( {
  text = '',
  worldHeight = 0.2,
  fontSize = 64,
  padding = 20,
  horizontalPadding,
  verticalPadding,
  lineHeight = 1.2,
  fontFamily = DEFAULT_FONT_FAMILY,
  fontWeight = '700',
  textAlign = 'left',
  maxTextWidth = null,
  wrapWidth = null,
  fixedWidth = null,
  minWidth = null,
  uppercase = false,
  anchorX = 0.5,
  anchorY = 0.5,
  textColor = '#eef3ff',
  backgroundColor = 'rgba(8, 12, 20, 0.72)',
  borderColor = 'rgba(255, 255, 255, 0.16)',
  borderWidth = 4,
  borderRadius = 24,
} = {} ) {

  const canvas = document.createElement( 'canvas' );
  const context = canvas.getContext( '2d' );
  const texture = new THREE.CanvasTexture( canvas );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial( {
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  } );

  const sprite = new THREE.Sprite( material );
  sprite.center.set(
    THREE.MathUtils.clamp( normalizeNumber( anchorX, 0.5 ), 0, 1 ),
    THREE.MathUtils.clamp( normalizeNumber( anchorY, 0.5 ), 0, 1 ),
  );
  sprite.renderOrder = 12;

  function updateSpriteText( nextText = '' ) {

    const safeText = typeof nextText === 'string' ? nextText : String( nextText ?? '' );
    const formattedText = uppercase ? safeText.toUpperCase() : safeText;
    const pixelRatio = Math.max( 1, Math.min( 2, window.devicePixelRatio || 1 ) );
    const paddingValues = normalizePadding( padding, horizontalPadding, verticalPadding );
    const resolvedTextAlign = normalizeTextAlign( textAlign );
    const font = buildFontShorthand( fontWeight, fontSize, fontFamily );
    const requestedWrapWidth = Number.isFinite( wrapWidth ) ? wrapWidth : maxTextWidth;
    const availableTextWidth = Number.isFinite( fixedWidth )
      ? Math.max( 1, fixedWidth - paddingValues.horizontal * 2 )
      : requestedWrapWidth;

    context.font = font;

    const lines = wrapText( context, formattedText, availableTextWidth );
    const measuredTextWidth = lines.reduce( ( width, line ) => (
      Math.max( width, measureLineWidth( context, line ) )
    ), 0 );
    const finalWidth = Number.isFinite( fixedWidth )
      ? fixedWidth
      : Math.max(
        measuredTextWidth + paddingValues.horizontal * 2,
        normalizeNumber( minWidth, 0 ),
      );
    const finalHeight = Math.max(
      1,
      lines.length * fontSize * lineHeight + paddingValues.vertical * 2,
    );
    const logicalWidth = Math.max( 1, Math.ceil( finalWidth ) );
    const logicalHeight = Math.max( 1, Math.ceil( finalHeight ) );

    canvas.width = Math.max( 1, Math.ceil( logicalWidth * pixelRatio ) );
    canvas.height = Math.max( 1, Math.ceil( logicalHeight * pixelRatio ) );

    context.setTransform( pixelRatio, 0, 0, pixelRatio, 0, 0 );
    context.clearRect( 0, 0, logicalWidth, logicalHeight );
    context.font = font;
    context.textBaseline = 'top';
    context.textAlign = resolvedTextAlign;

    drawRoundedRect( context, 0, 0, logicalWidth, logicalHeight, borderRadius );
    context.fillStyle = backgroundColor;
    context.fill();

    if ( borderWidth > 0 ) {

      context.lineWidth = borderWidth;
      context.strokeStyle = borderColor;
      context.stroke();

    }

    let textX = paddingValues.horizontal;

    if ( resolvedTextAlign === 'center' ) {

      textX = logicalWidth * 0.5;

    } else if ( resolvedTextAlign === 'right' ) {

      textX = logicalWidth - paddingValues.horizontal;

    }

    context.fillStyle = textColor;

    lines.forEach( ( line, index ) => {

      context.fillText( line, textX, paddingValues.vertical + index * fontSize * lineHeight );

    } );

    texture.needsUpdate = true;

    const aspect = logicalWidth / logicalHeight;
    sprite.scale.set( worldHeight * aspect, worldHeight, 1 );
    sprite.userData.textContent = formattedText;
    sprite.userData.logicalWidth = logicalWidth;
    sprite.userData.logicalHeight = logicalHeight;

  }

  updateSpriteText( text );

  return {
    sprite,
    setText: updateSpriteText,
    dispose() {

      texture.dispose();
      material.dispose();

    },
  };

}
