(function () {
  "use strict";

  // 쪽을 옮기면 항상 맨 위에서 시작한다. 바깥 틀(아티팩트 창)이 이전 스크롤 위치를 유지하는 경우에도
  // 헤더를 화면 맨 위로 맞춘다.
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch (error) { /* 무시 */ }

  function hashTargetExists() {
    const id = decodeURIComponent((location.hash || "").slice(1));
    return Boolean(id) && Boolean(document.getElementById(id));
  }

  function goTop() {
    if (hashTargetExists()) return;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } catch (error) {
      window.scrollTo(0, 0);
    }
    const header = document.querySelector(".site-header");
    if (header && header.scrollIntoView) {
      try {
        header.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
      } catch (error) {
        header.scrollIntoView(true);
      }
    }
  }

  goTop();
  document.addEventListener("DOMContentLoaded", goTop);
  window.addEventListener("load", () => {
    goTop();
    window.requestAnimationFrame(goTop);
  });
  window.addEventListener("pageshow", (event) => { if (event.persisted) goTop(); });
})();
