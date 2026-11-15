(function () {
  "use strict";

  const root3 = Math.sqrt(3);

  function rotate60(vector) {
    return {
      x: vector.x / 2 - vector.y * root3 / 2,
      y: vector.x * root3 / 2 + vector.y / 2
    };
  }

  function appendSegment(a, b, depth, points) {
    if (depth === 0) {
      points.push(b);
      return;
    }
    const vector = { x: (b.x - a.x) / 3, y: (b.y - a.y) / 3 };
    const rotated = rotate60(vector);
    const p = { x: a.x + vector.x, y: a.y + vector.y };
    const q = { x: p.x + rotated.x, y: p.y + rotated.y };
    const t = { x: a.x + 2 * vector.x, y: a.y + 2 * vector.y };
    appendSegment(a, p, depth - 1, points);
    appendSegment(p, q, depth - 1, points);
    appendSegment(q, t, depth - 1, points);
    appendSegment(t, b, depth - 1, points);
  }

  function draw(canvas) {
    const depth = Number(canvas.dataset.kochPreview) || 0;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const styles = getComputedStyle(canvas);
    const curve = styles.getPropertyValue("--blue").trim() || "#0072b2";
    const fill = styles.getPropertyValue("--surface-soft").trim() || "rgba(0,114,178,.08)";

    const zero = { x: 0, y: 0 };
    const omega = { x: 0.5, y: root3 / 2 };
    const one = { x: 1, y: 0 };
    const points = [zero];
    appendSegment(zero, omega, depth, points);
    appendSegment(omega, one, depth, points);
    appendSegment(one, zero, depth, points);
    const bounds = points.reduce((current, point) => ({
      minX: Math.min(current.minX, point.x),
      maxX: Math.max(current.maxX, point.x),
      minY: Math.min(current.minY, point.y),
      maxY: Math.max(current.maxY, point.y)
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
    const padding = 13;
    const rangeX = bounds.maxX - bounds.minX;
    const rangeY = bounds.maxY - bounds.minY;
    const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);
    const offsetX = (width - rangeX * scale) / 2;
    const offsetY = (height - rangeY * scale) / 2;
    const screenPoint = (point) => ({
      x: offsetX + (point.x - bounds.minX) * scale,
      y: offsetY + (bounds.maxY - point.y) * scale
    });

    const path = new Path2D();
    points.forEach((point, index) => {
      const mapped = screenPoint(point);
      if (index === 0) path.moveTo(mapped.x, mapped.y);
      else path.lineTo(mapped.x, mapped.y);
    });
    path.closePath();
    ctx.fillStyle = fill;
    ctx.fill(path, "nonzero");
    ctx.strokeStyle = curve;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke(path);
  }

  // UI: 창 크기·화면 배치가 바뀌거나 라이트/다크가 바뀌면 다시 그린다.
  const canvases = Array.from(document.querySelectorAll("[data-koch-preview]"));
  let queued = false;
  function drawAll() {
    queued = false;
    canvases.forEach(draw);
  }
  function requestDraw() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(drawAll);
  }
  drawAll();
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(requestDraw);
    canvases.forEach((canvas) => observer.observe(canvas));
  } else {
    window.addEventListener("resize", requestDraw);
  }
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", requestDraw);
  }
  new MutationObserver(requestDraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
