(function () {
  'use strict';

  var SAFE_MESSAGE = /[가-힣]/;
  var TECHNICAL_MESSAGE = /DB|API|HTTP|SQL|stack|CORS|Error|(?:^|\s)(?:400|401|403|404|409|422|500)(?:$|\s)/i;
  var FALLBACK_MESSAGE = '학생을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  var CONFIRM_MODAL_ID = 'studentDeleteConfirmModal';
  var pendingConfirmation = null;

  function toast(message, type) {
    if (typeof window.showToast === 'function') window.showToast(message, type);
  }

  function safeFailureMessage(error) {
    var message = error && error.message;
    if (
      typeof message === 'string' &&
      SAFE_MESSAGE.test(message) &&
      !TECHNICAL_MESSAGE.test(message)
    ) return message;
    return FALLBACK_MESSAGE;
  }

  function hasMatchingErrorToast(message) {
    if (!window.document || typeof window.document.querySelectorAll !== 'function') return false;
    return Array.prototype.some.call(
      window.document.querySelectorAll('.toast.error span'),
      function (element) { return element.textContent === message; },
    );
  }

  function settleConfirmation(confirmed) {
    if (!pendingConfirmation) return;
    var resolve = pendingConfirmation;
    pendingConfirmation = null;
    window.closeModal(CONFIRM_MODAL_ID);
    resolve(confirmed);
  }

  function bindConfirmationDialog() {
    if (!window.document) return;
    var modal = window.document.getElementById(CONFIRM_MODAL_ID);
    var close = window.document.getElementById('studentDeleteConfirmClose');
    var cancel = window.document.getElementById('studentDeleteConfirmCancel');
    var submit = window.document.getElementById('studentDeleteConfirmSubmit');
    if (!modal || !close || !cancel || !submit) return;

    close.addEventListener('click', function () { settleConfirmation(false); });
    cancel.addEventListener('click', function () { settleConfirmation(false); });
    submit.addEventListener('click', function () { settleConfirmation(true); });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) settleConfirmation(false);
    });
    window.document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && pendingConfirmation) settleConfirmation(false);
    });
  }

  function confirmStudentDeletion(studentName) {
    var message = window.document && window.document.getElementById('studentDeleteConfirmMessage');
    var submit = window.document && window.document.getElementById('studentDeleteConfirmSubmit');
    if (
      !message || !submit ||
      typeof window.openModal !== 'function' ||
      typeof window.closeModal !== 'function'
    ) {
      toast('삭제 확인 창을 열 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.', 'error');
      return Promise.resolve(false);
    }
    if (pendingConfirmation) return Promise.resolve(false);

    message.textContent = studentName + ' 학생을 삭제하시겠습니까? 삭제된 학생 정보는 복구할 수 없습니다.';
    return new Promise(function (resolve) {
      pendingConfirmation = resolve;
      window.openModal(CONFIRM_MODAL_ID);
      if (typeof submit.focus === 'function') submit.focus();
    });
  }

  async function deleteStudent(options) {
    var button = options.button;
    if (!button || button.disabled) return false;

    var studentName = options.studentName || '선택한';
    var confirmed = await confirmStudentDeletion(studentName);
    if (!confirmed) return false;

    button.disabled = true;
    button.textContent = '삭제 중…';
    try {
      var result = await window.api('_student_delete', {
        method: 'POST',
        body: JSON.stringify({ student_id: Number(options.studentId) }),
      });
      if (!result || !result.success) throw new Error(FALLBACK_MESSAGE);
      options.onDeleted();
      toast(studentName + ' 학생을 삭제했습니다.', 'success');
      return true;
    } catch (error) {
      button.disabled = false;
      button.textContent = '삭제';
      var message = safeFailureMessage(error);
      if (!hasMatchingErrorToast(message)) toast(message, 'error');
      return false;
    }
  }

  function removeStudentRow(studentId) {
    var body = window.document.getElementById('studentBody');
    var row = window.document.getElementById('row_' + studentId);
    if (row) row.remove();
    var rows = body.querySelectorAll('tr[id^="row_"]');
    rows.forEach(function (studentRow, index) {
      var numberCell = studentRow.querySelector('td');
      if (numberCell) numberCell.textContent = index + 1;
    });
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="state-row">등록된 학생이 없습니다.</td></tr>';
    }
  }

  bindConfirmationDialog();

  window.StudentDeletion = {
    deleteStudent: deleteStudent,
    removeStudentRow: removeStudentRow,
  };
})();
