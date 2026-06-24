const Auth = {
  USERS: {
    juste: { name: 'Juste', avatar: 'J', class: 'juste' },
    david: { name: 'David', avatar: 'D', class: 'david' }
  },

  getOtherUser(user) {
    return user === 'juste' ? 'david' : 'juste';
  },

  getUserInfo(user) {
    return this.USERS[user] || null;
  },

  login(user) {
    if (!this.USERS[user]) return false;
    Storage.setCurrentUser(user);
    return true;
  },

  logout() {
    Storage.setCurrentUser(null);
  },

  getCurrentUser() {
    return Storage.getCurrentUser();
  },

  isLoggedIn() {
    return !!this.getCurrentUser();
  }
};
