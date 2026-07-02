const TripMap = {
  globe: null,
  countdownInterval: null,
  globeReady: false,
  minAltitude: 0.1,
  maxAltitude: 2.5,
  selectedPlace: null,
  _geocodeBusy: false,
  _lastClickAt: 0,
  _selectionFadeTimer: null,

  NOMINATIM_HEADERS: {
    'Accept-Language': 'en',
    'User-Agent': 'TripPlannerJusteDavid/1.0'
  },

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
    this.bindGlobeClick();
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

  bindGlobeClick() {
    if (!this.globe) return;

    this.globe.onGlobeClick(({ lat, lng }) => {
      if (document.querySelector('.modal-overlay:not(.hidden)')) return;
      if (App.activePanel) return;
      if (Date.now() - this._lastClickAt < 350) return;
      this._lastClickAt = Date.now();
      this.handleGlobeClick(lat, lng);
    });
  },

  async reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=10`;
    const res = await fetch(url, { headers: this.NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state_district;
    if (!city) return null;

    return {
      city,
      country: addr.country || '',
      lat: parseFloat(data.lat),
      lng: parseFloat(data.lon),
      osmType: data.osm_type,
      osmId: data.osm_id,
      displayName: data.display_name
    };
  },

  async handleGlobeClick(lat, lng) {
    if (this._geocodeBusy) return;

    this.cancelSelectionTimers();
    this.selectPlace({ city: '…', country: '', lat, lng, pending: true }, { fly: true });

    this._geocodeBusy = true;

    try {
      const place = await this.reverseGeocode(lat, lng);
      if (!place) {
        App.showToast('No city found here — try clicking closer to a town');
        this.scheduleSelectionFadeOut();
        return;
      }

      this.selectPlace(place, { fly: false });
      this.openCityActionModal(place);
    } catch (err) {
      console.error('Geocode failed:', err);
      App.showToast('Could not look up that location');
      this.scheduleSelectionFadeOut();
    } finally {
      this._geocodeBusy = false;
    }
  },

  cancelSelectionTimers() {
    clearTimeout(this._selectionFadeTimer);
    this._selectionFadeTimer = null;
  },

  selectPlace(place, options = {}) {
    const { fly = true } = options;
    this.selectedPlace = place;
    this.renderMarkers();
    if (fly) this.flyTo(place.lat, place.lng, 0.45);
  },

  scheduleSelectionFadeOut() {
    this.cancelSelectionTimers();
    if (!this.selectedPlace) return;

    this._selectionFadeTimer = setTimeout(() => {
      if (!this.selectedPlace) return;
      this.selectedPlace = { ...this.selectedPlace, fading: true };
      this.renderMarkers();

      this._selectionFadeTimer = setTimeout(() => {
        this.selectedPlace = null;
        this.renderMarkers();
        this._selectionFadeTimer = null;
      }, 500);
    }, 1000);
  },

  clearSelection() {
    this.cancelSelectionTimers();
    this.selectedPlace = null;
    this.renderMarkers();
  },

  openCityActionModal(place) {
    document.getElementById('city-action-name').textContent = place.city;
    document.getElementById('city-action-country').textContent = place.country || '';
    App.openModal('city-action-modal');
  },

  getSelectedPlace() {
    return this.selectedPlace;
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
    this.cancelSelectionTimers();
    this.unbindZoomControls();
    this.unbindResize();
    this.selectedPlace = null;
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

  createMarkerEl(d) {
    if (d.isSelectionPin) return this.createSelectionPinEl(d);
    if (d.isWishlistPin) return this.createWishlistMarkerEl(d);
    return this.createTripMarkerEl(d);
  },

  createSelectionPinEl(place) {
    const el = document.createElement('div');
    el.className = `trip-marker selection-pin${place.fading ? ' fade-out' : ''}`;
    const label = place.pending ? '…' : place.city;
    el.innerHTML = `
      <div class="marker-pin selection"><span class="marker-icon">📍</span></div>
      <div class="marker-label">${label}</div>`;
    this.attachMarkerZoomFix(el);
    return el;
  },

  createWishlistMarkerEl(item) {
    const label = item.title || item.city || 'Wishlist';
    const el = document.createElement('div');
    el.className = 'trip-marker wishlist-marker';
    el.innerHTML = `
      <div class="marker-pin wishlist"><span class="marker-icon">★</span></div>
      <div class="marker-label">${label}</div>`;

    const pin = el.querySelector('.marker-pin');
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      Wishlist.openPanel();
      Wishlist.render(item.id);
    });

    this.attachMarkerZoomFix(el);
    return el;
  },

  createTripMarkerEl(trip) {
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

  getMapMarkers(trips = Storage.getTrips()) {
    const user = Auth.getCurrentUser();
    const markers = trips
      .filter((t) => t.status !== 'rejected' && t.lat && t.lng)
      .filter((t) => !Trips.isSurpriseHidden(t, user))
      .map((t) => ({ ...t }));

    Storage.getWishlist()
      .filter((w) => w.type === 'location' && w.lat && w.lng)
      .forEach((w) => {
        markers.push({
          ...w,
          isWishlistPin: true,
          city: w.city || w.title
        });
      });

    if (this.selectedPlace) {
      markers.push({
        id: '__selection__',
        isSelectionPin: true,
        city: this.selectedPlace.city,
        lat: this.selectedPlace.lat,
        lng: this.selectedPlace.lng,
        pending: this.selectedPlace.pending,
        fading: this.selectedPlace.fading
      });
    }

    return markers;
  },

  renderMarkers(trips = Storage.getTrips()) {
    if (!this.globe || !this.globeReady) return;

    this.resize();
    const markers = this.getMapMarkers(trips);
    this.globe.htmlElementsData([...markers]);

    if (!this.selectedPlace) {
      const trips = markers.filter((m) => !m.isSelectionPin && !m.isWishlistPin);
      const mapPoints = markers.filter((m) => !m.isSelectionPin);

      if (trips.length === 1) {
        this.flyTo(trips[0].lat, trips[0].lng, 0.35);
      } else if (trips.length > 1) {
        const avgLat = trips.reduce((s, t) => s + t.lat, 0) / trips.length;
        const avgLng = trips.reduce((s, t) => s + t.lng, 0) / trips.length;
        this.flyTo(avgLat, avgLng, this.getDefaultAltitude());
      } else if (mapPoints.length === 1) {
        this.flyTo(mapPoints[0].lat, mapPoints[0].lng, 0.35);
      } else if (mapPoints.length > 1) {
        const avgLat = mapPoints.reduce((s, t) => s + t.lat, 0) / mapPoints.length;
        const avgLng = mapPoints.reduce((s, t) => s + t.lng, 0) / mapPoints.length;
        this.flyTo(avgLat, avgLng, this.getDefaultAltitude());
      }
    }
  },

  renderTrips(trips) {
    this.renderMarkers(trips);
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
