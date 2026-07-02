const Messaging = {
  async sendTripForApproval(trip, from, to, fromName, isEdit = false) {
    const isSurprise = !!trip.isSurprise;
    let text;
    if (isSurprise) {
      text = isEdit
        ? `${fromName} updated a surprise trip for you! ✨`
        : `${fromName} planned a surprise trip for you! ✨`;
    } else {
      text = isEdit
        ? `${fromName} updated the trip to ${trip.city}! Please review the changes.`
        : `${fromName} wants to plan a trip to ${trip.city}!`;
    }

    const msg = {
      id: generateId(),
      type: 'trip_approval',
      tripId: trip.id,
      from,
      to,
      text,
      read: false,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await Storage.addMessage(msg);
  },

  async sendWishlistAdded(item, from, to, fromName) {
    const preview = Wishlist.getItemPreview(item);
    await Storage.addMessage({
      id: generateId(),
      type: 'wishlist_added',
      wishlistId: item.id,
      from,
      to,
      text: `${fromName} added something to the wishlist!`,
      preview,
      read: false,
      createdAt: new Date().toISOString()
    });
  },

  async sendLoveNote(text, from, to, noteId) {
    await Storage.addMessage({
      id: generateId(),
      type: 'love_note',
      noteId,
      from,
      to,
      text,
      read: false,
      createdAt: new Date().toISOString()
    });
  },

  getVisibleMessages(user) {
    return Storage.getMessages().filter((m) => {
      if (m.type === 'love_note') return m.to === user;
      return m.to === user || m.from === user;
    });
  },

  getUnreadCount(user) {
    return this.getVisibleMessages(user).filter((m) => m.to === user && !m.read).length;
  },

  updateBadge() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    const count = this.getUnreadCount(user);
    const badge = document.getElementById('msg-badge');
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  async approveTrip(msgId) {
    const messages = Storage.getMessages();
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    await Storage.updateTrip(msg.tripId, {
      status: 'approved',
      approvedBy: Auth.getCurrentUser()
    });

    await Storage.updateMessage(msgId, { read: true, status: 'approved' });

    const trip = Storage.getTrips().find(t => t.id === msg.tripId);
    const user = Auth.getCurrentUser();
    const other = Auth.getOtherUser(user);
    const userInfo = Auth.getUserInfo(user);

    await Storage.addMessage({
      id: generateId(),
      type: 'trip_approved',
      tripId: msg.tripId,
      from: user,
      to: other,
      text: trip?.isSurprise
        ? `${userInfo.name} is excited about the surprise trip! ✨`
        : `${userInfo.name} approved the trip to ${trip?.city || 'your destination'}! 🎉`,
      read: false,
      status: 'approved',
      createdAt: new Date().toISOString()
    });

    TripMap.refresh();
    Trips.renderList();
    this.render();
    this.updateBadge();

    const city = trip?.isSurprise ? null : trip?.city;
    Effects.celebrateApproval(city);
  },

  async rejectTrip(msgId) {
    const messages = Storage.getMessages();
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    await Storage.updateTrip(msg.tripId, { status: 'rejected' });
    await Storage.updateMessage(msgId, { read: true, status: 'rejected' });

    const trip = Storage.getTrips().find(t => t.id === msg.tripId);
    const user = Auth.getCurrentUser();
    const other = Auth.getOtherUser(user);
    const userInfo = Auth.getUserInfo(user);

    await Storage.addMessage({
      id: generateId(),
      type: 'trip_rejected',
      tripId: msg.tripId,
      from: user,
      to: other,
      text: trip?.isSurprise
        ? `${userInfo.name} declined the surprise trip.`
        : `${userInfo.name} declined the trip to ${trip?.city || 'your destination'}.`,
      read: false,
      status: 'rejected',
      createdAt: new Date().toISOString()
    });

    TripMap.refresh();
    Trips.renderList();
    this.render();
    this.updateBadge();
    App.showToast('Trip declined.');
  },

  async markRead(msgId) {
    await Storage.updateMessage(msgId, { read: true });
    this.updateBadge();
  },

  render() {
    const user = Auth.getCurrentUser();
    if (!user) return;

    const listEl = document.getElementById('messages-list');
    const messages = this.getVisibleMessages(user);

    if (!messages.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">💬</div>
          <p>No messages yet.<br>Share a trip and it will appear here!</p>
        </div>`;
      return;
    }

    listEl.innerHTML = messages.map(msg => {
      const fromInfo = Auth.getUserInfo(msg.from);
      const trip = msg.tripId ? Storage.getTrips().find(t => t.id === msg.tripId) : null;
      const wishlistItem = msg.wishlistId ? Storage.getWishlist().find(w => w.id === msg.wishlistId) : null;
      const isApproval = msg.type === 'trip_approval' && msg.status === 'pending' && msg.to === user;
      const isLoveNote = msg.type === 'love_note';
      const unread = !msg.read && msg.to === user;

      let tripPreview = '';
      if (trip) {
        const hidden = Trips.isSurpriseHidden(trip, user);
        if (hidden) {
          tripPreview = `
            <div class="message-trip-preview surprise-preview">
              <strong>✨ Surprise trip</strong>
              📅 ${Trips.formatDateRange(trip)}
              <br><span class="surprise-teaser">Destination hidden until the trip starts</span>
            </div>`;
        } else {
          tripPreview = `
            <div class="message-trip-preview">
              <strong>${trip.name}</strong>
              📍 ${trip.city} · ${Trips.formatDateRange(trip)}
              <br>${trip.type === 'workaway' ? '🌱 Workaway' : '🏠 Basic Trip'} · €${(trip.totalCost || 0).toFixed(2)}
            </div>`;
        }
      }

      let wishlistPreview = '';
      if (msg.type === 'wishlist_added' && (wishlistItem || msg.preview)) {
        const label = wishlistItem ? Wishlist.getItemPreview(wishlistItem) : msg.preview;
        wishlistPreview = `
          <div class="message-trip-preview wishlist-preview">
            <strong>✨ Wishlist</strong>
            ${label}
          </div>`;
      }

      let actions = '';
      if (isApproval) {
        actions = `
          <div class="message-actions">
            <button class="btn-approve" data-approve="${msg.id}">✓ Approve</button>
            <button class="btn-reject" data-reject="${msg.id}">✕ Decline</button>
          </div>`;
      }

      const time = new Date(msg.createdAt).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      });

      return `
        <div class="message-card ${unread ? 'unread' : ''} ${isLoveNote ? 'love-note' : ''}" data-id="${msg.id}">
          <div class="message-from">${isLoveNote ? '💕 ' : ''}From <strong>${fromInfo?.name || msg.from}</strong> · ${time}</div>
          <div class="message-text">${msg.text}</div>
          ${tripPreview}
          ${wishlistPreview}
          ${actions}
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-approve]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.approveTrip(btn.dataset.approve);
      });
    });

    listEl.querySelectorAll('[data-reject]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.rejectTrip(btn.dataset.reject);
      });
    });

    listEl.querySelectorAll('.message-card').forEach(card => {
      card.addEventListener('click', () => {
        const msg = messages.find(m => m.id === card.dataset.id);
        if (msg && !msg.read && msg.to === user) {
          this.markRead(msg.id);
          card.classList.remove('unread');
        }
        if (msg?.tripId) {
          const trip = Storage.getTrips().find(t => t.id === msg.tripId);
          if (trip) {
            App.closePanel('messages-panel');
            Trips.showDetail(trip.id);
          }
        }
        if (msg?.wishlistId) {
          Wishlist.openFromMessage(msg.wishlistId);
        }
      });
    });
  }
};
