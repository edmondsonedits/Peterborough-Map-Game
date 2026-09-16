/*
 * Peterborough 3D Map Editor development entry point.
 *
 * The implementation is intentionally left small in the planning commit.
 * Follow the ordered sessions in README.md. Each session must keep this page
 * loadable and leave the data format compatible with the 3D simulator.
 */

const canvas = document.querySelector('#editor-canvas');

if (canvas) {
  const context = canvas.getContext('2d');

  const drawPlaceholder = () => {
    const ratio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);
    context.strokeStyle = '#263438';
    context.lineWidth = 1;

    const spacing = 32;
    for (let x = 0; x < bounds.width; x += spacing) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, bounds.height);
      context.stroke();
    }
    for (let y = 0; y < bounds.height; y += spacing) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(bounds.width, y);
      context.stroke();
    }
  };

  new ResizeObserver(drawPlaceholder).observe(canvas);
  drawPlaceholder();
}
