/* 月考核系統 V3｜版本：7.7.0A-HF2-connection-retry */
(function () {
  'use strict';

  function ApiError(code, message, httpStatus, details) {
    this.name = 'ApiError';
    this.code = String(code || 'UNKNOWN_ERROR');
    this.message = String(message || '系統處理失敗。');
    this.httpStatus = Number(httpStatus || 0);
    this.details = details === undefined ? null : details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ApiError);
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function getConfig() {
    if (!window.V3_CONFIG) throw new ApiError('CONFIG_MISSING', '找不到 api_config.js 設定。');
    return window.V3_CONFIG;
  }

  function isConfigured() {
    var config = getConfig();
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec(?:\?.*)?$/i.test(String(config.API_URL || '').trim());
  }

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'web-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function nowMilliseconds() {
    return window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
  }

  var activeRequests = {};

  function textByteLength(text) {
    // JSON與Base64主要為ASCII；使用字串長度避免為大型PDF回應再建立一份Blob。
    return String(text || '').length;
  }

  function cancelRequest(requestId) {
    var key = String(requestId || '').trim();
    var active = key ? activeRequests[key] : null;
    if (!active) return false;
    active.cancelledByUser = true;
    try { active.controller.abort(); } catch (ignore) {}
    return true;
  }

  async function requestOnce(action, payload, sessionToken, requestId) {
    var config = getConfig();
    if (!isConfigured()) {
      throw new ApiError('API_URL_NOT_CONFIGURED', '尚未設定 Apps Script /exec 網址。');
    }

    var requestStartedAt = nowMilliseconds();
    var body = {
      action: String(action || ''),
      requestId: String(requestId || createRequestId()),
      payload: payload && typeof payload === 'object' ? payload : {}
    };
    if (sessionToken) body.sessionToken = String(sessionToken);

    var controller = new AbortController();
    var activeRecord = {
      controller: controller,
      cancelledByUser: false,
      timedOut: false
    };
    activeRequests[body.requestId] = activeRecord;

    var defaultTimeout = Number(config.REQUEST_TIMEOUT_MS || 30000);
    var actionTimeouts = {
      submitAction: 90000,
      forceTransition: 90000,
      claimEvaluation: 45000,
      releaseEvaluation: 45000,
      saveDraft: 45000,
      getMutationStatus: 45000,
      generatePdf: 180000,
      publishPdf: 90000,
      prepareDrivePdfView: 60000,
      authenticatedPdfView: 60000,
      preparePdfView: 90000,
      publicPdfView: 60000,
      verifyPdfTemplate: 60000,
      previewMonthlyDispatch: 90000,
      runMonthlyDispatch: 180000,
      monthlyDispatchStatus: 60000,
      dispatchManagementCenter: 90000,
      previewSingleDispatchRepair: 60000,
      runSingleDispatchRepair: 120000,
      previewBatchDispatchRepair: 90000,
      runBatchDispatchRepair: 180000,
      dispatchMonthAnalysis: 90000,
      forceClosePreview: 60000,
      forceCloseEvaluation: 90000
    };
    var timeoutMs = Number(actionTimeouts[String(action || '')] || defaultTimeout);
    var timeoutId = window.setTimeout(function () {
      activeRecord.timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      var response = await fetch(config.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        signal: controller.signal
      });

      var text = await response.text();
      var requestEndedAt = nowMilliseconds();
      var clientPerformance = {
        action: String(action || ''),
        requestId: String(body.requestId || ''),
        requestMs: Math.max(0, Math.round(requestEndedAt - requestStartedAt)),
        responseBytes: textByteLength(text),
        httpStatus: Number(response.status || 0)
      };
      var result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        var invalidError = new ApiError('INVALID_RESPONSE', '後端回傳內容不是有效 JSON。', response.status, text.slice(0, 300));
        invalidError.clientPerformance = clientPerformance;
        throw invalidError;
      }

      if (!result || result.success !== true) {
        var source = result && result.error ? result.error : {};
        var apiError = new ApiError(source.code, source.message, source.httpStatus || response.status, source.details);
        apiError.clientPerformance = clientPerformance;
        throw apiError;
      }
      result.clientPerformance = clientPerformance;
      return result;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        var abortedCode = activeRecord.cancelledByUser ? 'REQUEST_CANCELLED' : 'REQUEST_TIMEOUT';
        var abortedMessage = activeRecord.cancelledByUser ? '已切換PDF檢視方式。' : '連線逾時，請確認網路後再試一次。';
        var abortedError = new ApiError(abortedCode, abortedMessage);
        abortedError.clientPerformance = {
          action: String(action || ''),
          requestId: String(body.requestId || ''),
          requestMs: Math.max(0, Math.round(nowMilliseconds() - requestStartedAt)),
          responseBytes: 0,
          httpStatus: 0
        };
        throw abortedError;
      }
      if (error instanceof ApiError) throw error;
      var networkError = new ApiError('NETWORK_ERROR', '無法連線到後端。請確認 GitHub 網頁與 Apps Script 部署設定。', 0, String(error && error.message || error));
      networkError.clientPerformance = {
        action: String(action || ''),
        requestId: String(body.requestId || ''),
        requestMs: Math.max(0, Math.round(nowMilliseconds() - requestStartedAt)),
        responseBytes: 0,
        httpStatus: 0
      };
      throw networkError;
    } finally {
      window.clearTimeout(timeoutId);
      if (activeRequests[body.requestId] === activeRecord) delete activeRequests[body.requestId];
    }
  }


  var RETRYABLE_ACTIONS = Object.freeze({
    health: true,
    login: true,
    session: true,
    bootstrap: true,
    listPending: true,
    listProgress: true,
    listHistory: true,
    getEvaluation: true,
    getDraft: true,
    systemHealth: true,
    accountManagementCenter: true,
    accountAuditPage: true,
    accountCredentialLookup: true,
    dispatchManagementCenter: true,
    dispatchMonthAnalysis: true,
    previewManualDispatch: true,
    forceClosePreview: true,
    notificationManagementCenter: true,
    pdfManagementCenter: true,
    pdfInspectHealth: true,
    prepareDrivePdfView: true,
    authenticatedPdfView: true,
    preparePdfView: true,
    publicPdfView: true,
    verifyPdfTemplate: true,
    archiveManagementCenter: true,
    archivePreview: true,
    getMySignaturePreview: true
  });

  function waitMilliseconds(milliseconds) {
    return new Promise(function(resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function shouldRetryRequest(action, error) {
    if (!RETRYABLE_ACTIONS[String(action || '')]) return false;
    var code = String(error && error.code || '');
    if (['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'INVALID_RESPONSE'].indexOf(code) !== -1) return true;
    var status = Number(error && error.httpStatus || 0);
    return status >= 500 && status <= 599;
  }

  async function request(action, payload, sessionToken, requestId) {
    var stableRequestId = String(requestId || createRequestId());
    var maxAttempts = RETRYABLE_ACTIONS[String(action || '')] ? 3 : 1;
    var lastError = null;
    for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        var result = await requestOnce(action, payload, sessionToken, stableRequestId);
        if (result && result.clientPerformance) result.clientPerformance.retryCount = attempt - 1;
        return result;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !shouldRetryRequest(action, error)) throw error;
        await waitMilliseconds(attempt === 1 ? 800 : 1800);
      }
    }
    throw lastError || new ApiError('NETWORK_ERROR', '無法連線到後端。');
  }

  window.V3ApiClient = Object.freeze({
    ApiError: ApiError,
    isConfigured: isConfigured,
    createRequestId: createRequestId,
    cancelRequest: cancelRequest,
    request: request,
    health: function () { return request('health', {}, ''); }
  });
})();
