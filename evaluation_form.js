(function () {
  'use strict';

  var MANAGER_ITEMS = [
    {
      key: '責任感', label: '責任感', ranges: [
        { min: 1, max: 2, text: '處事被動，不積極，必須有人經常加以督促。' },
        { min: 3, max: 5, text: '可以信賴，但須略加督促。' },
        { min: 6, max: 7, text: '可獨自負責，處事穩健，須偶爾督促。' },
        { min: 8, max: 10, text: '責任感相當強，可以充分信賴，無須任何督促。' }
      ]
    },
    {
      key: '協調性', label: '協調性', ranges: [
        { min: 1, max: 2, text: '缺乏協調，與同事間偶爾會摩擦。' },
        { min: 3, max: 5, text: '雖不特別致力於他人協調，但亦不與他人發生爭執與摩擦。' },
        { min: 6, max: 7, text: '能與人和諧相處，願接納他人意見而不固執，偶爾熱心助人。' },
        { min: 8, max: 10, text: '能主動與人協調，與上級及同仁維持和諧關係，同事極願與其合作。' }
      ]
    },
    {
      key: '表達能力', label: '表達能力', ranges: [
        { min: 1, max: 2, text: '文筆生硬，言談欠明確，不易讓人了解。' },
        { min: 3, max: 5, text: '表達平平，大致可了解其意，不致引人誤解。' },
        { min: 6, max: 7, text: '表達有條理，使人易於了解。' },
        { min: 8, max: 10, text: '文筆、言談、論理明確，能化繁為簡，密而不漏。' }
      ]
    },
    {
      key: '學習態度', label: '學習態度', ranges: [
        { min: 1, max: 2, text: '不能主動學習，須加以督導。' },
        { min: 3, max: 5, text: '能誠懇接受他人教導，但主動性較弱。' },
        { min: 6, max: 7, text: '針對突發狀況，能主動積極提出疑問並虛心求教。' },
        { min: 8, max: 10, text: '針對可能發生之問題，積極求解，並予以解決。' }
      ]
    },
    {
      key: '解決問題能力', label: '解決問題能力', ranges: [
        { min: 1, max: 2, text: '無法迅速謀求改善對策，並有逃避之現象。' },
        { min: 3, max: 5, text: '能謀求改善之道，但無擔當之魄力。' },
        { min: 6, max: 7, text: '具有解決問題之能力，但須督促完成。' },
        { min: 8, max: 10, text: '能迅速謀求改善對策，無需督促即可完成。' }
      ]
    },
    {
      key: '個人儀容', label: '個人儀容', ranges: [
        { min: 1, max: 2, text: '我行我素，須經常糾正才會改進。' },
        { min: 3, max: 5, text: '達到基本要求。' },
        { min: 6, max: 7, text: '重視清潔衛生。' },
        { min: 8, max: 10, text: '整齊清潔，端正足為模範。' }
      ]
    }
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
    gm_return_department_executive: '退回營業處主管',
    gm_return_education: '退回教育中心例外處理',
    force_transition: '教育中心判斷後強制轉單'
  };

  function getActionLabel(record, action) {
    var status = String(value(record, '流程狀態') || '').trim();
    if (action === 'edu_submit' && status === '待教育中心成員修改') {
      return '修改完成，送教育中心主管重新簽核';
    }
    return ACTION_LABELS[action] || action;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function value(record, key) {
    var raw = record && record[key];
    return raw === null || raw === undefined ? '' : raw;
  }

  function currentNumber(record, key, fallback) {
    var raw = value(record, key);
    var number = Number(raw);
    return raw !== '' && isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
  }

  function selected(current, expected) {
    return String(current) === String(expected) ? ' checked' : '';
  }

  function renderManagerForm(record) {
    var html = '<div class="form-section manager-evaluation-section">' +
      '<div class="section-title-row"><div><h3>門市店主管評分</h3><p class="section-help">請依各項完整標準點選 1～10 分，六項最高 60 分。</p></div>' +
      '<div class="score-total-badge"><span>店主管小計</span><strong data-manager-total>0／60</strong></div></div>' +
      '<div class="manager-criteria-list">';

    MANAGER_ITEMS.forEach(function (item, index) {
      html += '<article class="manager-criterion"><div class="criterion-heading"><h4>' + escapeHtml(item.label) + '</h4>' +
        '<strong data-manager-item-score="' + index + '">尚未評分</strong></div><div class="criterion-range-grid">';
      item.ranges.forEach(function (range) {
        html += '<section class="criterion-range"><div class="criterion-range-label">' + range.min + '～' + range.max + '分</div>' +
          '<p>' + escapeHtml(range.text) + '</p><div class="score-button-row">';
        for (var score = range.min; score <= range.max; score += 1) {
          html += '<label class="score-choice"><input type="radio" name="managerScore' + index + '" value="' + score + '"' +
            selected(value(record, item.key), score) + ' required><span>' + score + '</span></label>';
        }
        html += '</div></section>';
      });
      html += '</div></article>';
    });

    html += '</div>' + textareaField('comment', '門市店主管評語', value(record, '門市店主管評語'), true, '') + '</div>' + signatureBlock();
    return html;
  }

  function renderEducationForm(record) {
    var weeklyError = currentNumber(record, '每週回報錯誤次數', '');
    var weeklyMissing = currentNumber(record, '每週未回報次數', '');
    var trainingAttendance = currentNumber(record, '培訓出勤異常次數', '');
    var assignmentLate = currentNumber(record, '作業遲繳天數', '');

    if (weeklyError === '' && weeklyMissing === '') {
      weeklyError = Math.max(0, 5 - currentNumber(record, '每週進度回報得分', 5));
      weeklyMissing = 0;
    }
    if (trainingAttendance === '' && assignmentLate === '') {
      trainingAttendance = Math.max(0, 10 - currentNumber(record, '培訓課程狀況得分', 10));
      assignmentLate = 0;
    }

    var html = '<div class="form-section education-evaluation-section">' +
      '<div class="section-title-row"><div><h3>教育中心填寫（學習成果階段，共40分）</h3>' +
      '<p class="section-help">請先登錄實際累計資料，再依規則完成四項評分。</p></div>' +
      '<div class="education-total-badge"><span>教育中心階段合計</span><strong data-education-total>0／40分</strong></div></div>' +
      '<div class="education-source-grid">' +
        plainNumberField('accumulatedPoints', '職能積分累計', value(record, '職能積分累計'), 0, 999999, true) +
        plainNumberField('ojtCount', 'OJT完成篇數', value(record, 'OJT完成篇數'), 0, 9999, true) +
      '</div>' +
      '<div class="education-score-grid">' +
        educationBinaryCard('1. 職能積分得分', '職能總分 ÷ 培訓月份＝每月積分目標；進度內滿分，落後0分。', 'score1', value(record, '職能積分得分'), [0, 15]) +
        educationBinaryCard('2. OJT完成篇數得分', '第2月／2篇、第3月／4篇、第4月／6篇；進度內滿分，落後0分。', 'score2', value(record, 'OJT得分'), [0, 10]) +
        educationCounterCard({
          title: '3. 每週進度回報得分', maxScore: 5,
          rule: '回報錯誤或未回報，每次扣1分；最低0分。',
          counters: [
            { name: 'weeklyErrorCount', label: '回報錯誤次數', value: weeklyError, unit: '次' },
            { name: 'weeklyMissingCount', label: '未回報次數', value: weeklyMissing, unit: '次' }
          ], scoreName: 'score3', scoreValue: value(record, '每週進度回報得分')
        }) +
        educationCounterCard({
          title: '4. 培訓課程狀況得分', maxScore: 10,
          rule: '晚到／曠課每次扣1分；作業每遲繳1天扣1分；最低0分。',
          counters: [
            { name: 'trainingAttendanceCount', label: '晚到／曠課次數', value: trainingAttendance, unit: '次' },
            { name: 'assignmentLateDays', label: '作業遲繳天數', value: assignmentLate, unit: '天' }
          ], scoreName: 'score4', scoreValue: value(record, '培訓課程狀況得分')
        }) +
      '</div>' +
      textareaField('abnormalReport', '教育中心異常回報', value(record, '教育中心異常回報'), true, '') +
      '</div>' + signatureBlock();
    return html;
  }

  function educationBinaryCard(title, rule, name, current, options) {
    var html = '<article class="education-score-card"><h4>' + escapeHtml(title) + '</h4><p>' + escapeHtml(rule) + '</p><div class="binary-score-buttons">';
    options.forEach(function (option) {
      html += '<label class="binary-score-choice"><input type="radio" name="' + escapeHtml(name) + '" value="' + option + '"' +
        selected(current, option) + ' required><span>' + option + '分</span></label>';
    });
    return html + '</div></article>';
  }

  function educationCounterCard(config) {
    var html = '<article class="education-score-card counter-score-card" data-counter-score-card data-max-score="' + config.maxScore + '" data-score-name="' + escapeHtml(config.scoreName) + '">' +
      '<div class="counter-card-heading"><h4>' + escapeHtml(config.title) + '</h4><span class="max-score-pill">滿分' + config.maxScore + '分</span></div>' +
      '<p>' + escapeHtml(config.rule) + '</p><div class="counter-grid">';
    config.counters.forEach(function (counter) {
      html += '<div class="counter-box"><span>' + escapeHtml(counter.label) + '</span><div class="counter-control">' +
        '<button type="button" class="counter-button" data-counter-change="-1" data-counter-target="' + escapeHtml(counter.name) + '" aria-label="減少' + escapeHtml(counter.label) + '">－</button>' +
        '<input type="number" class="counter-input" name="' + escapeHtml(counter.name) + '" value="' + escapeHtml(counter.value) + '" min="0" max="999" step="1" inputmode="numeric" required>' +
        '<em>' + escapeHtml(counter.unit) + '</em>' +
        '<button type="button" class="counter-button" data-counter-change="1" data-counter-target="' + escapeHtml(counter.name) + '" aria-label="增加' + escapeHtml(counter.label) + '">＋</button>' +
        '</div></div>';
    });
    html += '</div><input type="hidden" name="' + escapeHtml(config.scoreName) + '" value="' + escapeHtml(config.scoreValue) + '">' +
      '<div class="score-result-grid"><div class="deduction-result"><span>本項扣分</span><strong data-deduction>0分</strong></div>' +
      '<div class="earned-result"><span>實得分數</span><strong data-earned>' + config.maxScore + '／' + config.maxScore + '分</strong></div></div></article>';
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
    var commentRequired = action === 'area_approve';
    var html = '<div class="form-section"><h3>' + escapeHtml(ACTION_LABELS[action] || '簽核') + '</h3>';
    if (action === 'area_approve') {
      html += plainNumberField('adjustment', '區主管增減分（-10～10）', value(record, '區主管增減分') === '' ? 0 : value(record, '區主管增減分'), -10, 10, true);
    }
    html += textareaField('comment', pair[0], approvalCommentValue(record, action, pair[1]), commentRequired, '');
    html += '</div>' + signatureBlock();
    return html;
  }

  function approvalCommentValue(record, action, fieldName) {
    var resultFields = {
      edu_supervisor_approve: '教育中心主管簽核結果',
      area_approve: '區主管簽核結果',
      employee_confirm: '受評人員確認結果',
      department_executive_approve: '營業處主管簽核結果',
      gm_approve: '總經理簽核結果'
    };
    var result = value(record, resultFields[action] || '');
    if (result === '退回' || result === '提出疑慮' || result === '待重新簽核') return '';
    return value(record, fieldName);
  }

  function renderReturnForm(record, action) {
    return '<div class="form-section form-section--return"><h3>' + escapeHtml(ACTION_LABELS[action] || '退回') + '</h3>' +
      textareaField('reason', '退回原因', '', true, '請具體說明需要修改的內容。') + '</div>';
  }

  function renderForceTransitionForm(record) {
    return '<div class="form-section form-section--return"><h3>教育中心例外轉單</h3>' +
      '<p class="section-help">請確認問題應由哪個階段修改。轉單後，從該階段起的後續簽名會改為待重新簽核。</p>' +
      '<label class="field-group"><span class="field-label">轉單目標 <b class="required-mark">*</b></span>' +
        '<select name="target" required>' +
          '<option value="">請選擇</option>' +
          '<option value="門市店主管">門市店主管</option>' +
          '<option value="教育中心成員">教育中心成員</option>' +
          '<option value="教育中心主管">教育中心主管</option>' +
          '<option value="區主管">區主管</option>' +
          '<option value="受評人員">受評人員</option>' +
          '<option value="營業處主管">營業處主管</option>' +
          '<option value="總經理">總經理</option>' +
        '</select></label>' +
      '<label class="field-group"><span class="field-label">指定承辦人工號（必要時填寫）</span>' +
        '<input type="text" name="targetEmployeeId" autocomplete="off" placeholder="主管離職、停用或多人重複時，輸入指定工號"></label>' +
      textareaField('reason', '轉單原因', '', true, '請說明問題與指定修改階段的原因。') +
      '<label class="choice-card"><input type="checkbox" name="secondConfirmed" value="true" required> 我已確認本次強制轉單會留下完整操作紀錄</label>' +
      '</div>';
  }

  function renderActionForm(record, action) {
    if (action === 'force_transition') return renderForceTransitionForm(record);
    if (action === 'manager_submit') return renderManagerForm(record);
    if (action === 'edu_submit') return renderEducationForm(record);
    if (action === 'edu_supervisor_approve' || action === 'area_approve' || action === 'employee_confirm' || action === 'department_executive_approve' || action === 'gm_approve') {
      return renderSimpleApprovalForm(record, action);
    }
    return renderReturnForm(record, action);
  }

  function signatureBlock() {
    return '<div class="form-section signature-section" data-signature-section>' +
      '<h3>本次簽名</h3><p class="section-help">其他角色只會看到「已簽核＋日期」，不會看到您的簽名圖片。</p>' +
      '<div class="signature-mode-grid">' +
        '<label class="choice-card"><input type="radio" name="signatureMode" value="saved" data-signature-saved> 使用本人預存簽名</label>' +
        '<label class="choice-card"><input type="radio" name="signatureMode" value="drawn" data-signature-drawn> 本次手寫簽名</label>' +
      '</div>' +
      '<div class="signature-panel" data-saved-panel><p data-saved-status>正在檢查預存簽名…</p><img class="signature-preview" data-saved-preview alt="本人預存簽名預覽" hidden></div>' +
      '<div class="signature-panel" data-drawn-panel hidden><canvas class="signature-canvas" data-signature-canvas aria-label="手寫簽名區"></canvas>' +
        '<label class="signature-save-personal"><input type="checkbox" data-save-personal checked> 將本次手寫簽名設為我的預存簽名</label>' +
        '<p class="section-help">預存簽名只供下次本人使用；本張表與PDF會保存本次獨立快照，不會因日後更新簽名而改變。</p>' +
        '<button type="button" class="small-button" data-clear-signature>清除重簽</button></div>' +
      '</div>';
  }

  function textareaField(name, label, current, required, hint) {
    return '<label class="field-group"><span class="field-label">' + escapeHtml(label) + (required ? ' <b class="required-mark">*</b>' : '') + '</span>' +
      '<textarea name="' + escapeHtml(name) + '" rows="4"' + (required ? ' required' : '') + '>' + escapeHtml(current || '') + '</textarea>' +
      (hint ? '<small class="field-hint">' + escapeHtml(hint) + '</small>' : '') + '</label>';
  }

  function plainNumberField(name, label, current, min, max, required) {
    return '<label class="field-group"><span class="field-label">' + escapeHtml(label) + (required ? ' <b class="required-mark">*</b>' : '') + '</span>' +
      '<input type="number" name="' + escapeHtml(name) + '" value="' + escapeHtml(current) + '" min="' + min + '" max="' + max + '" step="1" inputmode="numeric"' + (required ? ' required' : '') + '></label>';
  }

  function collectActionPayload(form, action, signatureController) {
    refreshInteractiveControls(form);
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
      payload.weeklyErrorCount = Number(data.get('weeklyErrorCount'));
      payload.weeklyMissingCount = Number(data.get('weeklyMissingCount'));
      payload.trainingAttendanceCount = Number(data.get('trainingAttendanceCount'));
      payload.assignmentLateDays = Number(data.get('assignmentLateDays'));
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
    } else if (action === 'force_transition') {
      payload.target = String(data.get('target') || '').trim();
      payload.targetEmployeeId = String(data.get('targetEmployeeId') || '').trim().toUpperCase();
      payload.reason = String(data.get('reason') || '').trim();
      payload.secondConfirmed = data.get('secondConfirmed') === 'true';
      payload.skippedStages = [];
    } else {
      payload.reason = String(data.get('reason') || '').trim();
    }
    return payload;
  }

  function initializeInteractiveControls(form) {
    if (!form || form.__v3InteractiveInitialized) {
      refreshInteractiveControls(form);
      return;
    }
    form.__v3InteractiveInitialized = true;
    form.addEventListener('click', function (event) {
      var button = event.target.closest('[data-counter-change]');
      if (!button || !form.contains(button)) return;
      var target = form.elements.namedItem(button.getAttribute('data-counter-target'));
      if (!target) return;
      var current = Math.max(0, Math.floor(Number(target.value) || 0));
      var change = Number(button.getAttribute('data-counter-change')) || 0;
      target.value = String(Math.max(0, Math.min(999, current + change)));
      target.dispatchEvent(new Event('input', { bubbles: true }));
      refreshInteractiveControls(form);
    });
    form.addEventListener('input', function () { refreshInteractiveControls(form); });
    form.addEventListener('change', function () { refreshInteractiveControls(form); });
    refreshInteractiveControls(form);
  }

  function refreshInteractiveControls(form) {
    if (!form) return;
    refreshManagerTotal(form);
    refreshEducationScores(form);
  }

  function refreshManagerTotal(form) {
    var total = 0;
    var completed = 0;
    MANAGER_ITEMS.forEach(function (_, index) {
      var selectedNode = form.querySelector('input[name="managerScore' + index + '"]:checked');
      var scoreNode = form.querySelector('[data-manager-item-score="' + index + '"]');
      if (selectedNode) {
        total += Number(selectedNode.value) || 0;
        completed += 1;
        if (scoreNode) scoreNode.textContent = selectedNode.value + '分';
      } else if (scoreNode) {
        scoreNode.textContent = '尚未評分';
      }
    });
    var totalNode = form.querySelector('[data-manager-total]');
    if (totalNode) totalNode.textContent = total + '／60' + (completed < 6 ? '（已完成' + completed + '項）' : '');
  }

  function refreshEducationScores(form) {
    var cards = form.querySelectorAll('[data-counter-score-card]');
    Array.prototype.forEach.call(cards, function (card) {
      var max = Number(card.getAttribute('data-max-score')) || 0;
      var scoreName = card.getAttribute('data-score-name');
      var inputs = card.querySelectorAll('.counter-input');
      var totalIssues = 0;
      Array.prototype.forEach.call(inputs, function (input) {
        var number = Math.max(0, Math.min(999, Math.floor(Number(input.value) || 0)));
        if (String(input.value) !== String(number)) input.value = String(number);
        totalIssues += number;
      });
      var deducted = Math.min(max, totalIssues);
      var earned = Math.max(0, max - totalIssues);
      var hidden = form.elements.namedItem(scoreName);
      if (hidden) hidden.value = String(earned);
      var deductionNode = card.querySelector('[data-deduction]');
      var earnedNode = card.querySelector('[data-earned]');
      if (deductionNode) deductionNode.textContent = (deducted ? '－' + deducted : '0') + '分';
      if (earnedNode) earnedNode.textContent = earned + '／' + max + '分';
    });

    var score1 = checkedNumber(form, 'score1');
    var score2 = checkedNumber(form, 'score2');
    var score3 = numberFromForm(form, 'score3');
    var score4 = numberFromForm(form, 'score4');
    var totalNode = form.querySelector('[data-education-total]');
    if (totalNode) totalNode.textContent = (score1 + score2 + score3 + score4) + '／40分';
  }

  function checkedNumber(form, name) {
    var node = form.querySelector('input[name="' + name + '"]:checked');
    return node ? Number(node.value) || 0 : 0;
  }

  function numberFromForm(form, name) {
    var node = form.elements.namedItem(name);
    return node ? Number(node.value) || 0 : 0;
  }

  function formToDraft(form, action) {
    refreshInteractiveControls(form);
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
      if (key === 'action' || key === 'dataVersion' || key === 'workflowStatus') return;
      var element = form.elements.namedItem(key);
      if (!element) return;
      if (typeof RadioNodeList !== 'undefined' && element instanceof RadioNodeList) {
        Array.prototype.forEach.call(element, function (radio) { radio.checked = String(radio.value) === String(draft[key]); });
      } else if (element.length && element[0] && element[0].type === 'radio') {
        Array.prototype.forEach.call(element, function (radio) { radio.checked = String(radio.value) === String(draft[key]); });
      } else {
        element.value = draft[key];
      }
    });
    refreshInteractiveControls(form);
  }

  window.V3EvaluationForm = Object.freeze({
    ACTION_LABELS: ACTION_LABELS,
    getActionLabel: getActionLabel,
    renderActionForm: renderActionForm,
    collectActionPayload: collectActionPayload,
    initializeInteractiveControls: initializeInteractiveControls,
    refreshInteractiveControls: refreshInteractiveControls,
    formToDraft: formToDraft,
    applyDraft: applyDraft,
    escapeHtml: escapeHtml
  });
})();
