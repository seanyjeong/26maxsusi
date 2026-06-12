/* ============================================================ */
/* auth.js — JWT 토큰 저장/조회 + 인증 오류 핸들링 + SUSI_YEAR 관리 */
/* 수시 전용: token 키 'token', LOGIN_PAGE 'login.html', X-Susi-Year 헤더 */
/* ============================================================ */

(function () {
  'use strict';

  window.SUSI_API = 'https://supermax.kr/susi';
  window.API_BASE = window.SUSI_API;
  var LOGIN_PAGE = 'login.html';
  var TOKEN_KEY = 'token';
  var YEAR_KEY = 'susi_year';
  // DB: 26susi(지난해), 27susi(현재). 28susi 존재하지 않음.
  var VALID_YEARS = ['26', '27'];
  var DEFAULT_YEAR = '27';

  var storedYear = localStorage.getItem(YEAR_KEY);
  window.SUSI_YEAR = (storedYear && VALID_YEARS.indexOf(storedYear) !== -1) ? storedYear : DEFAULT_YEAR;

  window.getSusiYear = function () { return window.SUSI_YEAR; };

  window.setSusiYear = function (y) {
    if (VALID_YEARS.indexOf(String(y)) === -1) {
      console.error('[SUSI] Invalid year:', y);
      return false;
    }
    localStorage.setItem(YEAR_KEY, String(y));
    window.SUSI_YEAR = String(y);
    return true;
  };

  window.getToken = function () {
    return localStorage.getItem(TOKEN_KEY);
  };

  window.setToken = function (t) {
    localStorage.setItem(TOKEN_KEY, t);
  };

  window.clearToken = function () {
    localStorage.removeItem(TOKEN_KEY);
  };

  var _authErrorFired = false;
  window.handleAuthError = function () {
    if (_authErrorFired) return;
    _authErrorFired = true;
    try {
      if (typeof window.showToast === 'function') {
        window.showToast('인증 만료. 다시 로그인하세요', 'error');
      }
    } catch (e) {}
    window.clearToken();
    setTimeout(function () {
      window.location.href = LOGIN_PAGE;
    }, 1200);
  };

  window.getCounselorFromToken = function () {
    var token = window.getToken();
    if (!token) return { name: '', branch: '' };
    try {
      var payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (payload.length % 4) payload += '=';
      var json = decodeURIComponent(
        Array.prototype.map.call(atob(payload), function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      var p = JSON.parse(json);
      return { name: p.name || '', branch: p.branch || '', userid: p.userid || '', role: p.role || '' };
    } catch (e) {
      console.warn('[JWT decode]', e);
      return { name: '', branch: '' };
    }
  };
})();
