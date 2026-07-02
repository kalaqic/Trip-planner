const Trips = {
  wizard: {
    city: null, lat: null, lng: null, country: null, type: null,
    legs: [],
    editingLegId: null,
    editingRoute: null,
    editingTripId: null
  },

  ROUTE_LABELS: {
    together: '👫 Traveling together',
    juste: "Juste's route",
    david: "David's route"
  },

  ROUTE_BADGES: {
    together: '<span class="leg-route-badge together">👫 Together</span>',
    juste: '<span class="leg-route-badge juste">Juste</span>',
    david: '<span class="leg-route-badge david">David</span>'
  },

  TRANSPORT_ICONS: { plane: '✈', bus: '🚌', train: '🚂', car: '🚗', ferry: '⛴', walking: '🚶' },
  TRANSPORT_LABELS: { plane: 'Plane', bus: 'Bus', train: 'Train', car: 'Car', ferry: 'Ferry', walking: 'Walking' },

  resetWizard() {
    this.wizard = {
      city: null, lat: null, lng: null, country: null, type: null,
      legs: [], editingLegId: null, editingRoute: null, editingTripId: null
    };
    document.getElementById('city-search').value = '';
    document.getElementById('city-results').innerHTML = '';
    document.getElementById('trip-form').reset();
    document.getElementById('trip-surprise').checked = false;
    document.querySelectorAll('.workaway-field, .basic-field').forEach(el => el.classList.add('hidden'));
    document.getElementById('leg-form').classList.add('hidden');
    document.getElementById('leg-route-picker').classList.add('hidden');
    this.renderJourneyTimeline();
    this.updateJourneyTotal();
  },

  showStep(stepId) {
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    document.getElementById(stepId).classList.remove('hidden');
  },

  openAddModal() {
    this.resetWizard();
    this.updateWizardUi();
    this.showStep('step-city');
    App.openModal('add-trip-modal');
    setTimeout(() => document.getElementById('city-search').focus(), 300);
  },

  openAddModalWithCity({ city, lat, lng, country }) {
    this.resetWizard();
    this.wizard.city = city;
    this.wizard.lat = lat;
    this.wizard.lng = lng;
    this.wizard.country = country || '';
    document.getElementById('city-search').value = `${city}${country ? ', ' + country : ''}`;
    document.getElementById('selected-city-label').textContent = `${city}${country ? ', ' + country : ''}`;
    this.updateWizardUi();
    this.showStep('step-type');
    App.openModal('add-trip-modal');
  },

  openEditModal(tripId) {
    const trip = Storage.getTrips().find(t => t.id === tripId);
    if (!trip) return;
    if (this.getStatus(trip) === 'visited') {
      App.showToast('Completed trips cannot be edited');
      return;
    }

    this.wizard = {
      city: trip.city,
      lat: trip.lat,
      lng: trip.lng,
      country: trip.country,
      type: trip.type,
      legs: JSON.parse(JSON.stringify(this.sortLegsByTime(this.getOrderedJourneyLegs(trip)))),
      editingLegId: null,
      editingRoute: null,
      editingTripId: tripId
    };

    document.getElementById('city-search').value = `${trip.city}, ${trip.country || ''}`;
    document.getElementById('trip-name').value = trip.name || '';
    document.getElementById('trip-desc').value = trip.description || '';
    document.getElementById('trip-notes').value = trip.planningNotes || '';
    document.getElementById('trip-start').value = trip.startDate || '';
    document.getElementById('trip-end').value = trip.endDate || '';
    document.getElementById('trip-surprise').checked = !!trip.isSurprise;
    document.getElementById('workaway-url').value = trip.workawayUrl || '';
    document.getElementById('apartment-location').value = trip.apartmentLocation || '';
    document.getElementById('booking-link').value = trip.bookingLink || '';

    document.querySelectorAll('.workaway-field').forEach(el =>
      el.classList.toggle('hidden', trip.type !== 'workaway'));
    document.querySelectorAll('.basic-field').forEach(el =>
      el.classList.toggle('hidden', trip.type !== 'basic'));

    document.getElementById('selected-city-label').textContent =
      `${trip.city}, ${trip.country || ''}`;
    document.getElementById('leg-form').classList.add('hidden');
    document.getElementById('leg-route-picker').classList.add('hidden');

    this.updateWizardUi();
    this.renderJourneyTimeline();
    this.updateJourneyTotal();
    this.showStep('step-details');

    App.closeModal('trip-detail-modal');
    App.openModal('add-trip-modal');
  },

  updateWizardUi() {
    const editing = !!this.wizard.editingTripId;
    const cityTitle = document.querySelector('#step-city h2');
    const detailsTitle = document.querySelector('#step-details h2');
    const journeyTitle = document.querySelector('#step-journey h2');
    if (cityTitle) cityTitle.textContent = editing ? 'Edit destination' : 'New Trip';
    if (detailsTitle) detailsTitle.textContent = editing ? 'Edit trip details' : 'Trip Details';
    if (journeyTitle) journeyTitle.textContent = editing ? 'Edit transport' : 'How do we get there?';
    document.getElementById('submit-trip').textContent =
      editing ? 'Save changes' : 'Send for Approval';
  },

  async searchCity(query) {
    const resultsEl = document.getElementById('city-results');
    if (query.length < 2) { resultsEl.innerHTML = ''; return; }

    resultsEl.innerHTML = '<div class="search-loading"><span class="spinner"></span> Searching...</div>';

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&featuretype=city`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      const data = await res.json();

      if (!data.length) {
        resultsEl.innerHTML = '<div class="search-loading">No cities found</div>';
        return;
      }

      resultsEl.innerHTML = data.map(place => `
        <div class="search-result" data-lat="${place.lat}" data-lng="${place.lon}"
             data-name="${place.name}" data-country="${place.display_name.split(',').pop().trim()}">
          <span class="result-icon">📍</span>
          <div>
            <div class="result-name">${place.name}</div>
            <div class="result-country">${place.display_name}</div>
          </div>
        </div>`).join('');

      resultsEl.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('click', () => {
          this.wizard.city = el.dataset.name;
          this.wizard.lat = parseFloat(el.dataset.lat);
          this.wizard.lng = parseFloat(el.dataset.lng);
          this.wizard.country = el.dataset.country;
          this.showStep('step-type');
        });
      });
    } catch (_) {
      resultsEl.innerHTML = '<div class="search-loading">Search failed. Try again.</div>';
    }
  },

  selectType(type) {
    this.wizard.type = type;
    document.getElementById('selected-city-label').textContent = `${this.wizard.city}, ${this.wizard.country}`;
    document.querySelectorAll('.workaway-field').forEach(el => el.classList.toggle('hidden', type !== 'workaway'));
    document.querySelectorAll('.basic-field').forEach(el => el.classList.toggle('hidden', type !== 'basic'));
    this.showStep('step-details');
  },

  timeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  },

  sortLegsByTime(legs) {
    return [...legs].sort((a, b) => {
      const departA = this.timeToMinutes(a.departTime);
      const departB = this.timeToMinutes(b.departTime);
      if (departA === null && departB === null) return 0;
      if (departA === null) return 1;
      if (departB === null) return -1;
      if (departA !== departB) return departA - departB;
      const arriveA = this.timeToMinutes(a.arriveTime);
      const arriveB = this.timeToMinutes(b.arriveTime);
      if (arriveA === null && arriveB === null) return 0;
      if (arriveA === null) return 1;
      if (arriveB === null) return -1;
      return arriveA - arriveB;
    });
  },

  findLeg(legId) {
    return this.wizard.legs.find(l => l.id === legId);
  },

  inferJourneyMode(legs) {
    const routes = new Set(legs.map(l => l.route));
    const hasT = routes.has('together');
    const hasJ = routes.has('juste');
    const hasD = routes.has('david');
    if (hasT && (hasJ || hasD)) return 'mixed';
    if (hasT) return 'together';
    return 'separate';
  },

  splitJourneyLegs(legs) {
    const sorted = this.sortLegsByTime(legs);
    return {
      legs: [...sorted],
      together: sorted.filter(l => l.route === 'together'),
      juste: sorted.filter(l => l.route === 'juste'),
      david: sorted.filter(l => l.route === 'david')
    };
  },

  startAddLeg() {
    this.wizard.editingLegId = null;
    this.wizard.editingRoute = null;
    document.getElementById('leg-form').classList.add('hidden');
    document.getElementById('leg-route-picker').classList.remove('hidden');
    document.getElementById('leg-route-picker').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  cancelRoutePick() {
    document.getElementById('leg-route-picker').classList.add('hidden');
  },

  pickRoute(route) {
    document.getElementById('leg-route-picker').classList.add('hidden');
    this.openLegForm(null, route);
  },

  openLegForm(legId = null, route = null) {
    if (!legId && !route) {
      this.startAddLeg();
      return;
    }

    const leg = legId ? this.findLeg(legId) : null;
    const targetRoute = leg ? leg.route : route;
    if (!targetRoute) return;

    this.wizard.editingLegId = legId;
    this.wizard.editingRoute = targetRoute;

    document.getElementById('leg-route-picker').classList.add('hidden');
    const form = document.getElementById('leg-form');
    form.classList.remove('hidden');
    document.getElementById('leg-form-route').textContent = this.ROUTE_LABELS[targetRoute];

    if (leg) {
      document.getElementById('leg-form-title').textContent = 'Edit transport leg';
      document.getElementById('leg-type').value = leg.type;
      document.getElementById('leg-from').value = leg.from;
      document.getElementById('leg-to').value = leg.to;
      document.getElementById('leg-depart').value = leg.departTime;
      document.getElementById('leg-arrive').value = leg.arriveTime;
      document.getElementById('leg-price').value = leg.price || '';
      document.getElementById('leg-ticket').value = leg.ticketLink || '';
      document.getElementById('save-leg').textContent = 'Save leg';
    } else {
      document.getElementById('leg-form-title').textContent = 'Add transport leg';
      document.getElementById('leg-type').value = 'plane';
      document.getElementById('leg-from').value = '';
      document.getElementById('leg-to').value = '';
      document.getElementById('leg-depart').value = '';
      document.getElementById('leg-arrive').value = '';
      document.getElementById('leg-price').value = '';
      document.getElementById('leg-ticket').value = '';
      document.getElementById('save-leg').textContent = 'Add leg';
    }

    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  closeLegForm() {
    document.getElementById('leg-form').classList.add('hidden');
    document.getElementById('leg-route-picker').classList.add('hidden');
    this.wizard.editingLegId = null;
    this.wizard.editingRoute = null;
  },

  saveLeg() {
    const leg = {
      id: this.wizard.editingLegId || generateId(),
      route: this.wizard.editingRoute,
      type: document.getElementById('leg-type').value,
      from: document.getElementById('leg-from').value.trim(),
      to: document.getElementById('leg-to').value.trim(),
      departTime: document.getElementById('leg-depart').value,
      arriveTime: document.getElementById('leg-arrive').value,
      price: parseFloat(document.getElementById('leg-price').value) || 0,
      ticketLink: document.getElementById('leg-ticket').value.trim()
    };

    if (!leg.from || !leg.to) {
      App.showToast('Please fill in From and To');
      return;
    }

    if (this.wizard.editingLegId) {
      const idx = this.wizard.legs.findIndex(l => l.id === this.wizard.editingLegId);
      if (idx > -1) this.wizard.legs[idx] = leg;
    } else {
      this.wizard.legs.push(leg);
    }

    this.wizard.legs = this.sortLegsByTime(this.wizard.legs);
    this.closeLegForm();
    this.renderJourneyTimeline();
    this.updateJourneyTotal();
  },

  removeLeg(legId) {
    this.wizard.legs = this.wizard.legs.filter(l => l.id !== legId);
    this.renderJourneyTimeline();
    this.updateJourneyTotal();
  },

  renderJourneyTimeline() {
    const container = document.getElementById('journey-timeline');
    const legs = this.sortLegsByTime(this.wizard.legs);

    if (!legs.length) {
      container.innerHTML = '<div class="timeline-empty">No legs yet — tap + Add transport leg</div>';
      return;
    }

    container.innerHTML = legs.map((leg, i) => `
      <div class="timeline-leg" data-leg="${leg.id}">
        <div class="timeline-rail">
          <div class="timeline-dot ${leg.type}">${this.TRANSPORT_ICONS[leg.type]}</div>
          ${i < legs.length - 1 ? '<div class="timeline-line"></div>' : ''}
        </div>
        <div class="timeline-content">
          ${this.ROUTE_BADGES[leg.route] || ''}
          <div class="timeline-route">
            <strong>${leg.from}</strong>
            <span class="timeline-arrow">→</span>
            <strong>${leg.to}</strong>
          </div>
          <div class="timeline-meta">
            ${leg.departTime ? `<span>🕐 ${leg.departTime}` : ''}${leg.arriveTime ? ` – ${leg.arriveTime}</span>` : ''}
            ${leg.price ? `<span class="timeline-price">€${leg.price.toFixed(2)}</span>` : ''}
          </div>
          ${leg.ticketLink ? `<a class="timeline-ticket" href="${leg.ticketLink}" target="_blank" rel="noopener">🎫 View ticket</a>` : ''}
          <div class="timeline-leg-actions">
            <button type="button" class="btn-text" data-edit-leg="${leg.id}">Edit</button>
            <button type="button" class="btn-text danger" data-remove-leg="${leg.id}">Remove</button>
          </div>
        </div>
      </div>`).join('');

    container.querySelectorAll('[data-edit-leg]').forEach(btn => {
      btn.addEventListener('click', () => this.openLegForm(btn.dataset.editLeg));
    });
    container.querySelectorAll('[data-remove-leg]').forEach(btn => {
      btn.addEventListener('click', () => this.removeLeg(btn.dataset.removeLeg));
    });
  },

  calcTotalCost() {
    return this.wizard.legs.reduce((s, l) => s + (l.price || 0), 0);
  },

  updateJourneyTotal() {
    document.getElementById('journey-total-cost').textContent = `€${this.calcTotalCost().toFixed(2)}`;
  },

  goToJourneyStep() {
    const form = document.getElementById('trip-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    this.showStep('step-journey');
    this.renderJourneyTimeline();
    this.updateJourneyTotal();
  },

  async submitTrip() {
    const user = Auth.getCurrentUser();
    const other = Auth.getOtherUser(user);
    if (!this.wizard.legs.length) {
      App.showToast('Add at least one transport leg');
      return;
    }

    try {
    const tripData = {
      city: this.wizard.city,
      country: this.wizard.country,
      lat: this.wizard.lat,
      lng: this.wizard.lng,
      type: this.wizard.type,
      name: document.getElementById('trip-name').value.trim(),
      description: document.getElementById('trip-desc').value.trim(),
      planningNotes: document.getElementById('trip-notes').value.trim(),
      startDate: document.getElementById('trip-start').value,
      endDate: document.getElementById('trip-end').value,
      journeyMode: this.inferJourneyMode(this.wizard.legs),
      journey: this.splitJourneyLegs(this.wizard.legs),
      totalCost: this.calcTotalCost(),
      workawayUrl: document.getElementById('workaway-url').value.trim(),
      apartmentLocation: document.getElementById('apartment-location').value.trim(),
      bookingLink: document.getElementById('booking-link').value.trim(),
      isSurprise: document.getElementById('trip-surprise').checked
    };

    if (this.wizard.editingTripId) {
      const existing = Storage.getTrips().find(t => t.id === this.wizard.editingTripId);
      if (!existing) return;

      const wasApproved = existing.status === 'approved';
      const updates = {
        ...tripData,
        mainPhoto: existing.mainPhoto,
        photos: existing.photos || [],
        completionNotes: existing.completionNotes || '',
        createdBy: existing.createdBy,
        createdAt: existing.createdAt
      };

      if (wasApproved) {
        updates.status = 'pending';
        updates.approvedBy = null;
      }

      const updated = await Storage.updateTrip(this.wizard.editingTripId, updates);
      const editorName = Auth.getUserInfo(user).name;

      if (wasApproved) {
        await Messaging.sendTripForApproval(updated, user, other, editorName, true);
        App.showToast(`Changes sent to ${Auth.getUserInfo(other).name} for approval!`);
      } else {
        App.showToast('Trip updated!');
      }
    } else {
      const trip = {
        id: generateId(),
        ...tripData,
        mainPhoto: null,
        photos: [],
        completionNotes: '',
        status: 'pending',
        createdBy: user,
        approvedBy: null,
        createdAt: new Date().toISOString()
      };

      await Storage.addTrip(trip);
      await Messaging.sendTripForApproval(trip, user, other, Auth.getUserInfo(user).name);
      App.showToast(trip.isSurprise
        ? `Surprise trip sent to ${Auth.getUserInfo(other).name}! ✨`
        : `Trip sent to ${Auth.getUserInfo(other).name} for approval!`);
    }

    this.resetWizard();
    App.closeModal('add-trip-modal');
    TripMap.refresh();
    this.renderList();
    Messaging.render();
    Messaging.updateBadge();
    } catch (err) {
      console.error('Failed to save trip:', err);
      App.showToast('Could not save trip. Try again.');
    }
  },

  getStatus(trip) {
    if (trip.status === 'pending') return 'pending';
    const now = new Date();
    if (new Date(trip.endDate + 'T23:59:59') < now) return 'visited';
    return 'upcoming';
  },

  isCompleted(trip) {
    return trip.status === 'approved' && this.getStatus(trip) === 'visited';
  },

  isSurpriseHidden(trip, user = Auth.getCurrentUser()) {
    if (!trip?.isSurprise || !user) return false;
    if (trip.createdBy === user) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(`${trip.startDate}T00:00:00`);
    return today < start;
  },

  formatDateRange(trip) {
    return `${this.formatDate(trip.startDate)} – ${this.formatDate(trip.endDate)}`;
  },

  getCreatorName(trip) {
    return Auth.getUserInfo(trip.createdBy)?.name || trip.createdBy;
  },

  getCountdown(startDate) {
    const diff = new Date(startDate + 'T00:00:00') - new Date();
    if (diff <= 0) return null;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (days > 0) return { label: 'until departure', value: `${days}d ${hours}h ${mins}m` };
    if (hours > 0) return { label: 'until departure', value: `${hours}h ${mins}m ${secs}s` };
    return { label: 'until departure', value: `${mins}m ${secs}s` };
  },

  formatDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  formatTime(t) {
    if (!t) return '';
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  },

  calcTripDuration(depart, arrive) {
    if (!depart || !arrive) return '';
    const [dh, dm] = depart.split(':').map(Number);
    const [ah, am] = arrive.split(':').map(Number);
    let mins = (ah * 60 + am) - (dh * 60 + dm);
    if (mins < 0) mins += 24 * 60;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  },

  getOrderedJourneyLegs(trip) {
    let legs;
    if (trip.journey.legs?.length) {
      legs = trip.journey.legs;
    } else {
      legs = [];
      (trip.journey.together || []).forEach(l => legs.push({ ...l, route: l.route || 'together' }));
      (trip.journey.juste || []).forEach(l => legs.push({ ...l, route: l.route || 'juste' }));
      (trip.journey.david || []).forEach(l => legs.push({ ...l, route: l.route || 'david' }));
    }
    return this.sortLegsByTime(legs);
  },

  renderJourneyDetail(trip) {
    if (!trip.journey) {
      const old = trip.transports?.map(t => `<span class="detail-tag">${this.TRANSPORT_ICONS[t] || ''} ${t}</span>`).join('') || '';
      return old ? `<div class="detail-section"><h4>Transportation</h4><div class="detail-tags">${old}</div></div>` : '';
    }

    const legs = this.getOrderedJourneyLegs(trip);
    if (!legs.length) return '';

    return `<div class="detail-section">
      <h4>🧭 How we get there</h4>
      <div class="journey-display mixed-route">${legs.map((leg, i) => `
        <div class="journey-leg">
          <div class="journey-leg-rail">
            <div class="journey-dot ${leg.type}">${this.TRANSPORT_ICONS[leg.type]}</div>
            ${i < legs.length - 1 ? '<div class="journey-line"></div>' : ''}
          </div>
          <div class="journey-leg-body">
            ${leg.route ? (this.ROUTE_BADGES[leg.route] || '') : ''}
            <div class="journey-leg-type">${this.TRANSPORT_LABELS[leg.type]}</div>
            <div class="journey-stops">
              <div class="journey-stop from">
                <span class="stop-label">From</span>
                <strong>${leg.from}</strong>
                ${leg.departTime ? `<span class="stop-time">${this.formatTime(leg.departTime)}</span>` : ''}
              </div>
              <div class="journey-connector">
                <span class="duration">${this.calcTripDuration(leg.departTime, leg.arriveTime) || '—'}</span>
              </div>
              <div class="journey-stop to">
                <span class="stop-label">To</span>
                <strong>${leg.to}</strong>
                ${leg.arriveTime ? `<span class="stop-time">${this.formatTime(leg.arriveTime)}</span>` : ''}
              </div>
            </div>
            <div class="journey-leg-footer">
              ${leg.price ? `<span class="leg-cost">€${leg.price.toFixed(2)}</span>` : ''}
              ${leg.ticketLink ? `<a href="${leg.ticketLink}" target="_blank" rel="noopener" class="leg-ticket">🎫 Tickets</a>` : ''}
            </div>
          </div>
        </div>`).join('')}</div>
    </div>`;
  },

  readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async saveMemories(tripId) {
    const trip = Storage.getTrips().find(t => t.id === tripId);
    if (!trip || !this.isCompleted(trip)) return;

    const mainInput = document.getElementById('memory-main-photo');
    const photosInput = document.getElementById('memory-photos');
    const notes = document.getElementById('memory-notes').value.trim();

    const updates = { completionNotes: notes };

    if (mainInput.files[0]) {
      updates.mainPhoto = await this.readFileAsDataURL(mainInput.files[0]);
    }
    if (photosInput.files.length) {
      const existing = trip.photos || [];
      const newPhotos = [];
      for (const f of photosInput.files) {
        newPhotos.push(await this.readFileAsDataURL(f));
      }
      updates.photos = [...existing, ...newPhotos];
    }

    await Storage.updateTrip(tripId, updates);
    App.showToast('Memories saved! 💕');
    this.showDetail(tripId);
  },

  renderMemorySection(trip) {
    if (!this.isCompleted(trip)) {
      return `<div class="memory-locked">
        <span>📸</span>
        <p>Photos & trip notes unlock after the trip is approved and completed.</p>
      </div>`;
    }

    const hasMemories = trip.mainPhoto || trip.photos?.length || trip.completionNotes;

    let existing = '';
    if (hasMemories) {
      existing = `
        ${trip.mainPhoto ? `<img class="trip-detail-hero" src="${trip.mainPhoto}" alt="Main photo">` : ''}
        ${trip.completionNotes ? `<div class="detail-section"><h4>Trip Notes</h4><p>${trip.completionNotes}</p></div>` : ''}
        ${trip.photos?.length ? `<div class="detail-section"><h4>Photos</h4><div class="detail-photos">${trip.photos.map(p => `<img src="${p}" alt="Trip photo">`).join('')}</div></div>` : ''}`;
    }

    return `${existing}
      <div class="memory-form">
        <h4>📸 Add Memories</h4>
        <p class="step-desc">Upload photos and notes from your adventure</p>
        <div class="form-group">
          <label>Main Photo</label>
          <div class="photo-upload main-photo-upload" id="memory-main-upload">
            <input type="file" id="memory-main-photo" accept="image/*" hidden>
            <div class="upload-placeholder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>Tap to add main photo</span>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>More Photos</label>
          <div class="photo-upload small" id="memory-photos-upload">
            <input type="file" id="memory-photos" accept="image/*" multiple hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
        </div>
        <div class="form-group">
          <label for="memory-notes">Trip Notes</label>
          <textarea id="memory-notes" rows="3" placeholder="Best moments, funny stories...">${trip.completionNotes || ''}</textarea>
        </div>
        <button type="button" class="btn-primary" id="save-memories-btn">Save Memories</button>
      </div>`;
  },

  renderList(filter = 'all') {
    const listEl = document.getElementById('trip-list');
    let trips = Storage.getTrips().filter(t => t.status !== 'rejected');

    if (filter === 'upcoming') trips = trips.filter(t => this.getStatus(t) === 'upcoming');
    else if (filter === 'visited') trips = trips.filter(t => this.getStatus(t) === 'visited');
    else if (filter === 'pending') trips = trips.filter(t => t.status === 'pending');

    trips.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (!trips.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺</div><p>No trips here yet.<br>Tap + to plan your next adventure!</p></div>`;
      return;
    }

    listEl.innerHTML = trips.map(trip => {
      const status = this.getStatus(trip);
      const user = Auth.getCurrentUser();
      const hidden = this.isSurpriseHidden(trip, user);

      if (hidden) {
        const creator = this.getCreatorName(trip);
        return `<div class="trip-card surprise-hidden" data-id="${trip.id}">
          <div class="trip-card-header">
            <h3>Surprise trip ✨</h3>
            <span class="status-badge surprise">secret</span>
          </div>
          <div class="trip-card-meta">
            <span>📅 ${this.formatDateRange(trip)}</span>
          </div>
          <p class="surprise-teaser">${creator} planned something special for you</p>
        </div>`;
      }

      const cd = status === 'upcoming' ? this.getCountdown(trip.startDate) : null;
      return `<div class="trip-card" data-id="${trip.id}">
        <div class="trip-card-header">
          <h3>${trip.name}${trip.isSurprise ? ' ✨' : ''}</h3>
          <span class="status-badge ${status}">${status}</span>
        </div>
        <div class="trip-card-meta">
          <span>📍 ${trip.city}, ${trip.country || ''}</span>
          <span>📅 ${this.formatDateRange(trip)}</span>
          <span>${trip.type === 'workaway' ? '🌱 Workaway' : '🏠 Basic Trip'}</span>
        </div>
        ${cd ? `<div class="trip-card-countdown">⏱ ${cd.value} ${cd.label}</div>` : ''}
      </div>`;
    }).join('');

    listEl.querySelectorAll('.trip-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showDetail(card.dataset.id);
        App.closePanel('trip-panel');
      });
    });
  },

  showDetail(tripId) {
    const trip = Storage.getTrips().find(t => t.id === tripId);
    if (!trip) return;

    const user = Auth.getCurrentUser();
    if (this.isSurpriseHidden(trip, user)) {
      this.showSurpriseDetail(trip);
      return;
    }

    const status = this.getStatus(trip);
    const cd = status === 'upcoming' ? this.getCountdown(trip.startDate) : null;
    const creator = Auth.getUserInfo(trip.createdBy);

    let heroHtml = trip.mainPhoto
      ? `<img class="trip-detail-hero" src="${trip.mainPhoto}" alt="${trip.name}">`
      : `<div class="trip-detail-hero placeholder ${trip.type === 'workaway' ? 'gradient-workaway' : 'gradient-basic'}">${trip.type === 'workaway' ? '🌱' : '✈'}</div>`;

    let extraFields = '';
    if (trip.type === 'workaway' && trip.workawayUrl) {
      extraFields = `<div class="detail-section"><h4>Workaway</h4><a href="${trip.workawayUrl}" target="_blank" rel="noopener">${trip.workawayUrl}</a></div>`;
    } else if (trip.type === 'basic') {
      if (trip.apartmentLocation) extraFields += `<div class="detail-section"><h4>Apartment</h4><p>${trip.apartmentLocation}</p></div>`;
      if (trip.bookingLink) extraFields += `<div class="detail-section"><h4>Booking</h4><a href="${trip.bookingLink}" target="_blank" rel="noopener">${trip.bookingLink}</a></div>`;
    }

    const canEdit = status !== 'visited';

    document.getElementById('trip-detail-content').innerHTML = `
      <div class="trip-detail">
        ${heroHtml}
        <div class="trip-detail-actions">
          <span class="status-badge ${status}">${status}</span>
          ${canEdit ? `<button type="button" class="btn-edit-trip" id="btn-edit-trip">✏️ Edit trip</button>` : ''}
        </div>
        <h2>${trip.name}</h2>
        <p class="detail-city">📍 ${trip.city}${trip.country ? ', ' + trip.country : ''}</p>
        ${cd ? `<div class="detail-countdown"><div class="countdown-value" id="detail-countdown">${cd.value}</div><div class="countdown-label">${cd.label}</div></div>` : ''}
        ${trip.description ? `<div class="detail-section"><h4>Description</h4><p>${trip.description}</p></div>` : ''}
        ${trip.planningNotes ? `<div class="detail-section"><h4>Planning Notes</h4><p>${trip.planningNotes}</p></div>` : ''}
        <div class="detail-section"><h4>Dates</h4><p>${this.formatDate(trip.startDate)} – ${this.formatDate(trip.endDate)}</p></div>
        ${this.renderJourneyDetail(trip)}
        ${trip.totalCost ? `<div class="detail-section"><h4>Total Transport Cost</h4><p class="cost-big">€${trip.totalCost.toFixed(2)}</p></div>` : ''}
        ${extraFields}
        <div class="detail-section"><h4>Created by</h4><p>${creator?.name || trip.createdBy}</p></div>
        <div class="detail-section memories-section">${this.renderMemorySection(trip)}</div>
      </div>`;

    if (cd) {
      this._detailCountdownInterval = setInterval(() => {
        const el = document.getElementById('detail-countdown');
        if (!el) { clearInterval(this._detailCountdownInterval); return; }
        const u = this.getCountdown(trip.startDate);
        if (u) el.textContent = u.value;
      }, 1000);
    }

    if (canEdit) {
      document.getElementById('btn-edit-trip')?.addEventListener('click', () => {
        this.openEditModal(tripId);
      });
    }

    if (this.isCompleted(trip)) {
      document.getElementById('memory-main-upload')?.addEventListener('click', () => {
        document.getElementById('memory-main-photo').click();
      });
      document.getElementById('memory-main-photo')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = await this.readFileAsDataURL(file);
        document.querySelector('#memory-main-upload .upload-placeholder').innerHTML = `<img src="${url}" alt="Preview" style="width:100%;height:100%;object-fit:cover;border-radius:12px">`;
      });
      document.getElementById('memory-photos-upload')?.addEventListener('click', () => {
        document.getElementById('memory-photos').click();
      });
      document.getElementById('save-memories-btn')?.addEventListener('click', () => {
        this.saveMemories(tripId);
      });
    }

    App.openModal('trip-detail-modal');
  },

  showSurpriseDetail(trip) {
    const creator = this.getCreatorName(trip);
    const revealDate = this.formatDate(trip.startDate);

    document.getElementById('trip-detail-content').innerHTML = `
      <div class="trip-detail surprise-detail">
        <div class="surprise-detail-hero">✨</div>
        <div class="trip-detail-actions">
          <span class="status-badge surprise">surprise</span>
        </div>
        <h2>Surprise trip</h2>
        <p class="surprise-detail-copy">
          ${creator} planned something special for you. You'll only see the destination when the trip starts on <strong>${revealDate}</strong>.
        </p>
        <div class="detail-section">
          <h4>Dates</h4>
          <p>${this.formatDateRange(trip)}</p>
        </div>
      </div>`;

    App.openModal('trip-detail-modal');
  }
};
