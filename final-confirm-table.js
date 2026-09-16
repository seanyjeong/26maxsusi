(function () {
  'use strict';

  window.createFinalConfirmTable = function ({ studentMap: currentStudentMap, getPracticalEvents, onDelete }) {
    const esc = window.escapeHtml;

    // ───────── 테이블 렌더 ─────────
    function renderTable(students) {
      const thead = document.getElementById('resultThead');
      const tbody = document.getElementById('resultTbody');
      thead.innerHTML = '';
      tbody.innerHTML = '';
      currentStudentMap.clear();
      students.forEach(s => currentStudentMap.set(s.학생ID, s));

      thead.innerHTML =
        '<tr>' +
        '<th>이름</th><th>학년</th><th>성별</th>' +
        '<th>등급</th><th>내신점수</th>' +
        '<th>실기종목</th><th>실기일정</th><th>합산점수</th><th>관리</th>' +
        '</tr>';

      if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="placeholder">해당 전형으로 수합된 학생이 없습니다.</td></tr>';
        return;
      }
      students.forEach(s => addStudentRow(s, false));
    }

    function addStudentRow(student, isNew) {
      if (!student) return;
      if (isNew === undefined) isNew = true;
      if (isNew && currentStudentMap.has(student.학생ID)) return;

      const tbody = document.getElementById('resultTbody');
      if (tbody.querySelector('td.placeholder')) tbody.innerHTML = '';
      currentStudentMap.set(student.학생ID, student);

      const row = document.createElement('tr');
      row.dataset.studentId = String(student.학생ID);

      const eventsLabel = getPracticalEvents().length > 0 ? getPracticalEvents().join(', ') : '비실기';
      const total = student.합산점수 != null ? parseFloat(student.합산점수).toFixed(2) : '-';

      row.innerHTML =
        `<td>${esc(student.이름 || '-')}</td>` +
        `<td>${esc(student.학년 || '-')}</td>` +
        `<td>${esc(student.성별 || '-')}</td>` +
        `<td><input class="input-grade" type="text" value="${esc(student.내신등급 || '')}"></td>` +
        `<td><input class="input-score" type="text" value="${esc(student.내신점수 != null ? student.내신점수 : '')}"></td>` +
        `<td>${esc(eventsLabel)}</td>` +
        `<td>${window.StudentPracticalSchedule.renderInputs(student.실기일정, student.이름)}</td>` +
        `<td>${esc(total)}</td>` +
        `<td><button type="button" class="fc-delete-btn" data-action="delete">삭제</button></td>`;

      tbody.appendChild(row);

      // 삭제 버튼 이벤트
      const delBtn = row.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => onDelete(row));
      }
    }

    return { renderTable, addStudentRow };
  };
})();
