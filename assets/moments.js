(() => {
  const gallery = document.querySelector('#moments-gallery');
  const status = document.querySelector('#moments-status');
  const count = document.querySelector('#moments-count');
  const sort = document.querySelector('#moments-sort');
  const dialog = document.querySelector('#moment-viewer');
  const expanded = document.querySelector('#moment-image');
  const caption = document.querySelector('#moment-caption');
  const locationLabel = document.querySelector('#moment-location');
  const showOnMap = document.querySelector('#moment-show-on-map');
  const mapPanel = document.querySelector('#moments-map-panel');
  const photosView = document.querySelector('#show-moment-photos');
  const mapView = document.querySelector('#show-moment-map');
  const dated = image => typeof image.date === 'string' && Number.isFinite(Date.parse(image.date));
  const dateText = image => dated(image) ? month.format(new Date(image.date)) : '';
  const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  let images = [], active = 0, signature = '', busy = false, lastFetch = 0;
  let mapModule, mapReady = false, mapFocus = null;
  const hasLocation = image => image.location && typeof image.location.label === 'string' && image.location.label.trim() &&
    Number.isFinite(image.location.latitude) && Math.abs(image.location.latitude) <= 90 &&
    Number.isFinite(image.location.longitude) && Math.abs(image.location.longitude) <= 180;
  const updateMap = () => {
    if (mapReady) document.dispatchEvent(new CustomEvent('n3xra:photo-map-update', { detail: { photos: images, focusId: mapFocus } }));
  };
  async function setView(view, focusId = null) {
    const map = view === 'map';
    document.body.classList.toggle('moments-map-active', map);
    if (map) window.scrollTo({top:0,behavior:'instant'});
    gallery.hidden = map; mapPanel.hidden = !map;
    photosView.setAttribute('aria-pressed', String(!map)); mapView.setAttribute('aria-pressed', String(map));
    sort.disabled = map;
    sort.closest('label').classList.toggle('is-map-view', map);
    if (!map) return;
    mapFocus = focusId;
    if (!mapModule) {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/assets/n3xra-photo-map.css?v=20261019'; document.head.append(css);
      mapModule = import('/assets/n3xra-photo-map.js?v=20261019').catch(() => { mapModule = null; status.textContent = 'The map could not load. Please try again.'; });
    }
    await mapModule; updateMap();
  }
  document.addEventListener('n3xra:photo-map-error', () => { status.textContent = 'The map could not load. Please try again shortly.'; });
  document.addEventListener('n3xra:photo-map-ready', () => { mapReady = true; updateMap(); });
  document.addEventListener('n3xra:photo-select', event => {
    const index = images.findIndex(image => image.id === event.detail?.id);
    if (index >= 0) { show(index); if (!dialog.open) dialog.showModal(); }
  });
  photosView.addEventListener('click', () => setView('photos'));
  mapView.addEventListener('click', () => setView('map'));
  showOnMap.addEventListener('click', () => { const id = images[active]?.id; dialog.close(); setView('map', id);  });
  const allowed = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'vdbjlgmbpykjblprqnak.supabase.co' && url.pathname.startsWith('/storage/v1/object/public/website-assets-public/851e334c-2ed7-4c82-9690-27f9ff8792d4/'); }
    catch { return false; }
  };
  function show(index) {
    active = (index + images.length) % images.length;
    const image = images[active];
    expanded.src = image.image;
    expanded.alt = image.caption;
    caption.textContent = [image.caption, dateText(image)].filter(Boolean).join(' · ');
    const located = hasLocation(image);
    locationLabel.textContent = located ? `${image.location.label}${image.location.source === 'estimated' ? ' · Estimated area' : image.location.precision === 'approximate' ? ' · Approximate area' : ''}` : 'Location not recorded';
    showOnMap.hidden = !located;
  }
  function render() {
    const activeId = dialog.open ? images[active]?.id : null;
    images.sort((a,b) => !dated(a) ? (dated(b) ? 1 : a.id.localeCompare(b.id)) : !dated(b) ? -1 : sort.value === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
    const fragment = document.createDocumentFragment();
    for (const [index, image] of images.entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'moment-card';
      button.setAttribute('aria-label', `Open ${image.caption}${dateText(image) ? ', ' + dateText(image) : ''}`);
      const img = document.createElement('img');
      img.src = image.thumbnail; img.alt = image.caption;
      if (Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0) { img.width = image.width; img.height = image.height; }
      img.loading = index < 6 ? 'eager' : 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        img.hidden = true;
        const message = document.createElement('span');
        message.className = 'moment-unavailable'; message.textContent = 'Photo connection unavailable.';
        img.after(message);
        if (Date.now() - lastFetch > 30000) load();
      }, { once: true });
      const meta = document.createElement('div'); meta.className = 'moment-meta';
      const text = document.createElement('span'); text.textContent = image.caption;
      const date = document.createElement('time'); if (dated(image)) date.dateTime = image.date; date.textContent = dateText(image);
      if (dateText(image)) { meta.append(date); button.append(img, meta); } else button.append(img);
      button.addEventListener('click', () => { show(index); dialog.showModal(); });
      fragment.append(button);
    }
    gallery.replaceChildren(fragment);
    count.textContent = `${images.length} moments`;
    updateMap();
    if (activeId) {
      const index = images.findIndex(image => image.id === activeId);
      if (index < 0) dialog.close(); else show(index);
    }
  }
  async function load() {
    if (busy || document.hidden) return;
    busy = true; lastFetch = Date.now();
    try {
      const response = await fetch('/api/moments-feed', { cache: 'no-store', credentials: 'omit' });
      if (!response.ok) throw new Error('Feed unavailable');
      const feed = await response.json();
      if (!Array.isArray(feed.images)) throw new Error('Invalid feed');
      const valid = feed.images.filter(image => allowed(image.image) && allowed(image.thumbnail) && (image.date == null || dated(image)));
      const next = JSON.stringify(valid);
      if (signature !== next) { images = valid; signature = next; render(); }
      status.textContent = images.length ? '' : 'New moments will appear here soon.';
    } catch {
      status.textContent = images.length ? 'The connection is resting. More moments will appear when it returns.' : 'The camera roll is taking a moment. Please try again shortly.';
    } finally { busy = false; }
  }
  document.querySelector('#moment-close').addEventListener('click', () => dialog.close());
  document.querySelector('#moment-prev').addEventListener('click', () => show(active - 1));
  document.querySelector('#moment-next').addEventListener('click', () => show(active + 1));
  expanded.referrerPolicy = 'no-referrer';
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(active - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(active + 1); }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  sort.addEventListener('change', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(load, 60000);
  load();
})();
