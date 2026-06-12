/* ============================================================
 * announcement_manager.new.js — 공지사항 관리
 * 원본: announcement_manager.html (158 lines)
 * 공용 api()/showToast()/openModal()/escapeHtml() 사용.
 * 기능: admin role 체크 → 목록 로드 → 작성/삭제 (모달).
 * ============================================================ */

(function () {
  'use strict';

  var WRITE_MODAL = 'announcementModal';
  var DELETE_MODAL = 'confirmDeleteModal';
  var pendingDeleteId = null;

  var escape = window.escapeHtml;

  function formatDateTime(s) {
    if (!s) return '-';
    try {
      var d = new Date(s);
      if (isNaN(d.getTime())) return escape(s);
      return d.toLocaleString('ko-KR');
    } catch (_) { return escape(s); }
  }

  async function checkAdmin() {
    var token = window.getToken();
    if (!token) {
      location.href = 'login.html';
      return false;
    }
    try {
      var json = await window.api('/profile');
      var u = json && json.user;
      if (!json || !json.success || !u || (u.role !== 'admin' && u.userid !== 'admin')) {
        window.showToast('관리자 계정만 접근 가능합니다.', 'error');
        setTimeout(function () { location.href = 'index.html'; }, 900);
        return false;
      }
      return true;
    } catch (e) {
      console.error('[checkAdmin]', e);
      return false;
    }
  }

  async function loadNotices() {
    var tbody = document.getElementById('notice-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="placeholder">로딩중...</td></tr>';
    try {
      var data = await window.api('/announcements');
      renderNotices(data && data.announcements ? data.announcements : []);
    } catch (e) {
      console.error('[loadNotices]', e);
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">목록을 불러오지 못했습니다.</td></tr>';
    }
  }

  function renderNotices(list) {
    var tbody = document.getElementById('notice-tbody');
    var meta = document.getElementById('headMeta');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="placeholder">등록된 공지사항이 없습니다.</td></tr>';
      if (meta) meta.textContent = '총 0건';
      return;
    }
    var rows = list.map(function (n) {
      var title = escape(n.제목);
      var content = escape(n.내용).replace(/\n/g, '<br>');
      var writtenAt = formatDateTime(n.작성일시);
      var important = n.중요 === 'O'
        ? '<span class="status-pill important">중요</span>'
        : '<span class="status-pill muted">-</span>';
      var noticeId = String(n.공지ID || '').replace(/[^0-9]/g, '');
      var action = '<button type="button" class="btn-mini danger" data-action="delete" data-id="' + noticeId + '">삭제</button>';
      return '<tr>'
        + '<td>' + title + '</td>'
        + '<td class="notice-body">' + content + '</td>'
        + '<td>' + writtenAt + '</td>'
        + '<td>' + important + '</td>'
        + '<td>' + action + '</td>'
        + '</tr>';
    }).join('');
    tbody.innerHTML = rows;
    if (meta) {
      var importantCount = list.filter(function (n) { return n.중요 === 'O'; }).length;
      meta.textContent = '총 ' + list.length + '건 · 중요 ' + importantCount + '건';
    }
  }

  /* ---- 작성 modal ---- */

  function openWriteModal() {
    var form = document.getElementById('notice-form');
    if (form) form.reset();
    window.openModal(WRITE_MODAL);
    setTimeout(function () {
      var t = document.getElementById('notice-title');
      if (t) t.focus();
    }, 80);
  }

  async function submitNotice() {
    var title = (document.getElementById('notice-title').value || '').trim();
    var content = (document.getElementById('notice-content').value || '').trim();
    var is_important = document.getElementById('notice-important').checked;
    if (!title) { window.showToast('제목을 입력하세요', 'error'); return; }
    if (!content) { window.showToast('내용을 입력하세요', 'error'); return; }

    var btn = document.getElementById('btnSubmitWrite');
    if (btn) btn.disabled = true;
    try {
      var data = await window.api('/announcements/create', {
        method: 'POST',
        body: JSON.stringify({ title: title, content: content, is_important: is_important }),
      });
      if (data && data.success) {
        window.showToast('공지사항이 등록되었습니다', 'success');
        window.closeModal(WRITE_MODAL);
        loadNotices();
      } else {
        window.showToast((data && data.message) || '등록에 실패했습니다', 'error');
      }
    } catch (e) {
      console.error('[submitNotice]', e);
      window.showToast(e && e.message ? e.message : '등록 실패', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---- 삭제 modal ---- */

  function openDeleteConfirm(id) {
    pendingDeleteId = id;
    window.openModal(DELETE_MODAL);
  }

  async function confirmDelete() {
    if (pendingDeleteId == null) return;
    var id = pendingDeleteId;
    pendingDeleteId = null;
    window.closeModal(DELETE_MODAL);
    try {
      var data = await window.api('/announcements/delete', {
        method: 'POST',
        body: JSON.stringify({ notice_id: Number(id) }),
      });
      if (data && data.success) {
        window.showToast('공지사항이 삭제되었습니다', 'success');
        loadNotices();
      } else {
        window.showToast((data && data.message) || '삭제 실패', 'error');
      }
    } catch (e) {
      console.error('[confirmDelete]', e);
      window.showToast(e && e.message ? e.message : '삭제 실패', 'error');
    }
  }

  /* ---- Wire ---- */

  document.addEventListener('DOMContentLoaded', function () {
    var openBtn = document.getElementById('btnOpenWrite');
    if (openBtn) openBtn.addEventListener('click', openWriteModal);

    var cancelWrite = document.getElementById('btnCancelWrite');
    if (cancelWrite) cancelWrite.addEventListener('click', function () { window.closeModal(WRITE_MODAL); });

    var submit = document.getElementById('btnSubmitWrite');
    if (submit) submit.addEventListener('click', submitNotice);

    var form = document.getElementById('notice-form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); submitNotice(); });

    var cancelDel = document.getElementById('btnCancelDelete');
    if (cancelDel) cancelDel.addEventListener('click', function () {
      pendingDeleteId = null;
      window.closeModal(DELETE_MODAL);
    });
    var okDel = document.getElementById('btnConfirmDelete');
    if (okDel) okDel.addEventListener('click', confirmDelete);

    var tbody = document.getElementById('notice-tbody');
    if (tbody) {
      tbody.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-action="delete"]');
        if (!btn) return;
        var id = btn.dataset.id;
        if (id) openDeleteConfirm(id);
      });
    }

    checkAdmin().then(function (ok) {
      if (ok) loadNotices();
    });
  });
})();
