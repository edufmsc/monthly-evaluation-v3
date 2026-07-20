(function () {
  'use strict';

  var APP_BUILD = '7.0.4-performance-baseline';
  var elements = {};
  var state = {
    session: null,
    pending: [],
    progress: [],
    progressSummary: null,
    history: [],
    currentDetail: null,
    currentAction: '',
    signatureController: null,
    draftTimer: null,
    draftServerTimer: null,
    draftLoaded: false,
    isSubmitting: false,
    testDispatchCandidates: [],
    testDispatchPreview: null,
    lastAutoRefreshAt: 0,
    deferredAutoRefresh: false,
    activeTab: 'pending',
    pendingRenderSignature: '',
    progressRenderSignature: '',
    historyRenderSignature: '',
    pendingMutationLocks: {},
    pdfViewerOpen: false,
    pdfViewerRenderId: 0,
    pdfJsModulePromise: null
  };

  var NORMAL_ACTIONS = Object.keys(window.V3EvaluationForm ? window.V3EvaluationForm.ACTION_LABELS : {});

  document.addEventListener('DOMContentLoaded', initialize);

  function initialize() {
    var publicPdfToken = getPublicPdfToken();
    if (publicPdfToken) {
      initializePublicPdfView(publicPdfToken);
      return;
    }
    cacheElements();
    ensurePdfViewerModal();
    bindEvents();
    elements.appVersion.textContent = APP_BUILD;
    elements.testDispatchMonth.value = currentRocMonthFirstDay();
    if (elements.createTestDispatchButton) {
      var createLabel = elements.createTestDispatchButton.querySelector('.button-label');
      if (createLabel) createLabel.textContent = '手動建立月考核表';
    }
    if (elements.previewTestDispatchButton) {
      var previewLabel = elements.previewTestDispatchButton.querySelector('.button-label');
      if (previewLabel) previewLabel.textContent = '預覽建立路線';
    }

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
      'dashboardMessage', 'appVersion', 'pendingCountBadge', 'progressCountBadge', 'pendingPanel', 'progressPanel', 'historyPanel', 'profilePanel', 'systemPanel',
      'refreshPendingButton', 'pendingList', 'refreshProgressButton', 'progressFilterForm', 'progressMonth',
      'progressEmployeeId', 'progressEmployeeFilter', 'progressDepartment', 'progressArea', 'progressStatus',
      'progressList', 'progressSummary', 'progressScopeText', 'historyFilterForm', 'historyMonth', 'historyEmployeeId',
      'historyEmployeeFilter', 'historyDepartment', 'historyArea', 'historyStatus', 'historyList', 'historyScopeText',
      'adminRefreshSessionButton', 'adminHealthCheckButton', 'adminSystemHealthButton',
      'adminSystemMessage', 'adminSystemResult', 'testDispatchForm', 'refreshTestCandidatesButton',
      'testDispatchEmployee', 'testDispatchEmployeeHint', 'testDispatchMonth', 'testDispatchReason',
      'previewTestDispatchButton', 'testDispatchMessage', 'testDispatchPreview', 'testDispatchPreviewContent',
      'testDispatchConfirm', 'createTestDispatchButton', 'evaluationOverlay', 'closeEvaluationButton', 'evaluationLoading',
      'evaluationMessage', 'evaluationContent', 'evaluationSummary', 'evaluationReadOnly', 'claimPanel',
      'claimMessage', 'claimButton', 'releaseButton', 'actionPanel', 'actionSelector', 'evaluationActionForm',
      'draftStatus', 'saveDraftButton', 'submitEvaluationButton', 'evaluationDialogTitle',
      'globalNoticeOverlay', 'globalNoticeIcon', 'globalNoticeTitle', 'globalNoticeText', 'globalNoticeClose'
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
    elements.refreshTestCandidatesButton.addEventListener('click', loadTestDispatchCandidates);
    elements.testDispatchForm.addEventListener('submit', previewTestDispatch);
    elements.testDispatchEmployee.addEventListener('change', handleTestDispatchInputChange);
    elements.testDispatchMonth.addEventListener('input', handleTestDispatchInputChange);
    elements.testDispatchReason.addEventListener('input', updateTestDispatchCreateState);
    elements.testDispatchConfirm.addEventListener('change', updateTestDispatchCreateState);
    elements.createTestDispatchButton.addEventListener('click', createTestDispatch);
    elements.refreshPendingButton.addEventListener('click', loadPending);
    elements.refreshProgressButton.addEventListener('click', loadProgress);
    elements.progressFilterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      loadProgress();
    });
    elements.historyFilterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      loadHistory();
    });
    elements.tabButtons.forEach(function (button) {
      button.addEventListener('click', function () { switchTab(button.getAttribute('data-tab')); });
    });
    elements.closeEvaluationButton.addEventListener('click', function () {
      if (!state.isSubmitting) closeEvaluation({ saveDraft: true });
    });
    elements.evaluationOverlay.addEventListener('click', function (event) {
      if (event.target === elements.evaluationOverlay && !state.isSubmitting) closeEvaluation({ saveDraft: true });
    });
    elements.claimButton.addEventListener('click', handleClaim);
    elements.releaseButton.addEventListener('click', handleRelease);
    elements.actionSelector.addEventListener('change', function () { renderSelectedAction(this.value); });
    elements.saveDraftButton.addEventListener('click', function () { saveCurrentDraft(true); });
    elements.submitEvaluationButton.addEventListener('click', submitCurrentAction);
    elements.evaluationActionForm.addEventListener('input', scheduleDraftSave);
    elements.evaluationActionForm.addEventListener('change', scheduleDraftSave);
    window.addEventListener('beforeunload', function () { if (!state.isSubmitting) saveLocalDraft(); });
    elements.globalNoticeClose.addEventListener('click', closeGlobalNotice);
    window.addEventListener('focus', handleAutomaticRefresh);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) handleAutomaticRefresh(); });
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
    state.pendingRenderSignature = createListRenderSignature(state.pending, { total: data.counts && data.counts.pending || state.pending.length });
    renderPending();
    elements.pendingCountBadge.textContent = String(data.counts && data.counts.pending || state.pending.length);
    await loadProgress({ quiet: true });
    clearDashboardMessage();
  }

  async function loadPending(options) {
    var settings = options || {};
    if (!settings.quiet) elements.pendingList.innerHTML = '<div class="loading-list">正在重新整理待辦…</div>';
    elements.refreshPendingButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.listPending(100);
      var rawItems = result.data && Array.isArray(result.data.items) ? result.data.items : [];
      var nextItems = rawItems.filter(function (item) { return !isPendingMutationLocked(item.evaluationNo); });
      var nextSignature = createListRenderSignature(nextItems, { total: nextItems.length });
      state.pending = nextItems;
      if (!settings.quiet || nextSignature !== state.pendingRenderSignature) renderPending();
      state.pendingRenderSignature = nextSignature;
      elements.pendingCountBadge.textContent = String(state.pending.length);
    } catch (error) {
      if (!settings.quiet) elements.pendingList.innerHTML = emptyStateHtml('待辦載入失敗', friendlyError(error));
    } finally {
      elements.refreshPendingButton.disabled = false;
    }
  }

  async function loadProgress(options) {
    var settings = options || {};
    if (!settings.quiet) elements.progressList.innerHTML = '<div class="loading-list">正在查詢流程動態…</div>';
    elements.refreshProgressButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.listProgress({
        limit: 500,
        month: String(elements.progressMonth.value || '').trim(),
        employeeId: String(elements.progressEmployeeId.value || '').trim().toUpperCase(),
        department: String(elements.progressDepartment.value || '').trim(),
        area: String(elements.progressArea.value || '').trim(),
        status: String(elements.progressStatus.value || '').trim()
      });
      var data = result.data || {};
      var nextItems = Array.isArray(data.items) ? data.items : [];
      var nextSummary = data.summary || {};
      var nextSignature = createListRenderSignature(nextItems, nextSummary);
      state.progress = nextItems;
      state.progressSummary = nextSummary;
      elements.progressCountBadge.textContent = String(data.total || state.progress.length);
      if (!settings.quiet || nextSignature !== state.progressRenderSignature) renderProgress();
      state.progressRenderSignature = nextSignature;
    } catch (error) {
      if (!settings.quiet) {
        elements.progressList.innerHTML = emptyStateHtml('流程追蹤載入失敗', friendlyError(error));
        elements.progressSummary.innerHTML = '';
      }
    } finally {
      elements.refreshProgressButton.disabled = false;
    }
  }

  async function loadHistory(options) {
    var settings = options || {};
    if (!settings.quiet) elements.historyList.innerHTML = '<div class="loading-list">正在查詢歷史紀錄…</div>';
    try {
      var result = await window.V3WorkflowService.listHistory({
        limit: 200,
        month: String(elements.historyMonth.value || '').trim(),
        employeeId: String(elements.historyEmployeeId.value || '').trim().toUpperCase(),
        department: String(elements.historyDepartment.value || '').trim(),
        area: String(elements.historyArea.value || '').trim(),
        status: String(elements.historyStatus.value || '').trim()
      });
      var nextItems = result.data && Array.isArray(result.data.items) ? result.data.items : [];
      var nextSignature = createListRenderSignature(nextItems, { total: result.data && result.data.total || nextItems.length });
      state.history = nextItems;
      if (!settings.quiet || nextSignature !== state.historyRenderSignature) renderHistory();
      state.historyRenderSignature = nextSignature;
    } catch (error) {
      if (!settings.quiet) elements.historyList.innerHTML = emptyStateHtml('歷史查詢失敗', friendlyError(error));
    }
  }

  function createListRenderSignature(items, summary) {
    return JSON.stringify({
      items: (items || []).map(function(item) {
        return [item.evaluationNo, item.status, item.assignedRole, item.assignedEmployeeId, item.dataVersion,
          item.updatedAt, item.pdfStatus, item.pdfPublicStatus, item.pdfPublicViewToken, item.pdfHasFile, item.isVoid, item.isException];
      }),
      summary: summary || {}
    });
  }

  function renderPending() {
    if (!state.pending.length) {
      elements.pendingList.innerHTML = emptyStateHtml('目前無待處理考核表', '新的月考核表進入您的階段後，會顯示在這裡。');
      return;
    }
    elements.pendingList.innerHTML = state.pending.map(function (item) { return evaluationCardHtml(item, 'pending'); }).join('');
    bindEvaluationCards(elements.pendingList);
  }

  function renderProgress() {
    renderProgressSummary();
    if (!state.progress.length) {
      elements.progressList.innerHTML = emptyStateHtml('目前沒有符合條件的流程', '請調整月份、營業處、區域或狀態條件後重新查詢。');
      return;
    }
    elements.progressList.innerHTML = state.progress.map(function (item) { return evaluationCardHtml(item, 'progress'); }).join('');
    bindEvaluationCards(elements.progressList);
  }

  function renderProgressSummary() {
    var summary = state.progressSummary || {};
    var byStatus = summary.byStatus || {};
    var rows = Object.keys(byStatus).sort(function (a, b) { return byStatus[b] - byStatus[a]; });
    var totalLabel = isEducationPdfManagerUi() ? '待追蹤／處理總數' : '進行中總數';
    var html = '<article class="progress-summary-card progress-summary-card--total"><span>' + totalLabel + '</span><strong>' + state.progress.length + '</strong></article>';
    html += rows.map(function (status) {
      return '<article class="progress-summary-card"><span>' + escapeHtml(status) + '</span><strong>' + escapeHtml(byStatus[status]) + '</strong></article>';
    }).join('');
    elements.progressSummary.innerHTML = html;
  }

  function renderHistory() {
    if (!state.history.length) {
      elements.historyList.innerHTML = emptyStateHtml('查無歷史紀錄', '請調整月份、人員或狀態條件後重新查詢。');
      return;
    }
    elements.historyList.innerHTML = state.history.map(function (item) { return evaluationCardHtml(item, 'history'); }).join('');
    bindEvaluationCards(elements.historyList);
  }

  function evaluationCardHtml(item, mode) {
    var status = String(item.status || '未設定狀態').trim();
    var pdfStatus = String(item.pdfStatus || '').trim();
    var publicStatus = String(item.pdfPublicStatus || '').trim();
    var effectiveClosed = Boolean(item.isClosed) || status === '結案' ||
      ['結案待PDF產生', 'PDF待處理', 'PDF處理中', 'PDF失敗', 'PDF完成', 'PDF公開失敗'].indexOf(status) !== -1;
    var tagParts = [];
    var tagKeys = {};

    function pushTag(label, cssClass) {
      var key = String(label || '').trim();
      if (!key || tagKeys[key]) return;
      tagKeys[key] = true;
      tagParts.push('<span class="tag' + (cssClass || '') + '">' + escapeHtml(key) + '</span>');
    }

    pushTag(effectiveClosed ? '結案' : status, '');
    if (pdfStatus && pdfStatus !== '未排隊') {
      pushTag('PDF' + pdfStatus, pdfStatus === '完成' ? ' tag--success' : pdfStatus === '失敗' ? ' tag--danger' : ' tag--warning');
    }
    if (publicStatus === '公開失敗') pushTag('PDF公開失敗', ' tag--danger');
    if (item.claimWarning) pushTag('停留超過24小時', ' tag--warning');
    if (item.isVoid) pushTag('已作廢', ' tag--danger');
    if (item.isException) pushTag('例外流程', ' tag--warning');

    var actions = '<button type="button" class="secondary-button" data-open-evaluation="' + escapeHtml(item.evaluationNo) + '">' +
      (mode === 'pending' ? '開啟處理' : mode === 'progress' ? '查看動態' : '查看內容') + '</button>';

    if (isEducationPdfManagerUi() && effectiveClosed && (pdfStatus === '待處理' || pdfStatus === '失敗')) {
      actions += '<button type="button" class="primary-button pdf-generate-button" data-generate-pdf="' + escapeHtml(item.evaluationNo) + '">' +
        (pdfStatus === '失敗' ? '重新產生PDF' : '產生PDF') + '</button>';
    } else if (isEducationPdfManagerUi() && effectiveClosed && pdfStatus === '處理中') {
      actions += '<button type="button" class="secondary-button" disabled>PDF處理中</button>';
    }

    // 正式版：PDF完成且檔案存在時，所有有權查看該考核表的人都顯示同一顆查看按鈕。
    // 點擊後由後端安全確認／補建公開查看碼，不再依清單同步欄位決定是否隱藏按鈕。
    if (effectiveClosed && pdfStatus === '完成' && item.pdfHasFile) {
      actions += '<button type="button" class="secondary-button pdf-view-button" data-prepare-pdf-view="' + escapeHtml(item.evaluationNo) + '">查看月考核表PDF</button>';
    }

    return '<article class="evaluation-card">' +
      '<div class="evaluation-card__top"><div><h3>' + escapeHtml(item.employeeName || '未命名') + '</h3><p>' + escapeHtml(item.evaluationNo || '') + '</p></div><div>' + tagParts.join('') + '</div></div>' +
      '<div class="evaluation-card__meta">' +
        metaItem('考核月份', item.evaluationMonth) +
        metaItem('店別', joinStore(item.storeCode, item.storeName)) +
        metaItem('區域／營業處', joinText(item.area, item.department)) +
        metaItem('目前承辦', joinText(item.assignedRole, item.assignedEmployeeName || item.assignedEmployeeId)) +
      '</div>' +
      '<div class="evaluation-card__actions">' + actions + '</div>' +
    '</article>';
  }

  function isEducationPdfManagerUi() {
    var session = state.session || {};
    var user = session.user || {};
    var permissions = session.permissions || {};
    return Boolean(permissions.canManage) || user.role === '教育中心成員' || user.role === '教育中心主管';
  }

  function bindEvaluationCards(container) {
    Array.prototype.slice.call(container.querySelectorAll('[data-open-evaluation]')).forEach(function (button) {
      button.addEventListener('click', function () { openEvaluation(button.getAttribute('data-open-evaluation')); });
    });
    Array.prototype.slice.call(container.querySelectorAll('[data-generate-pdf]')).forEach(function (button) {
      button.addEventListener('click', function () { generatePdfFromCard(button.getAttribute('data-generate-pdf'), button); });
    });
    Array.prototype.slice.call(container.querySelectorAll('[data-publish-pdf]')).forEach(function (button) {
      button.addEventListener('click', function () { publishPdfFromCard(button.getAttribute('data-publish-pdf'), button); });
    });
    Array.prototype.slice.call(container.querySelectorAll('[data-prepare-pdf-view]')).forEach(function (button) {
      button.addEventListener('click', function () { prepareAndViewPdfFromCard(button.getAttribute('data-prepare-pdf-view'), button); });
    });
  }

  async function generatePdfFromCard(evaluationNo, button) {
    if (!evaluationNo || !button || button.disabled) return;
    if (!window.confirm('確定要為「' + evaluationNo + '」產生單頁 A4 正式 PDF 嗎？\n\n系統會使用本張表目前有效的簽名快照；重新產生不會刪除舊PDF。')) return;
    var originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'PDF產生中…';
    showGlobalNotice('processing', '正在產生PDF', '請保持此頁開啟。系統正在套用鬍鬚張單頁A4範本、簽名快照與欄位資料。', false);
    try {
      var result = await window.V3WorkflowService.generatePdf(evaluationNo, window.V3ApiClient.createRequestId());
      var data = result.data || {};
      closeGlobalNotice();
      showGlobalNotice('success', 'PDF產生完成', (data.fileName || evaluationNo + '.pdf') + (data.warning ? '\n' + data.warning : ''));
      await refreshAllAccessibleLists();
    } catch (error) {
      closeGlobalNotice();
      if (error && (error.code === 'REQUEST_TIMEOUT' || error.code === 'NETWORK_ERROR')) {
        showGlobalNotice('warning', '正在確認PDF結果', '連線中斷，但後端可能仍在產生PDF。請勿重複點擊；系統會重新整理PDF狀態。');
        await waitMilliseconds(3000);
      } else {
        showGlobalNotice('error', 'PDF產生失敗', friendlyError(error));
      }
      await refreshAllAccessibleLists();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function publishPdfFromCard(evaluationNo, button) {
    if (!evaluationNo || !button || button.disabled) return;
    var originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = '設定中…';
    try {
      await window.V3WorkflowService.publishPdf(evaluationNo, window.V3ApiClient.createRequestId());
      showGlobalNotice('success', 'PDF查看設定完成', '現在可使用「查看月考核表PDF」，無痕視窗也能開啟。');
      await refreshAllAccessibleLists();
    } catch (error) {
      showGlobalNotice('error', 'PDF查看設定失敗', friendlyError(error));
      await refreshAllAccessibleLists();
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function prepareAndViewPdfFromCard(evaluationNo, button) {
    var safeNo = String(evaluationNo || '').trim();
    if (!safeNo || !button || button.disabled) return;
    var originalLabel = button.textContent;
    var correlationId = 'pdf-view-' + window.V3ApiClient.createRequestId();
    var startedAt = performanceNowV3();
    var prepareRequestMs = 0;
    var pdfRequestMs = 0;
    var responseBytes = 0;
    var renderMetrics = null;
    var viewerVisibleTotalMs = 0;
    var postViewRefreshMs = 0;
    var operationResult = '成功';
    var operationErrorCode = '';

    button.disabled = true;
    button.textContent = '開啟中…';
    openPdfViewerModal('正在取得月考核表PDF…', safeNo);
    try {
      var prepared = await window.V3WorkflowService.preparePdfView(safeNo, correlationId + '-prepare');
      prepareRequestMs = Number(prepared.clientPerformance && prepared.clientPerformance.requestMs || 0);
      responseBytes += Number(prepared.clientPerformance && prepared.clientPerformance.responseBytes || 0);
      var token = String(prepared.data && prepared.data.publicToken || '').trim();
      if (!token) throw new Error('後端未回傳PDF查看碼。');

      var result = await window.V3ApiClient.request('publicPdfView', { token: token }, '', correlationId + '-pdf');
      pdfRequestMs = Number(result.clientPerformance && result.clientPerformance.requestMs || 0);
      responseBytes += Number(result.clientPerformance && result.clientPerformance.responseBytes || 0);
      var data = result.data || {};
      if (!data.pdfBase64) throw new Error('後端未回傳可顯示的PDF內容。');
      renderMetrics = await renderPdfBase64InViewer(data.pdfBase64, data.fileName || safeNo + '.pdf');
      viewerVisibleTotalMs = Math.max(0, Math.round(performanceNowV3() - startedAt));
      var refreshStartedAt = performanceNowV3();
      await refreshAllAccessibleLists();
      postViewRefreshMs = Math.max(0, Math.round(performanceNowV3() - refreshStartedAt));
    } catch (error) {
      operationResult = '失敗';
      operationErrorCode = String(error && error.code || error && error.name || 'PDF_VIEW_FAILED');
      if (error && error.clientPerformance) {
        if (!prepareRequestMs) prepareRequestMs = Number(error.clientPerformance.requestMs || 0);
        else if (!pdfRequestMs) pdfRequestMs = Number(error.clientPerformance.requestMs || 0);
        responseBytes += Number(error.clientPerformance.responseBytes || 0);
      }
      showPdfViewerError(friendlyError(error));
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
      queuePdfViewPerformanceMetricV3({
        correlationId: correlationId,
        result: operationResult,
        errorCode: operationErrorCode,
        deviceType: detectDeviceTypeV3(),
        cacheHit: false,
        prepareRequestMs: prepareRequestMs,
        pdfRequestMs: pdfRequestMs,
        networkMs: prepareRequestMs + pdfRequestMs,
        pdfJsLoadMs: renderMetrics && renderMetrics.pdfJsLoadMs || 0,
        base64DecodeMs: renderMetrics && renderMetrics.base64DecodeMs || 0,
        pdfParseMs: renderMetrics && renderMetrics.pdfParseMs || 0,
        canvasRenderMs: renderMetrics && renderMetrics.canvasRenderMs || 0,
        frontendTotalMs: viewerVisibleTotalMs || Math.max(0, Math.round(performanceNowV3() - startedAt)),
        postViewRefreshMs: postViewRefreshMs,
        responseBytes: responseBytes,
        pdfSizeBytes: renderMetrics && renderMetrics.pdfSizeBytes || 0
      });
    }
  }

  function buildPublicPdfViewUrl(token) {
    return window.location.origin + window.location.pathname + '?pdf=' + encodeURIComponent(String(token || ''));
  }

  function performanceNowV3() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  function detectDeviceTypeV3() {
    var width = Math.max(window.innerWidth || 0, document.documentElement && document.documentElement.clientWidth || 0);
    var touch = ('ontouchstart' in window) || Number(navigator.maxTouchPoints || 0) > 0;
    if (touch && width <= 767) return 'mobile';
    if (touch && width <= 1180) return 'tablet';
    return 'desktop';
  }

  function queuePdfViewPerformanceMetricV3(metric) {
    if (!state.session || !window.V3WorkflowService || typeof window.V3WorkflowService.recordClientPerformance !== 'function') return;
    var payload = Object.assign({ operation: 'PDF_VIEW_LOGGED_IN' }, metric || {});
    window.setTimeout(function () {
      window.V3WorkflowService.recordClientPerformance(payload, String(payload.correlationId || '') + '-metric')
        .catch(function (error) {
          console.warn('PDF前端效能紀錄送出失敗：', error && error.code || error && error.message || error);
        });
    }, 0);
  }

  function ensurePdfViewerModal() {
    if (document.getElementById('pdfViewerOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'pdfViewerOverlay';
    overlay.className = 'pdf-modal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<section class="pdf-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="pdfViewerTitle">' +
      '<header class="pdf-modal-header"><div><span>月考核表</span><strong id="pdfViewerTitle">PDF檢視</strong></div>' +
      '<button type="button" id="pdfViewerClose" class="pdf-modal-close" aria-label="關閉PDF檢視">×</button></header>' +
      '<div id="pdfViewerStatus" class="pdf-modal-status">正在載入PDF…</div>' +
      '<div id="pdfViewerPages" class="pdf-modal-pages" aria-live="polite"></div>' +
      '<footer class="pdf-modal-footer">僅供線上檢視；系統不提供下載、列印或另存功能。</footer>' +
      '</section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    overlay.addEventListener('dragstart', function (event) { event.preventDefault(); });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePdfViewerModal();
    });
    document.getElementById('pdfViewerClose').addEventListener('click', closePdfViewerModal);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.pdfViewerOpen) closePdfViewerModal();
    });
  }

  function openPdfViewerModal(statusText, titleText) {
    ensurePdfViewerModal();
    var overlay = document.getElementById('pdfViewerOverlay');
    var status = document.getElementById('pdfViewerStatus');
    var pages = document.getElementById('pdfViewerPages');
    var title = document.getElementById('pdfViewerTitle');
    state.pdfViewerRenderId += 1;
    state.pdfViewerOpen = true;
    title.textContent = String(titleText || 'PDF檢視');
    status.className = 'pdf-modal-status';
    status.textContent = String(statusText || '正在載入PDF…');
    status.hidden = false;
    pages.innerHTML = '';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    document.getElementById('pdfViewerClose').focus();
  }

  function closePdfViewerModal() {
    var overlay = document.getElementById('pdfViewerOverlay');
    if (!overlay) return;
    state.pdfViewerRenderId += 1;
    state.pdfViewerOpen = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.getElementById('pdfViewerPages').innerHTML = '';
    if (elements.evaluationOverlay && !elements.evaluationOverlay.hidden) return;
    document.body.classList.remove('is-locked');
    if (state.deferredAutoRefresh) {
      state.deferredAutoRefresh = false;
      window.setTimeout(function () { refreshAllAccessibleLists(); }, 0);
    }
  }

  function showPdfViewerError(message) {
    ensurePdfViewerModal();
    var status = document.getElementById('pdfViewerStatus');
    status.className = 'pdf-modal-status pdf-modal-status--error';
    status.textContent = String(message || 'PDF無法開啟。');
    status.hidden = false;
  }

  function loadPdfJsModule() {
    if (!state.pdfJsModulePromise) {
      state.pdfJsModulePromise = import('./pdf.min.mjs').then(function (pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
        return pdfjsLib;
      });
    }
    return state.pdfJsModulePromise;
  }

  function decodeBase64Pdf(base64Text) {
    var binary = window.atob(String(base64Text || ''));
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function renderPdfBase64InViewer(base64Text, fileName) {
    ensurePdfViewerModal();
    var renderId = state.pdfViewerRenderId;
    var title = document.getElementById('pdfViewerTitle');
    var status = document.getElementById('pdfViewerStatus');
    var pages = document.getElementById('pdfViewerPages');
    title.textContent = String(fileName || '月考核表PDF');
    status.className = 'pdf-modal-status';
    status.textContent = '正在渲染PDF…';
    status.hidden = false;
    pages.innerHTML = '';

    var pdfJsStartedAt = performanceNowV3();
    var pdfjsLib = await loadPdfJsModule();
    var pdfJsLoadMs = Math.max(0, Math.round(performanceNowV3() - pdfJsStartedAt));

    var decodeStartedAt = performanceNowV3();
    var pdfBytes = decodeBase64Pdf(base64Text);
    var base64DecodeMs = Math.max(0, Math.round(performanceNowV3() - decodeStartedAt));

    var parseStartedAt = performanceNowV3();
    var loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    var pdf = await loadingTask.promise;
    var pdfParseMs = Math.max(0, Math.round(performanceNowV3() - parseStartedAt));

    var canvasStartedAt = performanceNowV3();
    for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      if (renderId !== state.pdfViewerRenderId || !state.pdfViewerOpen) {
        return {
          pdfJsLoadMs: pdfJsLoadMs,
          base64DecodeMs: base64DecodeMs,
          pdfParseMs: pdfParseMs,
          canvasRenderMs: Math.max(0, Math.round(performanceNowV3() - canvasStartedAt)),
          pdfSizeBytes: pdfBytes.length,
          cancelled: true
        };
      }
      var page = await pdf.getPage(pageNumber);
      var baseViewport = page.getViewport({ scale: 1 });
      var availableWidth = Math.max(280, Math.min(pages.clientWidth - 24, 1180));
      var cssScale = Math.max(0.5, Math.min(2.2, availableWidth / baseViewport.width));
      var viewport = page.getViewport({ scale: cssScale });
      var pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      var canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = Math.floor(viewport.width) + 'px';
      canvas.style.height = Math.floor(viewport.height) + 'px';
      canvas.setAttribute('aria-label', 'PDF第' + pageNumber + '頁');
      canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
      pages.appendChild(canvas);
      var context = canvas.getContext('2d', { alpha: false });
      await page.render({
        canvasContext: context,
        viewport: viewport,
        transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0]
      }).promise;
    }
    var canvasRenderMs = Math.max(0, Math.round(performanceNowV3() - canvasStartedAt));
    status.hidden = true;
    return {
      pdfJsLoadMs: pdfJsLoadMs,
      base64DecodeMs: base64DecodeMs,
      pdfParseMs: pdfParseMs,
      canvasRenderMs: canvasRenderMs,
      pdfSizeBytes: pdfBytes.length,
      pageCount: pdf.numPages,
      cancelled: false
    };
  }

  async function openEvaluation(evaluationNo) {
    if (isPendingMutationLocked(evaluationNo)) {
      showGlobalNotice('processing', '正在確認送出結果', '這張考核表剛完成送出，系統正在同步最新流程，暫時不可用舊卡片重新開啟。', false);
      return;
    }
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

  function closeEvaluation(options) {
    var settings = options || {};
    if (settings.saveDraft !== false && !state.isSubmitting) saveLocalDraft();
    clearDraftTimers();
    elements.evaluationOverlay.hidden = true;
    document.body.classList.remove('is-locked');
    elements.evaluationContent.hidden = true;
    state.currentDetail = null;
    state.currentAction = '';
    state.signatureController = null;
    state.draftLoaded = false;
    state.isSubmitting = false;
    elements.closeEvaluationButton.disabled = false;
    setButtonLoading(elements.submitEvaluationButton, false, '送出');

    if (state.deferredAutoRefresh) {
      state.deferredAutoRefresh = false;
      window.setTimeout(function () { refreshAllAccessibleLists(); }, 0);
    }
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
      metaItem('考核月份', formatRocDateDisplay(record['考核月份'])) +
      metaItem('受評人員', joinText(record['受評人員工號'], record['受評人員姓名'])) +
      metaItem('轉任日', formatRocDateDisplay(record['受評人員轉任日'])) +
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
        ['回報錯誤次數', record['每週回報錯誤次數']], ['未回報次數', record['每週未回報次數']],
        ['每週進度回報得分', record['每週進度回報得分']],
        ['培訓出勤異常次數', record['培訓出勤異常次數']], ['作業遲繳天數', record['作業遲繳天數']],
        ['培訓課程狀況得分', record['培訓課程狀況得分']],
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
      ]],
      ['PDF處理', [
        ['PDF狀態', record['PDF狀態']], ['PDF檔名', record['PDF檔名']],
        ['PDF產生時間', formatDateTimeDisplay(record['PDF產生時間'])],
        ['PDF重試次數', isEducationPdfManagerUi() ? record['PDF重試次數'] : ''],
        ['PDF最後錯誤', isEducationPdfManagerUi() ? record['PDF最後錯誤'] : '']
      ]]
    ];

    var scoreHtml = currentScoreCardHtml(record);
    var html = scoreHtml + sections.map(function (section) {
      var visible = section[1].filter(function (pair) { return String(pair[1] === null || pair[1] === undefined ? '' : pair[1]).trim() !== ''; });
      if (!visible.length) return '';
      return '<article class="detail-section"><h3>' + escapeHtml(section[0]) + '</h3><div class="detail-grid">' +
        visible.map(function (pair) { return '<div class="detail-item"><span>' + escapeHtml(pair[0]) + '</span><strong>' + escapeHtml(pair[1]) + '</strong></div>'; }).join('') +
      '</div></article>';
    }).join('');

    html += signatureSummaryHtml(record.signatureSummary || {});
    return html || '<article class="detail-section"><p>目前尚無已填寫內容。</p></article>';
  }

  function currentScoreCardHtml(record) {
    var score = Number(record['已評得分']);
    var max = Number(record['已評滿分']);
    if (!isFinite(score) || !isFinite(max) || max <= 0) return '';
    var percent = Math.max(0, Math.min(100, Math.round(score / max * 100)));
    return '<article class="detail-section current-score-card ' + scoreToneClass(percent) + '">' +
      '<div><span>目前累計得分</span><strong>' + escapeHtml(score + '／' + max) + '</strong></div>' +
      '<div><span>目前比例</span><strong>' + percent + '%</strong></div>' +
      (max < 100 ? '<p>目前仍有後續評核或簽核階段尚未完成。</p>' : '') +
      '</article>';
  }

  function scoreToneClass(percent) {
    if (percent >= 90) return 'score-tone--green';
    if (percent >= 80) return 'score-tone--blue';
    if (percent >= 70) return 'score-tone--orange';
    return 'score-tone--red';
  }

  function signatureSummaryHtml(summary) {
    var roles = ['門市店主管', '教育中心成員', '教育中心主管', '區主管', '受評人員', '營業處主管', '總經理'];
    var rows = [];
    roles.forEach(function (role) {
      var item = summary[role];
      if (!item) return;
      rows.push('<div class="signature-status-row"><span>' + escapeHtml(role) + '</span><strong>' +
        escapeHtml(item.signerName || '—') + '｜' + escapeHtml(item.status || '未簽核') + (item.signedAt ? '｜' + escapeHtml(formatDateTimeDisplay(item.signedAt)) : '') +
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
    var actions = allowed.filter(function (action) {
      if (action === 'force_transition') {
        return isEducationPdfManagerUi() && String(record['流程狀態'] || '').trim() !== '作廢';
      }
      return NORMAL_ACTIONS.indexOf(action) !== -1 && ['reassign', 'void', 'create_revision'].indexOf(action) === -1;
    });
    if (!actions.length) {
      elements.actionPanel.hidden = true;
      return;
    }
    elements.actionPanel.hidden = false;
    elements.actionSelector.innerHTML = actions.map(function (action) {
      var label = window.V3EvaluationForm.getActionLabel(record, action);
      return '<option value="' + escapeHtml(action) + '">' + escapeHtml(label) + '</option>';
    }).join('');
    renderSelectedAction(actions[0]);
  }

  async function renderSelectedAction(action) {
    clearDraftTimers();
    state.currentAction = action;
    state.signatureController = null;
    state.draftLoaded = false;
    elements.evaluationActionForm.innerHTML = window.V3EvaluationForm.renderActionForm(state.currentDetail || {}, action);
    window.V3EvaluationForm.initializeInteractiveControls(elements.evaluationActionForm);
    elements.submitEvaluationButton.querySelector('.button-label').textContent = window.V3EvaluationForm.getActionLabel(state.currentDetail || {}, action) || '送出';
    initializeSignatureIfNeeded();
    await loadDraftForCurrentAction();
    window.V3EvaluationForm.refreshInteractiveControls(elements.evaluationActionForm);
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
      savedStatus: section.querySelector('[data-saved-status]'),
      savePersonalCheckbox: section.querySelector('[data-save-personal]')
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
    var version = Number(state.currentDetail.dataVersion || 0);
    var status = String(state.currentDetail['流程狀態'] || '');
    var local = readLocalDraft(evaluationNo, state.currentAction, version, status);
    var server = null;
    try {
      var result = await window.V3WorkflowService.getDraft(evaluationNo, state.currentAction, version);
      if (result.data && result.data.found) server = result.data.content;
    } catch (ignore) {}
    var draft = server || local;
    var validDraft = draft && String(draft.action || '') === state.currentAction &&
      Number(draft.dataVersion) === version && String(draft.workflowStatus || '') === status;
    if (validDraft) {
      window.V3EvaluationForm.applyDraft(elements.evaluationActionForm, draft);
      elements.draftStatus.textContent = '已載入目前流程版本的草稿';
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
    if (!state.currentDetail || !state.currentAction || !elements.evaluationActionForm || state.isSubmitting) return;
    try {
      var version = Number(state.currentDetail.dataVersion || 0);
      var content = window.V3EvaluationForm.formToDraft(elements.evaluationActionForm, state.currentAction);
      content.dataVersion = version;
      content.workflowStatus = String(state.currentDetail['流程狀態'] || '');
      window.localStorage.setItem(localDraftKey(state.currentDetail['考核單號'], state.currentAction, version, content.workflowStatus), JSON.stringify(content));
      elements.draftStatus.textContent = '已保存至本機瀏覽器';
    } catch (ignore) {}
  }

  async function saveCurrentDraft(showMessage) {
    if (!state.currentDetail || !state.currentAction) return;
    saveLocalDraft();
    elements.saveDraftButton.disabled = true;
    try {
      var version = Number(state.currentDetail.dataVersion || 0);
      var content = window.V3EvaluationForm.formToDraft(elements.evaluationActionForm, state.currentAction);
      content.dataVersion = version;
      content.workflowStatus = String(state.currentDetail['流程狀態'] || '');
      var result = await window.V3WorkflowService.saveDraft(
        state.currentDetail['考核單號'],
        content,
        version,
        content.workflowStatus,
        state.currentAction
      );
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
    if (!state.currentDetail || !state.currentAction || state.isSubmitting) return;
    clearEvaluationMessage();
    var form = elements.evaluationActionForm;
    if (!form.reportValidity()) return;
    var payload;
    try {
      payload = window.V3EvaluationForm.collectActionPayload(form, state.currentAction, state.signatureController);
    } catch (error) {
      showGlobalNotice('error', '資料尚未完成', error.message || '請確認填寫內容。');
      return;
    }

    var evaluationNo = state.currentDetail['考核單號'];
    var action = state.currentAction;
    var version = Number(state.currentDetail.dataVersion || 0);
    var workflowStatus = String(state.currentDetail['流程狀態'] || '');
    payload.evaluationNo = evaluationNo;
    payload.expectedVersion = version;
    var label = window.V3EvaluationForm.getActionLabel(state.currentDetail || {}, action) || '送出';
    if (!window.confirm('確定要「' + label + '」嗎？\n\n送出後將進入下一個流程階段。')) return;

    var requestId = window.V3ApiClient.createRequestId();
    lockPendingMutation(evaluationNo, 120000);
    state.isSubmitting = true;
    elements.closeEvaluationButton.disabled = true;
    setButtonLoading(elements.submitEvaluationButton, true, '處理中，請勿重複點擊');
    try {
      if (action === 'force_transition') {
        await window.V3WorkflowService.forceTransition(payload, requestId);
      } else {
        await window.V3WorkflowService.submitAction(payload, requestId);
      }
      await finishSuccessfulSubmission(evaluationNo, action, version, workflowStatus, label);
    } catch (error) {
      if (error && (error.code === 'REQUEST_TIMEOUT' || error.code === 'NETWORK_ERROR')) {
        showGlobalNotice('processing', '正在確認送出結果', '連線暫時中斷，但後端可能仍在完成送出。系統正在自動確認，請不要重複點擊。', false);
        var recovery = await recoverMutationResult(evaluationNo, requestId, version);
        if (recovery.processed) {
          closeGlobalNotice();
          await finishSuccessfulSubmission(evaluationNo, action, version, workflowStatus, label);
          return;
        }
        if (recovery.changed) {
          closeEvaluation({ saveDraft: false });
          await refreshAllAccessibleLists();
          showGlobalNotice('warning', '表單已更新', '此考核表在送出期間已發生更新。請重新開啟表單確認最新狀態，不要再次使用舊畫面送出。');
          resetSubmissionUi(label);
          return;
        }
        closeEvaluation({ saveDraft: false });
        await refreshAllAccessibleLists();
        showGlobalNotice('warning', '送出結果仍在同步', '系統已暫時鎖定這張考核表，避免使用舊卡片重複送出。請等待約10秒後重新整理；若流程已送出，案件會出現在下一位承辦人的待辦。');
        window.setTimeout(function () { refreshAllAccessibleLists(); }, 10000);
      } else if (error && (error.code === 'VERSION_CONFLICT' || error.code === 'DUPLICATE_REQUEST')) {
        releasePendingMutation(evaluationNo);
        await refreshAllAccessibleLists();
        showGlobalNotice('warning', '表單已更新', friendlyError(error));
      } else {
        releasePendingMutation(evaluationNo);
        await refreshAllAccessibleLists();
        showGlobalNotice('error', '送出失敗', friendlyError(error));
      }
      resetSubmissionUi(label);
    }
  }

  async function finishSuccessfulSubmission(evaluationNo, action, version, workflowStatus, label) {
    removeLocalDraft(evaluationNo, action, version, workflowStatus);
    clearDraftTimers();
    closeEvaluation({ saveDraft: false });
    await refreshAllAccessibleLists();
    window.setTimeout(function () {
      releasePendingMutation(evaluationNo);
      refreshAllAccessibleLists();
    }, 10000);
    setDashboardMessage('success', label + '完成，流程已更新。');
    resetSubmissionUi(label);
  }

  function resetSubmissionUi(label) {
    state.isSubmitting = false;
    elements.closeEvaluationButton.disabled = false;
    setButtonLoading(elements.submitEvaluationButton, false, label || '送出');
  }

  async function recoverMutationResult(evaluationNo, requestId, expectedVersion) {
    var last = { processed: false, changed: false };
    for (var attempt = 0; attempt < 25; attempt += 1) {
      await waitMilliseconds(attempt === 0 ? 1000 : 2000);
      try {
        var result = await window.V3WorkflowService.getMutationStatus(evaluationNo, requestId, expectedVersion);
        last = result.data || last;
        if (last.processed || last.changed) return last;
      } catch (ignore) {}
    }
    return last;
  }

  function waitMilliseconds(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  function lockPendingMutation(evaluationNo, durationMs) {
    var key = String(evaluationNo || '').trim();
    if (!key) return;
    state.pendingMutationLocks[key] = Date.now() + Number(durationMs || 120000);
    state.pending = state.pending.filter(function (item) { return item.evaluationNo !== key; });
    renderPending();
  }

  function releasePendingMutation(evaluationNo) {
    delete state.pendingMutationLocks[String(evaluationNo || '').trim()];
  }

  function isPendingMutationLocked(evaluationNo) {
    var key = String(evaluationNo || '').trim();
    var expiresAt = Number(state.pendingMutationLocks[key] || 0);
    if (!expiresAt) return false;
    if (Date.now() >= expiresAt) {
      delete state.pendingMutationLocks[key];
      return false;
    }
    return true;
  }

  function refreshVisibleListsAfterMutation() {
    refreshAllAccessibleLists();
  }

  async function refreshAllAccessibleLists() {
    var jobs = [loadPending({ quiet: true }), loadProgress({ quiet: true })];
    if (!elements.historyPanel.hidden || state.history.length) jobs.push(loadHistory({ quiet: true }));
    await Promise.allSettled(jobs);
  }

  function handleAutomaticRefresh() {
    if (!state.session || elements.dashboardView.hidden || state.isSubmitting) return;

    // 手機切換應用程式、鍵盤收合或瀏覽器重新取得焦點時，
    // 不可在使用者正在閱讀考核表時重繪背景清單，避免明細視窗跳動或消失。
    if (!elements.evaluationOverlay.hidden || state.currentDetail || state.pdfViewerOpen) {
      state.deferredAutoRefresh = true;
      return;
    }

    var now = Date.now();
    if (now - state.lastAutoRefreshAt < 5000) return;
    state.lastAutoRefreshAt = now;
    refreshAllAccessibleLists();
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
      closeEvaluation({ saveDraft: false });
      setDashboardMessage('success', '案件已釋放回教育中心共同待辦。');
      refreshVisibleListsAfterMutation();
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

  async function loadTestDispatchCandidates() {
    clearTestDispatchMessage();
    elements.refreshTestCandidatesButton.disabled = true;
    elements.testDispatchEmployee.disabled = true;
    var previousValue = String(elements.testDispatchEmployee.value || '');
    elements.testDispatchEmployee.innerHTML = '<option value="">正在載入受評人員…</option>';
    try {
      var result = await window.V3WorkflowService.listTestDispatchCandidates('');
      var data = result.data || {};
      state.testDispatchCandidates = Array.isArray(data.items) ? data.items : [];
      var options = ['<option value="">請選擇受評人員</option>'];
      state.testDispatchCandidates.forEach(function (item) {
        var label = [item.employeeId, item.employeeName, joinStore(item.storeCode, item.storeName)].filter(Boolean).join('｜');
        if (String(item.needsEvaluation || '') !== '是') label += '｜J欄：' + valueOrDash(item.needsEvaluation);
        options.push('<option value="' + escapeHtml(item.employeeId) + '">' + escapeHtml(label) + '</option>');
      });
      elements.testDispatchEmployee.innerHTML = options.join('');
      if (previousValue && state.testDispatchCandidates.some(function (item) { return item.employeeId === previousValue; })) {
        elements.testDispatchEmployee.value = previousValue;
      }
      elements.testDispatchEmployeeHint.textContent = state.testDispatchCandidates.length
        ? '已載入 ' + state.testDispatchCandidates.length + ' 位在職受評人員。教育中心手動補建不受 J 欄限制；每月自動派發仍以 J 欄設定為準。'
        : '員工主檔目前沒有可選擇的在職受評人員。';
    } catch (error) {
      elements.testDispatchEmployee.innerHTML = '<option value="">載入失敗</option>';
      showTestDispatchMessage('error', friendlyError(error));
    } finally {
      elements.refreshTestCandidatesButton.disabled = false;
      elements.testDispatchEmployee.disabled = false;
    }
  }

  function handleTestDispatchInputChange() {
    state.testDispatchPreview = null;
    elements.testDispatchPreview.hidden = true;
    elements.testDispatchConfirm.checked = false;
    elements.createTestDispatchButton.disabled = true;
    clearTestDispatchMessage();
  }

  async function previewTestDispatch(event) {
    event.preventDefault();
    clearTestDispatchMessage();
    var employeeId = String(elements.testDispatchEmployee.value || '').trim();
    var evaluationMonth = String(elements.testDispatchMonth.value || '').trim();
    var reason = String(elements.testDispatchReason.value || '').trim();

    if (!employeeId) return showTestDispatchMessage('error', '請選擇受評人員。');
    if (!/^\d{3}\/\d{2}\/01$/.test(evaluationMonth)) return showTestDispatchMessage('error', '考核月份請輸入完整民國日期，例如 115/08/01。');
    if (isFutureRocMonth(evaluationMonth)) return showGlobalNotice('warning', '不可建立未來月份', '手動建立只能選擇本月或過去月份。未來月份請等待該月1日自動派發。');
    if (!reason) return showTestDispatchMessage('error', '請填寫建立原因。');

    setButtonLoading(elements.previewTestDispatchButton, true, '預覽中');
    elements.testDispatchPreview.hidden = true;
    elements.testDispatchConfirm.checked = false;
    try {
      var result = await window.V3WorkflowService.previewTestEvaluation(employeeId, evaluationMonth);
      state.testDispatchPreview = result.data || null;
      renderTestDispatchPreview(state.testDispatchPreview);
      elements.testDispatchPreview.hidden = false;
      if (state.testDispatchPreview && state.testDispatchPreview.canCreate) {
        showTestDispatchMessage('success', '預覽完成，請核對完整路線後勾選確認。');
      } else {
        showTestDispatchMessage('error', '預覽發現阻擋問題，請依下方訊息修正。');
      }
    } catch (error) {
      state.testDispatchPreview = null;
      showTestDispatchMessage('error', friendlyError(error));
    } finally {
      setButtonLoading(elements.previewTestDispatchButton, false, '預覽上呈路線');
      updateTestDispatchCreateState();
    }
  }

  function renderTestDispatchPreview(preview) {
    var data = preview || {};
    var employee = data.employee || {};
    var organization = data.organization || {};
    var route = data.route || {};
    var errors = Array.isArray(data.errors) ? data.errors : [];
    var warnings = Array.isArray(data.warnings) ? data.warnings : [];

    var html = '<h4>建立預覽</h4><div class="test-dispatch-preview-grid">' +
      metaItem('預計考核單號', data.plannedEvaluationNo) +
      metaItem('考核月份', data.evaluationMonth) +
      metaItem('修訂版本', data.revision) +
      metaItem('受評人員', joinText(employee.employeeId, employee.employeeName)) +
      metaItem('轉任日', employee.transferDate) +
      metaItem('J欄是否考核', employee.needsEvaluation) +
      metaItem('店別', joinStore(organization.storeCode, organization.storeName)) +
      metaItem('區域', organization.area) +
      metaItem('營業處', organization.department) +
    '</div>';

    if (errors.length) {
      html += '<ul class="preview-alert-list preview-alert-list--error">' + errors.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }
    if (warnings.length) {
      html += '<ul class="preview-alert-list preview-alert-list--warning">' + warnings.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }

    html += '<h4>預計上呈路線</h4><div class="route-list">' +
      routeRowHtml('門市店主管', route.manager) +
      routeRowHtml('教育中心成員', route.educationMember) +
      routeRowHtml('教育中心主管', route.educationSupervisor) +
      routeRowHtml('區主管', route.areaSupervisor) +
      routeRowHtml('受評人員確認', route.employee) +
      routeRowHtml('營業處主管', route.departmentExecutive) +
      routeRowHtml('總經理', route.generalManager) +
    '</div>';

    elements.testDispatchPreviewContent.innerHTML = html;
  }

  function routeRowHtml(label, person) {
    var item = person || {};
    return '<div class="route-row"><span>' + escapeHtml(label) + '</span><strong>' +
      escapeHtml(joinText(item.employeeId, item.employeeName) || '尚未判定') + '</strong><small>' +
      escapeHtml(item.source || item.role || '') + '</small></div>';
  }

  function updateTestDispatchCreateState() {
    var canCreate = Boolean(state.testDispatchPreview && state.testDispatchPreview.canCreate);
    var confirmed = Boolean(elements.testDispatchConfirm.checked);
    var hasReason = Boolean(String(elements.testDispatchReason.value || '').trim());
    elements.createTestDispatchButton.disabled = !(canCreate && confirmed && hasReason);
  }

  async function createTestDispatch() {
    if (!state.testDispatchPreview || !state.testDispatchPreview.canCreate) {
      return showTestDispatchMessage('error', '請先完成可建立的預覽。');
    }
    if (!elements.testDispatchConfirm.checked) {
      return showTestDispatchMessage('error', '請先勾選確認。');
    }

    var employeeId = String(elements.testDispatchEmployee.value || '').trim();
    var evaluationMonth = String(elements.testDispatchMonth.value || '').trim();
    var reason = String(elements.testDispatchReason.value || '').trim();
    if (isFutureRocMonth(evaluationMonth)) return showGlobalNotice('warning', '不可建立未來月份', '手動建立只能選擇本月或過去月份。未來月份請等待該月1日自動派發。');
    var employee = state.testDispatchPreview.employee || {};
    var confirmText = '確定建立以下月考核表嗎？\n\n' +
      '受評人員：' + joinText(employee.employeeId, employee.employeeName) + '\n' +
      '考核月份：' + evaluationMonth + '\n' +
      '版本：R0\n\n建立後不會自動刪除；若測試不使用，請依正式流程作廢。';
    if (!window.confirm(confirmText)) return;

    setButtonLoading(elements.createTestDispatchButton, true, '建立中');
    try {
      var requestId = createClientRequestId('test-dispatch');
      var result = await window.V3WorkflowService.createTestEvaluation({
        employeeId: employeeId,
        evaluationMonth: evaluationMonth,
        reason: reason,
        secondConfirmed: true
      }, requestId);
      var data = result.data || {};
      showTestDispatchMessage('success', '建立成功：' + valueOrDash(data.evaluationNo) + '，目前已進入' + valueOrDash(data.status) + '。');
      state.testDispatchPreview = null;
      elements.testDispatchPreview.hidden = true;
      elements.testDispatchConfirm.checked = false;
      elements.testDispatchReason.value = '';
      await loadProgress();
    } catch (error) {
      showTestDispatchMessage('error', friendlyError(error));
    } finally {
      setButtonLoading(elements.createTestDispatchButton, false, '手動建立月考核表');
      updateTestDispatchCreateState();
    }
  }

  function isFutureRocMonth(value) {
    var match = /^(\d{3})\/(\d{2})\/01$/.exec(String(value || '').trim());
    if (!match) return false;
    var target = new Date(Number(match[1]) + 1911, Number(match[2]) - 1, 1);
    var now = new Date();
    var current = new Date(now.getFullYear(), now.getMonth(), 1);
    return target.getTime() > current.getTime();
  }

  function currentRocMonthFirstDay() {
    var now = new Date();
    var rocYear = now.getFullYear() - 1911;
    return padNumber(rocYear, 3) + '/' + padNumber(now.getMonth() + 1, 2) + '/01';
  }

  function padNumber(value, length) {
    var text = String(value);
    while (text.length < length) text = '0' + text;
    return text;
  }

  function createClientRequestId(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return prefix + '-' + window.crypto.randomUUID();
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function showTestDispatchMessage(type, text) { showMessage(elements.testDispatchMessage, type, text); }
  function clearTestDispatchMessage() { clearMessage(elements.testDispatchMessage); }

  async function handleLogout() {
    elements.logoutButton.disabled = true;
    try {
      await window.V3AuthService.logout();
    } catch (error) {
      window.V3AuthService.clearSession();
    } finally {
      elements.logoutButton.disabled = false;
      closeEvaluation({ saveDraft: false });
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

  function getPublicPdfToken() {
    try { return String(new URLSearchParams(window.location.search).get('pdf') || '').trim(); }
    catch (error) { return ''; }
  }

  async function initializePublicPdfView(token) {
    document.documentElement.classList.add('public-pdf-page');
    document.body.innerHTML = '<main class="public-pdf-shell">' +
      '<header class="public-pdf-header"><div><strong>月考核表PDF</strong><span id="publicPdfFileName">正在載入…</span></div></header>' +
      '<section id="publicPdfStatus" class="public-pdf-status">正在取得PDF檢視資料…</section>' +
      '<section id="publicPdfPages" class="public-pdf-pages" aria-live="polite"></section>' +
      '<footer class="public-pdf-footer">僅供線上檢視；系統不提供下載、列印或另存功能。</footer>' +
      '</main>';
    document.body.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    document.body.addEventListener('dragstart', function (event) { event.preventDefault(); });
    var status = document.getElementById('publicPdfStatus');
    var pages = document.getElementById('publicPdfPages');
    var fileName = document.getElementById('publicPdfFileName');
    try {
      if (!window.V3ApiClient.isConfigured()) throw new Error('尚未設定Apps Script API網址。');
      var result = await window.V3ApiClient.request('publicPdfView', { token: token }, '', window.V3ApiClient.createRequestId());
      var data = result.data || {};
      if (!data.pdfBase64) throw new Error('後端未回傳可顯示的PDF內容。');
      fileName.textContent = data.fileName || '月考核表.pdf';
      var pdfjsLib = await loadPdfJsModule();
      var pdf = await pdfjsLib.getDocument({ data: decodeBase64Pdf(data.pdfBase64) }).promise;
      for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        var page = await pdf.getPage(pageNumber);
        var baseViewport = page.getViewport({ scale: 1 });
        var availableWidth = Math.max(280, Math.min(window.innerWidth - 24, 1180));
        var cssScale = Math.max(0.5, Math.min(2.2, availableWidth / baseViewport.width));
        var viewport = page.getViewport({ scale: cssScale });
        var pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        var canvas = document.createElement('canvas');
        canvas.className = 'pdf-page-canvas';
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';
        canvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
        pages.appendChild(canvas);
        await page.render({
          canvasContext: canvas.getContext('2d', { alpha: false }),
          viewport: viewport,
          transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0]
        }).promise;
      }
      status.hidden = true;
    } catch (error) {
      status.className = 'public-pdf-status public-pdf-status--error';
      status.textContent = String(error && error.message || 'PDF無法開啟，請向教育中心確認連結。');
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
    switchTab('pending', { skipLoad: true });
  }

  function configureRoleBasedInterface(session) {
    var user = session && session.user ? session.user : {};
    var permissions = session && session.permissions ? session.permissions : {};
    var isEducation = Boolean(permissions.canManage) || user.role === '教育中心成員' || user.role === '教育中心主管';
    elements.systemTabButton.hidden = !isEducation;
    if (!isEducation && !elements.systemPanel.hidden) switchTab('pending');

    var progressScopeMap = {
      '受評人員': '僅顯示您自己的進行中月考核表。',
      '門市店主管': '顯示目前指派給您，或您已實際填寫過但尚未結案的月考核表。',
      '區主管': '顯示目前轄區全部進行中表單，以及仍由您承辦或曾由您簽核的未結案表單。',
      '營業處副總': '顯示目前營業處全部進行中表單，可依區域、月份與狀態篩選。',
      '營業處協理': '顯示目前營業處全部進行中表單，可依區域、月份與狀態篩選。',
      '教育中心成員': '可追蹤全公司進行中表單、異常案件，以及已結案但仍待處理或失敗的PDF。',
      '教育中心主管': '可追蹤全公司進行中表單、異常案件，以及已結案但仍待處理或失敗的PDF。',
      '總經理': '可追蹤全公司全部進行中表單，建議使用營業處、區域與狀態篩選。'
    };
    var historyScopeMap = {
      '受評人員': '僅顯示您自己的結案、例外結案或作廢紀錄。',
      '門市店主管': '顯示您自己的考核紀錄，以及您曾經實際評核過的結案紀錄。',
      '區主管': '顯示目前轄區的歷史資料、您自己的考核紀錄，以及您過去實際簽核過的紀錄。',
      '營業處副總': '顯示目前營業處的歷史資料、您自己的考核紀錄，以及您過去實際簽核過的紀錄。',
      '營業處協理': '顯示目前營業處的歷史資料、您自己的考核紀錄，以及您過去實際簽核過的紀錄。',
      '教育中心成員': '可查詢全公司所有結案、例外結案與作廢紀錄。',
      '教育中心主管': '可查詢全公司所有結案、例外結案與作廢紀錄。',
      '總經理': '可查詢全公司所有結案、例外結案與作廢紀錄。'
    };
    elements.progressScopeText.textContent = progressScopeMap[user.role] || '查看您有權限追蹤的進行中月考核表。';
    elements.historyScopeText.textContent = historyScopeMap[user.role] || '查詢您有權限查看的歷史紀錄。';

    var ownOnly = user.role === '受評人員';
    elements.progressEmployeeFilter.hidden = ownOnly;
    elements.historyEmployeeFilter.hidden = ownOnly;
    if (ownOnly) {
      elements.progressEmployeeId.value = '';
      elements.historyEmployeeId.value = '';
    }
  }

  function showLogin() {
    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;
    clearDashboardMessage();
  }

  function switchTab(tab, options) {
    var settings = options || {};
    state.activeTab = tab || 'pending';
    var map = {
      pending: elements.pendingPanel,
      progress: elements.progressPanel,
      history: elements.historyPanel,
      profile: elements.profilePanel,
      system: elements.systemPanel
    };
    Object.keys(map).forEach(function (name) { map[name].hidden = name !== tab; });
    elements.tabButtons.forEach(function (button) { button.classList.toggle('is-active', button.getAttribute('data-tab') === tab); });
    if (!settings.skipLoad && tab === 'pending') loadPending();
    if (!settings.skipLoad && tab === 'progress') loadProgress();
    if (!settings.skipLoad && tab === 'history') loadHistory();
    if (tab === 'system' && elements.systemTabButton.hidden) {
      switchTab('pending');
      return;
    }
    if (tab === 'system' && !state.testDispatchCandidates.length) loadTestDispatchCandidates();
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

  function localDraftKey(evaluationNo, action, version, workflowStatus) {
    var empId = state.session && state.session.user && state.session.user.employeeId || 'unknown';
    return [
      'V3Draft', empId, String(evaluationNo || ''), String(action || ''),
      String(version || 0), String(workflowStatus || '')
    ].join(':');
  }

  function readLocalDraft(evaluationNo, action, version, workflowStatus) {
    try {
      var raw = window.localStorage.getItem(localDraftKey(evaluationNo, action, version, workflowStatus));
      return raw ? JSON.parse(raw) : null;
    } catch (error) { return null; }
  }

  function removeLocalDraft(evaluationNo, action, version, workflowStatus) {
    try {
      window.localStorage.removeItem(localDraftKey(evaluationNo, action, version, workflowStatus));
    } catch (ignore) {}
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
      ABNORMAL_REPORT_REQUIRED: '教育中心異常回報為必填，請完成確認後輸入內容。',
      MANAGER_COMMENT_REQUIRED: '門市店主管評語為必填。',
      AREA_COMMENT_REQUIRED: '區主管評語為必填。',
      PHASE63_UPGRADE_REQUIRED: '資料表尚未完成第6.3階段升級，請聯絡教育中心。',
      STALE_DRAFT_VERSION: '此草稿屬於舊流程版本，系統不會自動覆蓋目前資料。請重新開啟表單。',
      DUPLICATE_EVALUATION: '同一位受評人員在相同月份已存在 R0。重複建立不會自動變成 R1。',
      FUTURE_EVALUATION_MONTH: '手動建立不可選擇未來月份。',
      DUPLICATE_REQUEST: '這次操作已經完成，請重新整理清單確認最新狀態。',
      PDF_PUBLIC_SHARE_FAILED: 'PDF已產生，但Google Drive公開檢視設定失敗，請由教育中心重試。',
      PDF_DOWNLOAD_DISABLED: '本系統不提供PDF下載，請使用查看月考核表PDF。',
      PDF_VIEW_NOT_FOUND: '此PDF查看連結不存在或尚未公開。'
    };
    return messages[code] || String(error && error.message || '系統處理失敗。');
  }

  function formatRocDateDisplay(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    if (!text) return '';
    text = text.replace(/\s+00:00:00(?:\s+.*)?$/, '');
    var match = /^0*(\d{3})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/.exec(text);
    if (match) return padNumber(Number(match[1]), 3) + '/' + padNumber(Number(match[2]), 2) + '/' + padNumber(Number(match[3]), 2);
    var western = /^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/.exec(text);
    if (western && Number(western[1]) >= 1912) {
      return padNumber(Number(western[1]) - 1911, 3) + '/' + padNumber(Number(western[2]), 2) + '/' + padNumber(Number(western[3]), 2);
    }
    return text;
  }

  function formatDateTimeDisplay(value) {
    var text = String(value === null || value === undefined ? '' : value).trim();
    if (!text) return '';
    var match = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
    if (!match) return text;
    var rocYear = Number(match[1]) - 1911;
    var result = padNumber(rocYear, 3) + '/' + padNumber(Number(match[2]), 2) + '/' + padNumber(Number(match[3]), 2);
    if (!match[4] || (Number(match[4]) === 0 && Number(match[5]) === 0 && Number(match[6] || 0) === 0)) {
      return result + '｜原始資料未記錄時間';
    }
    return result + ' ' + padNumber(Number(match[4]), 2) + ':' + padNumber(Number(match[5]), 2);
  }

  function showGlobalNotice(type, title, text, canClose) {
    elements.globalNoticeOverlay.className = 'global-notice-overlay global-notice-overlay--' + String(type || 'info');
    elements.globalNoticeTitle.textContent = title || '系統訊息';
    elements.globalNoticeText.textContent = text || '';
    elements.globalNoticeIcon.textContent = type === 'processing' ? '…' : (type === 'error' ? '!' : (type === 'warning' ? '!' : '✓'));
    elements.globalNoticeClose.hidden = canClose === false;
    elements.globalNoticeOverlay.hidden = false;
  }

  function closeGlobalNotice() {
    elements.globalNoticeOverlay.hidden = true;
    elements.globalNoticeClose.hidden = false;
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
