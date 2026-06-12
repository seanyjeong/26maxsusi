/* ============================================================
 * branch_summary.new.js — 지점별 최종수합 (원본 415줄 기능 전면 이식)
 * 원본: branch_summary.html
 * API: /branch_summary_by_university · /profile · _final_save ·
 *      /calculate-final-score · /unassigned_students · _get_score_table
 * 원본 alert 는 공용 showToast / openModal 로 대체.
 * ============================================================ */

(function () {
  'use strict';

  var esc = window.escapeHtml;

  var allUniversityData = [];

  /* ---- Init ---- */
  document.addEventListener('DOMContentLoaded', function () {
    var token = window.getToken();
    if (!token) { location.href = 'login.html'; return; }

    bindTopbar();
    bindModals();
    loadSummary();
  });

  function bindTopbar() {
    var btn = document.getElementById('btnCheckUnassigned');
    if (btn) btn.addEventListener('click', checkUnassignedStudents);
  }

  function bindModals() {
    document.querySelectorAll('[data-action="close-score-modal"]').forEach(function (el) {
      el.addEventListener('click', function () { window.closeModal('scoreTableModal'); });
    });
    document.querySelectorAll('[data-action="close-unassigned"]').forEach(function (el) {
      el.addEventListener('click', function () { window.closeModal('unassignedModal'); });
    });
  }

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
        if (title) title.textContent = (profileData.user.branch || '지점') + ' 교육원 최종수합(실기포함)';
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

      var scoreBtn = uni.실기ID
        ? '<button type="button" class="btn-mini" data-action="score-table">배점표</button>'
        : '';

      details.innerHTML = ''
        + '<summary>'
        + '  <div class="summary-title">'
        + '    <span class="uni-name">' + esc(uni.대학명) + '</span>'
        + '    <span class="uni-sub">· ' + esc(uni.학과명) + ' · ' + esc(uni.전형명) + '</span>'
        + '    ' + scoreBtn
        + '  </div>'
        + '  <span class="summary-info">총 ' + (uni.학생들 ? uni.학생들.length : 0) + '명</span>'
        + '</summary>'
        + '<div class="table-container"></div>';

      container.appendChild(details);

      // 배점표 버튼 (이벤트 버블링 중단)
      var sbtn = details.querySelector('[data-action="score-table"]');
      if (sbtn) {
        sbtn.addEventListener('click', function (e) {
          e.stopPropagation();
          e.preventDefault();
          openScoreTablePopup(uni);
        });
      }

      // summary 토글 (버튼 클릭은 제외)
      details.querySelector('summary').addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        if (!details.open) {
          var tc = details.querySelector('.table-container');
          if (tc.children.length === 0) renderUniversityTable(tc, uni);
        }
      });
    });

    if (meta) meta.textContent = '총 ' + universities.length + '개 대학';
  }

  /* ---- University table render ---- */
  function renderUniversityTable(container, universityData) {
    var events = universityData.실기종목 || [];
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
      var scheduleDate = student.실기일정 ? String(student.실기일정).split(' ')[0] : '';
      var eventsHtml = events.map(function (eventName, i) {
        var rec = student['기록' + (i + 1)] || '';
        var sc = student['점수' + (i + 1)] || '';
        return ''
          + '<td>'
          + '  <div class="practical-input-group">'
          + '    <input type="text" class="input-record" data-event-name="' + esc(eventName) + '"'
          + '           value="' + esc(rec) + '" placeholder="기록">'
          + '    <input type="text" class="input-score-only" value="' + esc(sc) + '" readonly>'
          + '  </div>'
          + '</td>';
      }).join('');

      var totalScore = (student.실기총점 !== null && student.실기총점 !== undefined)
        ? Number(student.실기총점).toFixed(2) : '-';
      var totalSum = (student.합산점수 !== null && student.합산점수 !== undefined)
        ? Number(student.합산점수).toFixed(2) : '-';

      return ''
        + '<tr data-student-id="' + esc(student.학생ID) + '">'
        + '  <td>' + esc(student.이름) + '</td>'
        + '  <td>' + esc(student.학년) + '</td>'
        + '  <td>' + esc(student.성별) + '</td>'
        + '  <td><input class="input-grade" type="text" value="' + esc(student.내신등급 || '') + '"></td>'
        + '  <td><input class="input-score" type="text" value="' + esc(student.내신점수 || '') + '"></td>'
        + eventsHtml
        + '  <td class="total-score-cell">' + totalScore + '</td>'
        + '  <td class="total-sum-cell">' + totalSum + '</td>'
        + '  <td><input class="input-date" type="date" value="' + esc(scheduleDate) + '"></td>'
        + '  <td>' + passSelect(firstPass.status, firstPass.number, '최초합') + '</td>'
        + '  <td>' + passSelect(finalPass.status, finalPass.number, '최종합') + '</td>'
        + '</tr>';
    }).join('');

    var evHeaders = events.map(function (e) { return '<th>' + esc(e) + '</th>'; }).join('');

    var html = ''
      + '<div id="table-wrapper-' + esc(universityData.대학ID) + '">'
      + '  <table class="summary-table">'
      + '    <thead><tr>'
      + '      <th>이름</th><th>학년</th><th>성별</th><th>등급</th><th>내신점수</th>'
      + '      ' + evHeaders
      + '      <th>실기총점</th><th>합산점수</th><th>실기일정</th><th>최초합</th><th>최종합</th>'
      + '    </tr></thead>'
      + '    <tbody>' + (rowsHtml || '<tr><td colspan="' + (10 + events.length) + '">등록된 학생이 없습니다.</td></tr>') + '</tbody>'
      + '  </table>'
      + '  <div class="save-row">'
      + '    <button type="button" class="btn btn-primary" data-action="save-uni">'
      + '      <i class="ph-light ph-floppy-disk"></i><span>' + esc(universityData.대학명) + ' 저장</span>'
      + '    </button>'
      + '  </div>'
      + '</div>';

    container.innerHTML = html;

    // 바인딩: 기록/내신 입력, 예비 토글, 저장
    container.querySelectorAll('.input-record, .input-score').forEach(function (inp) {
      inp.addEventListener('input', function () { updateScoresForRow(inp.closest('tr')); });
    });
    container.querySelectorAll('.input-grade').forEach(function (inp) {
      inp.addEventListener('input', function () { updateScoresForRow(inp.closest('tr')); });
    });
    container.querySelectorAll('.select-pass-status').forEach(function (sel) {
      sel.addEventListener('change', function () { handlePassStatusChange(sel); });
    });
    var saveBtn = container.querySelector('[data-action="save-uni"]');
    if (saveBtn) saveBtn.addEventListener('click', function () { saveUniversityData(saveBtn); });
  }

  /* ---- Save ---- */
  async function saveUniversityData(button) {
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
        if (!c) return '';
        var s = c.querySelector('.select-pass-status').value;
        var n = c.querySelector('.input-reserve-number').value;
        if (s === '예비' && n) return '예비' + n;
        return s;
      }
      var totalCell = row.querySelector('.total-score-cell');
      var sumCell = row.querySelector('.total-sum-cell');
      var data = {
        학생ID: parseInt(row.dataset.studentId, 10),
        실기ID: universityData.실기ID,
        내신등급: row.querySelector('.input-grade').value,
        내신점수: row.querySelector('.input-score').value,
        실기총점: parseFloat(totalCell.textContent) || null,
        합산점수: parseFloat(sumCell.textContent) || null,
        실기일정: row.querySelector('.input-date').value || null,
        최초합여부: passVal(containers[0]),
        최종합여부: passVal(containers[1]),
      };
      row.querySelectorAll('.input-record').forEach(function (inp, i) {
        data['기록' + (i + 1)] = inp.value || null;
        data['점수' + (i + 1)] = inp.nextElementSibling ? (inp.nextElementSibling.value || null) : null;
      });
      payload.push(data);
    });

    try {
      var result = await window.api('_final_save', {
        method: 'POST',
        body: JSON.stringify({ college_id: collegeId, studentData: payload }),
      });
      if (!result || !result.success) throw new Error((result && result.message) || '저장 실패');

      window.showToast(universityData.대학명 + ' 저장 완료', 'success');

      // 전역 데이터 업데이트 + 재렌더
      var uniRef = allUniversityData.find(function (u) { return u.대학ID == collegeId; });
      if (uniRef) {
        uniRef.학생들 = payload.map(function (p) {
          var original = uniRef.학생들.find(function (s) { return s.학생ID == p.학생ID; }) || {};
          return Object.assign({}, original, p);
        });
        var tc = detailsElement.querySelector('.table-container');
        renderUniversityTable(tc, uniRef);
      }
    } catch (e) {
      console.error('[saveUniversityData]', e);
      window.showToast('저장 실패: ' + (e && e.message ? e.message : ''), 'error');
    } finally {
      button.disabled = false;
    }
  }

  /* ---- Score recalc on change ---- */
  async function updateScoresForRow(row) {
    if (!row) return;
    try {
      var studentId = parseInt(row.dataset.studentId, 10);
      var details = row.closest('details');
      var collegeId = parseInt(details.dataset.collegeId, 10);
      var university = allUniversityData.find(function (u) { return u.대학ID == collegeId; });
      if (!university) return;
      var student = university.학생들.find(function (s) { return s.학생ID == studentId; });
      var naesinScoreEl = row.querySelector('.input-score');
      if (!student || !university.실기ID) {
        var naesinScore = parseFloat(naesinScoreEl.value) || 0;
        row.querySelector('.total-sum-cell').textContent = naesinScore.toFixed(2);
        return;
      }
      var inputs = Array.prototype.map.call(row.querySelectorAll('input.input-record'), function (inp) {
        return { 종목명: inp.dataset.eventName, 기록: (inp.value || '').trim() || null };
      });
      var data = await window.api('/calculate-final-score', {
        method: 'POST',
        body: JSON.stringify({
          대학ID: university.대학ID,
          gender: student.성별,
          inputs: inputs,
          내신점수: naesinScoreEl.value || 0,
        }),
      });
      if (!data || !data.success) return;
      row.querySelectorAll('input.input-record').forEach(function (recordInput) {
        var eventName = recordInput.dataset.eventName;
        if (recordInput.nextElementSibling) {
          recordInput.nextElementSibling.value = data.종목별점수[eventName] != null ? data.종목별점수[eventName] : '';
        }
      });
      row.querySelector('.total-score-cell').textContent = Number(data.실기총점).toFixed(2);
      row.querySelector('.total-sum-cell').textContent = Number(data.합산점수).toFixed(2);
    } catch (e) {
      console.error('[updateScoresForRow]', e);
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

  /* ---- Unassigned students ---- */
  async function checkUnassignedStudents() {
    var body = document.getElementById('unassignedBody');
    body.innerHTML = '로딩중...';
    window.openModal('unassignedModal');
    try {
      var data = await window.api('/unassigned_students');
      if (!data || !data.success) throw new Error((data && data.message) || '데이터 조회 실패');
      if (!data.students || !data.students.length) {
        body.innerHTML = '<p>모든 학생이 최소 1개 이상의 대학에 수합되었습니다.</p>';
        return;
      }
      var listHtml = data.students.map(function (s) {
        return '<li>' + esc(s.이름) + ' (' + esc(s.학년) + '학년)</li>';
      }).join('');
      body.innerHTML = '<p>총 ' + data.students.length + '명의 학생이 아직 어떤 대학에도 포함되지 않았습니다.</p>'
        + '<ul>' + listHtml + '</ul>';
    } catch (e) {
      console.error('[checkUnassignedStudents]', e);
      body.innerHTML = '<p>미수합 학생을 확인하는 중 문제가 발생했습니다: ' + esc(e && e.message ? e.message : '') + '</p>';
    }
  }

  /* ---- Score table popup ---- */
  async function openScoreTablePopup(university) {
    if (!university || !university.실기ID) {
      window.showToast('해당 대학의 실기 정보가 없습니다.', 'warn');
      return;
    }
    var title = document.getElementById('scoreTableModalTitle');
    var container = document.getElementById('scoreTableContainer');
    title.textContent = university.대학명 + ' - ' + university.학과명 + ' 배점표';
    container.innerHTML = '로딩중...';
    window.openModal('scoreTableModal');
    try {
      var data = await window.api('_get_score_table?실기ID=' + encodeURIComponent(university.실기ID));
      if (!data || !data.success) {
        container.innerHTML = '<p>배점표를 불러오지 못했습니다.</p>';
        return;
      }
      renderPopupScoreTable(data.events || {}, container);
    } catch (e) {
      console.error('[openScoreTablePopup]', e);
      container.innerHTML = '<p>배점표 로드 중 오류가 발생했습니다.</p>';
    }
  }

  function renderPopupScoreTable(events, container) {
    var parts = [];
    Object.keys(events).forEach(function (name) {
      var male = events[name].남 || [];
      var female = events[name].여 || [];
      var all = new Set();
      male.forEach(function (i) { all.add(i.배점); });
      female.forEach(function (i) { all.add(i.배점); });
      var sorted = Array.from(all).sort(function (a, b) {
        var na = parseFloat(a), nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return nb - na;
        return a > b ? -1 : 1;
      });
      var mMap = new Map(male.map(function (i) { return [i.배점, i.기록]; }));
      var fMap = new Map(female.map(function (i) { return [i.배점, i.기록]; }));
      var rowHtml = sorted.map(function (score) {
        return '<tr><td>' + esc(score) + '</td>'
          + '<td>' + esc(mMap.get(score) || '-') + '</td>'
          + '<td>' + esc(fMap.get(score) || '-') + '</td></tr>';
      }).join('');
      parts.push(''
        + '<table>'
        + '  <thead>'
        + '    <tr><th colspan="3">' + esc(name) + '</th></tr>'
        + '    <tr><th>배점</th><th>남</th><th>여</th></tr>'
        + '  </thead>'
        + '  <tbody>' + rowHtml + '</tbody>'
        + '</table>');
    });
    container.innerHTML = parts.join('');
  }
})();
