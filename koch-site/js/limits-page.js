(function () {
  "use strict";

  const stageSlider = document.getElementById("graph-stage");
  if (!stageSlider) return;

  const stageOutput = document.getElementById("graph-stage-number");
  const perimeterOutput = document.getElementById("graph-perimeter");
  const areaOutput = document.getElementById("graph-area");
  const gapValueOutput = document.getElementById("graph-gap-value");
  const perimeterCanvas = document.getElementById("perimeter-graph");
  const areaCanvas = document.getElementById("area-graph");
  const epsilonInput = document.getElementById("epsilon-input");
  const epsilonResult = document.getElementById("epsilon-result");
  const boundInput = document.getElementById("bound-input");
  const boundResult = document.getElementById("bound-result");
  const ROOT_RATIO = 4 / 9;

  function perimeterAt(n) {
    return 3 * Math.pow(4 / 3, n);
  }

  function areaRatioAt(n) {
    return 1.6 - (3 / 5) * Math.pow(ROOT_RATIO, n);
  }

  function formatNumberTex(value, digits) {
    if (!Number.isFinite(value)) return "\\text{계산 범위를 벗어남}";
    if (value !== 0 && (Math.abs(value) < 0.000001 || Math.abs(value) >= 1e9)) {
      const [mantissa, exponent] = value.toExponential(digits).split("e");
      return `${mantissa}\\times 10^{${Number(exponent)}}`;
    }
    return value.toFixed(digits);
  }

  function mathSpan(tex) {
    return `<span class="math-inline" data-math="${tex}"></span>`;
  }

  function renderOutput(element) {
    window.KochMath.renderStatic(element);
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = getComputedStyle(canvas).getPropertyValue("--canvas-bg").trim() || "#fbfdff";
    context.fillRect(0, 0, width, height);
    return { context, width, height };
  }

  function drawGraph(canvas, selectedN, kind) {
    const surface = setupCanvas(canvas);
    if (!surface) return;
    const { context: ctx, width, height } = surface;
    const styles = getComputedStyle(canvas);
    const grid = styles.getPropertyValue("--border").trim() || "#d6e1e8";
    const text = styles.getPropertyValue("--text-muted").trim() || "#526879";
    const line = styles.getPropertyValue("--blue").trim() || "#0072b2";
    const highlight = styles.getPropertyValue("--orange").trim() || "#d55e00";
    const left = 43;
    const right = 14;
    const top = 16;
    const bottom = 31;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    if (plotWidth <= 0 || plotHeight <= 0) return;

    const yMin = kind === "area" ? 0.95 : 0;
    const yMax = kind === "area" ? 1.64 : Math.ceil(perimeterAt(15) / 50) * 50;
    const yFor = (value) => top + (yMax - value) / (yMax - yMin) * plotHeight;
    const xFor = (n) => left + n / 15 * plotWidth;

    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = grid;
    ctx.fillStyle = text;
    ctx.lineWidth = 1;
    const ticks = kind === "area" ? [1, 1.2, 1.4, 1.6] : [0, 100, 200, 300];
    ticks.forEach((tick) => {
      const y = yFor(tick);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(width - right, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(kind === "area" ? tick.toFixed(1) : String(tick), left - 7, y);
    });
    [0, 5, 10, 15].forEach((tick) => {
      const x = xFor(tick);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotHeight);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(tick), x, top + plotHeight + 7);
      ctx.textBaseline = "middle";
    });

    if (kind === "area") {
      const limitY = yFor(1.6);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = highlight;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(left, limitY);
      ctx.lineTo(width - right, limitY);
      ctx.stroke();
      ctx.restore();
    }

    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let n = 0; n <= 15; n += 1) {
      const value = kind === "area" ? areaRatioAt(n) : perimeterAt(n);
      const x = xFor(n);
      const y = yFor(value);
      if (n === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const selectedValue = kind === "area" ? areaRatioAt(selectedN) : perimeterAt(selectedN);
    ctx.beginPath();
    ctx.fillStyle = highlight;
    ctx.arc(xFor(selectedN), yFor(selectedValue), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function updateGraphs() {
    const n = Number(stageSlider.value);
    const perimeter = perimeterAt(n);
    const areaRatio = areaRatioAt(n);
    const gap = (3 / 5) * Math.pow(ROOT_RATIO, n);
    window.KochMath.render(stageOutput, String(n));
    perimeterOutput.textContent = perimeter.toFixed(3);
    areaOutput.textContent = areaRatio.toFixed(5);
    gapValueOutput.textContent = gap.toFixed(6);
    drawGraph(perimeterCanvas, n, "perimeter");
    drawGraph(areaCanvas, n, "area");
  }

  function updateEpsilon() {
    const epsilon = Number(epsilonInput.value);
    if (!(epsilon > 0) || !Number.isFinite(epsilon)) {
      epsilonResult.textContent = "ε는 0보다 큰 유한한 값이어야 한다.";
      return;
    }
    const threshold = Math.log(5 * epsilon / 3) / Math.log(ROOT_RATIO);
    const n = Math.max(0, Math.floor(threshold) + 1);
    const atN = (3 / 5) * Math.pow(ROOT_RATIO, n);
    const previous = n > 0 ? (3 / 5) * Math.pow(ROOT_RATIO, n - 1) : null;
    const previousText = previous === null
      ? ""
      : ` 바로 앞 단계 ${mathSpan("n")} = ${mathSpan(String(n - 1))}에서는 오차가 ${mathSpan(formatNumberTex(previous, 6))}다.`;
    epsilonResult.innerHTML = `계산값 ${mathSpan(threshold.toFixed(4))}이므로 가장 작은 자연수 ${mathSpan("N")} = ${mathSpan(String(n))}다. ${mathSpan("n")} = ${mathSpan(String(n))}에서 오차 ${mathSpan(formatNumberTex(atN, 6))} < ${mathSpan("\\varepsilon")} = ${mathSpan(formatNumberTex(epsilon, 6))}다.${previousText}`;
    renderOutput(epsilonResult);
  }

  function updateBound() {
    const bound = Number(boundInput.value);
    if (!(bound > 0) || !Number.isFinite(bound)) {
      boundResult.textContent = "M은 0보다 큰 유한한 값이어야 한다.";
      return;
    }
    const threshold = Math.log(bound / 3) / Math.log(4 / 3);
    const n = Math.max(0, Math.floor(threshold) + 1);
    const perimeter = perimeterAt(n);
    boundResult.innerHTML = `계산값 ${mathSpan(threshold.toFixed(4))}이므로 가장 작은 자연수 ${mathSpan("N")} = ${mathSpan(String(n))}다. ${mathSpan(`P_{${n}}`)} = ${mathSpan(formatNumberTex(perimeter, 3))} > ${mathSpan("M")} = ${mathSpan(formatNumberTex(bound, 3))}다.`;
    renderOutput(boundResult);
  }

  stageSlider.addEventListener("input", updateGraphs);
  epsilonInput.addEventListener("input", updateEpsilon);
  boundInput.addEventListener("input", updateBound);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(updateGraphs);
    observer.observe(perimeterCanvas);
    observer.observe(areaCanvas);
  } else {
    window.addEventListener("resize", updateGraphs);
  }
  // UI: 라이트/다크 전환 시 그래프를 새 색으로 다시 그린다.
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", updateGraphs);
  }
  new MutationObserver(updateGraphs).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  updateGraphs();
  updateEpsilon();
  updateBound();
})();
