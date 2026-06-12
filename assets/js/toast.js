/* ============================================================ */
/* toast.js — 우하단 토스트 (success/error/info), 컨테이너 자동 생성 */
/* ============================================================ */

(function () {
  'use strict';

  function ensureContainer() {
    var c = document.getElementById('toastContainer');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
    return c;
  }

  window.showToast = function (message, type) {
    type = type || 'success';
    var container = ensureContainer();
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    var icon =
      type === 'success' ? 'ph-fill ph-check-circle' :
      type === 'error'   ? 'ph-fill ph-warning-circle' :
                           'ph-fill ph-info';
    t.innerHTML = '<div class="toast-inner"><i class="' + icon + '"></i><span></span></div>';
    t.querySelector('span').textContent = String(message == null ? '' : message);
    container.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 360);
    }, 2600);
  };
})();
