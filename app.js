(function () {
  'use strict';

  var APP_BUILD = '7.3.1B-lookup-search-fix';
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
    dispatchManagement: null,
    dispatchManagementLoading: false,
    batchDispatchRepairPreview: null,
    batchDispatchSelectedEmployees: {},
    dispatchManagementSelectionMonth: '',
    dispatchMonthAnalysis: null,
    accountManagement: null,
    accountManagementLoading: false,
    accountManagementPage: 1,
    accountAction: null,
    accountCredentialLookup: null,
    forceClosePreview: null,
    lastAutoRefreshAt: 0,
    deferredAutoRefresh: false,
    activeTab: 'pending',
    pendingRenderSignature: '',
    progressRenderSignature: '',
    historyRenderSignature: '',
    pendingMutationLocks: {},
    pdfViewerOpen: false,
    pdfViewerRenderId: 0,
    pdfJsModulePromise: null,
    pdfViewerContext: null,
    pdfFallbackCache: {},
    pdfFallbackLoading: false,
    pdfActiveRequestId: '',
    pdfActiveMode: '',
    pdfSlowHintTimers: [],
    pdfPreloadScheduled: false,
    pdfPreloadStarted: false,
    backgroundSyncTimer: null,
    continuousReview: {
      active: false,
      queue: [],
      currentIndex: -1,
      completedCount: 0,
      skippedCount: 0,
      startedAt: 0
    }
  };

  var NORMAL_ACTIONS = Object.keys(window.V3EvaluationForm ? window.V3EvaluationForm.ACTION_LABELS : {});

  document.addEventListener('DOMContentLoaded', initialize);

  function initialize() {
    var publicPdfToken = getPublicPdfToken();
    if (publicPdfToken) {
      initializePublicPdfView(publicPdfToken);
      return;
    }
    retireLegacyDispatchUi();
    ensureDispatchManagementPanel();
    ensureAccountManagementPanel();
    ensureContinuousReviewToolbar();
    cacheElements();
    ensurePdfViewerModal();
    bindEvents();
    elements.appVersion.textContent = APP_BUILD;
    if (elements.dispatchManagementMonth && !elements.dispatchManagementMonth.value) elements.dispatchManagementMonth.value = currentRocMonthFirstDay();

    if (!window.V3ApiClient.isConfigured()) {
      elements.configErrorCard.hidden = false;
      setConnectionStatus('offline', '尚未設定 API');
      elements.loginButton.disabled = true;
      return;
    }

    checkHealth(false);
    restoreSession();
  }


  
  function retireLegacyDispatchUi() {
    var legacyTestForm = document.getElementById('testDispatchForm');
    if (legacyTestForm) {
      var legacyCard = legacyTestForm.closest ? legacyTestForm.closest('.test-dispatch-card') : null;
      if (legacyCard && legacyCard.parentNode) legacyCard.parentNode.removeChild(legacyCard);
    }
    var legacyMonthlyCard = document.getElementById('monthlyDispatchCard');
    if (legacyMonthlyCard && legacyMonthlyCard.parentNode) legacyMonthlyCard.parentNode.removeChild(legacyMonthlyCard);
  }

  function ensureDispatchManagementPanel() {
    if (document.getElementById('dispatchManagementCard')) return;
    var systemPanel = document.getElementById('systemPanel');
    if (!systemPanel) return;

    var article = document.createElement('article');
    article.id = 'dispatchManagementCard';
    article.className = 'card test-dispatch-card';
    article.innerHTML = '<div class="test-dispatch-heading">' +
      '<div><p class="step-label">正式營運工具｜7.2.0A</p><h3>月考核派發管理中心</h3>' +
      '<p>教育中心成員與教育中心主管共用同一個人工派發入口。勾選1人即單筆派發，勾選多人即多人派發；已存在的R0不會重複建立。</p></div>' +
      '<button id="dispatchManagementRefreshButton" class="secondary-button secondary-button--small" type="button">重新整理</button></div>' +
      '<form id="dispatchManagementFilterForm" class="filter-grid">' +
        '<label class="field-group"><span>考核月份</span><input id="dispatchManagementMonth" type="text" placeholder="115/07/01"></label>' +
        '<label class="field-group"><span>人員／工號／考核單號</span><input id="dispatchManagementKeyword" type="text" maxlength="80"></label>' +
        '<label class="field-group"><span>處理狀態</span><select id="dispatchManagementCategory">' +
          '<option value="ALL">全部狀態</option><option value="CREATED">已建立R0</option>' +
          '<option value="DUPLICATE">重複跳過</option><option value="ROUTE_ERROR">路線異常</option>' +
          '<option value="SYSTEM_FAILED">系統失敗</option><option value="UNPROCESSED">尚未派發</option>' +
        '</select></label>' +
        '<label class="field-group"><span>店號</span><select id="dispatchManagementStore"><option value="">全部店號</option></select></label>' +
        '<label class="field-group"><span>區域</span><select id="dispatchManagementArea"><option value="">全部區域</option></select></label>' +
        '<label class="field-group"><span>派發來源</span><select id="dispatchManagementSource"><option value="">全部來源</option></select></label>' +
        '<div class="test-dispatch-actions"><button id="dispatchManagementSearchButton" class="secondary-button" type="submit">' +
          '<span class="button-label">查詢派發狀態</span><span class="button-spinner" aria-hidden="true"></span></button></div>' +
      '</form>' +
      '<div id="dispatchManagementMessage" class="form-message" role="status" aria-live="polite" hidden></div>' +
      '<div id="dispatchManagementSummary"></div>' +
      '<section class="detail-section"><div class="test-dispatch-heading"><div><h4>月份總整分析</h4>' +
        '<p class="section-help">不會在登入時自動載入；按下按鈕後只分析上方所選月份，不匯出CSV。</p></div>' +
        '<button id="dispatchMonthAnalysisButton" class="secondary-button secondary-button--small" type="button"><span class="button-label">產生月份分析</span><span class="button-spinner" aria-hidden="true"></span></button></div>' +
        '<article id="dispatchMonthAnalysisResult" class="card admin-result-card" hidden></article></section>' +
      '<section id="batchDispatchTools" class="detail-section"><div class="test-dispatch-heading"><div><h4>人工派發／補派</h4>' +
        '<p class="section-help">勾選1人或多人後使用同一套預覽與建立流程；正式執行前會逐筆重新驗證。</p></div>' +
        '<strong id="batchDispatchSelectedCount">已選0人</strong></div>' +
        '<div class="test-dispatch-actions"><button id="batchDispatchSelectVisibleButton" class="secondary-button secondary-button--small" type="button">勾選目前可派發人員</button>' +
        '<button id="batchDispatchClearButton" class="secondary-button secondary-button--small" type="button">清除勾選</button>' +
        '<button id="batchDispatchPreviewButton" class="primary-button" type="button" disabled><span class="button-label">預覽人工派發</span><span class="button-spinner" aria-hidden="true"></span></button></div></section>' +
      '<section id="dispatchManagementPersons" class="test-dispatch-preview"></section>' +
      '<details id="dispatchManagementAttemptsPanel" class="detail-section"><summary>查看本月份派發嘗試紀錄</summary>' +
        '<div id="dispatchManagementAttempts"></div></details>' +
      '<section id="batchDispatchRepairPanel" class="test-dispatch-preview" hidden>' +
        '<div id="batchDispatchRepairContent"></div>' +
        '<label class="field-group"><span>人工派發／補派原因</span><textarea id="batchDispatchRepairReason" rows="3" maxlength="300" placeholder="請具體說明本次人工派發／補派原因"></textarea></label>' +
        '<label class="confirm-row"><input id="batchDispatchRepairConfirm" type="checkbox">' +
          '<span>我已確認每位人員仍會獨立檢查派發資格、七階段路線與同月份R0。</span></label>' +
        '<label class="field-group"><span>最終確認文字</span><input id="batchDispatchRepairConfirmText" type="text" maxlength="20" autocomplete="off" placeholder="請輸入：確認派發"></label>' +
        '<div class="test-dispatch-actions"><button id="batchDispatchRepairCancelButton" class="secondary-button" type="button">取消</button>' +
          '<button id="batchDispatchRepairRunButton" class="primary-button" type="button" disabled>' +
          '<span class="button-label">執行人工派發／補派</span><span class="button-spinner" aria-hidden="true"></span></button></div>' +
        '<article id="batchDispatchRepairResult" class="card admin-result-card" hidden></article>' +
      '</section>';
    systemPanel.appendChild(article);
  }


  function ensureAccountManagementPanel() {
    if (document.getElementById('accountManagementCard')) return;
    var systemPanel = document.getElementById('systemPanel');
    if (!systemPanel) return;

    var article = document.createElement('article');
    article.id = 'accountManagementCard';
    article.className = 'card test-dispatch-card';
    article.innerHTML = '<div class="test-dispatch-heading"><div>' +
      '<p class="step-label">帳號與登入管理｜7.3.1A</p><h3>帳號管理中心</h3>' +
      '<p>教育中心成員與主管權限一致。密碼由教育中心在員工主檔統一維護；本頁可查詢帳密、解除暫時鎖定、啟停帳號及強制登出，但不提供網頁修改密碼。</p></div>' +
      '<button id="accountManagementRefreshButton" class="secondary-button secondary-button--small" type="button">重新整理</button></div>' +
      '<section class="detail-section account-credential-section">' +
        '<div class="test-dispatch-heading"><div><h4>協助查詢登入帳密</h4>' +
        '<p class="section-help">僅教育中心可使用。輸入姓名或工號；同名時會先要求選擇正確人員。查詢紀錄不保存密碼內容。</p></div></div>' +
        '<form id="accountCredentialLookupForm" class="account-credential-form">' +
          '<label class="field-group"><span>員工完整姓名／完整工號</span><input id="accountCredentialLookupQuery" type="text" maxlength="80" autocomplete="off" placeholder="例如：王小明或完整工號 FMSC0000123"></label>' +
          '<div class="test-dispatch-actions"><button id="accountCredentialLookupButton" class="primary-button primary-button--small" type="submit"><span class="button-label">查詢帳密</span><span class="button-spinner" aria-hidden="true"></span></button>' +
          '<button id="accountCredentialClearButton" class="secondary-button secondary-button--small" type="button">清除結果</button></div>' +
        '</form>' +
        '<div id="accountCredentialLookupMessage" class="form-message" role="status" aria-live="polite" hidden></div>' +
        '<div id="accountCredentialLookupResult" hidden></div>' +
      '</section>' +
      '<form id="accountManagementFilterForm" class="filter-grid">' +
        '<label class="field-group"><span>工號（完整）／姓名／店號或店別</span><input id="accountManagementKeyword" type="text" maxlength="80" autocomplete="off" placeholder="工號與店號需完整輸入"></label>' +
        '<label class="field-group"><span>系統角色</span><select id="accountManagementRole"><option value="">全部角色</option></select></label>' +
        '<label class="field-group"><span>在職狀態</span><select id="accountManagementEmployment"><option value="">全部狀態</option></select></label>' +
        '<label class="field-group"><span>帳號狀態</span><select id="accountManagementStatus"><option value="">全部狀態</option><option value="啟用">啟用</option><option value="停用">停用</option><option value="鎖定">鎖定</option><option value="未設定">未設定</option></select></label>' +
        '<div class="test-dispatch-actions"><button id="accountManagementSearchButton" class="secondary-button" type="submit"><span class="button-label">查詢帳號</span><span class="button-spinner" aria-hidden="true"></span></button></div>' +
      '</form>' +
      '<div id="accountManagementMessage" class="form-message" role="status" aria-live="polite" hidden></div>' +
      '<div id="accountManagementSummary"></div>' +
      '<section id="accountManagementList" class="test-dispatch-preview"></section>' +
      '<div class="test-dispatch-actions"><button id="accountManagementPreviousButton" class="secondary-button secondary-button--small" type="button">上一頁</button>' +
        '<strong id="accountManagementPageText">第1頁</strong><button id="accountManagementNextButton" class="secondary-button secondary-button--small" type="button">下一頁</button></div>' +
      '<section id="accountActionPanel" class="test-dispatch-preview" hidden>' +
        '<div id="accountActionContent"></div>' +
        '<label class="field-group"><span>處理原因</span><textarea id="accountActionReason" rows="3" maxlength="300" placeholder="請填寫至少4個字的具體原因"></textarea></label>' +
        '<label class="confirm-row"><input id="accountActionConfirm" type="checkbox"><span id="accountActionConfirmLabel">我已確認此操作的影響。</span></label>' +
        '<label class="field-group"><span>最終確認文字</span><input id="accountActionConfirmText" type="text" maxlength="20" autocomplete="off"><small id="accountActionConfirmHint"></small></label>' +
        '<div class="test-dispatch-actions"><button id="accountActionCancelButton" class="secondary-button" type="button">取消</button>' +
          '<button id="accountActionRunButton" class="primary-button" type="button" disabled><span class="button-label">執行</span><span class="button-spinner" aria-hidden="true"></span></button></div>' +
        '<article id="accountActionResult" class="card admin-result-card" hidden></article>' +
      '</section>' +
      '<details id="accountAuditPanel" class="detail-section"><summary>查看最近帳號操作紀錄</summary><div id="accountAuditList"></div></details>';
    systemPanel.appendChild(article);
  }

  function ensureContinuousReviewToolbar() {
    if (document.getElementById('continuousReviewBar')) return;
    var summary = document.getElementById('evaluationSummary');
    if (!summary || !summary.parentNode) return;
    var section = document.createElement('section');
    section.id = 'continuousReviewBar';
    section.className = 'detail-section';
    section.hidden = true;
    section.innerHTML = '<div class="test-dispatch-heading"><div>' +
      '<p class="step-label">連續簽核</p><h3 id="continuousReviewProgress">準備中</h3>' +
      '<p id="continuousReviewSummary" class="section-help"></p></div>' +
      '<button id="continuousReviewEndButton" class="secondary-button secondary-button--small" type="button">結束連續簽核</button></div>' +
      '<div class="test-dispatch-actions">' +
        '<button id="continuousReviewPreviousButton" class="secondary-button secondary-button--small" type="button">上一張</button>' +
        '<button id="continuousReviewSkipButton" class="secondary-button secondary-button--small" type="button">略過此張</button>' +
        '<button id="continuousReviewNextButton" class="secondary-button secondary-button--small" type="button">下一張</button>' +
      '</div>';
    summary.parentNode.insertBefore(section, summary);
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
      'adminSystemMessage', 'adminSystemResult',
      'dispatchManagementCard', 'dispatchManagementRefreshButton', 'dispatchManagementFilterForm',
      'dispatchManagementMonth', 'dispatchManagementKeyword', 'dispatchManagementCategory',
      'dispatchManagementStore', 'dispatchManagementArea', 'dispatchManagementSource',
      'dispatchManagementSearchButton', 'dispatchManagementMessage', 'dispatchManagementSummary',
      'dispatchManagementPersons', 'dispatchManagementAttemptsPanel', 'dispatchManagementAttempts',
      'dispatchMonthAnalysisButton', 'dispatchMonthAnalysisResult', 'batchDispatchTools',
      'batchDispatchSelectedCount', 'batchDispatchSelectVisibleButton', 'batchDispatchClearButton',
      'batchDispatchPreviewButton', 'batchDispatchRepairPanel', 'batchDispatchRepairContent',
      'batchDispatchRepairReason', 'batchDispatchRepairConfirm', 'batchDispatchRepairConfirmText',
      'batchDispatchRepairCancelButton', 'batchDispatchRepairRunButton', 'batchDispatchRepairResult',
      'accountManagementCard', 'accountManagementRefreshButton', 'accountManagementFilterForm',
      'accountManagementKeyword', 'accountManagementRole', 'accountManagementEmployment', 'accountManagementStatus',
      'accountManagementSearchButton', 'accountManagementMessage', 'accountManagementSummary', 'accountManagementList',
      'accountManagementPreviousButton', 'accountManagementNextButton', 'accountManagementPageText',
      'accountCredentialLookupForm', 'accountCredentialLookupQuery', 'accountCredentialLookupButton',
      'accountCredentialClearButton', 'accountCredentialLookupMessage', 'accountCredentialLookupResult',
      'accountActionPanel', 'accountActionContent', 'accountActionReason', 'accountActionConfirm',
      'accountActionConfirmLabel', 'accountActionConfirmText', 'accountActionConfirmHint', 'accountActionCancelButton',
      'accountActionRunButton', 'accountActionResult', 'accountAuditPanel', 'accountAuditList',
      'evaluationOverlay', 'closeEvaluationButton', 'evaluationLoading',
      'evaluationMessage', 'evaluationContent', 'evaluationSummary', 'evaluationReadOnly', 'claimPanel',
      'claimMessage', 'claimButton', 'releaseButton', 'actionPanel', 'actionSelector', 'evaluationActionForm',
      'draftStatus', 'saveDraftButton', 'submitEvaluationButton', 'evaluationDialogTitle',
      'continuousReviewBar', 'continuousReviewProgress', 'continuousReviewSummary',
      'continuousReviewPreviousButton', 'continuousReviewSkipButton', 'continuousReviewNextButton', 'continuousReviewEndButton',
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
    if (elements.dispatchManagementFilterForm) elements.dispatchManagementFilterForm.addEventListener('submit', function (event) { event.preventDefault(); loadDispatchManagementCenter(); });
    if (elements.dispatchManagementRefreshButton) elements.dispatchManagementRefreshButton.addEventListener('click', function () { loadDispatchManagementCenter(); });
    if (elements.dispatchMonthAnalysisButton) elements.dispatchMonthAnalysisButton.addEventListener('click', loadDispatchMonthAnalysis);
    if (elements.batchDispatchSelectVisibleButton) elements.batchDispatchSelectVisibleButton.addEventListener('click', selectVisibleBatchDispatchEmployees);
    if (elements.batchDispatchClearButton) elements.batchDispatchClearButton.addEventListener('click', clearBatchDispatchSelection);
    if (elements.batchDispatchPreviewButton) elements.batchDispatchPreviewButton.addEventListener('click', previewBatchDispatchRepair);
    if (elements.batchDispatchRepairReason) elements.batchDispatchRepairReason.addEventListener('input', updateBatchDispatchRunState);
    if (elements.batchDispatchRepairConfirm) elements.batchDispatchRepairConfirm.addEventListener('change', updateBatchDispatchRunState);
    if (elements.batchDispatchRepairConfirmText) elements.batchDispatchRepairConfirmText.addEventListener('input', updateBatchDispatchRunState);
    if (elements.batchDispatchRepairCancelButton) elements.batchDispatchRepairCancelButton.addEventListener('click', closeBatchDispatchRepairPanel);
    if (elements.batchDispatchRepairRunButton) elements.batchDispatchRepairRunButton.addEventListener('click', runBatchDispatchRepair);
    if (elements.accountManagementFilterForm) elements.accountManagementFilterForm.addEventListener('submit', function (event) { event.preventDefault(); state.accountManagementPage = 1; loadAccountManagementCenter(); });
    if (elements.accountManagementRefreshButton) elements.accountManagementRefreshButton.addEventListener('click', function () { loadAccountManagementCenter(); });
    if (elements.accountManagementPreviousButton) elements.accountManagementPreviousButton.addEventListener('click', function () { if (state.accountManagementPage > 1) { state.accountManagementPage -= 1; loadAccountManagementCenter(); } });
    if (elements.accountManagementNextButton) elements.accountManagementNextButton.addEventListener('click', function () { var totalPages = Number(state.accountManagement && state.accountManagement.totalPages || 1); if (state.accountManagementPage < totalPages) { state.accountManagementPage += 1; loadAccountManagementCenter(); } });
    if (elements.accountCredentialLookupForm) elements.accountCredentialLookupForm.addEventListener('submit', function (event) { event.preventDefault(); lookupAccountCredentialV3_(''); });
    if (elements.accountCredentialClearButton) elements.accountCredentialClearButton.addEventListener('click', clearAccountCredentialLookupV3_);
    if (elements.accountActionReason) elements.accountActionReason.addEventListener('input', updateAccountActionRunState);
    if (elements.accountActionConfirm) elements.accountActionConfirm.addEventListener('change', updateAccountActionRunState);
    if (elements.accountActionConfirmText) elements.accountActionConfirmText.addEventListener('input', updateAccountActionRunState);
    if (elements.accountActionCancelButton) elements.accountActionCancelButton.addEventListener('click', closeAccountActionPanel);
    if (elements.accountActionRunButton) elements.accountActionRunButton.addEventListener('click', runAccountManagementAction);
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
    elements.closeEvaluationButton.addEventListener('click', requestCloseEvaluationUi);
    elements.evaluationOverlay.addEventListener('click', function (event) {
      if (event.target === elements.evaluationOverlay) requestCloseEvaluationUi();
    });
    if (elements.continuousReviewPreviousButton) elements.continuousReviewPreviousButton.addEventListener('click', function () { navigateContinuousReview(-1); });
    if (elements.continuousReviewNextButton) elements.continuousReviewNextButton.addEventListener('click', function () { navigateContinuousReview(1); });
    if (elements.continuousReviewSkipButton) elements.continuousReviewSkipButton.addEventListener('click', skipCurrentContinuousReviewItem);
    if (elements.continuousReviewEndButton) elements.continuousReviewEndButton.addEventListener('click', function () { endContinuousReviewFromUi(true); });
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
      schedulePdfJsPreloadV3();
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
    var launcher = continuousReviewLauncherHtml();
    elements.pendingList.innerHTML = launcher + state.pending.map(function (item) { return evaluationCardHtml(item, 'pending'); }).join('');
    bindEvaluationCards(elements.pendingList);
  }

  function continuousReviewLauncherHtml() {
    if (!isContinuousReviewEligibleUi() || state.pending.length < 2) return '';
    var active = Boolean(state.continuousReview && state.continuousReview.active);
    return '<article class="detail-section"><div class="test-dispatch-heading"><div>' +
      '<p class="step-label">快速逐張處理</p><h3>連續簽核</h3>' +
      '<p class="section-help">每張仍須個別確認、個別送出及建立獨立簽名快照，不會一次批次通過。</p></div>' +
      '<button class="primary-button" type="button" data-start-continuous-review' + (active ? ' disabled' : '') + '>' +
      (active ? '連續簽核進行中' : '開始連續簽核（' + escapeHtml(state.pending.length) + '張）') + '</button></div></article>';
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
      '<div class="evaluation-card__top"><div><h3>' + escapeHtml(item.employeeName || '未命名') + '</h3><p>月考核單號：' + escapeHtml(item.evaluationNo || '') + '</p></div><div>' + tagParts.join('') + '</div></div>' +
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
    Array.prototype.slice.call(container.querySelectorAll('[data-start-continuous-review]')).forEach(function (button) {
      button.addEventListener('click', startContinuousReview);
    });
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
    var correlationId = 'pdf-stable-' + window.V3ApiClient.createRequestId();

    button.disabled = true;
    button.textContent = '開啟中…';
    openPdfViewerModal('正在啟動系統檢視…', safeNo);
    state.pdfViewerContext = {
      evaluationNo: safeNo,
      fileName: safeNo + '.pdf',
      pdfVersion: '',
      correlationId: correlationId,
      originalStartedAt: performanceNowV3(),
      activeMode: '',
      attemptToken: 0,
      settings: {
        memoryCacheEnabled: true,
        renderMaxDprDesktop: 1.75,
        renderMaxDprMobile: 2,
        driveEmbedTimeoutMs: 12000
      }
    };

    try {
      await activatePdfCanvasViewerV3('系統預設檢視', false);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  function cancelActivePdfRequestV3() {
    var requestId = String(state.pdfActiveRequestId || '').trim();
    if (requestId && window.V3ApiClient && typeof window.V3ApiClient.cancelRequest === 'function') {
      window.V3ApiClient.cancelRequest(requestId);
    }
    state.pdfActiveRequestId = '';
  }

  function clearPdfSlowHintTimersV3() {
    (state.pdfSlowHintTimers || []).forEach(function(timerId) { window.clearTimeout(timerId); });
    state.pdfSlowHintTimers = [];
  }

  function resetPdfViewerSurfaceV3() {
    clearPdfSlowHintTimersV3();
    state.pdfViewerRenderId += 1;
    var pages = document.getElementById('pdfViewerPages');
    if (!pages) return;
    Array.prototype.slice.call(pages.querySelectorAll('iframe')).forEach(function(frame) {
      try { frame.src = 'about:blank'; } catch (ignore) {}
    });
    pages.innerHTML = '';
  }

  function configurePdfViewerModeV3(mode) {
    var switchButton = document.getElementById('pdfViewerFallback');
    var modeNote = document.getElementById('pdfViewerModeNote');
    var isCanvas = mode === 'canvas_proxy';
    state.pdfActiveMode = mode;
    if (switchButton) {
      switchButton.hidden = false;
      switchButton.disabled = false;
      switchButton.textContent = isCanvas ? '改用Google快速檢視' : '改用系統檢視';
    }
    if (modeNote) {
      modeNote.textContent = isCanvas
        ? '目前：系統檢視（建議，無Google工具列）'
        : '目前：Google快速檢視（工具列由Google控制）';
    }
  }

  function schedulePdfLoadingHintsV3(mode, attemptToken) {
    clearPdfSlowHintTimersV3();
    var status = document.getElementById('pdfViewerStatus');
    state.pdfSlowHintTimers.push(window.setTimeout(function() {
      var context = state.pdfViewerContext || {};
      if (!state.pdfViewerOpen || context.attemptToken !== attemptToken || context.activeMode !== mode) return;
      status.className = 'pdf-modal-status pdf-modal-status--warning';
      status.textContent = mode === 'canvas_proxy'
        ? '系統檢視載入時間較久，可繼續等待或改用Google快速檢視。'
        : 'Google快速檢視載入時間較久，可繼續等待或改用系統檢視。';
      status.hidden = false;
    }, 6000));
    state.pdfSlowHintTimers.push(window.setTimeout(function() {
      var context = state.pdfViewerContext || {};
      if (!state.pdfViewerOpen || context.attemptToken !== attemptToken || context.activeMode !== mode) return;
      status.className = 'pdf-modal-status pdf-modal-status--warning';
      status.textContent = mode === 'canvas_proxy'
        ? 'PDF仍在載入。建議改用Google快速檢視，或稍後重新嘗試。'
        : 'Google檢視器仍未完成。建議改回系統檢視。';
      status.hidden = false;
    }, 12000));
  }

  async function switchPdfViewerModeV3() {
    var context = state.pdfViewerContext;
    if (!context || !state.pdfViewerOpen) return;
    if (context.activeMode === 'drive_embed') {
      await activatePdfCanvasViewerV3('使用者由Google快速檢視切回系統檢視', true);
    } else {
      await activateDrivePdfViewerV3('使用者由系統檢視切換Google快速檢視');
    }
  }

  async function activatePdfCanvasViewerV3(reason, secondaryUsed) {
    var context = state.pdfViewerContext || {};
    var evaluationNo = String(context.evaluationNo || '').trim();
    if (!evaluationNo || !state.pdfViewerOpen) return;

    cancelActivePdfRequestV3();
    resetPdfViewerSurfaceV3();
    context.attemptToken = Number(context.attemptToken || 0) + 1;
    context.activeMode = 'canvas_proxy';
    var attemptToken = context.attemptToken;
    var renderId = state.pdfViewerRenderId;
    configurePdfViewerModeV3('canvas_proxy');

    var status = document.getElementById('pdfViewerStatus');
    status.className = 'pdf-modal-status';
    status.textContent = '正在取得PDF並啟動系統檢視…';
    status.hidden = false;
    schedulePdfLoadingHintsV3('canvas_proxy', attemptToken);

    var startedAt = performanceNowV3();
    var requestMs = 0;
    var responseBytes = 0;
    var cacheHit = false;
    var renderMetrics = null;
    var requestId = context.correlationId + '-canvas-' + attemptToken;
    state.pdfActiveRequestId = requestId;

    try {
      var cacheKey = context.pdfVersion ? evaluationNo + '|' + String(context.pdfVersion) : '';
      var cached = cacheKey && context.settings.memoryCacheEnabled !== false ? state.pdfFallbackCache[cacheKey] : null;
      var data;
      if (cached && cached.pdfBase64) {
        cacheHit = true;
        data = cached;
      } else {
        var result = await window.V3WorkflowService.authenticatedPdfView(evaluationNo, requestId);
        requestMs = Number(result.clientPerformance && result.clientPerformance.requestMs || 0);
        responseBytes = Number(result.clientPerformance && result.clientPerformance.responseBytes || 0);
        data = result.data || {};
        if (!data.pdfBase64) throw new Error('後端未回傳可顯示的PDF內容。');
        var viewerSettings = data.viewerSettings || {};
        context.settings = {
          memoryCacheEnabled: viewerSettings.memoryCacheEnabled !== false,
          renderMaxDprDesktop: Number(viewerSettings.renderMaxDprDesktop || 1.75),
          renderMaxDprMobile: Number(viewerSettings.renderMaxDprMobile || 2),
          driveEmbedTimeoutMs: Number(viewerSettings.driveEmbedTimeoutMs || 12000)
        };
        context.fileName = data.fileName || context.fileName;
        context.pdfVersion = data.pdfVersion || context.pdfVersion || '';
        cacheKey = evaluationNo + '|' + String(context.pdfVersion || '');
        if (context.settings.memoryCacheEnabled !== false) {
          state.pdfFallbackCache[cacheKey] = {
            pdfBase64: data.pdfBase64,
            fileName: context.fileName,
            pdfVersion: context.pdfVersion,
            viewerSettings: viewerSettings
          };
        }
      }

      if (!state.pdfViewerOpen || context.attemptToken !== attemptToken || context.activeMode !== 'canvas_proxy' || renderId !== state.pdfViewerRenderId) return;
      renderMetrics = await renderPdfBase64InViewer(data.pdfBase64, data.fileName || context.fileName || evaluationNo + '.pdf', context.settings);
      if (!state.pdfViewerOpen || context.attemptToken !== attemptToken || context.activeMode !== 'canvas_proxy') return;
      clearPdfSlowHintTimersV3();
      configurePdfViewerModeV3('canvas_proxy');
      queuePdfViewPerformanceMetricV3({
        operation: secondaryUsed ? 'PDF_VIEW_CANVAS_SECONDARY' : 'PDF_VIEW_CANVAS_PRIMARY',
        correlationId: context.correlationId + '-canvas-view-' + attemptToken,
        result: '成功',
        deviceType: detectDeviceTypeV3(),
        cacheHit: cacheHit,
        viewMode: 'canvas_proxy',
        fallbackUsed: Boolean(secondaryUsed),
        fallbackReason: String(reason || ''),
        prepareRequestMs: 0,
        pdfRequestMs: requestMs,
        networkMs: requestMs,
        pdfJsLoadMs: renderMetrics && renderMetrics.pdfJsLoadMs || 0,
        base64DecodeMs: renderMetrics && renderMetrics.base64DecodeMs || 0,
        pdfParseMs: renderMetrics && renderMetrics.pdfParseMs || 0,
        canvasRenderMs: renderMetrics && renderMetrics.canvasRenderMs || 0,
        frontendTotalMs: Math.max(0, Math.round(performanceNowV3() - startedAt)),
        postViewRefreshMs: 0,
        responseBytes: responseBytes,
        pdfSizeBytes: renderMetrics && renderMetrics.pdfSizeBytes || 0,
        note: '一次登入API完成權限驗證、PDF讀取與系統Canvas顯示'
      });
    } catch (error) {
      if (String(error && error.code || '') === 'REQUEST_CANCELLED') return;
      clearPdfSlowHintTimersV3();
      showPdfViewerError(friendlyError(error) + ' 可改用Google快速檢視。');
      configurePdfViewerModeV3('canvas_proxy');
      queuePdfViewPerformanceMetricV3({
        operation: secondaryUsed ? 'PDF_VIEW_CANVAS_SECONDARY' : 'PDF_VIEW_CANVAS_PRIMARY',
        correlationId: context.correlationId + '-canvas-view-' + attemptToken,
        result: '失敗',
        errorCode: String(error && error.code || error && error.name || 'PDF_CANVAS_FAILED'),
        deviceType: detectDeviceTypeV3(),
        cacheHit: cacheHit,
        viewMode: 'canvas_proxy',
        fallbackUsed: Boolean(secondaryUsed),
        fallbackReason: String(reason || ''),
        pdfRequestMs: requestMs,
        networkMs: requestMs,
        frontendTotalMs: Math.max(0, Math.round(performanceNowV3() - startedAt)),
        postViewRefreshMs: 0,
        responseBytes: responseBytes,
        pdfSizeBytes: 0
      });
    } finally {
      if (state.pdfActiveRequestId === requestId) state.pdfActiveRequestId = '';
    }
  }

  async function activateDrivePdfViewerV3(reason) {
    var context = state.pdfViewerContext || {};
    var evaluationNo = String(context.evaluationNo || '').trim();
    if (!evaluationNo || !state.pdfViewerOpen) return;

    cancelActivePdfRequestV3();
    resetPdfViewerSurfaceV3();
    context.attemptToken = Number(context.attemptToken || 0) + 1;
    context.activeMode = 'drive_embed';
    var attemptToken = context.attemptToken;
    var renderId = state.pdfViewerRenderId;
    configurePdfViewerModeV3('drive_embed');

    var status = document.getElementById('pdfViewerStatus');
    status.className = 'pdf-modal-status';
    status.textContent = '正在取得Google Drive快速檢視連結…';
    status.hidden = false;
    schedulePdfLoadingHintsV3('drive_embed', attemptToken);

    var startedAt = performanceNowV3();
    var requestMs = 0;
    var responseBytes = 0;
    var requestId = context.correlationId + '-drive-' + attemptToken;
    state.pdfActiveRequestId = requestId;

    try {
      var prepared = await window.V3WorkflowService.prepareDrivePdfView(evaluationNo, requestId);
      requestMs = Number(prepared.clientPerformance && prepared.clientPerformance.requestMs || 0);
      responseBytes = Number(prepared.clientPerformance && prepared.clientPerformance.responseBytes || 0);
      var data = prepared.data || {};
      if (!data.previewUrl) throw new Error(data.fallbackReason || 'Google Drive快速檢視連結無法取得。');
      context.fileName = data.fileName || context.fileName;
      context.pdfVersion = data.pdfVersion || context.pdfVersion || '';
      context.settings.driveEmbedTimeoutMs = Number(data.driveEmbedTimeoutMs || context.settings.driveEmbedTimeoutMs || 12000);

      if (!state.pdfViewerOpen || context.attemptToken !== attemptToken || context.activeMode !== 'drive_embed' || renderId !== state.pdfViewerRenderId) return;
      var driveResult = await renderDrivePdfInViewerV3(data, context, attemptToken);
      if (!state.pdfViewerOpen || context.attemptToken !== attemptToken || context.activeMode !== 'drive_embed') return;
      clearPdfSlowHintTimersV3();
      configurePdfViewerModeV3('drive_embed');
      queuePdfViewPerformanceMetricV3({
        operation: driveResult && driveResult.timedOut ? 'PDF_VIEW_DRIVE_IFRAME_TIMEOUT' : 'PDF_VIEW_DRIVE_IFRAME_LOAD',
        correlationId: context.correlationId + '-drive-view-' + attemptToken,
        result: driveResult && driveResult.timedOut ? '失敗' : '成功',
        errorCode: driveResult && driveResult.timedOut ? 'DRIVE_IFRAME_TIMEOUT' : '',
        deviceType: detectDeviceTypeV3(),
        cacheHit: false,
        viewMode: 'drive_embed',
        fallbackUsed: true,
        fallbackReason: String(reason || ''),
        prepareRequestMs: requestMs,
        pdfRequestMs: 0,
        networkMs: requestMs,
        driveEmbedLoadMs: driveResult && driveResult.loadMs || 0,
        frontendTotalMs: Math.max(0, Math.round(performanceNowV3() - startedAt)),
        postViewRefreshMs: 0,
        responseBytes: responseBytes,
        pdfSizeBytes: 0,
        note: driveResult && driveResult.timedOut
          ? 'iframe逾時提示，不代表Drive檔案不存在'
          : '只記錄iframe load事件，不代表PDF內容已被系統驗證'
      });
    } catch (error) {
      if (String(error && error.code || '') === 'REQUEST_CANCELLED') return;
      clearPdfSlowHintTimersV3();
      showPdfViewerError(friendlyError(error) + ' 請改用系統檢視。');
      configurePdfViewerModeV3('drive_embed');
      queuePdfViewPerformanceMetricV3({
        operation: 'PDF_VIEW_DRIVE_IFRAME_LOAD',
        correlationId: context.correlationId + '-drive-view-' + attemptToken,
        result: '失敗',
        errorCode: String(error && error.code || error && error.name || 'PDF_DRIVE_FAILED'),
        deviceType: detectDeviceTypeV3(),
        cacheHit: false,
        viewMode: 'drive_embed',
        fallbackUsed: true,
        fallbackReason: String(reason || ''),
        prepareRequestMs: requestMs,
        networkMs: requestMs,
        frontendTotalMs: Math.max(0, Math.round(performanceNowV3() - startedAt)),
        postViewRefreshMs: 0,
        responseBytes: responseBytes,
        pdfSizeBytes: 0
      });
    } finally {
      if (state.pdfActiveRequestId === requestId) state.pdfActiveRequestId = '';
    }
  }

  function renderDrivePdfInViewerV3(data, context, attemptToken) {
    ensurePdfViewerModal();
    var renderId = state.pdfViewerRenderId;
    var title = document.getElementById('pdfViewerTitle');
    var status = document.getElementById('pdfViewerStatus');
    var pages = document.getElementById('pdfViewerPages');
    title.textContent = String(data.fileName || '月考核表PDF');
    status.className = 'pdf-modal-status';
    status.textContent = '正在載入Google Drive快速檢視器…';
    status.hidden = false;
    pages.innerHTML = '';

    var frame = document.createElement('iframe');
    frame.className = 'pdf-drive-iframe';
    frame.title = String(data.fileName || '月考核表PDF');
    frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('allow', 'fullscreen');
    frame.style.cssText = 'display:block;width:100%;height:min(78vh,980px);min-height:560px;border:0;background:#fff;border-radius:8px;';

    var startedAt = performanceNowV3();
    var timeoutMs = Math.max(4000, Math.min(30000, Number(data.driveEmbedTimeoutMs || 12000)));
    return new Promise(function(resolve, reject) {
      var settled = false;
      var timeoutId = window.setTimeout(function() {
        if (settled || renderId !== state.pdfViewerRenderId || !state.pdfViewerOpen || context.attemptToken !== attemptToken) return;
        settled = true;
        status.className = 'pdf-modal-status pdf-modal-status--warning';
        status.textContent = 'Google快速檢視載入較久，可繼續等待或改用系統檢視。';
        resolve({ loadMs: Math.max(0, Math.round(performanceNowV3() - startedAt)), timedOut: true });
      }, timeoutMs);

      frame.addEventListener('load', function() {
        if (renderId !== state.pdfViewerRenderId || !state.pdfViewerOpen || context.attemptToken !== attemptToken) return;
        window.clearTimeout(timeoutId);
        status.hidden = true;
        if (!settled) {
          settled = true;
          resolve({ loadMs: Math.max(0, Math.round(performanceNowV3() - startedAt)), timedOut: false });
        }
      });

      frame.addEventListener('error', function() {
        if (renderId !== state.pdfViewerRenderId || !state.pdfViewerOpen || context.attemptToken !== attemptToken) return;
        window.clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          reject(new Error('Google Drive快速檢視器載入失敗。'));
        }
      });

      frame.src = String(data.previewUrl || '');
      pages.appendChild(frame);
    });
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
      '<footer class="pdf-modal-footer"><span id="pdfViewerModeNote">目前：系統檢視（建議，無Google工具列）</span>' +
      '<button type="button" id="pdfViewerFallback" class="secondary-button">改用Google快速檢視</button></footer>' +
      '</section>';
    document.body.appendChild(overlay);
    overlay.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    overlay.addEventListener('dragstart', function (event) { event.preventDefault(); });
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closePdfViewerModal();
    });
    document.getElementById('pdfViewerClose').addEventListener('click', closePdfViewerModal);
    document.getElementById('pdfViewerFallback').addEventListener('click', function () {
      switchPdfViewerModeV3();
    });
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
    var fallbackButton = document.getElementById('pdfViewerFallback');
    if (fallbackButton) {
      fallbackButton.hidden = false;
      fallbackButton.disabled = false;
      fallbackButton.textContent = '改用Google快速檢視';
    }
    state.pdfFallbackLoading = false;
    state.pdfActiveMode = 'canvas_proxy';
    var modeNote = document.getElementById('pdfViewerModeNote');
    if (modeNote) modeNote.textContent = '目前：系統檢視（建議，無Google工具列）';
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    document.getElementById('pdfViewerClose').focus();
  }

  function closePdfViewerModal() {
    var overlay = document.getElementById('pdfViewerOverlay');
    if (!overlay) return;
    cancelActivePdfRequestV3();
    clearPdfSlowHintTimersV3();
    state.pdfViewerRenderId += 1;
    state.pdfViewerOpen = false;
    state.pdfFallbackLoading = false;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    var pages = document.getElementById('pdfViewerPages');
    Array.prototype.slice.call(pages.querySelectorAll('iframe')).forEach(function(frame) {
      try { frame.src = 'about:blank'; } catch (ignore) {}
    });
    pages.innerHTML = '';
    state.pdfViewerContext = null;
    state.pdfActiveMode = '';
    state.deferredAutoRefresh = false;
    if (elements.evaluationOverlay && !elements.evaluationOverlay.hidden) return;
    document.body.classList.remove('is-locked');
  }

  function showPdfViewerError(message) {
    ensurePdfViewerModal();
    var status = document.getElementById('pdfViewerStatus');
    status.className = 'pdf-modal-status pdf-modal-status--error';
    status.textContent = String(message || 'PDF無法開啟。');
    status.hidden = false;
  }

  function canPreloadPdfJsV3() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return true;
    if (connection.saveData) return false;
    var effectiveType = String(connection.effectiveType || '').toLowerCase();
    return ['slow-2g', '2g'].indexOf(effectiveType) === -1;
  }

  function schedulePdfJsPreloadV3() {
    if (state.pdfPreloadScheduled || state.pdfPreloadStarted || !canPreloadPdfJsV3()) return;
    state.pdfPreloadScheduled = true;
    var run = function() {
      state.pdfPreloadScheduled = false;
      if (state.pdfPreloadStarted) return;
      state.pdfPreloadStarted = true;
      loadPdfJsModule().catch(function(error) {
        state.pdfPreloadStarted = false;
        console.warn('PDF.js背景預載失敗，首次查看時會重新載入：', error && error.message || error);
      });
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      window.setTimeout(run, 2000);
    }
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

  async function renderPdfBase64InViewer(base64Text, fileName, viewerSettings) {
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
      var settings = viewerSettings || {};
      var isMobileDevice = detectDeviceTypeV3() !== 'desktop';
      var ratioLimit = isMobileDevice ? Number(settings.renderMaxDprMobile || 2) : Number(settings.renderMaxDprDesktop || 1.75);
      var pixelRatio = Math.max(1, Math.min(ratioLimit, window.devicePixelRatio || 1));
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

  function isContinuousReviewEligibleUi() {
    var role = String(state.session && state.session.user && state.session.user.role || '').trim();
    return ['區主管', '營業處副總', '營業處協理', '總經理'].indexOf(role) !== -1;
  }

  function resetContinuousReviewState(renderList) {
    state.continuousReview = {
      active: false,
      queue: [],
      currentIndex: -1,
      completedCount: 0,
      skippedCount: 0,
      startedAt: 0
    };
    if (elements.continuousReviewBar) elements.continuousReviewBar.hidden = true;
    if (renderList !== false && elements.pendingList) renderPending();
  }

  async function startContinuousReview() {
    if (!isContinuousReviewEligibleUi() || state.isSubmitting) return;
    var candidates = state.pending.filter(function(item) {
      return item && item.evaluationNo && !isPendingMutationLocked(item.evaluationNo);
    });
    if (candidates.length < 2) {
      showGlobalNotice('info', '不需要啟動連續簽核', '目前可處理的待辦少於2張，請直接開啟單張處理。');
      return;
    }
    state.continuousReview = {
      active: true,
      queue: candidates.map(function(item) {
        return {
          evaluationNo: String(item.evaluationNo || ''),
          employeeName: String(item.employeeName || ''),
          status: 'pending'
        };
      }),
      currentIndex: -1,
      completedCount: 0,
      skippedCount: 0,
      startedAt: Date.now()
    };
    renderPending();
    await openNextContinuousReviewItem(0);
  }

  function requestCloseEvaluationUi() {
    if (state.isSubmitting) return;
    if (state.continuousReview && state.continuousReview.active) {
      if (!window.confirm('目前正在連續簽核。確定要結束連續簽核並回到待辦清單嗎？\n\n尚未送出的表單仍會保留在待辦中。')) return;
      resetContinuousReviewState(false);
    }
    closeEvaluation({ saveDraft: true });
    renderPending();
  }

  function endContinuousReviewFromUi(askConfirm) {
    if (!state.continuousReview || !state.continuousReview.active || state.isSubmitting) return;
    if (askConfirm && !window.confirm('確定結束連續簽核嗎？\n\n尚未完成或略過的表單仍會保留在待辦中。')) return;
    var completed = Number(state.continuousReview.completedCount || 0);
    var skipped = Number(state.continuousReview.skippedCount || 0);
    resetContinuousReviewState(false);
    closeEvaluation({ saveDraft: true });
    renderPending();
    setDashboardMessage('info', '已結束連續簽核。完成' + completed + '張，略過' + skipped + '張。');
  }

  function getContinuousPendingIndices() {
    var review = state.continuousReview || {};
    var queue = Array.isArray(review.queue) ? review.queue : [];
    var result = [];
    queue.forEach(function(item, index) {
      if (item && item.status === 'pending') result.push(index);
    });
    return result;
  }

  function findContinuousReviewIndex(direction, startIndex) {
    var review = state.continuousReview || {};
    var queue = Array.isArray(review.queue) ? review.queue : [];
    if (!queue.length) return -1;
    var step = direction < 0 ? -1 : 1;
    var index = Number(startIndex);
    if (!isFinite(index)) index = review.currentIndex;
    for (var offset = 1; offset <= queue.length; offset += 1) {
      var candidate = (index + step * offset + queue.length) % queue.length;
      if (queue[candidate] && queue[candidate].status === 'pending') return candidate;
    }
    return -1;
  }

  async function navigateContinuousReview(direction) {
    if (!state.continuousReview || !state.continuousReview.active || state.isSubmitting) return;
    var nextIndex = findContinuousReviewIndex(direction, state.continuousReview.currentIndex);
    if (nextIndex < 0 || nextIndex === state.continuousReview.currentIndex) {
      showEvaluationMessage('info', '目前沒有其他尚待處理的連續簽核項目。');
      return;
    }
    saveLocalDraft();
    closeEvaluation({ saveDraft: false });
    await openContinuousReviewAtIndex(nextIndex);
  }

  async function skipCurrentContinuousReviewItem() {
    if (!state.continuousReview || !state.continuousReview.active || state.isSubmitting) return;
    var review = state.continuousReview;
    var current = review.queue[review.currentIndex];
    if (current && current.status === 'pending') {
      current.status = 'skipped';
      review.skippedCount += 1;
    }
    closeEvaluation({ saveDraft: true });
    var nextIndex = findContinuousReviewIndex(1, review.currentIndex);
    if (nextIndex < 0) {
      await finishContinuousReviewSession();
      return;
    }
    await openContinuousReviewAtIndex(nextIndex);
  }

  async function openNextContinuousReviewItem(startIndex) {
    if (!state.continuousReview || !state.continuousReview.active) return;
    var review = state.continuousReview;
    var queue = review.queue || [];
    var initial = Number(startIndex);
    if (!isFinite(initial)) initial = review.currentIndex;
    var attempts = 0;
    while (attempts < queue.length) {
      var index;
      if (review.currentIndex < 0 && attempts === 0 && initial >= 0 && queue[initial] && queue[initial].status === 'pending') {
        index = initial;
      } else {
        index = findContinuousReviewIndex(1, attempts === 0 ? initial - 1 : review.currentIndex);
      }
      if (index < 0) break;
      var opened = await openContinuousReviewAtIndex(index);
      if (opened) return;
      var unavailable = queue[index];
      if (unavailable && unavailable.status === 'pending') {
        unavailable.status = 'skipped';
        review.skippedCount += 1;
      }
      attempts += 1;
    }
    await finishContinuousReviewSession();
  }

  async function openContinuousReviewAtIndex(index) {
    var review = state.continuousReview || {};
    var item = review.queue && review.queue[index];
    if (!review.active || !item || item.status !== 'pending') return false;
    review.currentIndex = index;
    var opened = await openEvaluation(item.evaluationNo, { fromContinuous: true });
    renderContinuousReviewBar();
    return opened;
  }

  function renderContinuousReviewBar() {
    if (!elements.continuousReviewBar) return;
    var review = state.continuousReview || {};
    if (!review.active) {
      elements.continuousReviewBar.hidden = true;
      return;
    }
    var queue = Array.isArray(review.queue) ? review.queue : [];
    var current = queue[review.currentIndex] || {};
    var pendingCount = getContinuousPendingIndices().length;
    elements.continuousReviewBar.hidden = false;
    elements.continuousReviewProgress.textContent = '第' + Math.max(1, review.currentIndex + 1) + '張／共' + queue.length + '張' +
      (current.employeeName ? '｜' + current.employeeName : '');
    elements.continuousReviewSummary.textContent = '已完成' + Number(review.completedCount || 0) + '張｜略過' +
      Number(review.skippedCount || 0) + '張｜尚待' + pendingCount + '張。每張仍須個別確認與送出。';
    var hasOther = pendingCount > 1;
    elements.continuousReviewPreviousButton.disabled = !hasOther || state.isSubmitting;
    elements.continuousReviewNextButton.disabled = !hasOther || state.isSubmitting;
    elements.continuousReviewSkipButton.disabled = !current.evaluationNo || current.status !== 'pending' || state.isSubmitting;
    elements.continuousReviewEndButton.disabled = state.isSubmitting;
  }

  function markContinuousReviewCompleted(evaluationNo) {
    var review = state.continuousReview || {};
    var queue = Array.isArray(review.queue) ? review.queue : [];
    queue.forEach(function(item) {
      if (item && item.status === 'pending' && String(item.evaluationNo || '') === String(evaluationNo || '')) {
        item.status = 'completed';
        review.completedCount += 1;
      }
    });
  }

  async function finishContinuousReviewSession() {
    var review = state.continuousReview || {};
    var completed = Number(review.completedCount || 0);
    var skipped = Number(review.skippedCount || 0);
    resetContinuousReviewState(false);
    closeEvaluation({ saveDraft: false });
    renderPending();
    setDashboardMessage('success', '連續簽核已完成：完成' + completed + '張，略過' + skipped + '張。略過項目仍保留在待辦中。');
    scheduleTargetedReconciliationV3({ pending: true, progress: true, delayMs: 1200 });
  }

  async function openEvaluation(evaluationNo, options) {
    var settings = options || {};
    if (isPendingMutationLocked(evaluationNo)) {
      showGlobalNotice('processing', '正在確認送出結果', '這張考核表剛完成送出，系統正在同步最新流程，暫時不可用舊卡片重新開啟。', false);
      return false;
    }
    clearDraftTimers();
    state.currentDetail = null;
    state.currentAction = '';
    state.signatureController = null;
    state.draftLoaded = false;
    elements.evaluationOverlay.hidden = false;
    document.body.classList.add('is-locked');
    if (settings.fromContinuous) renderContinuousReviewBar();
    elements.evaluationLoading.hidden = false;
    elements.evaluationContent.hidden = true;
    clearEvaluationMessage();
    try {
      var result = await window.V3WorkflowService.getEvaluation(evaluationNo);
      state.currentDetail = result.data || {};
      renderEvaluationDetail();
      elements.evaluationContent.hidden = false;
      renderContinuousReviewBar();
      return true;
    } catch (error) {
      showEvaluationMessage('error', friendlyError(error));
      return false;
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
    if (elements.continuousReviewBar) elements.continuousReviewBar.hidden = true;
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
    if (canShowForceClose(record) && actions.indexOf('force_close') === -1) actions.push('force_close');
    if (!actions.length) {
      elements.actionPanel.hidden = true;
      return;
    }
    elements.actionPanel.hidden = false;
    elements.actionSelector.innerHTML = actions.map(function (action) {
      return '<option value="' + escapeHtml(action) + '">' + escapeHtml(getActionLabelUi(record, action)) + '</option>';
    }).join('');
    renderSelectedAction(actions[0]);
  }

  function canShowForceClose(record) {
    if (!isEducationPdfManagerUi()) return false;
    var status = String(record && record['流程狀態'] || '').trim();
    return ['例外結案待PDF', 'PDF待處理', 'PDF處理中', 'PDF處理失敗', '結案', '作廢'].indexOf(status) === -1;
  }

  function getActionLabelUi(record, action) {
    if (action === 'force_close') return '特殊權限：強制結案';
    if (action === 'force_transition') return '特殊權限：強制轉單／流轉';
    return window.V3EvaluationForm.getActionLabel(record || {}, action) || action || '送出';
  }

  function getSubmitButtonLabelUi(record, action) {
    var label = getActionLabelUi(record || {}, action);
    if (state.continuousReview && state.continuousReview.active && isContinuousReviewEligibleUi() &&
        action !== 'force_close' && action !== 'force_transition') {
      return label + '並開啟下一張';
    }
    return label;
  }

  async function renderSelectedAction(action) {
    clearDraftTimers();
    state.currentAction = action;
    state.signatureController = null;
    state.draftLoaded = false;
    state.forceClosePreview = null;
    elements.saveDraftButton.hidden = action === 'force_close';
    elements.draftStatus.textContent = action === 'force_close' ? '強制結案不建立草稿' : '尚未儲存草稿';
    elements.submitEvaluationButton.querySelector('.button-label').textContent = getSubmitButtonLabelUi(state.currentDetail || {}, action);

    if (action === 'force_close') {
      await renderForceCloseAction();
      return;
    }

    elements.submitEvaluationButton.disabled = false;
    elements.evaluationActionForm.innerHTML = window.V3EvaluationForm.renderActionForm(state.currentDetail || {}, action);
    window.V3EvaluationForm.initializeInteractiveControls(elements.evaluationActionForm);
    initializeSignatureIfNeeded();
    await loadDraftForCurrentAction();
    window.V3EvaluationForm.refreshInteractiveControls(elements.evaluationActionForm);
  }

  async function renderForceCloseAction() {
    var record = state.currentDetail || {};
    elements.evaluationActionForm.innerHTML = '<section class="detail-section"><h3>特殊權限：強制結案</h3>' +
      '<p class="section-help">正在檢查目前流程與尚未完成的簽核階段…</p></section>';
    elements.submitEvaluationButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.forceClosePreview(record['考核單號']);
      if (state.currentAction !== 'force_close' || !state.currentDetail ||
          String(state.currentDetail['考核單號'] || '') !== String(record['考核單號'] || '')) return;
      state.forceClosePreview = result.data || {};
      var preview = state.forceClosePreview;
      var skipped = Array.isArray(preview.skippedStages) ? preview.skippedStages : [];
      elements.evaluationActionForm.innerHTML = '<section class="detail-section"><h3>特殊權限：強制結案</h3>' +
        '<div class="admin-result-grid">' +
          metaItem('考核單號', preview.evaluationNo) +
          metaItem('受評人員', joinText(preview.employeeId, preview.employeeName)) +
          metaItem('目前階段', preview.currentStatus) +
          metaItem('強制結案後', preview.targetStatus || '例外結案待PDF') +
        '</div>' +
        '<div class="preview-alert-list preview-alert-list--error"><strong>此為特殊權限，請確認後果</strong><ul>' +
          '<li>尚未完成的階段將維持未簽核，不補假簽名、評語或分數。</li>' +
          '<li>系統會保留已完成內容，並建立例外結案PDF與完整稽核紀錄。</li>' +
          '<li>將被略過的階段：' + escapeHtml(skipped.length ? skipped.join('、') : '無') + '</li>' +
        '</ul></div>' +
        '<label class="field-group"><span>強制結案原因 <strong aria-hidden="true">*</strong></span>' +
          '<textarea name="forceCloseReason" rows="4" maxlength="1000" required placeholder="請具體說明為何需要在目前階段強制結案"></textarea></label>' +
        '<label class="confirm-row"><input name="forceCloseConfirmed" type="checkbox" required>' +
          '<span>我已確認未完成階段將不再簽核，且本次操作會留下完整管理紀錄。</span></label>' +
        '<label class="field-group"><span>最終確認文字 <strong aria-hidden="true">*</strong></span>' +
          '<input name="forceCloseText" type="text" maxlength="20" autocomplete="off" required placeholder="請輸入：' + escapeHtml(preview.confirmationText || '強制結案') + '">' +
          '<small>請完整輸入「' + escapeHtml(preview.confirmationText || '強制結案') + '」。</small></label>' +
      '</section>';
      elements.submitEvaluationButton.disabled = false;
    } catch (error) {
      if (state.currentAction !== 'force_close') return;
      state.forceClosePreview = null;
      elements.evaluationActionForm.innerHTML = '<section class="detail-section"><h3>特殊權限：強制結案</h3>' +
        '<div class="form-message form-message--error">' + escapeHtml(friendlyError(error)) + '</div></section>';
      elements.submitEvaluationButton.disabled = true;
    }
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
    if (!state.currentDetail || state.currentAction === 'force_close') return;
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
    if (state.currentAction === 'force_close' || !state.draftLoaded || !state.currentDetail || !state.currentAction) return;
    window.clearTimeout(state.draftTimer);
    window.clearTimeout(state.draftServerTimer);
    state.draftTimer = window.setTimeout(saveLocalDraft, 400);
    state.draftServerTimer = window.setTimeout(function () { saveCurrentDraft(false); }, 15000);
    elements.draftStatus.textContent = '內容已變更，準備自動儲存…';
  }

  function saveLocalDraft() {
    if (state.currentAction === 'force_close' || !state.currentDetail || !state.currentAction || !elements.evaluationActionForm || state.isSubmitting) return;
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
    if (state.currentAction === 'force_close' || !state.currentDetail || !state.currentAction) return;
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

    var evaluationNo = state.currentDetail['考核單號'];
    var action = state.currentAction;
    var version = Number(state.currentDetail.dataVersion || 0);
    var workflowStatus = String(state.currentDetail['流程狀態'] || '');
    var payload;
    var label = getActionLabelUi(state.currentDetail || {}, action);

    if (action === 'force_close') {
      var preview = state.forceClosePreview || {};
      if (!preview.evaluationNo || String(preview.evaluationNo) !== String(evaluationNo)) {
        showGlobalNotice('error', '強制結案預覽已失效', '請重新選擇「特殊權限：強制結案」，確認最新流程狀態。');
        return;
      }
      var reasonField = form.querySelector('[name="forceCloseReason"]');
      var confirmedField = form.querySelector('[name="forceCloseConfirmed"]');
      var textField = form.querySelector('[name="forceCloseText"]');
      var reason = String(reasonField && reasonField.value || '').trim();
      var confirmationText = String(textField && textField.value || '').trim();
      var expectedText = String(preview.confirmationText || '強制結案');
      if (!reason) {
        showGlobalNotice('error', '資料尚未完成', '請填寫強制結案原因。');
        return;
      }
      if (!confirmedField || !confirmedField.checked) {
        showGlobalNotice('error', '尚未完成二次確認', '請勾選強制結案確認聲明。');
        return;
      }
      if (confirmationText !== expectedText) {
        showGlobalNotice('error', '確認文字不正確', '請完整輸入「' + expectedText + '」。');
        return;
      }
      payload = {
        evaluationNo: evaluationNo,
        expectedVersion: version,
        reason: reason,
        secondConfirmed: true,
        confirmationText: confirmationText
      };
      var skippedText = Array.isArray(preview.skippedStages) && preview.skippedStages.length
        ? preview.skippedStages.join('、')
        : '無';
      if (!window.confirm('確定執行「特殊權限：強制結案」嗎？\n\n將略過：' + skippedText +
        '\n未完成階段不會補簽名、評語或分數，並會建立例外結案PDF紀錄。')) return;
    } else {
      try {
        payload = window.V3EvaluationForm.collectActionPayload(form, action, state.signatureController);
      } catch (error) {
        showGlobalNotice('error', '資料尚未完成', error.message || '請確認填寫內容。');
        return;
      }
      payload.evaluationNo = evaluationNo;
      payload.expectedVersion = version;
      var continuousNote = state.continuousReview && state.continuousReview.active ? '\n\n連續簽核：成功後會自動開啟下一張待辦。' : '';
      if (!window.confirm('確定要「' + label + '」嗎？\n\n送出後將進入下一個流程階段。' + continuousNote)) return;
    }

    var requestId = window.V3ApiClient.createRequestId();
    lockPendingMutation(evaluationNo, 120000);
    state.isSubmitting = true;
    elements.closeEvaluationButton.disabled = true;
    setButtonLoading(elements.submitEvaluationButton, true, '處理中，請勿重複點擊');
    try {
      if (action === 'force_close') {
        await window.V3WorkflowService.forceCloseEvaluation(payload, requestId);
      } else if (action === 'force_transition') {
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
          resetContinuousReviewState(false);
          closeEvaluation({ saveDraft: false });
          await refreshAllAccessibleLists();
          showGlobalNotice('warning', '表單已更新', '此考核表在送出期間已發生更新。連續簽核已暫停，請重新開啟表單確認最新狀態。');
          resetSubmissionUi(label);
          return;
        }
        resetContinuousReviewState(false);
        closeEvaluation({ saveDraft: false });
        await refreshAllAccessibleLists();
        showGlobalNotice('warning', '送出結果仍在同步', '系統已暫時鎖定這張考核表，連續簽核已暫停。請等待約10秒後重新整理並確認最新流程。');
        window.setTimeout(function () { refreshAllAccessibleLists(); }, 10000);
      } else if (error && (error.code === 'VERSION_CONFLICT' || error.code === 'DUPLICATE_REQUEST')) {
        releasePendingMutation(evaluationNo);
        resetContinuousReviewState(false);
        await refreshAllAccessibleLists();
        showGlobalNotice('warning', '表單已更新', friendlyError(error) + ' 連續簽核已暫停。');
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
    removePendingItemLocallyV3(evaluationNo);

    if (state.continuousReview && state.continuousReview.active && isContinuousReviewEligibleUi()) {
      markContinuousReviewCompleted(evaluationNo);
      var completedIndex = Number(state.continuousReview.currentIndex || 0);
      closeEvaluation({ saveDraft: false });
      releasePendingMutation(evaluationNo);
      setDashboardMessage('success', label + '完成，正在開啟下一張待辦。');
      resetSubmissionUi(label);
      scheduleTargetedReconciliationV3({ pending: true, progress: true, delayMs: 1800 });
      var nextIndex = findContinuousReviewIndex(1, completedIndex);
      if (nextIndex < 0) {
        await finishContinuousReviewSession();
        return;
      }
      await openContinuousReviewAtIndex(nextIndex);
      return;
    }

    closeEvaluation({ saveDraft: false });
    releasePendingMutation(evaluationNo);
    setDashboardMessage('success', label + '完成，流程已更新。');
    resetSubmissionUi(label);
    scheduleTargetedReconciliationV3({ pending: true, progress: true, delayMs: 1500 });
  }

  function resetSubmissionUi(label) {
    state.isSubmitting = false;
    elements.closeEvaluationButton.disabled = false;
    var buttonLabel = state.currentDetail && state.currentAction
      ? getSubmitButtonLabelUi(state.currentDetail, state.currentAction)
      : (label || '送出');
    setButtonLoading(elements.submitEvaluationButton, false, buttonLabel);
    renderContinuousReviewBar();
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

  function updatePendingSummaryLocallyV3(summary) {
    if (!summary || !summary.evaluationNo) return;
    var found = false;
    state.pending = state.pending.map(function(item) {
      if (String(item.evaluationNo || '') !== String(summary.evaluationNo || '')) return item;
      found = true;
      return Object.assign({}, item, summary);
    });
    if (!found) state.pending.unshift(summary);
    state.pendingRenderSignature = createListRenderSignature(state.pending, { total: state.pending.length });
    elements.pendingCountBadge.textContent = String(state.pending.length);
    renderPending();
  }

  function removePendingItemLocallyV3(evaluationNo) {
    var key = String(evaluationNo || '').trim();
    if (!key) return;
    state.pending = state.pending.filter(function(item) {
      return String(item.evaluationNo || '').trim() !== key;
    });
    state.pendingRenderSignature = createListRenderSignature(state.pending, { total: state.pending.length });
    elements.pendingCountBadge.textContent = String(state.pending.length);
    renderPending();
  }

  function scheduleTargetedReconciliationV3(options) {
    var settings = options || {};
    if (state.backgroundSyncTimer) window.clearTimeout(state.backgroundSyncTimer);
    state.backgroundSyncTimer = window.setTimeout(function() {
      state.backgroundSyncTimer = null;
      var run = function() {
        var jobs = [];
        if (settings.pending !== false) jobs.push(loadPending({ quiet: true }));
        if (settings.progress && (!elements.progressPanel.hidden || state.progress.length)) jobs.push(loadProgress({ quiet: true }));
        if (settings.dispatch && elements.dispatchManagementCard) jobs.push(loadDispatchManagementCenter({ quiet: true }));
        Promise.allSettled(jobs).catch(function() {});
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 3000 });
      } else {
        run();
      }
    }, Number(settings.delayMs || 1800));
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
    var evaluationNo = String(state.currentDetail['考核單號'] || '').trim();
    var startedAt = performanceNowV3();
    elements.claimButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.claim(evaluationNo, state.currentDetail.dataVersion);
      var data = result.data || {};
      if (data.detail) {
        state.currentDetail = data.detail;
      } else {
        // 舊後端相容：只有在尚未更新後端時才回退到單張重新讀取。
        await reloadCurrentEvaluation();
      }
      if (data.summary) updatePendingSummaryLocallyV3(data.summary);
      else renderPending();
      renderEvaluationDetail();
      showEvaluationMessage('success', '已成功領取月考核表，可直接開始填寫。');
      scheduleTargetedReconciliationV3({ pending: true, progress: true, delayMs: 2200 });
      console.info('[V3 CLAIM] 領取至可編輯耗時：' + Math.max(0, Math.round(performanceNowV3() - startedAt)) + 'ms');
    } catch (error) {
      showEvaluationMessage('error', friendlyError(error));
      if (error && (error.code === 'ALREADY_CLAIMED' || error.code === 'VERSION_CONFLICT')) {
        scheduleTargetedReconciliationV3({ pending: true, progress: true, delayMs: 0 });
      }
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
  function routeRowHtml(label, person) {
    var item = person || {};
    return '<div class="route-row"><span>' + escapeHtml(label) + '</span><strong>' +
      escapeHtml(joinText(item.employeeId, item.employeeName) || '尚未判定') + '</strong><small>' +
      escapeHtml(item.source || item.role || '') + '</small></div>';
  }
  function personLabelForMonthlyDispatch(person) {
    var item = person || {};
    var label = joinText(item.employeeId, item.employeeName);
    if (label) return label;
    if (Number(item.memberCount || 0) > 0) {
      return String(item.role || '共同待辦') + '（' + Number(item.memberCount || 0) + '人）';
    }
    return '';
  }
  async function loadAccountManagementCenter(options) {
    var settings = options || {};
    if (!elements.accountManagementCard || state.accountManagementLoading) return;
    state.accountManagementLoading = true;
    setButtonLoading(elements.accountManagementSearchButton, true, '查詢中');
    elements.accountManagementRefreshButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.accountManagementCenter({
        keyword: String(elements.accountManagementKeyword.value || '').trim(),
        role: String(elements.accountManagementRole.value || ''),
        employmentStatus: String(elements.accountManagementEmployment.value || ''),
        accountStatus: String(elements.accountManagementStatus.value || ''),
        page: state.accountManagementPage,
        pageSize: 50
      });
      state.accountManagement = result.data || {};
      state.accountManagementPage = Number(state.accountManagement.page || 1);
      renderAccountManagementCenter(state.accountManagement);
      if (!settings.quiet) showAccountManagementMessage('success', '帳號資料已更新。');
    } catch (error) {
      showAccountManagementMessage('error', friendlyError(error));
      if (!settings.quiet) elements.accountManagementList.innerHTML = emptyStateHtml('帳號資料讀取失敗', friendlyError(error));
    } finally {
      state.accountManagementLoading = false;
      setButtonLoading(elements.accountManagementSearchButton, false, '查詢帳號');
      elements.accountManagementRefreshButton.disabled = false;
    }
  }

  function renderAccountManagementCenter(data) {
    var summary = data.summary || {};
    var filtered = data.filteredSummary || {};
    elements.accountManagementSummary.innerHTML = '<div class="admin-result-grid">' +
      metaItem('全部帳號', summary.total || 0) +
      metaItem('目前可登入', summary.loginReady || 0) +
      metaItem('已啟用', summary.enabled || 0) +
      metaItem('已停用', summary.disabled || 0) +
      metaItem('暫時鎖定', summary.locked || 0) +
      metaItem('符合篩選', filtered.total || 0) + '</div>';

    var options = data.options || {};
    setSelectOptionsPreserveValue(elements.accountManagementRole, [{ value: '', label: '全部角色' }].concat((options.roles || []).map(function (value) { return { value: value, label: value }; })));
    setSelectOptionsPreserveValue(elements.accountManagementEmployment, [{ value: '', label: '全部狀態' }].concat((options.employmentStatuses || []).map(function (value) { return { value: value, label: value }; })));

    var rows = Array.isArray(data.items) ? data.items : [];
    if (!rows.length) {
      elements.accountManagementList.innerHTML = emptyStateHtml('查無符合條件的帳號', '請調整查詢條件後重試。');
    } else {
      elements.accountManagementList.innerHTML = '<div class="route-list">' + rows.map(renderAccountManagementRowV3).join('') + '</div>';
      Array.prototype.slice.call(elements.accountManagementList.querySelectorAll('[data-account-action]')).forEach(function (button) {
        button.addEventListener('click', function () {
          openAccountActionPanel(button.getAttribute('data-account-action'), button.getAttribute('data-account-employee'));
        });
      });
    }

    var page = Number(data.page || 1);
    var totalPages = Number(data.totalPages || 1);
    elements.accountManagementPageText.textContent = '第' + page + '頁／共' + totalPages + '頁（' + Number(data.totalMatched || 0) + '人）';
    elements.accountManagementPreviousButton.disabled = page <= 1;
    elements.accountManagementNextButton.disabled = page >= totalPages;
    renderAccountAuditListV3(data.recentAudit || []);
  }

  function renderAccountManagementRowV3(item) {
    var actions = item.actions || {};
    var tags = [
      '<span class="tag' + (item.accountStatus === '啟用' ? ' tag--success' : item.accountStatus === '鎖定' ? ' tag--danger' : ' tag--warning') + '">' + escapeHtml(item.accountStatus || '未設定') + '</span>',
      '<span class="tag">' + escapeHtml(item.employmentStatus || '未設定') + '</span>',
      '<span class="tag' + (item.canLogin ? ' tag--success' : ' tag--danger') + '">' + (item.canLogin ? '可登入' : '不可登入') + '</span>'
    ];
    if (!item.passwordConfigured) tags.push('<span class="tag tag--danger">密碼格式異常</span>');
    if (item.temporaryLockActive) tags.push('<span class="tag tag--danger">剩餘約' + escapeHtml(item.lockRemainingMinutes || 1) + '分鐘</span>');
    if (item.temporaryLockExpired) tags.push('<span class="tag tag--warning">鎖定已到期</span>');
    if (item.isSelf) tags.push('<span class="tag">目前帳號</span>');

    var buttons = [];
    if (actions.canUnlock) buttons.push(accountActionButtonHtmlV3('unlock', item.employeeId, '解除鎖定／清除失敗次數'));
    if (actions.canEnable) buttons.push(accountActionButtonHtmlV3('enable', item.employeeId, '啟用帳號'));
    if (actions.canDisable) buttons.push(accountActionButtonHtmlV3('disable', item.employeeId, '停用帳號'));
    if (actions.canForceLogout) buttons.push(accountActionButtonHtmlV3('forceLogout', item.employeeId, '強制登出'));
    if (!buttons.length) buttons.push('<button class="secondary-button secondary-button--small" type="button" disabled>無可用操作</button>');

    var lockText = item.lockedAt || '—';
    var unlockText = item.lockExpiresAt || '—';
    var remainingText = item.temporaryLockActive ? '約' + String(item.lockRemainingMinutes || 1) + '分鐘' : '—';
    return '<article class="evaluation-card"><div class="evaluation-card__top"><div><h3>' + escapeHtml(item.employeeName || '未命名') + '</h3>' +
      '<p>員工工號：' + escapeHtml(item.employeeId || '') + '</p></div><div>' + tags.join('') + '</div></div>' +
      '<div class="evaluation-card__meta">' +
        metaItem('系統角色', item.role || '未設定') + metaItem('部門／區域', joinText(item.department, item.area)) +
        metaItem('店別', joinStore(item.storeCode, item.storeName)) + metaItem('目前可登入', item.canLogin ? '是' : '否') +
        metaItem('異常原因', item.issueReason || '無') + metaItem('登入失敗次數', String(item.failedAttempts || 0) + '次') +
        metaItem('鎖定時間', lockText) + metaItem('預計解除時間', unlockText) +
        metaItem('剩餘鎖定時間', remainingText) + metaItem('密碼狀態', item.passwordConfigured ? '有效4碼' : '格式異常／未設定') +
        metaItem('最後登入', item.lastLoginAt || '尚無紀錄') + metaItem('密碼最後更新', item.passwordUpdatedAt || '尚無紀錄') +
        metaItem('密碼更新人員', item.passwordUpdatedBy || '尚無紀錄') +
      '</div><div class="evaluation-card__actions">' + buttons.join('') + '</div></article>';
  }

  function accountActionButtonHtmlV3(action, employeeId, label) {
    return '<button class="secondary-button secondary-button--small" type="button" data-account-action="' + escapeHtml(action) + '" data-account-employee="' + escapeHtml(employeeId) + '">' + escapeHtml(label) + '</button>';
  }

  function openAccountActionPanel(action, employeeId) {
    var data = state.accountManagement || {};
    var item = (data.items || []).filter(function (row) { return String(row.employeeId || '') === String(employeeId || ''); })[0];
    if (!item) return;
    var map = {
      unlock: { label: '解除鎖定', description: '清除登入失敗次數與鎖定時間；若為暫時鎖定，帳號恢復啟用並撤銷舊登入。' },
      enable: { label: '啟用帳號', description: '恢復帳號登入資格並撤銷舊登入；原登入失敗次數與鎖定時間不會被清除。' },
      disable: { label: '停用帳號', description: '停止後續登入並撤銷此人員目前所有登入狀態；原登入失敗次數與鎖定時間不會被清除。' },
      forceLogout: { label: '強制登出', description: '不改變帳號狀態，只撤銷此人員目前所有裝置登入。' }
    };
    var config = map[action];
    if (!config) return;
    state.accountAction = { action: action, employeeId: item.employeeId, employeeName: item.employeeName, confirmText: config.label };
    elements.accountActionContent.innerHTML = '<h4>' + escapeHtml(config.label) + '｜' + escapeHtml(item.employeeId + ' ' + item.employeeName) + '</h4><p class="section-help">' + escapeHtml(config.description) + '</p>';
    elements.accountActionReason.value = '';
    elements.accountActionConfirm.checked = false;
    elements.accountActionConfirmText.value = '';
    elements.accountActionConfirmText.placeholder = '請輸入：' + config.label;
    elements.accountActionConfirmHint.textContent = '請完整輸入「' + config.label + '」';
    elements.accountActionConfirmLabel.textContent = '我已確認此次「' + config.label + '」的影響範圍。';
    elements.accountActionResult.hidden = true;
    elements.accountActionPanel.hidden = false;
    updateAccountActionRunState();
    elements.accountActionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeAccountActionPanel() {
    state.accountAction = null;
    if (!elements.accountActionPanel) return;
    elements.accountActionPanel.hidden = true;
    elements.accountActionReason.value = '';
    elements.accountActionConfirm.checked = false;
    elements.accountActionConfirmText.value = '';
    elements.accountActionResult.hidden = true;
  }

  function updateAccountActionRunState() {
    if (!elements.accountActionRunButton) return;
    var action = state.accountAction;
    var ready = Boolean(action) && String(elements.accountActionReason.value || '').trim().length >= 4 &&
      elements.accountActionConfirm.checked && String(elements.accountActionConfirmText.value || '').trim() === String(action && action.confirmText || '');
    elements.accountActionRunButton.disabled = !ready || state.accountManagementLoading;
  }

  async function runAccountManagementAction() {
    var action = state.accountAction;
    if (!action || state.accountManagementLoading) return;
    updateAccountActionRunState();
    if (elements.accountActionRunButton.disabled) return;
    state.accountManagementLoading = true;
    setButtonLoading(elements.accountActionRunButton, true, '執行中');
    try {
      var payload = {
        employeeId: action.employeeId,
        reason: String(elements.accountActionReason.value || '').trim(),
        confirmed: true,
        confirmText: String(elements.accountActionConfirmText.value || '').trim()
      };
      var service;
      if (action.action === 'unlock') service = window.V3WorkflowService.accountUnlock;
      else if (action.action === 'enable') { service = window.V3WorkflowService.accountSetStatus; payload.newStatus = '啟用'; }
      else if (action.action === 'disable') { service = window.V3WorkflowService.accountSetStatus; payload.newStatus = '停用'; }
      else if (action.action === 'forceLogout') service = window.V3WorkflowService.accountForceLogout;
      if (!service) throw new Error('無法辨識帳號管理操作。');
      var result = await service(payload, window.V3ApiClient.createRequestId());
      var data = result.data || {};
      elements.accountActionResult.innerHTML = '<h4>操作完成</h4><p>' + escapeHtml(data.message || '帳號資料已更新。') + '</p>';
      elements.accountActionResult.hidden = false;
      showAccountManagementMessage('success', data.message || '帳號資料已更新。');
      state.accountAction = null;
      state.accountManagementLoading = false;
      await loadAccountManagementCenter({ quiet: true });
      closeAccountActionPanel();
    } catch (error) {
      elements.accountActionResult.innerHTML = '<h4>操作失敗</h4><p>' + escapeHtml(friendlyError(error)) + '</p>';
      elements.accountActionResult.hidden = false;
      showAccountManagementMessage('error', friendlyError(error));
    } finally {
      state.accountManagementLoading = false;
      setButtonLoading(elements.accountActionRunButton, false, '執行');
      updateAccountActionRunState();
    }
  }

  async function lookupAccountCredentialV3_(employeeId) {
    if (state.accountManagementLoading) return;
    var query = String(elements.accountCredentialLookupQuery.value || '').trim();
    if (!query && !employeeId) {
      showMessage(elements.accountCredentialLookupMessage, 'error', '請輸入員工姓名或工號。');
      elements.accountCredentialLookupQuery.focus();
      return;
    }
    state.accountManagementLoading = true;
    setButtonLoading(elements.accountCredentialLookupButton, true, '查詢中');
    elements.accountCredentialClearButton.disabled = true;
    clearMessage(elements.accountCredentialLookupMessage);
    try {
      var result = await window.V3WorkflowService.accountCredentialLookup(query, employeeId || '', window.V3ApiClient.createRequestId());
      state.accountCredentialLookup = result.data || {};
      renderAccountCredentialLookupV3_(state.accountCredentialLookup);
    } catch (error) {
      state.accountCredentialLookup = null;
      elements.accountCredentialLookupResult.hidden = true;
      elements.accountCredentialLookupResult.innerHTML = '';
      showMessage(elements.accountCredentialLookupMessage, 'error', friendlyError(error));
    } finally {
      state.accountManagementLoading = false;
      setButtonLoading(elements.accountCredentialLookupButton, false, '查詢帳密');
      elements.accountCredentialClearButton.disabled = false;
    }
  }

  function renderAccountCredentialLookupV3_(data) {
    var result = elements.accountCredentialLookupResult;
    result.hidden = false;
    if (data.resolved && data.credential) {
      var item = data.credential;
      result.innerHTML = '<article class="credential-result-card">' +
        '<div><span>員工</span><strong>' + escapeHtml(joinText(item.employeeId, item.employeeName)) + '</strong></div>' +
        '<div><span>角色／店別</span><strong>' + escapeHtml(joinText(item.role, joinStore(item.storeCode, item.storeName))) + '</strong></div>' +
        '<div><span>帳號狀態</span><strong>' + escapeHtml(joinText(item.employmentStatus, item.accountStatus)) + '</strong></div>' +
        '<div class="credential-password-box"><span>目前登入密碼</span><strong>' + escapeHtml(item.password || '未設定') + '</strong>' +
          '<small>' + (item.passwordValid ? '有效4碼密碼' : '目前內容不是有效4碼密碼，請至員工主檔修正') + '</small></div>' +
      '</article>';
      showMessage(elements.accountCredentialLookupMessage, item.passwordValid ? 'success' : 'error', item.passwordValid ? '帳密查詢完成。' : '已找到人員，但密碼格式異常。');
      return;
    }

    var candidates = Array.isArray(data.candidates) ? data.candidates : [];
    result.innerHTML = '<p class="section-help">' + escapeHtml(data.message || '請選擇正確人員。') + '</p><div class="credential-candidate-list">' +
      candidates.map(function (item) {
        return '<button type="button" class="credential-candidate" data-credential-employee="' + escapeHtml(item.employeeId) + '">' +
          '<strong>' + escapeHtml(joinText(item.employeeId, item.employeeName)) + '</strong>' +
          '<span>' + escapeHtml(joinText(item.role, joinStore(item.storeCode, item.storeName))) + '</span>' +
          '<small>' + escapeHtml(joinText(item.employmentStatus, item.accountStatus)) + '</small></button>';
      }).join('') + '</div>' + (data.hasMore ? '<p class="section-help">符合人員超過20位，請輸入更完整的姓名或工號。</p>' : '');
    Array.prototype.slice.call(result.querySelectorAll('[data-credential-employee]')).forEach(function (button) {
      button.addEventListener('click', function () { lookupAccountCredentialV3_(button.getAttribute('data-credential-employee')); });
    });
    showMessage(elements.accountCredentialLookupMessage, 'info', '找到多位符合人員，請選擇正確人員。');
  }

  function clearAccountCredentialLookupV3_() {
    state.accountCredentialLookup = null;
    elements.accountCredentialLookupQuery.value = '';
    elements.accountCredentialLookupResult.innerHTML = '';
    elements.accountCredentialLookupResult.hidden = true;
    clearMessage(elements.accountCredentialLookupMessage);
    elements.accountCredentialLookupQuery.focus();
  }

  function renderAccountAuditListV3(rows) {
    if (!elements.accountAuditList) return;
    if (!rows.length) {
      elements.accountAuditList.innerHTML = '<p class="section-help">尚無帳號操作紀錄。</p>';
      return;
    }
    elements.accountAuditList.innerHTML = '<div class="route-list">' + rows.map(function (row) {
      return '<div class="route-row"><span>' + escapeHtml(row.action || '未標示操作') + '</span><strong>' + escapeHtml(joinText(row.targetEmployeeId, row.targetEmployeeName)) +
        '</strong><small>' + escapeHtml(row.actionTime || '') + '｜操作人：' + escapeHtml(joinText(row.operatorEmployeeId, row.operatorName)) +
        '｜原因：' + escapeHtml(row.reason || '未填寫') + '</small></div>';
    }).join('') + '</div>';
  }

  function showAccountManagementMessage(type, text) {
    showMessage(elements.accountManagementMessage, type, text);
  }

  async function loadDispatchManagementCenter(options) {
    if (!elements.dispatchManagementCard || state.dispatchManagementLoading) return;
    var settings = options || {};
    state.dispatchManagementLoading = true;
    if (!settings.quiet) showDispatchManagementMessage('info', '正在整理派發狀態與異常分類…');
    setButtonLoading(elements.dispatchManagementSearchButton, true, '查詢中');
    elements.dispatchManagementRefreshButton.disabled = true;
    try {
      var result = await window.V3WorkflowService.dispatchManagementCenter({
        evaluationMonth: String(elements.dispatchManagementMonth.value || currentRocMonthFirstDay()).trim(),
        keyword: String(elements.dispatchManagementKeyword.value || '').trim(),
        resultCategory: String(elements.dispatchManagementCategory.value || 'ALL'),
        storeCode: String(elements.dispatchManagementStore.value || ''),
        area: String(elements.dispatchManagementArea.value || ''),
        source: String(elements.dispatchManagementSource.value || '')
      });
      state.dispatchManagement = result.data || {};
      var loadedMonth = state.dispatchManagement.evaluationMonth || currentRocMonthFirstDay();
      if (state.dispatchManagementSelectionMonth && state.dispatchManagementSelectionMonth !== loadedMonth) {
        state.batchDispatchSelectedEmployees = {};
        state.batchDispatchRepairPreview = null;
        closeBatchDispatchRepairPanel();
        state.dispatchMonthAnalysis = null;
        if (elements.dispatchMonthAnalysisResult) elements.dispatchMonthAnalysisResult.hidden = true;
      }
      state.dispatchManagementSelectionMonth = loadedMonth;
      elements.dispatchManagementMonth.value = loadedMonth;
      renderDispatchManagementCenter(state.dispatchManagement);
      if (!settings.quiet) showDispatchManagementMessage('success', '派發管理資料已更新。');
    } catch (error) {
      showDispatchManagementMessage('error', friendlyError(error));
      if (!settings.quiet) elements.dispatchManagementPersons.innerHTML = emptyStateHtml('派發管理資料讀取失敗', friendlyError(error));
    } finally {
      state.dispatchManagementLoading = false;
      setButtonLoading(elements.dispatchManagementSearchButton, false, '查詢派發狀態');
      elements.dispatchManagementRefreshButton.disabled = false;
    }
  }

  function renderDispatchManagementCenter(data) {
    var summary = data.summary || {};
    var filtered = data.filteredSummary || summary;
    var schedule = data.schedule || {};
    elements.dispatchManagementSummary.innerHTML = '<div class="admin-result-grid">' +
      metaItem('應派發／有紀錄人數', summary.candidateCount) +
      metaItem('已建立R0', summary.createdCount) +
      metaItem('重複跳過', summary.duplicateCount) +
      metaItem('路線異常', summary.routeErrorCount) +
      metaItem('系統失敗', summary.failedCount) +
      metaItem('尚未派發', summary.unprocessedCount) +
      metaItem('主排程', Number(schedule.mainTriggerCount || 0) + '／1') +
      metaItem('安全補跑', Number(schedule.retryTriggerCount || 0) + '／2') +
      '</div><p class="section-help">' + escapeHtml(data.scopeNote || '') +
      (filtered.candidateCount !== summary.candidateCount ? '｜目前篩選顯示 ' + escapeHtml(filtered.candidateCount) + ' 人。' : '') + '</p>';
    updateDispatchManagementFilterOptions(data.filterOptions || {});
    renderDispatchManagementPersons(data.persons || [], Boolean(data.isCurrentMonth));
    updateBatchDispatchSelectionState(Boolean(data.isCurrentMonth));
    renderDispatchManagementAttempts(data.attempts || []);
  }

  function updateDispatchManagementFilterOptions(options) {
    setSelectOptionsPreserveValue(elements.dispatchManagementStore, [{ value: '', label: '全部店號' }].concat((options.stores || []).map(function (item) {
      return { value: item.code, label: joinStore(item.code, item.name) };
    })));
    setSelectOptionsPreserveValue(elements.dispatchManagementArea, [{ value: '', label: '全部區域' }].concat((options.areas || []).map(function (item) {
      return { value: item, label: item };
    })));
    setSelectOptionsPreserveValue(elements.dispatchManagementSource, [{ value: '', label: '全部來源' }].concat((options.sources || []).map(function (item) {
      return { value: item, label: item };
    })));
  }

  function setSelectOptionsPreserveValue(select, options) {
    if (!select) return;
    var current = String(select.value || '');
    select.innerHTML = options.map(function (item) {
      return '<option value="' + escapeHtml(item.value) + '">' + escapeHtml(item.label) + '</option>';
    }).join('');
    if (options.some(function (item) { return String(item.value) === current; })) select.value = current;
  }

  function renderDispatchManagementPersons(rows, isCurrentMonth) {
    if (!rows.length) {
      elements.dispatchManagementPersons.innerHTML = emptyStateHtml('查無符合條件的人員', '請調整月份或篩選條件後重新查詢。');
      updateBatchDispatchSelectionState(isCurrentMonth);
      return;
    }
    var monthTitle = rocMonthDisplayLabelV3(state.dispatchManagement && state.dispatchManagement.evaluationMonth || elements.dispatchManagementMonth.value || currentRocMonthFirstDay());
    elements.dispatchManagementPersons.innerHTML = '<h4>' + escapeHtml(monthTitle + '人員派發狀態') + '</h4><div class="route-list">' + rows.map(function (row) {
      var tone = dispatchCategoryTone(row.category);
      var actions = '';
      var batchControl = '';
      if (row.evaluationNo) {
        actions += '<button type="button" class="secondary-button secondary-button--small" data-open-evaluation="' + escapeHtml(row.evaluationNo) + '">查看月考核表</button>';
      }
      if (isCurrentMonth && row.canBatchSelect) {
        batchControl = '<label class="confirm-row"><input type="checkbox" data-batch-dispatch="' + escapeHtml(row.employeeId) + '"' +
          (state.batchDispatchSelectedEmployees[row.employeeId] ? ' checked' : '') + '><span>選取人工派發／補派</span></label>';
      }
      return '<div class="route-row"><span><span class="tag ' + tone + '">' + escapeHtml(dispatchCategoryLabel(row.category)) + '</span> ' +
        escapeHtml(joinStore(row.storeCode, row.storeName)) + '</span><strong>' +
        escapeHtml(joinText(row.employeeId, row.employeeName)) + (row.evaluationNo ? '｜' + escapeHtml(row.evaluationNo) : '') +
        '</strong><small>' + escapeHtml(row.reason || row.workflowStatus || '目前無異常') +
        (row.executionSource ? '<br>最近來源：' + escapeHtml(row.executionSource) + '｜' + escapeHtml(row.completedAt || '') : '') +
        '</small>' + batchControl + (actions ? '<div class="evaluation-card__actions">' + actions + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    bindEvaluationCards(elements.dispatchManagementPersons);
    Array.prototype.slice.call(elements.dispatchManagementPersons.querySelectorAll('[data-batch-dispatch]')).forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        var employeeId = checkbox.getAttribute('data-batch-dispatch');
        if (checkbox.checked) state.batchDispatchSelectedEmployees[employeeId] = true;
        else delete state.batchDispatchSelectedEmployees[employeeId];
        updateBatchDispatchSelectionState(isCurrentMonth);
      });
    });
  }

  function renderDispatchManagementAttempts(rows) {
    if (!rows.length) {
      elements.dispatchManagementAttempts.innerHTML = '<p class="section-help">本月份尚無派發嘗試紀錄。</p>';
      return;
    }
    elements.dispatchManagementAttempts.innerHTML = '<div class="route-list">' + rows.map(function (row) {
      return '<div class="route-row"><span><span class="tag ' + dispatchCategoryTone(row.category) + '">' +
        escapeHtml(dispatchCategoryLabel(row.category)) + '</span> ' + escapeHtml(row.executionSource || '未標示來源') +
        '</span><strong>' + escapeHtml(joinText(row.employeeId, row.employeeName)) +
        (row.evaluationNo ? '｜' + escapeHtml(row.evaluationNo) : '') + '</strong><small>' +
        escapeHtml(row.completedAt || '') + (row.batchId ? '｜批次 ' + escapeHtml(row.batchId) : '') +
        (row.reason ? '<br>' + escapeHtml(row.reason) : '') + '</small></div>';
    }).join('') + '</div>';
  }

  function rocMonthDisplayLabelV3(value) {
    var text = String(value || '').trim();
    var match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(text);
    if (!match) return text ? text + '｜' : '';
    return Number(match[1]) + '年' + Number(match[2]) + '月｜';
  }

  function dispatchCategoryLabel(category) {
    var labels = {
      CREATED: '已建立R0', DUPLICATE: '重複跳過', ROUTE_ERROR: '路線異常',
      SYSTEM_FAILED: '系統失敗', UNPROCESSED: '尚未派發'
    };
    return labels[String(category || '')] || '未分類';
  }

  function dispatchCategoryTone(category) {
    if (category === 'CREATED') return 'tag--success';
    if (category === 'DUPLICATE' || category === 'UNPROCESSED') return 'tag--warning';
    return 'tag--danger';
  }


  function getSelectedBatchDispatchEmployeeIds() {
    return Object.keys(state.batchDispatchSelectedEmployees || {}).filter(function (employeeId) {
      return state.batchDispatchSelectedEmployees[employeeId] === true;
    }).sort();
  }

  function updateBatchDispatchSelectionState(isCurrentMonth) {
    var selected = getSelectedBatchDispatchEmployeeIds();
    if (elements.batchDispatchSelectedCount) elements.batchDispatchSelectedCount.textContent = '已選' + selected.length + '人' + (selected.length === 1 ? '（單筆）' : selected.length > 1 ? '（多人）' : '');
    if (elements.batchDispatchPreviewButton) elements.batchDispatchPreviewButton.disabled = !isCurrentMonth || !selected.length || state.dispatchManagementLoading;
    if (elements.batchDispatchSelectVisibleButton) elements.batchDispatchSelectVisibleButton.disabled = !isCurrentMonth || state.dispatchManagementLoading;
    if (elements.batchDispatchClearButton) elements.batchDispatchClearButton.disabled = !selected.length || state.dispatchManagementLoading;
  }

  function selectVisibleBatchDispatchEmployees() {
    if (!elements.dispatchManagementPersons) return;
    Array.prototype.slice.call(elements.dispatchManagementPersons.querySelectorAll('[data-batch-dispatch]')).forEach(function (checkbox) {
      checkbox.checked = true;
      state.batchDispatchSelectedEmployees[checkbox.getAttribute('data-batch-dispatch')] = true;
    });
    updateBatchDispatchSelectionState(Boolean(state.dispatchManagement && state.dispatchManagement.isCurrentMonth));
  }

  function clearBatchDispatchSelection() {
    state.batchDispatchSelectedEmployees = {};
    if (elements.dispatchManagementPersons) {
      Array.prototype.slice.call(elements.dispatchManagementPersons.querySelectorAll('[data-batch-dispatch]')).forEach(function (checkbox) {
        checkbox.checked = false;
      });
    }
    closeBatchDispatchRepairPanel();
    updateBatchDispatchSelectionState(Boolean(state.dispatchManagement && state.dispatchManagement.isCurrentMonth));
  }

  async function previewBatchDispatchRepair() {
    var employeeIds = getSelectedBatchDispatchEmployeeIds();
    if (!employeeIds.length || state.dispatchManagementLoading) return;
    state.dispatchManagementLoading = true;
    setButtonLoading(elements.batchDispatchPreviewButton, true, '預覽中');
    showDispatchManagementMessage('info', '正在逐筆重新檢查選取人員的派發資格與七階段路線…');
    try {
      var result = await window.V3WorkflowService.previewManualDispatch(
        employeeIds,
        String(elements.dispatchManagementMonth.value || currentRocMonthFirstDay()).trim()
      );
      state.batchDispatchRepairPreview = result.data || {};
      renderBatchDispatchRepairPreview(state.batchDispatchRepairPreview, false);
      showDispatchManagementMessage(state.batchDispatchRepairPreview.canRun ? 'success' : 'info',
        state.batchDispatchRepairPreview.canRun ? '人工派發預覽完成，請確認可建立、跳過與異常名單。' : '選取人員目前沒有可建立的R0。');
    } catch (error) {
      showDispatchManagementMessage('error', friendlyError(error));
    } finally {
      state.dispatchManagementLoading = false;
      setButtonLoading(elements.batchDispatchPreviewButton, false, '預覽人工派發');
      updateBatchDispatchSelectionState(Boolean(state.dispatchManagement && state.dispatchManagement.isCurrentMonth));
    }
  }

  function renderBatchDispatchRepairPreview(data, refreshedBecauseStale) {
    var summary = data.summary || {};
    var items = data.items || [];
    elements.batchDispatchRepairContent.innerHTML = '<h4>人工派發／補派預覽</h4>' +
      (refreshedBecauseStale ? '<div class="form-message form-message--info">資料已變動，系統已自動更新預覽；請重新確認後執行。</div>' : '') +
      '<div class="admin-result-grid">' +
        metaItem('考核月份', data.evaluationMonth) +
        metaItem('本次選取', summary.selectedCount || 0) +
        metaItem('預計建立', summary.createCount || 0) +
        metaItem('已有R0跳過', summary.duplicateCount || 0) +
        metaItem('路線／資格異常', summary.routeErrorCount || 0) +
        metaItem('提醒數', summary.warningCount || 0) +
      '</div><div class="route-list">' + items.map(function (item) {
        var employee = item.employee || {};
        var organization = item.organization || {};
        var label = item.action === 'CREATE' ? '預計建立' : (item.action === 'DUPLICATE' ? '重複跳過' : '不可建立');
        var tone = item.action === 'CREATE' ? 'tag--success' : (item.action === 'DUPLICATE' ? 'tag--warning' : 'tag--danger');
        var reason = item.reason || (item.errors || []).join('；') || '路線檢查通過';
        return '<div class="route-row"><span><span class="tag ' + tone + '">' + escapeHtml(label) + '</span> ' +
          escapeHtml(joinStore(organization.storeCode, organization.storeName)) + '</span><strong>' +
          escapeHtml(joinText(employee.employeeId, employee.employeeName)) +
          (item.plannedEvaluationNo || item.existingEvaluationNo ? '｜' + escapeHtml(item.plannedEvaluationNo || item.existingEvaluationNo) : '') +
          '</strong><small>' + escapeHtml(reason) + '</small></div>';
      }).join('') + '</div><p class="section-help">' + escapeHtml(data.note || '') + '</p>';
    elements.batchDispatchRepairPanel.hidden = false;
    elements.batchDispatchRepairResult.hidden = true;
    elements.batchDispatchRepairReason.value = '';
    elements.batchDispatchRepairConfirm.checked = false;
    elements.batchDispatchRepairConfirmText.value = '';
    updateBatchDispatchRunState();
    elements.batchDispatchRepairPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeBatchDispatchRepairPanel() {
    state.batchDispatchRepairPreview = null;
    if (elements.batchDispatchRepairPanel) elements.batchDispatchRepairPanel.hidden = true;
    if (elements.batchDispatchRepairReason) elements.batchDispatchRepairReason.value = '';
    if (elements.batchDispatchRepairConfirm) elements.batchDispatchRepairConfirm.checked = false;
    if (elements.batchDispatchRepairConfirmText) elements.batchDispatchRepairConfirmText.value = '';
  }

  function updateBatchDispatchRunState() {
    if (!elements.batchDispatchRepairRunButton) return;
    var preview = state.batchDispatchRepairPreview || {};
    elements.batchDispatchRepairRunButton.disabled = state.dispatchManagementLoading || !(
      preview.canRun && preview.previewToken &&
      String(elements.batchDispatchRepairReason.value || '').trim() &&
      elements.batchDispatchRepairConfirm.checked &&
      String(elements.batchDispatchRepairConfirmText.value || '').trim() === String(preview.confirmationText || '確認派發')
    );
  }

  function applyManualDispatchResultLocallyV3(data) {
    var result = data || {};
    var created = {};
    (result.createdItems || []).forEach(function(item) {
      created[String(item.employeeId || '').trim()] = item;
    });
    if (!state.dispatchManagement || !Array.isArray(state.dispatchManagement.persons)) return;

    var categoryDeltas = { UNPROCESSED: 0, ROUTE_ERROR: 0, SYSTEM_FAILED: 0 };
    state.dispatchManagement.persons = state.dispatchManagement.persons.map(function(row) {
      var item = created[String(row.employeeId || '').trim()];
      if (!item) return row;
      var previousCategory = String(row.category || '');
      if (Object.prototype.hasOwnProperty.call(categoryDeltas, previousCategory)) categoryDeltas[previousCategory] += 1;
      return Object.assign({}, row, {
        category: 'CREATED',
        evaluationNo: String(item.evaluationNo || ''),
        workflowStatus: '待門市店主管填寫',
        reason: '',
        latestResult: '已建立R0',
        executionSource: String(result.executionSource || '教育中心人工派發／補派'),
        batchId: String(result.batchId || ''),
        completedAt: String(result.completedAt || ''),
        canRecheck: false,
        canRepair: false,
        canBatchSelect: false
      });
    });

    var summary = state.dispatchManagement.summary || {};
    var createdCount = Object.keys(created).length;
    summary.createdCount = Number(summary.createdCount || 0) + createdCount;
    summary.unprocessedCount = Math.max(0, Number(summary.unprocessedCount || 0) - categoryDeltas.UNPROCESSED);
    summary.routeErrorCount = Math.max(0, Number(summary.routeErrorCount || 0) - categoryDeltas.ROUTE_ERROR);
    summary.failedCount = Math.max(0, Number(summary.failedCount || 0) - categoryDeltas.SYSTEM_FAILED);
    state.dispatchManagement.summary = summary;
    state.dispatchManagement.filteredSummary = Object.assign({}, summary);
    state.batchDispatchSelectedEmployees = {};
    state.dispatchMonthAnalysis = null;
    if (elements.dispatchMonthAnalysisResult) elements.dispatchMonthAnalysisResult.hidden = true;
    renderDispatchManagementCenter(state.dispatchManagement);
  }

  async function runBatchDispatchRepair() {
    var preview = state.batchDispatchRepairPreview || {};
    if (!preview.canRun || !preview.previewToken || state.dispatchManagementLoading) return;
    var reason = String(elements.batchDispatchRepairReason.value || '').trim();
    var confirmationText = String(elements.batchDispatchRepairConfirmText.value || '').trim();
    if (!reason) return showDispatchManagementMessage('error', '請填寫人工派發／補派原因。');
    if (!elements.batchDispatchRepairConfirm.checked) return showDispatchManagementMessage('error', '請完成二次確認。');
    if (confirmationText !== String(preview.confirmationText || '確認派發')) return showDispatchManagementMessage('error', '請正確輸入「確認派發」。');
    if (!window.confirm('確定執行本次人工派發／補派嗎？\n\n預計建立：' + Number(preview.summary && preview.summary.createCount || 0) + '人\n系統將逐筆驗證，單筆失敗不影響其他人。')) return;

    state.dispatchManagementLoading = true;
    setButtonLoading(elements.batchDispatchRepairRunButton, true, '派發處理中');
    showGlobalNotice('processing', '正在執行人工派發／補派', '系統正逐筆確認資格、七階段路線與同月份R0。', false);
    try {
      var result = await window.V3WorkflowService.runManualDispatch({
        evaluationMonth: preview.evaluationMonth,
        previewToken: preview.previewToken,
        reason: reason,
        secondConfirmed: true,
        confirmationText: confirmationText
      }, window.V3ApiClient.createRequestId());
      closeGlobalNotice();
      var dispatchResult = result.data || {};
      applyManualDispatchResultLocallyV3(dispatchResult);
      closeBatchDispatchRepairPanel();
      showDispatchManagementMessage('success', '人工派發／補派完成：成功' + Number(dispatchResult.createdCount || 0) + '、跳過' + Number(dispatchResult.skippedCount || 0) + '、失敗' + Number(dispatchResult.failedCount || 0) + '。已立即更新當月人員狀態。');
      scheduleTargetedReconciliationV3({ pending: false, progress: false, dispatch: true, delayMs: 1200 });
    } catch (error) {
      closeGlobalNotice();
      if (error && error.code === 'BATCH_DISPATCH_PREVIEW_STALE' && error.details && error.details.latestPreview) {
        state.batchDispatchRepairPreview = error.details.latestPreview;
        renderBatchDispatchRepairPreview(state.batchDispatchRepairPreview, true);
        showDispatchManagementMessage('info', '資料已變動，系統已自動更新派發預覽；請重新確認。');
      } else {
        showGlobalNotice('error', '人工派發／補派失敗', friendlyError(error));
        showDispatchManagementMessage('error', friendlyError(error));
      }
    } finally {
      state.dispatchManagementLoading = false;
      setButtonLoading(elements.batchDispatchRepairRunButton, false, '執行人工派發／補派');
      updateBatchDispatchRunState();
      updateBatchDispatchSelectionState(Boolean(state.dispatchManagement && state.dispatchManagement.isCurrentMonth));
    }
  }

  function renderBatchDispatchRepairResult(data) {
    var html = '<h4>人工派發／補派結果</h4><div class="admin-result-grid">' +
      metaItem('批次ID', data.batchId || '') +
      metaItem('本次選取', data.selectedCount || 0) +
      metaItem('成功建立', data.createdCount || 0) +
      metaItem('跳過', data.skippedCount || 0) +
      metaItem('失敗', data.failedCount || 0) +
      metaItem('完成時間', data.completedAt || '') + '</div>';
    if (Array.isArray(data.failedItems) && data.failedItems.length) {
      html += '<h5>失敗明細</h5><ul class="preview-alert-list preview-alert-list--error">' + data.failedItems.map(function (item) {
        return '<li>' + escapeHtml(joinText(item.employeeId, item.employeeName)) + '｜' + escapeHtml(item.reason || '建立失敗') + '</li>';
      }).join('') + '</ul>';
    }
    elements.batchDispatchRepairResult.innerHTML = html;
    elements.batchDispatchRepairResult.hidden = false;
    elements.batchDispatchRepairPanel.hidden = false;
  }

  async function loadDispatchMonthAnalysis() {
    if (state.dispatchManagementLoading) return;
    state.dispatchManagementLoading = true;
    setButtonLoading(elements.dispatchMonthAnalysisButton, true, '分析中');
    showDispatchManagementMessage('info', '正在產生所選月份的派發總整分析…');
    try {
      var result = await window.V3WorkflowService.dispatchMonthAnalysis(
        String(elements.dispatchManagementMonth.value || currentRocMonthFirstDay()).trim()
      );
      state.dispatchMonthAnalysis = result.data || {};
      renderDispatchMonthAnalysis(state.dispatchMonthAnalysis);
      showDispatchManagementMessage('success', '月份分析已產生。');
    } catch (error) {
      showDispatchManagementMessage('error', friendlyError(error));
    } finally {
      state.dispatchManagementLoading = false;
      setButtonLoading(elements.dispatchMonthAnalysisButton, false, '產生月份分析');
      updateBatchDispatchSelectionState(Boolean(state.dispatchManagement && state.dispatchManagement.isCurrentMonth));
    }
  }

  function renderDispatchMonthAnalysis(data) {
    var summary = data.summary || {};
    var html = '<h4>' + escapeHtml(data.evaluationMonth || '') + ' 派發總整分析</h4>' +
      '<div class="admin-result-grid">' +
        metaItem(data.populationLabel || '統計人數', summary.populationCount || 0) +
        metaItem('已建立R0', summary.createdCount || 0) +
        metaItem('尚未派發', summary.unprocessedCount || 0) +
        metaItem('路線異常', summary.routeErrorCount || 0) +
        metaItem('系統失敗', summary.failedCount || 0) +
        metaItem('人工派發／補派成功', summary.manualRepairCreatedCount || 0) +
        metaItem('完成率', Number(summary.completionRate || 0).toFixed(1) + '%') +
        metaItem('派發嘗試', summary.attemptCount || 0) +
      '</div><p class="section-help">' + escapeHtml(data.scopeNote || '') +
      (data.cacheHit ? '｜本次使用短時間快取。' : '｜本次重新計算。') + '</p>';
    var sources = data.sources || [];
    if (sources.length) {
      html += '<details class="detail-section" open><summary>依派發來源統計</summary><div class="route-list">' + sources.map(function (row) {
        return '<div class="route-row"><span>' + escapeHtml(row.source) + '</span><strong>成功 ' + Number(row.createdCount || 0) +
          '｜跳過 ' + Number(row.skippedCount || 0) + '｜失敗 ' + Number(row.failedCount || 0) +
          '</strong><small>涉及人員 ' + Number(row.employeeCount || 0) + '｜嘗試 ' + Number(row.attemptCount || 0) + '</small></div>';
      }).join('') + '</div></details>';
    }
    var anomalies = data.anomalies || [];
    html += '<details class="detail-section"' + (anomalies.length ? ' open' : '') + '><summary>需要處理的異常名單（' + anomalies.length + '）</summary>' +
      (anomalies.length ? '<div class="route-list">' + anomalies.map(function (row) {
        return '<div class="route-row"><span><span class="tag ' + dispatchCategoryTone(row.category) + '">' + escapeHtml(dispatchCategoryLabel(row.category)) +
          '</span> ' + escapeHtml(joinStore(row.storeCode, row.storeName)) + '</span><strong>' + escapeHtml(joinText(row.employeeId, row.employeeName)) +
          '</strong><small>' + escapeHtml(row.reason || '尚未處理') + '</small></div>';
      }).join('') + '</div>' : '<p class="section-help">本月份目前沒有尚未派發、路線異常或系統失敗人員。</p>') + '</details>';
    var batches = data.batches || [];
    if (batches.length) {
      html += '<details class="detail-section"><summary>批次執行紀錄（' + batches.length + '）</summary><div class="route-list">' + batches.map(function (row) {
        return '<div class="route-row"><span>' + escapeHtml(row.source || '未標示來源') + '</span><strong>' + escapeHtml(row.batchId || '') +
          '</strong><small>' + escapeHtml(row.completedAt || row.startedAt || '') + '｜候選 ' + Number(row.candidateCount || 0) +
          '｜成功 ' + Number(row.createdCount || 0) + '｜跳過 ' + Number(row.skippedCount || 0) + '｜失敗 ' + Number(row.failedCount || 0) + '</small></div>';
      }).join('') + '</div></details>';
    }
    elements.dispatchMonthAnalysisResult.innerHTML = html;
    elements.dispatchMonthAnalysisResult.hidden = false;
  }
  function showDispatchManagementMessage(type, text) { showMessage(elements.dispatchManagementMessage, type, text); }

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

    
  async function handleLogout() {
    elements.logoutButton.disabled = true;
    try {
      await window.V3AuthService.logout();
    } catch (error) {
      window.V3AuthService.clearSession();
    } finally {
      elements.logoutButton.disabled = false;
      state.pdfFallbackCache = {};
      state.dispatchManagement = null;
      state.dispatchMonthAnalysis = null;
      state.accountManagement = null;
      state.accountManagementPage = 1;
      state.accountAction = null;
      state.batchDispatchRepairPreview = null;
      state.batchDispatchSelectedEmployees = {};
      state.dispatchManagementSelectionMonth = '';
      resetContinuousReviewState(false);
      closeBatchDispatchRepairPanel();
      closeAccountActionPanel();
      if (elements.dispatchMonthAnalysisResult) elements.dispatchMonthAnalysisResult.hidden = true;
      closePdfViewerModal();
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
    if (tab === 'system' && !state.dispatchManagement) loadDispatchManagementCenter({ quiet: true });
    if (tab === 'system' && !state.accountManagement) loadAccountManagementCenter({ quiet: true });
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
      ACCOUNT_TEMP_LOCKED: '工號或密碼錯誤次數過多，帳號暫停登入5分鐘。請稍後再試或聯絡教育中心。',
      ACCOUNT_LOCKED: '帳號已鎖定，請聯絡教育中心解鎖。',
      ACCOUNT_DISABLED: '此帳號目前未啟用，請聯絡教育中心。',
      ROLE_NOT_CONFIGURED: '此帳號尚未設定有效角色，請聯絡教育中心。',
      SESSION_REQUIRED: '登入狀態不存在，請重新登入。',
      SESSION_EXPIRED: '登入已逾時，請重新登入。',
      SESSION_INVALID: '登入狀態無效，請重新登入。',
      SESSION_REVOKED: '帳號資料已更新，請重新登入。',
      REQUEST_TIMEOUT: '連線逾時，請確認網路後重試。',
      REQUEST_CANCELLED: '已切換PDF檢視方式。',
      NETWORK_ERROR: '無法連線到後端，請確認網路與Apps Script部署。',
      INVALID_RESPONSE: '後端回傳格式異常，請聯絡系統管理人員。',
      VERSION_CONFLICT: '此考核表已被其他人更新，請關閉後重新開啟。',
      ALREADY_CLAIMED: '此月考核表已被其他教育中心成員領取。',
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
      PDF_VIEW_NOT_FOUND: '此PDF查看連結不存在或尚未公開。',
      PDF_FILE_UNAVAILABLE: 'PDF檔案目前無法讀取，請聯絡教育中心。',
      PDF_CONTENT_UNAVAILABLE: 'PDF內容目前無法讀取，請稍後再試。',
      PDF_NOT_READY: '此月考核表的PDF尚未完成。',
      DISPATCH_PREVIEW_REQUIRED: '請先完成當月正式派發預覽。',
      DISPATCH_PREVIEW_EXPIRED: '派發預覽已逾時，請重新預覽。',
      DISPATCH_PREVIEW_STALE: '預覽後主檔或既有考核資料已變動，請重新預覽。',
      DISPATCH_PREVIEW_OWNER_MISMATCH: '此預覽不是由目前登入者建立，請重新預覽。',
      DISPATCH_PREVIEW_MONTH_MISMATCH: '預覽月份與執行月份不一致，請重新預覽。',
      DISPATCH_NO_ELIGIBLE: '目前沒有可建立的正式月考核表。',
      DISPATCH_MONTH_NOT_CURRENT: '人工派發目前只允許處理當月。',
      DISPATCH_ALREADY_RUNNING: '目前已有正式派發作業執行中，請稍後再試。',
      DISPATCH_REPAIR_PREVIEW_REQUIRED: '請先重新檢查此人員的派發路線。',
      DISPATCH_REPAIR_PREVIEW_EXPIRED: '單筆補派預覽已逾時，請重新檢查。',
      DISPATCH_REPAIR_PREVIEW_STALE: '預覽後主檔、路線或既有月考核表已變動，請重新檢查。',
      DISPATCH_REPAIR_OWNER_MISMATCH: '此補派預覽不是由目前登入者建立。',
      DISPATCH_REPAIR_PREVIEW_MISMATCH: '補派預覽與目前月份或人員不一致。',
      DISPATCH_EMPLOYEE_NOT_ELIGIBLE: '此人員目前不符合正式派發資格。',
      DISPATCH_ROUTE_INVALID: '此人員的七階段路線尚未通過，請先修正主檔。',
      FORCE_CLOSE_CONFIRMATION_REQUIRED: '請完成強制結案最終確認。',
      FORCE_CLOSE_NOT_AVAILABLE: '此月考核表目前不能執行強制結案。',
      SELF_ACCOUNT_DISABLE_BLOCKED: '不可停用自己目前登入中的帳號。',
      SELF_FORCE_LOGOUT_BLOCKED: '不可從管理中心強制登出自己。',
      LAST_ACCOUNT_MANAGER_BLOCKED: '不可停用最後一個可登入的教育中心管理帳號。',
      PASSWORD_NOT_CONFIGURED: '此人員尚未設定有效的4碼密碼，請先至員工主檔修正密碼。',
      ACCOUNT_DISABLED_REQUIRES_ENABLE: '此帳號是人工停用，請使用啟用帳號功能。',
      ACCOUNT_STATUS_NOT_CONFIGURED: '此帳號尚未設定狀態，請先啟用帳號或至員工主檔設定。',
      ACCOUNT_NOT_LOCKED: '此帳號目前沒有鎖定或登入失敗次數可清除。',
      CREDENTIAL_QUERY_REQUIRED: '請輸入員工姓名或工號。',
      CREDENTIAL_EMPLOYEE_NOT_FOUND: '查無符合姓名或工號的人員。',
      ACCOUNT_REASON_REQUIRED: '請填寫至少4個字的帳號處理原因。',
      CONFIRM_TEXT_MISMATCH: '最終確認文字不正確。'
    };
    if (code === 'UNKNOWN_ACTION') {
      var rawMessage = String(error && error.message || '');
      if (rawMessage.indexOf('accountCredentialLookup') !== -1) {
        return '帳密查詢的Apps Script後端尚未更新。請確認已替換05_ApiRouter與26_AccountManagementService，並在「管理部署作業」建立新版本後重新部署。';
      }
      return 'GitHub前端與Apps Script後端版本不一致，請重新部署最新Apps Script版本。';
    }
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
