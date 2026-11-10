// Fit the measured ink to a physical sign area without changing letter aspect.
// A tight texture avoids the previous fixed 8:1 canvas padding and distortion.
const finite = Number.isFinite;
const MAX_WIDTH = 1024, MAX_HEIGHT = 256;

export function fitFacadeSignText({ context, text, font = '700 46px Georgia,serif', widthMetres, heightMetres } = {}) {
  if (!context || typeof text !== 'string' || !text.trim() || !finite(widthMetres) || !finite(heightMetres)
    || widthMetres <= 0 || heightMetres <= 0) return null;
  const template = typeof font === 'string' && /\d+(?:\.\d+)?px/.test(font) ? font : '700 46px Georgia,serif';
  const fontAt = size => template.replace(/\d+(?:\.\d+)?px/, `${size}px`);
  context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  function measure(size) {
    context.font = fontAt(size);
    let measured;
    try { measured = context.measureText?.(text); } catch { /* conservative fallback below */ }
    const left = measured?.actualBoundingBoxLeft, right = measured?.actualBoundingBoxRight;
    const ascent = measured?.actualBoundingBoxAscent, descent = measured?.actualBoundingBoxDescent;
    if ([left, right, ascent, descent].every(finite) && left + right > 0 && ascent + descent > 0
      && ascent >= 0 && descent >= 0) return { left, right, ascent, descent, metrics: 'measured' };
    const estimatedWidth = finite(measured?.width) && measured.width > 0 ? measured.width
      : [...text].reduce((sum, character) => sum + (/\s/.test(character) ? .32 : /[MW@]/.test(character) ? .95 : /[ilI1.,']/.test(character) ? .32 : .65), 0) * size;
    // Complete font ink bounds are absent. Leave generous ascent/descent and
    // side clearance rather than guessing that the fallback is exact metrics.
    return { left: size * .08, right: estimatedWidth + size * .08, ascent: size * .82, descent: size * .22, metrics: 'estimated' };
  }
  let fontSize = 96, bounds, canvasWidth, canvasHeight, padding;
  for (let iteration = 0; iteration < 4; iteration++) {
    bounds = measure(fontSize);
    padding = Math.max(2, (bounds.ascent + bounds.descent) * .06);
    canvasWidth = Math.ceil(bounds.left + bounds.right + padding * 2);
    canvasHeight = Math.ceil(bounds.ascent + bounds.descent + padding * 2);
    const rasterScale = Math.min(1, MAX_WIDTH / canvasWidth, MAX_HEIGHT / canvasHeight);
    if (rasterScale === 1) break;
    fontSize = Math.max(1, Math.floor(fontSize * rasterScale * .995 * 100) / 100);
  }
  if (canvasWidth > MAX_WIDTH || canvasHeight > MAX_HEIGHT || canvasWidth < 1 || canvasHeight < 1) return null;
  const scale = Math.min(widthMetres / canvasWidth, heightMetres / canvasHeight);
  const planeWidthMetres = canvasWidth * scale, planeHeightMetres = canvasHeight * scale;
  const inkWidth = bounds.left + bounds.right, inkHeight = bounds.ascent + bounds.descent;
  // Center the actual ink, including italic overhang and uneven descenders.
  const x = (canvasWidth - inkWidth) / 2 + bounds.left;
  const y = (canvasHeight - inkHeight) / 2 + bounds.ascent;
  return { font: fontAt(fontSize), fontSize, canvasWidth, canvasHeight, x, y,
    planeWidthMetres, planeHeightMetres, metrics: bounds.metrics,
    inkWidthMetres: inkWidth * scale, inkHeightMetres: inkHeight * scale,
    inkBoundsPixels: { left: x - bounds.left, right: x + bounds.right,
      top: y - bounds.ascent, bottom: y + bounds.descent } };
}
