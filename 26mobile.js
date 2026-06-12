/* ============================================================
 * 26mobile.new.js — 모바일 실기 수합 (폰 UX, 시험장 현장 입력)
 * 원본 26mobile.html (673줄) 의 기능 100% 보존. PDF 기능 없음 (원본 무).
 * API: /profile · _college_list · /branch-assigned-colleges ·
 *      _final_list (× 2) · _events_by_practical_id ·
 *      /calculate-final-score · /save_single_student_record
 * 특수 기능:
 *   - 모바일 UX (큰 터치 타깃, 세로 스크롤, user-scalable=no)
 *   - ✅ 수합완료 대학/학과/전형 prefix 유지
 *   - 단일 학생 기록 입력 → calculate-final-score → save_single_student_record
 * 규칙:
 *   - fetch / susicFetch / localStorage.token 금지 → window.api()
 *   - 구 알림 라이브러리 금지 → window.showToast / 공용 모달
 *   - 하드코딩 컬러 금지 (CSS 토큰)
 * ============================================================ */

(function () {
  'use strict';

  // ───────── 공용 alias ─────────
  const esc = window.escapeHtml;

  // ───────── 상태 ─────────
  let colleges = [];
  let collegeGroups = {};
  let assignedCollegeIds = new Set();
  let selectedCollege = null;
  let branchName = '';

  let collegeCombo = null;
  let majorCombo = null;
  let typeCombo = null;

  // 기록 모달 상태
  let recordCtx = null; // { studentId, studentName, gender, naesinScore, events }
  let lastSaveResult = null; // { studentName, events, inputs, calcResult }

  // ───────── 로딩 오버레이 ─────────
  function showLoading(text) {
    const el = document.getElementById('loadingOverlay');
    if (!el) return;
    const lt = document.getElementById('loadingText');
    if (lt) lt.textContent = text || '로딩중…';
    el.hidden = false;
  }
  function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.hidden = true;
  }

  // ───────── 초기화 ─────────
  async function init() {
    // 토큰 체크
    if (!window.getToken || !window.getToken()) {
      location.href = 'login.html?next=' + encodeURIComponent(window.location.href);
      return;
    }

    showLoading('사용자 정보 확인 중…');
    try {
      const [profileData, collegeData, assignedData] = await Promise.all([
        window.api('/profile'),
        window.api('_college_list'),
        window.api('/branch-assigned-colleges'),
      ]);

      if (!profileData || !profileData.success || !profileData.user || !profileData.user.branch) {
        window.showToast('사용자 정보(지점)를 확인할 수 없습니다. 다시 로그인해주세요.', 'error');
        setTimeout(() => {
          location.href = 'login.html?next=' + encodeURIComponent(window.location.href);
        }, 900);
        return;
      }

      branchName = profileData.user.branch;
      const year = window.SUSI_YEAR || '26';
      const titleEl = document.getElementById('mTitle');
      if (titleEl) titleEl.textContent = `${year}학년도 ${branchName} 실기수합`;

      if (assignedData && assignedData.success) {
        assignedCollegeIds = new Set(assignedData.college_ids || []);
      }

      if (collegeData && collegeData.success) {
        colleges = collegeData.colleges || [];
        buildGroups();
        renderCollegeCombo();
      } else {
        throw new Error('대학 목록을 불러오지 못했습니다');
      }
    } catch (err) {
      console.error('[init]', err);
      window.showToast('데이터 로딩 중 문제가 발생했습니다', 'error');
      setTimeout(() => {
        location.href = 'login.html?next=' + encodeURIComponent(window.location.href);
      }, 1200);
    } finally {
      hideLoading();
    }
  }

  // ───────── 그룹핑 ─────────
  function buildGroups() {
    collegeGroups = {};
    colleges.forEach(c => {
      if (!collegeGroups[c.대학명]) collegeGroups[c.대학명] = {};
      if (!collegeGroups[c.대학명][c.학과명]) collegeGroups[c.대학명][c.학과명] = [];
      if (!collegeGroups[c.대학명][c.학과명].includes(c.전형명)) {
        collegeGroups[c.대학명][c.학과명].push(c.전형명);
      }
    });
  }

  // ───────── 콤보박스 ─────────
  function renderCollegeCombo() {
    const host = document.getElementById('mCollegeCombo');
    if (!host) return;

    const options = [
      { value: '', label: '선택' },
      ...Object.keys(collegeGroups).sort().map(collegeName => {
        const isAssigned = colleges.some(col =>
          col.대학명 === collegeName && assignedCollegeIds.has(col.대학ID)
        );
        const prefix = isAssigned ? '✅ ' : '';
        return { value: collegeName, label: prefix + collegeName };
      }),
    ];
    collegeCombo = window.createCombobox(host, {
      options,
      placeholder: '대학명',
      searchable: true,
      searchPlaceholder: '대학명 검색',
      onChange: onCollegeChange,
    });

    // 하위 콤보 (초기 빈 상태)
    const mHost = document.getElementById('mMajorCombo');
    majorCombo = window.createCombobox(mHost, {
      options: [{ value: '', label: '선택' }],
      placeholder: '학과명',
      searchable: true,
      searchPlaceholder: '학과명 검색',
      onChange: onMajorChange,
    });
    majorCombo.disable();

    const tHost = document.getElementById('mTypeCombo');
    typeCombo = window.createCombobox(tHost, {
      options: [{ value: '', label: '선택' }],
      placeholder: '전형명',
      searchable: false,
      onChange: onTypeChange,
    });
    typeCombo.disable();
  }

  function onCollegeChange(value) {
    // 하위 리셋
    const majorOpts = [{ value: '', label: '선택' }];
    if (value && collegeGroups[value]) {
      Object.keys(collegeGroups[value]).sort().forEach(majorName => {
        const isAssigned = colleges.some(col =>
          col.대학명 === value && col.학과명 === majorName && assignedCollegeIds.has(col.대학ID)
        );
        const prefix = isAssigned ? '✅ ' : '';
        majorOpts.push({ value: majorName, label: prefix + majorName });
      });
      majorCombo.setOptions(majorOpts);
      majorCombo.setValue('');
      majorCombo.enable();
    } else {
      majorCombo.setOptions(majorOpts);
      majorCombo.setValue('');
      majorCombo.disable();
    }
    typeCombo.setOptions([{ value: '', label: '선택' }]);
    typeCombo.setValue('');
    typeCombo.disable();

    hideStudentList();
  }

  function onMajorChange(value) {
    const c = collegeCombo.value;
    const typeOpts = [{ value: '', label: '선택' }];

    if (c && value && collegeGroups[c] && collegeGroups[c][value]) {
      collegeGroups[c][value].slice().sort().forEach(typeName => {
        const univ = colleges.find(col =>
          col.대학명 === c && col.학과명 === value && col.전형명 === typeName
        );
        const isAssigned = univ && assignedCollegeIds.has(univ.대학ID);
        const prefix = isAssigned ? '✅ ' : '';
        typeOpts.push({ value: typeName, label: prefix + typeName });
      });
      typeCombo.setOptions(typeOpts);
      typeCombo.setValue('');
      typeCombo.enable();
    } else {
      typeCombo.setOptions(typeOpts);
      typeCombo.setValue('');
      typeCombo.disable();
    }
    hideStudentList();
  }

  async function onTypeChange(value) {
    const c = collegeCombo.value;
    const m = majorCombo.value;
    selectedCollege = colleges.find(col =>
      col.대학명 === c && col.학과명 === m && col.전형명 === value
    ) || null;

    if (selectedCollege) {
      await loadAndRenderStudents();
    } else {
      hideStudentList();
    }
  }

  function hideStudentList() {
    const card = document.getElementById('mStudentCard');
    if (card) card.hidden = true;
  }

  // ───────── 학생 목록 로드 (_final_list) ─────────
  async function loadAndRenderStudents() {
    const card = document.getElementById('mStudentCard');
    const list = document.getElementById('mStudentList');
    const count = document.getElementById('mCount');
    card.hidden = false;
    list.innerHTML = '<div class="m-empty"><i class="ph-light ph-spinner"></i><p>학생 목록을 불러오는 중…</p></div>';
    count.textContent = '';

    try {
      const data = await window.api(
        `_final_list?college_id=${encodeURIComponent(selectedCollege.대학ID)}`
      );
      if (!data || !data.success) throw new Error('학생 목록 조회 실패');

      const students = (data.students || []).slice();
      if (students.length === 0) {
        list.innerHTML =
          '<div class="m-empty"><i class="ph-light ph-user"></i><p>해당 대학에 수합된 학생이 없습니다.</p></div>';
        count.textContent = '';
        return;
      }

      // 합산점수 내림차순 (원본과 동일)
      students.sort((a, b) => (b.합산점수 || 0) - (a.합산점수 || 0));
      count.textContent = `${students.length}명`;

      list.innerHTML = students.map(s => {
        const isComplete = !!s.기록1;
        const naesin = s.내신점수 != null ? s.내신점수 : '-';
        const silgi = s.실기총점 != null ? Number(s.실기총점).toFixed(2) : '-';
        const total = s.합산점수 != null ? Number(s.합산점수).toFixed(2) : '-';
        return `
          <div class="m-student-item" data-student-id="${esc(String(s.학생ID))}"
               data-student-name="${esc(s.이름)}"
               data-gender="${esc(s.성별)}"
               data-naesin="${esc(String(s.내신점수 != null ? s.내신점수 : ''))}">
            <div class="m-student-info">
              <div class="m-student-name">
                ${esc(s.이름)}
                ${isComplete ? '<span class="m-status-badge"><i class="ph-fill ph-check"></i>입력완료</span>' : ''}
              </div>
              <div class="m-student-scores">
                <span class="m-score-item">내신 ${esc(String(naesin))}</span>
                <span class="m-score-item">실기 ${esc(silgi)}</span>
                <span class="m-score-item">합산 ${esc(total)}</span>
              </div>
            </div>
            <span class="m-student-arrow"><i class="ph-light ph-caret-right"></i></span>
          </div>
        `;
      }).join('');

      // 클릭 이벤트 바인딩 (onclick 인라인 대신 위임)
      list.querySelectorAll('.m-student-item').forEach(item => {
        item.addEventListener('click', () => {
          const sid = parseInt(item.dataset.studentId, 10);
          const sname = item.dataset.studentName;
          const gender = item.dataset.gender;
          const naesinRaw = item.dataset.naesin;
          const naesin = naesinRaw === '' ? 0 : parseFloat(naesinRaw);
          openRecordModal(sid, sname, gender, isNaN(naesin) ? 0 : naesin);
        });
      });
    } catch (e) {
      console.error('[loadAndRenderStudents]', e);
      list.innerHTML =
        `<div class="m-empty"><i class="ph-light ph-warning-circle"></i><p>학생 목록을 불러오는 데 실패했습니다: ${esc(e.message)}</p></div>`;
      count.textContent = '';
    }
  }

  // ───────── 기록 입력 모달 ─────────
  async function openRecordModal(studentId, studentName, gender, naesinScore) {
    if (!selectedCollege || !selectedCollege.실기ID) {
      window.showToast('선택한 전형은 실기 종목이 없습니다', 'info');
      return;
    }

    showLoading(`${studentName} 학생 정보 로딩중…`);
    try {
      const [eventsData, finalData] = await Promise.all([
        window.api(
          `_events_by_practical_id?practical_id=${encodeURIComponent(selectedCollege.실기ID)}&gender=${encodeURIComponent(gender)}`
        ),
        window.api(
          `_final_list?college_id=${encodeURIComponent(selectedCollege.대학ID)}`
        ),
      ]);

      const events = (eventsData && eventsData.success) ? eventsData.events.map(e => e.종목명) : [];
      if (events.length === 0) throw new Error('실기 종목을 불러오지 못했습니다');

      const studentData = (finalData && finalData.success)
        ? finalData.students.find(s => s.학생ID === studentId) : null;
      const currentRecords = studentData || {};

      // 폼 렌더
      const form = document.getElementById('recordForm');
      form.innerHTML = events.map((event, i) => {
        const prev = currentRecords[`기록${i + 1}`] || '';
        return `<label class="rec-label">${esc(event)}</label>` +
               `<input type="text" id="rec-${i + 1}" class="rec-input" value="${esc(prev)}" placeholder="기록 입력">`;
      }).join('');

      // 타이틀
      document.getElementById('recordTitle').textContent = `${studentName} 학생 기록 입력`;

      // 컨텍스트 저장
      recordCtx = { studentId, studentName, gender, naesinScore: naesinScore || 0, events };

      window.openModal('recordModal');
      // 첫 입력 포커스
      setTimeout(() => {
        const first = document.getElementById('rec-1');
        if (first) first.focus();
      }, 120);
    } catch (e) {
      console.error('[openRecordModal]', e);
      window.showToast('작업 중 문제가 발생했습니다: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── 기록 저장 (calculate + save_single_student_record) ─────────
  async function saveRecord() {
    if (!recordCtx) return;
    const { studentId, studentName, gender, naesinScore, events } = recordCtx;

    // 입력 수집
    const inputs = events.map((eventName, i) => {
      const input = document.getElementById(`rec-${i + 1}`);
      const val = input ? input.value.trim() : '';
      return { 종목명: eventName, 기록: val || null };
    });

    window.closeModal('recordModal');
    showLoading('계산 및 저장 중…');
    try {
      // 1) calculate-final-score
      const calcResult = await window.api('/calculate-final-score', {
        method: 'POST',
        body: JSON.stringify({
          대학ID: selectedCollege.대학ID,
          gender,
          inputs,
          내신점수: naesinScore || 0,
        }),
      });
      if (!calcResult || !calcResult.success) {
        throw new Error((calcResult && calcResult.message) || '점수 계산 실패');
      }

      // 2) save_single_student_record
      const studentDataToSave = {
        학생ID: studentId,
        대학ID: selectedCollege.대학ID,
        실기ID: selectedCollege.실기ID,
        합산점수: calcResult.합산점수,
        실기총점: calcResult.실기총점,
      };
      events.forEach((eventName, i) => {
        studentDataToSave[`기록${i + 1}`] = inputs[i].기록;
        studentDataToSave[`점수${i + 1}`] = calcResult.종목별점수[eventName];
      });

      const saveResult = await window.api('/save_single_student_record', {
        method: 'POST',
        body: JSON.stringify({ studentData: studentDataToSave }),
      });
      if (!saveResult || !saveResult.success) {
        throw new Error((saveResult && saveResult.message) || '최종 저장 실패');
      }

      lastSaveResult = { studentName, events, inputs, calcResult };
      renderResultModal();
      // 목록 갱신
      loadAndRenderStudents();
    } catch (e) {
      console.error('[saveRecord]', e);
      window.showToast('저장 중 오류: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function renderResultModal() {
    if (!lastSaveResult) return;
    const { studentName, events, inputs, calcResult } = lastSaveResult;

    let html = `<p class="res-lead"><strong>${esc(studentName)}</strong> 학생의 기록이 저장되었습니다.</p>`;
    html += `<table class="res-table"><thead><tr>` +
            `<th>종목</th><th>기록</th><th>점수</th><th>감수</th></tr></thead><tbody>`;
    events.forEach((eventName, i) => {
      const 점수 = calcResult.종목별점수 && calcResult.종목별점수[eventName] != null
        ? calcResult.종목별점수[eventName] : '0';
      const 감수 = calcResult.종목별감수 && calcResult.종목별감수[eventName] != null
        ? calcResult.종목별감수[eventName] : '0';
      html += `<tr>` +
              `<td>${esc(eventName)}</td>` +
              `<td>${esc(inputs[i].기록 || '-')}</td>` +
              `<td>${esc(String(점수))}</td>` +
              `<td>${esc(String(감수))}</td>` +
              `</tr>`;
    });
    html += `</tbody></table>`;
    html += `<table class="res-table" style="margin-top:10px;"><tbody>` +
            `<tr><th>실기 총점</th><td class="res-total">${Number(calcResult.실기총점).toFixed(2)} 점</td></tr>` +
            `<tr><th>합산 총점</th><td class="res-total">${Number(calcResult.합산점수).toFixed(2)} 점</td></tr>` +
            `</tbody></table>`;

    document.getElementById('resultBody').innerHTML = html;
    document.getElementById('resultModalTitle').textContent = '저장 및 계산 완료';
    window.openModal('resultModal');
  }

  // ───────── 이벤트 바인딩 ─────────
  document.addEventListener('DOMContentLoaded', () => {
    // 뒤로가기
    document.getElementById('mBack').addEventListener('click', () => history.back());

    // 기록 모달
    document.getElementById('recordSave').addEventListener('click', saveRecord);
    document.getElementById('recordCancel').addEventListener('click', () => window.closeModal('recordModal'));
    document.getElementById('recordCloseX').addEventListener('click', () => window.closeModal('recordModal'));

    // 결과 모달
    document.getElementById('resultOk').addEventListener('click', () => window.closeModal('resultModal'));
    document.getElementById('resultCloseX').addEventListener('click', () => window.closeModal('resultModal'));

    init();
  });
})();
