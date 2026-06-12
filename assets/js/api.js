/* ============================================================ */
/* api.js — JSON/바이너리 fetch wrapper (JWT + X-Susi-Year 자동 주입 + 401/403) */
/* 수시 전용: X-Susi-Year 헤더 자동 부착, base = window.SUSI_API */
/* ============================================================ */

(function () {
  'use strict';

  function buildHeaders(token, extra) {
    var h = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'X-Susi-Year': window.SUSI_YEAR || '26',
    };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
      }
    }
    return h;
  }

  window.api = async function (path, opts) {
    opts = opts || {};
    var token = window.getToken();
    if (!token) {
      window.handleAuthError();
      throw new Error('no-token');
    }
    var fetchOpts = {};
    for (var k in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, k)) fetchOpts[k] = opts[k];
    }
    fetchOpts.headers = buildHeaders(token, opts.headers || {});
    var res = await fetch(window.API_BASE + path, fetchOpts);
    if (res.status === 401) {
      window.handleAuthError();
      throw new Error('auth');
    }
    if (res.status === 403) {
      var err403;
      try { err403 = await res.json(); } catch (_) { err403 = { message: '권한이 없습니다' }; }
      throw new Error(err403.message || '권한이 없습니다');
    }
    if (res.status === 204) return { success: true };
    var ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (res.ok) return { success: true };
      throw new Error('HTTP ' + res.status);
    }
    var data = await res.json();
    if (!res.ok) throw new Error(data && data.message ? data.message : 'HTTP ' + res.status);
    return data;
  };

  window.apiBinary = async function (path, opts) {
    opts = opts || {};
    var token = window.getToken();
    if (!token) {
      window.handleAuthError();
      throw new Error('no-token');
    }
    var fetchOpts = {};
    for (var k in opts) {
      if (Object.prototype.hasOwnProperty.call(opts, k)) fetchOpts[k] = opts[k];
    }
    fetchOpts.headers = buildHeaders(token, opts.headers || {});
    var res = await fetch(window.API_BASE + path, fetchOpts);
    if (res.status === 401 || res.status === 403) {
      window.handleAuthError();
      throw new Error('auth');
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.blob();
  };
})();
