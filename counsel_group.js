/* ============================================================
 * counsel_group.new.js — 그룹 상담 (counsel_group)
 * 원본 counsel_group.html 의 기능을 100% 보존:
 *   - 대학/학과/전형 콤보 필터
 *   - 상담 대상 학생 목록 조회 (_counsel_by_college)
 *   - 실기 종목 조회 (_events_by_practical_id, gender=남 기준)
 *   - 내신/실기 입력 변경 시 /calculate-final-score 자동 호출
 *   - 종목별 감수, 총 감수, 합산 점수 하이라이트 (맥스컷 초과)
 *   - 학생 추가 (_student_list), 그룹 일괄 저장 (_counsel_by_college_save)
 *   - 배점표 모달 (_get_score_table)
 * API: /profile, _college_list, _student_list, /calculate-final-score,
 *      _counsel_by_college, _events_by_practical_id,
 *      _counsel_by_college_save, _get_score_table
 * ============================================================ */

(function () {
  'use strict';

  const esc = window.escapeHtml;

  // ───────── 상태 ─────────
  let colleges = [];
  let collegeGroups = {};
  let allBranchStudents = [];
  let currentCollege = null;
  let currentStudentMap = {}; // { 학생ID: student }
  let practicalEvents = [];

  let collegeCombo = null;
  let majorCombo = null;
  let typeCombo = null;
  let addStudentCombo = null;

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

  // ───────── 초기 ─────────
  async function init() {
    const yearChip = document.getElementById('yearChip');
    if (yearChip) yearChip.textContent = (window.SUSI_YEAR || '26') + '학년도';

    collegeCombo = window.createCombobox(document.getElementById('comboCollege'), {
      placeholder: '대학 선택', searchable: true, options: [],
      onChange: onCollegeChange,
    });
    majorCombo = window.createCombobox(document.getElementById('comboMajor'), {
      placeholder: '학과 선택', searchable: true, options: [], disabled: true,
      onChange: onMajorChange,
    });
    typeCombo = window.createCombobox(document.getElementById('comboType'), {
      placeholder: '전형 선택', searchable: false, options: [], disabled: true,
      onChange: onTypeChange,
    });
    addStudentCombo = window.createCombobox(document.getElementById('comboAddStudent'), {
      placeholder: '학생 선택', searchable: true, options: [],
      onChange: onPickStudentToAdd,
    });

    document.getElementById('btnSearch').addEventListener('click', searchConsultations);
    document.getElementById('btnScoreTable').addEventListener('click', openScoreTablePopup);
    document.getElementById('btnAddStudent').addEventListener('click', openStudentAddModal);
    document.getElementById('btnConfirmAddStudent').addEventListener('click', confirmAddStudent);
    document.getElementById('btnSaveAll').addEventListener('click', saveGroupData);
    /* [data-action="modal-close"] 는 공용 modal.js v2 가 전역 delegation 처리 */

    await loadInitialData();
  }

  async function loadInitialData() {
    try {
      const [profileData, collegeData, studentData] = await Promise.all([
        window.api('/profile').catch(() => ({})),
        window.api('_college_list').catch(() => ({})),
        window.api('_student_list').catch(() => ({})),
      ]);
      if (profileData && profileData.success && profileData.user && profileData.user.branch) {
        const titleEl = document.getElementById('pageSub');
        if (titleEl) {
          const y = window.SUSI_YEAR || '26';
          titleEl.textContent = `${profileData.user.branch} 교육원 — ${y}학년도 상담 후보 일괄 편집`;
        }
      }
      if (collegeData && collegeData.success) {
        colleges = collegeData.colleges || [];
        groupColleges();
        populateCollegeCombo();
      }
      if (studentData && studentData.success) {
        allBranchStudents = studentData.students || [];
      }
    } catch (err) {
      console.error('[counsel_group] init', err);
      if (window.showToast) window.showToast('초기 로드 실패', 'error');
    }
  }

  function groupColleges() {
    collegeGroups = {};
    colleges.forEach(c => {
      if (!collegeGroups[c.대학명]) collegeGroups[c.대학명] = {};
      if (!collegeGroups[c.대학명][c.학과명]) collegeGroups[c.대학명][c.학과명] = [];
      collegeGroups[c.대학명][c.학과명].push(c.전형명);
    });
  }
  function populateCollegeCombo() {
    const opts = Object.keys(collegeGroups).sort().map(name => ({ value: name, label: name }));
    collegeCombo.setOptions(opts);
  }

  function onCollegeChange(v) {
    if (!v) {
      majorCombo.setOptions([]); majorCombo.disable();
      typeCombo.setOptions([]); typeCombo.disable();
      document.getElementById('btnScoreTable').disabled = true;
      return;
    }
    const majors = Object.keys(collegeGroups[v] || {}).sort();
    majorCombo.setOptions(majors.map(m => ({ value: m, label: m })));
    majorCombo.enable(); majorCombo.setValue('');
    typeCombo.setOptions([]); typeCombo.disable();
    document.getElementById('btnScoreTable').disabled = true;
  }
  function onMajorChange(v) {
    const c = collegeCombo.value;
    if (!c || !v) {
      typeCombo.setOptions([]); typeCombo.disable();
      document.getElementById('btnScoreTable').disabled = true;
      return;
    }
    const types = (collegeGroups[c][v] || []).slice().sort();
    typeCombo.setOptions(types.map(t => ({ value: t, label: t })));
    typeCombo.enable(); typeCombo.setValue('');
    document.getElementById('btnScoreTable').disabled = true;
  }
  function onTypeChange(v) {
    document.getElementById('btnScoreTable').disabled = !v;
  }

  // ───────── 조회 ─────────
  async function searchConsultations() {
    const c = collegeCombo.value, m = majorCombo.value, t = typeCombo.value;
    if (!c || !m || !t) {
      if (window.showToast) window.showToast('대학, 학과, 전형을 모두 선택해주세요.', 'info');
      return;
    }
    currentCollege = colleges.find(col => col.대학명 === c && col.학과명 === m && col.전형명 === t);
    if (!currentCollege) return;
    document.getElementById('btnScoreTable').disabled = !currentCollege.실기ID;
    document.getElementById('btnAddStudent').disabled = false;

    showLoading('조회 중...');
    const titleEl = document.getElementById('resultTitle');
    const cutEl = document.getElementById('cutScoresDisplay');
    titleEl.innerHTML = `<strong>${esc(c)} ${esc(m)} (${esc(t)})</strong>`;
    cutEl.innerHTML = `<span>맥스컷: ${esc(String(currentCollege['26맥스예상컷'] || '-'))}</span><span>지점컷: ${esc(String(currentCollege['지점예상컷'] || '-'))}</span>`;

    try {
      await fetchPracticalEvents(currentCollege.실기ID);
      const data = await window.api(`_counsel_by_college?college_id=${encodeURIComponent(currentCollege.대학ID)}`);
      hideLoading();
      if (data && data.success) {
        titleEl.innerHTML += ` <span class="count-chip">(총 ${data.students.length}명)</span>`;
        data.students.sort((a, b) => (b.합산점수 || 0) - (a.합산점수 || 0));
        renderTable(data.students, practicalEvents);
      } else {
        if (window.showToast) window.showToast('데이터 조회 중 문제가 발생했습니다.', 'error');
      }
    } catch (err) {
      hideLoading();
      console.error('[counsel_group] searchConsultations', err);
      if (window.showToast) window.showToast('조회 실패: ' + (err.message || ''), 'error');
    }
  }

  async function fetchPracticalEvents(practicalId) {
    if (!practicalId) { practicalEvents = []; return; }
    try {
      const data = await window.api(`_events_by_practical_id?practical_id=${encodeURIComponent(practicalId)}&gender=남`);
      practicalEvents = (data && data.success) ? Array.from(new Set((data.events || []).map(e => e.종목명))) : [];
    } catch (err) {
      practicalEvents = [];
    }
  }

  // ───────── 테이블 렌더 ─────────
  function renderTable(students, events) {
    const table = document.getElementById('resultTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';
    currentStudentMap = {};
    students.forEach(s => { currentStudentMap[s.학생ID] = s; });

    let h = '<tr><th>이름</th><th>학년</th><th>성별</th><th>등급</th><th>내신점수</th>';
    events.forEach(ev => { h += `<th>${esc(ev)}</th>`; });
    h += '<th>실기총점</th><th>합산점수</th></tr>';
    thead.innerHTML = h;

    if (students.length === 0) {
      tbody.innerHTML = `<tr><td class="empty-cell" colspan="${7 + events.length}">해당 전형으로 상담한 학생이 없습니다.</td></tr>`;
      return;
    }
    students.forEach(stu => addStudentRow(stu, events));
  }

  function addStudentRow(student, events) {
    if (!student) return;
    const tbody = document.getElementById('resultTbody');
    if (tbody.querySelector(`tr[data-student-id="${student.학생ID}"]`)) return;
    if (tbody.querySelector('td.empty-cell')) tbody.innerHTML = '';

    const row = document.createElement('tr');
    row.dataset.studentId = student.학생ID;

    let html = `
      <td>${esc(student.이름 || '')}</td>
      <td>${esc(String(student.학년 || ''))}</td>
      <td>${esc(student.성별 || '')}</td>
      <td><input class="input-grade" type="text" value="${esc(String(student.내신등급 || ''))}"></td>
      <td><input class="input-score" type="text" value="${esc(String(student.내신점수 || ''))}"></td>
    `;
    events.forEach((eventName, i) => {
      html += `<td><div class="practical-input-group"><input type="text" class="input-record" data-event-name="${esc(eventName)}" value="${esc(String(student['기록' + (i + 1)] || ''))}" placeholder="기록"><input type="text" class="input-score-only" readonly></div></td>`;
    });
    html += `<td class="total-score-cell">-</td><td class="total-sum-cell">-</td>`;
    row.innerHTML = html;
    tbody.appendChild(row);

    // 이벤트 바인딩 (oninput 대체)
    row.querySelector('.input-grade').addEventListener('input', () => onNaesinInputChange(row));
    row.querySelector('.input-score').addEventListener('input', () => onNaesinInputChange(row));
    row.querySelectorAll('.input-record').forEach(inp => {
      inp.addEventListener('input', () => onRecordInputChange(row));
    });

    // 학생을 map 에 반영 (추가로 들어온 경우)
    if (!currentStudentMap[student.학생ID]) currentStudentMap[student.학생ID] = student;

    updateScoresForRow(row);
  }

  function onRecordInputChange(row) { updateScoresForRow(row); }
  function onNaesinInputChange(row) { updateScoresForRow(row); }

  // ───────── 핵심 점수 계산 (원본 로직 그대로) ─────────
  async function updateScoresForRow(row) {
    const student = currentStudentMap[row.dataset.studentId];
    if (!currentCollege || !student) return;

    const 내신점수 = row.querySelector('.input-score').value || 0;

    // 실기 없는 전형 처리
    if (!currentCollege.실기ID) {
      row.querySelector('.total-score-cell').textContent = '0.00';
      row.querySelector('.total-sum-cell').textContent = parseFloat(내신점수 || 0).toFixed(2);
      return;
    }

    const recordInputs = row.querySelectorAll('input.input-record');
    const inputs = Array.from(recordInputs).map(inp => ({
      종목명: inp.dataset.eventName,
      기록: inp.value.trim() || null,
    }));

    try {
      const data = await window.api('/calculate-final-score', {
        method: 'POST',
        body: JSON.stringify({
          대학ID: currentCollege.대학ID,
          gender: student.성별,
          inputs,
          내신점수,
        }),
      });

      if (!data || !data.success) return;

      // 개별 점수 및 감수 표시
      recordInputs.forEach(recordInput => {
        const eventName = recordInput.dataset.eventName;
        const scoreInput = recordInput.nextElementSibling; // 옆의 점수 input
        const practicalGroup = recordInput.parentElement;
        if (scoreInput) scoreInput.value = data.종목별점수[eventName] != null ? data.종목별점수[eventName] : '';

        let gamSpan = practicalGroup.querySelector('.gam-span');
        if (!gamSpan) {
          gamSpan = document.createElement('span');
          gamSpan.className = 'gam-span';
          practicalGroup.appendChild(gamSpan);
        }
        const gam = data.종목별감수 ? data.종목별감수[eventName] : 0;
        gamSpan.textContent = gam > 0 ? `(${gam}감)` : '';
      });

      // 실기 총점
      const totalScoreCell = row.querySelector('.total-score-cell');
      totalScoreCell.textContent = (data.실기총점 != null ? parseFloat(data.실기총점) : 0).toFixed(2);

      // 총 감수 span
      let totalGamSpan = totalScoreCell.querySelector('.total-gam-span');
      if (data.총감수 > 0) {
        if (!totalGamSpan) {
          totalGamSpan = document.createElement('span');
          totalGamSpan.className = 'total-gam-span';
          totalScoreCell.appendChild(totalGamSpan);
        }
        totalGamSpan.textContent = `(총 ${data.총감수}감)`;
      } else if (totalGamSpan) {
        totalGamSpan.remove();
      }

      // 합산 점수
      const totalSumCell = row.querySelector('.total-sum-cell');
      const 합산 = data.합산점수 != null ? parseFloat(data.합산점수) : 0;
      totalSumCell.textContent = 합산.toFixed(2);
      const maxCut = parseFloat(currentCollege['26맥스예상컷']);
      totalSumCell.classList.toggle('highlight-score', !isNaN(maxCut) && 합산 > maxCut);
    } catch (err) {
      console.error('[counsel_group] updateScoresForRow', err);
    }
  }

  // ───────── 학생 추가 모달 (일괄 선택 → 일괄 추가) ─────────
  let pendingAddStudents = [];  // 모달 내 선택 대기 목록

  function openStudentAddModal() {
    if (!currentCollege) {
      if (window.showToast) window.showToast('먼저 조회할 대학을 선택해주세요.', 'info');
      return;
    }
    const available = getAvailableStudents();
    if (available.length === 0) {
      if (window.showToast) window.showToast('추가할 수 있는 학생이 없습니다.', 'info');
      return;
    }
    pendingAddStudents = [];
    refreshAddStudentCombo();
    renderPendingStudents();
    window.openModal('addStudentModal');
  }

  // 현재 상담에 이미 있는 + pending 에 있는 학생 제외
  function getAvailableStudents() {
    const displayedIds = Object.keys(currentStudentMap).map(id => parseInt(id, 10));
    const pendingIds = pendingAddStudents.map(s => s.학생ID);
    return allBranchStudents.filter(s =>
      !displayedIds.includes(s.학생ID) && !pendingIds.includes(s.학생ID)
    );
  }

  function refreshAddStudentCombo() {
    const opts = getAvailableStudents().map(s => ({
      value: String(s.학생ID),
      label: `${s.이름} (${s.학년 || '학년정보없음'})`,
    }));
    addStudentCombo.setOptions(opts);
    addStudentCombo.setValue('');
  }

  function onPickStudentToAdd(v) {
    if (!v) return;
    const stu = allBranchStudents.find(s => String(s.학생ID) === String(v));
    if (!stu) return;
    if (pendingAddStudents.some(p => p.학생ID === stu.학생ID)) return;
    pendingAddStudents.push(stu);
    refreshAddStudentCombo();    // pending 제외된 옵션으로 재세팅
    renderPendingStudents();
  }

  function removePendingStudent(studentId) {
    pendingAddStudents = pendingAddStudents.filter(s => String(s.학생ID) !== String(studentId));
    refreshAddStudentCombo();
    renderPendingStudents();
  }

  function renderPendingStudents() {
    const host = document.getElementById('pendingStudents');
    const countEl = document.getElementById('pendingCount');
    if (!host) return;
    if (pendingAddStudents.length === 0) {
      host.innerHTML = '';
      if (countEl) countEl.textContent = '';
      return;
    }
    host.innerHTML = pendingAddStudents.map(s => `
      <span class="pending-chip" data-id="${s.학생ID}">
        <span class="chip-name">${esc(s.이름)}</span>
        <span class="chip-meta">${esc(String(s.학년 || ''))}${s.성별 ? ' · ' + esc(s.성별) : ''}</span>
        <button type="button" class="chip-remove" data-remove="${s.학생ID}" aria-label="${esc(s.이름)} 제거">
          <i class="ph-light ph-x"></i>
        </button>
      </span>
    `).join('');
    host.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => removePendingStudent(btn.dataset.remove));
    });
    if (countEl) countEl.textContent = `선택된 ${pendingAddStudents.length}명`;
  }

  function confirmAddStudent() {
    if (pendingAddStudents.length === 0) {
      if (window.showToast) window.showToast('추가할 학생을 선택하세요.', 'info');
      return;
    }
    pendingAddStudents.forEach(stu => addStudentRow(stu, practicalEvents));
    const n = pendingAddStudents.length;
    pendingAddStudents = [];
    window.closeModal('addStudentModal');
    if (window.showToast) window.showToast(`${n}명 추가되었습니다`, 'success');
  }

  // ───────── 그룹 일괄 저장 (원본 payload 보존) ─────────
  async function saveGroupData() {
    if (!currentCollege) {
      if (window.showToast) window.showToast('저장할 데이터가 없습니다.', 'info');
      return;
    }
    showLoading('저장 중...');
    const rows = document.querySelectorAll('#resultTbody tr[data-student-id]');
    const payload = [];
    rows.forEach(row => {
      const studentID = row.dataset.studentId;
      const recordInputs = row.querySelectorAll('.input-record');
      const scoreInputs = row.querySelectorAll('.input-score-only');
      const d = {
        학생ID: studentID,
        실기ID: currentCollege.실기ID,
        내신등급: row.querySelector('.input-grade').value,
        내신점수: row.querySelector('.input-score').value,
        실기총점: parseFloat(row.querySelector('.total-score-cell').textContent) || null,
        합산점수: parseFloat(row.querySelector('.total-sum-cell').textContent) || null,
      };
      recordInputs.forEach((inp, i) => {
        d[`기록${i + 1}`] = inp.value || null;
        d[`점수${i + 1}`] = scoreInputs[i] ? (scoreInputs[i].value || null) : null;
      });
      payload.push(d);
    });

    try {
      const result = await window.api('_counsel_by_college_save', {
        method: 'POST',
        body: JSON.stringify({
          college_id: currentCollege.대학ID,
          studentData: payload,
        }),
      });
      hideLoading();
      if (result && result.success) {
        if (window.showToast) window.showToast('저장 완료', 'success');
      } else {
        if (window.showToast) window.showToast('저장 실패: ' + (result && result.message ? result.message : ''), 'error');
      }
    } catch (err) {
      hideLoading();
      console.error('[counsel_group] saveGroupData', err);
      if (window.showToast) window.showToast('저장 오류: ' + (err.message || ''), 'error');
    }
  }

  // ───────── 배점표 모달 ─────────
  async function openScoreTablePopup() {
    if (!currentCollege || !currentCollege.실기ID) return;
    document.getElementById('scoreTableTitle').textContent = `${currentCollege.대학명} - ${currentCollege.학과명} (${currentCollege.전형명}) 배점표`;
    const container = document.getElementById('scoreTableContainer');
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-3);">로딩 중...</div>';
    window.openModal('scoreTableModal');

    try {
      const data = await window.api(`_get_score_table?실기ID=${encodeURIComponent(currentCollege.실기ID)}`);
      if (!data || !data.success) {
        container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-3);">배점표를 불러오는 데 실패했습니다.</div>';
        return;
      }
      let html = '<div class="score-grid">';
      Object.keys(data.events).forEach(name => {
        const { 남, 여 } = data.events[name];
        const allScores = new Set([...(남 || []).map(i => i.배점), ...(여 || []).map(i => i.배점)]);
        const sortedScores = Array.from(allScores).sort((a, b) => Number(b) - Number(a));
        const scoreMap = {
          남: new Map((남 || []).map(i => [i.배점, i.기록])),
          여: new Map((여 || []).map(i => [i.배점, i.기록])),
        };
        html += `<div class="score-cell"><table>
          <thead><tr><th colspan="3" class="evt-header">${esc(name)}</th></tr>
          <tr><th>배점</th><th>남</th><th>여</th></tr></thead><tbody>`;
        sortedScores.forEach(sc => {
          html += `<tr><td style="font-weight:600;">${esc(String(sc))}</td><td>${esc(String(scoreMap.남.get(sc) || '-'))}</td><td>${esc(String(scoreMap.여.get(sc) || '-'))}</td></tr>`;
        });
        html += `</tbody></table></div>`;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (err) {
      console.error('[counsel_group] openScoreTablePopup', err);
      container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--danger);">배점표 로드 중 오류 발생.</div>';
    }
  }

  // ───────── 부트 ─────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
