/* ============================================================
 * register.new.js — 수시 회원가입 (아이디 중복 + SMS 인증 + 최종 가입)
 * 규약:
 *   - JWT 없이 호출 → fetch() 직접 + window.API_BASE + X-Susi-Year 헤더 수동
 *   - 알림은 window.showToast()
 *   - setToken / localStorage 사용 없음 (가입 후 로그인 페이지로 이동)
 * 원본 매핑 (register.html):
 *   - /check-userid          (line 173)
 *   - /send-verification-sms (line 234, 3분 타이머)
 *   - /verify-code           (line 303)
 *   - /register              (line 380, 성공 시 login 이동)
 * 보존 UX:
 *   - 아이디 blur → 중복 확인
 *   - 비밀번호 일치 실시간 검사
 *   - 전화번호 10~11자리 검증
 *   - 인증번호 4자리 검증
 *   - 180초 카운트다운 (재요청 버튼 텍스트)
 *   - 인증 성공 시 입력 readOnly + 인증완료 표시
 *   - 모든 조건(ID/비번/직급/인증) 충족 시 가입 버튼 활성화
 * ============================================================ */

(function () {
  'use strict';

  var YEAR_HEADER = function () { return window.SUSI_YEAR || '26'; };

  // fetch 헬퍼: JWT 없이 공개 엔드포인트 호출
  async function authFetch(path, bodyObj) {
    var res = await fetch(window.API_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Susi-Year': YEAR_HEADER(),
      },
      body: JSON.stringify(bodyObj || {}),
    });
    var data = {};
    try { data = await res.json(); } catch (_) { data = {}; }
    return { ok: res.ok, status: res.status, data: data };
  }

  // ── DOM refs ─────────────────────────────────────────────────
  var form = document.getElementById('registerForm');
  var useridInput = document.getElementById('userid');
  var password = document.getElementById('password');
  var passwordConfirm = document.getElementById('passwordConfirm');
  var positionSelect = document.getElementById('position');
  var phoneInput = document.getElementById('phone');
  var codeInput = document.getElementById('verificationCode');

  var useridFeedback = document.getElementById('userid-feedback');
  var passwordFeedback = document.getElementById('password-feedback');
  var phoneFeedback = document.getElementById('phone-feedback');
  var registerMsg = document.getElementById('registerMsg');

  var btnSend = document.getElementById('btnSendCode');
  var btnSendText = document.getElementById('btnSendCodeText');
  var btnVerify = document.getElementById('btnVerifyCode');
  var btnRegister = document.getElementById('btnRegister');
  var btnRegisterText = document.getElementById('btnRegisterText');
  var btnRegisterIcon = document.getElementById('btnRegisterIcon');

  // ── 상태 ─────────────────────────────────────────────────────
  var isIdAvailable = false;
  var isPasswordMatch = false;
  var isVerified = false;
  var timerId = null;

  function setFeedback(el, text, kind) {
    el.textContent = text || '';
    el.className = 'feedback' + (kind ? ' ' + kind : '');
  }

  function setRegisterMsg(text, kind) {
    registerMsg.textContent = text || '';
    registerMsg.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  // ── 아이디 중복 체크 (blur) ─────────────────────────────────
  useridInput.addEventListener('blur', async function () {
    var userid = (useridInput.value || '').trim();
    if (userid.length < 4) {
      setFeedback(useridFeedback, '아이디는 4자 이상 입력해주세요.', 'error');
      isIdAvailable = false;
      checkFormValidity();
      return;
    }
    try {
      var r = await authFetch('/check-userid', { userid: userid });
      var msg = (r.data && r.data.message) || '';
      if (r.data && r.data.available) {
        setFeedback(useridFeedback, msg || '사용 가능한 아이디입니다.', 'success');
        isIdAvailable = true;
      } else {
        setFeedback(useridFeedback, msg || '이미 사용 중인 아이디입니다.', 'error');
        isIdAvailable = false;
      }
    } catch (e) {
      setFeedback(useridFeedback, '서버 통신 오류', 'error');
      isIdAvailable = false;
    }
    checkFormValidity();
  });

  // ── 비밀번호 일치 검사 (실시간) ─────────────────────────────
  function checkPasswordMatch() {
    if (password.value && passwordConfirm.value) {
      if (password.value === passwordConfirm.value) {
        setFeedback(passwordFeedback, '비밀번호가 일치합니다.', 'success');
        isPasswordMatch = true;
      } else {
        setFeedback(passwordFeedback, '비밀번호가 일치하지 않습니다.', 'error');
        isPasswordMatch = false;
      }
    } else {
      setFeedback(passwordFeedback, '', '');
      isPasswordMatch = false;
    }
    checkFormValidity();
  }
  password.addEventListener('keyup', checkPasswordMatch);
  passwordConfirm.addEventListener('keyup', checkPasswordMatch);

  // ── 인증번호 발송 요청 ──────────────────────────────────────
  async function sendVerificationCode() {
    var phone = (phoneInput.value || '').replace(/-/g, '');
    if (!/^\d{10,11}$/.test(phone)) {
      window.showToast('올바른 전화번호를 입력해주세요 (10~11자리 숫자)', 'warn');
      return;
    }

    btnSend.disabled = true;
    setFeedback(phoneFeedback, '인증번호 발송 중...', '');

    try {
      var r = await authFetch('/send-verification-sms', { phone: phone });
      var data = r.data || {};
      if (data.success) {
        window.showToast('인증번호가 발송되었습니다. 3분 이내 입력해주세요.', 'success');
        setFeedback(phoneFeedback, '인증번호가 발송되었습니다.', 'success');
        codeInput.disabled = false;
        btnVerify.disabled = false;
        try { codeInput.focus(); } catch (_) {}

        // 타이머 — 원본 180초 카운트다운
        var timer = 180;
        btnSendText.textContent = '재요청 (' + timer + 's)';
        if (timerId) clearInterval(timerId);
        timerId = setInterval(function () {
          timer--;
          btnSendText.textContent = '재요청 (' + timer + 's)';
          if (timer <= 0) {
            clearInterval(timerId);
            timerId = null;
            btnSendText.textContent = '인증요청';
            btnSend.disabled = false;
            setFeedback(phoneFeedback, '인증 시간이 만료되었습니다. 재요청하세요.', 'error');
          }
        }, 1000);
      } else {
        var msg = data.message || '인증번호 발송 실패';
        window.showToast(msg, 'error');
        setFeedback(phoneFeedback, msg, 'error');
        btnSend.disabled = false;
      }
    } catch (e) {
      window.showToast('서버 통신 중 오류가 발생했습니다.', 'error');
      setFeedback(phoneFeedback, '서버 통신 오류', 'error');
      btnSend.disabled = false;
    }
  }
  btnSend.addEventListener('click', sendVerificationCode);

  // ── 인증번호 확인 ───────────────────────────────────────────
  async function verifyCode() {
    var phone = (phoneInput.value || '').replace(/-/g, '');
    var code = (codeInput.value || '').trim();
    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      window.showToast('인증번호 4자리를 입력해주세요.', 'warn');
      return;
    }

    btnVerify.disabled = true;
    setFeedback(phoneFeedback, '인증번호 확인 중...', '');

    try {
      var r = await authFetch('/verify-code', { phone: phone, code: code });
      var data = r.data || {};
      if (data.success) {
        window.showToast('휴대폰 인증이 완료되었습니다.', 'success');
        setFeedback(phoneFeedback, '휴대폰 인증 완료', 'success');
        isVerified = true;
        phoneInput.readOnly = true;
        codeInput.readOnly = true;
        btnVerify.disabled = true;

        // 타이머 중지 + 재요청 버튼 잠금
        if (timerId) { clearInterval(timerId); timerId = null; }
        btnSendText.textContent = '인증완료';
        btnSend.disabled = true;
      } else {
        var msg = data.message || '인증번호가 올바르지 않습니다.';
        window.showToast(msg, 'error');
        setFeedback(phoneFeedback, msg, 'error');
        isVerified = false;
        btnVerify.disabled = false;
        try { codeInput.focus(); } catch (_) {}
      }
    } catch (e) {
      window.showToast('서버 통신 중 오류가 발생했습니다.', 'error');
      setFeedback(phoneFeedback, '서버 통신 오류', 'error');
      isVerified = false;
      btnVerify.disabled = false;
    }
    checkFormValidity();
  }
  btnVerify.addEventListener('click', verifyCode);

  // ── 가입 버튼 활성 여부 ─────────────────────────────────────
  function checkFormValidity() {
    var positionSelected = positionSelect.value !== '';
    btnRegister.disabled = !(isIdAvailable && isPasswordMatch && isVerified && positionSelected);
  }
  positionSelect.addEventListener('change', checkFormValidity);

  // ── 최종 가입 신청 ─────────────────────────────────────────
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!isIdAvailable || !isPasswordMatch || !isVerified || positionSelect.value === '') {
      window.showToast('아이디, 비밀번호, 직급, 휴대폰 인증을 모두 완료해야 합니다.', 'warn');
      return;
    }

    btnRegister.disabled = true;
    btnRegisterText.textContent = '처리 중...';
    btnRegisterIcon.className = 'ph-light ph-circle-notch spin';
    setRegisterMsg('', '');

    var payload = {
      userid: (useridInput.value || '').trim(),
      password: password.value,
      name: (document.getElementById('name').value || '').trim(),
      position: positionSelect.value,
      branch: (document.getElementById('branch').value || '').trim(),
      phone: (phoneInput.value || '').replace(/-/g, ''),
    };

    try {
      var r = await authFetch('/register', payload);
      var json = r.data || {};
      if (json.success) {
        window.showToast('가입 신청 완료! 관리자 승인 후 로그인 가능합니다.', 'success');
        setRegisterMsg('가입 신청이 완료되었습니다. 로그인 페이지로 이동합니다…', 'success');
        setTimeout(function () { window.location.href = 'login.new.html'; }, 1200);
      } else {
        var msg = json.message || '가입 신청 실패';
        setRegisterMsg(msg, 'error');
        window.showToast(msg, 'error');
        btnRegister.disabled = false;
        btnRegisterText.textContent = '가입 신청';
        btnRegisterIcon.className = 'ph-light ph-paper-plane-tilt';
      }
    } catch (e) {
      setRegisterMsg('서버 통신 오류 발생', 'error');
      window.showToast('서버 통신 중 오류가 발생했습니다.', 'error');
      btnRegister.disabled = false;
      btnRegisterText.textContent = '가입 신청';
      btnRegisterIcon.className = 'ph-light ph-paper-plane-tilt';
    }
  });

  // ── 초기 상태 ───────────────────────────────────────────────
  checkPasswordMatch();
  checkFormValidity();
})();
