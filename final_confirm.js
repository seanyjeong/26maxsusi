/* ============================================================
 * final_confirm.new.js — 최종 수합 관리 (데스크톱)
 * 원본 final_confirm.html (308줄) 기능 100% 보존.
 * API: /profile · _college_list · _student_list ·
 *      _events_by_practical_id · _final_list ·
 *      _counsel_candidates · _student_grade · _final_save
 * 규칙:
 *   - fetch / susicFetch / localStorage.token 금지 → window.api()
 *   - 구 알림 라이브러리 금지 → window.showToast / 공용 모달
 *   - 하드코딩 컬러 금지 (CSS 토큰만)
 * N+1 학생 성적 로드 (Promise.all) 원본과 동일 패턴 유지.
 * ============================================================ */

(function () {
  'use strict';

  // ───────── 공용 alias ─────────
  const esc = window.escapeHtml;

  // ───────── 상태 ─────────
  let colleges = [];
  let collegeGroups = {};
  let allBranchStudents = [];
  let currentCollege = null;
  let currentStudentMap = new Map();
  let practicalEvents = [];
  let branchName = '';

  let collegeCombo = null;
  let majorCombo = null;
  let typeCombo = null;

  // pick 모달 상태: { mode: 'counsel'|'direct', candidates: [...] }
  let pickState = { mode: null, candidates: [] };

  // confirm 모달 상태: { type: 'delete'|'saveEmpty', studentId? }
  let confirmState = { type: null, studentId: null, onConfirm: null };

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

  // ───────── 초기 로드 ─────────
  async function loadInitialData() {
    showLoading('데이터 로딩중…');
    try {
      const [profileRes, collegeRes, studentRes] = await Promise.all([
        window.api('/profile'),
        window.api('_college_list'),
        window.api('_student_list'),
      ]);

      if (profileRes && profileRes.success && profileRes.user) {
        branchName = profileRes.user.branch || '';
        const title = document.getElementById('mainTitle');
        if (title && branchName) {
          title.textContent = `${branchName} 교육원 최종 수합 관리`;
        }
      }

      if (collegeRes && collegeRes.success) {
        colleges = collegeRes.colleges || [];
        groupColleges();
        renderCollegeCombo();
      }

      if (studentRes && studentRes.success) {
        allBranchStudents = studentRes.students || [];
      }
    } catch (err) {
      console.error('초기 로드 실패:', err);
      window.showToast('데이터 로딩 중 문제가 발생했습니다', 'error');
    } finally {
      hideLoading();
    }
  }

  function groupColleges() {
    collegeGroups = {};
    colleges.forEach(c => {
      if (!collegeGroups[c.대학명]) collegeGroups[c.대학명] = {};
      if (!collegeGroups[c.대학명][c.학과명]) collegeGroups[c.대학명][c.학과명] = [];
      if (!collegeGroups[c.대학명][c.학과명].includes(c.전형명)) {
        collegeGroups[c.대학명][c.학과명].push(c.전형명);
      }
    });
  }

  // ───────── 콤보박스 렌더 ─────────
  function renderCollegeCombo() {
    const host = document.getElementById('collegeCombo');
    if (!host) return;
    const options = [
      { value: '', label: '선택' },
      ...Object.keys(collegeGroups).sort().map(n => ({ value: n, label: n })),
    ];
    if (collegeCombo) {
      collegeCombo.setOptions(options);
    } else {
      collegeCombo = window.createCombobox(host, {
        options,
        placeholder: '대학명',
        searchable: true,
        searchPlaceholder: '대학명 검색',
        onChange: onCollegeChange,
      });
    }

    // 하위 콤보 초기 렌더 (빈 상태)
    const mHost = document.getElementById('majorCombo');
    if (mHost && !majorCombo) {
      majorCombo = window.createCombobox(mHost, {
        options: [{ value: '', label: '선택' }],
        placeholder: '학과명',
        searchable: true,
        searchPlaceholder: '학과명 검색',
        onChange: onMajorChange,
      });
    }
    const tHost = document.getElementById('typeCombo');
    if (tHost && !typeCombo) {
      typeCombo = window.createCombobox(tHost, {
        options: [{ value: '', label: '선택' }],
        placeholder: '전형명',
        searchable: false,
        onChange: onTypeChange,
      });
    }
  }

  function onCollegeChange(value) {
    // 선택 대학 변경 시 하위 콤보 리셋
    const majorOpts = [{ value: '', label: '선택' }];
    const typeOpts = [{ value: '', label: '선택' }];

    if (value && collegeGroups[value]) {
      Object.keys(collegeGroups[value]).sort().forEach(m => {
        majorOpts.push({ value: m, label: m });
      });
    }
    if (majorCombo) majorCombo.setOptions(majorOpts);
    if (majorCombo && majorCombo.setValue) majorCombo.setValue('');
    if (typeCombo) typeCombo.setOptions(typeOpts);
    if (typeCombo && typeCombo.setValue) typeCombo.setValue('');

    clearResult();
  }

  function onMajorChange(value) {
    const c = collegeCombo ? collegeCombo.value : '';
    const typeOpts = [{ value: '', label: '선택' }];
    if (c && value && collegeGroups[c] && collegeGroups[c][value]) {
      collegeGroups[c][value].slice().sort().forEach(t => {
        typeOpts.push({ value: t, label: t });
      });
    }
    if (typeCombo) typeCombo.setOptions(typeOpts);
    if (typeCombo && typeCombo.setValue) typeCombo.setValue('');

    clearResult();
  }

  function onTypeChange() {
    searchFinalConfirmations();
  }

  function clearResult() {
    document.getElementById('resultTbody').innerHTML =
      '<tr><td colspan="9" class="placeholder">조회할 대학/학과/전형을 선택해주세요.</td></tr>';
    document.getElementById('resultThead').innerHTML = '';
    document.getElementById('resultTitle').textContent = '조회할 대학/학과/전형을 선택해주세요.';
    document.getElementById('cutScoresDisplay').innerHTML = '';
    currentCollege = null;
  }

  // ───────── 실기 종목 조회 ─────────
  async function fetchPracticalEvents(practicalId) {
    if (!practicalId) { practicalEvents = []; return; }
    try {
      // 원본과 동일: gender=남 으로 조회 후 종목명 집합
      const data = await window.api(
        `_events_by_practical_id?practical_id=${encodeURIComponent(practicalId)}&gender=남`
      );
      practicalEvents = data && data.success
        ? [...new Set((data.events || []).map(e => e.종목명))]
        : [];
    } catch (e) {
      console.error('[fetchPracticalEvents]', e);
      practicalEvents = [];
    }
  }

  // ───────── 최종 수합 조회 ─────────
  async function searchFinalConfirmations() {
    const c = collegeCombo ? collegeCombo.value : '';
    const m = majorCombo ? majorCombo.value : '';
    const t = typeCombo ? typeCombo.value : '';
    if (!c || !m || !t) { clearResult(); return; }

    currentCollege = colleges.find(col =>
      col.대학명 === c && col.학과명 === m && col.전형명 === t
    );
    if (!currentCollege) return;

    showLoading('조회 중…');
    try {
      // 타이틀 / 컷점 표시
      const yearKey = `${window.SUSI_YEAR || '26'}맥스예상컷`;
      const titleEl = document.getElementById('resultTitle');
      titleEl.innerHTML = `<strong>${esc(c)}</strong> ${esc(m)} <span class="fc-type">(${esc(t)})</span>`;

      const cutEl = document.getElementById('cutScoresDisplay');
      const maxCut = currentCollege[yearKey] != null ? currentCollege[yearKey]
                    : (currentCollege['26맥스예상컷'] != null ? currentCollege['26맥스예상컷'] : '-');
      const branchCut = currentCollege['지점예상컷'] != null ? currentCollege['지점예상컷'] : '-';
      cutEl.innerHTML =
        `<span class="cut-item">맥스컷 ${esc(maxCut)}</span>` +
        `<span class="cut-item">지점컷 ${esc(branchCut)}</span>`;

      await fetchPracticalEvents(currentCollege.실기ID);

      const data = await window.api(
        `_final_list?college_id=${encodeURIComponent(currentCollege.대학ID)}`
      );
      if (!data || !data.success) {
        window.showToast('데이터 조회 중 문제가 발생했습니다', 'error');
        return;
      }
      const students = (data.students || []).slice();
      titleEl.innerHTML += ` <span class="fc-count">(총 ${students.length}명)</span>`;

      // 합산점수 내림차순
      students.sort((a, b) => (b.합산점수 || 0) - (a.합산점수 || 0));
      renderTable(students);
    } catch (e) {
      console.error('[searchFinalConfirmations]', e);
      window.showToast('조회 실패: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── 테이블 렌더 ─────────
  function renderTable(students) {
    const thead = document.getElementById('resultThead');
    const tbody = document.getElementById('resultTbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';
    currentStudentMap.clear();
    students.forEach(s => currentStudentMap.set(s.학생ID, s));

    thead.innerHTML =
      '<tr>' +
      '<th>이름</th><th>학년</th><th>성별</th>' +
      '<th>등급</th><th>내신점수</th>' +
      '<th>실기종목</th><th>실기일정</th><th>합산점수</th><th>관리</th>' +
      '</tr>';

    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="placeholder">해당 전형으로 수합된 학생이 없습니다.</td></tr>';
      return;
    }
    students.forEach(s => addStudentRow(s, false));
  }

  function addStudentRow(student, isNew) {
    if (!student) return;
    if (isNew === undefined) isNew = true;
    if (isNew && currentStudentMap.has(student.학생ID)) return;

    const tbody = document.getElementById('resultTbody');
    if (tbody.querySelector('td.placeholder')) tbody.innerHTML = '';
    currentStudentMap.set(student.학생ID, student);

    const row = document.createElement('tr');
    row.dataset.studentId = String(student.학생ID);

    const scheduleDate = student.실기일정 ? String(student.실기일정).split(' ')[0] : '';
    const eventsLabel = practicalEvents.length > 0 ? practicalEvents.join(', ') : '비실기';
    const total = student.합산점수 != null ? parseFloat(student.합산점수).toFixed(2) : '-';

    row.innerHTML =
      `<td>${esc(student.이름 || '-')}</td>` +
      `<td>${esc(student.학년 || '-')}</td>` +
      `<td>${esc(student.성별 || '-')}</td>` +
      `<td><input class="input-grade" type="text" value="${esc(student.내신등급 || '')}"></td>` +
      `<td><input class="input-score" type="text" value="${esc(student.내신점수 != null ? student.내신점수 : '')}"></td>` +
      `<td>${esc(eventsLabel)}</td>` +
      `<td><input class="input-date" type="date" value="${esc(scheduleDate)}"></td>` +
      `<td>${esc(total)}</td>` +
      `<td><button type="button" class="fc-delete-btn" data-action="delete">삭제</button></td>`;

    tbody.appendChild(row);

    // 삭제 버튼 이벤트
    const delBtn = row.querySelector('[data-action="delete"]');
    if (delBtn) {
      delBtn.addEventListener('click', () => askDeleteRow(row));
    }
  }

  // ───────── 행 삭제 확인 ─────────
  function askDeleteRow(row) {
    confirmState = {
      type: 'delete',
      studentId: parseInt(row.dataset.studentId, 10),
      onConfirm: () => {
        currentStudentMap.delete(confirmState.studentId);
        row.remove();
      },
    };
    document.getElementById('confirmTitle').textContent = '정말 삭제할까요?';
    document.getElementById('confirmMsg').textContent = '이 학생을 명단에서 제거합니다.';
    const okBtn = document.getElementById('confirmOk');
    okBtn.textContent = '삭제';
    window.openModal('confirmModal');
  }

  // ───────── 상담학생 불러오기 (_counsel_candidates) ─────────
  async function importFromCounsel() {
    if (!currentCollege) {
      window.showToast('먼저 조회할 대학을 선택해주세요', 'warning');
      return;
    }
    showLoading('상담학생 조회 중…');
    try {
      const data = await window.api(
        `_counsel_candidates?college_id=${encodeURIComponent(currentCollege.대학ID)}`
      );
      if (!data || !data.success || !data.candidates || data.candidates.length === 0) {
        window.showToast('불러올 수 있는 상담 학생이 없습니다', 'info');
        return;
      }
      // 이미 목록에 없는 학생만 표시
      const candidates = data.candidates.filter(s => !currentStudentMap.has(s.학생ID));
      if (candidates.length === 0) {
        window.showToast('이미 모두 명단에 포함되어 있습니다', 'info');
        return;
      }
      pickState = { mode: 'counsel', candidates };
      renderPickModal('상담학생 불러오기');
    } catch (e) {
      console.error('[importFromCounsel]', e);
      window.showToast('상담학생 조회 실패: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── 학생 직접 추가 ─────────
  function openStudentAddModal() {
    if (!currentCollege) {
      window.showToast('먼저 조회할 대학을 선택해주세요', 'warning');
      return;
    }
    const candidates = allBranchStudents.filter(s => !currentStudentMap.has(s.학생ID));
    if (candidates.length === 0) {
      window.showToast('추가할 수 있는 학생이 없습니다', 'info');
      return;
    }
    pickState = { mode: 'direct', candidates };
    renderPickModal('학생 직접 추가');
  }

  function renderPickModal(title) {
    document.getElementById('pickTitle').textContent = title;
    document.getElementById('pickSearch').value = '';
    renderPickList('');
    window.openModal('pickModal');
    // focus
    setTimeout(() => {
      const s = document.getElementById('pickSearch');
      if (s) s.focus();
    }, 60);
  }

  function renderPickList(filter) {
    const list = document.getElementById('pickList');
    const f = (filter || '').trim();
    const items = pickState.candidates.filter(s => {
      if (!f) return true;
      return String(s.이름 || '').toLowerCase().includes(f.toLowerCase());
    });
    if (items.length === 0) {
      list.innerHTML = '<div class="fc-pick-empty">표시할 학생이 없습니다.</div>';
      return;
    }
    list.innerHTML = items.map(s => {
      const sid = esc(String(s.학생ID));
      const name = esc(s.이름 || '-');
      const grade = esc(s.학년 || 'N/A');
      return `<label class="fc-pick-row">` +
             `<input type="checkbox" value="${sid}">` +
             `<span class="fc-pick-name">${name}</span>` +
             `<span class="fc-pick-meta">${grade}</span>` +
             `</label>`;
    }).join('');
  }

  async function confirmPick() {
    const list = document.getElementById('pickList');
    const checked = Array.from(list.querySelectorAll('input[type="checkbox"]:checked'));
    if (checked.length === 0) {
      window.showToast('추가할 학생을 선택해주세요', 'warning');
      return;
    }
    const selectedIds = checked.map(cb => cb.value);
    window.closeModal('pickModal');

    if (pickState.mode === 'counsel') {
      // 상담학생: candidates 내부 데이터 그대로 행 추가
      selectedIds.forEach(id => {
        const s = pickState.candidates.find(c => String(c.학생ID) === id);
        if (s) addStudentRow(s, true);
      });
    } else if (pickState.mode === 'direct') {
      // 직접 추가: 학생별 내신 조회 (N+1 원본 패턴 유지, Promise.all 병렬)
      showLoading('학생 내신 정보 조회 중…');
      try {
        const gradePromises = selectedIds.map(id =>
          window.api(`_student_grade?student_id=${encodeURIComponent(id)}`).catch(e => {
            console.error('[student_grade]', id, e);
            return { success: false };
          })
        );
        const results = await Promise.all(gradePromises);

        selectedIds.forEach((id, i) => {
          const base = pickState.candidates.find(s => String(s.학생ID) === id);
          if (!base) return;
          const studentToAdd = Object.assign({}, base);
          const gradeData = results[i];
          if (gradeData && gradeData.success && Array.isArray(gradeData.grades)) {
            const specific = gradeData.grades.find(g => g.대학ID === currentCollege.대학ID);
            if (specific) {
              studentToAdd.내신등급 = specific.등급;
              studentToAdd.내신점수 = specific.내신점수;
            }
          }
          addStudentRow(studentToAdd, true);
        });
      } catch (e) {
        console.error('[direct add]', e);
        window.showToast('학생 추가 중 문제가 발생했습니다: ' + e.message, 'error');
      } finally {
        hideLoading();
      }
    }
  }

  // ───────── 최종 저장 (_final_save) ─────────
  async function saveFinalData() {
    if (!currentCollege) {
      window.showToast('저장할 데이터가 없습니다', 'warning');
      return;
    }

    const rows = Array.from(document.querySelectorAll('#resultTbody tr[data-student-id]'));
    const payload = rows.map(row => ({
      학생ID: parseInt(row.dataset.studentId, 10),
      실기ID: currentCollege.실기ID,
      내신등급: row.querySelector('.input-grade').value,
      내신점수: row.querySelector('.input-score').value,
      실기일정: row.querySelector('.input-date').value || null,
    }));

    if (payload.length === 0) {
      // 빈 저장 확인 (원본과 동일)
      confirmState = {
        type: 'saveEmpty',
        studentId: null,
        onConfirm: () => doSaveFinal(payload),
      };
      document.getElementById('confirmTitle').textContent = '정말 저장할까요?';
      document.getElementById('confirmMsg').textContent =
        '현재 명단에 학생이 없습니다. 이대로 저장하면 해당 전형의 모든 학생 데이터가 삭제됩니다.';
      const okBtn = document.getElementById('confirmOk');
      okBtn.textContent = '모두 삭제하고 저장';
      window.openModal('confirmModal');
      return;
    }

    await doSaveFinal(payload);
  }

  async function doSaveFinal(payload) {
    showLoading('저장 중…');
    try {
      const result = await window.api('_final_save', {
        method: 'POST',
        body: JSON.stringify({
          college_id: currentCollege.대학ID,
          studentData: payload,
        }),
      });
      if (result && result.success) {
        window.showToast('저장 완료!', 'success');
        searchFinalConfirmations();
      } else {
        window.showToast((result && result.message) || '저장 실패', 'error');
      }
    } catch (e) {
      console.error('[saveFinal]', e);
      window.showToast('저장 실패: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── 이벤트 바인딩 ─────────
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnImport').addEventListener('click', importFromCounsel);
    document.getElementById('btnAddDirect').addEventListener('click', openStudentAddModal);
    document.getElementById('btnSaveAll').addEventListener('click', saveFinalData);

    // confirm 모달
    document.getElementById('confirmOk').addEventListener('click', () => {
      window.closeModal('confirmModal');
      if (confirmState.onConfirm) confirmState.onConfirm();
      confirmState = { type: null, studentId: null, onConfirm: null };
    });
    document.getElementById('confirmCancel').addEventListener('click', () => {
      window.closeModal('confirmModal');
      confirmState = { type: null, studentId: null, onConfirm: null };
    });
    document.getElementById('confirmCloseX').addEventListener('click', () => {
      window.closeModal('confirmModal');
      confirmState = { type: null, studentId: null, onConfirm: null };
    });

    // pick 모달
    document.getElementById('pickOk').addEventListener('click', confirmPick);
    document.getElementById('pickCancel').addEventListener('click', () => window.closeModal('pickModal'));
    document.getElementById('pickCloseX').addEventListener('click', () => window.closeModal('pickModal'));
    document.getElementById('pickSearch').addEventListener(
      'input',
      window.debounce(e => renderPickList(e.target.value), 120)
    );

    loadInitialData();
  });
})();
