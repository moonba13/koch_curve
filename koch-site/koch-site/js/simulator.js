(function () {
  "use strict";

  const canvas = document.getElementById("koch-canvas");
  if (!canvas || !window.KochEngine) return;

  const stageBadge = document.getElementById("stage-badge");
  const perimeterCurrent = document.getElementById("perimeter-current");
  const areaCurrent = document.getElementById("area-current");
  const areaRatioCurrent = document.getElementById("area-ratio");
  const selfSimilarityCaption = document.getElementById("self-similarity-caption");
  const stageZoomCount = document.getElementById("stage-zoom-count");
  const stageScale = document.getElementById("stage-scale");
  const stageIndex = document.getElementById("stage-index");
  const startStageValue = document.getElementById("start-stage-value");
  const zoomOutButton = document.getElementById("zoom-out");
  const nextStepButton = document.getElementById("next-step");
  const resetButton = document.getElementById("reset-view");
  const fillToggle = document.getElementById("fill-toggle");
  const status = document.getElementById("sim-status");
  let engine;

  function scientificFromLog(log10Value, digits) {
    const exponent = Math.floor(log10Value);
    const mantissa = Math.pow(10, log10Value - exponent);
    return `${mantissa.toFixed(digits)}\\times 10^{${exponent}}`;
  }

  function formatPositive(log10Value, digits) {
    if (log10Value > 6 || log10Value < -4) return scientificFromLog(log10Value, digits);
    const value = Math.pow(10, log10Value);
    return value.toFixed(Math.max(0, Math.min(6, 4 - Math.floor(log10Value)))).replace(/\.?0+$/, "");
  }

  function formatPerimeter(n) {
    return formatPositive(Math.log10(3) + n * Math.log10(4 / 3), 3);
  }

  function areaGapLog(n) {
    return Math.log10(3 / 5) + n * Math.log10(4 / 9);
  }

  function updatePanel(stage) {
    if (!stage) return;
    const n = stage.n;
    const wholeStage = !stage.animating && Number.isInteger(n);
    const shownN = wholeStage ? String(n) : n.toFixed(2);
    const shownK = wholeStage ? String(stage.k) : stage.k.toFixed(2);
    const perimeter = formatPerimeter(n);
    const areaGapRatio = Math.pow(10, areaGapLog(n));
    const areaRatio = 1.6 - areaGapRatio;
    const a0 = Math.sqrt(3) / 4;
    const areaValue = a0 * areaRatio;
    const areaValueText = areaValue > 0 && (areaValue >= 1e-4 && areaValue < 1e6)
      ? areaValue.toFixed(6)
      : scientificFromLog(Math.log10(a0) + Math.log10(areaRatio), 3);
    const magnification = formatPositive(stage.k * Math.log10(3), 3);
    const minInterval = stage.animating ? 100 : 0;
    const force = !stage.animating;
    const renderMath = (element, tex, displayMode = false) => {
      window.KochMath.render(element, tex, { displayMode, minInterval, force });
    };
    renderMath(stageZoomCount, shownK);
    renderMath(stageScale, `3^{${shownK}}\\text{배}\\;\\left(${magnification}\\text{배}\\right)`);
    renderMath(stageIndex, shownN);
    if (!stage.animating && stage.k === 0) {
      window.KochMath.render(startStageValue, `n_0=${stage.n0}`);
    }
    renderMath(perimeterCurrent, `P_{${shownN}}=3\\left(\\frac{4}{3}\\right)^{${shownN}}\\approx ${perimeter}`, true);
    renderMath(
      areaCurrent,
      `\\begin{aligned}A_{${shownN}}&=\\frac{8}{5}A_0\\\\&-\\frac{3}{5}A_0\\left(\\frac{4}{9}\\right)^{${shownN}}\\\\&\\approx ${areaValueText}\\end{aligned}`,
      true
    );
    renderMath(areaRatioCurrent, `\\frac{A_{${shownN}}}{A_0}\\approx ${areaRatio.toFixed(6)}`, true);
    stageBadge.dataset.k = String(stage.k);
    stageBadge.dataset.n = String(n);
    stageBadge.dataset.n0 = String(stage.n0);
    stageBadge.setAttribute("aria-label", `확대 ${shownK}번, 배율 3의 ${shownK}승, 단계 ${shownN}`);
    selfSimilarityCaption.hidden = !stage.selfSimilarity;
    const busy = engine ? engine.isAnimating() : false;
    zoomOutButton.disabled = stage.k <= 0 || busy;
    resetButton.disabled = stage.k <= 0 && !busy;
    nextStepButton.disabled = busy;
    if (!stage.animating) {
      status.textContent = `확대 ${stage.k}회가 끝났다. 현재 단계는 ${n}이다. 곡선에 선분 ${stage.segmentsDrawn}개를 그렸다.`;
    }
    canvas.dispatchEvent(new CustomEvent("koch:frame", { detail: stage }));
  }

  try {
    engine = window.KochEngine.createKochEngine(canvas, updatePanel);
  } catch (error) {
    status.textContent = error.message;
    return;
  }

  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const accepted = engine.zoomAt(point.x, point.y);
    if (accepted) {
      zoomOutButton.disabled = true;
      nextStepButton.disabled = true;
      resetButton.disabled = false;
    }
  });

  zoomOutButton.addEventListener("click", () => {
    if (engine.zoomOut()) {
      zoomOutButton.disabled = true;
    }
  });

  nextStepButton.addEventListener("click", () => {
    if (engine.zoomAtCenter()) {
      zoomOutButton.disabled = true;
      nextStepButton.disabled = true;
      resetButton.disabled = false;
    }
  });

  resetButton.addEventListener("click", () => {
    engine.reset();
  });

  fillToggle.addEventListener("change", () => engine.setFill(fillToggle.checked));
})();
