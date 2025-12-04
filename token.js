// token.js
const Auth = {
  key: 'sa_auth_token',

  login(username) {
    // Create a simple dummy token
    const token = btoa(`${username}:${Date.now()}`);
    localStorage.setItem(this.key, token);
    localStorage.setItem('sa_username', username);
    return true;
  },

  logout() {
    localStorage.removeItem(this.key);
    localStorage.removeItem('sa_username');
    window.location.href = '/login.html';
  },

  isLoggedIn() {
    return !!localStorage.getItem(this.key);
  },

  getUser() {
    return localStorage.getItem('sa_username') || 'Guest';
  },

  // Guard clause to protect dashboard pages
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
    }
  }
};

window.Auth = Auth;
