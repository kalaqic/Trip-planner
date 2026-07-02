const Effects = {
  seasonalCanvas: null,
  seasonalCtx: null,
  seasonalParticles: [],
  seasonalAnimId: null,
  nightTimer: null,
  _started: false,

  REACTION_KEYS: ['love', 'fire', 'eyes'],
  REACTION_EMOJI: { love: '💕', fire: '🔥', eyes: '👀' },

  init() {
    if (this._started) return;
    this._started = true;

    let layer = document.getElementById('effects-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'effects-layer';
      layer.className = 'effects-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.innerHTML = '<canvas id="seasonal-canvas"></canvas><div id="celebration-layer"></div>';
      document.getElementById('app')?.prepend(layer);
    }

    this.seasonalCanvas = document.getElementById('seasonal-canvas');
    this.seasonalCtx = this.seasonalCanvas?.getContext('2d');
    this.resizeSeasonalCanvas();
    window.addEventListener('resize', () => this.resizeSeasonalCanvas());

    this.startSeasonalParticles();
    this.updateNightMode();
    this.nightTimer = setInterval(() => this.updateNightMode(), 60000);
    Travelers.start();
  },

  stop() {
    this._started = false;
    Travelers.stop();
    if (this.seasonalAnimId) cancelAnimationFrame(this.seasonalAnimId);
    this.seasonalAnimId = null;
    this.seasonalParticles = [];
    clearInterval(this.nightTimer);
    this.nightTimer = null;
    document.documentElement.classList.remove('night-glow');
    document.getElementById('celebration-layer')?.replaceChildren();
  },

  resizeSeasonalCanvas() {
    if (!this.seasonalCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.seasonalCanvas.width = window.innerWidth * dpr;
    this.seasonalCanvas.height = window.innerHeight * dpr;
    this.seasonalCanvas.style.width = `${window.innerWidth}px`;
    this.seasonalCanvas.style.height = `${window.innerHeight}px`;
    if (this.seasonalCtx) this.seasonalCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  getSeason() {
    const month = new Date().getMonth();
    if (month === 11 || month <= 1) return 'winter';
    if (month >= 2 && month <= 4) return 'spring';
    return null;
  },

  startSeasonalParticles() {
    const season = this.getSeason();
    if (!season || !this.seasonalCtx) return;

    const count = season === 'winter' ? 35 : 28;
    this.seasonalParticles = Array.from({ length: count }, () => this.createSeasonalParticle(season));

    const tick = () => {
      if (!this._started) return;
      this.drawSeasonalParticles(season);
      this.seasonalAnimId = requestAnimationFrame(tick);
    };
    tick();
  },

  createSeasonalParticle(season) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (season === 'winter') {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        size: 1 + Math.random() * 2.5,
        vy: 0.3 + Math.random() * 0.7,
        vx: (Math.random() - 0.5) * 0.3,
        alpha: 0.25 + Math.random() * 0.45
      };
    }
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size: 3 + Math.random() * 3,
      vy: 0.4 + Math.random() * 0.6,
      vx: 0.3 + Math.random() * 0.5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.04,
      alpha: 0.2 + Math.random() * 0.35
    };
  },

  drawSeasonalParticles(season) {
    const ctx = this.seasonalCtx;
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    this.seasonalParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (season === 'spring') p.rot += p.vr;

      if (p.y > h + 10) {
        p.y = -10;
        p.x = Math.random() * w;
      }
      if (p.x > w + 10) p.x = -10;
      if (p.x < -10) p.x = w + 10;

      ctx.globalAlpha = p.alpha;
      if (season === 'winter') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = Math.random() > 0.5 ? '#ffb7c5' : '#ffc9d4';
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    });
    ctx.globalAlpha = 1;
  },

  updateNightMode() {
    const hour = new Date().getHours();
    const isNight = hour >= 19 || hour < 6;
    document.documentElement.classList.toggle('night-glow', isNight);
  },

  celebrateApproval(city) {
    const name = city || 'Your surprise trip';
    App.showToast(city ? `${name} is officially happening! 🎉` : `${name} is officially happening! ✨`);
    this.burst('heart', 22);
    this.travelersCelebrate();
  },

  travelersCelebrate() {
    Travelers.celebrate();
  },

  loveNoteSparkle() {
    const btn = document.getElementById('btn-messages');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    for (let i = 0; i < 8; i++) {
      const el = document.createElement('span');
      el.className = 'float-heart';
      el.textContent = Math.random() > 0.5 ? '💕' : '♥';
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.setProperty('--drift-x', `${(Math.random() - 0.5) * 60}px`);
      el.style.setProperty('--float-dur', `${1.2 + Math.random() * 0.8}s`);
      el.style.animationDelay = `${i * 0.08}s`;
      document.getElementById('celebration-layer')?.appendChild(el);
      setTimeout(() => el.remove(), 2200);
    }
  },

  burst(kind, count = 20) {
    const layer = document.getElementById('celebration-layer');
    if (!layer) return;

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.45;

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'burst-particle';
      const symbols = kind === 'heart' ? ['♥', '💕', '✨'] : ['✨'];
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];

      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const dist = 80 + Math.random() * 120;
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.setProperty('--bx', `${Math.cos(angle) * dist}px`);
      el.style.setProperty('--by', `${Math.sin(angle) * dist - 40}px`);
      el.style.setProperty('--burst-dur', `${0.9 + Math.random() * 0.5}s`);
      el.style.animationDelay = `${Math.random() * 0.15}s`;
      layer.appendChild(el);
      setTimeout(() => el.remove(), 1600);
    }
  }
};
