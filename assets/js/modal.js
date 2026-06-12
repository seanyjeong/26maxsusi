/* ============================================================
 * modal.js — 공용 모달 shell v2
 *   - openModal(id) / closeModal(id)
 *   - 배경 클릭 닫기 (modal-backdrop 자기 자신 클릭)
 *   - [data-action="modal-close"] 전역 delegation (버튼 공용)
 *   - Esc 키 → 최상단 활성 모달 닫기
 *   - body.modal-open 토글 (스크롤 락)
 * ============================================================ */

(function () {
  'use strict';

  function resolve(id) {
    return typeof id === 'string' ? document.getElementById(id) : id;
  }

  function openCount() {
    return document.querySelectorAll('.modal-backdrop.show').length;
  }

  function updateBodyLock() {
    document.body.classList.toggle('modal-open', openCount() > 0);
  }

  window.openModal = function (id) {
    var el = resolve(id);
    if (!el) return;
    el.classList.add('show');
    // 배경 클릭 바인딩 (1회)
    if (!el.dataset.backdropBound) {
      el.addEventListener('click', function (e) {
        if (e.target === el) {
          el.classList.remove('show');
          updateBodyLock();
        }
      });
      el.dataset.backdropBound = '1';
    }
    updateBodyLock();
  };

  window.closeModal = function (id) {
    var el = resolve(id);
    if (!el) return;
    el.classList.remove('show');
    updateBodyLock();
  };

  // [data-action="modal-close"] 전역 delegation — 모달 내 어디 클릭해도 닫힘
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="modal-close"]');
    if (!btn) return;
    var modal = btn.closest('.modal-backdrop');
    if (modal) {
      modal.classList.remove('show');
      updateBodyLock();
    }
  });

  // Esc 키 → 가장 최근 열린 (마지막) 모달 닫기
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelectorAll('.modal-backdrop.show');
    if (!open.length) return;
    var last = open[open.length - 1];
    last.classList.remove('show');
    updateBodyLock();
  });
})();
