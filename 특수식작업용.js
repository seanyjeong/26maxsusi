/* ============================================================
 * 특수식작업용.new.js — 특수 계산식 적용 대학 리스트 (원본 107줄 이식)
 * 원본: 특수식작업용.html
 * API: _get_practical_colleges_with_scores (배열 반환)
 * 저장: localStorage 'special_college_checked' (키 = 대학ID|학과명|전형명)
 * ============================================================ */

(function () {
  'use strict';

  var esc = window.escapeHtml;
  var STORAGE_KEY = 'special_college_checked';

  function getCheckedSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch (_) {
      return new Set();
    }
  }
  function saveCheckedSet(set) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn('[saveCheckedSet]', e);
    }
  }

  async function loadSpecialColleges() {
    var tbody = document.getElementById('specialBody');
    var meta = document.getElementById('headMeta');
    tbody.innerHTML = '<tr><td colspan="8" class="placeholder">로딩중...</td></tr>';
    try {
      var data = await window.api('_get_practical_colleges_with_scores');
      // 원본은 배열을 직접 반환 — api() 가 그대로 전달
      var colleges = Array.isArray(data) ? data : (data && data.colleges) || [];
      var checkedSet = getCheckedSet();

      var specialColleges = colleges.filter(function (c) {
        var hasMethod = c.환산방식 && c.환산방식 !== '비율환산';
        var hasDesc = c.특수식설명 && String(c.특수식설명).trim() !== '';
        return hasMethod || hasDesc;
      });

      if (!specialColleges.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="placeholder">특수식 적용 대학이 없습니다.</td></tr>';
        if (meta) meta.textContent = '총 0건';
        return;
      }

      var rows = specialColleges.map(function (c, idx) {
        var rowKey = [c.대학ID, c.학과명, c.전형명].join('|');
        var checked = checkedSet.has(rowKey) ? ' checked' : '';
        return '<tr>'
          + '<td>' + (idx + 1) + '</td>'
          + '<td>' + esc(c.대학ID) + '</td>'
          + '<td><input type="checkbox" class="ckbox" data-key="' + esc(rowKey) + '"' + checked + '></td>'
          + '<td>' + esc(c.대학명) + '</td>'
          + '<td>' + esc(c.학과명 || '-') + '</td>'
          + '<td>' + esc(c.전형명 || '-') + '</td>'
          + '<td>' + esc(c.환산방식 || '-') + '</td>'
          + '<td class="desc">' + esc(c.특수식설명 || '-') + '</td>'
          + '</tr>';
      }).join('');
      tbody.innerHTML = rows;

      if (meta) meta.textContent = '총 ' + specialColleges.length + '건 · 체크 ' + checkedSet.size + '건';

      // 체크박스 이벤트
      tbody.querySelectorAll('.ckbox').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var key = cb.dataset.key;
          var set = getCheckedSet();
          if (cb.checked) set.add(key);
          else set.delete(key);
          saveCheckedSet(set);
          if (meta) meta.textContent = '총 ' + specialColleges.length + '건 · 체크 ' + set.size + '건';
        });
      });
    } catch (e) {
      console.error('[loadSpecialColleges]', e);
      tbody.innerHTML = '<tr><td colspan="8" class="placeholder">데이터를 불러오지 못했습니다.</td></tr>';
      window.showToast('로드 실패: ' + (e && e.message ? e.message : ''), 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var token = window.getToken();
    if (!token) { location.href = 'login.html'; return; }
    loadSpecialColleges();
  });
})();
