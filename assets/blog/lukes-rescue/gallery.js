(() => {
  let active;
  document.querySelectorAll('[data-live-photo]').forEach(button => {
    const video = button.querySelector('video');
    let timer, held = false, generation = 0, origin;
    const stop = () => {
      clearTimeout(timer);
      held = false;
      generation++;
      video.pause();
      if (video.readyState) video.currentTime = 0;
      button.removeAttribute('data-playing');
      button.setAttribute('aria-pressed', 'false');
      if (active === stop) active = undefined;
    };
    const start = async () => {
      if (active) active();
      active = stop;
      held = true;
      const token = ++generation;
      if (!video.src) video.src = video.dataset.liveSrc;
      video.muted = true;
      try {
        await video.play();
        if (held && token === generation) {
          button.setAttribute('data-playing', '');
          button.setAttribute('aria-pressed', 'true');
        } else if (!held) video.pause();
      } catch { if (token === generation) stop(); }
    };
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      stop();
      origin = { x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
      timer = setTimeout(start, 180);
    });
    button.addEventListener('pointermove', event => {
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) { origin = undefined; stop(); }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(name => button.addEventListener(name, stop));
    button.addEventListener('contextmenu', event => event.preventDefault());
    button.addEventListener('keydown', event => {
      if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) start(); }
    });
    button.addEventListener('keyup', event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); stop(); } });
  });
  window.addEventListener('blur', () => active?.());
  document.addEventListener('visibilitychange', () => { if (document.hidden) active?.(); });
})();
