/* ============================================================
 * pass_result.js — 합불 결과 입력 (지점 현황에서 최초합/최종합만 분리)
 * API: /branch_summary_by_university · /profile · _pass_save
 * _pass_save 는 최초합여부·최종합여부만 UPDATE 하는 전용 API —
 * 실기기록·점수·내신·합산은 서버에서 쓸 수 없다.
 * ============================================================ */

(function () {
  'use strict';

  var esc = window.escapeHtml;

  var allUniversityData = [];

  /* ---- Init ---- */
  document.addEventListener('DOMContentLoaded', function () {
    var token = window.getToken();
    if (!token) { location.href = 'login.html'; return; }

    loadSummary();
  });

  /* ---- Load summary + profile ---- */
  async function loadSummary() {
    var accordion = document.getElementById('universityAccordion');
    accordion.innerHTML = '<div class="placeholder">데이터를 불러오는 중입니다...</div>';
    try {
      var results = await Promise.all([
        window.api('/branch_summary_by_university'),
        window.api('/profile'),
      ]);
      var summaryData = results[0];
      var profileData = results[1];

      if (profileData && profileData.success && profileData.user) {
        var title = document.getElementById('mainTitle');
        if (title) title.textContent = (profileData.user.branch || '지점') + ' 교육원 합불 결과 입력';
      }

      if (!summaryData || !summaryData.success) {
        throw new Error((summaryData && summaryData.message) || '데이터 조회에 실패했습니다.');
      }
      allUniversityData = summaryData.universities || [];
      renderAccordions(allUniversityData);
    } catch (e) {
      console.error('[loadSummary]', e);
      window.showToast('데이터 조회 중 문제가 발생했습니다: ' + (e && e.message ? e.message : ''), 'error');
      accordion.innerHTML = '<div class="placeholder">데이터를 불러오지 못했습니다.</div>';
    }
  }

  function renderAccordions(universities) {
    var container = document.getElementById('universityAccordion');
    var meta = document.getElementById('headMeta');
    container.innerHTML = '';
    if (!universities.length) {
      container.innerHTML = '<div class="placeholder">아직 수합된 대학 정보가 없습니다.</div>';
      if (meta) meta.textContent = '총 0개 대학';
      return;
    }

    universities.forEach(function (uni) {
      var details = document.createElement('details');
      details.className = 'uni-card';
      details.dataset.collegeId = String(uni.대학ID);

      details.innerHTML = ''
        + '<summary>'
        + '  <div class="summary-title">'
        + '    <span class="uni-name">' + esc(uni.대학명) + '</span>'
        + '    <span class="uni-sub">· ' + esc(uni.학과명) + ' · ' + esc(uni.전형명) + '</span>'
        + '  </div>'
        + '  <span class="summary-info">' + passCountText(uni.학생들 || []) + '</span>'
        + '</summary>'
        + '<div class="table-container"></div>';

      container.appendChild(details);

      details.querySelector('summary').addEventListener('click', function () {
        if (!details.open) {
          var tc = details.querySelector('.table-container');
          if (tc.children.length === 0) renderUniversityTable(tc, uni);
        }
      });
    });

    if (meta) meta.textContent = '총 ' + universities.length + '개 대학';
  }

  function passCountText(students) {
    var entered = students.filter(function (s) { return s.최초합여부 || s.최종합여부; }).length;
    return '입력 ' + entered + ' / 총 ' + students.length + '명';
  }

  /* ---- University table render ---- */
  function renderUniversityTable(container, universityData) {
    (universityData.학생들 || []).sort(function (a, b) {
      return (b.합산점수 || 0) - (a.합산점수 || 0);
    });

    function parsePass(value) {
      if (!value) return { status: '', number: '' };
      if (String(value).indexOf('예비') === 0) return { status: '예비', number: String(value).replace('예비', '') };
      return { status: String(value), number: '' };
    }

    function passSelect(status, reserve, label) {
      var options = label === '최초합'
        ? ['', '1차합격', '합격', '불합격', '예비']
        : ['', '최저불합격', '합격', '불합격', '예비'];
      var optHtml = options.map(function (o) {
        var sel = status === o ? ' selected' : '';
        return '<option value="' + esc(o) + '"' + sel + '>' + (o === '' ? '선택' : esc(o)) + '</option>';
      }).join('');
      var numStyle = status === '예비' ? 'block' : 'none';
      return ''
        + '<div class="pass-fail-container">'
        + '  <select class="select-pass-status">' + optHtml + '</select>'
        + '  <input type="number" class="input-reserve-number" value="' + esc(reserve) + '"'
        + '         style="display:' + numStyle + ';" placeholder="번호">'
        + '</div>';
    }

    var rowsHtml = (universityData.학생들 || []).map(function (student) {
      var firstPass = parsePass(student.최초합여부);
      var finalPass = parsePass(student.최종합여부);
      var totalSum = (student.합산점수 !== null && student.합산점수 !== undefined)
        ? Number(student.합산점수).toFixed(2) : '-';

      return ''
        + '<tr data-student-id="' + esc(student.학생ID) + '">'
        + '  <td>' + esc(student.이름) + '</td>'
        + '  <td>' + esc(student.학년) + '</td>'
        + '  <td>' + esc(student.성별) + '</td>'
        + '  <td class="total-sum-cell">' + totalSum + '</td>'
        + '  <td>' + passSelect(firstPass.status, firstPass.number, '최초합') + '</td>'
        + '  <td>' + passSelect(finalPass.status, finalPass.number, '최종합') + '</td>'
        + '</tr>';
    }).join('');

    var html = ''
      + '<table class="summary-table">'
      + '  <thead><tr>'
      + '    <th>이름</th><th>학년</th><th>성별</th><th>합산점수</th><th>최초합</th><th>최종합</th>'
      + '  </tr></thead>'
      + '  <tbody>' + (rowsHtml || '<tr><td colspan="6">등록된 학생이 없습니다.</td></tr>') + '</tbody>'
      + '</table>'
      + '<div class="save-row">'
      + '  <button type="button" class="btn btn-primary" data-action="save-uni">'
      + '    <i class="ph-light ph-floppy-disk"></i><span>' + esc(universityData.대학명) + ' 합불 저장</span>'
      + '  </button>'
      + '</div>';

    container.innerHTML = html;

    container.querySelectorAll('.select-pass-status').forEach(function (sel) {
      sel.addEventListener('change', function () { handlePassStatusChange(sel); });
    });
    var saveBtn = container.querySelector('[data-action="save-uni"]');
    if (saveBtn) saveBtn.addEventListener('click', function () { savePassResults(saveBtn); });
  }

  /* ---- Save ---- */
  async function savePassResults(button) {
    var detailsElement = button.closest('details');
    var collegeId = parseInt(detailsElement.dataset.collegeId, 10);
    var universityData = allUniversityData.find(function (uni) { return uni.대학ID == collegeId; });
    if (!universityData) {
      window.showToast('저장할 대학 정보를 찾지 못했습니다.', 'error');
      return;
    }

    // 예비 번호 검증
    var incompleteReserve = false;
    detailsElement.querySelectorAll('.pass-fail-container').forEach(function (c) {
      var sel = c.querySelector('.select-pass-status');
      var num = c.querySelector('.input-reserve-number');
      if (sel && sel.value === '예비' && num && !num.value) incompleteReserve = true;
    });
    if (incompleteReserve) {
      window.showToast('"예비" 선택 시 예비 번호를 입력해야 합니다.', 'error');
      return;
    }

    button.disabled = true;
    var payload = [];
    detailsElement.querySelectorAll('tbody tr[data-student-id]').forEach(function (row) {
      var containers = row.querySelectorAll('.pass-fail-container');
      function passVal(c) {
        var s = c.querySelector('.select-pass-status').value;
        var n = c.querySelector('.input-reserve-number').value;
        if (s === '예비' && n) return '예비' + n;
        return s;
      }
      payload.push({
        학생ID: parseInt(row.dataset.studentId, 10),
        최초합여부: passVal(containers[0]),
        최종합여부: passVal(containers[1]),
      });
    });

    try {
      var result = await window.api('_pass_save', {
        method: 'POST',
        body: JSON.stringify({ college_id: collegeId, results: payload }),
      });
      if (!result || !result.success) throw new Error((result && result.message) || '저장 실패');

      window.showToast(universityData.대학명 + ' 합불 저장 완료', 'success');

      // 전역 데이터 업데이트 + 요약 갱신
      universityData.학생들 = universityData.학생들.map(function (s) {
        var p = payload.find(function (x) { return x.학생ID == s.학생ID; });
        return p ? Object.assign({}, s, { 최초합여부: p.최초합여부, 최종합여부: p.최종합여부 }) : s;
      });
      detailsElement.querySelector('.summary-info').textContent = passCountText(universityData.학생들);
    } catch (e) {
      console.error('[savePassResults]', e);
      window.showToast('저장 실패: ' + (e && e.message ? e.message : ''), 'error');
    } finally {
      button.disabled = false;
    }
  }

  function handlePassStatusChange(selectElement) {
    var numberInput = selectElement.nextElementSibling;
    if (!numberInput) return;
    if (selectElement.value === '예비') {
      numberInput.style.display = 'block';
      numberInput.focus();
    } else {
      numberInput.style.display = 'none';
      numberInput.value = '';
    }
  }
})();
