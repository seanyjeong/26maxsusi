/* ============================================================
 * dashboard.new.js — 대시보드 (랜딩 페이지)
 * 원본: dashboard.html (229 lines)
 * 공용 api()/showToast()/openModal()/escapeHtml() 사용.
 * 기능: 공지 로드 → 클릭 상세 모달 / 우리 지점 실기일정 / 합격자 발표일정.
 * 주: 원본 isDateInCurrentWeek / formatDate 로직 그대로 보존.
 * ============================================================ */

(function () {
  'use strict';

  var NOTICE_MODAL = 'noticeDetailModal';

  var escape = window.escapeHtml;

  /* ---- 날짜 유틸 (원본 보존) ---- */

  function isDateInCurrentWeek(dateString) {
    if (!dateString) return false;
    var formattedString = String(dateString).split(' ')[0].replace(/\./g, '-');
    var targetDate = new Date(formattedString + 'T00:00:00');
    if (isNaN(targetDate.getTime())) return false;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var dayOfWeek = today.getDay();
    var diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return targetDate >= monday && targetDate <= sunday;
  }

  function formatDate(dateString) {
    if (!dateString) return '';
    var formattedString = String(dateString).split(' ')[0].replace(/\./g, '-');
    var date = new Date(formattedString + 'T00:00:00');
    if (isNaN(date.getTime())) return String(dateString);
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    return (date.getMonth() + 1) + '월 ' + date.getDate() + '일 (' + days[date.getDay()] + ')';
  }

  /* ---- 공지사항 ---- */

  // 원본 dashboard.html line 113 의 pin SVG 그대로
  var PIN_SVG = '<span class="pin-icon" aria-hidden="true">'
    + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M12 17v5"/>'
    + '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'
    + '</svg></span>';

  async function loadNotices() {
    var list = document.getElementById('notice-list');
    if (!list) return;
    list.innerHTML = '<li class="placeholder">공지사항을 불러오는 중입니다...</li>';
    try {
      var data = await window.api('/announcements');
      var items = (data && data.announcements) || [];
      if (!items.length) {
        list.innerHTML = '<li class="placeholder">등록된 공지사항이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      items.forEach(function (item) {
        var li = document.createElement('li');
        li.className = 'notice-item';
        var isImportant = item.중요 === 'O';
        if (isImportant) li.classList.add('notice-important');
        // 내용은 모달에서 출력할 때 원본 줄바꿈을 보존해야 하므로 dataset 에 저장
        li.dataset.title = item.제목 || '';
        li.dataset.content = item.내용 || '';
        var pin = isImportant ? PIN_SVG : '';
        li.innerHTML = pin + '<span class="notice-title">' + escape(item.제목) + '</span>';
        list.appendChild(li);
      });
    } catch (e) {
      console.error('[loadNotices]', e);
      list.innerHTML = '<li class="placeholder">공지사항을 불러오는 데 실패했습니다.</li>';
    }
  }

  function openNoticeDetail(title, content) {
    var titleEl = document.getElementById('noticeDetailTitle');
    var bodyEl = document.getElementById('noticeDetailBody');
    if (titleEl) titleEl.textContent = title || '';
    if (bodyEl) bodyEl.textContent = content || '';
    window.openModal(NOTICE_MODAL);
  }

  /* ---- 합격자 발표 일정 ---- */

  async function loadAnnouncementDates() {
    var list = document.getElementById('announcement-list');
    if (!list) return;
    list.innerHTML = '<li class="placeholder">일정을 불러오는 중입니다...</li>';
    try {
      var data = await window.api('/announcement-dates');
      var dates = (data && data.dates) || [];
      if (!dates.length) {
        list.innerHTML = '<li class="placeholder">예정된 발표 일정이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      dates.forEach(function (item) {
        var li = document.createElement('li');
        if (isDateInCurrentWeek(item.발표일)) li.classList.add('this-week');
        li.innerHTML =
          '<div class="date">' + escape(formatDate(item.발표일)) + '</div>' +
          '<div class="desc">' + escape(item.대학명 || '') + ' ' + escape(item.학과명 || '') + ' - ' + escape(item.내용 || '') + '</div>';
        list.appendChild(li);
      });
    } catch (e) {
      console.error('[loadAnnouncementDates]', e);
      list.innerHTML = '<li class="placeholder">일정을 불러오는 데 실패했습니다.</li>';
    }
  }

  /* ---- 우리 지점 실기 일정 ---- */

  async function loadBranchSchedule() {
    var list = document.getElementById('schedule-list');
    if (!list) return;
    list.innerHTML = '<li class="placeholder">일정을 불러오는 중입니다...</li>';
    try {
      var data = await window.api('/branch-schedule');
      var schedule = (data && data.schedule) || [];
      if (!schedule.length) {
        list.innerHTML = '<li class="placeholder">예정된 실기 일정이 없습니다.</li>';
        return;
      }
      list.innerHTML = '';
      schedule.forEach(function (item) {
        var li = document.createElement('li');
        var students = Array.isArray(item.students) ? item.students : [];
        var studentNames = students.map(function (s) { return escape(s); }).join(', ');
        if (isDateInCurrentWeek(item.date)) li.classList.add('this-week');
        li.innerHTML =
          '<div class="date">' + escape(formatDate(item.date)) + '</div>' +
          '<div class="desc">' + escape(item.university || '') + ' ' + escape(item.department || '') + ' - <strong>' + studentNames + '</strong> 학생</div>';
        list.appendChild(li);
      });
    } catch (e) {
      console.error('[loadBranchSchedule]', e);
      list.innerHTML = '<li class="placeholder">일정을 불러오는 데 실패했습니다.</li>';
    }
  }

  /* ---- Wire ---- */

  function reloadAll() {
    loadNotices();
    loadAnnouncementDates();
    loadBranchSchedule();
  }

  document.addEventListener('DOMContentLoaded', function () {
    // 토큰 없으면 로그인으로
    if (!window.getToken()) {
      location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
      return;
    }

    var reload = document.getElementById('btnReload');
    if (reload) reload.addEventListener('click', reloadAll);

    var closeDetail = document.getElementById('btnCloseDetail');
    if (closeDetail) closeDetail.addEventListener('click', function () {
      window.closeModal(NOTICE_MODAL);
    });

    var noticeList = document.getElementById('notice-list');
    if (noticeList) {
      noticeList.addEventListener('click', function (e) {
        var li = e.target.closest('li.notice-item');
        if (!li) return;
        openNoticeDetail(li.dataset.title, li.dataset.content);
      });
    }

    reloadAll();
  });
})();
