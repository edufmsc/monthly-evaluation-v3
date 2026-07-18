(function () {
  'use strict';

  function getStorageKey() {
    return window.V3_CONFIG.SESSION_STORAGE_KEY || 'monthlyEvaluationV3Session';
  }

  function readSession() {
    var raw = window.sessionStorage.getItem(getStorageKey());
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.sessionToken || !parsed.user) return null;
      return parsed;
    } catch (error) {
      window.sessionStorage.removeItem(getStorageKey());
      return null;
    }
  }

  function saveSession(session) {
    window.sessionStorage.setItem(getStorageKey(), JSON.stringify({
      sessionToken: String(session.sessionToken || ''),
      expiresInSeconds: Number(session.expiresInSeconds || 0),
      user: session.user || {},
      permissions: session.permissions || {},
      savedAt: new Date().toISOString()
    }));
    return readSession();
  }

  function clearSession() {
    window.sessionStorage.removeItem(getStorageKey());
  }

  async function login(employeeId, password) {
    var result = await window.V3ApiClient.request('login', {
      empId: String(employeeId || '').trim().toUpperCase(),
      password: String(password || '')
    }, '');
    return saveSession(result.data || {});
  }

  async function validateSession() {
    var current = readSession();
    if (!current) return null;
    try {
      var result = await window.V3ApiClient.request('session', {}, current.sessionToken);
      current.user = result.data.user || current.user;
      current.permissions = result.data.permissions || current.permissions;
      return saveSession(current);
    } catch (error) {
      clearSession();
      throw error;
    }
  }

  async function logout() {
    var current = readSession();
    try {
      if (current && current.sessionToken) {
        await window.V3ApiClient.request('logout', {}, current.sessionToken);
      }
    } finally {
      clearSession();
    }
  }

  window.V3AuthService = Object.freeze({
    readSession: readSession,
    login: login,
    validateSession: validateSession,
    logout: logout,
    clearSession: clearSession
  });
})();
