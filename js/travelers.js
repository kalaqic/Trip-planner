const Travelers = {
  IDLE_MS: 20000,
  AUTO_SPECIAL: ['kiss', 'spin', 'tickle'],
  CLICK_SPECIAL: ['kiss', 'spin', 'tickle'],
  DURATION: { kiss: 2, spin: 1.7, tickle: 1.45 },
  NOTE_COOLDOWN_MS: 1200,
  NOTE_ANIM_MS: 3500,
  HINT_KEY: 'trip-planner-travelers-hint-v1',

  start() {
    this.wrap = document.getElementById('travelers');
    this.el = document.getElementById('travelers-sprite');
    this.noteBtn = document.getElementById('travelers-note');
    this.bubble = document.getElementById('travelers-bubble');
    if (!this.el) return;

    if (this.hasSeenHint()) this.wrap?.classList.add('hint-dismissed');

    this._running = true;
    this._onSpriteClick = () => {
      this.dismissHint();
      this.playClickSpecial();
    };
    this._onNoteClick = () => {
      this.dismissHint();
      this.showNote();
    };
    this.el.addEventListener('click', this._onSpriteClick);
    this.noteBtn?.addEventListener('click', this._onNoteClick);
    this.setWalk();
    this.scheduleSpecial();
  },

  hasSeenHint() {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    try {
      return localStorage.getItem(`${this.HINT_KEY}-${user}`) === '1';
    } catch (_) {
      return false;
    }
  },

  dismissHint() {
    const user = Auth.getCurrentUser();
    if (user) {
      try {
        localStorage.setItem(`${this.HINT_KEY}-${user}`, '1');
      } catch (_) {}
    }
    this.wrap?.classList.add('hint-dismissed');
  },

  stop() {
    this._running = false;
    clearTimeout(this._idleTimer);
    clearTimeout(this._celebrateTimer);
    clearTimeout(this._bubbleTimer);
    clearTimeout(this._noteCooldownTimer);
    if (this._specialEndHandler) {
      this.el?.removeEventListener('animationend', this._specialEndHandler);
      this._specialEndHandler = null;
    }
    if (this._onSpriteClick) {
      this.el?.removeEventListener('click', this._onSpriteClick);
      this._onSpriteClick = null;
    }
    if (this._onNoteClick) {
      this.noteBtn?.removeEventListener('click', this._onNoteClick);
      this._onNoteClick = null;
    }
    this.hideNote();
    this.el?.classList.remove('state-kiss', 'state-spin', 'state-tickle', 'state-excited');
    this.el?.classList.add('state-walk');
  },

  getNotes() {
    const user = Auth.getCurrentUser();
    const partner = user ? Auth.getUserInfo(Auth.getOtherUser(user))?.name : 'you';
    return [
      'Where to next? 🌍',
      `Adventure with ${partner}? ✈️`,
      'Just you, me & the map 💕',
      'Pick anywhere — I\'m in!',
      'Our next stamp soon? ✨',
      'Still holding your hand 🤝',
      'Dreaming of us somewhere new...',
      'Wishlist date night? 👀',
      'You + me + the world',
      'Can\'t wait for our next trip!',
      'Somewhere cozy, somewhere far 🏖️',
      `${partner}, map date?`,
      'Let\'s get lost together 🧭',
      'Every pin is a promise 💫'
    ];
  },

  showNote() {
    if (!this._running || !this.bubble || this._noteOnCooldown) return;

    const notes = this.getNotes();
    let message = notes[Math.floor(Math.random() * notes.length)];
    if (notes.length > 1) {
      let guard = 0;
      while (message === this._lastNote && guard < 6) {
        message = notes[Math.floor(Math.random() * notes.length)];
        guard += 1;
      }
    }
    this._lastNote = message;

    this.bubble.textContent = message;
    this.bubble.classList.remove('hidden', 'rising');
    this.bubble.style.animation = 'none';
    this.positionBubble();
    void this.bubble.offsetWidth;
    this.bubble.style.animation = '';
    this.bubble.classList.add('rising');

    clearTimeout(this._bubbleTimer);
    this._bubbleTimer = setTimeout(() => this.hideNote(), this.NOTE_ANIM_MS);

    this._noteOnCooldown = true;
    clearTimeout(this._noteCooldownTimer);
    this._noteCooldownTimer = setTimeout(() => {
      this._noteOnCooldown = false;
    }, this.NOTE_COOLDOWN_MS);
  },

  positionBubble() {
    if (!this.el || !this.bubble) return;

    const rect = this.el.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.56;
    const bubbleH = this.bubble.offsetHeight || 40;
    const gap = 10;
    const startTop = rect.top - bubbleH - gap;
    const risePx = 130;

    this.bubble.style.left = `${centerX}px`;
    this.bubble.style.top = `${startTop}px`;
    this.bubble.style.setProperty('--rise-px', `${risePx}px`);
  },

  hideNote() {
    if (!this.bubble) return;
    this.bubble.classList.remove('rising');
    this.bubble.style.animation = '';
    clearTimeout(this._bubbleTimer);
    this.bubble.classList.add('hidden');
  },

  isBusy() {
    if (!this.el) return true;
    return (
      this.el.classList.contains('state-excited') ||
      this.el.classList.contains('state-kiss') ||
      this.el.classList.contains('state-spin') ||
      this.el.classList.contains('state-tickle')
    );
  },

  setWalk() {
    if (!this.el) return;
    this.el.classList.remove('state-kiss', 'state-spin', 'state-tickle', 'state-excited');
    this.el.style.setProperty('--sprite-dur', '');
    this.el.classList.add('state-walk');
  },

  setState(nextState, duration = '') {
    if (!this.el) return;
    this.el.classList.remove('state-walk', 'state-kiss', 'state-spin', 'state-tickle', 'state-excited');
    this.el.style.setProperty('--sprite-dur', duration ? `${duration}s` : '');
    this.el.classList.add(nextState);
  },

  scheduleSpecial() {
    clearTimeout(this._idleTimer);
    if (!this._running) return;
    this._idleTimer = setTimeout(() => {
      this.playAutoSpecial();
      this.scheduleSpecial();
    }, this.IDLE_MS);
  },

  playAutoSpecial() {
    if (!this._running || this.isBusy()) return;
    const pick = this.AUTO_SPECIAL[Math.floor(Math.random() * this.AUTO_SPECIAL.length)];
    this.playAnimation(pick);
  },

  playClickSpecial() {
    if (!this._running || this.isBusy()) return;
    const pick = this.CLICK_SPECIAL[Math.floor(Math.random() * this.CLICK_SPECIAL.length)];
    this.playAnimation(pick);
  },

  playAnimation(pick) {
    if (!this.el) return;

    if (this._specialEndHandler) {
      this.el.removeEventListener('animationend', this._specialEndHandler);
      this._specialEndHandler = null;
    }

    this.setState(`state-${pick}`, this.DURATION[pick]);

    const onEnd = (e) => {
      if (e.target !== this.el || e.animationName !== 'sprite-play-5') return;
      this.el.removeEventListener('animationend', onEnd);
      this._specialEndHandler = null;
      if (!this._running || this.el.classList.contains('state-excited')) return;
      this.setWalk();
    };
    this._specialEndHandler = onEnd;
    this.el.addEventListener('animationend', onEnd);
  },

  celebrate() {
    if (!this.el) return;
    clearTimeout(this._idleTimer);
    clearTimeout(this._celebrateTimer);
    if (this._specialEndHandler) {
      this.el.removeEventListener('animationend', this._specialEndHandler);
      this._specialEndHandler = null;
    }
    this.setState('state-excited');

    this._celebrateTimer = setTimeout(() => {
      if (!this._running) return;
      this.el.classList.remove('state-excited');
      this.setWalk();
      this.scheduleSpecial();
    }, 2800);
  }
};
