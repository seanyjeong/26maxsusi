/* ============================================================
 * login.new.js — 수시 로그인 로직
 * 규약:
 *   - JWT 없는 엔드포인트이므로 window.api() 사용 금지 → fetch() 직접 호출
 *   - window.API_BASE + X-Susi-Year 헤더 수동 부착
 *   - 성공 시 window.setToken() 사용 (localStorage 직접 호출 금지)
 *   - 알림은 window.showToast()
 * 원본 매핑:
 *   - /login 1건 (login.html:161)
 *   - next 파라미터 → index.html (login.html:152~153)
 * ============================================================ */

(function () {
  'use strict';

  // next 파라미터 파싱 + open redirect 방지
  // 허용: 같은 앱 내 상대 경로 (.html) 만. 절대 URL / 프로토콜 / 스킴 전부 거부.
  function safeNext(raw) {
    if (!raw) return 'index.html';
    // protocol/domain/scheme 차단
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return 'index.html';  // http: javascript: data:
    if (raw.charAt(0) === '/' || raw.charAt(0) === '\\') return 'index.html';  // //evil.com, /redirect
    if (raw.indexOf('..') !== -1) return 'index.html';  // 상위 경로 탈출
    // 기본: 앱 내 .html 페이지만 허용
    return /\.html(\?|#|$)/i.test(raw) ? raw : 'index.html';
  }
  var urlParams = new URLSearchParams(location.search);
  var nextPage = safeNext(urlParams.get('next'));

  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var btnText = document.getElementById('loginBtnText');
  var btnIcon = document.getElementById('loginBtnIcon');
  var msgEl = document.getElementById('loginMsg');
  var useridEl = document.getElementById('userid');
  var passwordEl = document.getElementById('password');

  function setMsg(text, kind) {
    msgEl.textContent = text || '';
    msgEl.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function setLoading(on) {
    btn.disabled = !!on;
    btnText.textContent = on ? '로그인 중…' : '로그인';
    btnIcon.className = on ? 'ph-light ph-circle-notch spin' : 'ph-light ph-sign-in';
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    setMsg('', '');

    var userid = (useridEl.value || '').trim();
    var password = passwordEl.value || '';
    if (!userid || !password) {
      setMsg('아이디와 비밀번호를 입력해주세요.', 'error');
      return;
    }

    setLoading(true);
    setMsg('인증 요청 중…', 'info');

    try {
      var res = await fetch(window.API_BASE + '/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Susi-Year': window.SUSI_YEAR || '26',
        },
        body: JSON.stringify({ userid: userid, password: password }),
      });

      var json = {};
      try { json = await res.json(); } catch (_) { json = {}; }

      if (json && json.success && json.token) {
        window.setToken(json.token);
        setMsg('로그인 성공! 이동합니다…', 'success');
        try { window.showToast('로그인 성공', 'success'); } catch (_) {}
        setTimeout(function () { window.location.href = nextPage; }, 700);
      } else {
        var message = (json && json.message) || '로그인에 실패했습니다.';
        setMsg(message, 'error');
        try { window.showToast(message, 'error'); } catch (_) {}
        setLoading(false);
      }
    } catch (err) {
      console.error('[login]', err);
      setMsg('서버에 연결할 수 없습니다.', 'error');
      try { window.showToast('서버 통신 오류', 'error'); } catch (_) {}
      setLoading(false);
    }
  });

  // 포커스
  try { useridEl.focus(); } catch (_) {}
})();
