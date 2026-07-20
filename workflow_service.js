/* 月考核系統 V3｜版本：7.1.0A-safe-dispatch-core */
(function () {
  'use strict';

  function sessionToken() {
    var session = window.V3AuthService.readSession();
    if (!session || !session.sessionToken) throw new window.V3ApiClient.ApiError('SESSION_REQUIRED', '請先登入。');
    return session.sessionToken;
  }

  function call(action, payload, requestId) {
    return window.V3ApiClient.request(action, payload || {}, sessionToken(), requestId);
  }

  window.V3WorkflowService = Object.freeze({
    bootstrap: function (limit) { return call('bootstrap', { limit: Number(limit || 50) }); },
    listPending: function (limit) { return call('listPending', { limit: Number(limit || 100) }); },
    listProgress: function (filters) { return call('listProgress', filters || {}); },
    listHistory: function (filters) { return call('listHistory', filters || {}); },
    getEvaluation: function (evaluationNo) { return call('getEvaluation', { evaluationNo: evaluationNo }); },
    getMutationStatus: function (evaluationNo, requestId, expectedVersion) {
      return call('getMutationStatus', { evaluationNo: evaluationNo, requestId: requestId, expectedVersion: expectedVersion });
    },
    claim: function (evaluationNo, expectedVersion) {
      return call('claimEvaluation', { evaluationNo: evaluationNo, expectedVersion: expectedVersion });
    },
    release: function (evaluationNo, expectedVersion) {
      return call('releaseEvaluation', { evaluationNo: evaluationNo, expectedVersion: expectedVersion });
    },
    submitAction: function (payload, requestId) { return call('submitAction', payload, requestId); },
    forceTransition: function (payload, requestId) { return call('forceTransition', payload, requestId); },
    saveDraft: function (evaluationNo, content, expectedVersion, workflowStatus, action) {
      return call('saveDraft', {
        evaluationNo: evaluationNo,
        content: content || {},
        expectedVersion: expectedVersion,
        workflowStatus: workflowStatus || '',
        action: action || '',
        clientUpdatedAt: new Date().toISOString()
      });
    },
    getDraft: function (evaluationNo, action, expectedVersion) {
      return call('getDraft', { evaluationNo: evaluationNo, action: action || '', expectedVersion: expectedVersion });
    },
    deleteDraft: function (evaluationNo) { return call('deleteDraft', { evaluationNo: evaluationNo }); },
    systemHealth: function () { return call('systemHealth', {}); },
    listTestDispatchCandidates: function (keyword) {
      return call('listTestDispatchCandidates', { keyword: String(keyword || '') });
    },
    previewTestEvaluation: function (employeeId, evaluationMonth) {
      return call('previewTestEvaluation', {
        employeeId: String(employeeId || ''),
        evaluationMonth: String(evaluationMonth || '')
      });
    },
    createTestEvaluation: function (payload, requestId) {
      return call('createTestEvaluation', payload || {}, requestId);
    },
    previewMonthlyDispatch: function (evaluationMonth) {
      return call('previewMonthlyDispatch', { evaluationMonth: String(evaluationMonth || '') });
    },
    runMonthlyDispatch: function (payload, requestId) {
      return call('runMonthlyDispatch', payload || {}, requestId);
    },
    monthlyDispatchStatus: function () {
      return call('monthlyDispatchStatus', {});
    },
    getMySignaturePreview: function (source, evaluationNo) {
      return call('getMySignaturePreview', { source: source || 'saved', evaluationNo: evaluationNo || '' });
    },
    generatePdf: function (evaluationNo, requestId) {
      return call('generatePdf', { evaluationNo: String(evaluationNo || '') }, requestId);
    },
    publishPdf: function (evaluationNo, requestId) {
      return call('publishPdf', { evaluationNo: String(evaluationNo || '') }, requestId);
    },
    prepareDrivePdfView: function (evaluationNo, requestId) {
      return call('prepareDrivePdfView', { evaluationNo: String(evaluationNo || '') }, requestId);
    },
    authenticatedPdfView: function (evaluationNo, requestId) {
      return call('authenticatedPdfView', { evaluationNo: String(evaluationNo || '') }, requestId);
    },
    preparePdfView: function (evaluationNo, requestId) {
      return call('preparePdfView', { evaluationNo: String(evaluationNo || '') }, requestId);
    },
    verifyPdfTemplate: function () {
      return call('verifyPdfTemplate', {});
    },
    recordClientPerformance: function (payload, requestId) {
      return call('recordClientPerformance', payload || {}, requestId);
    }
  });
})();
