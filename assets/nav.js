(() => {
  const nav = document.querySelector(".nav-menu");
  if (!nav) return;

  const mq = window.matchMedia("(min-width: 900px)");
  const sync = () => {
    if (mq.matches) {
      nav.setAttribute("open", "");
    } else {
      nav.removeAttribute("open");
    }
  };

  sync();
  if (mq.addEventListener) {
    mq.addEventListener("change", sync);
  } else {
    mq.addListener(sync);
  }
})();
