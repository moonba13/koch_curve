(function (global) {
  "use strict";

  const ROOT3 = Math.sqrt(3);
  const LOG10_3 = Math.log10(3);
  const ROTATION = (a, b) => ({ a: -b, b: a + b });
  const power3Cache = [1n];

  function power3(exponent) {
    while (power3Cache.length <= exponent) {
      power3Cache.push(power3Cache[power3Cache.length - 1] * 3n);
    }
    return power3Cache[exponent];
  }

  function scaledBigInt(value, denominatorPower, scale) {
    if (value === 0n || scale === 0) return 0;
    const sign = value < 0n ? -1 : 1;
    const digits = (value < 0n ? -value : value).toString();
    const count = Math.min(16, digits.length);
    const lead = Number(digits.slice(0, count));
    const mantissa = lead / Math.pow(10, count - 1);
    const logMagnitude = digits.length - 1 + Math.log10(mantissa)
      - denominatorPower * LOG10_3 + Math.log10(Math.abs(scale));
    if (logMagnitude > 308) return sign * Infinity;
    if (logMagnitude < -324) return 0;
    return sign * Math.pow(10, logMagnitude);
  }

  function exactPoint(a, b, m) {
    return { a, b, m };
  }

  function subdivide(a, b) {
    const da = b.a - a.a;
    const db = b.b - a.b;
    const rotated = ROTATION(da, db);
    const baseA = a.a * 3n;
    const baseB = a.b * 3n;
    const p = exactPoint(baseA + da, baseB + db, a.m + 1);
    const q = exactPoint(p.a + rotated.a, p.b + rotated.b, a.m + 1);
    const t = exactPoint(baseA + 2n * da, baseB + 2n * db, a.m + 1);
    const end = exactPoint(b.a * 3n, b.b * 3n, a.m + 1);
    return [
      [exactPoint(a.a * 3n, a.b * 3n, a.m + 1), p],
      [p, q],
      [q, t],
      [t, end]
    ];
  }

  function createKochEngine(canvas, onUpdate) {
    const ctx = canvas.getContext("2d");
    if (!ctx || typeof Path2D === "undefined") {
      throw new Error("이 브라우저는 코흐 그림에 필요한 Canvas 기능을 지원하지 않는다.");
    }

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let fillEnabled = true;
    let zoomCount = 0;
    let baseStage = 0;
    let visitedNodes = 0;
    let drawnSegments = 0;
    let selfSimilarity = false;
    let leaves = [];
    let animation = null;
    let animationFrame = 0;
    let projectionCache = null;
    let crosshair = null;
    let initialCamera = null;
    let initialSidePixels = 0;
    let history = [];
    let camera = { depth: 1, a: 1n, b: 1n, da: 0, db: 0, scale: 1 };

    function fitScale(w, h) {
      const sidePixels = Math.min(w * 0.72, h * 0.76 / (ROOT3 / 2));
      return Math.max(1, sidePixels / 3);
    }

    function cloneCamera(source) {
      return {
        depth: source.depth,
        a: source.a,
        b: source.b,
        da: source.da,
        db: source.db,
        scale: source.scale
      };
    }

    function updateBaseStage() {
      const initialError = initialSidePixels * ROOT3 / 6;
      baseStage = Math.max(0, Math.ceil(Math.log10(Math.max(1, initialError / 0.5)) / LOG10_3));
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const newWidth = Math.max(1, rect.width);
      const newHeight = Math.max(1, rect.height);
      const previousFit = width && height ? fitScale(width, height) : 0;
      const nextFit = fitScale(newWidth, newHeight);
      width = newWidth;
      height = newHeight;
      pixelRatio = Math.min(global.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * pixelRatio));
      canvas.height = Math.max(1, Math.round(height * pixelRatio));
      if (previousFit > 0) camera.scale *= nextFit / previousFit;
      else {
        camera.scale = nextFit;
        initialCamera = cloneCamera(camera);
      }
      if (initialCamera) {
        if (previousFit > 0) initialCamera.scale *= nextFit / previousFit;
        initialSidePixels = initialCamera.scale * Math.pow(3, initialCamera.depth);
      }
      if (zoomCount === 0 && !animation) updateBaseStage();
      render();
      if (typeof onUpdate === "function") onUpdate(getStage());
    }

    function cameraUnits(point, view) {
      if (point.m <= view.depth) {
        const factor = power3(view.depth - point.m);
        return {
          a: Number(point.a * factor - view.a),
          b: Number(point.b * factor - view.b)
        };
      }
      const exponent = point.m - view.depth;
      const factor = power3(exponent);
      return {
        a: scaledBigInt(point.a - view.a * factor, exponent, 1),
        b: scaledBigInt(point.b - view.b * factor, exponent, 1)
      };
    }

    function project(point, view) {
      const cached = projectionCache && projectionCache.get(point);
      if (cached) return cached;
      let diffA;
      let diffB;
      let denominatorPower = 0;
      if (point.m <= view.depth) {
        const factor = power3(view.depth - point.m);
        diffA = point.a * factor - view.a;
        diffB = point.b * factor - view.b;
      } else {
        denominatorPower = point.m - view.depth;
        const factor = power3(denominatorPower);
        diffA = point.a - view.a * factor;
        diffB = point.b - view.b * factor;
      }
      const xNumerator = 2n * diffA + diffB;
      const screenX = width / 2
        + scaledBigInt(xNumerator, denominatorPower, view.scale / 2)
        - (2 * view.da + view.db) * view.scale / 2;
      const screenY = height / 2
        - scaledBigInt(diffB, denominatorPower, view.scale * ROOT3 / 2)
        + view.db * view.scale * ROOT3 / 2;
      const projected = { x: screenX, y: screenY };
      if (projectionCache) projectionCache.set(point, projected);
      return projected;
    }

    function addTriangle(path, a, b, c, view) {
      const pa = project(a, view);
      const pb = project(b, view);
      const pc = project(c, view);
      if (
        !Number.isFinite(pa.x) || !Number.isFinite(pa.y)
        || !Number.isFinite(pb.x) || !Number.isFinite(pb.y)
        || !Number.isFinite(pc.x) || !Number.isFinite(pc.y)
      ) return;
      path.moveTo(pa.x, pa.y);
      path.lineTo(pb.x, pb.y);
      path.lineTo(pc.x, pc.y);
      path.closePath();
    }

    function walk(a, b, depth, view, curvePath, fillPath, leafList, lodTolerance) {
      visitedNodes += 1;
      const pa = project(a, view);
      const pb = project(b, view);
      const children = subdivide(a, b);
      const bumpA = children[0][1];
      const bumpTop = children[1][1];
      const bumpB = children[2][1];
      const peak = project(bumpTop, view);
      if (
        Math.max(pa.x, pb.x, peak.x) < -5 || Math.min(pa.x, pb.x, peak.x) > width + 5
        || Math.max(pa.y, pb.y, peak.y) < -5 || Math.min(pa.y, pb.y, peak.y) > height + 5
      ) return;

      const screenLength = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      if (depth > 1800 || ROOT3 / 6 * screenLength <= lodTolerance) {
        if (Number.isFinite(pa.x) && Number.isFinite(pa.y) && Number.isFinite(pb.x) && Number.isFinite(pb.y)) {
          curvePath.moveTo(pa.x, pa.y);
          curvePath.lineTo(pb.x, pb.y);
          if (leafList) leafList.push({ a, b, tDepth: depth, pa, pb });
          drawnSegments += 1;
        }
        return;
      }

      if (fillEnabled) addTriangle(fillPath, bumpA, bumpTop, bumpB, view);
      for (const child of children) {
        walk(child[0], child[1], depth + 1, view, curvePath, fillPath, leafList, lodTolerance);
      }
    }

    function projectCrosshair(view) {
      if (!crosshair) return null;
      const a = project(crosshair.a, view);
      const b = project(crosshair.b, view);
      return {
        x: a.x + (b.x - a.x) * crosshair.t,
        y: a.y + (b.y - a.y) * crosshair.t
      };
    }

    function render() {
      if (!width || !height) return;
      const view = animation ? animation.view : camera;
      const lodTolerance = animation ? 1 : 0.5;
      projectionCache = new WeakMap();
      const curvePath = new Path2D();
      const fillPath = new Path2D();
      const nextLeaves = animation ? null : [];
      visitedNodes = 0;
      drawnSegments = 0;
      const zero = exactPoint(0n, 0n, 0);
      const omega = exactPoint(0n, 1n, 0);
      const one = exactPoint(1n, 0n, 0);
      const roots = [[zero, omega], [omega, one], [one, zero]];
      if (fillEnabled) {
        addTriangle(fillPath, zero, omega, one, view);
      }
      for (const root of roots) {
        walk(root[0], root[1], 0, view, curvePath, fillPath, nextLeaves, lodTolerance);
      }
      if (nextLeaves) leaves = nextLeaves;

      // Build the complete geometry first; clear and redraw synchronously in this same render.
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const styles = global.getComputedStyle(canvas);
      const curveColor = styles.getPropertyValue("--blue").trim() || "#0072b2";
      const markerColor = styles.getPropertyValue("--orange").trim() || "#d55e00";
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.clip();
      if (fillEnabled) {
        ctx.fillStyle = styles.getPropertyValue("--surface-soft").trim() || "rgba(0, 114, 178, 0.08)";
        ctx.fill(fillPath, "nonzero");
      }
      ctx.strokeStyle = curveColor;
      ctx.lineWidth = 1.55;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(curvePath);
      const mark = projectCrosshair(view);
      if (mark && Number.isFinite(mark.x) && Number.isFinite(mark.y)) {
        ctx.beginPath();
        ctx.strokeStyle = markerColor;
        ctx.fillStyle = markerColor;
        ctx.lineWidth = 2;
        ctx.moveTo(mark.x - 7, mark.y);
        ctx.lineTo(mark.x + 7, mark.y);
        ctx.moveTo(mark.x, mark.y - 7);
        ctx.lineTo(mark.x, mark.y + 7);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function getStage() {
      const progress = animation ? animation.progress : 1;
      const k = animation
        ? animation.startK + (animation.endK - animation.startK) * progress
        : zoomCount;
      return {
        k,
        n0: baseStage,
        n: baseStage + k,
        progress: animation ? progress : 1,
        animating: Boolean(animation),
        selfSimilarity,
        scaleLog10: k * Math.log10(3),
        segmentsDrawn: drawnSegments,
        nodesVisited: visitedNodes
      };
    }

    function nearestCurvePoint(x, y) {
      let best = null;
      let bestDistance = Infinity;
      for (const leaf of leaves) {
        const dx = leaf.pb.x - leaf.pa.x;
        const dy = leaf.pb.y - leaf.pa.y;
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
          ((x - leaf.pa.x) * dx + (y - leaf.pa.y) * dy) / lengthSquared));
        const px = leaf.pa.x + t * dx;
        const py = leaf.pa.y + t * dy;
        const distance = (x - px) * (x - px) + (y - py) * (y - py);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = {
            a: leaf.a,
            b: leaf.b,
            t,
            depth: leaf.tDepth,
            x: px,
            y: py,
            isVertex: t <= 0.08 || t >= 0.92
          };
        }
      }
      return best;
    }

    function focusOffset(point) {
      const depth = point.depth;
      const viewDepth = camera.depth;
      let baseA;
      let baseB;
      let segmentScale;
      if (depth >= viewDepth) {
        const exponent = depth - viewDepth;
        const factor = power3(exponent);
        baseA = scaledBigInt(point.a.a - camera.a * factor, exponent, 1);
        baseB = scaledBigInt(point.a.b - camera.b * factor, exponent, 1);
        segmentScale = scaledBigInt(1n, exponent, 1);
      } else {
        const factor = power3(viewDepth - depth);
        baseA = Number(point.a.a * factor - camera.a);
        baseB = Number(point.a.b * factor - camera.b);
        segmentScale = Number(factor);
      }
      const segmentA = Number(point.b.a - point.a.a) * segmentScale;
      const segmentB = Number(point.b.b - point.a.b) * segmentScale;
      return {
        a: baseA + point.t * segmentA - camera.da,
        b: baseB + point.t * segmentB - camera.db
      };
    }

    function normalizeCamera(source) {
      while (source.scale > 3000) {
        source.depth += 1;
        source.a *= 3n;
        source.b *= 3n;
        source.da *= 3;
        source.db *= 3;
        source.scale /= 3;
        const wholeA = Math.trunc(source.da);
        const wholeB = Math.trunc(source.db);
        source.a += BigInt(wholeA);
        source.b += BigInt(wholeB);
        source.da -= wholeA;
        source.db -= wholeB;
      }
      return source;
    }

    function easeInOut(progress) {
      return (1 - Math.cos(Math.PI * progress)) / 2;
    }

    function animatePath(path, direction) {
      if (animation) return false;
      const frameView = cloneCamera(path.start);
      const startK = zoomCount;
      const endK = direction === "in" ? zoomCount + 1 : zoomCount - 1;
      const duration = 1200;
      const startTime = global.performance.now();
      animation = {
        view: frameView,
        progress: 0,
        startK,
        endK
      };
      crosshair = { a: path.point.a, b: path.point.b, t: path.point.t };
      selfSimilarity = path.isVertex;

      function tick(now) {
        if (!animation) return;
        const progress = Math.min(1, Math.max(0, (now - startTime) / duration));
        const eased = easeInOut(progress);
        const zoomProgress = direction === "in" ? eased : 1 - eased;
        const factor = Math.pow(3, zoomProgress);
        frameView.da = path.targetCenterA
          - path.offsetA * (1 - zoomProgress) / factor;
        frameView.db = path.targetCenterB
          - path.offsetB * (1 - zoomProgress) / factor;
        frameView.scale = path.start.scale * factor;
        animation.progress = eased;

        // Keep each animation frame self-contained: render clears and redraws the curve synchronously.
        render();
        if (typeof onUpdate === "function") onUpdate(getStage());

        if (progress < 1) {
          animationFrame = global.requestAnimationFrame(tick);
          return;
        }

        if (direction === "in") {
          history.push(path);
          camera = normalizeCamera({
            ...cloneCamera(path.start),
            da: path.targetCenterA,
            db: path.targetCenterB,
            scale: path.start.scale * 3
          });
          zoomCount += 1;
        } else {
          camera = cloneCamera(path.start);
          zoomCount = Math.max(0, zoomCount - 1);
          crosshair = path.previousCrosshair;
          selfSimilarity = path.previousSelfSimilarity;
          if (zoomCount === 0) {
            camera = cloneCamera(initialCamera);
            updateBaseStage();
          }
        }
        animation = null;
        animationFrame = 0;
        render();

        if (typeof onUpdate === "function") onUpdate(getStage());
      }

      animationFrame = global.requestAnimationFrame(tick);
      return true;
    }

    function animateZoomIn(point, offset) {
      const start = cloneCamera(camera);
      animatePath({
        start,
        point,
        offsetA: offset.a,
        offsetB: offset.b,
        targetCenterA: start.da + offset.a,
        targetCenterB: start.db + offset.b,
        isVertex: point.isVertex,
        previousCrosshair: crosshair,
        previousSelfSimilarity: selfSimilarity
      }, "in");
    }

    function zoomAt(x, y) {
      if (animation) return false;
      if (!leaves.length) render();
      const point = nearestCurvePoint(x, y);
      if (!point) return false;
      animateZoomIn(point, focusOffset(point));
      return true;
    }

    function zoomOut() {
      if (animation || zoomCount <= 0 || !history.length) return false;
      const previous = history.pop();
      if (!animatePath(previous, "out")) {
        history.push(previous);
        return false;
      }
      return true;
    }

    function zoomAtCenter() {
      return zoomAt(width / 2, height / 2);
    }

    function reset() {
      if (animationFrame && typeof global.cancelAnimationFrame === "function") {
        global.cancelAnimationFrame(animationFrame);
      }
      animationFrame = 0;
      animation = null;
      history = [];
      zoomCount = 0;
      camera = cloneCamera(initialCamera);
      updateBaseStage();
      crosshair = null;
      selfSimilarity = false;
      leaves = [];
      render();
      if (typeof onUpdate === "function") onUpdate(getStage());
      return true;
    }

    function setFill(enabled) {
      fillEnabled = Boolean(enabled);
      render();
    }

    if (typeof global.ResizeObserver !== "undefined") {
      const observer = new global.ResizeObserver(resize);
      observer.observe(canvas);
    } else {
      global.addEventListener("resize", resize);
    }

    resize();
    return {
      getStage,
      zoomAt,
      zoomAtCenter,
      zoomOut,
      reset,
      setFill,
      isAnimating: () => Boolean(animation)
    };
  }

  global.KochEngine = { createKochEngine };
})(window);
