/* ============================================================
 * 실기배점수정.new.js — 실기 배점표 수정 (silgi_score_edit)
 * API: /profile, _get_practical_colleges, _get_score_table, _update_score_table
 * 기능 diff 0: 원본 실기배점수정.html 의 로직 (admin 체크, 대학 목록,
 *   배점표 렌더, contenteditable 저장) 그대로 보존.
 * 사용자 상호작용: alert/Swal → showToast + 공용 모달 확인.
 * ============================================================ */

(function () {
  'use strict';

  var COLLEGES_PATH = '_get_practical_colleges';
  var SCORE_GET_PATH = '_get_score_table';
  var SCORE_UPDATE_PATH = '_update_score_table';
  var PROFILE_PATH = '/profile';

  var collegeCombo = null;
  var currentSilgiId = '';

  var esc = window.escapeHtml;

  function setMessage(text, opts) {
    var container = document.getElementById('scoreTableContainer');
    var cls = 'empty-msg' + (opts && opts.error ? ' error' : '');
    container.innerHTML = '<div class="' + cls + '" id="message">' + esc(text) + '</div>';
  }

  function showSaveBtn(show) {
    var btn = document.getElementById('saveButton');
    if (!btn) return;
    if (show) btn.removeAttribute('hidden');
    else btn.setAttribute('hidden', '');
  }

  async function checkAdmin() {
    try {
      var data = await window.api(PROFILE_PATH);
      var u = data && data.user;
      var ok = !!(data && data.success && u && (u.role === 'admin' || u.userid === 'admin'));
      if (!ok) {
        if (window.showToast) window.showToast('관리자 계정으로만 접근 가능합니다', 'error');
        setTimeout(function () { location.href = 'login.html'; }, 1200);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[배점수정] admin check', err);
      if (window.showToast) window.showToast('인증 중 오류가 발생했습니다', 'error');
      setTimeout(function () { location.href = 'login.html'; }, 1200);
      return false;
    }
  }

  async function loadColleges() {
    try {
      var data = await window.api(COLLEGES_PATH);
      var rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      var options = [{ value: '', label: '대학/학과를 선택하세요' }].concat(
        rows.map(function (r) {
          return {
            value: String(r.실기ID),
            label: r.대학명 + ' - ' + r.학과명 + ' (' + r.전형명 + ')',
          };
        })
      );
      collegeCombo = window.createCombobox(document.getElementById('collegeCombo'), {
        options: options,
        value: '',
        placeholder: '대학/학과를 선택하세요',
        searchable: true,
        searchPlaceholder: '대학/학과 검색…',
        onChange: onCollegeChange,
      });
    } catch (err) {
      console.error('[배점수정] colleges', err);
      setMessage('대학 목록을 불러오는 데 실패했습니다.', { error: true });
    }
  }

  async function onCollegeChange(val) {
    currentSilgiId = val || '';
    if (!currentSilgiId) {
      setMessage('대학을 선택하면 배점표가 표시됩니다.');
      showSaveBtn(false);
      return;
    }
    setMessage('배점표를 불러오는 중…');
    try {
      var json = await window.api(SCORE_GET_PATH + '?실기ID=' + encodeURIComponent(currentSilgiId));
      if (!json.success || !json.events || Object.keys(json.events).length === 0) {
        setMessage('해당 대학의 배점표 데이터가 없습니다.');
        showSaveBtn(false);
        return;
      }
      renderSeparateTables(json.events);
      showSaveBtn(true);
    } catch (err) {
      console.error('[배점수정] score-table', err);
      setMessage('배점표 로딩 중 오류가 발생했습니다.', { error: true });
      showSaveBtn(false);
    }
  }

  function renderSeparateTables(events) {
    var container = document.getElementById('scoreTableContainer');
    var names = Object.keys(events);
    var finalHTML = '';
    names.forEach(function (name) {
      var eventData = events[name];
      var scoreMap = { 남: new Map(), 여: new Map() };
      var eventScores = new Set();
      (eventData.남 || []).forEach(function (it) { scoreMap.남.set(it.배점, it.기록); eventScores.add(it.배점); });
      (eventData.여 || []).forEach(function (it) { scoreMap.여.set(it.배점, it.기록); eventScores.add(it.배점); });
      var sortedScores = Array.from(eventScores).sort(function (a, b) {
        var na = parseFloat(a), nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return nb - na;
        return String(b).localeCompare(String(a));
      });

      var tableHTML =
        '<div class="event-table-wrapper"><table>' +
          '<thead>' +
            '<tr><th colspan="3" class="event-header">' + esc(name) + '</th></tr>' +
            '<tr><th>배점</th><th>남</th><th>여</th></tr>' +
          '</thead><tbody>';

      sortedScores.forEach(function (score) {
        var m = scoreMap.남.get(score);
        var f = scoreMap.여.get(score);
        var maleRecord = (m == null || m === '') ? '-' : m;
        var femaleRecord = (f == null || f === '') ? '-' : f;
        tableHTML +=
          '<tr>' +
            '<td contenteditable="true" class="score-col">' + esc(score) + '</td>' +
            '<td contenteditable="true">' + esc(maleRecord) + '</td>' +
            '<td contenteditable="true">' + esc(femaleRecord) + '</td>' +
          '</tr>';
      });
      tableHTML += '</tbody></table></div>';
      finalHTML += tableHTML;
    });
    container.innerHTML = finalHTML;
  }

  function collectChanges() {
    var data = [];
    document.querySelectorAll('.event-table-wrapper').forEach(function (table) {
      var header = table.querySelector('.event-header');
      var 종목명 = header ? header.textContent.trim() : '';
      table.querySelectorAll('tbody tr').forEach(function (row) {
        var cells = row.cells;
        if (!cells || cells.length < 3) return;
        var 배점 = cells[0].textContent.trim();
        var male = cells[1].textContent.trim();
        var female = cells[2].textContent.trim();
        if (male && male !== '-') data.push({ 종목명: 종목명, 성별: '남', 기록: male, 배점: 배점 });
        if (female && female !== '-') data.push({ 종목명: 종목명, 성별: '여', 기록: female, 배점: 배점 });
      });
    });
    return data;
  }

  async function doSave() {
    if (!currentSilgiId) return;
    var payload = { 실기ID: currentSilgiId, data: collectChanges() };
    try {
      var result = await window.api(SCORE_UPDATE_PATH, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result && result.success) {
        if (window.showToast) window.showToast('저장되었습니다', 'success');
      } else {
        var msg = (result && result.message) || '알 수 없는 오류';
        if (window.showToast) window.showToast('저장 실패: ' + msg, 'error');
      }
    } catch (err) {
      console.error('[배점수정] save', err);
      if (window.showToast) window.showToast('네트워크 오류로 저장에 실패했습니다', 'error');
    }
  }

  function bindModal() {
    var modal = document.getElementById('confirmModal');
    if (!modal) return;
    /* [data-action="modal-close"] 는 공용 modal.js v2 가 전역 delegation 처리 */
    var saveBtn = document.getElementById('confirmSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        window.closeModal('confirmModal');
        await doSave();
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    bindModal();
    var saveOpener = document.getElementById('saveButton');
    if (saveOpener) {
      saveOpener.addEventListener('click', function () {
        if (!currentSilgiId) return;
        window.openModal('confirmModal');
      });
    }
    var ok = await checkAdmin();
    if (ok) await loadColleges();
  });
})();
