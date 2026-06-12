/* ============================================================
 * college-grade.new.js — 학생 × 대학 내신/등급 매트릭스
 * 기능 diff 0 — 원본 college-grade.html 의 UX 100% 보존
 *   - _student_grade_map 으로 colleges/students/grade_map 로드
 *   - _student_grade_update 로 단건 업데이트 (페이지 재렌더 없음)
 *   - 대학 검색(필터) · 학생 페이지네이션(5명/페이지) · 학생 검색(페이지 점프)
 * 성능: updateGrade 는 DOM 재그리지 않고 내부 grade_map 만 갱신 (원본 동일)
 * API: 모든 호출 window.api(path) 경유
 * ============================================================ */

(function () {
  'use strict';

  // ── 상수 / 상태 ─────────────────────────────────────────────
  var STUDENTS_PER_PAGE = 5;
  var branch = '';
  var colleges = [];
  var students = [];
  var grade_map = {};
  var filteredColleges = [];
  var currentPage = 1;

  // ── 헬퍼 ────────────────────────────────────────────────────
  var esc = window.escapeHtml;
  function toast(m, t) { if (window.showToast) window.showToast(m, t || 'success'); }

  function setMsg(text, isError) {
    var msg = document.getElementById('msg');
    if (!msg) return;
    if (!text) {
      msg.hidden = true;
      msg.textContent = '';
      msg.classList.remove('is-error');
      return;
    }
    msg.hidden = false;
    msg.textContent = text;
    msg.classList.toggle('is-error', !!isError);
  }

  // ── 지점 표시 ───────────────────────────────────────────────
  function renderBranch() {
    var info = (window.getCounselorFromToken && window.getCounselorFromToken()) || {};
    branch = info.branch || '';
    var chip = document.getElementById('branchChip');
    var txt = document.getElementById('branchChipText');
    if (txt) txt.textContent = '내 지점: ' + (branch || '(지점정보없음)');
    if (chip) chip.hidden = false;
  }

  // ── 데이터 로드 ─────────────────────────────────────────────
  async function loadAll() {
    try {
      var json = await window.api('_student_grade_map');
      if (!json || !json.success) {
        setMsg('데이터 로딩 오류! 다시 로그인 필요', true);
        return;
      }
      colleges = json.colleges || [];
      // 대학명 가나다순 정렬 (원본 동일)
      colleges.sort(function (a, b) {
        return String(a.대학명 || '').localeCompare(String(b.대학명 || ''));
      });
      students = json.students || [];
      grade_map = json.grade_map || {};
      filteredColleges = colleges;

      renderTable();
    } catch (err) {
      setMsg(err && err.message ? err.message : '데이터 로딩 실패', true);
    }
  }

  // ── 테이블 렌더 ─────────────────────────────────────────────
  function renderTable() {
    var start = (currentPage - 1) * STUDENTS_PER_PAGE;
    var end = start + STUDENTS_PER_PAGE;
    var paginated = students.slice(start, end);

    // ── thead ──
    var headHtml = '<tr>' +
      '<th rowspan="2">No</th>' +
      '<th rowspan="2">대학명</th>' +
      '<th rowspan="2">학과명</th>' +
      '<th rowspan="2">전형명</th>';
    paginated.forEach(function (st) {
      headHtml += '<th colspan="2" class="col-name">' + esc(st.이름) + '</th>';
    });
    headHtml += '</tr><tr>';
    paginated.forEach(function () {
      headHtml += '<th>등급</th><th>내신</th>';
    });
    headHtml += '</tr>';
    document.getElementById('tableHead').innerHTML = headHtml;

    // ── tbody ──
    var bodyHtml = '';
    var rows = filteredColleges || [];
    if (!rows.length) {
      bodyHtml = '<tr><td colspan="' + (4 + paginated.length * 2) +
                 '" class="state-row">표시할 대학이 없습니다.</td></tr>';
    } else {
      rows.forEach(function (col, rowIdx) {
        bodyHtml += '<tr>' +
          '<td class="row-no">' + (rowIdx + 1) + '</td>' +
          '<td>' + esc(col.대학명) + '</td>' +
          '<td>' + esc(col.학과명) + '</td>' +
          '<td>' + esc(col.전형명) + '</td>';

        paginated.forEach(function (st) {
          var key = st.학생ID + '-' + col.대학ID;
          var entry = grade_map[key] || {};
          var grade = entry.등급 == null ? '' : String(entry.등급);
          var score = entry.내신점수 == null ? '' : String(entry.내신점수);
          bodyHtml +=
            '<td><input type="text" value="' + esc(grade) +
              '" data-sid="' + st.학생ID + '" data-cid="' + esc(col.대학ID) +
              '" data-kind="grade" placeholder="등급"></td>' +
            '<td><input type="text" value="' + esc(score) +
              '" data-sid="' + st.학생ID + '" data-cid="' + esc(col.대학ID) +
              '" data-kind="score" placeholder="내신"></td>';
        });
        bodyHtml += '</tr>';
      });
    }
    document.getElementById('tableBody').innerHTML = bodyHtml;

    updatePageInfo();
  }

  function updatePageInfo() {
    var totalPages = Math.ceil(students.length / STUDENTS_PER_PAGE);
    document.getElementById('pageInfo').textContent =
      '페이지 ' + currentPage + ' / ' + (totalPages > 0 ? totalPages : 1);
    document.getElementById('prevPageBtn').disabled = (currentPage === 1);
    document.getElementById('nextPageBtn').disabled = (currentPage >= totalPages);
  }

  // ── 이벤트: 대학 검색 (필터) ─────────────────────────────────
  function bindCollegeSearch() {
    document.getElementById('searchInput').addEventListener('input', function () {
      var q = this.value.trim().toLowerCase();
      if (!q) {
        filteredColleges = colleges;
      } else {
        filteredColleges = colleges.filter(function (col) {
          return (col.대학명 && String(col.대학명).toLowerCase().indexOf(q) !== -1) ||
                 (col.학과명 && String(col.학과명).toLowerCase().indexOf(q) !== -1) ||
                 (col.전형명 && String(col.전형명).toLowerCase().indexOf(q) !== -1);
        });
      }
      renderTable();
    });
  }

  // ── 이벤트: 페이지네이션 ─────────────────────────────────────
  function bindPagination() {
    document.getElementById('prevPageBtn').addEventListener('click', function () {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
    document.getElementById('nextPageBtn').addEventListener('click', function () {
      var totalPages = Math.ceil(students.length / STUDENTS_PER_PAGE);
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    });
  }

  // ── 이벤트: 학생 이름 검색 → 페이지 점프 ─────────────────────
  function bindStudentSearch() {
    var input = document.getElementById('studentSearchInput');
    var btn = document.getElementById('studentSearchBtn');

    function find() {
      var qRaw = input.value.trim();
      var q = qRaw.toLowerCase();
      if (!q) {
        toast('검색할 학생 이름을 입력하세요.', 'info');
        return;
      }
      var idx = students.findIndex(function (st) {
        return st.이름 && String(st.이름).toLowerCase().indexOf(q) !== -1;
      });
      if (idx !== -1) {
        var target = Math.floor(idx / STUDENTS_PER_PAGE) + 1;
        if (currentPage !== target) {
          currentPage = target;
          renderTable();
        }
      } else {
        toast('"' + qRaw + '" 학생을 찾을 수 없습니다.', 'error');
      }
    }

    btn.addEventListener('click', find);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        find();
      }
    });
  }

  // ── 이벤트 위임: 셀 input onchange → updateGrade ─────────────
  function bindTableDelegation() {
    var tbody = document.getElementById('tableBody');
    tbody.addEventListener('change', function (e) {
      var t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      var sid = t.getAttribute('data-sid');
      var cid = t.getAttribute('data-cid');
      var kind = t.getAttribute('data-kind');
      if (!sid || !cid || !kind) return;
      var val = t.value;
      if (kind === 'grade') updateGrade(Number(sid), cid, val, null);
      else if (kind === 'score') updateGrade(Number(sid), cid, null, val);
    });
  }

  // ── 등급/내신 저장 ──────────────────────────────────────────
  async function updateGrade(student_id, college_id, grade, score) {
    var key = student_id + '-' + college_id;
    var prev = grade_map[key] || {};
    if (grade === null) grade = prev.등급 == null ? '' : prev.등급;
    if (score === null) score = prev.내신점수 == null ? '' : prev.내신점수;
    grade_map[key] = { 등급: grade, 내신점수: score };

    try {
      var json = await window.api('_student_grade_update', {
        method: 'POST',
        body: JSON.stringify({
          student_id: student_id,
          college_id: college_id,
          '등급': grade,
          '내신점수': score,
        }),
      });
      if (!json || !json.success) {
        setMsg((json && json.message) || '저장실패', true);
      } else {
        setMsg('성공적으로 저장되었습니다!', false);
        setTimeout(function () { setMsg('', false); }, 1500);
      }
    } catch (err) {
      setMsg(err && err.message ? err.message : '저장실패', true);
    }
  }

  // ── 초기화 ──────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.getToken || !window.getToken()) {
      window.location.href = 'login.html?next=' + encodeURIComponent(location.pathname);
      return;
    }
    renderBranch();
    bindCollegeSearch();
    bindPagination();
    bindStudentSearch();
    bindTableDelegation();
    loadAll();
  });
})();
