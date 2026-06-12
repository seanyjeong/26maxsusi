/* ============================================================
 * counsel.new.js — 개인 상담 도메인 로직 (D 하이브리드 레이아웃)
 * 원본 counsel.html 의 기능을 100% 보존 (21 함수 / 14 API).
 * v2: 레이아웃 재설계 — profile strip / summary KPI / row drawer 3탭.
 * 규칙:
 *   - fetch / susicFetch / localStorage.token 직접 호출 금지 → window.api()
 *   - 구 알림 라이브러리 금지 → window.showToast / 로딩 오버레이
 *   - 하드코딩 컬러 금지 (CSS 측 토큰 사용)
 * ============================================================ */

(function () {
  'use strict';

  // ───────── 상수 ─────────
  const MAX_PRACTICAL_EVENTS = 7;
  // jsPDF API 는 RGB 숫자만 받음 (CSS 토큰 불가). 원본 PDF 룩 보존용 고정값.
  const PDF_COLORS = {
    accentLine: [74, 107, 175],
    title: [44, 62, 80],
    cardBorder: [224, 224, 224],
    cardFill: [255, 255, 255],
    bodyText: [127, 140, 141],
    footerText: [149, 165, 166],
  };
  const RISK_LABEL = { stable: '안정', fit: '적정', reach: '소신', risky: '위험', unknown: '—' };

  // ───────── 상태 ─────────
  let students = [];
  let colleges = [];
  let studentMap = {};
  let collegeGroups = {};
  let directorPhone = '';
  let branchName = '';
  let studentCombo = null;
  // drawer 상세 캐시: { [collegeID]: { details?, scoreEvents? } }
  const drawerCache = {};

  // 공용 escapeHtml alias (4곳 중복 제거)
  const esc = window.escapeHtml;

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
  async function loadData() {
    showLoading('데이터 로딩중…');
    try {
      const [profileData, studentJson, collegeJson] = await Promise.all([
        window.api('/profile'),
        window.api('_student_list'),
        window.api('_college_list'),
      ]);

      if (profileData && profileData.success && profileData.user) {
        const user = profileData.user;
        branchName = user.branch || '';
        directorPhone = user.phone || '000-0000-0000';
        const sub = document.getElementById('pageSub');
        if (sub && branchName) {
          sub.textContent = `${branchName} 교육원 — 학생 한 명당 여러 대학 비교·저장·PDF`;
        }
      } else {
        branchName = '';
      }

      const yearChip = document.getElementById('yearChip');
      if (yearChip) yearChip.textContent = `${window.SUSI_YEAR}학년도 상담`;

      students = (studentJson && studentJson.students) || [];
      studentMap = {};
      students.forEach(s => { studentMap[s.학생ID] = s; });
      colleges = (collegeJson && collegeJson.colleges) || [];

      groupColleges();
      renderStudentSelect();
      addCollegeRow();
      renderSummaryKPI();
    } catch (err) {
      console.error('초기 데이터 로딩 실패:', err);
      window.showToast('데이터를 불러오는 데 실패했습니다', 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── 대학 그룹핑 ─────────
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

  // ───────── 학생 콤보 렌더 (공용 createCombobox) ─────────
  function renderStudentSelect() {
    students.sort((a, b) => a.이름.localeCompare(b.이름));
    const host = document.getElementById('studentCombo');
    if (!host) return;

    const options = [
      { value: '', label: '학생을 선택하세요' },
      ...students.map(s => ({
        value: String(s.학생ID),
        label: `${s.이름} (${s.성별})`,
        meta: s.성별,
      })),
    ];

    if (studentCombo) {
      studentCombo.setOptions(options);
    } else {
      studentCombo = window.createCombobox(host, {
        options,
        placeholder: '학생 선택',
        searchable: true,
        searchPlaceholder: '이름으로 검색',
        onChange: function (v) {
          if (v) loadCounselData(v);
          else renderProfileCard(null, null);
        },
      });
    }
  }

  function getSelectedStudentId() {
    return studentCombo ? studentCombo.value : '';
  }

  // ───────── 프로필 카드 렌더 (간소화: 아바타 · 상담횟수 · 저장시각 제거) ─────────
  function renderProfileCard(user, student) {
    const nameEl = document.getElementById('pName');
    const tagEl = document.getElementById('pTag');
    const branchEl = document.getElementById('pBranch');
    const phoneEl = document.getElementById('pPhone');

    if (!student) {
      if (nameEl) nameEl.textContent = '학생을 선택하세요';
      if (tagEl) { tagEl.textContent = ''; tagEl.hidden = true; }
      if (branchEl) branchEl.textContent = branchName ? `${branchName} 교육원` : '—';
      if (phoneEl) phoneEl.textContent = '—';
      return;
    }

    if (nameEl) nameEl.textContent = student.이름 || '-';
    if (tagEl) {
      const parts = [];
      if (student.성별) parts.push(student.성별);
      if (student.학년) parts.push(`고${student.학년}`);
      if (parts.length) {
        tagEl.textContent = parts.join(' · ');
        tagEl.hidden = false;
      } else {
        tagEl.hidden = true;
      }
    }
    // 지점은 학생 본인 지점명 우선 (학생기초정보.지점명), 없으면 상담사 지점
    const studentBranch = student.지점명 || branchName;
    if (branchEl) branchEl.textContent = studentBranch ? `${studentBranch} 교육원` : '—';
    // DB 컬럼 = 전화번호. 구버전 호환 위해 연락처도 fallback.
    if (phoneEl) phoneEl.textContent = student.전화번호 || student.연락처 || '정보 없음';
  }

  // ───────── 위험도 4단계 분류 (클라 휴리스틱) ─────────
  function classifyRisk(total, maxcut, branchcut) {
    const t = parseFloat(total);
    const b = parseFloat(branchcut);
    if (!isFinite(t) || !isFinite(b)) return 'unknown';
    const d = t - b;
    if (d >= 10) return 'stable';
    if (d >= 0)  return 'fit';
    if (d >= -5) return 'reach';
    return 'risky';
  }

  // ───────── 요약 KPI + 위험도 bar 렌더 ─────────
  function renderSummaryKPI() {
    const groups = document.querySelectorAll('#collegeTable tbody.row-group');
    const totalCount = groups.length;
    let sumTotal = 0, countTotal = 0;
    let maxPass = 0, branchPass = 0;
    const counts = { stable: 0, fit: 0, reach: 0, risky: 0, unknown: 0 };

    groups.forEach(g => {
      const t = parseFloat(g.querySelector('.합산점수')?.textContent);
      const mx = parseFloat(g.querySelector('.max-cut')?.textContent);
      const br = parseFloat(g.querySelector('.branch-cut')?.textContent);
      if (isFinite(t)) { sumTotal += t; countTotal++; }
      if (isFinite(t) && isFinite(mx) && t >= mx) maxPass++;
      if (isFinite(t) && isFinite(br) && t >= br) branchPass++;
      const risk = classifyRisk(t, mx, br);
      counts[risk] = (counts[risk] || 0) + 1;
      // 행 차원 risk-bar 갱신
      const bar = g.querySelector('.row-main .risk-bar');
      if (bar) {
        bar.className = 'risk-bar ' + risk;
        bar.title = RISK_LABEL[risk] || '';
      }
    });

    const kpiCount = document.getElementById('kpiCount');
    const kpiAvg = document.getElementById('kpiAvg');
    const kpiMax = document.getElementById('kpiMax');
    const kpiBranch = document.getElementById('kpiBranch');
    const kpiMaxSub = document.getElementById('kpiMaxSub');
    const kpiBranchSub = document.getElementById('kpiBranchSub');
    const tpCount = document.getElementById('tpCount');

    if (kpiCount) kpiCount.textContent = String(totalCount);
    if (kpiAvg) kpiAvg.textContent = countTotal ? (sumTotal / countTotal).toFixed(1) : '—';
    if (kpiMax) kpiMax.textContent = String(maxPass);
    if (kpiBranch) kpiBranch.textContent = String(branchPass);
    if (kpiMaxSub) kpiMaxSub.textContent = totalCount ? `미달 ${Math.max(totalCount - maxPass, 0)}` : '—';
    if (kpiBranchSub) kpiBranchSub.textContent = totalCount ? `미달 ${Math.max(totalCount - branchPass, 0)}` : '—';
    if (tpCount) tpCount.textContent = `${totalCount}개`;

    updateRiskBar(counts, totalCount);
  }

  function updateRiskBar(counts, totalCount) {
    const host = document.getElementById('riskDist');
    if (!host) return;
    const total = totalCount || 1;
    const order = ['stable', 'fit', 'reach', 'risky'];
    host.innerHTML = order.map(k => {
      const pct = ((counts[k] || 0) / total * 100).toFixed(0);
      return `<div class="risk-seg ${k}" style="width:${pct}%" title="${RISK_LABEL[k]} ${counts[k] || 0}"></div>`;
    }).join('');
  }

  // ───────── 행 카운터 ─────────
  function reNumberRows() {
    document.querySelectorAll('#collegeTable tbody.row-group .row-counter').forEach((counter, i) => {
      counter.textContent = String(i + 1);
    });
  }

  // ───────── 대학 행 추가 (row-main + row-drawer) ─────────
  function addCollegeRow() {
    const tbody = document.getElementById('collegeTbody');
    if (!tbody) return null;
    // row-group 은 #collegeTbody 와 형제 tbody 이므로 table 스코프로 카운트.
    const idx = document.querySelectorAll('#collegeTable tbody.row-group').length + 1;

    // tbody.row-group 한 덩어리로 감싸서 [row-main, row-drawer] 짝 유지
    const group = document.createElement('tbody');
    group.classList.add('row-group');

    // row-main (한 줄 컴팩트)
    const main = document.createElement('tr');
    main.classList.add('row-main');
    main.innerHTML =
      `<td class="num"><span class="row-counter">${idx}</span></td>` +
      `<td class="cell-uni">` +
        `<div class="uni-cell">` +
          `<span class="risk-bar unknown" title="—"></span>` +
          `<div class="sel-college"></div>` +
          `<span class="row-chev"><i class="ph-light ph-caret-right"></i></span>` +
        `</div>` +
      `</td>` +
      `<td class="cell-major"><div class="sel-major"></div></td>` +
      `<td class="cell-type"><div class="sel-type"></div></td>` +
      `<td class="c"><input type="text" class="input-grade" placeholder="—"></td>` +
      `<td class="c"><input type="text" class="input-score" placeholder="—"></td>` +
      `<td class="c"><span class="ro-val input-total-score">—</span></td>` +
      `<td class="num-v">` +
        `<span class="score-cell score-cell--total">` +
          `<span class="ro-val 합산점수">—</span>` +
          `<span class="delta-pair">` +
            `<span class="delta delta-max" title="맥스컷 대비"></span>` +
            `<span class="delta delta-branch" title="지점컷 대비"></span>` +
          `</span>` +
        `</span>` +
      `</td>` +
      `<td class="num-v"><span class="ro-val max-cut">—</span></td>` +
      `<td class="num-v"><span class="ro-val branch-cut">—</span></td>` +
      `<td class="c"><button type="button" class="del-btn" data-action="del" title="행 삭제"><i class="ph-light ph-trash"></i></button></td>`;
    group.appendChild(main);

    // row-drawer (숨김, row-main.is-open 시 펼침)
    const drawer = document.createElement('tr');
    drawer.classList.add('row-drawer');
    drawer.innerHTML =
      `<td colspan="11">` +
        `<div class="drawer-tabs">` +
          `<button type="button" class="drawer-tab active" data-drtab="silgi"><i class="ph-light ph-barbell"></i>실기 기록</button>` +
          `<button type="button" class="drawer-tab" data-drtab="info"><i class="ph-light ph-info"></i>간단 요강</button>` +
          `<button type="button" class="drawer-action" data-action="score" title="배점표 모달 열기"><i class="ph-light ph-ranking"></i>배점표</button>` +
        `</div>` +
        `<div class="drawer-pane active" data-drpane="silgi"><div class="practical-fields events"></div></div>` +
        `<div class="drawer-pane" data-drpane="info"><div class="drawer-info"></div></div>` +
      `</td>`;
    group.appendChild(drawer);

    // ⚠️ 중첩 tbody 금지 — #collegeTbody 는 placeholder anchor.
    // 새 .row-group tbody 는 형제(sibling) 로 삽입해야 colgroup 공유 가능.
    // (중첩 시 Chrome 이 내부 tbody 를 별도 layout context 로 잡아 열폭 어긋남)
    tbody.parentNode.appendChild(group);
    reNumberRows();

    // ───── 3단계 콤보 생성 ─────
    const sortedCollegeNames = Object.keys(collegeGroups).sort((a, b) => a.localeCompare(b));
    const colCombo = window.createCombobox(group.querySelector('.sel-college'), {
      options: sortedCollegeNames.map(c => ({ value: c, label: c })),
      placeholder: '대학명',
      searchable: true,
      searchPlaceholder: '대학명 검색',
      onChange: () => onCollegeNameChange(group),
    });
    const majorCombo = window.createCombobox(group.querySelector('.sel-major'), {
      options: [],
      placeholder: '대학 먼저',
      searchable: true,
      searchPlaceholder: '학과 검색',
      disabled: true,
      onChange: () => onMajorChange(group),
    });
    const typeCombo = window.createCombobox(group.querySelector('.sel-type'), {
      options: [],
      placeholder: '학과 먼저',
      searchable: false,
      disabled: true,
      onChange: () => onTypeChange(group),
    });
    group._colCombo = colCombo;
    group._majorCombo = majorCombo;
    group._typeCombo = typeCombo;

    // input 이벤트 바인딩
    group.querySelectorAll('.input-grade, .input-score').forEach(inp => {
      inp.addEventListener('change', () => onInputEdit(inp));
    });

    // 삭제
    main.querySelector('[data-action="del"]').addEventListener('click', (ev) => {
      ev.stopPropagation();
      group.remove();
      reNumberRows();
      renderSummaryKPI();
    });

    // row click → drawer 토글 (단, 입력/콤보 클릭은 무시)
    main.addEventListener('click', (ev) => {
      if (ev.target.closest('input, button, .combobox, .combo-display, .combo-menu, .del-btn')) return;
      toggleRowDrawer(group);
    });

    // drawer 탭 전환
    drawer.querySelectorAll('.drawer-tab').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        switchDrawerTab(group, btn.getAttribute('data-drtab'));
      });
    });

    // drawer 내 배점표 버튼 → 모달로 분리
    const scoreBtn = drawer.querySelector('.drawer-action[data-action="score"]');
    if (scoreBtn) {
      scoreBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openScoreTablePopup(group);
      });
    }

    return group;
  }

  // ───────── drawer 토글 (accordion: 한 번에 하나만) ─────────
  function closeOtherRows(currentMain) {
    document.querySelectorAll('#collegeTable tbody.row-group .row-main.is-open').forEach(m => {
      if (m !== currentMain) m.classList.remove('is-open');
    });
  }

  function toggleRowDrawer(group) {
    const main = group.querySelector('.row-main');
    const willOpen = !main.classList.contains('is-open');
    closeOtherRows(main);
    main.classList.toggle('is-open', willOpen);
    if (willOpen) {
      const activeTab = group.querySelector('.drawer-tab.active')?.getAttribute('data-drtab') || 'silgi';
      loadDrawerPane(group, activeTab);
    }
  }

  function switchDrawerTab(group, tab) {
    const main = group.querySelector('.row-main');
    closeOtherRows(main);
    main.classList.add('is-open');
    group.querySelectorAll('.drawer-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-drtab') === tab);
    });
    group.querySelectorAll('.drawer-pane').forEach(p => {
      p.classList.toggle('active', p.getAttribute('data-drpane') === tab);
    });
    loadDrawerPane(group, tab);
  }

  async function loadDrawerPane(group, tab) {
    const collegeID = getCollegeIDByTbody(group);
    if (!collegeID) return;
    if (tab === 'info') await renderDrawerInfo(group, collegeID);
    // silgi 는 onTypeChange 시점에 이미 채워짐
    // 배점표는 모달 (openScoreTablePopup) 로 분리됨
  }

  // ───────── 3단계 콤보 연쇄 ─────────
  function onCollegeNameChange(group) {
    const colValue = group._colCombo.value;
    group._majorCombo.setOptions([]);
    group._majorCombo.setValue('');
    group._majorCombo.disable();
    group._typeCombo.setOptions([]);
    group._typeCombo.setValue('');
    group._typeCombo.disable();
    group.querySelector('.practical-fields').innerHTML = '';
    group.querySelector('.input-total-score').textContent = '—';
    group.querySelector('.합산점수').textContent = '—';
    if (colValue) {
      const majors = Object.keys(collegeGroups[colValue] || {})
        .map(m => ({ value: m, label: m }));
      group._majorCombo.setOptions(majors);
      group._majorCombo.enable();
    }
    renderSummaryKPI();
  }

  function onMajorChange(group) {
    const colValue = group._colCombo.value;
    const majorValue = group._majorCombo.value;
    group._typeCombo.setOptions([]);
    group._typeCombo.setValue('');
    group._typeCombo.disable();
    group.querySelector('.practical-fields').innerHTML = '';
    group.querySelector('.input-total-score').textContent = '—';
    group.querySelector('.합산점수').textContent = '—';
    if (colValue && majorValue) {
      const types = (collegeGroups[colValue][majorValue] || [])
        .map(t => ({ value: t, label: t }));
      group._typeCombo.setOptions(types);
      group._typeCombo.enable();
    }
    renderSummaryKPI();
  }

  async function onTypeChange(group) {
    const colValue = group._colCombo.value;
    const majorValue = group._majorCombo.value;
    const typeValue = group._typeCombo.value;
    const practicalContainer = group.querySelector('.practical-fields');
    if (!colValue || !majorValue || !typeValue) {
      practicalContainer.innerHTML = '';
      renderSummaryKPI();
      return;
    }
    const collegeID = getCollegeID(colValue, majorValue, typeValue);
    const matched = colleges.find(c => c.대학ID === collegeID);
    // 연도별 컬럼명 (DB: 27susi.대학정보 → 27맥스예상컷)
    const yearKey = `${window.SUSI_YEAR || '27'}맥스예상컷`;
    group.querySelector('.max-cut').textContent = matched?.[yearKey] ?? matched?.['맥스예상컷'] ?? '—';
    group.querySelector('.branch-cut').textContent = matched?.['지점예상컷'] ?? '—';
    const practical_id = matched?.실기ID;
    const student_id = getSelectedStudentId();
    const student = studentMap[student_id];

    if (!student) {
      practicalContainer.innerHTML =
        '<span class="practical-hint is-error">학생을 먼저 선택하세요.</span>';
    } else if (!practical_id) {
      practicalContainer.innerHTML =
        '<span class="practical-hint is-muted">실기 종목이 없습니다.</span>';
    } else {
      try {
        const json = await window.api(
          `_events_by_practical_id?practical_id=${encodeURIComponent(practical_id)}&gender=${encodeURIComponent(student.성별)}`
        );
        const events = [...new Set((json.events || []).map(e => e.종목명))];
        renderDrawerSilgi(group, events);
      } catch (e) {
        console.error('실기 종목 로드 실패', e);
        window.showToast('실기 종목 로드 실패', 'error');
      }
    }

    if (collegeID && student_id) {
      try {
        const json2 = await window.api(
          `_student_grade?student_id=${encodeURIComponent(student_id)}`
        );
        if (json2 && json2.success && Array.isArray(json2.grades)) {
          const g = json2.grades.find(row => String(row.대학ID) === String(collegeID));
          if (g) {
            group.querySelector('.input-grade').value = g.등급 ?? '';
            group.querySelector('.input-score').value = g.내신점수 ?? '';
          }
        }
      } catch (e) {
        console.error('학생 성적 로드 실패:', e && e.message ? e.message : 'unknown');
        window.showToast('학생 성적 로드 실패', 'error');
      }
    }
    await updateAllScores(group);
  }

  // ───────── drawer 탭1: 실기 기록 렌더 ─────────
  function renderDrawerSilgi(group, events) {
    const container = group.querySelector('.practical-fields');
    if (!container) return;
    if (!events || events.length === 0) {
      container.innerHTML = '<span class="practical-hint is-muted">실기 종목이 없습니다.</span>';
      return;
    }
    container.innerHTML = events.map(name => `
      <div class="event-card practical-group">
        <div class="event-name">
          <span class="nm practical-label">${esc(name)}</span>
        </div>
        <div class="event-row">
          <span class="rlbl">기록</span>
          <input type="text" class="input-sm input-record" placeholder="—">
        </div>
        <div class="score-pill">
          <span class="plbl">점수</span>
          <input type="text" class="input-sm input-score-only" readonly placeholder="—" style="border:none;background:transparent;text-align:right;width:auto;min-width:0;flex:1;color:inherit;font-weight:700">
        </div>
      </div>`).join('');
    container.querySelectorAll('.input-record').forEach(inp => {
      inp.addEventListener('input', () => onRecordInputChange(inp));
    });
  }

  // ───────── drawer 탭2: 간단 요강 렌더 ─────────
  async function renderDrawerInfo(group, collegeID) {
    const host = group.querySelector('.drawer-info');
    if (!host) return;

    // 캐시
    if (drawerCache[collegeID]?.details) {
      host.innerHTML = buildInfoHTML(drawerCache[collegeID].details);
      return;
    }

    host.innerHTML = '<div class="drawer-empty">불러오는 중…</div>';
    try {
      const data = await window.api(`/university-details?college_id=${encodeURIComponent(collegeID)}`);
      if (!data || !data.success) {
        host.innerHTML = `<div class="drawer-empty">${esc(data?.message || '정보를 불러오지 못했습니다')}</div>`;
        return;
      }
      drawerCache[collegeID] = drawerCache[collegeID] || {};
      drawerCache[collegeID].details = data.details;
      host.innerHTML = buildInfoHTML(data.details);
    } catch (err) {
      host.innerHTML = '<div class="drawer-empty">정보를 불러오는 데 실패했습니다.</div>';
    }
  }

  function buildInfoHTML(details) {
    const hasFirstStage = details['1단계배수'] && String(details['1단계배수']).trim() !== '';
    const eligibility = [];
    if (details.일반고 === 'O') eligibility.push('일반고');
    if (details.특성화고 === 'O') eligibility.push('특성화고');
    if (details.체육고 === 'O') eligibility.push('체육고');
    if (details.검정고시 === 'O') eligibility.push('검정고시');

    const rows = [
      ['모집정원',      esc(details.정원 || '-')],
      ['25학년도 정원',  esc(details['25정원'] || '자료없음')],
      ['25학년도 경쟁률', esc(details['25경쟁률'] || '자료없음')],
      ['25학년도 추가합격', esc(details['25추가합격'] || '자료없음')],
      ['교직이수',       esc(details.교직이수 || '-')],
    ];
    if (hasFirstStage) {
      rows.push(
        ['1단계(배수)', esc(details['1단계배수'])],
        ['1단계 학생부', `${esc(details['1단계학생부'] || '-')}%`],
        ['1단계 기타',   `${esc(details['1단계기타'] || '-')}%`],
        ['2단계 내신',   `${esc(details['2단계내신'] || '-')}%`],
        ['2단계 실기',   `${esc(details['2단계실기'] || '-')}%`],
        ['2단계 면접',   `${esc(details['2단계면접'] || '-')}%`],
        ['2단계 기타',   `${esc(details['2단계기타'] || '-')}%`],
      );
    } else {
      rows.push(
        ['내신 반영', `${esc(details['2단계내신'] || '-')}%`],
        ['실기 반영', `${esc(details['2단계실기'] || '-')}%`],
        ['면접 반영', `${esc(details['2단계면접'] || '-')}%`],
        ['기타 반영', `${esc(details['2단계기타'] || '-')}%`],
      );
    }
    rows.push(
      ['내신 교과', `${esc(details.내신교과 || '-')}%`],
      ['내신 출결', `${esc(details.내신출결 || '-')}%`],
      ['내신 기타', `${esc(details.내신기타 || '-')}%`],
      ['일반선택',  esc(details.내신일반 || '-')],
      ['진로선택',  esc(details.내신진로 || '-')],
      ['N수생 반영', esc(details.N학년비율 || '-')],
    );
    if (hasFirstStage) rows.push(['1단계 발표', esc(details['1단계발표일'] || '-')]);
    rows.push(
      ['실기고사',    esc(details.실기일 || '-')],
      ['최종 발표',    esc(details.합격자발표일 || '-')],
    );
    if (eligibility.length > 0) {
      rows.push(['지원 가능 대상', esc(eligibility.join(', '))]);
    }

    const rowsHTML = rows.map(([k, v]) =>
      `<div class="info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`
    ).join('');

    return `<div class="info-grid">${rowsHTML}</div>`;
  }

  // ───────── 배점표 모달 (공용 modal.js + 종목 콤보 선택) ─────────
  let _scoreEventCombo = null;
  let _scoreEventsCurrent = null;

  async function openScoreTablePopup(group) {
    const collegeID = getCollegeIDByTbody(group);
    const host = document.getElementById('scoreTableContainer');
    const titleEl = document.getElementById('scoreTableTitle');
    if (!host || !titleEl) return;

    if (!collegeID) {
      window.showToast('대학/학과/전형을 먼저 선택하세요', 'warn');
      return;
    }
    const matched = colleges.find(c => c.대학ID === collegeID);
    titleEl.textContent = matched
      ? `${matched.대학명} · ${matched.학과명} · ${matched.전형명} 배점표`
      : '배점표';

    if (!matched || !matched.실기ID) {
      host.innerHTML = '<div class="drawer-empty">배점표가 등록되지 않은 전형입니다.</div>';
      window.openModal('scoreTableModal');
      return;
    }

    const render = (events) => {
      _scoreEventsCurrent = events;
      const names = Object.keys(events);
      host.innerHTML =
        `<div class="score-modal-head">` +
          `<div class="event-combo" id="scoreEventCombo"></div>` +
          `<span class="event-meta" id="scoreEventMeta"></span>` +
        `</div>` +
        `<div class="score-modal-body" id="scoreModalBody"></div>`;
      const comboHost = host.querySelector('#scoreEventCombo');
      // 종목 콤보 (searchable: 종목 많으면 검색)
      _scoreEventCombo = window.createCombobox(comboHost, {
        options: [
          { value: '__all__', label: '전체 종목 보기', meta: `${names.length}종` },
          ...names.map(n => ({ value: n, label: n })),
        ],
        placeholder: '종목 선택',
        searchable: names.length > 6,
        searchPlaceholder: '종목 검색',
        value: '__all__',
        onChange: (v) => renderScoreBody(v),
      });
      renderScoreBody('__all__');
    };

    const renderScoreBody = (key) => {
      const body = document.getElementById('scoreModalBody');
      const metaEl = document.getElementById('scoreEventMeta');
      if (!body || !_scoreEventsCurrent) return;
      const names = Object.keys(_scoreEventsCurrent);
      if (key === '__all__') {
        body.innerHTML = names.map(n => renderScoreBlock(n, _scoreEventsCurrent[n])).join('');
        if (metaEl) metaEl.textContent = `${names.length}종 전체`;
      } else {
        body.innerHTML = renderScoreBlock(key, _scoreEventsCurrent[key]);
        if (metaEl) metaEl.textContent = `종목 1 / ${names.length}`;
      }
    };

    if (drawerCache[collegeID]?.scoreEvents) {
      render(drawerCache[collegeID].scoreEvents);
      window.openModal('scoreTableModal');
      return;
    }

    host.innerHTML = '<div class="drawer-empty">불러오는 중…</div>';
    window.openModal('scoreTableModal');
    try {
      const data = await window.api(`_get_score_table?실기ID=${encodeURIComponent(matched.실기ID)}`);
      if (!data || !data.success) {
        host.innerHTML = '<div class="drawer-empty">배점표를 불러오는 데 실패했습니다.</div>';
        return;
      }
      drawerCache[collegeID] = drawerCache[collegeID] || {};
      drawerCache[collegeID].scoreEvents = data.events;
      render(data.events);
    } catch (err) {
      host.innerHTML = '<div class="drawer-empty">배점표 로드 중 오류 발생.</div>';
    }
  }

  function renderScoreBlock(name, ev) {
    const { 남 = [], 여 = [] } = ev || {};
    const allScores = new Set([...남.map(i => i.배점), ...여.map(i => i.배점)]);
    const sortedScores = Array.from(allScores).sort((a, b) => Number(b) - Number(a));
    const 남Map = new Map(남.map(i => [i.배점, i.기록]));
    const 여Map = new Map(여.map(i => [i.배점, i.기록]));
    const rows = sortedScores.map(s =>
      `<tr><td>${esc(s)}</td><td>${esc(남Map.get(s) || '-')}</td><td>${esc(여Map.get(s) || '-')}</td></tr>`
    ).join('');
    return `
      <div class="score-event-block">
        <h4 class="score-event-title"><i class="ph-light ph-barbell"></i>${esc(name)}</h4>
        <div class="score-table-wrap">
          <table>
            <thead><tr><th>배점</th><th>남 기록</th><th>여 기록</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }


  // ───────── 기록 입력 → 즉시 계산 ─────────
  function onRecordInputChange(input) {
    updateAllScores(input.closest('tbody.row-group'));
  }

  function onInputEdit(input) {
    const tbody = input.closest('tbody.row-group');
    const student_id = getSelectedStudentId();
    const collegeID = getCollegeIDByTbody(tbody);
    if (student_id && collegeID &&
        (input.classList.contains('input-grade') || input.classList.contains('input-score'))) {
      window.api('_student_grade_update', {
        method: 'POST',
        body: JSON.stringify({
          student_id,
          college_id: collegeID,
          등급: tbody.querySelector('.input-grade').value,
          내신점수: tbody.querySelector('.input-score').value,
        }),
      }).catch(err => console.warn('성적 업데이트 실패', err));
    }
    updateAllScores(tbody);
  }

  // ───────── 점수 계산 ─────────
  async function updateAllScores(tbody) {
    const student = studentMap[getSelectedStudentId()];
    const collegeID = getCollegeIDByTbody(tbody);
    if (!student || !collegeID) {
      renderSummaryKPI();
      return;
    }

    const 내신점수 = tbody.querySelector('.input-score').value || 0;
    const practicalGroups = tbody.querySelectorAll('.practical-group');
    const inputs = Array.from(practicalGroups).map(group => ({
      종목명: (group.querySelector('.practical-label')?.textContent || '').split('(')[0].trim(),
      기록: group.querySelector('.input-record')?.value.trim() || null,
    }));

    let data;
    try {
      data = await window.api('/calculate-final-score', {
        method: 'POST',
        body: JSON.stringify({ 대학ID: collegeID, gender: student.성별, inputs, 내신점수 }),
      });
    } catch (e) {
      console.warn('점수 계산 실패', e);
      return;
    }
    if (!data || !data.success) return;

    practicalGroups.forEach(group => {
      const label = group.querySelector('.practical-label');
      if (!label) return;
      const eventName = label.textContent.split('(')[0].trim();
      const score = data.종목별점수[eventName];
      const gam = data.종목별감수[eventName];

      const scoreInp = group.querySelector('.input-score-only');
      if (scoreInp) scoreInp.value = score ?? '';

      label.querySelectorAll('.gam-span').forEach(sp => sp.remove());
      if (gam > 0) {
        const gamSpan = document.createElement('span');
        gamSpan.className = 'gam-span';
        gamSpan.textContent = `(${gam}감)`;
        label.appendChild(gamSpan);
      }
    });

    const totalEl = tbody.querySelector('.input-total-score');
    const totalCell = totalEl.parentElement;
    totalCell.querySelectorAll('.total-gam-span').forEach(sp => sp.remove());
    totalEl.textContent = data.실기총점 ?? '—';
    if (data.총감수 > 0) {
      const span = document.createElement('span');
      span.className = 'total-gam-span';
      span.textContent = `(총 ${data.총감수}감)`;
      totalCell.appendChild(span);
    }
    tbody.querySelector('.합산점수').textContent = data.합산점수 ?? '—';

    // delta pill 갱신 (맥스컷/지점컷)
    updateDeltaPills(tbody);
    renderSummaryKPI();
  }

  function updateDeltaPills(tbody) {
    const t = parseFloat(tbody.querySelector('.합산점수')?.textContent);
    const mx = parseFloat(tbody.querySelector('.max-cut')?.textContent);
    const br = parseFloat(tbody.querySelector('.branch-cut')?.textContent);
    const mxEl = tbody.querySelector('.delta-max');
    const brEl = tbody.querySelector('.delta-branch');
    if (mxEl) {
      if (isFinite(t) && isFinite(mx)) {
        const d = t - mx;
        mxEl.textContent = (d >= 0 ? '+' : '') + d.toFixed(1);
        mxEl.className = 'delta delta-max ' + (d >= 5 ? 'pos' : d >= -5 ? 'neu' : 'neg');
      } else {
        mxEl.textContent = '';
        mxEl.className = 'delta delta-max';
      }
    }
    if (brEl) {
      if (isFinite(t) && isFinite(br)) {
        const d = t - br;
        brEl.textContent = (d >= 0 ? '+' : '') + d.toFixed(1);
        brEl.className = 'delta delta-branch ' + (d >= 5 ? 'pos' : d >= -5 ? 'neu' : 'neg');
      } else {
        brEl.textContent = '';
        brEl.className = 'delta delta-branch';
      }
    }
  }

  // ───────── 상담 저장 ─────────
  async function saveCounsel(e) {
    if (e) e.preventDefault();
    const student_id = getSelectedStudentId();
    if (!student_id) {
      window.showToast('먼저 학생을 선택하세요', 'warn');
      return;
    }

    const collegesArr = [];
    document.querySelectorAll('#collegeTable tbody.row-group').forEach(tbody => {
      const 대학ID = getCollegeIDByTbody(tbody);
      if (!대학ID) return;
      const practicalGroups = tbody.querySelectorAll('.practical-group');
      const 기록 = [], 점수 = [];
      for (let i = 0; i < 7; i++) {
        const g = practicalGroups[i];
        기록.push(g?.querySelector('.input-record')?.value || null);
        점수.push(g?.querySelector('.input-score-only')?.value || null);
      }
      collegesArr.push({
        대학ID, 실기ID: getPracticalIDByCollegeID(대학ID),
        내신등급: tbody.querySelector('.input-grade')?.value || null,
        내신점수: tbody.querySelector('.input-score')?.value || null,
        기록1: 기록[0], 점수1: 점수[0], 기록2: 기록[1], 점수2: 점수[1],
        기록3: 기록[2], 점수3: 점수[2], 기록4: 기록[3], 점수4: 점수[3],
        기록5: 기록[4], 점수5: 점수[4], 기록6: 기록[5], 점수6: 점수[5],
        기록7: 기록[6], 점수7: 점수[6],
        실기총점: tbody.querySelector('.input-total-score')?.textContent?.replace(/[^\d.\-]/g, '') || null,
        합산점수: tbody.querySelector('.합산점수')?.textContent?.replace(/[^\d.\-]/g, '') || null,
      });
    });

    try {
      const [collegeRes, memoRes] = await Promise.all([
        window.api('_counsel_college_save_multi', {
          method: 'POST',
          body: JSON.stringify({ student_id, colleges: collegesArr }),
        }),
        window.api('_counsel_memo_save', {
          method: 'POST',
          body: JSON.stringify({
            student_id,
            memo: document.getElementById('counselMemo').value,
          }),
        }),
      ]);
      if (collegeRes.success && memoRes.success) {
        const name = studentMap[student_id]?.이름 || '학생';
        window.showToast(`${name} 학생의 상담내용이 저장되었습니다`, 'success');
      } else {
        window.showToast('데이터 저장 중 문제가 발생했습니다', 'error');
      }
    } catch (err) {
      console.error('상담 저장 실패:', err && err.message ? err.message : 'unknown');
      window.showToast('서버와 통신 중 오류가 발생했습니다', 'error');
    }
  }

  // ───────── 상담 불러오기 ─────────
  async function loadCounselData(student_id) {
    showLoading('학생 정보 로딩 중…');
    const memoTextarea = document.getElementById('counselMemo');
    // row-group 은 #collegeTbody 의 형제 이므로 table 스코프로 제거.
    document.querySelectorAll('#collegeTable tbody.row-group').forEach(g => g.remove());
    memoTextarea.value = '';
    const student = studentMap[student_id] || null;
    renderProfileCard(null, student);

    try {
      const [collegeRes, memoRes] = await Promise.all([
        window.api(`_counsel_college_load?student_id=${encodeURIComponent(student_id)}`),
        window.api(`_counsel_memo_load?student_id=${encodeURIComponent(student_id)}`),
      ]);

      if (memoRes.success) memoTextarea.value = memoRes.memo || '';
      updateMemoLen();

      if (!collegeRes.success || !collegeRes.colleges || collegeRes.colleges.length === 0) {
        addCollegeRow();
        renderSummaryKPI();
        return;
      }

      for (const item of collegeRes.colleges) {
        const c = colleges.find(cc => cc.대학ID === item.대학ID);
        if (!c) continue;
        const group = addCollegeRow();
        if (!group) continue;
        await new Promise(r => setTimeout(r, 50));

        group._colCombo.setValue(c.대학명);
        onCollegeNameChange(group);

        group._majorCombo.setValue(c.학과명);
        onMajorChange(group);

        group._typeCombo.setValue(c.전형명);
        // combobox.setValue 는 동기지만 내부 렌더가 next tick 일 수 있어 onTypeChange 직전 마이크로 대기
        await new Promise(r => setTimeout(r, 0));
        await onTypeChange(group);

        const practicalGroups = group.querySelectorAll('.practical-group');
        for (let i = 0; i < MAX_PRACTICAL_EVENTS; i++) {
          const rec = item[`기록${i + 1}`];
          if (practicalGroups[i]?.querySelector('.input-record') && rec) {
            practicalGroups[i].querySelector('.input-record').value = rec;
          }
        }
        const firstRecord = group.querySelector('.input-record');
        if (firstRecord?.value) await onRecordInputChange(firstRecord);
      }
      renderSummaryKPI();
    } catch (err) {
      console.error('상담 불러오기 실패:', err && err.message ? err.message : 'unknown');
      window.showToast('상담 정보를 불러오는 데 실패했습니다', 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── ID 보조 ─────────
  function getCollegeID(대학명, 학과명, 전형명) {
    const c = colleges.find(c => c.대학명 === 대학명 && c.학과명 === 학과명 && c.전형명 === 전형명);
    return c?.대학ID || null;
  }
  function getCollegeIDByTbody(tbody) {
    const c = tbody._colCombo ? tbody._colCombo.value : '';
    const m = tbody._majorCombo ? tbody._majorCombo.value : '';
    const t = tbody._typeCombo ? tbody._typeCombo.value : '';
    return c && m && t ? getCollegeID(c, m, t) : null;
  }
  function getPracticalIDByCollegeID(대학ID) {
    const c = colleges.find(c => c.대학ID === 대학ID);
    return c?.실기ID || null;
  }

  // ───────── 메모 글자수 ─────────
  function updateMemoLen() {
    const memo = document.getElementById('counselMemo');
    const len = document.getElementById('memoLen');
    if (memo && len) len.textContent = `${(memo.value || '').length}자`;
  }

  // ───────── 우측 패널 토글 ─────────
  function togglePanel() {
    const ws = document.getElementById('workspace');
    const btn = document.getElementById('panelToggle');
    if (!ws || !btn) return;
    const on = ws.classList.toggle('with-panel');
    btn.classList.toggle('active', on);
  }

  // ───────── sidepanel 탭 전환 ─────────
  function initSidepanelTabs() {
    document.querySelectorAll('#sidepanel .sp-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const pane = btn.getAttribute('data-pane');
        document.querySelectorAll('#sidepanel .sp-tab').forEach(b =>
          b.classList.toggle('active', b === btn));
        document.querySelectorAll('#sidepanel .sp-pane').forEach(p =>
          p.classList.toggle('active', p.getAttribute('data-pane') === pane));
      });
    });
  }

  // ───────── 테이블 내 검색 ─────────
  function initTableSearch() {
    const input = document.getElementById('tpSearch');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll('#collegeTable tbody.row-group').forEach(g => {
        const col = g._colCombo?.value || '';
        const maj = g._majorCombo?.value || '';
        const hay = `${col} ${maj}`.toLowerCase();
        const show = !q || hay.includes(q);
        g.style.display = show ? '' : 'none';
      });
    });
  }

  // ───────── PDF 생성 ─────────
  function toBase64(url) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () {
        const reader = new FileReader();
        reader.onloadend = function () { resolve(reader.result); };
        reader.readAsDataURL(xhr.response);
      };
      xhr.onerror = reject;
      xhr.open('GET', url);
      xhr.responseType = 'blob';
      xhr.send();
    });
  }
  function getImageDimensions(base64) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () { resolve({ width: this.naturalWidth, height: this.naturalHeight }); };
      img.onerror = reject;
      img.src = base64;
    });
  }

  async function downloadPDF() {
    const studentId = getSelectedStudentId();
    if (!studentId) {
      window.showToast('먼저 학생을 선택해주세요', 'warn');
      return;
    }
    showLoading('PDF 문서를 만들고 있어요');
    try {
      const student = studentMap[studentId];
      const branch = branchName || 'OO';
      const formatPhoneNumber = phone =>
        String(phone || '').replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
      const formattedPhone = formatPhoneNumber(directorPhone);

      const logoUrl = '25max.png';
      const logoBase64 = await toBase64(logoUrl);
      const logoOriginalSize = await getImageDimensions(logoBase64);
      const logoAspectRatio = logoOriginalSize.width / logoOriginalSize.height;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const A4_WIDTH = 210, A4_HEIGHT = 297;

      doc.setFont('NanumGothic', 'normal');

      doc.setDrawColor(...PDF_COLORS.accentLine);
      doc.setLineWidth(1.5);
      doc.line(20, 20, A4_WIDTH - 20, 20);

      doc.setFontSize(28);
      doc.setTextColor(...PDF_COLORS.title);
      doc.text(`맥스체대입시 ${branch} 교육원`, A4_WIDTH / 2, 50, { align: 'center' });

      doc.setFontSize(20);
      doc.text(`20${window.SUSI_YEAR}학년도 수시 상담자료`, A4_WIDTH / 2, 65, { align: 'center' });

      const logoWidth = A4_WIDTH;
      const logoHeight = logoWidth / logoAspectRatio;
      const logoX = (A4_WIDTH - logoWidth) / 2;
      const logoY = 80;
      doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);

      doc.setDrawColor(...PDF_COLORS.cardBorder);
      doc.setFillColor(...PDF_COLORS.cardFill);
      doc.roundedRect(40, A4_HEIGHT - 80, A4_WIDTH - 80, 60, 3, 3, 'FD');

      doc.setFontSize(16);
      doc.setTextColor(...PDF_COLORS.title);
      doc.text('상담 학생 정보', A4_WIDTH / 2, A4_HEIGHT - 65, { align: 'center' });

      doc.setFontSize(14);
      doc.setTextColor(...PDF_COLORS.bodyText);
      doc.text(`이    름 : ${student.이름}`, 50, A4_HEIGHT - 50);
      doc.text(`상담문의 : ${formattedPhone}`, 50, A4_HEIGHT - 35);

      doc.setDrawColor(...PDF_COLORS.accentLine);
      doc.setLineWidth(1);
      doc.line(20, A4_HEIGHT - 15, A4_WIDTH - 20, A4_HEIGHT - 15);

      doc.setFontSize(10);
      doc.setTextColor(...PDF_COLORS.footerText);
      doc.text('맥스체대입시 - 체대입시 진학의 메카', A4_WIDTH / 2, A4_HEIGHT - 10, { align: 'center' });

      doc.addPage();
      const element = document.getElementById('captureArea');
      element.classList.add('pdf-export-mode');
      const canvas = await html2canvas(element, {
        scale: 2, useCORS: true, logging: false, allowTaint: false,
      });
      element.classList.remove('pdf-export-mode');

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const MARGIN = 15;
      const availableWidth = A4_WIDTH - (2 * MARGIN);
      const availableHeight = A4_HEIGHT - (2 * MARGIN);
      const imgRatio = canvas.width / canvas.height;
      let pdfImgWidth = availableWidth, pdfImgHeight = pdfImgWidth / imgRatio;
      if (pdfImgHeight > availableHeight) {
        pdfImgHeight = availableHeight;
        pdfImgWidth = pdfImgHeight * imgRatio;
      }
      const xPos = (A4_WIDTH - pdfImgWidth) / 2;
      doc.addImage(imgData, 'JPEG', xPos, MARGIN, pdfImgWidth, pdfImgHeight);

      doc.save(`${student.이름}_상담요약.pdf`);
      window.showToast('PDF 생성 완료!', 'success');
    } catch (error) {
      console.error('PDF 생성 오류:', error);
      window.showToast('PDF 생성 중 문제가 발생했습니다: ' + error.message, 'error');
    } finally {
      hideLoading();
    }
  }

  // ───────── 전역 이벤트 바인딩 ─────────
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('counselForm');
    if (form) form.addEventListener('submit', saveCounsel);
    document.getElementById('btnAddCollege').addEventListener('click', () => {
      addCollegeRow();
      renderSummaryKPI();
    });
    document.getElementById('btnSave').addEventListener('click', saveCounsel);
    document.getElementById('btnPdf').addEventListener('click', downloadPDF);
    const scoreClose = document.getElementById('scoreTableClose');
    if (scoreClose) scoreClose.addEventListener('click', () => window.closeModal('scoreTableModal'));
    const pt = document.getElementById('panelToggle');
    if (pt) pt.addEventListener('click', togglePanel);
    const memo = document.getElementById('counselMemo');
    if (memo) memo.addEventListener('input', updateMemoLen);

    initSidepanelTabs();
    initTableSearch();
    renderProfileCard(null, null);
    loadData();
  });
})();
