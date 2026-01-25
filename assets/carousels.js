(() => {
  const setupCarousel = (carousel) => {
    const track = carousel.querySelector('.about-carousel-track');
    if (!track) return;

    const slides = Array.from(track.children);
    if (slides.length <= 1) return;

    let index = 0;
    let timer;

    const getSlideWidth = () => track.clientWidth || carousel.clientWidth;

    const interval = Number.parseInt(carousel.dataset.interval || "3500", 10);

    const advance = () => {
      if (document.hidden) return;
      index = (index + 1) % slides.length;
      track.scrollTo({ left: index * getSlideWidth(), behavior: 'smooth' });
    };

    const start = () => {
      stop();
      timer = setInterval(advance, interval);
    };

    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    track.addEventListener('scroll', () => {
      const width = getSlideWidth();
      if (!width) return;
      index = Math.round(track.scrollLeft / width);
    });

    carousel.addEventListener('mouseenter', stop);
    carousel.addEventListener('mouseleave', start);
    carousel.addEventListener('focusin', stop);
    carousel.addEventListener('focusout', start);

    start();
  };

  document.querySelectorAll('[data-carousel]')
    .forEach(setupCarousel);
})();
