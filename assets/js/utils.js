/* ============================================================ */
/* utils.js — debounce / 한국 날짜 포맷 / 상대시간 / escapeHtml / isMac */
/* ============================================================ */

(function () {
  'use strict';

  window.debounce = function (fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  // 2026.04.18 형식
  window.formatDateKo = function (d) {
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return '';
    var y = dt.getFullYear();
    var m = String(dt.getMonth() + 1).padStart(2, '0');
    var day = String(dt.getDate()).padStart(2, '0');
    return y + '.' + m + '.' + day;
  };

  // "저장됨 · N초 전" 류의 상대시간
  window.formatRelative = function (ts) {
    if (ts == null) return '';
    var then = (ts instanceof Date) ? ts.getTime() : new Date(ts).getTime();
    if (isNaN(then)) return '';
    var diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 5) return '방금 전';
    if (diff < 60) return diff + '초 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
  };

  window.escapeHtml = function (s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  window.isMac = function () {
    return /Mac|iPad|iPhone/.test(navigator.platform);
  };
})();
