/* ============================================================
 * admin.new.js — 원장회원 승인/관리
 * 원본: admin.html (303 lines)
 * 공용 api()/showToast()/openModal()/escapeHtml() 사용.
 * 기능: role 체크 → 목록 로드 → 승인/삭제 (확인 모달).
 * ============================================================ */

(function () {
  'use strict';

  var confirmModalId = 'confirmModal';
  var pendingAction = null; // { type: 'approve'|'delete', userid }

  var escape = window.escapeHtml;

  async function checkAdmin() {
    var token = window.getToken();
    if (!token) {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
      return false;
    }
    try {
      var json = await window.api('/profile');
      // role === 'admin' 우선, userid 는 하위호환 폴백
      var u = json && json.user;
      if (!json || !json.success || !u || (u.role !== 'admin' && u.userid !== 'admin')) {
        window.showToast('관리자 계정으로만 접근 가능합니다', 'error');
        window.clearToken();
        setTimeout(function () {
          location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
        }, 1000);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[checkAdmin]', e);
      return false;
    }
  }

  async function loadMembers() {
    var tbody = document.getElementById('tableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="placeholder">로딩중...</td></tr>';
    try {
      var json = await window.api('_admin_members');
      if (!json || !json.success) {
        window.showToast(json && json.message ? json.message : '다시 로그인 해주세요.', 'error');
        logoutAndRedirect();
        return;
      }
      var members = json.members || [];
      renderMembers(members);
    } catch (e) {
      console.error('[loadMembers]', e);
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">목록을 불러오지 못했습니다.</td></tr>';
    }
  }

  function renderMembers(members) {
    var tbody = document.getElementById('tableBody');
    var meta = document.getElementById('headMeta');
    if (!members.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="placeholder">가입된 회원이 없습니다.</td></tr>';
      if (meta) meta.textContent = '총 0명';
      return;
    }
    var rows = members.map(function (m) {
      var isApproved = m.승인여부 === 'O';
      var userid = escape(m.아이디);
      var name = escape(m.이름 || '-');
      var branch = escape(m.지점명 || '-');
      var phone = escape(m.전화번호 || '-');
      var badge = isApproved
        ? '<span class="status-pill approved">승인됨</span>'
        : '<span class="status-pill pending">대기중</span>';
      var actions = '<div class="btn-row">'
        + (!isApproved ? '<button type="button" class="btn-mini approve" data-action="approve" data-userid="' + userid + '">승인</button>' : '')
        + '<button type="button" class="btn-mini danger" data-action="delete" data-userid="' + userid + '">삭제</button>'
        + '</div>';
      return '<tr>'
        + '<td>' + userid + '</td>'
        + '<td>' + name + '</td>'
        + '<td>' + branch + '</td>'
        + '<td>' + phone + '</td>'
        + '<td>' + badge + '</td>'
        + '<td>' + actions + '</td>'
        + '</tr>';
    }).join('');
    tbody.innerHTML = rows;
    if (meta) {
      var pending = members.filter(function (m) { return m.승인여부 !== 'O'; }).length;
      meta.textContent = '총 ' + members.length + '명 · 대기 ' + pending + '명';
    }
  }

  function logoutAndRedirect() {
    window.clearToken();
    setTimeout(function () { location.href = 'login.html'; }, 800);
  }

  /* ---- 승인 / 삭제: 모달 기반 확인 ---- */

  function openConfirm(type, userid) {
    pendingAction = { type: type, userid: userid };
    var titleEl = document.getElementById('confirmTitle');
    var msgEl = document.getElementById('confirmMsg');
    var okBtn = document.getElementById('confirmOk');
    if (type === 'approve') {
      titleEl.textContent = '회원 승인';
      msgEl.textContent = "'" + userid + "' 회원을 승인할까요?";
      okBtn.textContent = '승인';
      okBtn.classList.remove('btn-primary');
      okBtn.classList.add('btn-primary');
    } else {
      titleEl.textContent = '회원 삭제';
      msgEl.textContent = "'" + userid + "' 회원을 정말 삭제할까요? 삭제한 정보는 되돌릴 수 없습니다.";
      okBtn.textContent = '삭제';
    }
    window.openModal(confirmModalId);
  }

  async function doConfirm() {
    if (!pendingAction) return;
    var action = pendingAction;
    pendingAction = null;
    window.closeModal(confirmModalId);

    try {
      var path = action.type === 'approve' ? '_admin_approve' : '_admin_delete';
      var res = await window.api(path, {
        method: 'POST',
        body: JSON.stringify({ userid: action.userid }),
      });
      if (res && res.success) {
        window.showToast(action.type === 'approve' ? '승인 완료' : '삭제 완료', 'success');
        loadMembers();
      } else {
        window.showToast((res && res.message) || '오류가 발생했습니다', 'error');
      }
    } catch (e) {
      console.error('[confirm action]', e);
      window.showToast(e && e.message ? e.message : '요청 처리 실패', 'error');
    }
  }

  /* ---- Event wiring ---- */

  document.addEventListener('DOMContentLoaded', function () {
    var reload = document.getElementById('btnReload');
    if (reload) reload.addEventListener('click', loadMembers);

    var cancel = document.getElementById('confirmCancel');
    if (cancel) cancel.addEventListener('click', function () {
      pendingAction = null;
      window.closeModal(confirmModalId);
    });
    var ok = document.getElementById('confirmOk');
    if (ok) ok.addEventListener('click', doConfirm);

    var tbody = document.getElementById('tableBody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-action]');
        if (!btn) return;
        var action = btn.dataset.action;
        var userid = btn.dataset.userid;
        if (!action || !userid) return;
        if (action === 'approve' || action === 'delete') openConfirm(action, userid);
      });
    }

    checkAdmin().then(function (ok) {
      if (ok) loadMembers();
    });
  });
})();
