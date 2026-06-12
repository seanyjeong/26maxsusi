/* ============================================================
 * forgot-password.new.js — 비밀번호 재설정 (3단계 플로우)
 * 규약:
 *   - JWT 없이 호출 → fetch() 직접 + window.API_BASE + X-Susi-Year 헤더
 *   - 알림은 window.showToast()
 * 원본 매핑 (forgot-password.html):
 *   - /request-reset-sms (line 108)
 *   - /verify-code       (line 133)
 *   - /reset-password    (line 166)
 * 보존 UX:
 *   - Step1: 아이디 + 전화번호 모두 입력 필수
 *   - Step2: 인증 성공 시 새 비번 단계 이동
 *   - Step3: 비번 4자 이상 + 확인 일치 검사
 *   - 성공 후 login.new.html 이동
 * ============================================================ */

(function () {
  'use strict';

  var YEAR_HEADER = function () { return window.SUSI_YEAR || '26'; };

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

  var useridEl = document.getElementById('userid');
  var phoneEl = document.getElementById('phone');
  var codeEl = document.getElementById('verificationCode');
  var newPwEl = document.getElementById('newPassword');
  var newPwConfirmEl = document.getElementById('newPasswordConfirm');
  var pwFeedback = document.getElementById('password-feedback');
  var resetMsg = document.getElementById('resetMsg');

  var btnSend = document.getElementById('btnSendCode');
  var btnVerify = document.getElementById('btnVerifyCode');
  var btnChange = document.getElementById('btnChangePassword');
  var btnChangeText = document.getElementById('btnChangePasswordText');
  var btnChangeIcon = document.getElementById('btnChangePasswordIcon');

  var step1 = document.getElementById('step1');
  var step2 = document.getElementById('step2');
  var step3 = document.getElementById('step3');
  var steps = document.querySelectorAll('.step');

  var verifiedUserid = null;

  function setMsg(text, kind) {
    resetMsg.textContent = text || '';
    resetMsg.className = 'auth-msg' + (kind ? ' ' + kind : '');
  }

  function showStep(n) {
    step1.hidden = (n !== 1);
    step2.hidden = (n !== 2);
    step3.hidden = (n !== 3);
    steps.forEach(function (el) {
      var s = Number(el.dataset.step);
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
  }

  // ── Step 1: 인증번호 요청 ───────────────────────────────────
  async function requestResetCode() {
    var userid = (useridEl.value || '').trim();
    var phone = (phoneEl.value || '').replace(/-/g, '');
    if (!userid || !phone) {
      window.showToast('아이디와 전화번호를 모두 입력해주세요.', 'warn');
      return;
    }

    btnSend.disabled = true;
    setMsg('인증번호 발송 중…', 'info');

    try {
      var r = await authFetch('/request-reset-sms', { userid: userid, phone: phone });
      if (r.ok) {
        window.showToast('인증번호가 발송되었습니다.', 'success');
        verifiedUserid = userid;
        setMsg('', '');
        showStep(2);
        try { codeEl.focus(); } catch (_) {}
      } else {
        var msg = (r.data && r.data.message) || '인증번호 발송에 실패했습니다.';
        window.showToast(msg, 'error');
        setMsg(msg, 'error');
      }
    } catch (e) {
      window.showToast('서버 통신 중 오류가 발생했습니다.', 'error');
      setMsg('서버 통신 오류', 'error');
    } finally {
      btnSend.disabled = false;
    }
  }
  btnSend.addEventListener('click', requestResetCode);

  // ── Step 2: 인증번호 확인 ──────────────────────────────────
  async function verifyResetCode() {
    var phone = (phoneEl.value || '').replace(/-/g, '');
    var code = (codeEl.value || '').trim();
    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      window.showToast('인증번호 4자리를 입력해주세요.', 'warn');
      return;
    }

    btnVerify.disabled = true;
    setMsg('인증 확인 중…', 'info');

    try {
      var r = await authFetch('/verify-code', { phone: phone, code: code });
      if (r.ok) {
        window.showToast('인증 성공! 새 비밀번호를 입력해주세요.', 'success');
        setMsg('', '');
        showStep(3);
        try { newPwEl.focus(); } catch (_) {}
      } else {
        var msg = (r.data && r.data.message) || '인증번호가 일치하지 않습니다.';
        window.showToast(msg, 'error');
        setMsg(msg, 'error');
      }
    } catch (e) {
      window.showToast('서버 통신 중 오류가 발생했습니다.', 'error');
      setMsg('서버 통신 오류', 'error');
    } finally {
      btnVerify.disabled = false;
    }
  }
  btnVerify.addEventListener('click', verifyResetCode);

  // ── Step 3: 새 비밀번호 설정 ───────────────────────────────
  function validateNewPassword() {
    if (!newPwEl.value || !newPwConfirmEl.value) {
      pwFeedback.textContent = '';
      pwFeedback.className = 'feedback';
      return false;
    }
    if (newPwEl.value.length < 4) {
      pwFeedback.textContent = '비밀번호는 4자 이상으로 설정해주세요.';
      pwFeedback.className = 'feedback error';
      return false;
    }
    if (newPwEl.value !== newPwConfirmEl.value) {
      pwFeedback.textContent = '새 비밀번호가 일치하지 않습니다.';
      pwFeedback.className = 'feedback error';
      return false;
    }
    pwFeedback.textContent = '비밀번호가 일치합니다.';
    pwFeedback.className = 'feedback success';
    return true;
  }
  newPwEl.addEventListener('keyup', validateNewPassword);
  newPwConfirmEl.addEventListener('keyup', validateNewPassword);

  async function submitNewPassword() {
    var newPassword = newPwEl.value;
    var newPasswordConfirm = newPwConfirmEl.value;

    if (!newPassword || newPassword.length < 4) {
      window.showToast('비밀번호는 4자 이상으로 설정해주세요.', 'warn');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      window.showToast('새 비밀번호가 일치하지 않습니다.', 'warn');
      return;
    }
    if (!verifiedUserid) {
      window.showToast('본인 인증 정보가 없습니다. 처음부터 다시 시도해주세요.', 'error');
      return;
    }

    btnChange.disabled = true;
    btnChangeText.textContent = '변경 중…';
    btnChangeIcon.className = 'ph-light ph-circle-notch spin';
    setMsg('비밀번호 변경 중…', 'info');

    try {
      var r = await authFetch('/reset-password', {
        userid: verifiedUserid,
        newPassword: newPassword,
      });
      if (r.ok) {
        window.showToast('비밀번호가 성공적으로 변경되었습니다.', 'success');
        setMsg('비밀번호가 변경되었습니다. 로그인 페이지로 이동합니다…', 'success');
        setTimeout(function () { window.location.href = 'login.new.html'; }, 1200);
      } else {
        var msg = (r.data && r.data.message) || '비밀번호 변경에 실패했습니다.';
        window.showToast(msg, 'error');
        setMsg(msg, 'error');
        btnChange.disabled = false;
        btnChangeText.textContent = '비밀번호 변경';
        btnChangeIcon.className = 'ph-light ph-arrow-clockwise';
      }
    } catch (e) {
      window.showToast('서버 통신 중 오류가 발생했습니다.', 'error');
      setMsg('서버 통신 오류', 'error');
      btnChange.disabled = false;
      btnChangeText.textContent = '비밀번호 변경';
      btnChangeIcon.className = 'ph-light ph-arrow-clockwise';
    }
  }
  btnChange.addEventListener('click', submitNewPassword);

  // ── 초기 상태 ──
  showStep(1);
  try { useridEl.focus(); } catch (_) {}
})();
