(function () {
  "use strict";

  if (!window.katex) {
    throw new Error("로컬 KaTeX 파일을 불러오지 못했다.");
  }

  const katexOptions = {
    throwOnError: false,
    output: "htmlAndMathml",
    strict: "ignore",
    trust: false
  };

  function render(element, tex, options = {}) {
    if (!element) return false;
    const source = String(tex);
    if (element.dataset.renderedMath === source) return false;

    const now = performance.now();
    const interval = options.minInterval || 0;
    const lastRender = Number(element.dataset.mathRenderedAt || -Infinity);
    if (!options.force && interval > 0 && now - lastRender < interval) return false;

    window.katex.render(source, element, {
      ...katexOptions,
      displayMode: Boolean(options.displayMode)
    });
    element.dataset.renderedMath = source;
    element.dataset.mathRenderedAt = String(now);
    return true;
  }

  function renderStatic(root = document) {
    if (root.matches?.("[data-math]")) {
      render(root, root.dataset.math, {
        displayMode: root.classList.contains("math-display")
      });
    }
    root.querySelectorAll("[data-math]").forEach((element) => {
      render(element, element.dataset.math, {
        displayMode: element.classList.contains("math-display")
      });
    });
  }

  window.KochMath = { render, renderStatic };
  renderStatic();
})();
