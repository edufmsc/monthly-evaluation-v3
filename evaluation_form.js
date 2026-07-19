(function () {
  'use strict';

  var MANAGER_ITEMS = [
    { key: '責任感', label: '責任感' },
    { key: '協調性', label: '協調性' },
    { key: '表達能力', label: '表達能力' },
    { key: '學習態度', label: '學習態度' },
    { key: '解決問題能力', label: '解決問題能力' },
    { key: '個人儀容', label: '個人儀容' }
  ];

  var ACTION_LABELS = {
    manager_submit: '送交教育中心',
    edu_submit: '送交教育中心主管',
    edu_supervisor_approve: '簽核通過並送區主管',
    edu_supervisor_return_member: '退回教育中心成員',
    edu_supervisor_return_manager: '退回門市店主管',
    area_approve: '簽核通過並送受評人員',
    area_return_member: '退回教育中心成員',
    area_return_supervisor: '退回教育中心主管',
    employee_confirm: '確認並送營業處主管',
    employee_return_manager: '提出疑慮並退回店主管',
    department_executive_approve: '簽核通過並送總經理',
    department_executive_return_area: '退回區主管',
    gm_approve: '核准並進入 PDF 處理',
    gm_return_department_executive: '退回營業處主管'
  };

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function value(record, key) {
    var raw = record && record[key];
    return raw === null || raw === undefined ? '' : raw;
  }

  function selected(current, expected) {
    return String(current) === String(expected) ? ' selected' : '';
  }

  function renderScoreSelect(name, current, min, max) {
    var html = '<select name="' + escapeHtml(name) + '" required>';
    html += '<option value="">請選擇</option>';
    for (var i = min; i <= max; i += 1) {
      html += '<option value="' + i + '"' + selected(current, i) + '>' + i + '</option>';
    }
    html += '</select>';
    return html;
  }

  function renderManagerForm(record) {
    var html = '<div class="form-section"><h3>門市店主管評分</h3><p class="section-help">六項各 1～10 分，最高 60 分。</p>';
    html += '<div class="score-grid">';
    MANAGER_ITEMS.forEach(function (item, index) {
      html += '<label class="score-field"><span>' + escapeHtml(item.label) + '</span>' +
        renderScoreSelect('managerScore' + index, value(record, item.key), 1, 10) + '</label>';
    });
    html += '</div>';
    html += textareaField('comment', '門市店主管評語', value(record, '門市店主管評語'), false, '請輸入對受評人員的具體評語。');
    html += '</div>' + signatureBlock();
    return html;
  }

  function renderEducationForm(record) {
    var html = '<div class="form-section"><h3>教育中心評分（40分）</h3><div class="form-grid">';
    html += numberField('accumulatedPoints', '職能積分累計', value(record, '職能積分累計'), 0, 999999, true);
    html += selectField('score1', '職能積分得分', value(record, '職能積分得分'), [0, 15], true);
    html += numberField('ojtCount', 'OJT完成篇數', value(record, 'OJT完成篇數'), 0, 9999, true);
    html += selectField('score2', 'OJT得分', value(record, 'OJT得分'), [0, 10], true);
    html += numberField('score3', '每週進度回報得分', value(record, '每週進度回報得分') === '' ? 5 : value(record, '每週進度回報得分'), 0, 5, true);
    html += numberField('score4', '培訓課程狀況得分', value(record, '培訓課程狀況得分') === '' ? 10 : value(record, '培訓課程狀況得分'), 0, 10, true);
    html += '</div>';
    html += textareaField('abnormalReport', '教育中心異常回報', value(record, '教育中心異常回報') || '無', true, '沒有異常時請填「無」。');
    html += '</div>' + signatureBlock();
    return html;
  }

  function renderSimpleApprovalForm(record, action) {
    var labels = {
      edu_supervisor_approve: ['教育中心主管評語', '教育中心主管評語'],
      area_approve: ['區主管評語', '區主管評語'],
      employee_confirm: ['確認備註', '受評人員確認備註'],
      department_executive_approve: ['營業處主管評語', '營業處主管評語'],
      gm_approve: ['總經理評語', '總經理評語']
    };
    var pair = labels[action] || ['評語', ''];
    var html = '<div class="form-section"><h3>' + escapeHtml(ACTION_LABELS[action] || '簽核') + '</h3>';
    if (action === 'area_approve') {
      html += numberField('adjustment', '區主管增減分（-10～10）', value(record, '區主管增減分') === '' ? 0 : value(record, '區主管增減分'), -10, 10, true);
    }
    html += textareaField('comment', pair[0], value(record, pair[1]), false, '可輸入補充說明。');
    html += '</div>' + signatureBlock();
    return html;
  }

  function renderReturnForm(record, action) {
    return '<div class="form-section form-section--return"><h3>' + escapeHtml(ACTION_LABELS[action] || '退回') + '</h3>' +
      textareaField('reason', '退回原因', '', true, '請具體說明需要修改的內容。') + '</div>';
  }

  function renderActionForm(record, action) {
    if (action === 'manager_submit') return renderManagerForm(record);
    if (action === 'edu_submit') return renderEducationForm(record);
    if (action === 'edu_supervisor_approve' || action === 'area_approve' || action === 'employee_confirm' || action === 'department_executive_approve' || action === 'gm_approve') {
      return renderSimpleApprovalForm(record, action);
    }
    return renderReturnForm(record, action);
  }

  function signatureBlock() {
    return '<div class="form-section signature-section" data-signature-section>' +
      '<h3>本次簽名</h3>' +
      '<p class="section-help">其他角色只會看到「已簽核＋日期」，不會看到您的簽名圖片。</p>' +
      '<div class="signature-mode-grid">' +
        '<label class="choice-card"><input type="radio" name="signatureMode" value="saved" data-signature-saved> 使用本人預存簽名</label>' +
        '<label class="choice-card"><input type="radio" name="signatureMode" value="drawn" data-signature-drawn> 本次手寫簽名</label>' +
      '</div>' +
      '<div class="signature-panel" data-saved-panel>' +
        '<p data-saved-status>正在檢查預存簽名…</p>' +
        '<img class="signature-preview" data-saved-preview alt="本人預存簽名預覽" hidden>' +
      '</div>' +
      '<div class="signature-panel" data-drawn-panel hidden>' +
        '<canvas class="signature-canvas" data-signature-canvas aria-label="手寫簽名區"></canvas>' +
        '<button type="button" class="small-button" data-clear-signature>清除重簽</button>' +
      '</div>' +
    '</div>';
  }

  function textareaField(name, label, current, required, hint) {
    return '<label class="field-group"><span class="field-label">' + escapeHtml(label) + (required ? ' <b class="required-mark">*</b>' : '') + '</span>' +
      '<textarea name="' + escapeHtml(name) + '" rows="4"' + (required ? ' required' : '') + '>' + escapeHtml(current || '') + '</textarea>' +
      (hint ? '<small class="field-hint">' + escapeHtml(hint) + '</small>' : '') + '</label>';
  }

  function numberField(name, label, current, min, max, required) {
    return '<label class="field-group"><span class="field-label">' + escapeHtml(label) + (required ? ' <b class="required-mark">*</b>' : '') + '</span>' +
      '<input type="number" name="' + escapeHtml(name) + '" value="' + escapeHtml(current) + '" min="' + min + '" max="' + max + '" step="1"' + (required ? ' required' : '') + '></label>';
  }

  function selectField(name, label, current, options, required) {
    var html = '<label class="field-group"><span class="field-label">' + escapeHtml(label) + (required ? ' <b class="required-mark">*</b>' : '') + '</span><select name="' + escapeHtml(name) + '"' + (required ? ' required' : '') + '>';
    html += '<option value="">請選擇</option>';
    options.forEach(function (option) {
      html += '<option value="' + escapeHtml(option) + '"' + selected(current, option) + '>' + escapeHtml(option) + '</option>';
    });
    return html + '</select></label>';
  }

  function collectActionPayload(form, action, signatureController) {
    var data = new FormData(form);
    var payload = { action: action };
    if (action === 'manager_submit') {
      payload.scores = MANAGER_ITEMS.map(function (_, index) { return Number(data.get('managerScore' + index)); });
      payload.comment = String(data.get('comment') || '').trim();
      payload.signature = signatureController.getSignaturePayload();
    } else if (action === 'edu_submit') {
      payload.accumulatedPoints = Number(data.get('accumulatedPoints'));
      payload.score1 = Number(data.get('score1'));
      payload.ojtCount = Number(data.get('ojtCount'));
      payload.score2 = Number(data.get('score2'));
      payload.score3 = Number(data.get('score3'));
      payload.score4 = Number(data.get('score4'));
      payload.abnormalReport = String(data.get('abnormalReport') || '').trim();
      payload.signature = signatureController.getSignaturePayload();
    } else if (action === 'area_approve') {
      payload.adjustment = Number(data.get('adjustment'));
      payload.comment = String(data.get('comment') || '').trim();
      payload.signature = signatureController.getSignaturePayload();
    } else if (action === 'edu_supervisor_approve' || action === 'employee_confirm' || action === 'department_executive_approve' || action === 'gm_approve') {
      payload.comment = String(data.get('comment') || '').trim();
      payload.signature = signatureController.getSignaturePayload();
    } else {
      payload.reason = String(data.get('reason') || '').trim();
    }
    return payload;
  }

  function formToDraft(form, action) {
    var data = new FormData(form);
    var content = { action: action };
    data.forEach(function (val, key) {
      if (key === 'signatureMode') return;
      content[key] = val;
    });
    return content;
  }

  function applyDraft(form, draft) {
    if (!draft || typeof draft !== 'object') return;
    Object.keys(draft).forEach(function (key) {
      if (key === 'action') return;
      var element = form.elements.namedItem(key);
      if (!element) return;
      if (element instanceof RadioNodeList) return;
      element.value = draft[key];
    });
  }

  window.V3EvaluationForm = Object.freeze({
    ACTION_LABELS: ACTION_LABELS,
    renderActionForm: renderActionForm,
    collectActionPayload: collectActionPayload,
    formToDraft: formToDraft,
    applyDraft: applyDraft,
    escapeHtml: escapeHtml
  });
})();
