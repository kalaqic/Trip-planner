const TripMap = {
  globe: null,
  countdownInterval: null,
  globeReady: false,
  minAltitude: 0.1,
  maxAltitude: 2.5,

  tileUrl(x, y, l) {
    return `https://basemaps.cartocdn.com/rastertiles/voyager/${l}/${x}/${y}.png`;
  },

  getMapSize() {
    const container = document.getElementById('map');
    if (!container) return { w: window.innerWidth, h: window.innerHeight };

    const rect = container.getBoundingClientRect();
    const w = Math.round(rect.width) || window.innerWidth;
    const h = Math.round(rect.height) || window.innerHeight;
    return { w: Math.max(w, 1), h: Math.max(h, 1) };
  },

  getDefaultAltitude() {
    const { w } = this.getMapSize();
    return w < 480 ? 2.55 : 2.2;
  },

  resize() {
    if (!this.globe) return;

    const { w, h } = this.getMapSize();
    this.globe.width(w).height(h);

    const renderer = this.globe.renderer?.();
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    }

    const camera = this.globe.camera?.();
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  },

  bindResize() {
    this._onResize = () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.resize(), 80);
    };

    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('scroll', this._onResize);
  },

  unbindResize() {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
      window.visualViewport?.removeEventListener('resize', this._onResize);
      window.visualViewport?.removeEventListener('scroll', this._onResize);
    }
    clearTimeout(this._resizeTimer);
    this._onResize = null;
  },

  init() {
    if (this.globe) {
      this.resize();
      return;
    }

    const container = document.getElementById('map');
    const { w, h } = this.getMapSize();

    this.globe = Globe()
      .width(w)
      .height(h)
      .globeTileEngineUrl((x, y, l) => this.tileUrl(x, y, l))
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#6ecbf5')
      .atmosphereAltitude(0.2)
      .htmlLat(d => d.lat)
      .htmlLng(d => d.lng)
      .htmlAltitude(0.003)
      .htmlElement(d => this.createMarkerEl(d))
      (container);

    const controls = this.globe.controls();
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.autoRotate = false;
    controls.minDistance = 120;
    controls.maxDistance = 500;

    this.bindResize();
    this.resize();

    const altitude = this.getDefaultAltitude();
    this.globe.pointOfView({ lat: 48, lng: 10, altitude }, 0);

    this.globeReady = true;
    this.startCountdownUpdates();
    this.bindZoomControls();
    this.refresh();
    this.ensureAttribution();

    requestAnimationFrame(() => this.resize());
    setTimeout(() => this.resize(), 150);
    setTimeout(() => this.resize(), 400);
  },

  getPOV() {
    return this.globe.pointOfView();
  },

  zoomIn() {
    if (!this.globe) return;
    const pov = this.getPOV();
    const altitude = Math.max(this.minAltitude, pov.altitude * 0.72);
    this.globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude }, 280);
  },

  zoomOut() {
    if (!this.globe) return;
    const pov = this.getPOV();
    const altitude = Math.min(this.maxAltitude, pov.altitude * 1.38);
    this.globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude }, 280);
  },

  zoomByWheel(deltaY) {
    if (deltaY < 0) this.zoomIn();
    else if (deltaY > 0) this.zoomOut();
  },

  bindZoomControls() {
    const container = document.getElementById('map');

    this._onWheel = (e) => {
      if (e.ctrlKey) e.preventDefault();
    };
    container.addEventListener('wheel', this._onWheel, { passive: false });

    this._onKeyDown = (e) => {
      if (!this.globeReady) return;
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.modal-overlay:not(.hidden)')) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.zoomIn();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.zoomOut();
      }
    };
    document.addEventListener('keydown', this._onKeyDown);

    document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomOut());
  },

  unbindZoomControls() {
    const container = document.getElementById('map');
    if (this._onWheel) container?.removeEventListener('wheel', this._onWheel);
    if (this._onKeyDown) document.removeEventListener('keydown', this._onKeyDown);
    this._onWheel = null;
    this._onKeyDown = null;
  },

  ensureAttribution() {
    if (document.getElementById('map-attribution')) return;
    const el = document.createElement('div');
    el.id = 'map-attribution';
    el.className = 'map-attribution';
    el.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> · <a href="https://carto.com/" target="_blank" rel="noopener">CARTO</a>';
    document.getElementById('app').appendChild(el);
  },

  destroy() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.unbindZoomControls();
    this.unbindResize();
    document.getElementById('map-attribution')?.remove();
    if (this.globe) {
      document.getElementById('map').innerHTML = '';
      this.globe = null;
    }
    this.globeReady = false;
  },

  getTripStatus(trip) {
    if (trip.status === 'pending') return 'pending';
    const now = new Date();
    const end = new Date(trip.endDate + 'T23:59:59');
    if (end < now) return 'visited';
    return 'upcoming';
  },

  getCountdown(startDate) {
    const now = new Date();
    const start = new Date(startDate + 'T00:00:00');
    const diff = start - now;
    if (diff <= 0) return null;

    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  },

  attachMarkerZoomFix(el) {
    const forwardWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.zoomByWheel(e.deltaY);
    };

    el.addEventListener('wheel', forwardWheel, { passive: false });

    el.querySelectorAll('.marker-pin, .marker-countdown, .marker-label').forEach(child => {
      child.addEventListener('wheel', forwardWheel, { passive: false });
    });
  },

  createMarkerEl(trip) {
    const status = this.getTripStatus(trip);
    const icon = status === 'visited' ? '✓' : status === 'upcoming' ? '⏱' : '⏳';
    let countdownHtml = '';

    if (status === 'upcoming') {
      const cd = this.getCountdown(trip.startDate);
      if (cd) countdownHtml = `<div class="marker-countdown" data-trip="${trip.id}">${cd}</div>`;
    }

    const el = document.createElement('div');
    el.className = 'trip-marker';
    el.innerHTML = `
      <div class="marker-pin ${status}"><span class="marker-icon">${icon}</span></div>
      ${countdownHtml}
      <div class="marker-label">${trip.city}</div>`;

    const pin = el.querySelector('.marker-pin');
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      Trips.showDetail(trip.id);
    });

    this.attachMarkerZoomFix(el);
    return el;
  },

  renderTrips(trips) {
    if (!this.globe || !this.globeReady) return;

    this.resize();

    const visible = trips
      .filter(t => t.status !== 'rejected' && t.lat && t.lng)
      .map(t => ({ ...t }));

    this.globe.htmlElementsData([...visible]);

    if (visible.length === 1) {
      this.flyTo(visible[0].lat, visible[0].lng, 0.35);
    } else if (visible.length > 1) {
      const avgLat = visible.reduce((s, t) => s + t.lat, 0) / visible.length;
      const avgLng = visible.reduce((s, t) => s + t.lng, 0) / visible.length;
      this.flyTo(avgLat, avgLng, this.getDefaultAltitude());
    }
  },

  flyTo(lat, lng, altitude = 0.4) {
    if (!this.globe) return;
    this.globe.pointOfView({ lat, lng, altitude }, 1800);
  },

  startCountdownUpdates() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(() => {
      document.querySelectorAll('.marker-countdown').forEach(el => {
        const trip = Storage.getTrips().find(t => t.id === el.dataset.trip);
        if (!trip) return;
        const cd = this.getCountdown(trip.startDate);
        if (cd) el.textContent = cd;
        else el.remove();
      });
    }, 60000);
  },

  refresh() {
    this.renderTrips(Storage.getTrips());
  }
};
