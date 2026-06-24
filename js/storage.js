const Storage = {
  SESSION_KEY: 'trip-planner-session',
  LEGACY_KEY: 'trip-planner-data-v2',
  CONNECT_TIMEOUT_MS: 20000,

  cache: {
    trips: [],
    messages: [],
    wishlist: []
  },

  unsubscribers: [],
  _readyResolve: null,
  _readyReject: null,
  _initialized: false,
  connected: false,
  connectionError: null,

  ready: new Promise((resolve, reject) => {
    Storage._readyResolve = resolve;
    Storage._readyReject = reject;
  }),

  init() {
    if (this._initialized) return this.ready;
    this._initialized = true;

    try {
      localStorage.removeItem(this.LEGACY_KEY);
    } catch (_) {}

    if (!FirebaseApp?.loaded || !FirebaseApp.db) {
      const err = new Error(FirebaseApp?.error || 'Firebase is not available');
      this.connectionError = err.message;
      this._initialized = false;
      this._readyReject(err);
      return this.ready;
    }

    const db = FirebaseApp.db;
    let pending = 3;
    const readyFlags = { trips: false, messages: false, wishlist: false };
    let settled = false;

    const finish = (ok, err) => {
      if (settled) return;
      settled = true;
      clearTimeout(this._connectTimer);
      if (ok) {
        this.connected = true;
        this.connectionError = null;
        this._readyResolve();
      } else {
        this.connectionError = err?.message || 'Could not connect to database';
        this._initialized = false;
        this.unsubscribers.forEach((unsub) => unsub());
        this.unsubscribers = [];
        this._readyReject(err || new Error(this.connectionError));
      }
    };

    const markReady = (key) => {
      if (readyFlags[key]) return;
      readyFlags[key] = true;
      pending -= 1;
      if (pending <= 0) finish(true);
    };

    this._connectTimer = setTimeout(() => {
      finish(false, new Error('Connection timed out. Check your internet and try again.'));
    }, this.CONNECT_TIMEOUT_MS);

    this.unsubscribers.push(
      db.collection('trips').onSnapshot(
        (snap) => {
          this.cache.trips = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          this.cache.trips.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
          this._notify('trips');
          markReady('trips');
        },
        (err) => {
          console.error('Trips listener error:', err);
          markReady('trips');
        }
      ),

      db.collection('messages').onSnapshot(
        (snap) => {
          this.cache.messages = snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          this._notify('messages');
          markReady('messages');
        },
        (err) => {
          console.error('Messages listener error:', err);
          markReady('messages');
        }
      ),

      db.collection('wishlist').onSnapshot(
        (snap) => {
          this.cache.wishlist = snap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          this._notify('wishlist');
          markReady('wishlist');
        },
        (err) => {
          console.error('Wishlist listener error:', err);
          markReady('wishlist');
        }
      )
    );

    return this.ready;
  },

  destroy() {
    clearTimeout(this._connectTimer);
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this._initialized = false;
    this.connected = false;
    this.cache = { trips: [], messages: [], wishlist: [] };
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
  },

  _notify(type) {
    if (!Auth.isLoggedIn()) return;

    if (type === 'trips') {
      TripMap.refresh();
      Trips.renderList(App.currentTab);
    } else if (type === 'messages') {
      Messaging.render();
      Messaging.updateBadge();
    } else if (type === 'wishlist') {
      Wishlist.render();
    }
  },

  getTrips() {
    return this.cache.trips;
  },

  getMessages() {
    return this.cache.messages;
  },

  getWishlist() {
    return this.cache.wishlist;
  },

  getCurrentUser() {
    try {
      return localStorage.getItem(this.SESSION_KEY);
    } catch (_) {
      return null;
    }
  },

  setCurrentUser(user) {
    try {
      if (user) localStorage.setItem(this.SESSION_KEY, user);
      else localStorage.removeItem(this.SESSION_KEY);
    } catch (_) {}
  },

  _docData(obj) {
    const { id, ...data } = obj;
    return data;
  },

  async addTrip(trip) {
    await FirebaseApp.db.collection('trips').doc(trip.id).set(this._docData(trip));
    return trip;
  },

  async updateTrip(id, updates) {
    await FirebaseApp.db.collection('trips').doc(id).update(updates);
    const trip = this.cache.trips.find((t) => t.id === id);
    return trip ? { ...trip, ...updates } : null;
  },

  async addMessage(msg) {
    await FirebaseApp.db.collection('messages').doc(msg.id).set(this._docData(msg));
    return msg;
  },

  async updateMessage(id, updates) {
    await FirebaseApp.db.collection('messages').doc(id).update(updates);
    const message = this.cache.messages.find((m) => m.id === id);
    return message ? { ...message, ...updates } : null;
  },

  async addWishlistItem(item) {
    await FirebaseApp.db.collection('wishlist').doc(item.id).set(this._docData(item));
    return item;
  },

  async removeWishlistItem(id) {
    await FirebaseApp.db.collection('wishlist').doc(id).delete();
  }
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
