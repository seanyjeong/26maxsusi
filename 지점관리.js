/* ============================================================
 * 지점관리.new.js — 지점 관리 (branch_manager)
 * API:
 *   - POST /owner_login (JWT 없는 로그인 엔드포인트 → fetch 1회)
 *   - GET  /branch-data-status
 *   - GET  /branch_summary_by_university
 *   - GET  /admin/branch_summary?branch=...
 *   - GET  /admin/all_branch_summary
 * 기능 diff 0: 원본 지점관리.html 의 세 뷰 전환 + XLSX 평탄화 보존.
 * 변경: alert/status 텍스트 → showToast + .bm-status 갱신. SweetAlert 미사용.
 * 규약: /owner_login 은 login.new.js 와 동일 패턴으로 fetch 직접 호출
 *       (토큰 없는 엔드포인트, 성공 시 setToken + window.api 로 전환).
 * ============================================================ */

(function () {
  'use strict';

  var branchCombo = null;

  var esc = window.escapeHtml;

  function updateStatus(message, tone) {
    var el = document.getElementById('status');
    if (!el) return;
    el.textContent = message || '';
    if (tone) el.setAttribute('data-tone', tone);
    else el.removeAttribute('data-tone');
  }

  function parseJwt(token) {
    try {
      var b64url = token.split('.')[1];
      var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      var json = decodeURIComponent(
        atob(b64).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')
      );
      return JSON.parse(json);
    } catch (e) {
      console.error('[지점관리] jwt decode', e);
      return null;
    }
  }

  function showView(which) {
    ['loginView', 'ownerView', 'adminView'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === which) el.classList.remove('hidden');
      else el.classList.add('hidden');
    });
  }

  async function handleLogin() {
    var userid = (document.getElementById('userid').value || '').trim();
    var password = document.getElementById('password').value || '';
    var btn = document.getElementById('loginBtn');

    if (!userid || !password) {
      updateStatus('아이디와 비밀번호를 모두 입력하세요.', 'error');
      return;
    }

    btn.disabled = true;
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph-light ph-circle-notch"></i><span>로그인 중…</span>';
    updateStatus('로그인 시도 중…');

    try {
      // /owner_login 은 JWT 없는 로그인 엔드포인트 — login.new.js 와 동일 패턴
      var res = await fetch(window.API_BASE + '/owner_login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Susi-Year': window.SUSI_YEAR || '26',
        },
        body: JSON.stringify({ userid: userid, password: password }),
      });
      var data = {};
      try { data = await res.json(); } catch (_) { data = {}; }

      if (!data.success || !data.token) {
        throw new Error(data.message || '로그인 실패');
      }

      window.setToken(data.token);
      var user = parseJwt(data.token) || {};
      updateStatus('로그인 성공!', 'success');
      if (window.showToast) window.showToast('로그인 성공', 'success');
      showDashboard(user);
    } catch (err) {
      updateStatus('로그인 실패: ' + (err && err.message ? err.message : ''), 'error');
      if (window.showToast) window.showToast('로그인 실패', 'error');
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  function showDashboard(user) {
    var isAdmin = user && (user.role === 'admin' || user.userid === 'admin');
    if (isAdmin) {
      showView('adminView');
      updateStatus('Admin 대시보드: 지점을 선택하세요.');
      loadAdminBranchList();
    } else {
      showView('ownerView');
      var welcome = document.getElementById('welcomeMsgOwner');
      if (welcome) welcome.textContent = '환영합니다, ' + (user.name || '원장') + ' 원장님!';
      updateStatus((user.branch || '') + ' 지점 데이터 준비 완료.');
    }
  }

  async function loadAdminBranchList() {
    var host = document.getElementById('branchCombo');
    if (!host) return;
    try {
      var data = await window.api('/branch-data-status');
      if (!data.success) throw new Error('지점 목록 로드 실패');
      var options = (data.status || []).map(function (b) {
        return {
          value: b.지점명,
          label: b.지점명 + ' (학생: ' + b.학생_수 + '명)',
        };
      });
      branchCombo = window.createCombobox(host, {
        options: options,
        value: options.length ? options[0].value : '',
        placeholder: '지점 선택',
        searchable: true,
        searchPlaceholder: '지점 검색…',
      });
    } catch (err) {
      console.error('[지점관리] admin branches', err);
      updateStatus(err && err.message ? err.message : '지점 목록 로드 실패', 'error');
    }
  }

  async function handleOwnerDownload() {
    var btn = document.getElementById('downloadBtnOwner');
    btn.disabled = true;
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph-light ph-circle-notch"></i><span>데이터 생성 중…</span>';
    updateStatus('서버에서 데이터를 가져오는 중…');

    try {
      var data = await window.api('/branch_summary_by_university');
      if (!data.success) throw new Error('데이터 가져오기 실패');
      var info = window.getCounselorFromToken() || {};
      await generateExcel(data.universities, info.branch || '내지점');
    } catch (err) {
      console.error('[지점관리] owner', err);
      updateStatus('에러: ' + (err && err.message ? err.message : ''), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function handleAdminDownload() {
    var btn = document.getElementById('downloadBtnAdmin');
    var selected = branchCombo ? branchCombo.value : '';
    if (!selected) {
      updateStatus('지점을 선택하세요.', 'error');
      return;
    }

    btn.disabled = true;
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph-light ph-circle-notch"></i><span>데이터 생성 중…</span>';
    updateStatus('[' + selected + '] 지점 데이터를 가져오는 중…');

    try {
      var data = await window.api('/admin/branch_summary?branch=' + encodeURIComponent(selected));
      if (!data.success) throw new Error('데이터 가져오기 실패');
      await generateExcel(data.universities, selected);
    } catch (err) {
      console.error('[지점관리] admin one', err);
      updateStatus('에러: ' + (err && err.message ? err.message : ''), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function handleAdminAllDownload() {
    var btn = document.getElementById('downloadBtnAdminAll');
    btn.disabled = true;
    var origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph-light ph-circle-notch"></i><span>전 지점 데이터 생성 중…</span>';
    updateStatus('서버에서 [전 지점] 데이터를 모두 가져오는 중… (시간이 걸릴 수 있음)');

    try {
      var data = await window.api('/admin/all_branch_summary');
      if (!data.success) throw new Error('전 지점 데이터 가져오기 실패');
      await generateExcel(data.universities, '전지점_대학명역순');
    } catch (err) {
      console.error('[지점관리] admin all', err);
      updateStatus('에러: ' + (err && err.message ? err.message : ''), 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }

  async function generateExcel(universities, branchName) {
    updateStatus('데이터 평탄화 작업 중…');

    var flat = [];
    (universities || []).forEach(function (uni) {
      var universityName = uni.대학명;
      var departmentName = uni.학과명;
      var events = uni.실기종목 || [];

      (uni.학생들 || []).forEach(function (stu) {
        flat.push({
          '지점 이름': stu.지점명,
          '학교': stu.학교명,
          '학생명': stu.이름,
          '성별': stu.성별,
          '학년': stu.학년,
          '지원대학': universityName,
          '지원대학과': departmentName,
          '내신등급': stu.내신등급,
          '내신총점': stu.내신점수,
          '실기총점': stu.실기총점,
          '수합총점': stu.합산점수,
          '최초결과': stu.최초합여부,
          '최종결과': stu.최종합여부,
          '실기종목1': events[0] || null, '실기기록1': stu.기록1, '실기점수1': stu.점수1,
          '실기종목2': events[1] || null, '실기기록2': stu.기록2, '실기점수2': stu.점수2,
          '실기종목3': events[2] || null, '실기기록3': stu.기록3, '실기점수3': stu.점수3,
          '실기종목4': events[3] || null, '실기기록4': stu.기록4, '실기점수4': stu.점수4,
          '실기종목5': events[4] || null, '실기기록5': stu.기록5, '실기점수5': stu.점수5,
          '실기종목6': events[5] || null, '실기기록6': stu.기록6, '실기점수6': stu.점수6,
          '실기종목7': events[6] || null, '실기기록7': stu.기록7, '실기점수7': stu.점수7,
        });
      });
    });

    if (flat.length === 0) {
      updateStatus('해당 지점은 수합된 데이터가 0건입니다.', 'warn');
      return;
    }

    updateStatus(flat.length + '개 행 엑셀 파일 생성 중…');
    var ws = XLSX.utils.json_to_sheet(flat);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '최종수합데이터');
    var fileName = branchName + '_최종수합데이터_' + new Date().toISOString().split('T')[0] + '.xlsx';
    XLSX.writeFile(wb, fileName);

    updateStatus('엑셀 다운로드 성공! (' + fileName + ')', 'success');
  }

  function bootFromExistingToken() {
    var token = window.getToken && window.getToken();
    if (!token) return false;
    var user = parseJwt(token);
    if (!user) return false;
    showDashboard(user);
    return true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('downloadBtnOwner').addEventListener('click', handleOwnerDownload);
    document.getElementById('downloadBtnAdmin').addEventListener('click', handleAdminDownload);
    document.getElementById('downloadBtnAdminAll').addEventListener('click', handleAdminAllDownload);

    // Enter 키로 로그인 (원본은 버튼 클릭만 있었으나 UX 보강 — 기능 동일)
    ['userid', 'password'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleLogin();
      });
    });

    // 기존 토큰 있으면 바로 대시보드 진입 (원장 재방문 편의, 원본 흐름 유지)
    if (!bootFromExistingToken()) {
      showView('loginView');
      updateStatus('로그인을 진행해주세요.');
    }
  });
})();
