(function () {
  'use strict';

  var APP_BUILD = '6.1.0-history-admin';
  var elements = {};
  var state = {
    session: null,
    pending: [],
    history: [],
    currentDetail: null,
    currentAction: '',
    signatureController: null,
    draftTimer: null,
    draftServerTimer: null,
    draftLoaded: false
  };

  var NORMAL_ACTIONS = Object.keys(window.V3EvaluationForm ? window.V3EvaluationForm.ACTION_LABELS : {});

  document.addEventListener('DOMContentLoaded', initialize);

  function initialize() {
    cacheElements();
    bindEvents();
    elements.appVersion.textContent = APP_BUILD;

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
      'userName', 'userRole', 'userEmployeeId', 'profileRole', 'userDepartment', 'profileDepartment',
      'userArea', 'userStore', 'profileStore', 'logoutButton', 'systemTabButton',
      'dashboardMessage', 'appVersion', 'pendingCountBadge', 'pendingPanel', 'historyPanel', 'profilePanel', 'systemPanel',
      'refreshPendingButton', 'pendingList', 'historyFilterForm', 'historyMonth', 'historyEmployeeId',
      'historyEmployeeFilter', 'historyStatus', 'historyList', 'historyScopeText',
      'adminRefreshSessionButton', 'adminHealthCheckButton', 'adminSystemHealthButton',
      'adminSystemMessage', 'adminSystemResult', 'evaluationOverlay', 'closeEvaluationButton', 'evaluationLoading',
      'evaluationMessage', 'evaluationContent', 'evaluationSummary', 'evaluationReadOnly', 'claimPanel',
      'claimMessage', 'claimButton', 'releaseButton', 'actionPanel', 'actionSelector', 'evaluationActionForm',
      'draftStatus', 'saveDraftButton', 'submitEvaluationButton', 'evaluationDialogTitle'
    ];
    ids.forEach(function (id) { elements[id] = document.getElementById(id); });
    elements.tabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
  }

  function bindEvents() {
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.togglePassword.addEventListener('click', togglePasswordVisibility);
    elements.password.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); });
    elements.employeeId.addEventListener('input', function () { this.value = this.value.toUpperCase(); });
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.adminRefreshSessionButton.addEventListener('click', runAdminSessionCheck);
    elements.adminHealthCheckButton.addEventListener('click', runAdminConnectionCheck);
    elements.adminSystemHealthButton.addEventListener('click', runAdminSystemHealth);
    elements.refreshPendingButton.addEventListener('click', loadPending);
    elements.historyFilterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      loadHistory();
    });
    elements.tabButtons.forEach(function (button) {
      button.addEventListener('click', function () { switchTab(button.getAttribute('data-tab')); });
    });
    elements.closeEvaluationButton.addEventListener('click', closeEvaluation);
    elements.evaluationOverlay.addEventListener('click', function (event) {
      if (event.target === elements.evaluationOverlay) closeEvaluation();
    });
    elements.claimButton.addEventListener('click', handleClaim);
    elements.releaseButton.addEventListener('click', handleRelease);
    elements.actionSelector.addEventListener('change', function () { renderSelectedAction(this.value); });
    elements.saveDraftButton.addEventListener('click', function () { saveCurrentDraft(true); });
    elements.submitEvaluationButton.addEventListener('click', submitCurrentAction);
    elements.evaluationActionForm.addEventListener('input', scheduleDraftSave);
    elements.evaluationActionForm.addEventListener('change', scheduleDraftSave);
    window.addEventListener('beforeunload', saveLocalDraft);
  }

  async function restoreSession() {
    var session = window.V3AuthService.readSession();
    if (!session) {
      showLogin();
      return;
    }
    try {
      showDashboardShell(session);
      setDashboardMessage('info', '正在確認登入狀態…');
      state.session = await window.V3AuthService.validateSession();
      showDashboardShell(state.session);
      await loadBootstrap();
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
    if (!employeeId) return focusError(elements.employeeId, '請輸入員工工號。');
    if (!/^\d{4}$/.test(password)) return focusError(elements.password, '登入密碼必須是 4 碼數字。');

    setButtonLoading(elements.loginButton, true, '登入中');
    try {
      state.session = await window.V3AuthService.login(employeeId, password);
      elements.password.value = '';
      showDashboardShell(state.session);
      await loadBootstrap();
      await checkHealth(false);
    } catch (error) {
      showLoginMessage('error', friendlyError(error));
    } finally {
      setButtonLoading(elements.loginButton, false, '登入');
    }
  }

  async function loadBootstrap() {
    setDashboardMessage('info', '正在載入待辦資料…');
    var result = await window.V3WorkflowService.bootstrap(100);
    var data = result.data || {};
    state.session = window.V3AuthService.updateSessionData(data) || state.session;
    state.pending = data.pending && Array.isArray(data.pending.items) ? data.pending.items : [];
    renderPending();
    elements.pendingCountBadge.textContent = String(data.counts && data.counts.pending || state.pending.length);
    clearDashboardMessage();
  }

  async function loadPending() {
    elements.pendingList.innerHTML = '<div class="loading-list">正在重新整理待辦…</div>';
    elements.refreshPendingButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.listPending(100);
      state.pending = result.data && Array.isArray(result.data.items) ? result.data.items : [];
      renderPending();
      elements.pendingCountBadge.textContent = String(result.data && result.data.total || state.pending.length);
    } catch (error) {
      elements.pendingList.innerHTML = emptyStateHtml('待辦載入失敗', friendlyError(error));
    } finally {
      elements.refreshPendingButton.disabled = false;
    }
  }

  async function loadHistory() {
    elements.historyList.innerHTML = '<div class="loading-list">正在查詢歷史紀錄…</div>';
    try {
      var result = await window.V3WorkflowService.listHistory({
        limit: 200,
        month: String(elements.historyMonth.value || '').trim(),
        employeeId: String(elements.historyEmployeeId.value || '').trim().toUpperCase(),
        status: String(elements.historyStatus.value || '').trim()
      });
      state.history = result.data && Array.isArray(result.data.items) ? result.data.items : [];
      renderHistory();
    } catch (error) {
      elements.historyList.innerHTML = emptyStateHtml('歷史查詢失敗', friendlyError(error));
    }
  }

  function renderPending() {
    if (!state.pending.length) {
      elements.pendingList.innerHTML = emptyStateHtml('目前無待處理考核表', '新的月考核表進入您的階段後，會顯示在這裡。');
      return;
    }
    elements.pendingList.innerHTML = state.pending.map(function (item) { return evaluationCardHtml(item, true); }).join('');
    bindEvaluationCards(elements.pendingList);
  }

  function renderHistory() {
    if (!state.history.length) {
      elements.historyList.innerHTML = emptyStateHtml('查無歷史紀錄', '請調整月份、人員或狀態條件後重新查詢。');
      return;
    }
    elements.historyList.innerHTML = state.history.map(function (item) { return evaluationCardHtml(item, false); }).join('');
    bindEvaluationCards(elements.historyList);
  }

  function evaluationCardHtml(item, pending) {
    var tags = '<span class="tag">' + escapeHtml(item.status || '未設定狀態') + '</span>';
    if (item.claimWarning) tags += '<span class="tag tag--warning">停留超過24小時</span>';
    if (item.isVoid) tags += '<span class="tag tag--danger">已作廢</span>';
    return '<article class="evaluation-card">' +
      '<div class="evaluation-card__top"><div><h3>' + escapeHtml(item.employeeName || '未命名') + '</h3><p>' + escapeHtml(item.evaluationNo || '') + '</p></div><div>' + tags + '</div></div>' +
      '<div class="evaluation-card__meta">' +
        metaItem('考核月份', item.evaluationMonth) +
        metaItem('店別', joinStore(item.storeCode, item.storeName)) +
        metaItem('區域／營業處', joinText(item.area, item.department)) +
        metaItem('目前承辦', joinText(item.assignedRole, item.assignedEmployeeName || item.assignedEmployeeId)) +
      '</div>' +
      '<div class="evaluation-card__actions"><button type="button" class="secondary-button" data-open-evaluation="' + escapeHtml(item.evaluationNo) + '">' + (pending ? '開啟處理' : '查看內容') + '</button></div>' +
    '</article>';
  }

  function bindEvaluationCards(container) {
    Array.prototype.slice.call(container.querySelectorAll('[data-open-evaluation]')).forEach(function (button) {
      button.addEventListener('click', function () { openEvaluation(button.getAttribute('data-open-evaluation')); });
    });
  }

  async function openEvaluation(evaluationNo) {
    clearDraftTimers();
    state.currentDetail = null;
    state.currentAction = '';
    state.signatureController = null;
    state.draftLoaded = false;
    elements.evaluationOverlay.hidden = false;
    document.body.classList.add('is-locked');
    elements.evaluationLoading.hidden = false;
    elements.evaluationContent.hidden = true;
    clearEvaluationMessage();
    try {
      var result = await window.V3WorkflowService.getEvaluation(evaluationNo);
      state.currentDetail = result.data || {};
      renderEvaluationDetail();
      elements.evaluationContent.hidden = false;
    } catch (error) {
      showEvaluationMessage('error', friendlyError(error));
    } finally {
      elements.evaluationLoading.hidden = true;
    }
  }

  function closeEvaluation() {
    saveLocalDraft();
    clearDraftTimers();
    elements.evaluationOverlay.hidden = true;
    document.body.classList.remove('is-locked');
    elements.evaluationContent.hidden = true;
    state.currentDetail = null;
    state.currentAction = '';
    state.signatureController = null;
  }

  function renderEvaluationDetail() {
    var record = state.currentDetail || {};
    elements.evaluationDialogTitle.textContent = (record['受評人員姓名'] || '月考核表') + '｜' + (record['考核單號'] || '');
    elements.evaluationSummary.innerHTML = summaryHtml(record);
    elements.evaluationReadOnly.innerHTML = detailSectionsHtml(record);
    renderClaimPanel(record);
    renderActionPanel(record);
  }

  function summaryHtml(record) {
    return '<div class="summary-grid">' +
      metaItem('考核單號', record['考核單號']) +
      metaItem('考核月份', record['考核月份']) +
      metaItem('受評人員', joinText(record['受評人員工號'], record['受評人員姓名'])) +
      metaItem('轉任日', record['受評人員轉任日']) +
      metaItem('店別', joinStore(record['目前店號'] || record['建立時店號'], record['目前店名'] || record['建立時店名'])) +
      metaItem('目前狀態', record['流程狀態']) +
      metaItem('目前承辦角色', record['目前指派角色']) +
      metaItem('目前承辦人', joinText(record['目前指派人員工號'], record['目前指派人員姓名'])) +
    '</div>';
  }

  function detailSectionsHtml(record) {
    var sections = [
      ['門市店主管評核', [
        ['責任感', record['責任感']], ['協調性', record['協調性']], ['表達能力', record['表達能力']],
        ['學習態度', record['學習態度']], ['解決問題能力', record['解決問題能力']], ['個人儀容', record['個人儀容']],
        ['小計', record['門市店主管小計']], ['評語', record['門市店主管評語']]
      ]],
      ['教育中心評核', [
        ['職能積分累計', record['職能積分累計']], ['職能積分得分', record['職能積分得分']],
        ['OJT完成篇數', record['OJT完成篇數']], ['OJT得分', record['OJT得分']],
        ['每週進度回報', record['每週進度回報得分']], ['培訓課程狀況', record['培訓課程狀況得分']],
        ['教育中心小計', record['教育中心小計']], ['異常回報', record['教育中心異常回報']],
        ['主管評語', record['教育中心主管評語']]
      ]],
      ['區主管與受評人員', [
        ['區主管增減分', record['區主管增減分']], ['區主管評語', record['區主管評語']],
        ['受評人員確認結果', record['受評人員確認結果']], ['受評人員備註', record['受評人員確認備註']]
      ]],
      ['後續簽核', [
        ['營業處主管評語', record['營業處主管評語']], ['營業處主管結果', record['營業處主管簽核結果']],
        ['總經理評語', record['總經理評語']], ['總經理結果', record['總經理簽核結果']],
        ['已評得分', record['已評得分']], ['已評滿分', record['已評滿分']], ['未評階段', record['未評階段']]
      ]]
    ];

    var html = sections.map(function (section) {
      var visible = section[1].filter(function (pair) { return String(pair[1] === null || pair[1] === undefined ? '' : pair[1]).trim() !== ''; });
      if (!visible.length) return '';
      return '<article class="detail-section"><h3>' + escapeHtml(section[0]) + '</h3><div class="detail-grid">' +
        visible.map(function (pair) { return '<div class="detail-item"><span>' + escapeHtml(pair[0]) + '</span><strong>' + escapeHtml(pair[1]) + '</strong></div>'; }).join('') +
      '</div></article>';
    }).join('');

    html += signatureSummaryHtml(record.signatureSummary || {});
    return html || '<article class="detail-section"><p>目前尚無已填寫內容。</p></article>';
  }

  function signatureSummaryHtml(summary) {
    var roles = ['門市店主管', '教育中心成員', '教育中心主管', '區主管', '受評人員', '營業處主管', '總經理'];
    var rows = [];
    roles.forEach(function (role) {
      var item = summary[role];
      if (!item) return;
      rows.push('<div class="signature-status-row"><span>' + escapeHtml(role) + '</span><strong>' +
        escapeHtml(item.signerName || '—') + '｜' + escapeHtml(item.status || '未簽核') + (item.signedAt ? '｜' + escapeHtml(item.signedAt) : '') +
      '</strong></div>');
    });
    if (!rows.length) return '';
    return '<article class="detail-section"><h3>簽核狀態</h3><p class="section-help">流程中不顯示任何人的實際簽名圖片。</p><div class="signature-summary-list">' + rows.join('') + '</div></article>';
  }

  function renderClaimPanel(record) {
    var allowed = Array.isArray(record.allowedActions) ? record.allowedActions : [];
    var canClaim = allowed.indexOf('edu_claim') !== -1;
    var canRelease = allowed.indexOf('edu_release') !== -1;
    elements.claimPanel.hidden = !(canClaim || canRelease);
    elements.claimButton.hidden = !canClaim;
    elements.releaseButton.hidden = !canRelease;
    elements.claimMessage.textContent = canClaim ? '此案件尚未被領取。領取後只有您能編輯教育中心分數。' : '此案件目前由您領取，可自行釋放回共同待辦。';
  }

  function renderActionPanel(record) {
    var allowed = Array.isArray(record.allowedActions) ? record.allowedActions : [];
    var actions = allowed.filter(function (action) { return NORMAL_ACTIONS.indexOf(action) !== -1; });
    if (!actions.length) {
      elements.actionPanel.hidden = true;
      return;
    }
    elements.actionPanel.hidden = false;
    elements.actionSelector.innerHTML = actions.map(function (action) {
      return '<option value="' + escapeHtml(action) + '">' + escapeHtml(window.V3EvaluationForm.ACTION_LABELS[action] || action) + '</option>';
    }).join('');
    renderSelectedAction(actions[0]);
  }

  async function renderSelectedAction(action) {
    clearDraftTimers();
    state.currentAction = action;
    state.signatureController = null;
    state.draftLoaded = false;
    elements.evaluationActionForm.innerHTML = window.V3EvaluationForm.renderActionForm(state.currentDetail || {}, action);
    elements.submitEvaluationButton.querySelector('.button-label').textContent = window.V3EvaluationForm.ACTION_LABELS[action] || '送出';
    initializeSignatureIfNeeded();
    await loadDraftForCurrentAction();
  }

  async function initializeSignatureIfNeeded() {
    var form = elements.evaluationActionForm;
    var section = form.querySelector('[data-signature-section]');
    if (!section) return;
    state.signatureController = new window.V3SignaturePadController({
      canvas: section.querySelector('[data-signature-canvas]'),
      preview: section.querySelector('[data-saved-preview]'),
      clearButton: section.querySelector('[data-clear-signature]'),
      savedRadio: section.querySelector('[data-signature-saved]'),
      drawnRadio: section.querySelector('[data-signature-drawn]'),
      modePanelSaved: section.querySelector('[data-saved-panel]'),
      modePanelDrawn: section.querySelector('[data-drawn-panel]'),
      savedStatus: section.querySelector('[data-saved-status]')
    });
    var hasSaved = Boolean(state.currentDetail && state.currentDetail.mySignature && state.currentDetail.mySignature.hasSavedSignature);
    if (!hasSaved) {
      state.signatureController.setSavedAvailable(false, '');
      return;
    }
    try {
      var result = await window.V3WorkflowService.getMySignaturePreview('saved', state.currentDetail['考核單號']);
      state.signatureController.setSavedAvailable(Boolean(result.data && result.data.found), result.data && result.data.dataUrl || '');
    } catch (error) {
      state.signatureController.setSavedAvailable(false, '');
    }
  }

  async function loadDraftForCurrentAction() {
    if (!state.currentDetail) return;
    var evaluationNo = state.currentDetail['考核單號'];
    var local = readLocalDraft(evaluationNo);
    var server = null;
    try {
      var result = await window.V3WorkflowService.getDraft(evaluationNo);
      if (result.data && result.data.found) server = result.data.content;
    } catch (ignore) {}
    var draft = server && server.action === state.currentAction ? server : (local && local.action === state.currentAction ? local : null);
    if (draft) {
      window.V3EvaluationForm.applyDraft(elements.evaluationActionForm, draft);
      elements.draftStatus.textContent = '已載入先前草稿';
    } else {
      elements.draftStatus.textContent = '尚未儲存草稿';
    }
    state.draftLoaded = true;
  }

  function scheduleDraftSave() {
    if (!state.draftLoaded || !state.currentDetail || !state.currentAction) return;
    window.clearTimeout(state.draftTimer);
    window.clearTimeout(state.draftServerTimer);
    state.draftTimer = window.setTimeout(saveLocalDraft, 400);
    state.draftServerTimer = window.setTimeout(function () { saveCurrentDraft(false); }, 15000);
    elements.draftStatus.textContent = '內容已變更，準備自動儲存…';
  }

  function saveLocalDraft() {
    if (!state.currentDetail || !state.currentAction || !elements.evaluationActionForm) return;
    try {
      var content = window.V3EvaluationForm.formToDraft(elements.evaluationActionForm, state.currentAction);
      window.localStorage.setItem(localDraftKey(state.currentDetail['考核單號']), JSON.stringify(content));
      elements.draftStatus.textContent = '已保存至本機瀏覽器';
    } catch (ignore) {}
  }

  async function saveCurrentDraft(showMessage) {
    if (!state.currentDetail || !state.currentAction) return;
    saveLocalDraft();
    elements.saveDraftButton.disabled = true;
    try {
      var content = window.V3EvaluationForm.formToDraft(elements.evaluationActionForm, state.currentAction);
      var result = await window.V3WorkflowService.saveDraft(state.currentDetail['考核單號'], content);
      elements.draftStatus.textContent = '雲端草稿已保存：' + (result.data && result.data.savedAt || '完成');
      if (showMessage) showEvaluationMessage('success', '草稿已保存，不包含手寫簽名。');
    } catch (error) {
      elements.draftStatus.textContent = '雲端草稿保存失敗，本機草稿仍保留';
      if (showMessage) showEvaluationMessage('error', friendlyError(error));
    } finally {
      elements.saveDraftButton.disabled = false;
    }
  }

  async function submitCurrentAction() {
    if (!state.currentDetail || !state.currentAction) return;
    clearEvaluationMessage();
    var form = elements.evaluationActionForm;
    if (!form.reportValidity()) return;
    var payload;
    try {
      payload = window.V3EvaluationForm.collectActionPayload(form, state.currentAction, state.signatureController);
    } catch (error) {
      showEvaluationMessage('error', error.message || '請確認填寫內容。');
      return;
    }
    payload.evaluationNo = state.currentDetail['考核單號'];
    payload.expectedVersion = state.currentDetail.dataVersion;
    var label = window.V3EvaluationForm.ACTION_LABELS[state.currentAction] || '送出';
    if (!window.confirm('確定要「' + label + '」嗎？\n\n送出後將進入下一個流程階段。')) return;

    setButtonLoading(elements.submitEvaluationButton, true, '送出中');
    try {
      await window.V3WorkflowService.submitAction(payload, window.V3ApiClient.createRequestId());
      removeLocalDraft(state.currentDetail['考核單號']);
      showEvaluationMessage('success', '操作完成，流程已更新。');
      await loadPending();
      window.setTimeout(closeEvaluation, 700);
    } catch (error) {
      showEvaluationMessage('error', friendlyError(error));
    } finally {
      setButtonLoading(elements.submitEvaluationButton, false, label);
    }
  }

  async function handleClaim() {
    if (!state.currentDetail) return;
    elements.claimButton.disabled = true;
    try {
      await window.V3WorkflowService.claim(state.currentDetail['考核單號'], state.currentDetail.dataVersion);
      showEvaluationMessage('success', '已成功領取案件。');
      await reloadCurrentEvaluation();
      await loadPending();
    } catch (error) {
      showEvaluationMessage('error', friendlyError(error));
    } finally {
      elements.claimButton.disabled = false;
    }
  }

  async function handleRelease() {
    if (!state.currentDetail) return;
    if (!window.confirm('確定釋放此案件回教育中心共同待辦嗎？')) return;
    elements.releaseButton.disabled = true;
    try {
      await window.V3WorkflowService.release(state.currentDetail['考核單號'], state.currentDetail.dataVersion);
      showEvaluationMessage('success', '案件已釋放。');
      await loadPending();
      window.setTimeout(closeEvaluation, 500);
    } catch (error) {
      showEvaluationMessage('error', friendlyError(error));
    } finally {
      elements.releaseButton.disabled = false;
    }
  }

  async function reloadCurrentEvaluation() {
    var evaluationNo = state.currentDetail && state.currentDetail['考核單號'];
    if (!evaluationNo) return;
    var result = await window.V3WorkflowService.getEvaluation(evaluationNo);
    state.currentDetail = result.data || {};
    renderEvaluationDetail();
  }

  async function runAdminSessionCheck() {
    showAdminMessage('info', '正在重新驗證登入狀態…');
    elements.adminRefreshSessionButton.disabled = true;
    try {
      state.session = await window.V3AuthService.validateSession();
      showDashboardShell(state.session);
      showAdminMessage('success', '登入狀態有效，角色與組織資料已更新。');
    } catch (error) {
      showLogin();
      showLoginMessage('error', friendlyError(error));
    } finally {
      elements.adminRefreshSessionButton.disabled = false;
    }
  }

  async function runAdminConnectionCheck() {
    showAdminMessage('info', '正在測試後端連線…');
    elements.adminHealthCheckButton.disabled = true;
    try {
      var result = await window.V3ApiClient.health();
      var data = result.data || {};
      setConnectionStatus('online', data.status === 'ok' ? '後端正常' : '已連線');
      showAdminMessage('success', '後端連線正常。API版本：' + valueOrDash(result.apiVersion || data.apiVersion) + '；伺服器時間：' + valueOrDash(data.serverTime));
    } catch (error) {
      setConnectionStatus('offline', '後端無法連線');
      showAdminMessage('error', friendlyError(error));
    } finally {
      elements.adminHealthCheckButton.disabled = false;
    }
  }

  async function runAdminSystemHealth() {
    showAdminMessage('info', '正在執行系統健檢…');
    elements.adminSystemHealthButton.disabled = true;
    elements.adminSystemResult.hidden = true;
    try {
      var result = await window.V3WorkflowService.systemHealth();
      var data = result.data || {};
      elements.adminSystemResult.innerHTML = adminSystemResultHtml(data);
      elements.adminSystemResult.hidden = false;
      showAdminMessage(data.status === 'ok' ? 'success' : 'info', data.status === 'ok' ? '系統健檢完成，未發現必要工作表缺漏。' : '系統健檢完成，請查看下方檢查結果。');
    } catch (error) {
      showAdminMessage('error', friendlyError(error));
    } finally {
      elements.adminSystemHealthButton.disabled = false;
    }
  }

  function adminSystemResultHtml(data) {
    var missing = Array.isArray(data.missingSheets) ? data.missingSheets : [];
    return '<h3>系統健檢結果</h3><div class="admin-result-grid">' +
      metaItem('檢查狀態', data.status === 'ok' ? '正常' : '需注意') +
      metaItem('檢查時間', data.checkedAt) +
      metaItem('必要工作表', data.requiredSheetCount) +
      metaItem('缺少工作表', missing.length ? missing.join('、') : '0') +
      metaItem('考核資料筆數', data.evaluationCount) +
      metaItem('停留超過24小時', data.claimedOver24Hours) +
      metaItem('PDF失敗數', data.pdfFailedCount) +
    '</div><p class="section-help">此健檢只讀取資料，不會修改、清空或刪除任何工作表內容。</p>';
  }

  async function handleLogout() {
    elements.logoutButton.disabled = true;
    try {
      await window.V3AuthService.logout();
    } catch (error) {
      window.V3AuthService.clearSession();
    } finally {
      elements.logoutButton.disabled = false;
      closeEvaluation();
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
      if (showMessage) setDashboardMessage('success', '後端連線正常，API版本：' + String(data.apiVersion || result.apiVersion || '—'));
      return true;
    } catch (error) {
      setConnectionStatus('offline', '後端無法連線');
      if (showMessage) setDashboardMessage('error', friendlyError(error));
      return false;
    }
  }

  function showDashboardShell(session) {
    var user = session && session.user ? session.user : {};
    elements.userName.textContent = valueOrDash(user.name);
    elements.userRole.textContent = valueOrDash(user.role);
    elements.userEmployeeId.textContent = valueOrDash(user.employeeId);
    elements.profileRole.textContent = valueOrDash(user.role);
    elements.userDepartment.textContent = valueOrDash(user.department);
    elements.profileDepartment.textContent = valueOrDash(user.department);
    elements.userArea.textContent = valueOrDash(user.area);
    elements.userStore.textContent = joinStore(user.storeCode, user.storeName);
    elements.profileStore.textContent = joinStore(user.storeCode, user.storeName);
    configureRoleBasedInterface(session);
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
  }

  function configureRoleBasedInterface(session) {
    var user = session && session.user ? session.user : {};
    var permissions = session && session.permissions ? session.permissions : {};
    var isEducation = Boolean(permissions.canManage) || user.role === '教育中心成員' || user.role === '教育中心主管';
    elements.systemTabButton.hidden = !isEducation;
    if (!isEducation && !elements.systemPanel.hidden) switchTab('pending');

    var scopeMap = {
      '受評人員': '僅顯示您自己的月考核歷史紀錄。',
      '門市店主管': '顯示您自己的考核紀錄，以及您曾經實際評核過的人員紀錄。',
      '區主管': '顯示目前轄區的歷史資料、您自己的考核紀錄，以及您過去實際簽核過的紀錄。',
      '營業處副總': '顯示目前營業處的歷史資料、您自己的考核紀錄，以及您過去實際簽核過的紀錄。',
      '營業處協理': '顯示目前營業處的歷史資料、您自己的考核紀錄，以及您過去實際簽核過的紀錄。',
      '教育中心成員': '可查詢全公司所有月考核紀錄。',
      '教育中心主管': '可查詢全公司所有月考核紀錄。',
      '總經理': '可查詢全公司所有月考核紀錄。'
    };
    elements.historyScopeText.textContent = scopeMap[user.role] || '查詢您有權限查看的月考核紀錄。';

    var ownOnly = user.role === '受評人員';
    elements.historyEmployeeFilter.hidden = ownOnly;
    if (ownOnly) elements.historyEmployeeId.value = '';
  }

  function showLogin() {
    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;
    clearDashboardMessage();
  }

  function switchTab(tab) {
    var map = { pending: elements.pendingPanel, history: elements.historyPanel, profile: elements.profilePanel, system: elements.systemPanel };
    Object.keys(map).forEach(function (name) { map[name].hidden = name !== tab; });
    elements.tabButtons.forEach(function (button) { button.classList.toggle('is-active', button.getAttribute('data-tab') === tab); });
    if (tab === 'history' && !state.history.length) loadHistory();
    if (tab === 'system' && elements.systemTabButton.hidden) switchTab('pending');
  }

  function togglePasswordVisibility() {
    var showing = elements.password.type === 'text';
    elements.password.type = showing ? 'password' : 'text';
    elements.togglePassword.textContent = showing ? '顯示' : '隱藏';
    elements.togglePassword.setAttribute('aria-pressed', String(!showing));
  }

  function clearDraftTimers() {
    window.clearTimeout(state.draftTimer);
    window.clearTimeout(state.draftServerTimer);
    state.draftTimer = null;
    state.draftServerTimer = null;
  }

  function localDraftKey(evaluationNo) {
    var empId = state.session && state.session.user && state.session.user.employeeId || 'unknown';
    return 'V3Draft:' + empId + ':' + String(evaluationNo || '');
  }

  function readLocalDraft(evaluationNo) {
    try {
      var raw = window.localStorage.getItem(localDraftKey(evaluationNo));
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function removeLocalDraft(evaluationNo) {
    try { window.localStorage.removeItem(localDraftKey(evaluationNo)); } catch (ignore) {}
  }

  function setConnectionStatus(stateName, text) {
    elements.connectionBadge.className = 'status-badge status-badge--' + stateName;
    elements.connectionBadge.textContent = text;
  }

  function setButtonLoading(button, loading, label) {
    button.disabled = loading;
    button.classList.toggle('is-loading', loading);
    var node = button.querySelector('.button-label');
    if (node) node.textContent = label;
  }

  function focusError(input, text) {
    showLoginMessage('error', text);
    input.focus();
  }

  function showLoginMessage(type, text) { showMessage(elements.loginMessage, type, text); }
  function clearLoginMessage() { clearMessage(elements.loginMessage); }
  function setDashboardMessage(type, text) { showMessage(elements.dashboardMessage, type, text); }
  function clearDashboardMessage() { clearMessage(elements.dashboardMessage); }
  function showAdminMessage(type, text) { showMessage(elements.adminSystemMessage, type, text); }
  function showEvaluationMessage(type, text) { showMessage(elements.evaluationMessage, type, text); }
  function clearEvaluationMessage() { clearMessage(elements.evaluationMessage); }

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
      NETWORK_ERROR: '無法連線到後端，請確認網路與Apps Script部署。',
      INVALID_RESPONSE: '後端回傳格式異常，請聯絡系統管理人員。',
      VERSION_CONFLICT: '此考核表已被其他人更新，請關閉後重新開啟。',
      ALREADY_CLAIMED: '此案件已被其他教育中心成員領取。',
      NOT_ASSIGNED: '此月考核表目前不是由您處理。',
      SIGNATURE_REQUIRED: '請使用預存簽名或完成手寫簽名。',
      SAVED_SIGNATURE_NOT_FOUND: '沒有可用的預存簽名，請改用手寫簽名。',
      REASON_REQUIRED: '退回原因為必填。',
      ABNORMAL_REPORT_REQUIRED: '教育中心異常回報必填；沒有異常請填「無」。'
    };
    return messages[code] || String(error && error.message || '系統處理失敗。');
  }

  function valueOrDash(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    return text || '—';
  }

  function escapeHtml(value) { return window.V3EvaluationForm.escapeHtml(value); }
  function joinStore(code, name) { return joinText(code, name); }
  function joinText(first, second) {
    var a = String(first || '').trim();
    var b = String(second || '').trim();
    if (a && b) return a + '｜' + b;
    return a || b || '—';
  }
  function metaItem(label, value) {
    return '<div><span>' + escapeHtml(label) + '</span><strong>' + escapeHtml(valueOrDash(value)) + '</strong></div>';
  }
  function emptyStateHtml(title, text) {
    return '<div class="empty-state"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(text) + '</p></div>';
  }
})();
