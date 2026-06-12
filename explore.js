/* ============================================================
 * explore.new.js — 대학 검색 (원본 365줄 기능 전면 이식)
 * 원본: explore.html
 * API: /filter-options/regions · /filter-options/events · _student_list ·
 *      /explore-universities · /counseled-students-for-college · /add-counseling-bulk
 * 원본 alert 는 공용 showToast / openModal 로 대체.
 * ============================================================ */

(function () {
  'use strict';

  var esc = window.escapeHtml;

  var allBranchStudents = [];
  var currentFilters = {};
  var pendingCollegeId = null;

  document.addEventListener('DOMContentLoaded', function () {
    var token = window.getToken();
    if (!token) { location.href = 'login.html'; return; }
    initializePage();
    bindModal();
  });

  async function initializePage() {
    try {
      var results = await Promise.all([
        window.api('/filter-options/regions'),
        window.api('/filter-options/events'),
        window.api('_student_list'),
      ]);
      var regionRes = results[0];
      var eventRes = results[1];
      var studentRes = results[2];

      if (studentRes && studentRes.success) allBranchStudents = studentRes.students || [];
      if (regionRes && regionRes.success) createRegionButtons(regionRes.regions || []);
      if (eventRes && eventRes.success) categorizeAndCreateEventButtons(eventRes.events || []);

      setupEventListeners();
      applyFilters();
    } catch (e) {
      console.error('[initializePage]', e);
      window.showToast('초기 데이터 로드 실패: ' + (e && e.message ? e.message : ''), 'error');
    }
  }

  function createRegionButtons(regions) {
    var container = document.getElementById('region-filters');
    if (!container) return;
    // '전체' 먼저
    container.innerHTML = '<button type="button" class="filter-btn active" data-value="">전체</button>';
    regions.forEach(function (r) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn';
      btn.dataset.value = r;
      btn.textContent = r;
      container.appendChild(btn);
    });
  }

  function categorizeAndCreateEventButtons(events) {
    var categories = {
      running: document.getElementById('events-running'),
      jump: document.getElementById('events-jump'),
      ball: document.getElementById('events-ball'),
      flex: document.getElementById('events-flex'),
      other: document.getElementById('events-other'),
    };
    var keywords = {
      running: ['달리기', '런', 'm', '왕복', 'Z', 'z'],
      jump: ['점프', '멀리뛰기', '세단뛰기', '서전트'],
      ball: ['농구', '배구', '축구', '핸드볼', '던지기'],
      flex: ['좌전굴', '체전굴', '유연성', '배후굴'],
    };

    events.forEach(function (event) {
      var category = 'other';
      if (keywords.running.some(function (k) { return event.indexOf(k) !== -1; }) && event.indexOf('매달리기') === -1) category = 'running';
      else if (keywords.jump.some(function (k) { return event.indexOf(k) !== -1; })) category = 'jump';
      else if (keywords.ball.some(function (k) { return event.indexOf(k) !== -1; })) category = 'ball';
      else if (keywords.flex.some(function (k) { return event.indexOf(k) !== -1; })) category = 'flex';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn';
      btn.dataset.value = event;
      btn.textContent = event;
      if (categories[category]) categories[category].appendChild(btn);
    });
  }

  function setupEventListeners() {
    document.querySelectorAll('.filter-btn').forEach(function (btn) {
      btn.addEventListener('click', handleFilterClick);
    });
    document.querySelectorAll('#event-categories .filter-subtitle').forEach(function (subtitle) {
      subtitle.addEventListener('click', function () {
        subtitle.classList.toggle('is-open');
        var content = subtitle.nextElementSibling;
        if (content && content.classList.contains('filter-buttons')) {
          content.classList.toggle('collapsed');
        }
      });
    });
  }

  function handleFilterClick(event) {
    var btn = event.currentTarget;
    var section = btn.closest('.filter-group, .filter-section');
    if (!section) return;
    var group = section.dataset.filterGroup;
    var isMultiSelect = ['eligibility', 'excludeEvents', 'region'].indexOf(group) !== -1;

    if (isMultiSelect) {
      if (group === 'region') {
        if (btn.dataset.value === '') {
          section.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
        } else {
          btn.classList.toggle('active');
          var allBtn = section.querySelector('.filter-btn[data-value=""]');
          if (allBtn) {
            allBtn.classList.remove('active');
            if (section.querySelectorAll('.filter-btn.active').length === 0) {
              allBtn.classList.add('active');
            }
          }
        }
      } else {
        btn.classList.toggle('active');
      }
    } else {
      section.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }

    updateFilters();
    applyFilters();
  }

  function updateFilters() {
    Object.keys(currentFilters).forEach(function (k) { delete currentFilters[k]; });

    document.querySelectorAll('.filter-btn.active').forEach(function (btn) {
      var groupContainer = btn.closest('[data-filter-group]');
      if (!groupContainer) return;
      var group = groupContainer.dataset.filterGroup;
      var key = btn.dataset.key || group;
      var value = btn.dataset.value;

      if (value === '') return;

      if (['excludeEvents', 'region'].indexOf(group) !== -1) {
        if (currentFilters[group]) currentFilters[group] += ',' + value;
        else currentFilters[group] = value;
      } else if (group === 'eligibility') {
        currentFilters[key] = value;
      } else {
        currentFilters[group] = value;
      }
    });
  }

  async function applyFilters() {
    try {
      var qs = new URLSearchParams(currentFilters).toString();
      var path = '/explore-universities' + (qs ? '?' + qs : '');
      var data = await window.api(path);
      if (data && data.success) renderResults(data.universities || []);
    } catch (e) {
      console.error('[applyFilters]', e);
      window.showToast('검색 실패: ' + (e && e.message ? e.message : ''), 'error');
    }
  }

  function renderResults(universities) {
    var tbody = document.getElementById('resultTbody');
    var meta = document.getElementById('resultMeta');
    tbody.innerHTML = '';
    if (meta) meta.textContent = universities.length + '개 검색됨';

    if (!universities.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="placeholder">검색 결과가 없습니다.</td></tr>';
      return;
    }

    var frag = document.createDocumentFragment();
    universities.forEach(function (uni) {
      var row = document.createElement('tr');
      var evs = uni.실기종목들 ? String(uni.실기종목들).replace(/,/g, ', ') : '실기 없음';
      row.innerHTML = ''
        + '<td>' + esc(uni.광역 || '-') + '</td>'
        + '<td>' + esc(uni.대학명) + '</td>'
        + '<td>' + esc(uni.학과명) + '</td>'
        + '<td>' + esc(uni.전형명) + '</td>'
        + '<td>' + esc(uni['1단계배수'] || '-') + '</td>'
        + '<td>' + esc(evs) + '</td>'
        + '<td><button type="button" class="btn-mini add-counsel" data-action="add-counsel" data-id="' + esc(uni.대학ID) + '">상담추가</button></td>';
      frag.appendChild(row);
    });
    tbody.appendChild(frag);
  }

  /* ---- Modal: bulk add ---- */

  function bindModal() {
    var tbody = document.getElementById('resultTbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-action="add-counsel"]');
        if (!btn) return;
        openStudentModal(btn.dataset.id);
      });
    }
    document.querySelectorAll('[data-action="close-select"]').forEach(function (el) {
      el.addEventListener('click', function () { window.closeModal('studentSelectModal'); });
    });
    var confirm = document.getElementById('btnConfirmAdd');
    if (confirm) confirm.addEventListener('click', submitBulkAdd);
  }

  async function openStudentModal(collegeId) {
    if (!collegeId) return;
    if (!allBranchStudents.length) {
      window.showToast('등록된 학생이 없습니다. 학생 명단관리에서 먼저 등록하세요.', 'warn');
      return;
    }

    try {
      var data = await window.api('/counseled-students-for-college?college_id=' + encodeURIComponent(collegeId));
      var counseledIds = (data && data.success && data.student_ids) ? data.student_ids : [];
      var available = allBranchStudents.filter(function (s) { return counseledIds.indexOf(s.학생ID) === -1; });

      if (!available.length) {
        window.showToast('모든 학생이 이미 이 대학의 상담 목록에 있습니다.', 'info');
        return;
      }

      var sel = document.getElementById('studentSelect');
      sel.innerHTML = available.map(function (s) {
        return '<option value="' + esc(s.학생ID) + '">' + esc(s.이름) + ' (' + esc(s.학년 || 'N/A') + ')</option>';
      }).join('');
      pendingCollegeId = collegeId;
      window.openModal('studentSelectModal');
    } catch (e) {
      console.error('[openStudentModal]', e);
      window.showToast('학생 목록 조회 실패: ' + (e && e.message ? e.message : ''), 'error');
    }
  }

  async function submitBulkAdd() {
    if (!pendingCollegeId) return;
    var sel = document.getElementById('studentSelect');
    var ids = Array.prototype.map.call(sel.selectedOptions, function (o) { return o.value; });
    if (!ids.length) {
      window.showToast('추가할 학생을 선택하세요.', 'warn');
      return;
    }
    var btn = document.getElementById('btnConfirmAdd');
    if (btn) btn.disabled = true;
    try {
      var data = await window.api('/add-counseling-bulk', {
        method: 'POST',
        body: JSON.stringify({ college_id: pendingCollegeId, student_ids: ids }),
      });
      if (data && data.success) {
        window.showToast(data.message || '상담 목록에 추가되었습니다', 'success');
        window.closeModal('studentSelectModal');
      } else {
        window.showToast((data && data.message) || '추가 실패', 'error');
      }
    } catch (e) {
      console.error('[submitBulkAdd]', e);
      window.showToast('추가 실패: ' + (e && e.message ? e.message : ''), 'error');
    } finally {
      pendingCollegeId = null;
      if (btn) btn.disabled = false;
    }
  }
})();
