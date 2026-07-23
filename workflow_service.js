/* 月考核系統 V3｜版本：7.9.0A-b-manager-workflow-performance */
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
    listPending: function (filters) {
      if (typeof filters === 'number') filters = { page: 1, pageSize: filters };
      return call('listPending', filters || { page: 1, pageSize: 10 });
    },
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
    accountManagementCenter: function (filters) { return call('accountManagementCenter', filters || {}); },
    accountCreate: function (payload, requestId) { return call('accountCreate', payload || {}, requestId); },
    accountAuditPage: function (filters) { return call('accountAuditPage', filters || {}); },
    accountUnlock: function (payload, requestId) { return call('accountUnlock', payload || {}, requestId); },
    accountSetStatus: function (payload, requestId) { return call('accountSetStatus', payload || {}, requestId); },
    accountSetEvaluationRequirement: function (payload, requestId) { return call('accountSetEvaluationRequirement', payload || {}, requestId); },
    accountSetNotificationEmail: function (payload, requestId) { return call('accountSetNotificationEmail', payload || {}, requestId); },
    accountForceLogout: function (payload, requestId) { return call('accountForceLogout', payload || {}, requestId); },
    accountCredentialLookup: function (query, employeeId, requestId) {
      return call('accountCredentialLookup', { query: String(query || ''), employeeId: String(employeeId || '') }, requestId);
    },
    dispatchManagementCenter: function (filters) {
      return call('dispatchManagementCenter', filters || {});
    },
    previewManualDispatch: function (employeeIds, evaluationMonth, evaluationVersion) {
      return call('previewManualDispatch', {
        employeeIds: Array.isArray(employeeIds) ? employeeIds : [],
        evaluationMonth: String(evaluationMonth || ''),
        evaluationVersion: String(evaluationVersion || 'A')
      });
    },
    runManualDispatch: function (payload, requestId) {
      return call('runManualDispatch', payload || {}, requestId);
    },
    dispatchMonthAnalysis: function (evaluationMonth) {
      return call('dispatchMonthAnalysis', { evaluationMonth: String(evaluationMonth || '') });
    },
    monthlyPlanCenter: function (filters) { return call('monthlyPlanCenter', filters || {}); },
    monthlyPlanSave: function (payload, requestId) { return call('monthlyPlanSave', payload || {}, requestId); },
    monthlyPlanLock: function (payload, requestId) { return call('monthlyPlanLock', payload || {}, requestId); },
    monthlyPlanReopen: function (payload, requestId) { return call('monthlyPlanReopen', payload || {}, requestId); },
    forceClosePreview: function (evaluationNo) {
      return call('forceClosePreview', { evaluationNo: String(evaluationNo || '') });
    },
    forceCloseEvaluation: function (payload, requestId) {
      return call('forceCloseEvaluation', payload || {}, requestId);
    },
    getMySignaturePreview: function (source, evaluationNo) {
      return call('getMySignaturePreview', { source: source || 'saved', evaluationNo: evaluationNo || '' });
    },
    notificationManagementCenter: function (filters) { return call('notificationManagementCenter', filters || {}); },
    notificationPreviewBatch: function (payload) { return call('notificationPreviewBatch', payload || {}); },
    notificationSaveSettings: function (payload, requestId) { return call('notificationSaveSettings', payload || {}, requestId); },
    notificationCreateBatch: function (payload, requestId) { return call('notificationCreateBatch', payload || {}, requestId); },
    notificationInstallSchedule: function (payload) { return call('notificationInstallSchedule', payload || {}); },
    notificationDisableSchedule: function (payload) { return call('notificationDisableSchedule', payload || {}); },
    notificationRunWorker: function () { return call('notificationRunWorker', {}); },
    pdfManagementCenter: function (filters) {
      return call('pdfManagementCenter', filters || {});
    },
    pdfRetryBatch: function (payload, requestId) {
      return call('pdfRetryBatch', payload || {}, requestId);
    },
    pdfRetryPublication: function (payload, requestId) {
      return call('pdfRetryPublication', payload || {}, requestId);
    },
    pdfInspectHealth: function (evaluationNo) {
      return call('pdfInspectHealth', { evaluationNo: String(evaluationNo || '') });
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
    archiveManagementCenter: function (filters) { return call('archiveManagementCenter', filters || {}); },
    archivePreview: function (year) { return call('archivePreview', { year: String(year || '') }); },
    archiveBuild: function (payload, requestId) { return call('archiveBuild', payload || {}, requestId); },
    archiveFinalize: function (payload, requestId) { return call('archiveFinalize', payload || {}, requestId); },
    archiveCleanup: function (payload, requestId) { return call('archiveCleanup', payload || {}, requestId); },
    recordClientPerformance: function (payload, requestId) {
      return call('recordClientPerformance', payload || {}, requestId);
    }
  });
})();
