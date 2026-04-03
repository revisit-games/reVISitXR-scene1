import * as THREE from 'three';

const DEFAULT_FONT_FAMILY = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';

function nextPowerOfTwo( value ) {

  return 2 ** Math.ceil( Math.log2( Math.max( 2, value ) ) );

}

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

export function createTextSprite( {
  text = '',
  worldHeight = 0.2,
  fontSize = 64,
  padding = 20,
  lineHeight = 1.2,
  fontFamily = DEFAULT_FONT_FAMILY,
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
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial( {
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  } );

  const sprite = new THREE.Sprite( material );
  sprite.renderOrder = 12;

  function updateSpriteText( nextText = '' ) {

    const safeText = typeof nextText === 'string' ? nextText : String( nextText ?? '' );
    const lines = safeText.split( '\n' );
    const pixelRatio = Math.max( 1, Math.min( 2, window.devicePixelRatio || 1 ) );

    context.font = `700 ${fontSize}px ${fontFamily}`;

    const textWidth = lines.reduce( ( width, line ) => {

      return Math.max( width, context.measureText( line ).width );

    }, 0 );

    const contentWidth = Math.max( 1, textWidth + padding * 2 );
    const contentHeight = Math.max( 1, lines.length * fontSize * lineHeight + padding * 2 );

    canvas.width = nextPowerOfTwo( Math.ceil( contentWidth * pixelRatio ) );
    canvas.height = nextPowerOfTwo( Math.ceil( contentHeight * pixelRatio ) );

    context.setTransform( pixelRatio, 0, 0, pixelRatio, 0, 0 );
    context.clearRect( 0, 0, canvas.width, canvas.height );
    context.font = `700 ${fontSize}px ${fontFamily}`;
    context.textBaseline = 'top';
    context.textAlign = 'left';

    const drawWidth = canvas.width / pixelRatio;
    const drawHeight = canvas.height / pixelRatio;

    drawRoundedRect( context, 0, 0, drawWidth, drawHeight, borderRadius );
    context.fillStyle = backgroundColor;
    context.fill();

    if ( borderWidth > 0 ) {

      context.lineWidth = borderWidth;
      context.strokeStyle = borderColor;
      context.stroke();

    }

    context.fillStyle = textColor;

    lines.forEach( ( line, index ) => {

      context.fillText( line, padding, padding + index * fontSize * lineHeight );

    } );

    texture.needsUpdate = true;

    const aspect = drawWidth / drawHeight;
    sprite.scale.set( worldHeight * aspect, worldHeight, 1 );
    sprite.userData.textContent = safeText;

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
