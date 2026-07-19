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

  async function request(action, payload, sessionToken, requestId) {
    var config = getConfig();
    if (!isConfigured()) {
      throw new ApiError('API_URL_NOT_CONFIGURED', '尚未設定 Apps Script /exec 網址。');
    }

    var controller = new AbortController();
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
      preparePdfView: 90000,
      publicPdfView: 60000,
      verifyPdfTemplate: 60000
    };
    var timeoutMs = Number(actionTimeouts[String(action || '')] || defaultTimeout);
    var timeoutId = window.setTimeout(function () {
      controller.abort();
    }, timeoutMs);

    var body = {
      action: String(action || ''),
      requestId: String(requestId || createRequestId()),
      payload: payload && typeof payload === 'object' ? payload : {}
    };
    if (sessionToken) body.sessionToken = String(sessionToken);

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
      var result;
      try {
        result = JSON.parse(text);
      } catch (parseError) {
        throw new ApiError('INVALID_RESPONSE', '後端回傳內容不是有效 JSON。', response.status, text.slice(0, 300));
      }

      if (!result || result.success !== true) {
        var source = result && result.error ? result.error : {};
        throw new ApiError(source.code, source.message, source.httpStatus || response.status, source.details);
      }
      return result;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new ApiError('REQUEST_TIMEOUT', '連線逾時，請確認網路後再試一次。');
      }
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR', '無法連線到後端。請確認 GitHub 網頁與 Apps Script 部署設定。', 0, String(error && error.message || error));
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  window.V3ApiClient = Object.freeze({
    ApiError: ApiError,
    isConfigured: isConfigured,
    createRequestId: createRequestId,
    request: request,
    health: function () { return request('health', {}, ''); }
  });
})();
