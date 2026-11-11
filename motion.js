(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // Fade-in: only hide cards that start off-screen, so no-JS and first paint stay visible.
  var cards = document.querySelectorAll(".cover-grid > li, .artist-grid > li, .feature");
  if (cards.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          e.target.classList.remove("is-hidden");
          io.unobserve(e.target);
        } else {
          e.target.classList.add("is-hidden");
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    cards.forEach(function (el) { io.observe(el); });
  }

  // Rocco peek: a small head pops up from the bottom-right, about once every 2–3 minutes.
  var peek = document.createElement("pre");
  peek.className = "rocco-peek";
  peek.setAttribute("aria-hidden", "true");
  peek.textContent = "  /\\_/\\\n ( o.o )";
  document.body.appendChild(peek);
  function schedulePeek() {
    setTimeout(function () {
      peek.classList.add("is-up");
      setTimeout(function () {
        peek.classList.remove("is-up");
        schedulePeek();
      }, 2000);
    }, 120000 + Math.random() * 60000);
  }
  schedulePeek();
})();
