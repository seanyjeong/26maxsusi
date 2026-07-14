/* 수시 실시간 현황: 조회, 개인정보 모드, 표·카드·상세·배점표 */
(function () {
  'use strict';

  const esc = window.escapeHtml;
  const privacy = window.MaxLivePrivacy;
  let colleges = [];
  let collegeGroups = {};
  let loggedInUserBranch = '';
  let studentDataMap = new Map();
  let currentEvents = [];
  let latestRanking = [];
  let scoreTableMap = {};
  let collegeCombo = null;
  let majorCombo = null;
  let typeCombo = null;

  function gradeBadge(grade) {
    if (grade == null || grade === '') return '<span class="grade-badge grade-none">-</span>';
    const rounded = Math.round(parseFloat(grade));
    const cls = rounded >= 1 && rounded <= 9 ? 'grade-' + rounded : 'grade-none';
    return `<span class="grade-badge ${cls}">${esc(String(grade))}</span>`;
  }

  function fmtNum(value, digits) {
    if (value == null) return '-';
    const number = parseFloat(value);
    if (Number.isNaN(number)) return '-';
    return digits != null ? number.toFixed(digits) : String(number);
  }

  function visibleStudent(student) {
    return privacy.isEnabled() ? privacy.maskStudent(student) : student;
  }

  function updatePrivacyButton() {
    const button = document.getElementById('btnPrivacy');
    const enabled = privacy.isEnabled();
    button.classList.toggle('is-active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.querySelector('i').className = enabled ? 'ph-light ph-eye' : 'ph-light ph-eye-slash';
    button.querySelector('span').textContent = enabled ? '개인정보 원문 보기' : '개인정보 가리기';
  }

  function rerenderPersonalData() {
    renderDesktopTable(latestRanking, currentEvents);
    renderMobileList(latestRanking);
    window.closeModal('studentDetailModal');
    document.getElementById('studentDetailTitle').textContent = '학생 상세';
    document.getElementById('studentDetailBody').replaceChildren();
  }

  function setPrivacyMessage(message, kind) {
    const element = document.getElementById('privacyPasswordMessage');
    element.textContent = message || '';
    element.className = 'privacy-message' + (kind ? ' ' + kind : '');
  }

  function openPrivacyModal() {
    const enabled = privacy.isEnabled();
    document.getElementById('privacyPasswordTitle').textContent = enabled
      ? '개인정보 원문 보기'
      : '개인정보 가리기';
    document.getElementById('privacyPasswordHelp').textContent = enabled
      ? '학생 정보를 원문으로 표시하려면 현재 로그인한 원장님의 비밀번호를 입력해 주세요.'
      : '이름·지점·고교를 가림 처리하려면 현재 로그인한 원장님의 비밀번호를 입력해 주세요.';
    document.getElementById('privacyPassword').value = '';
    setPrivacyMessage('', '');
    window.openModal('privacyPasswordModal');
    setTimeout(() => document.getElementById('privacyPassword').focus(), 50);
  }

  async function submitPrivacyPassword(event) {
    event.preventDefault();
    const submit = document.getElementById('privacyPasswordSubmit');
    const password = document.getElementById('privacyPassword').value;
    const counselor = window.getCounselorFromToken();
    submit.disabled = true;
    submit.querySelector('span').textContent = '확인 중…';
    setPrivacyMessage('비밀번호를 확인하고 있습니다.', 'info');

    try {
      await privacy.verifyOwnerPassword({
        apiBase: window.API_BASE,
        fetchFn: window.fetch.bind(window),
        password,
        userid: counselor.userid,
        year: window.SUSI_YEAR || '27',
      });
      const enabled = privacy.setEnabled(!privacy.isEnabled());
      updatePrivacyButton();
      rerenderPersonalData();
      window.closeModal('privacyPasswordModal');
      window.showToast(
        enabled ? '개인정보 가리기가 활성화되었습니다.' : '개인정보 원문 보기가 활성화되었습니다.',
        'success'
      );
    } catch (error) {
      setPrivacyMessage(error.message, 'error');
    } finally {
      submit.disabled = false;
      submit.querySelector('span').textContent = '확인';
    }
  }

  function initPrivacyControls() {
    document.getElementById('btnPrivacy').addEventListener('click', openPrivacyModal);
    document.getElementById('privacyPasswordForm').addEventListener('submit', submitPrivacyPassword);
    updatePrivacyButton();
  }

  async function init() {
    const yearChip = document.getElementById('yearChip');
    if (yearChip) yearChip.textContent = (window.SUSI_YEAR || '27') + '학년도';

    collegeCombo = window.createCombobox(document.getElementById('comboCollege'), {
      placeholder: '대학 선택', searchable: true, options: [], onChange: onCollegeChange,
    });
    majorCombo = window.createCombobox(document.getElementById('comboMajor'), {
      placeholder: '학과 선택', searchable: true, options: [], disabled: true, onChange: onMajorChange,
    });
    typeCombo = window.createCombobox(document.getElementById('comboType'), {
      placeholder: '전형 선택', searchable: false, options: [], disabled: true, onChange: searchRanking,
    });

    document.getElementById('btnExcel').addEventListener('click', () => window.downloadLiveExcel(colleges));
    document.getElementById('btnScoreTable').addEventListener('click', showScoreTable);
    initPrivacyControls();

    try {
      const [profileRes, collegeRes, practicalRes] = await Promise.all([
        window.api('/profile').catch(() => ({})),
        window.api('_college_list').catch(() => ({})),
        window.api('_get_practical_colleges').catch(() => []),
      ]);
      if (profileRes && profileRes.success && profileRes.user) loggedInUserBranch = profileRes.user.branch || '';
      if (Array.isArray(practicalRes)) {
        practicalRes.forEach(item => {
          scoreTableMap[`${item.대학명}_${item.학과명}_${item.전형명}`] = item.실기ID;
        });
      }
      if (collegeRes && collegeRes.success) {
        colleges = collegeRes.colleges || [];
        groupColleges();
        populateCollegeCombo();
      }
    } catch (error) {
      console.error('[live] init', error);
      window.showToast('화면을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }
  }

  function groupColleges() {
    collegeGroups = {};
    colleges.forEach(college => {
      if (!collegeGroups[college.대학명]) collegeGroups[college.대학명] = {};
      if (!collegeGroups[college.대학명][college.학과명]) collegeGroups[college.대학명][college.학과명] = [];
      collegeGroups[college.대학명][college.학과명].push(college.전형명);
    });
  }

  function populateCollegeCombo() {
    const options = Object.keys(collegeGroups).sort().map(name => ({ value: name, label: name }));
    collegeCombo.setOptions(options);
  }

  function onCollegeChange(value) {
    if (!value) {
      majorCombo.setOptions([]); majorCombo.disable();
      typeCombo.setOptions([]); typeCombo.disable();
      clearResult();
      return;
    }
    const majors = Object.keys(collegeGroups[value] || {}).sort();
    majorCombo.setOptions(majors.map(major => ({ value: major, label: major })));
    majorCombo.enable(); majorCombo.setValue('');
    typeCombo.setOptions([]); typeCombo.disable();
    clearResult();
  }

  function onMajorChange(value) {
    const college = collegeCombo.value;
    if (!college || !value) {
      typeCombo.setOptions([]); typeCombo.disable();
      clearResult();
      return;
    }
    const types = (collegeGroups[college][value] || []).slice().sort();
    typeCombo.setOptions(types.map(type => ({ value: type, label: type })));
    typeCombo.enable(); typeCombo.setValue('');
    clearResult();
  }

  function clearResult() {
    latestRanking = [];
    currentEvents = [];
    document.getElementById('resultTitle').textContent = '대학/학과/전형을 선택해주세요.';
    document.getElementById('btnScoreTable').hidden = true;
    document.getElementById('liveIndicator').hidden = true;
    renderDesktopTable([], []);
    renderMobileList([]);
  }

  async function searchRanking() {
    const college = collegeCombo.value;
    const major = majorCombo.value;
    const type = typeCombo.value;
    const title = document.getElementById('resultTitle');
    const scoreButton = document.getElementById('btnScoreTable');
    const indicator = document.getElementById('liveIndicator');
    if (!college || !major || !type) return clearResult();

    scoreButton.hidden = !scoreTableMap[`${college}_${major}_${type}`];
    const currentCollege = colleges.find(item => item.대학명 === college && item.학과명 === major && item.전형명 === type);
    if (!currentCollege) return;
    title.innerHTML = '<i class="ph-light ph-circle-notch"></i> 전체 지점 데이터 조회 중...';
    indicator.hidden = true;

    try {
      const collegeId = encodeURIComponent(currentCollege.대학ID);
      const [data, detailData] = await Promise.all([
        window.api(`/realtime-rank-by-college?college_id=${collegeId}`),
        window.api(`/university-details?college_id=${collegeId}`).catch(() => null),
      ]);
      if (!data || !data.success) throw new Error('invalid_response');
      latestRanking = data.ranking || [];
      currentEvents = data.events || [];
      const competition = window.SusiCompetitionRate.render(
        detailData && detailData.success ? detailData.details : currentCollege,
        window.SUSI_YEAR || '27',
        { compact: true }
      );
      title.innerHTML = `<strong>${esc(college)} ${esc(major)} (${esc(type)})</strong> <span class="count-chip">실시간 순위 (총 ${latestRanking.length}명)</span> ${competition}`;
      indicator.hidden = false;
      rerenderPersonalData();
    } catch (error) {
      console.error('[live] searchRanking', error);
      window.showToast('순위를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
      latestRanking = [];
      currentEvents = [];
      rerenderPersonalData();
    }
  }

  function renderDesktopTable(rankingData, events) {
    const table = document.getElementById('resultTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    let firstHeader = '<tr><th rowspan="2">순위</th><th rowspan="2">지점</th><th rowspan="2">이름</th><th rowspan="2">고교</th><th rowspan="2">성별</th>';
    events.forEach(event => { firstHeader += `<th colspan="2">${esc(event)}</th>`; });
    firstHeader += '<th rowspan="2">내신등급</th><th rowspan="2">내신점수</th><th rowspan="2">실기총점</th><th rowspan="2">합산점수</th><th rowspan="2">최초합</th><th rowspan="2">최종합</th></tr>';
    let secondHeader = '<tr>';
    events.forEach(() => { secondHeader += '<th class="col-record">기록</th><th class="col-score">점수</th>'; });
    thead.innerHTML = firstHeader + secondHeader + '</tr>';

    const totalColumns = 5 + events.length * 2 + 6;
    if (!rankingData.length) {
      tbody.innerHTML = `<tr><td class="empty-cell" colspan="${totalColumns}">해당 전형에 수합된 학생이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = rankingData.map(rawStudent => {
      const student = visibleStudent(rawStudent);
      const rowClass = !privacy.isEnabled() && rawStudent.지점명 === loggedInUserBranch ? 'my-branch-row' : '';
      const rankClass = rawStudent.순위 <= 3 ? 'rank-top3' : '';
      let row = `<tr class="${rowClass}"><td class="${rankClass}">${esc(String(rawStudent.순위))}</td><td>${esc(student.지점명 || '')}</td><td>${esc(student.이름 || '')}</td><td>${esc(student.학교명 || '-')}</td><td>${esc(rawStudent.성별 || '')}</td>`;
      for (let index = 1; index <= events.length; index += 1) {
        row += `<td class="col-record">${esc(String(rawStudent['기록' + index] || '-'))}</td><td class="col-score">${esc(String(rawStudent['점수' + index] || '-'))}</td>`;
      }
      row += `<td>${gradeBadge(rawStudent.내신등급)}</td><td>${esc(String(rawStudent.내신점수 || '-'))}</td><td>${rawStudent.실기총점 != null ? fmtNum(rawStudent.실기총점, 2) : '-'}</td><td><strong>${rawStudent.합산점수 != null ? fmtNum(rawStudent.합산점수, 2) : '-'}</strong></td><td>${esc(rawStudent.최초합여부 || '-')}</td><td>${esc(rawStudent.최종합여부 || '-')}</td></tr>`;
      return row;
    }).join('');
  }

  function renderMobileList(rankingData) {
    const container = document.getElementById('studentListContainer');
    studentDataMap.clear();
    if (!rankingData.length) {
      container.innerHTML = '<div class="live-empty">해당 전형에 수합된 학생이 없습니다.</div>';
      return;
    }
    container.innerHTML = rankingData.map(rawStudent => {
      studentDataMap.set(String(rawStudent.학생ID), rawStudent);
      const student = visibleStudent(rawStudent);
      const mine = !privacy.isEnabled() && rawStudent.지점명 === loggedInUserBranch;
      return `<div class="student-card ${mine ? 'my-branch-item' : ''}" data-student-id="${esc(String(rawStudent.학생ID))}"><div class="rank">${esc(String(rawStudent.순위))}</div><div class="student-info"><div class="student-main"><span>${esc(student.이름 || '')} (${esc(rawStudent.성별 || '')})</span><span class="student-branch">${esc(student.지점명 || '')}</span></div><div class="student-school">${esc(student.학교명 || '-')}</div><div class="student-scores"><span>${gradeBadge(rawStudent.내신등급)}</span><span>내신: ${esc(String(rawStudent.내신점수 || '-'))}</span><span>실기: ${rawStudent.실기총점 != null ? fmtNum(rawStudent.실기총점, 2) : '-'}</span><span>합산: ${rawStudent.합산점수 != null ? fmtNum(rawStudent.합산점수, 2) : '-'}</span></div></div><i class="ph-light ph-caret-right chev"></i></div>`;
    }).join('');
    container.querySelectorAll('.student-card').forEach(element => {
      element.addEventListener('click', () => openDetailModal(element.dataset.studentId));
    });
  }

  function openDetailModal(studentId) {
    const rawStudent = studentDataMap.get(String(studentId));
    if (!rawStudent) return;
    const student = visibleStudent(rawStudent);
    let html = `<table class="detail-table"><tr><th>지점</th><td>${esc(student.지점명 || '-')}</td></tr><tr><th>고교</th><td>${esc(student.학교명 || '-')}</td></tr></table>`;
    if (currentEvents.length) {
      html += '<table class="detail-table"><thead><tr><th>종목</th><th>기록</th><th>점수</th></tr></thead><tbody>';
      currentEvents.forEach((event, index) => {
        html += `<tr><td>${esc(event)}</td><td>${esc(String(rawStudent['기록' + (index + 1)] || '-'))}</td><td>${esc(String(rawStudent['점수' + (index + 1)] || '-'))}</td></tr>`;
      });
      html += '</tbody></table>';
    }
    html += `<table class="detail-table"><tr><th>내신등급</th><td>${gradeBadge(rawStudent.내신등급)}</td></tr><tr><th>내신점수</th><td>${esc(String(rawStudent.내신점수 || '-'))}</td></tr><tr><th>실기 총점</th><td class="total-score">${rawStudent.실기총점 != null ? fmtNum(rawStudent.실기총점, 2) : '-'} 점</td></tr><tr><th>합산 총점</th><td class="total-score">${rawStudent.합산점수 != null ? fmtNum(rawStudent.합산점수, 2) : '-'} 점</td></tr></table><div class="detail-section-title">합격 현황</div><table class="detail-table"><thead><tr><th>최초 합격</th><th>최종 합격</th></tr></thead><tbody><tr><td>${esc(rawStudent.최초합여부 || '-')}</td><td>${esc(rawStudent.최종합여부 || '-')}</td></tr></tbody></table>`;
    document.getElementById('studentDetailTitle').textContent = `${student.이름 || '학생'} 상세 정보`;
    document.getElementById('studentDetailBody').innerHTML = html;
    window.openModal('studentDetailModal');
  }

  async function showScoreTable() {
    const college = collegeCombo.value;
    const major = majorCombo.value;
    const type = typeCombo.value;
    const practicalId = scoreTableMap[`${college}_${major}_${type}`];
    if (!practicalId) return window.showToast('해당 학교의 배점표가 없습니다.', 'info');
    const container = document.getElementById('scoreTableContainer');
    document.getElementById('scoreTableTitle').textContent = `${college} ${major} 배점표`;
    container.innerHTML = '<div class="live-empty">배점표를 불러오는 중입니다.</div>';
    window.openModal('scoreTableModal');
    try {
      const data = await window.api(`_get_score_table?실기ID=${encodeURIComponent(practicalId)}`);
      if (!data || !data.success || !data.events || !Object.keys(data.events).length) {
        container.innerHTML = '<div class="live-empty">배점표 데이터가 없습니다.</div>';
        return;
      }
      let html = '<div class="score-grid">';
      Object.entries(data.events).forEach(([event, eventData]) => {
        const scoreMap = { 남: new Map(), 여: new Map() };
        const scores = new Set();
        (eventData.남 || []).forEach(item => { scoreMap.남.set(item.배점, item.기록); scores.add(item.배점); });
        (eventData.여 || []).forEach(item => { scoreMap.여.set(item.배점, item.기록); scores.add(item.배점); });
        html += `<div class="score-cell"><table><thead><tr><th colspan="3" class="evt-header">${esc(event)}</th></tr><tr><th>배점</th><th>남</th><th>여</th></tr></thead><tbody>`;
        Array.from(scores).sort((a, b) => parseFloat(b) - parseFloat(a)).forEach(score => {
          html += `<tr><td class="score-value">${esc(String(score))}</td><td>${esc(String(scoreMap.남.get(score) || '-'))}</td><td>${esc(String(scoreMap.여.get(score) || '-'))}</td></tr>`;
        });
        html += '</tbody></table></div>';
      });
      container.innerHTML = html + '</div>';
    } catch (error) {
      console.error('[live] showScoreTable', error);
      container.innerHTML = '<div class="live-error">배점표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
