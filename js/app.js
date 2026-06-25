const App = {
  activePanel: null,
  currentTab: 'all',
  searchTimeout: null,
  eventsBound: false,

  async init() {
    this.bindLogin();
    try {
      await Storage.init();
    } catch (err) {
      console.error('Firebase init failed:', err);
      this.showConnectionWarning(err?.message);
    }
    if (Auth.isLoggedIn() && Storage.connected) this.showApp();
  },

  showConnectionWarning(message) {
    const login = document.getElementById('login-screen');
    login.classList.remove('hidden');

    let banner = document.getElementById('connection-warning');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'connection-warning';
      banner.className = 'connection-warning';
      login.querySelector('.login-content')?.prepend(banner);
    }

    banner.innerHTML = `
      <p><strong>Could not connect to the database.</strong></p>
      <p>${message || 'Check your internet connection and try again.'}</p>
      <button type="button" class="btn-primary btn-small" onclick="location.reload()">Retry</button>`;
  },

  bindLogin() {
    document.querySelectorAll('.login-profile').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!Storage.connected) {
          try {
            if (!Storage._initialized) await Storage.init();
            else await Storage.ready;
          } catch (err) {
            App.showConnectionWarning(err?.message);
            return;
          }
        }
        Auth.login(btn.dataset.user);
        await Storage.ready;
        this.showApp();
      });
    });
  },

  async showApp() {
    await Storage.ready;

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    const user = Auth.getCurrentUser();
    const info = Auth.getUserInfo(user);
    const avatar = document.getElementById('current-avatar');
    avatar.textContent = info.avatar;
    avatar.className = `avatar ${info.class}`;
    document.getElementById('current-user-name').textContent = info.name;

    requestAnimationFrame(() => {
      TripMap.init();
      TripMap.resize();
    });
    Trips.renderList();
    Messaging.render();
    Messaging.updateBadge();

    if (!this.eventsBound) {
      this.bindEvents();
      this.eventsBound = true;
    }

    TripMap.refresh();
    Wishlist.render();
    Presence.start();
    Effects.init();
    this.maybeShowOnboarding();
  },

  ONBOARDING_KEY: 'trip-planner-onboarding-v1',

  hasSeenOnboarding(user) {
    try {
      return localStorage.getItem(`${this.ONBOARDING_KEY}-${user}`) === '1';
    } catch (_) {
      return false;
    }
  },

  markOnboardingSeen(user) {
    try {
      localStorage.setItem(`${this.ONBOARDING_KEY}-${user}`, '1');
    } catch (_) {}
  },

  maybeShowOnboarding() {
    const user = Auth.getCurrentUser();
    if (!user || this.hasSeenOnboarding(user)) return;
    setTimeout(() => this.openModal('onboarding-modal'), 400);
  },

  completeOnboarding() {
    const user = Auth.getCurrentUser();
    if (user) this.markOnboardingSeen(user);
    this.closeModal('onboarding-modal');
  },

  async signOut() {
    await Presence.stop();
    Effects.stop();
    TripMap.destroy();
    Storage.destroy();
    Auth.logout();
    document.getElementById('user-dropdown').classList.add('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    this.closePanel(this.activePanel);
    this.activePanel = null;
    Storage.init();
  },

  bindEvents() {
    document.getElementById('btn-list').addEventListener('click', () => this.togglePanel('trip-panel'));
    document.getElementById('btn-messages').addEventListener('click', () => {
      this.togglePanel('messages-panel');
      Messaging.render();
    });
    document.getElementById('btn-wishlist').addEventListener('click', () => Wishlist.openPanel());
    document.getElementById('btn-add-wishlist').addEventListener('click', () => Wishlist.openAddModal());
    document.getElementById('btn-add').addEventListener('click', () => Trips.openAddModal());

    document.getElementById('user-badge').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('user-dropdown').classList.toggle('hidden');
    });

    document.getElementById('btn-signout').addEventListener('click', () => this.signOut());

    document.getElementById('user-dropdown').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('click', () => {
      document.getElementById('user-dropdown').classList.add('hidden');
    });

    document.getElementById('overlay').addEventListener('click', () => {
      if (this.activePanel) this.closePanel(this.activePanel);
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.closePanel(btn.dataset.close));
    });

    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(btn.dataset.closeModal));
    });

    document.querySelectorAll('.panel-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.panel-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        Trips.renderList(this.currentTab);
      });
    });

    const citySearch = document.getElementById('city-search');
    citySearch.addEventListener('input', () => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => Trips.searchCity(citySearch.value.trim()), 400);
    });

    document.querySelectorAll('.type-card').forEach(card => {
      card.addEventListener('click', () => Trips.selectType(card.dataset.type));
    });

    document.getElementById('back-to-city').addEventListener('click', () => Trips.showStep('step-city'));
    document.getElementById('back-to-type').addEventListener('click', () => Trips.showStep('step-type'));
    document.getElementById('change-destination').addEventListener('click', () => Trips.showStep('step-city'));
    document.getElementById('to-journey-step').addEventListener('click', () => Trips.goToJourneyStep());
    document.getElementById('back-to-details').addEventListener('click', () => Trips.showStep('step-details'));
    document.getElementById('submit-trip').addEventListener('click', () => Trips.submitTrip());

    document.getElementById('btn-add-leg').addEventListener('click', () => Trips.startAddLeg());
    document.getElementById('cancel-route-pick').addEventListener('click', () => Trips.cancelRoutePick());
    document.querySelectorAll('.route-pick-btn').forEach(btn => {
      btn.addEventListener('click', () => Trips.pickRoute(btn.dataset.route));
    });
    document.getElementById('cancel-leg').addEventListener('click', () => Trips.closeLegForm());
    document.getElementById('save-leg').addEventListener('click', () => Trips.saveLeg());

    document.getElementById('trip-detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'trip-detail-modal') this.closeModal('trip-detail-modal');
    });

    document.getElementById('add-trip-modal').addEventListener('click', (e) => {
      if (e.target.id === 'add-trip-modal') this.closeModal('add-trip-modal');
    });

    document.getElementById('add-wishlist-modal').addEventListener('click', (e) => {
      if (e.target.id === 'add-wishlist-modal') this.closeModal('add-wishlist-modal');
    });

    document.getElementById('city-action-modal').addEventListener('click', (e) => {
      if (e.target.id === 'city-action-modal') this.closeModal('city-action-modal');
    });

    document.getElementById('city-action-trip').addEventListener('click', () => {
      const place = TripMap.getSelectedPlace();
      if (!place) return;
      App.closeModal('city-action-modal', { keepMapSelection: true });
      Trips.openAddModalWithCity(place);
    });

    document.getElementById('city-action-wishlist').addEventListener('click', () => {
      const place = TripMap.getSelectedPlace();
      if (!place) return;
      App.closeModal('city-action-modal', { keepMapSelection: true });
      Wishlist.openAddLocationWithCity(place);
    });

    document.querySelectorAll('.wishlist-type-card').forEach(card => {
      card.addEventListener('click', () => Wishlist.selectType(card.dataset.wtype));
    });

    document.getElementById('wishlist-back-type').addEventListener('click', () => {
      Wishlist.showWishlistStep('wishlist-step-type');
    });

    document.getElementById('wishlist-form').addEventListener('submit', (e) => {
      Wishlist.submitItem(e);
    });

    const wishlistCitySearch = document.getElementById('wishlist-city-search');
    wishlistCitySearch.addEventListener('input', () => {
      clearTimeout(this.wishlistSearchTimeout);
      this.wishlistSearchTimeout = setTimeout(() => {
        Wishlist.searchCity(wishlistCitySearch.value.trim());
      }, 400);
    });

    document.getElementById('onboarding-done')?.addEventListener('click', () => {
      this.completeOnboarding();
    });
  },

  togglePanel(id) {
    if (this.activePanel === id) this.closePanel(id);
    else {
      if (this.activePanel) this.closePanel(this.activePanel);
      this.openPanel(id);
    }
  },

  openPanel(id) {
    document.getElementById(id).classList.add('open');
    document.getElementById('overlay').classList.remove('hidden');
    this.activePanel = id;
  },

  closePanel(id) {
    if (!id) return;
    document.getElementById(id).classList.remove('open');
    document.getElementById('overlay').classList.add('hidden');
    if (this.activePanel === id) this.activePanel = null;
  },

  openModal(id) {
    document.getElementById(id).classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  },

  closeModal(id, options = {}) {
    document.getElementById(id).classList.add('hidden');
    document.body.style.overflow = '';
    if (id === 'city-action-modal' && !options.keepMapSelection) TripMap.scheduleSelectionFadeOut();
    if (id === 'add-trip-modal') {
      Trips.resetWizard();
      TripMap.scheduleSelectionFadeOut();
    }
    if (id === 'add-wishlist-modal') TripMap.scheduleSelectionFadeOut();
    if (id === 'trip-detail-modal' && Trips._detailCountdownInterval) {
      clearInterval(Trips._detailCountdownInterval);
    }
  },

  showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
