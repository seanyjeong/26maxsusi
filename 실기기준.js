/* ============================================================
 * 실기기준.new.js — 실기 총점 설정 (silgi_standard)
 * API: _get_practical_colleges_with_scores, _save_practical_total_config
 * 기능 diff 0: 원본 실기기준.html 의 목록 로드 + 편집 + 저장 로직 보존.
 * ============================================================ */

(function () {
  'use strict';

  var LIST_PATH = '_get_practical_colleges_with_scores';
  var SAVE_PATH = '_save_practical_total_config';
  var MODES = ['비율환산', '특수식'];

  var esc = window.escapeHtml;

  async function fetchColleges() {
    var wrap = document.getElementById('collegeList');
    wrap.innerHTML = '<div class="empty-msg">불러오는 중…</div>';
    try {
      var data = await window.api(LIST_PATH);
      var list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      renderCollegeList(list);
    } catch (err) {
      console.error('[실기기준] list', err);
      wrap.innerHTML = '<div class="empty-msg">목록을 불러오지 못했습니다.</div>';
      if (window.showToast) window.showToast('목록 로드 실패: ' + (err && err.message ? err.message : ''), 'error');
    }
  }

  function renderCollegeList(list) {
    var wrap = document.getElementById('collegeList');
    wrap.innerHTML = '';

    if (!list || list.length === 0) {
      wrap.innerHTML = '<div class="empty-msg">등록된 대학이 없습니다.</div>';
      return;
    }

    list.forEach(function (item) {
      var box = document.createElement('div');
      box.className = 'college-box';

      var totalScore = item.실기반영총점 != null ? item.실기반영총점 : '';
      var baseScore = item.기준총점 != null ? item.기준총점 : (item.기본만점총합 != null ? item.기본만점총합 : '');
      var conversionMode = item.환산방식 || '비율환산';
      var specialDesc = item.특수식설명 || '';

      var toggleHtml = MODES.map(function (m) {
        var active = m === conversionMode ? ' active' : '';
        return '<button type="button" class="btn-toggle' + active + '" data-mode="' + esc(m) + '">' + esc(m) + '</button>';
      }).join('');

      box.innerHTML =
        '<div class="col-main">' +
          '<div class="college-title">' +
            '<span>' + esc(item.대학명) + ' ' + esc(item.학과명) + ' ' + esc(item.전형명) + '</span>' +
            '<span class="silgi-id">실기ID ' + esc(item.실기ID) + '</span>' +
          '</div>' +
          '<div class="field-row">' +
            '<label>실기반영총점</label>' +
            '<input type="number" class="input-total" value="' + esc(totalScore) + '">' +
          '</div>' +
          '<div class="field-row">' +
            '<label>기준총점</label>' +
            '<input type="number" class="input-base" value="' + esc(baseScore) + '">' +
          '</div>' +
          '<div class="field-row mode-row">' +
            '<label>환산방식</label>' +
            '<div class="toggle-group">' + toggleHtml + '</div>' +
          '</div>' +
          '<div class="field-row">' +
            '<label>특수식설명</label>' +
            '<input type="text" class="input-desc" value="' + esc(specialDesc) + '">' +
          '</div>' +
        '</div>' +
        '<div class="col-save">' +
          '<button type="button" class="btn-save">' +
            '<i class="ph-light ph-floppy-disk"></i><span>저장</span>' +
          '</button>' +
        '</div>';

      var toggles = box.querySelectorAll('.btn-toggle');
      toggles.forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggles.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
        });
      });

      var saveBtn = box.querySelector('.btn-save');
      saveBtn.addEventListener('click', function () { saveRow(box, item, saveBtn); });

      wrap.appendChild(box);
    });
  }

  async function saveRow(box, item, btn) {
    var totalV = box.querySelector('.input-total').value;
    var baseV = box.querySelector('.input-base').value;
    var descV = box.querySelector('.input-desc').value;
    var activeBtn = box.querySelector('.btn-toggle.active');
    var mode = activeBtn ? activeBtn.dataset.mode : '비율환산';

    var payload = {
      대학ID: item.대학ID,
      실기반영총점: parseInt(totalV, 10) || null,
      기준총점: parseInt(baseV, 10) || null,
      환산방식: mode,
      특수식설명: descV,
    };

    btn.disabled = true;
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph-light ph-spinner"></i><span>저장 중…</span>';
    try {
      await window.api(SAVE_PATH, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (window.showToast) window.showToast('저장 완료', 'success');
    } catch (err) {
      console.error('[실기기준] save', err);
      if (window.showToast) window.showToast('저장 실패: ' + (err && err.message ? err.message : ''), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  document.addEventListener('DOMContentLoaded', fetchColleges);
})();
