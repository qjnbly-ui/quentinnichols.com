(() => {
  const gallery = document.querySelector('.gallery-grid');
  if (!gallery) return;

  const links = Array.from(gallery.querySelectorAll('a.gallery-link'));
  const images = links.map((link) => link.querySelector('img')).filter(Boolean);
  if (images.length === 0) return;

  const overlay = document.createElement('div');
  overlay.className = 'gallery-lightbox';
  overlay.innerHTML = `
    <div class="gallery-lightbox-inner" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button class="gallery-lightbox-close" aria-label="Close">×</button>
      <button class="gallery-lightbox-nav gallery-lightbox-prev" aria-label="Previous">‹</button>
      <figure class="gallery-lightbox-figure">
        <img class="gallery-lightbox-img" alt="" />
      </figure>
      <button class="gallery-lightbox-nav gallery-lightbox-next" aria-label="Next">›</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const imgEl = overlay.querySelector('.gallery-lightbox-img');
  const btnClose = overlay.querySelector('.gallery-lightbox-close');
  const btnPrev = overlay.querySelector('.gallery-lightbox-prev');
  const btnNext = overlay.querySelector('.gallery-lightbox-next');

  let current = 0;
  let touchStartX = 0;
  let touchEndX = 0;

  const openAt = (index) => {
    current = (index + images.length) % images.length;
    const img = images[current];
    imgEl.src = img.src;
    imgEl.alt = img.alt || '';
    overlay.classList.add('is-open');
  };

  const close = () => {
    overlay.classList.remove('is-open');
    imgEl.removeAttribute('src');
  };

  const next = () => openAt(current + 1);
  const prev = () => openAt(current - 1);

  links.forEach((link, i) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openAt(i);
    });
  });

  btnClose.addEventListener('click', close);
  btnNext.addEventListener('click', next);
  btnPrev.addEventListener('click', prev);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });

  overlay.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  });

  overlay.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    const delta = touchEndX - touchStartX;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) next();
    if (delta > 0) prev();
  });
})();
