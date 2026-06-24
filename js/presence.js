const Presence = {
  heartbeatTimer: null,
  unsubscribe: null,
  partnerOnline: false,
  bannerDismissed: false,
  lastLoveSentAt: 0,
  _partnerSnapshotSeen: false,

  PRONOUNS: {
    david: { subject: 'he', object: 'him' },
    juste: { subject: 'she', object: 'her' }
  },

  LOVE_NOTES: [
    { id: 'kisses', label: 'Kisses 💋' },
    { id: 'love', label: 'Love you ❤️' },
    { id: 'miss', label: 'Miss you 🥺' },
    { id: 'hugs', label: 'Hugs 🤗' }
  ],

  isRecentlyActive(data) {
    if (!data?.online) return false;
    if (!data.lastSeen) return true;
    const lastSeen = data.lastSeen.toDate ? data.lastSeen.toDate() : new Date(data.lastSeen);
    return Date.now() - lastSeen.getTime() < 60000;
  },

  formatLoveText(fromUser, noteId) {
    const info = Auth.getUserInfo(fromUser);
    const p = this.PRONOUNS[fromUser];
    const name = info?.name || fromUser;

    const templates = {
      kisses: `${name} is online and ${p.subject} sends kisses 💋`,
      love: `${name} is online and ${p.subject} sends love you ❤️`,
      miss: `${name} is online and ${p.subject} says ${p.subject} misses you 🥺`,
      hugs: `${name} is online and ${p.subject} sends hugs 🤗`
    };

    return templates[noteId] || `${name} is online and sends love 💕`;
  },

  async start() {
    const user = Auth.getCurrentUser();
    if (!user) return;

    this.bannerDismissed = false;
    this.partnerOnline = false;
    await this.setOnline(true);
    this.startHeartbeat();
    this.listenToPartner();
    this.bindBanner();
    this.renderLoveButtons();

    window.addEventListener('beforeunload', this._onUnload);
    document.addEventListener('visibilitychange', this._onVisibility);
  },

  async stop() {
    window.removeEventListener('beforeunload', this._onUnload);
    document.removeEventListener('visibilitychange', this._onVisibility);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    await this.setOnline(false);
    this.hideOnlineBanner();
    this.updatePartnerIndicator(false);
    this.partnerOnline = false;
  },

  _onUnload: () => {
    const user = Auth.getCurrentUser();
    if (!user) return;
    FirebaseApp.db.collection('presence').doc(user).set({
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  },

  _onVisibility: () => {
    if (document.hidden) {
      this.setOnline(false);
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    } else if (Auth.isLoggedIn()) {
      this.setOnline(true);
      this.startHeartbeat();
    }
  },

  async setOnline(online) {
    const user = Auth.getCurrentUser();
    if (!user) return;

    await FirebaseApp.db.collection('presence').doc(user).set({
      online,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  },

  startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.setOnline(true), 20000);
  },

  listenToPartner() {
    const user = Auth.getCurrentUser();
    const other = Auth.getOtherUser(user);
    if (!other) return;

    if (this.unsubscribe) this.unsubscribe();

    this._partnerSnapshotSeen = false;

    this.unsubscribe = FirebaseApp.db.collection('presence').doc(other).onSnapshot((doc) => {
      const data = doc.exists ? doc.data() : null;
      const isOnline = this.isRecentlyActive(data);
      const wasOnline = this.partnerOnline;
      this.partnerOnline = isOnline;

      this.updatePartnerIndicator(isOnline);

      if (!this._partnerSnapshotSeen) {
        this._partnerSnapshotSeen = true;
        if (isOnline && !this.bannerDismissed) this.showOnlineBanner();
        return;
      }

      if (isOnline && !wasOnline) {
        const otherInfo = Auth.getUserInfo(other);
        App.showToast(`${otherInfo.name} just came online 💕`);
        this.bannerDismissed = false;
        this.showOnlineBanner();
      } else if (isOnline && !this.bannerDismissed) {
        this.showOnlineBanner();
      } else if (!isOnline) {
        this.hideOnlineBanner();
      }
    });
  },

  updatePartnerIndicator(isOnline) {
    const dot = document.getElementById('partner-status-dot');
    if (!dot) return;
    dot.classList.toggle('online', isOnline);
    dot.title = isOnline ? 'Partner is online' : 'Partner is offline';
  },

  bindBanner() {
    document.getElementById('partner-online-dismiss')?.addEventListener('click', () => {
      this.bannerDismissed = true;
      this.hideOnlineBanner();
    });
  },

  renderLoveButtons() {
    const container = document.getElementById('love-note-actions');
    if (!container) return;

    container.innerHTML = this.LOVE_NOTES.map((note) =>
      `<button type="button" class="love-note-btn" data-love="${note.id}">${note.label}</button>`
    ).join('');

    container.querySelectorAll('[data-love]').forEach((btn) => {
      btn.addEventListener('click', () => this.sendLoveNote(btn.dataset.love));
    });
  },

  showOnlineBanner() {
    const user = Auth.getCurrentUser();
    const other = Auth.getOtherUser(user);
    const otherInfo = Auth.getUserInfo(other);
    const p = this.PRONOUNS[other];

    const banner = document.getElementById('partner-online-banner');
    const text = document.getElementById('partner-online-text');
    if (!banner || !text) return;

    text.textContent = `${otherInfo.name} is online — send ${p.object} a love note`;
    banner.classList.remove('hidden');
  },

  hideOnlineBanner() {
    document.getElementById('partner-online-banner')?.classList.add('hidden');
  },

  async sendLoveNote(noteId) {
    const user = Auth.getCurrentUser();
    if (!user) return;

    const now = Date.now();
    if (now - this.lastLoveSentAt < 8000) {
      App.showToast('Give it a moment before sending another 💕');
      return;
    }

    const other = Auth.getOtherUser(user);
    const text = this.formatLoveText(user, noteId);

    try {
      await Messaging.sendLoveNote(text, user, other, noteId);
      this.lastLoveSentAt = now;
      const otherInfo = Auth.getUserInfo(other);
      App.showToast(`Sent to ${otherInfo.name}! 💕`);
      this.bannerDismissed = true;
      this.hideOnlineBanner();
    } catch (err) {
      console.error('Failed to send love note:', err);
      App.showToast('Could not send love note. Try again.');
    }
  }
};
