const Wishlist = {
  TYPE_META: {
    location: { icon: '📍', label: 'Location' },
    workaway: { icon: '🌱', label: 'Workaway' },
    reel: { icon: '🎬', label: 'Reel' }
  },

  draft: { type: null, city: null, lat: null, lng: null, country: null },

  resetDraft() {
    this.draft = { type: null, city: null, lat: null, lng: null, country: null };
    document.getElementById('wishlist-form')?.reset();
    document.getElementById('wishlist-city-results').innerHTML = '';
    document.getElementById('wishlist-city-search').value = '';
    document.querySelectorAll('.wishlist-type-card').forEach(c => c.classList.remove('selected'));
    document.querySelectorAll('.wishlist-form-section').forEach(s => s.classList.add('hidden'));
  },

  openPanel() {
    this.render();
    App.openPanel('wishlist-panel');
  },

  openAddModal() {
    this.resetDraft();
    this.showWishlistStep('wishlist-step-type');
    App.openModal('add-wishlist-modal');
  },

  showWishlistStep(stepId) {
    document.querySelectorAll('.wizard-step').forEach(s => {
      if (s.id.startsWith('wishlist-')) s.classList.add('hidden');
    });
    document.getElementById(stepId).classList.remove('hidden');
  },

  selectType(type) {
    this.draft.type = type;
    document.querySelectorAll('.wishlist-type-card').forEach(c => {
      c.classList.toggle('selected', c.dataset.wtype === type);
    });
    document.querySelectorAll('.wishlist-form-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`wishlist-form-${type}`).classList.remove('hidden');
    this.showWishlistStep('wishlist-step-form');
  },

  async searchCity(query) {
    const resultsEl = document.getElementById('wishlist-city-results');
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
        <div class="search-result wishlist-city-result" data-lat="${place.lat}" data-lng="${place.lon}"
             data-name="${place.name}" data-country="${place.display_name.split(',').pop().trim()}">
          <span class="result-icon">📍</span>
          <div>
            <div class="result-name">${place.name}</div>
            <div class="result-country">${place.display_name}</div>
          </div>
        </div>`).join('');

      resultsEl.querySelectorAll('.wishlist-city-result').forEach(el => {
        el.addEventListener('click', () => {
          this.draft.city = el.dataset.name;
          this.draft.lat = parseFloat(el.dataset.lat);
          this.draft.lng = parseFloat(el.dataset.lng);
          this.draft.country = el.dataset.country;
          document.getElementById('wishlist-city-search').value = `${el.dataset.name}, ${el.dataset.country}`;
          resultsEl.innerHTML = '';
        });
      });
    } catch (_) {
      resultsEl.innerHTML = '<div class="search-loading">Search failed. Try again.</div>';
    }
  },

  getItemTitle(item) {
    if (item.title) return item.title;
    if (item.type === 'location') return item.city + (item.country ? `, ${item.country}` : '');
    return item.url || 'Wishlist item';
  },

  getItemPreview(item) {
    const meta = this.TYPE_META[item.type];
    if (item.type === 'location') {
      return `${meta.icon} ${item.city}${item.country ? ', ' + item.country : ''}`;
    }
    return `${meta.icon} ${this.getItemTitle(item)}`;
  },

  async submitItem(e) {
    e.preventDefault();
    const user = Auth.getCurrentUser();
    const other = Auth.getOtherUser(user);
    const type = this.draft.type;
    if (!type) return;

    const notes = document.getElementById('wishlist-notes').value.trim();
    let item = {
      id: generateId(),
      type,
      notes,
      createdBy: user,
      createdAt: new Date().toISOString()
    };

    if (type === 'location') {
      if (!this.draft.city) {
        App.showToast('Please select a location');
        return;
      }
      item = {
        ...item,
        title: document.getElementById('wishlist-location-title').value.trim(),
        city: this.draft.city,
        country: this.draft.country,
        lat: this.draft.lat,
        lng: this.draft.lng
      };
    } else if (type === 'workaway') {
      const url = document.getElementById('wishlist-workaway-url').value.trim();
      if (!url) { App.showToast('Please enter a Workaway link'); return; }
      item = {
        ...item,
        title: document.getElementById('wishlist-workaway-title').value.trim(),
        url
      };
    } else if (type === 'reel') {
      const url = document.getElementById('wishlist-reel-url').value.trim();
      if (!url) { App.showToast('Please enter a reel link'); return; }
      item = {
        ...item,
        title: document.getElementById('wishlist-reel-title').value.trim(),
        url
      };
    }

    await Storage.addWishlistItem(item);
    await Messaging.sendWishlistAdded(item, user, other, Auth.getUserInfo(user).name);

    App.closeModal('add-wishlist-modal');
    this.render();
    Messaging.render();
    Messaging.updateBadge();
    App.showToast('Added to wishlist! 💫');
  },

  async removeItem(id) {
    await Storage.removeWishlistItem(id);
    this.render();
    App.showToast('Removed from wishlist');
  },

  viewOnMap(item) {
    if (!item.lat || !item.lng) return;
    App.closePanel('wishlist-panel');
    TripMap.flyTo(item.lat, item.lng, 0.35);
  },

  formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  },

  render(highlightId = null) {
    const listEl = document.getElementById('wishlist-list');
    const items = Storage.getWishlist();

    if (!items.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✨</div>
          <p>Nothing on the wishlist yet.<br>Save places, Workaways & reels you dream about!</p>
        </div>`;
      return;
    }

    listEl.innerHTML = items.map(item => {
      const meta = this.TYPE_META[item.type];
      const author = Auth.getUserInfo(item.createdBy);
      const isHighlight = item.id === highlightId;

      let body = '';
      if (item.type === 'location') {
        body = `
          <p class="wishlist-place">📍 ${item.city}${item.country ? ', ' + item.country : ''}</p>
          <button type="button" class="btn-text map-link" data-map="${item.id}">View on globe</button>`;
      } else {
        body = `<a class="wishlist-link" href="${item.url}" target="_blank" rel="noopener">${item.url}</a>`;
      }

      return `
        <div class="wishlist-card ${isHighlight ? 'highlight' : ''}" data-id="${item.id}">
          <div class="wishlist-card-top">
            <span class="wishlist-type-badge">${meta.icon} ${meta.label}</span>
            <button type="button" class="btn-icon-delete" data-remove="${item.id}" title="Remove">&times;</button>
          </div>
          ${item.title ? `<h3 class="wishlist-title">${item.title}</h3>` : ''}
          ${body}
          ${item.notes ? `<p class="wishlist-notes">${item.notes}</p>` : ''}
          <div class="wishlist-author">
            <span class="avatar small ${item.createdBy}">${author?.avatar || '?'}</span>
            <span>Wishlisted by <strong>${author?.name || item.createdBy}</strong></span>
            <span class="wishlist-date">${this.formatDate(item.createdAt)}</span>
          </div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeItem(btn.dataset.remove);
      });
    });

    listEl.querySelectorAll('[data-map]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = items.find(i => i.id === btn.dataset.map);
        if (item) this.viewOnMap(item);
      });
    });

    if (highlightId) {
      const el = listEl.querySelector(`[data-id="${highlightId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => el?.classList.remove('highlight'), 2500);
    }
  },

  openFromMessage(wishlistId) {
    App.closePanel('messages-panel');
    this.openPanel();
    this.render(wishlistId);
  }
};
