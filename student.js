/* ============================================================
 * student.new.js — 학생 명단 관리 (Phase 3 Batch 2)
 * 기능 diff 0 — 원본 student.html 의 UX 100% 보존
 *   - 5행 선등록 + 엑셀 다중행 붙여넣기 + Ctrl+Z 되돌리기
 *   - _student_bulk_insert / _student_list / _student_update / _student_delete
 *   - 기존 팝업 UX → showToast / window.confirm
 * API: 모든 호출 window.api(path) 경유
 * ============================================================ */

(function () {
  'use strict';

  // ── 상수 / 상태 ──────────────────────────────────────────────
  var INITIAL_ROWS = 5;
  var branch = '';
  var beforePasteState = null;

  // ── 헬퍼 ────────────────────────────────────────────────────
  function $(sel, root) { return (root || document).querySelector(sel); }
  var esc = window.escapeHtml;

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type || 'success');
  }

  // 단순 confirm (원본의 confirm 모달 대체 — 브라우저 기본 confirm)
  // 공용 모달 사용 시 신규 DOM 추가가 필요해 "신규 모달 금지" 규칙에 부딪힘 →
  // 브라우저 native confirm 으로 동일한 "확인/취소" UX 보존.
  function confirmDelete(text) {
    return window.confirm(text);
  }

  // ── 지점 표시 ────────────────────────────────────────────────
  function renderBranch() {
    var info = (window.getCounselorFromToken && window.getCounselorFromToken()) || {};
    branch = info.branch || '';
    var chip = document.getElementById('branchChip');
    var txt = document.getElementById('branchChipText');
    if (txt) txt.textContent = '내 지점: ' + (branch || '(지점정보없음)');
    if (chip) chip.hidden = false;
  }

  // ── 등록 테이블: 행 관리 ────────────────────────────────────
  function addRegRow() {
    var tbody = document.getElementById('regTbody');
    var tr = document.createElement('tr');
    tr.className = 'reg-row';
    var idx = tbody.children.length + 1;
    tr.innerHTML =
      '<td class="num-cell">' + idx + '</td>' +
      '<td><input type="text" name="name"></td>' +
      '<td><input type="text" name="school"></td>' +
      '<td><input type="text" name="grade"></td>' +
      '<td><input type="text" name="gender"></td>' +
      '<td><input type="text" name="phone"></td>' +
      '<td><button type="button" class="row-btn danger">삭제</button></td>';

    // paste 핸들러 (이름 input)
    var nameInput = tr.querySelector('input[name="name"]');
    nameInput.addEventListener('paste', function (e) { handlePaste(e, nameInput); });

    // 행 삭제
    tr.querySelector('.row-btn.danger').addEventListener('click', function () {
      tr.remove();
      reNumberRows();
    });

    tbody.appendChild(tr);
  }

  function reNumberRows() {
    var rows = document.querySelectorAll('#regTbody tr');
    rows.forEach(function (tr, i) {
      var cell = tr.querySelector('.num-cell');
      if (cell) cell.textContent = i + 1;
    });
  }

  function getCurrentRegState() {
    return Array.prototype.map.call(
      document.querySelectorAll('#regTbody tr'),
      function (row) {
        return {
          name:   row.querySelector('input[name="name"]').value,
          school: row.querySelector('input[name="school"]').value,
          grade:  row.querySelector('input[name="grade"]').value,
          gender: row.querySelector('input[name="gender"]').value,
          phone:  row.querySelector('input[name="phone"]').value,
        };
      }
    );
  }

  function restoreRegState(state) {
    var rows = document.querySelectorAll('#regTbody tr');
    rows.forEach(function (row, i) {
      if (state[i]) {
        row.querySelector('input[name="name"]').value   = state[i].name;
        row.querySelector('input[name="school"]').value = state[i].school;
        row.querySelector('input[name="grade"]').value  = state[i].grade;
        row.querySelector('input[name="gender"]').value = state[i].gender;
        row.querySelector('input[name="phone"]').value  = state[i].phone;
      }
    });
  }

  // ── 붙여넣기 파서 (원본 로직 그대로) ────────────────────────
  function handlePaste(e, targetInput) {
    beforePasteState = getCurrentRegState();

    var clipboard = e.clipboardData || window.clipboardData;
    var text = clipboard.getData('text');
    var lines = text.split(/\r?\n/).filter(function (line) { return line.trim(); });
    if (lines.length < 2 && (!lines[0] || lines[0].split('\t').length < 2)) return;

    e.preventDefault();
    var tr = targetInput.closest('tr');
    var tbody = document.getElementById('regTbody');
    var startIdx = Array.prototype.indexOf.call(tbody.children, tr);

    lines.forEach(function (line, i) {
      var arr = line.split('\t');
      var row;
      if (tbody.children[startIdx + i]) {
        row = tbody.children[startIdx + i];
      } else {
        addRegRow();
        row = tbody.children[tbody.children.length - 1];
      }
      if (arr[0]) row.querySelector('input[name="name"]').value   = arr[0].trim();
      if (arr[1]) row.querySelector('input[name="school"]').value = arr[1].trim();
      if (arr[2]) row.querySelector('input[name="grade"]').value  = arr[2].trim();
      if (arr[3]) row.querySelector('input[name="gender"]').value = arr[3].trim();
      if (arr[4]) row.querySelector('input[name="phone"]').value  = arr[4].trim();
    });
    reNumberRows();
  }

  // Ctrl+Z 되돌리기 — 원본 동일
  function bindUndo() {
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'z') {
        if (beforePasteState) {
          e.preventDefault();
          restoreRegState(beforePasteState);
          beforePasteState = null;
          toast('붙여넣기를 되돌렸습니다.', 'info');
        }
      }
    });
  }

  // ── 신규 명단 등록 ──────────────────────────────────────────
  async function submitBulkInsert(e) {
    e.preventDefault();
    var students = Array.prototype.map.call(
      document.querySelectorAll('#regTbody tr'),
      function (row) {
        return {
          name:   row.querySelector('input[name="name"]').value.trim(),
          school: row.querySelector('input[name="school"]').value.trim(),
          grade:  row.querySelector('input[name="grade"]').value.trim(),
          gender: row.querySelector('input[name="gender"]').value.trim(),
          phone:  row.querySelector('input[name="phone"]').value.trim(),
        };
      }
    ).filter(function (s) { return s.name; });

    if (!students.length) {
      toast('입력된 학생이 없습니다!', 'error');
      return;
    }

    try {
      var json = await window.api('_student_bulk_insert', {
        method: 'POST',
        body: JSON.stringify({ branch: branch, students: students }),
      });
      if (json && json.success) {
        toast((json.inserted || students.length) + '명의 학생이 등록되었습니다.', 'success');
        document.getElementById('regTbody').innerHTML = '';
        for (var i = 0; i < INITIAL_ROWS; i++) addRegRow();
        loadStudents();
      } else {
        toast((json && json.message) || '서버 오류가 발생했습니다.', 'error');
      }
    } catch (err) {
      toast(err && err.message ? err.message : '등록 실패', 'error');
    }
  }

  // ── 기존 학생 목록 로드 ──────────────────────────────────────
  async function loadStudents() {
    var body = document.getElementById('studentBody');
    var msg = document.getElementById('msg');
    if (msg) { msg.hidden = true; msg.textContent = ''; }

    try {
      var json = await window.api('_student_list');
      if (!json || !json.success) {
        body.innerHTML = '<tr><td colspan="7" class="state-row">오류! 다시 로그인 해주세요.</td></tr>';
        return;
      }
      if (!json.students || !json.students.length) {
        body.innerHTML = '<tr><td colspan="7" class="state-row">등록된 학생이 없습니다.</td></tr>';
        return;
      }
      var html = '';
      json.students.forEach(function (s, idx) {
        var sid = s.학생ID;
        html +=
          '<tr id="row_' + sid + '">' +
            '<td>' + (idx + 1) + '</td>' +
            '<td><input type="text" value="' + esc(s.이름) + '" data-field="name" data-sid="' + sid + '"></td>' +
            '<td><input type="text" value="' + esc(s.학교명) + '" data-field="school" data-sid="' + sid + '"></td>' +
            '<td><input type="text" value="' + esc(s.학년) + '" data-field="grade" data-sid="' + sid + '"></td>' +
            '<td><input type="text" value="' + esc(s.성별) + '" data-field="gender" data-sid="' + sid + '"></td>' +
            '<td><input type="text" value="' + esc(s.전화번호) + '" data-field="phone" data-sid="' + sid + '"></td>' +
            '<td>' +
              '<button class="row-btn primary" data-action="save" data-sid="' + sid + '" disabled>저장</button>' +
              '<button class="row-btn danger" data-action="delete" data-sid="' + sid + '">삭제</button>' +
            '</td>' +
          '</tr>';
      });
      body.innerHTML = html;
    } catch (err) {
      body.innerHTML = '<tr><td colspan="7" class="state-row">오류! 다시 로그인 해주세요.</td></tr>';
      if (msg) { msg.hidden = false; msg.textContent = err && err.message ? err.message : '목록 로드 실패'; }
    }
  }

  // 수정 시 저장 버튼 활성화 (이벤트 위임)
  function bindStudentTableDelegation() {
    var body = document.getElementById('studentBody');

    body.addEventListener('input', function (e) {
      var input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      var sid = input.getAttribute('data-sid');
      if (!sid) return;
      var btn = body.querySelector('button[data-action="save"][data-sid="' + sid + '"]');
      if (btn) btn.disabled = false;
    });

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var sid = btn.getAttribute('data-sid');
      var action = btn.getAttribute('data-action');
      if (action === 'save') saveEdit(sid, btn);
      else if (action === 'delete') delStudent(sid);
    });
  }

  async function saveEdit(sid, btn) {
    var row = document.getElementById('row_' + sid);
    if (!row) return;
    var data = {
      student_id: Number(sid),
      name:   row.querySelector('input[data-field="name"]').value.trim(),
      school: row.querySelector('input[data-field="school"]').value.trim(),
      grade:  row.querySelector('input[data-field="grade"]').value.trim(),
      gender: row.querySelector('input[data-field="gender"]').value.trim(),
      phone:  row.querySelector('input[data-field="phone"]').value.trim(),
    };
    if (btn) btn.disabled = true;

    try {
      var json = await window.api('_student_update', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!json || !json.success) {
        toast((json && json.message) || '서버 오류', 'error');
        if (btn) btn.disabled = false;
      } else {
        toast('수정 완료!', 'success');
      }
    } catch (err) {
      toast(err && err.message ? err.message : '수정 실패', 'error');
      if (btn) btn.disabled = false;
    }
  }

  async function delStudent(sid) {
    var ok = confirmDelete('정말 삭제하시겠습니까?\n\n삭제된 학생 정보는 복구할 수 없습니다.');
    if (!ok) return;
    try {
      var json = await window.api('_student_delete', {
        method: 'POST',
        body: JSON.stringify({ student_id: Number(sid) }),
      });
      if (json && json.success) {
        toast('학생 정보가 삭제되었습니다.', 'success');
        loadStudents();
      } else {
        toast((json && json.message) || '서버 오류', 'error');
      }
    } catch (err) {
      toast(err && err.message ? err.message : '삭제 실패', 'error');
    }
  }

  // ── 초기화 ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.getToken || !window.getToken()) {
      window.location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
      return;
    }

    renderBranch();

    for (var i = 0; i < INITIAL_ROWS; i++) addRegRow();

    document.getElementById('btnAddRow').addEventListener('click', addRegRow);
    document.getElementById('regForm').addEventListener('submit', submitBulkInsert);

    bindUndo();
    bindStudentTableDelegation();

    loadStudents();
  });
})();
