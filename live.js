/* ============================================================
 * live.new.js — 실시간 현황 (live)
 * 원본 live.html 의 기능을 100% 보존:
 *   - 대학/학과/전형 필터 (combobox 3개)
 *   - 전체 교육원 순위 조회 (/realtime-rank-by-college)
 *   - 내 지점 행 하이라이트
 *   - 배점표 모달 (_get_score_table)
 *   - 전체 수합 엑셀 다운로드 (ExcelJS 3-sheet: 목차 / 대학별 / 합격자)
 *   - 모바일 카드 + 학생 상세 모달
 * 원본은 setInterval/setTimeout 기반 폴링 없음 → 동일하게 이벤트 기반 유지.
 * API: /profile, _college_list, _get_practical_colleges,
 *      /realtime-rank-by-college (2회: 단건 조회 + 엑셀 전체 수집), _get_score_table
 * ============================================================ */

(function () {
  'use strict';

  const esc = window.escapeHtml;

  // ───────── 상태 ─────────
  let colleges = [];
  let collegeGroups = {};
  let loggedInUserBranch = '';
  let studentDataMap = new Map();
  let currentEvents = [];
  let scoreTableMap = {}; // "대학명_학과명_전형명" -> 실기ID
  let collegeCombo = null;
  let majorCombo = null;
  let typeCombo = null;

  // ───────── 유틸 ─────────
  function gradeBadge(grade) {
    if (grade == null || grade === '') return '<span class="grade-badge grade-none">-</span>';
    const g = Math.round(parseFloat(grade));
    const cls = (g >= 1 && g <= 9) ? 'grade-' + g : 'grade-none';
    return `<span class="grade-badge ${cls}">${esc(String(grade))}</span>`;
  }

  function fmtNum(v, digits) {
    if (v == null) return '-';
    const n = parseFloat(v);
    if (isNaN(n)) return '-';
    return digits != null ? n.toFixed(digits) : String(n);
  }

  // ───────── 초기 로드 ─────────
  async function init() {
    // 연도 칩
    const yearChip = document.getElementById('yearChip');
    if (yearChip) yearChip.textContent = (window.SUSI_YEAR || '26') + '학년도';

    // combobox 초기화 (빈 상태)
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

    // 버튼 바인딩
    document.getElementById('btnExcel').addEventListener('click', downloadAllExcel);
    document.getElementById('btnScoreTable').addEventListener('click', showScoreTable);
    /* [data-action="modal-close"] 는 공용 modal.js v2 가 전역 delegation 처리 */

    try {
      const [profileRes, collegeRes, practicalRes] = await Promise.all([
        window.api('/profile').catch(() => ({})),
        window.api('_college_list').catch(() => ({})),
        window.api('_get_practical_colleges').catch(() => []),
      ]);
      if (profileRes && profileRes.success && profileRes.user) {
        loggedInUserBranch = profileRes.user.branch || '';
      }
      if (Array.isArray(practicalRes)) {
        practicalRes.forEach(p => {
          scoreTableMap[`${p.대학명}_${p.학과명}_${p.전형명}`] = p.실기ID;
        });
      }
      if (collegeRes && collegeRes.success) {
        colleges = collegeRes.colleges || [];
        groupColleges();
        populateCollegeCombo();
      }
    } catch (err) {
      console.error('[live] init', err);
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
      clearResult();
      return;
    }
    const majors = Object.keys(collegeGroups[v] || {}).sort();
    majorCombo.setOptions(majors.map(m => ({ value: m, label: m })));
    majorCombo.enable();
    majorCombo.setValue('');
    typeCombo.setOptions([]); typeCombo.disable();
    clearResult();
  }

  function onMajorChange(v) {
    const c = collegeCombo.value;
    if (!c || !v) {
      typeCombo.setOptions([]); typeCombo.disable();
      clearResult();
      return;
    }
    const types = (collegeGroups[c][v] || []).slice().sort();
    typeCombo.setOptions(types.map(t => ({ value: t, label: t })));
    typeCombo.enable();
    typeCombo.setValue('');
    clearResult();
  }

  function onTypeChange() {
    searchRanking();
  }

  function clearResult() {
    const title = document.getElementById('resultTitle');
    title.textContent = '대학/학과/전형을 선택해주세요.';
    document.getElementById('btnScoreTable').hidden = true;
    document.getElementById('liveIndicator').hidden = true;
    renderDesktopTable([], []);
    renderMobileList([]);
  }

  // ───────── 순위 조회 ─────────
  async function searchRanking() {
    const c = collegeCombo.value;
    const m = majorCombo.value;
    const t = typeCombo.value;
    const title = document.getElementById('resultTitle');
    const scoreBtn = document.getElementById('btnScoreTable');
    const liveInd = document.getElementById('liveIndicator');

    if (!c || !m || !t) {
      clearResult();
      return;
    }

    const scoreKey = `${c}_${m}_${t}`;
    scoreBtn.hidden = !scoreTableMap[scoreKey];

    const currentCollege = colleges.find(col => col.대학명 === c && col.학과명 === m && col.전형명 === t);
    if (!currentCollege) return;

    title.innerHTML = `<i class="ph-light ph-circle-notch"></i> 전체 지점 데이터 조회 중...`;
    liveInd.hidden = true;

    try {
      const data = await window.api(`/realtime-rank-by-college?college_id=${encodeURIComponent(currentCollege.대학ID)}`);
      if (data && data.success) {
        currentEvents = data.events || [];
        title.innerHTML = `<strong>${esc(c)} ${esc(m)} (${esc(t)})</strong> <span class="count-chip">실시간 순위 (총 ${data.ranking.length}명)</span>`;
        liveInd.hidden = false;
        renderDesktopTable(data.ranking, data.events);
        renderMobileList(data.ranking);
      } else {
        if (window.showToast) window.showToast('데이터 조회 중 문제가 발생했습니다.', 'error');
        renderDesktopTable([], []); renderMobileList([]);
      }
    } catch (err) {
      console.error('[live] searchRanking', err);
      if (window.showToast) window.showToast('조회 실패: ' + (err.message || ''), 'error');
      renderDesktopTable([], []); renderMobileList([]);
    }
  }

  // ───────── 데스크탑 테이블 ─────────
  function renderDesktopTable(rankingData, events) {
    events = events || [];
    const table = document.getElementById('resultTable');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');

    let h1 = `<tr><th rowspan="2">순위</th><th rowspan="2">지점</th><th rowspan="2">이름</th><th rowspan="2">성별</th>`;
    events.forEach(ev => { h1 += `<th colspan="2">${esc(ev)}</th>`; });
    h1 += `<th rowspan="2">내신등급</th><th rowspan="2">내신점수</th><th rowspan="2">실기총점</th><th rowspan="2">합산점수</th><th rowspan="2">최초합</th><th rowspan="2">최종합</th></tr>`;

    let h2 = `<tr>`;
    events.forEach(() => { h2 += `<th class="col-record">기록</th><th class="col-score">점수</th>`; });
    h2 += `</tr>`;
    thead.innerHTML = h1 + h2;

    const totalCols = 4 + events.length * 2 + 6;
    if (!rankingData || rankingData.length === 0) {
      tbody.innerHTML = `<tr><td class="empty-cell" colspan="${totalCols}">해당 전형에 수합된 학생이 없습니다.</td></tr>`;
      return;
    }

    tbody.innerHTML = rankingData.map(stu => {
      const isMine = stu.지점명 === loggedInUserBranch;
      const rowCls = isMine ? 'my-branch-row' : '';
      const rankCls = stu.순위 <= 3 ? 'rank-top3' : '';
      let row = `<tr class="${rowCls}"><td class="${rankCls}">${esc(String(stu.순위))}</td><td>${esc(stu.지점명 || '')}</td><td>${esc(stu.이름 || '')}</td><td>${esc(stu.성별 || '')}</td>`;
      for (let i = 1; i <= events.length; i++) {
        row += `<td class="col-record">${esc(String(stu['기록' + i] || '-'))}</td><td class="col-score">${esc(String(stu['점수' + i] || '-'))}</td>`;
      }
      row += `
        <td>${gradeBadge(stu.내신등급)}</td>
        <td>${esc(String(stu.내신점수 || '-'))}</td>
        <td>${stu.실기총점 != null ? fmtNum(stu.실기총점, 2) : '-'}</td>
        <td><strong>${stu.합산점수 != null ? fmtNum(stu.합산점수, 2) : '-'}</strong></td>
        <td>${esc(stu.최초합여부 || '-')}</td>
        <td>${esc(stu.최종합여부 || '-')}</td>
      </tr>`;
      return row;
    }).join('');
  }

  // ───────── 모바일 카드 ─────────
  function renderMobileList(rankingData) {
    const container = document.getElementById('studentListContainer');
    studentDataMap.clear();
    if (!rankingData || rankingData.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3);">해당 전형에 수합된 학생이 없습니다.</div>';
      return;
    }
    container.innerHTML = rankingData.map(stu => {
      studentDataMap.set(stu.학생ID, stu);
      const isMine = stu.지점명 === loggedInUserBranch;
      return `
        <div class="student-card ${isMine ? 'my-branch-item' : ''}" data-student-id="${esc(String(stu.학생ID))}">
          <div class="rank">${esc(String(stu.순위))}</div>
          <div class="student-info">
            <div class="student-main">
              <span>${esc(stu.이름 || '')} (${esc(stu.성별 || '')})</span>
              <span class="student-branch">${esc(stu.지점명 || '')}</span>
            </div>
            <div class="student-scores">
              <span>${gradeBadge(stu.내신등급)}</span>
              <span>내신: ${esc(String(stu.내신점수 || '-'))}</span>
              <span>실기: ${stu.실기총점 != null ? fmtNum(stu.실기총점, 2) : '-'}</span>
              <span>합산: ${stu.합산점수 != null ? fmtNum(stu.합산점수, 2) : '-'}</span>
            </div>
          </div>
          <i class="ph-light ph-caret-right chev"></i>
        </div>
      `;
    }).join('');
    container.querySelectorAll('.student-card').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.studentId;
        openDetailModal(Number(id));
      });
    });
  }

  // ───────── 학생 상세 모달 ─────────
  function openDetailModal(studentId) {
    const stu = studentDataMap.get(studentId);
    if (!stu) return;

    let html = '';
    if (currentEvents.length > 0) {
      html += `<table class="detail-table"><thead><tr><th>종목</th><th>기록</th><th>점수</th></tr></thead><tbody>`;
      for (let i = 0; i < currentEvents.length; i++) {
        html += `<tr><td>${esc(currentEvents[i])}</td><td>${esc(String(stu['기록' + (i + 1)] || '-'))}</td><td>${esc(String(stu['점수' + (i + 1)] || '-'))}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `<table class="detail-table">
      <tr><th>내신등급</th><td>${gradeBadge(stu.내신등급)}</td></tr>
      <tr><th>내신점수</th><td>${esc(String(stu.내신점수 || '-'))}</td></tr>
      <tr><th>실기 총점</th><td class="total-score">${stu.실기총점 != null ? fmtNum(stu.실기총점, 2) : '-'} 점</td></tr>
      <tr><th>합산 총점</th><td class="total-score">${stu.합산점수 != null ? fmtNum(stu.합산점수, 2) : '-'} 점</td></tr>
    </table>`;
    html += `<div class="detail-section-title">합격 현황</div>
      <table class="detail-table">
        <thead><tr><th>최초 합격</th><th>최종 합격</th></tr></thead>
        <tbody><tr>
          <td>${esc(stu.최초합여부 || '-')}</td>
          <td>${esc(stu.최종합여부 || '-')}</td>
        </tr></tbody>
      </table>`;

    document.getElementById('studentDetailTitle').textContent = `${stu.이름} 학생 상세 정보`;
    document.getElementById('studentDetailBody').innerHTML = html;
    window.openModal('studentDetailModal');
  }

  // ───────── 배점표 모달 ─────────
  async function showScoreTable() {
    const c = collegeCombo.value, m = majorCombo.value, t = typeCombo.value;
    const practicalId = scoreTableMap[`${c}_${m}_${t}`];
    if (!practicalId) {
      if (window.showToast) window.showToast('해당 학교의 배점표가 없습니다.', 'info');
      return;
    }
    const container = document.getElementById('scoreTableContainer');
    document.getElementById('scoreTableTitle').textContent = `${c} ${m} 배점표`;
    container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-3);">배점표 로딩 중...</div>';
    window.openModal('scoreTableModal');

    try {
      const data = await window.api(`_get_score_table?실기ID=${encodeURIComponent(practicalId)}`);
      if (!data || !data.success || !data.events || Object.keys(data.events).length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-3);">배점표 데이터가 없습니다.</div>';
        return;
      }
      let html = '<div class="score-grid">';
      for (const [ev, evData] of Object.entries(data.events)) {
        const scoreMap = { 남: new Map(), 여: new Map() };
        const scores = new Set();
        (evData.남 || []).forEach(item => { scoreMap.남.set(item.배점, item.기록); scores.add(item.배점); });
        (evData.여 || []).forEach(item => { scoreMap.여.set(item.배점, item.기록); scores.add(item.배점); });
        const sorted = Array.from(scores).sort((a, b) => parseFloat(b) - parseFloat(a));
        html += `<div class="score-cell"><table>
          <thead><tr><th colspan="3" class="evt-header">${esc(ev)}</th></tr>
          <tr><th>배점</th><th>남</th><th>여</th></tr></thead><tbody>`;
        sorted.forEach(sc => {
          html += `<tr><td style="font-weight:600;">${esc(String(sc))}</td><td>${esc(String(scoreMap.남.get(sc) || '-'))}</td><td>${esc(String(scoreMap.여.get(sc) || '-'))}</td></tr>`;
        });
        html += `</tbody></table></div>`;
      }
      html += '</div>';
      container.innerHTML = html;
    } catch (err) {
      console.error('[live] showScoreTable', err);
      container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--danger);">배점표를 불러오는 중 오류가 발생했습니다.</div>';
    }
  }

  // ───────── 전체 수합 엑셀 다운로드 ─────────
  async function downloadAllExcel() {
    const pText = document.getElementById('excelProgressText');
    const pBar = document.getElementById('excelProgressBar');
    pText.textContent = '준비 중...';
    pBar.style.width = '0%';
    window.openModal('excelProgressModal');

    try {
      const allData = [];
      for (let i = 0; i < colleges.length; i++) {
        const col = colleges[i];
        const pct = Math.round(((i + 1) / colleges.length) * 100);
        pText.textContent = `${i + 1}/${colleges.length} — ${col.대학명} ${col.학과명}`;
        pBar.style.width = pct + '%';
        try {
          const data = await window.api(`/realtime-rank-by-college?college_id=${encodeURIComponent(col.대학ID)}`);
          if (data && data.success && data.ranking && data.ranking.length > 0) {
            allData.push({ 대학명: col.대학명, 학과명: col.학과명, 전형명: col.전형명, ranking: data.ranking, events: data.events || [] });
          }
        } catch (e) {
          console.error('Fetch fail:', col.대학명, e);
        }
      }

      if (allData.length === 0) {
        window.closeModal('excelProgressModal');
        if (window.showToast) window.showToast('수합된 데이터가 없습니다.', 'info');
        return;
      }

      allData.sort((a, b) => a.대학명.localeCompare(b.대학명, 'ko') || a.학과명.localeCompare(b.학과명, 'ko'));

      const wb = new ExcelJS.Workbook();
      wb.creator = 'MAX 수시 시스템';
      wb.created = new Date();

      const C = {
        primary: 'FF0F766E', white: 'FFFFFFFF', dark: 'FF1C1917',
        gray: 'FF57534E', lightBg: 'FFF5F5F4', border: 'FFE7E5E4',
        green: 'FF047857',
      };
      const border = {
        top: { style: 'thin', color: { argb: C.border } },
        left: { style: 'thin', color: { argb: C.border } },
        bottom: { style: 'thin', color: { argb: C.border } },
        right: { style: 'thin', color: { argb: C.border } },
      };

      const byUniv = {};
      allData.forEach(d => {
        if (!byUniv[d.대학명]) byUniv[d.대학명] = [];
        byUniv[d.대학명].push(d);
      });
      const univNames = Object.keys(byUniv).sort((a, b) => a.localeCompare(b, 'ko'));
      const sanitize = (name) => name.replace(/[[\]:*?/\\]/g, '').substring(0, 31);
      const SUSI_YEAR = window.SUSI_YEAR || '26';

      // 목차
      const tocWs = wb.addWorksheet('목차', { properties: { defaultRowHeight: 24 } });
      const tocTitle = tocWs.addRow([SUSI_YEAR + '수시 전체 수합결과 — 목차']);
      tocTitle.height = 42;
      tocWs.mergeCells(tocTitle.number, 1, tocTitle.number, 5);
      tocTitle.getCell(1).font = { name: 'Pretendard', size: 18, bold: true, color: { argb: C.primary } };
      tocTitle.getCell(1).alignment = { vertical: 'middle' };

      const tocDate = tocWs.addRow([`다운로드: ${new Date().toLocaleString('ko-KR')}`]);
      tocWs.mergeCells(tocDate.number, 1, tocDate.number, 5);
      tocDate.getCell(1).font = { name: 'Pretendard', size: 10, color: { argb: C.gray } };

      const totalStudents = allData.reduce((s, d) => s + d.ranking.length, 0);
      const tocSummary = tocWs.addRow([`총 ${univNames.length}개 대학  |  ${allData.length}개 학과/전형  |  ${totalStudents}명`]);
      tocWs.mergeCells(tocSummary.number, 1, tocSummary.number, 5);
      tocSummary.getCell(1).font = { name: 'Pretendard', size: 11, bold: true };

      tocWs.addRow([]);

      const passLinkRow = tocWs.addRow(['']);
      tocWs.mergeCells(passLinkRow.number, 1, passLinkRow.number, 5);
      const passLink = passLinkRow.getCell(1);
      passLink.value = { text: '합격자 명단 시트로 이동 →', hyperlink: "#'합격자 명단'!A1" };
      passLink.font = { name: 'Pretendard', size: 13, bold: true, color: { argb: C.white }, underline: true };
      passLink.alignment = { horizontal: 'center', vertical: 'middle' };
      passLinkRow.height = 38;
      passLink.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } };
      passLink.border = border;

      tocWs.addRow([]);

      const tocHeader = tocWs.addRow(['No.', '대학명', '학과 수', '총 인원', '바로가기']);
      tocHeader.height = 30;
      tocHeader.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
        cell.font = { name: 'Pretendard', size: 11, bold: true, color: { argb: C.white } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = border;
      });

      univNames.forEach((uName, idx) => {
        const sections = byUniv[uName];
        const stuCount = sections.reduce((s, d) => s + d.ranking.length, 0);
        const sheetName = sanitize(uName);
        const tocRow = tocWs.addRow([idx + 1, uName, sections.length, stuCount, uName]);
        const isEven = idx % 2 === 0;
        tocRow.eachCell((cell) => {
          cell.font = { name: 'Pretendard', size: 10 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = border;
          if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lightBg } };
        });
        const linkCell = tocRow.getCell(5);
        linkCell.value = { text: '→ 이동', hyperlink: `#'${sheetName}'!A1` };
        linkCell.font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.primary }, underline: true };
      });

      tocWs.getColumn(1).width = 6;
      tocWs.getColumn(2).width = 25;
      tocWs.getColumn(3).width = 10;
      tocWs.getColumn(4).width = 10;
      tocWs.getColumn(5).width = 12;

      // 대학별 시트
      for (const uName of univNames) {
        const sections = byUniv[uName];
        const sheetName = sanitize(uName);
        const ws = wb.addWorksheet(sheetName, { properties: { defaultRowHeight: 22 } });

        const r1 = ws.addRow([uName]);
        r1.height = 38;
        ws.mergeCells(r1.number, 1, r1.number, 13);
        r1.getCell(1).font = { name: 'Pretendard', size: 16, bold: true, color: { argb: C.primary } };
        r1.getCell(1).alignment = { vertical: 'middle' };

        const backRow = ws.addRow(['← 목차로 돌아가기']);
        ws.mergeCells(backRow.number, 1, backRow.number, 4);
        backRow.getCell(1).value = { text: '← 목차로 돌아가기', hyperlink: "#'목차'!A1" };
        backRow.getCell(1).font = { name: 'Pretendard', size: 10, color: { argb: C.primary }, underline: true };

        ws.addRow([]);

        let maxCols = 0;
        for (const section of sections) {
          const evtCount = section.events.length;
          const totalCols = 4 + evtCount * 2 + 6;
          if (totalCols > maxCols) maxCols = totalCols;

          const secRow = ws.addRow([`${section.학과명}  ▸  ${section.전형명}    (${section.ranking.length}명)`]);
          secRow.height = 32;
          ws.mergeCells(secRow.number, 1, secRow.number, totalCols);
          const secCell = secRow.getCell(1);
          secCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
          secCell.font = { name: 'Pretendard', size: 12, bold: true, color: { argb: C.white } };
          secCell.alignment = { vertical: 'middle', horizontal: 'left' };

          const headers = ['순위', '지점', '이름', '성별'];
          section.events.forEach(evt => { headers.push(evt + ' 기록', evt + ' 점수'); });
          headers.push('내신등급', '내신점수', '실기총점', '합산점수', '최초합', '최종합');

          const hRow = ws.addRow(headers);
          hRow.height = 28;
          hRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.primary } };
            cell.font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.white } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = border;
          });

          const totalColIdx = headers.indexOf('합산점수') + 1;
          const firstPassIdx = headers.indexOf('최초합') + 1;
          const finalPassIdx = headers.indexOf('최종합') + 1;

          section.ranking.forEach((stu, idx) => {
            const row = [stu.순위, stu.지점명, stu.이름, stu.성별];
            for (let i = 1; i <= evtCount; i++) {
              row.push(stu['기록' + i] || '-');
              row.push(stu['점수' + i] != null ? Number(stu['점수' + i]) : '-');
            }
            row.push(
              stu.내신등급 || '-',
              stu.내신점수 != null ? Number(stu.내신점수) : '-',
              stu.실기총점 != null ? Number(parseFloat(stu.실기총점).toFixed(2)) : '-',
              stu.합산점수 != null ? Number(parseFloat(stu.합산점수).toFixed(2)) : '-',
              stu.최초합여부 || '-',
              stu.최종합여부 || '-'
            );
            const dRow = ws.addRow(row);
            const isEven = idx % 2 === 0;
            dRow.eachCell((cell) => {
              cell.font = { name: 'Pretendard', size: 10 };
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              cell.border = border;
              if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lightBg } };
            });
            if (totalColIdx > 0) {
              dRow.getCell(totalColIdx).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.primary } };
            }
            if (stu.순위 <= 3) {
              dRow.getCell(1).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.primary } };
            }
            [firstPassIdx, finalPassIdx].forEach(ci => {
              if (ci > 0 && dRow.getCell(ci).value === '합격') {
                dRow.getCell(ci).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.green } };
              }
            });
          });
          ws.addRow([]);
        }

        const widths = [6, 14, 10, 6];
        for (let i = 4; i < maxCols - 6; i++) widths.push(i % 2 === 0 ? 12 : 10);
        widths.push(10, 10, 10, 12, 8, 8);
        widths.forEach((w, i) => { if (ws.columns[i]) ws.columns[i].width = w; });
      }

      // 합격자 명단 시트
      const passWs = wb.addWorksheet('합격자 명단', { properties: { defaultRowHeight: 22 } });
      const passTitle = passWs.addRow(['합격자 명단']);
      passTitle.height = 42;
      passWs.mergeCells(passTitle.number, 1, passTitle.number, 6);
      passTitle.getCell(1).font = { name: 'Pretendard', size: 18, bold: true, color: { argb: C.green } };
      passTitle.getCell(1).alignment = { vertical: 'middle' };

      const passBack = passWs.addRow(['← 목차로 돌아가기']);
      passWs.mergeCells(passBack.number, 1, passBack.number, 4);
      passBack.getCell(1).value = { text: '← 목차로 돌아가기', hyperlink: "#'목차'!A1" };
      passBack.getCell(1).font = { name: 'Pretendard', size: 10, color: { argb: C.primary }, underline: true };

      const passSections = [];
      let totalPassCount = 0;
      for (const section of allData) {
        const passers = section.ranking.filter(s => s.최초합여부 === '합격' || s.최종합여부 === '합격');
        if (passers.length > 0) {
          passSections.push({ 대학명: section.대학명, 학과명: section.학과명, 전형명: section.전형명, passers });
          totalPassCount += passers.length;
        }
      }

      const passSummary = passWs.addRow([`총 ${passSections.length}개 학과/전형  |  합격자 ${totalPassCount}명`]);
      passWs.mergeCells(passSummary.number, 1, passSummary.number, 6);
      passSummary.getCell(1).font = { name: 'Pretendard', size: 11, bold: true };
      passWs.addRow([]);

      if (passSections.length === 0) {
        const noData = passWs.addRow(['합격자 데이터가 없습니다.']);
        passWs.mergeCells(noData.number, 1, noData.number, 6);
        noData.getCell(1).font = { name: 'Pretendard', size: 12, color: { argb: C.gray } };
        noData.getCell(1).alignment = { horizontal: 'center' };
      } else {
        for (const sec of passSections) {
          const secRow = passWs.addRow([`${sec.대학명}  ▸  ${sec.학과명}  ▸  ${sec.전형명}    (${sec.passers.length}명 합격)`]);
          secRow.height = 32;
          passWs.mergeCells(secRow.number, 1, secRow.number, 6);
          secRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dark } };
          secRow.getCell(1).font = { name: 'Pretendard', size: 12, bold: true, color: { argb: C.white } };
          secRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

          const pH = passWs.addRow(['No.', '지점', '이름', '성별', '최초합', '최종합']);
          pH.height = 28;
          pH.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } };
            cell.font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.white } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = border;
          });

          sec.passers.forEach((stu, idx) => {
            const pRow = passWs.addRow([idx + 1, stu.지점명, stu.이름, stu.성별, stu.최초합여부 || '-', stu.최종합여부 || '-']);
            const isEven = idx % 2 === 0;
            pRow.eachCell(cell => {
              cell.font = { name: 'Pretendard', size: 10 };
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              cell.border = border;
              if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.lightBg } };
            });
            [5, 6].forEach(ci => {
              if (pRow.getCell(ci).value === '합격') {
                pRow.getCell(ci).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: C.green } };
              }
            });
          });
          passWs.addRow([]);
        }
      }

      passWs.getColumn(1).width = 6;
      passWs.getColumn(2).width = 14;
      passWs.getColumn(3).width = 10;
      passWs.getColumn(4).width = 6;
      passWs.getColumn(5).width = 10;
      passWs.getColumn(6).width = 10;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${SUSI_YEAR}수시_전체수합결과_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      window.closeModal('excelProgressModal');
      if (window.showToast) {
        window.showToast(`다운로드 완료: ${allData.length}개 학과, ${totalStudents}명`, 'success');
      }
    } catch (err) {
      console.error('Excel error:', err);
      window.closeModal('excelProgressModal');
      if (window.showToast) window.showToast('엑셀 생성 중 오류: ' + (err.message || ''), 'error');
    }
  }

  // ───────── 부트 ─────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
