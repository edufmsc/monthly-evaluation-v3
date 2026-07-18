(function () {
  'use strict';

  var elements = {};

  document.addEventListener('DOMContentLoaded', initialize);

  function initialize() {
    cacheElements();
    bindEvents();
    elements.appVersion.textContent = window.V3_CONFIG.APP_VERSION;

    if (!window.V3ApiClient.isConfigured()) {
      elements.configErrorCard.hidden = false;
      setConnectionStatus('offline', '尚未設定 API');
      elements.loginButton.disabled = true;
      return;
    }

    checkHealth(false);
    restoreSession();
  }

  function cacheElements() {
    var ids = [
      'connectionBadge', 'configErrorCard', 'loginView', 'dashboardView', 'loginForm',
      'employeeId', 'password', 'togglePassword', 'loginMessage', 'loginButton',
      'userName', 'userRole', 'userEmployeeId', 'userDepartment', 'userArea', 'userStore',
      'refreshSessionButton', 'healthCheckButton', 'logoutButton', 'dashboardMessage', 'appVersion'
    ];
    ids.forEach(function (id) { elements[id] = document.getElementById(id); });
  }

  function bindEvents() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.togglePassword.addEventListener('click', togglePasswordVisibility);
    elements.password.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
    elements.employeeId.addEventListener('input', function () {
      this.value = this.value.toUpperCase();
    });
    elements.refreshSessionButton.addEventListener('click', refreshSession);
    elements.healthCheckButton.addEventListener('click', function () { checkHealth(true); });
    elements.logoutButton.addEventListener('click', handleLogout);
  }

  async function restoreSession() {
    var session = window.V3AuthService.readSession();
    if (!session) {
      showLogin();
      return;
    }
    try {
      setDashboardMessage('info', '正在確認登入狀態…');
      var refreshed = await window.V3AuthService.validateSession();
      renderDashboard(refreshed);
      clearDashboardMessage();
    } catch (error) {
      showLogin();
      showLoginMessage('info', friendlyError(error));
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearLoginMessage();

    var employeeId = String(elements.employeeId.value || '').trim().toUpperCase();
    var password = String(elements.password.value || '');

    if (!employeeId) {
      showLoginMessage('error', '請輸入員工工號。');
      elements.employeeId.focus();
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      showLoginMessage('error', '登入密碼必須是 4 碼數字。');
      elements.password.focus();
      return;
    }

    setButtonLoading(elements.loginButton, true, '登入中');
    try {
      var session = await window.V3AuthService.login(employeeId, password);
      elements.password.value = '';
      renderDashboard(session);
      await checkHealth(false);
    } catch (error) {
      showLoginMessage('error', friendlyError(error));
    } finally {
      setButtonLoading(elements.loginButton, false, '登入');
    }
  }

  async function refreshSession() {
    setDashboardMessage('info', '正在重新驗證登入狀態…');
    elements.refreshSessionButton.disabled = true;
    try {
      var session = await window.V3AuthService.validateSession();
      renderDashboard(session);
      setDashboardMessage('success', '登入狀態有效。');
    } catch (error) {
      showLogin();
      showLoginMessage('error', friendlyError(error));
    } finally {
      elements.refreshSessionButton.disabled = false;
    }
  }

  async function handleLogout() {
    elements.logoutButton.disabled = true;
    setDashboardMessage('info', '正在登出…');
    try {
      await window.V3AuthService.logout();
    } catch (error) {
      // 後端登出失敗時仍清除本機 Session，避免使用者被卡住。
      window.V3AuthService.clearSession();
    } finally {
      elements.logoutButton.disabled = false;
      showLogin();
      showLoginMessage('success', '已登出。');
      elements.employeeId.focus();
    }
  }

  async function checkHealth(showMessage) {
    setConnectionStatus('checking', '檢查連線中');
    try {
      var result = await window.V3ApiClient.health();
      var data = result.data || {};
      setConnectionStatus('online', data.status === 'ok' ? '後端正常' : '已連線');
      if (showMessage) setDashboardMessage('success', '後端連線正常，API 版本：' + String(data.apiVersion || result.apiVersion || '—'));
      return true;
    } catch (error) {
      setConnectionStatus('offline', '後端無法連線');
      if (showMessage) setDashboardMessage('error', friendlyError(error));
      return false;
    }
  }

  function renderDashboard(session) {
    var user = session && session.user ? session.user : {};
    elements.userName.textContent = valueOrDash(user.name);
    elements.userRole.textContent = valueOrDash(user.role);
    elements.userEmployeeId.textContent = valueOrDash(user.employeeId);
    elements.userDepartment.textContent = valueOrDash(user.department);
    elements.userArea.textContent = valueOrDash(user.area);
    elements.userStore.textContent = joinStore(user.storeCode, user.storeName);
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
  }

  function showLogin() {
    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;
    clearDashboardMessage();
  }

  function togglePasswordVisibility() {
    var showing = elements.password.type === 'text';
    elements.password.type = showing ? 'password' : 'text';
    elements.togglePassword.textContent = showing ? '顯示' : '隱藏';
    elements.togglePassword.setAttribute('aria-pressed', String(!showing));
    elements.togglePassword.setAttribute('aria-label', showing ? '顯示密碼' : '隱藏密碼');
  }

  function setConnectionStatus(state, text) {
    elements.connectionBadge.className = 'status-badge status-badge--' + state;
    elements.connectionBadge.textContent = text;
  }

  function setButtonLoading(button, loading, label) {
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    var node = button.querySelector('.button-label');
    if (node) node.textContent = label;
  }

  function showLoginMessage(type, text) {
    showMessage(elements.loginMessage, type, text);
  }

  function clearLoginMessage() {
    clearMessage(elements.loginMessage);
  }

  function setDashboardMessage(type, text) {
    showMessage(elements.dashboardMessage, type, text);
  }

  function clearDashboardMessage() {
    clearMessage(elements.dashboardMessage);
  }

  function showMessage(element, type, text) {
    element.className = 'form-message form-message--' + type;
    element.textContent = text;
    element.hidden = false;
  }

  function clearMessage(element) {
    element.textContent = '';
    element.hidden = true;
    element.className = 'form-message';
  }

  function friendlyError(error) {
    var code = String(error && error.code || '');
    var messages = {
      LOGIN_FAILED: '工號或密碼錯誤，請重新確認。',
      ACCOUNT_LOCKED: '帳號已鎖定，請聯絡教育中心解鎖。',
      ACCOUNT_DISABLED: '此帳號目前未啟用，請聯絡教育中心。',
      ROLE_NOT_CONFIGURED: '此帳號尚未設定有效角色，請聯絡教育中心。',
      SESSION_REQUIRED: '登入狀態不存在，請重新登入。',
      SESSION_EXPIRED: '登入已逾時，請重新登入。',
      SESSION_INVALID: '登入狀態無效，請重新登入。',
      SESSION_REVOKED: '帳號資料已更新，請重新登入。',
      REQUEST_TIMEOUT: '連線逾時，請確認網路後重試。',
      NETWORK_ERROR: '無法連線到後端，請確認 Apps Script 部署與網路。',
      API_URL_NOT_CONFIGURED: '尚未設定 Apps Script /exec 網址。',
      INVALID_RESPONSE: '後端回傳格式異常，請聯絡系統管理人員。'
    };
    return messages[code] || String(error && error.message || '系統處理失敗。');
  }

  function valueOrDash(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    return text || '—';
  }

  function joinStore(code, name) {
    var cleanCode = String(code || '').trim();
    var cleanName = String(name || '').trim();
    if (cleanCode && cleanName) return cleanCode + '｜' + cleanName;
    return cleanCode || cleanName || '—';
  }
})();
