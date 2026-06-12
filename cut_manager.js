/* ============================================================
 * cut_manager.new.js — 예상컷 관리 (원본 353줄 기능 전면 이식)
 * 원본: cut_manager.html
 * API: _get_all_cuts · _update_max_cut · _update_branch_cut
 * 연도 정합성: ${SUSI_YEAR}맥스예상컷 동적 키 (27susi.대학정보 → 27맥스예상컷).
 * 원본 alert 는 공용 showToast 로 대체.
 * ============================================================ */

(function () {
  'use strict';

  var esc = window.escapeHtml;

  var initialData = [];
  var currentUser = {};
  var currentFilter = 'all';

  // 연도별 컬럼명 (DB: 26susi → 26맥스예상컷, 27susi → 27맥스예상컷)
  var YEAR_KEY = (window.SUSI_YEAR || '27') + '맥스예상컷';
  var FALLBACK_KEY = '26맥스예상컷'; // 원본 호환용 fallback

  function pickMaxCut(cut) {
    if (cut == null) return '';
    if (cut[YEAR_KEY] != null && cut[YEAR_KEY] !== '') return cut[YEAR_KEY];
    if (cut[FALLBACK_KEY] != null && cut[FALLBACK_KEY] !== '') return cut[FALLBACK_KEY];
    return '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var token = window.getToken();
    if (!token) {
      location.href = 'login.html?next=cut_manager.new.html';
      return;
    }

    // 연도 표기 - 헤더 업데이트
    var head = document.getElementById('maxCutHead');
    if (head) head.textContent = (window.SUSI_YEAR || '27') + ' 맥스 예상컷';

    bindFilter();
    bindSave();
    loadCutData();
  });

  function bindFilter() {
    var btnAll = document.getElementById('btnAll');
    var btnPractical = document.getElementById('btnPractical');
    if (btnAll) btnAll.addEventListener('click', function () { filterAndRender('all'); });
    if (btnPractical) btnPractical.addEventListener('click', function () { filterAndRender('practical'); });
  }

  function bindSave() {
    var btn = document.getElementById('btnSaveAll');
    if (btn) btn.addEventListener('click', saveAllCuts);
  }

  async function loadCutData() {
    var tbody = document.getElementById('cutTbody');
    tbody.innerHTML = '<tr><td colspan="5" class="placeholder">로딩중...</td></tr>';
    try {
      var data = await window.api('_get_all_cuts');
      if (!data || !data.success) {
        window.showToast('데이터를 불러오는 데 실패했습니다.', 'error');
        tbody.innerHTML = '<tr><td colspan="5" class="placeholder">데이터 로드 실패</td></tr>';
        return;
      }
      initialData = data.cuts || [];
      currentUser = data.user || {};
      filterAndRender(currentFilter);
    } catch (e) {
      console.error('[loadCutData]', e);
      window.showToast('서버와 통신 중 오류가 발생했습니다: ' + (e && e.message ? e.message : ''), 'error');
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">서버 오류</td></tr>';
    }
  }

  function filterAndRender(filterType) {
    currentFilter = filterType;
    var btnAll = document.getElementById('btnAll');
    var btnPractical = document.getElementById('btnPractical');

    var data;
    if (filterType === 'practical') {
      data = initialData.filter(function (cut) { return cut.실기ID; });
      if (btnAll) btnAll.classList.remove('active');
      if (btnPractical) btnPractical.classList.add('active');
    } else {
      data = initialData;
      if (btnPractical) btnPractical.classList.remove('active');
      if (btnAll) btnAll.classList.add('active');
    }
    renderTable(data, currentUser);
  }

  function renderTable(cuts, user) {
    var tbody = document.getElementById('cutTbody');
    var meta = document.getElementById('headMeta');
    tbody.innerHTML = '';

    if (!cuts.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">대학 정보가 없습니다.</td></tr>';
      if (meta) meta.textContent = '총 0건';
      return;
    }

    var isAdmin = user && (user.userid === 'admin' || user.role === 'admin');
    var roNote = isAdmin ? '' : ' readonly';

    var rows = cuts.map(function (cut) {
      var mc = pickMaxCut(cut);
      var bc = cut.지점예상컷 || '';
      return '<tr'
        + ' data-college-id="' + esc(cut.대학ID) + '"'
        + ' data-initial-max-cut="' + esc(mc) + '"'
        + ' data-initial-branch-cut="' + esc(bc) + '">'
        + '<td>' + esc(cut.대학명) + '</td>'
        + '<td>' + esc(cut.학과명) + '</td>'
        + '<td>' + esc(cut.전형명) + '</td>'
        + '<td><input type="text" class="max-cut" value="' + esc(mc) + '"' + roNote + '></td>'
        + '<td><input type="text" class="branch-cut" value="' + esc(bc) + '"></td>'
        + '</tr>';
    }).join('');
    tbody.innerHTML = rows;

    if (meta) {
      var roleText = isAdmin ? '본원 관리자' : ((user && user.branch) ? user.branch + ' 원장' : '');
      meta.textContent = '총 ' + cuts.length + '건' + (roleText ? ' · ' + roleText : '');
    }
  }

  async function saveAllCuts() {
    var btn = document.getElementById('btnSaveAll');
    if (btn) btn.disabled = true;

    var rows = document.querySelectorAll('#cutTbody tr[data-college-id]');
    var tasks = [];

    rows.forEach(function (row) {
      var collegeId = row.dataset.collegeId;
      var initMax = row.dataset.initialMaxCut || '';
      var initBranch = row.dataset.initialBranchCut || '';
      var maxInp = row.querySelector('.max-cut');
      var branchInp = row.querySelector('.branch-cut');

      if (maxInp && !maxInp.readOnly && maxInp.value !== initMax) {
        tasks.push(window.api('_update_max_cut', {
          method: 'POST',
          body: JSON.stringify({ 대학ID: collegeId, 맥스예상컷: maxInp.value }),
        }));
      }
      if (branchInp && branchInp.value !== initBranch) {
        tasks.push(window.api('_update_branch_cut', {
          method: 'POST',
          body: JSON.stringify({ 대학ID: collegeId, 지점예상컷: branchInp.value }),
        }));
      }
    });

    if (!tasks.length) {
      window.showToast('변경된 내용이 없습니다.', 'info');
      if (btn) btn.disabled = false;
      return;
    }

    try {
      var results = await Promise.allSettled(tasks);
      var failed = results.filter(function (r) { return r.status === 'rejected' || (r.value && r.value.success === false); }).length;
      if (failed === 0) {
        window.showToast('모든 변경사항이 저장되었습니다.', 'success');
        loadCutData();
      } else {
        window.showToast(failed + '건 저장 실패. 새로고침 후 재시도하세요.', 'warn');
      }
    } catch (e) {
      console.error('[saveAllCuts]', e);
      window.showToast('저장 중 오류: ' + (e && e.message ? e.message : ''), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
})();
