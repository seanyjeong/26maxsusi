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

  // ───────── PDF 생성 (정시엔진 스타일 — 서버 Puppeteer 렌더 + 로컬 html2canvas 폴백) ─────────
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

  const PDF_ROWS_PER_PAGE = 14;

  const PDF_CSS = `
    /* ── Font metric override — glyph 를 line-box 중앙으로 (정시엔진과 동일) ── */
    @font-face {
      font-family: 'PretendardFit';
      font-weight: 100 900;
      font-style: normal;
      src: local('Pretendard Variable'), local('Pretendard'), url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');
      ascent-override: 86%;
      descent-override: 22%;
      line-gap-override: 0%;
    }
    @font-face {
      font-family: 'GeistFit';
      font-weight: 100 900;
      font-style: normal;
      src: local('Geist'), local('GeistVariable');
      ascent-override: 88%;
      descent-override: 22%;
      line-gap-override: 0%;
    }
    @font-face {
      font-family: 'GeistMonoFit';
      font-weight: 100 900;
      font-style: normal;
      src: local('Geist Mono'), local('GeistMono-Regular');
      ascent-override: 86%;
      descent-override: 22%;
      line-gap-override: 0%;
    }
    :root {
      --emerald-50:#ecfdf5; --emerald-100:#d1fae5; --emerald-500:#10b981; --emerald-600:#059669; --emerald-700:#047857;
      --blue-500:#0ea5e9; --blue-600:#0284c7; --blue-50:#f0f9ff; --blue-700:#0369a1;
      --amber-500:#eab308; --amber-600:#ca8a04; --amber-50:#fefce8; --amber-700:#a16207;
      --red-50:#fef2f2; --red-600:#dc2626; --red-700:#b91c1c;
      --zinc-50:#fafafa; --zinc-100:#f4f4f5; --zinc-200:#e4e4e7; --zinc-300:#d4d4d8;
      --zinc-400:#a1a1aa; --zinc-500:#71717a; --zinc-600:#52525b; --zinc-700:#3f3f46;
      --zinc-800:#27272a; --zinc-900:#18181b;
      --pdf-font-ko:'PretendardFit','Pretendard',-apple-system,sans-serif;
      --pdf-font-en:'GeistFit','Geist','Pretendard',sans-serif;
      --pdf-font-mono:'GeistMonoFit','Geist Mono',ui-monospace,monospace;
      --hairline:#e4e4e7;
    }
    .pdf-stage * { box-sizing:border-box; margin:0; padding:0; }
    .pdf-stage img { max-width:none; height:auto; }
    .pdf-stage { font-family:var(--pdf-font-ko); color:var(--zinc-900); font-feature-settings:"tnum" 1,"ss01" 1; letter-spacing:-0.01em; -webkit-font-smoothing:antialiased; line-height:1.4; }
    .pdf-stage .page { width:297mm; height:210mm; background:#fff; position:relative; overflow:hidden; padding:11mm 14mm 10mm; display:flex; flex-direction:column; }
    .pdf-stage .watermark-img { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:70%; max-width:200mm; aspect-ratio:3/1; opacity:0.06; pointer-events:none; user-select:none; z-index:100; object-fit:contain; }
    .pdf-stage .page:not(.cover-page) > *:not(.watermark-img) { position:relative; z-index:1; }

    /* ── 페이지 상단 헤더 ─────────────────── */
    .pdf-stage .page-header { display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:1px solid var(--hairline); margin-bottom:14px; flex:0 0 auto; }
    .pdf-stage .brand { display:flex; align-items:center; gap:12px; }
    .pdf-stage .logo-img { height:32px; width:auto; object-fit:contain; flex-shrink:0; display:block; }
    .pdf-stage .brand-text .title { font-size:13px; font-weight:600; color:var(--zinc-900); letter-spacing:-0.02em; line-height:1.3; }
    .pdf-stage .brand-text .subtitle { font-size:10.5px; color:var(--zinc-500); margin-top:3px; letter-spacing:-0.01em; line-height:1.3; }
    .pdf-stage .brand-text .subtitle .dot { display:inline-block; width:2px; height:2px; border-radius:50%; background:var(--zinc-300); vertical-align:middle; margin:0 6px 2px; }
    .pdf-stage .student { text-align:right; }
    .pdf-stage .student .name { font-size:20px; font-weight:700; color:var(--zinc-900); letter-spacing:-0.03em; line-height:1.15; }
    .pdf-stage .student .meta { font-size:10.5px; color:var(--zinc-500); margin-top:4px; letter-spacing:-0.01em; line-height:1.3; }
    .pdf-stage .student .meta .sep { display:inline-block; width:2px; height:2px; border-radius:50%; background:var(--zinc-300); vertical-align:middle; margin:0 6px 2px; }

    /* ── 섹션 헤더 (지원 대학) ─────────────────── */
    .pdf-stage .group-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; margin-top:2px; min-height:22px; flex:0 0 auto; }
    .pdf-stage .group-title { display:flex; align-items:center; gap:10px; color:var(--emerald-600); }
    .pdf-stage .group-dot { flex:0 0 auto; width:18px; height:18px; display:inline-flex; align-items:center; justify-content:center; position:relative; }
    .pdf-stage .group-dot::before { content:""; width:10px; height:10px; border-radius:50%; background:currentColor; display:block; }
    .pdf-stage .group-dot::after { content:""; position:absolute; top:50%; left:50%; width:18px; height:18px; margin-top:-9px; margin-left:-9px; border-radius:50%; border:1px solid currentColor; opacity:0.25; }
    .pdf-stage .group-name { font-size:15px; font-weight:700; color:var(--zinc-900); letter-spacing:-0.02em; line-height:1.15; display:inline-flex; align-items:center; }
    .pdf-stage .group-count { font-size:11px; color:var(--zinc-500); font-family:var(--pdf-font-mono); letter-spacing:-0.01em; line-height:1.15; display:inline-flex; align-items:center; }
    .pdf-stage .group-count::before { content:"·"; margin:0 6px; color:var(--zinc-300); font-family:var(--pdf-font-ko); line-height:1; font-size:14px; }
    .pdf-stage .group-range { font-family:var(--pdf-font-mono); font-size:10px; color:var(--zinc-400); letter-spacing:0.02em; }

    /* ── 지원 대학 테이블 ─────────────────── */
    .pdf-stage .apply-wrap { border:1px solid var(--hairline); border-radius:10px; overflow:hidden; background:#fff; flex:0 0 auto; }
    .pdf-stage .apply-table { width:100%; border-collapse:collapse; table-layout:fixed; }
    .pdf-stage .apply-table col.c-num { width:30px; }
    .pdf-stage .apply-table col.c-univ { width:130px; }
    .pdf-stage .apply-table col.c-grade { width:62px; }
    .pdf-stage .apply-table col.c-score { width:70px; }
    .pdf-stage .apply-table col.c-risk { width:64px; }
    .pdf-stage .apply-table th, .pdf-stage .apply-table td { padding:0 8px; text-align:center; vertical-align:middle; font-size:11px; border-bottom:1px solid var(--hairline); line-height:1.2; height:34px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pdf-stage .apply-table thead th { background:var(--zinc-50); color:var(--zinc-600); font-weight:600; font-size:10.5px; height:36px; letter-spacing:-0.01em; }
    .pdf-stage .apply-table th.l, .pdf-stage .apply-table td.l { text-align:left; }
    .pdf-stage .apply-table tbody tr:last-child td { border-bottom:0; }
    .pdf-stage .apply-table td.num { font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--zinc-400); }
    .pdf-stage .apply-table td.univ { font-weight:700; color:var(--zinc-900); font-size:11.5px; letter-spacing:-0.02em; }
    .pdf-stage .apply-table td.dept, .pdf-stage .apply-table td.type { color:var(--zinc-700); letter-spacing:-0.015em; }
    .pdf-stage .apply-table td.v { font-family:var(--pdf-font-mono); font-variant-numeric:tabular-nums; font-size:11.5px; font-weight:500; color:var(--zinc-800); }
    .pdf-stage .apply-table td.v.empty { color:var(--zinc-300); }
    .pdf-stage .apply-table td.v.total { font-weight:700; color:var(--emerald-600); font-size:12.5px; }
    .pdf-stage .apply-table td.risk .pill { display:inline-flex; align-items:center; justify-content:center; min-width:40px; height:21px; padding:0 9px; border-radius:6px; font-size:10.5px; font-weight:600; line-height:1; letter-spacing:-0.01em; }
    .pdf-stage .pill.stable { background:var(--emerald-50); color:var(--emerald-700); }
    .pdf-stage .pill.fit { background:var(--blue-50); color:var(--blue-700); }
    .pdf-stage .pill.reach { background:var(--amber-50); color:var(--amber-700); }
    .pdf-stage .pill.risky { background:var(--red-50); color:var(--red-700); }
    .pdf-stage .pill.unknown { background:var(--zinc-100); color:var(--zinc-400); font-weight:400; }

    .pdf-stage .page-footer { display:flex; justify-content:space-between; align-items:center; padding-top:10px; margin-top:auto; border-top:1px solid var(--hairline); font-size:9.5px; color:var(--zinc-400); letter-spacing:-0.005em; line-height:1.3; flex:0 0 auto; }
    .pdf-stage .page-footer .right { font-family:var(--pdf-font-mono); font-size:9px; letter-spacing:0.02em; }

    /* ── 표지 페이지 (정시엔진과 동일 골격) ─────────────────── */
    .pdf-stage .cover-page { width:297mm; height:210mm; background:#fcfcfb; padding:0; display:block; position:relative; overflow:hidden; }
    .pdf-stage .cover-page .cover-wm { position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:100; }
    .pdf-stage .cover-page .cover-wm-img { position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); width:720px; height:240px; opacity:0.06; object-fit:contain; }
    .pdf-stage .cover-page .cover-rule-top { position:absolute; left:56px; right:56px; top:56px; height:1px; background:var(--zinc-200); z-index:2; }
    .pdf-stage .cover-page .cover-rule-bot { position:absolute; left:56px; right:56px; bottom:56px; height:1px; background:var(--zinc-200); z-index:2; }
    .pdf-stage .cover-page .cover-header { position:absolute; top:32px; left:56px; right:56px; display:flex; align-items:center; justify-content:space-between; z-index:3; height:28px; }
    .pdf-stage .cover-page .cover-brand-lock { display:flex; align-items:center; gap:10px; }
    .pdf-stage .cover-page .cover-logo-img { height:24px; width:auto; object-fit:contain; }
    .pdf-stage .cover-page .cover-brand-wm { font-family:var(--pdf-font-en); font-weight:600; font-size:13px; letter-spacing:-0.01em; color:var(--zinc-900); }
    .pdf-stage .cover-page .cover-meta { font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--zinc-500); letter-spacing:0.02em; display:flex; gap:12px; align-items:center; white-space:nowrap; }
    .pdf-stage .cover-page .cover-meta .sep { color:var(--zinc-300); }
    .pdf-stage .cover-page .cover-footer { position:absolute; bottom:32px; left:56px; right:56px; display:flex; align-items:center; justify-content:space-between; z-index:3; font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--zinc-500); letter-spacing:0.02em; white-space:nowrap; }
    .pdf-stage .cover-page .cover-footer .page-num { color:var(--zinc-400); }
    .pdf-stage .cover-page .cover-grid { position:absolute; top:110px; bottom:110px; left:56px; right:56px; display:grid; grid-template-columns:1fr 1fr; gap:40px; z-index:2; }
    .pdf-stage .cover-page .cover-left { display:flex; flex-direction:column; justify-content:space-between; padding-right:12px; min-width:0; }
    .pdf-stage .cover-page .cover-eyebrow { font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--emerald-600); letter-spacing:0.22em; text-transform:uppercase; font-weight:500; display:flex; align-items:center; gap:10px; }
    .pdf-stage .cover-page .cover-eyebrow::before { content:""; width:18px; height:1.5px; background:var(--emerald-600); display:inline-block; }
    .pdf-stage .cover-page .cover-title-block { margin-top:28px; }
    .pdf-stage .cover-page .cover-doc-title { font-family:var(--pdf-font-ko); font-size:60px; font-weight:700; line-height:1.08; letter-spacing:-0.035em; color:#0a0a0a; padding-top:0.06em; }
    .pdf-stage .cover-page .cover-doc-title .stroke { color:var(--emerald-600); font-weight:700; }
    .pdf-stage .cover-page .cover-doc-sub { margin-top:22px; font-family:var(--pdf-font-ko); font-size:14px; line-height:1.6; color:var(--zinc-700); letter-spacing:-0.015em; max-width:100%; font-weight:400; word-break:keep-all; }
    .pdf-stage .cover-page .cover-doc-sub .q { color:var(--emerald-700); font-weight:500; }
    .pdf-stage .cover-page .cover-slogan { margin-top:28px; padding-left:14px; border-left:2px solid var(--emerald-600); font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-800); letter-spacing:-0.01em; line-height:1.5; word-break:keep-all; }
    .pdf-stage .cover-page .cover-left-bottom { display:grid; grid-template-columns:1fr 1fr; gap:28px; padding-top:20px; border-top:1px solid var(--zinc-200); }
    .pdf-stage .cover-page .cover-lb-item .label { font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--zinc-500); letter-spacing:0.18em; text-transform:uppercase; margin-bottom:8px; }
    .pdf-stage .cover-page .cover-lb-item .value { font-family:var(--pdf-font-ko); font-size:15px; color:#0a0a0a; font-weight:600; letter-spacing:-0.01em; }
    .pdf-stage .cover-page .cover-lb-item .value .en { font-family:var(--pdf-font-en); font-weight:500; }
    .pdf-stage .cover-page .cover-lb-item .value .tag { display:inline-block; font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--emerald-700); background:var(--emerald-50); padding:2px 6px; border-radius:3px; margin-left:6px; vertical-align:middle; font-weight:500; letter-spacing:0.04em; }
    .pdf-stage .cover-page .cover-right { display:flex; flex-direction:column; justify-content:center; padding-left:32px; border-left:1px solid var(--zinc-200); position:relative; min-width:0; }
    .pdf-stage .cover-page .cover-cert-eyebrow { font-family:var(--pdf-font-mono); font-size:10.5px; color:var(--zinc-500); letter-spacing:0.22em; text-transform:uppercase; font-weight:500; margin-bottom:18px; white-space:nowrap; }
    .pdf-stage .cover-page .cover-student-name-wrap { padding:2px 0 14px; }
    .pdf-stage .cover-page .cover-student-name { font-family:var(--pdf-font-ko); font-size:88px; font-weight:700; line-height:1.08; letter-spacing:-0.06em; color:#0a0a0a; padding-top:0.04em; padding-bottom:4px; }
    .pdf-stage .cover-page .cover-student-row { display:flex; gap:16px; margin-top:18px; padding-top:18px; border-top:1px solid var(--zinc-200); flex-wrap:wrap; }
    .pdf-stage .cover-page .cover-chip { font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-800); letter-spacing:-0.005em; font-weight:500; }
    .pdf-stage .cover-page .cover-chip .lbl { display:block; font-family:var(--pdf-font-mono); font-size:9px; color:var(--zinc-500); letter-spacing:0.16em; text-transform:uppercase; margin-bottom:4px; font-weight:500; }
    .pdf-stage .cover-page .cover-divider-dot { width:3px; height:3px; border-radius:50%; background:var(--zinc-300); align-self:center; margin-top:14px; }
    .pdf-stage .cover-page .cover-exam { margin-top:22px; padding:14px 16px; background:var(--zinc-50); border:1px solid var(--zinc-200); border-radius:4px; display:flex; align-items:center; gap:16px; position:relative; }
    .pdf-stage .cover-page .cover-exam::before { content:""; position:absolute; left:0; top:10px; bottom:10px; width:2px; background:var(--emerald-600); border-radius:2px; }
    .pdf-stage .cover-page .cover-exam .exam-label { font-family:var(--pdf-font-mono); font-size:9.5px; color:var(--zinc-500); letter-spacing:0.18em; text-transform:uppercase; min-width:60px; font-weight:500; }
    .pdf-stage .cover-page .cover-exam .exam-value { display:flex; align-items:baseline; gap:8px; }
    .pdf-stage .cover-page .cover-exam .year { font-family:var(--pdf-font-en); font-size:20px; font-weight:600; color:#0a0a0a; letter-spacing:-0.02em; }
    .pdf-stage .cover-page .cover-exam .year-ko { font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-700); font-weight:500; }
    .pdf-stage .cover-page .cover-exam .pipe { color:var(--zinc-300); }
    .pdf-stage .cover-page .cover-exam .mock { font-family:var(--pdf-font-ko); font-size:13px; color:var(--zinc-800); font-weight:500; }
    .pdf-stage .cover-page .cover-apps { margin-top:18px; display:grid; grid-template-columns:repeat(5,1fr); border:1px solid var(--zinc-200); border-radius:4px; overflow:hidden; }
    .pdf-stage .cover-page .cover-apps .col { padding:12px 8px; border-right:1px solid var(--zinc-200); text-align:center; background:#fff; }
    .pdf-stage .cover-page .cover-apps .col:last-child { border-right:none; }
    .pdf-stage .cover-page .cover-apps .col.total { background:var(--zinc-900); }
    .pdf-stage .cover-page .cover-apps .col.total .n { color:#fff; }
    .pdf-stage .cover-page .cover-apps .col.total .k { color:var(--zinc-400); }
    .pdf-stage .cover-page .cover-apps .col .k { font-family:var(--pdf-font-mono); font-size:9px; color:var(--zinc-500); letter-spacing:0.14em; text-transform:uppercase; font-weight:500; margin-bottom:5px; }
    .pdf-stage .cover-page .cover-apps .col .n { font-family:var(--pdf-font-en); font-size:24px; font-weight:600; color:#0a0a0a; letter-spacing:-0.02em; line-height:1; }
    .pdf-stage .cover-page .cover-apps .col .n sub { font-family:var(--pdf-font-en); font-size:11px; color:var(--zinc-400); font-weight:400; letter-spacing:0; margin-left:1px; vertical-align:baseline; }
    .pdf-stage .cover-page .cover-apps .col .u { font-family:var(--pdf-font-ko); font-size:10px; color:var(--zinc-500); margin-top:4px; font-weight:500; }
  `;

  // ── DOM 행 → PDF 데이터 수집 (대학/학과/전형 3콤보 완성 행만) ──
  function pdfCollectRows() {
    const rows = [];
    document.querySelectorAll('#collegeTable tbody.row-group').forEach(g => {
      const 대학명 = g._colCombo?.value || '';
      const 학과명 = g._majorCombo?.value || '';
      const 전형명 = g._typeCombo?.value || '';
      if (!대학명 || !학과명 || !전형명) return;
      const 합산점수 = g.querySelector('.합산점수')?.textContent?.trim() || '—';
      const 맥스컷 = g.querySelector('.max-cut')?.textContent?.trim() || '—';
      const 지점컷 = g.querySelector('.branch-cut')?.textContent?.trim() || '—';
      rows.push({
        대학명, 학과명, 전형명,
        내신등급: g.querySelector('.input-grade')?.value?.trim() || '',
        내신점수: g.querySelector('.input-score')?.value?.trim() || '',
        실기총점: g.querySelector('.input-total-score')?.textContent?.trim() || '—',
        합산점수, 맥스컷, 지점컷,
        risk: classifyRisk(합산점수, 맥스컷, 지점컷),
      });
    });
    return rows;
  }

  function pdfCell(v, cls) {
    const t = String(v == null ? '' : v).trim();
    const isEmpty = !t || t === '—';
    return `<td class="${cls}${isEmpty ? ' empty' : ''}">${isEmpty ? '—' : esc(t)}</td>`;
  }

  function pdfRenderCoverPage(student, stats, logoData, today) {
    const yearNum = window.SUSI_YEAR || '';
    const academyName = `맥스체대입시 ${student.branch || ''} 교육원`.trim();
    const wmHtml = logoData ? `<img class="cover-wm-img" src="${logoData}" alt="">` : '';
    const logoHtml = logoData ? `<img class="cover-logo-img" src="${logoData}" alt="맥스체대입시">` : '';
    return `
      <div class="page cover-page">
        <div class="cover-wm" aria-hidden="true">${wmHtml}</div>
        <div class="cover-rule-top"></div>
        <div class="cover-rule-bot"></div>
        <div class="cover-header">
          <div class="cover-brand-lock">
            ${logoHtml}
            <div class="cover-brand-wm">${esc(academyName)}</div>
          </div>
          <div class="cover-meta">
            <span>수시 상담 보고서</span>
            <span class="sep">/</span>
            <span>CONFIDENTIAL</span>
          </div>
        </div>
        <div class="cover-grid">
          <div class="cover-left">
            <div>
              <div class="cover-eyebrow">수시 상담 보고서 · ${esc(yearNum)}</div>
              <div class="cover-title-block">
                <h1 class="cover-doc-title">
                  체대 입시 합격,<br>
                  <span class="stroke">맥스</span>에서<br>
                  시작됩니다.
                </h1>
                <p class="cover-doc-sub">
                  학생 개인의 내신 성적과 실기 기록을 바탕으로
                  <span class="q">수시 지원 전략</span>을 수립한 1:1 맞춤 상담 자료입니다.
                </p>
              </div>
              <div class="cover-slogan">${esc(academyName)}</div>
            </div>
            <div class="cover-left-bottom">
              <div class="cover-lb-item">
                <div class="label">상담일</div>
                <div class="value"><span class="en">${today}</span></div>
              </div>
              <div class="cover-lb-item">
                <div class="label">대상 학년도</div>
                <div class="value">${esc(yearNum)}학년도 <span class="tag">수시</span></div>
              </div>
            </div>
          </div>
          <div class="cover-right">
            <div class="cover-cert-eyebrow"><span>상담 대상</span></div>
            <div class="cover-student-name-wrap">
              <div class="cover-student-name">${esc(student.name)}</div>
            </div>
            <div class="cover-student-row">
              <div class="cover-chip"><span class="lbl">지점</span>${esc(student.branch || '—')}</div>
              <div class="cover-divider-dot"></div>
              <div class="cover-chip"><span class="lbl">학년</span>${esc(student.grade)}</div>
              <div class="cover-divider-dot"></div>
              <div class="cover-chip"><span class="lbl">성별</span>${esc(student.gender)}</div>
              <div class="cover-divider-dot"></div>
              <div class="cover-chip"><span class="lbl">계열</span>수시</div>
            </div>
            <div class="cover-exam">
              <div class="exam-label">상담 기준</div>
              <div class="exam-value">
                <span class="year">${esc(yearNum)}</span>
                <span class="year-ko">학년도</span>
                <span class="pipe">│</span>
                <span class="mock">수시 지원 ${stats.total}개 전형</span>
              </div>
            </div>
            <div class="cover-apps">
              <div class="col"><div class="k">안정</div><div class="n">${stats.stable}</div><div class="u">개 전형</div></div>
              <div class="col"><div class="k">적정</div><div class="n">${stats.fit}</div><div class="u">개 전형</div></div>
              <div class="col"><div class="k">소신</div><div class="n">${stats.reach}</div><div class="u">개 전형</div></div>
              <div class="col"><div class="k">위험</div><div class="n">${stats.risky}</div><div class="u">개 전형</div></div>
              <div class="col total"><div class="k">합계</div><div class="n">${stats.total}<sub>개</sub></div><div class="u">총 지원</div></div>
            </div>
          </div>
        </div>
        <div class="cover-footer">
          <div>${esc(academyName)}</div>
          <div class="page-num">표지 — 01 / 01</div>
        </div>
      </div>
    `;
  }

  function pdfRenderHeader(student, logoData) {
    const logoHtml = logoData ? `<img class="logo-img" src="${logoData}" alt="맥스수시">` : '';
    return `
      <div class="page-header">
        <div class="brand">
          ${logoHtml}
          <div class="brand-text">
            <div class="title">맥스수시 · 수시 상담 자료</div>
            <div class="subtitle">
              <span>${esc(student.year)}</span><span class="dot"></span><span>${esc(student.branch || '')} 교육원</span>
            </div>
          </div>
        </div>
        <div class="student">
          <div class="name">${esc(student.name)}</div>
          <div class="meta">
            <span>${esc(student.grade)}</span>
            <span class="sep"></span><span>${esc(student.gender)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function pdfRenderTablePage(rows, startIdx, totalRows, pageIdx, totalPages, student, logoData, dateStr) {
    const watermark = logoData ? `<img class="watermark-img" src="${logoData}" alt="">` : '';
    const bodyRows = rows.map((r, i) => `
      <tr>
        <td class="num">${String(startIdx + i + 1).padStart(2, '0')}</td>
        <td class="univ l">${esc(r.대학명)}</td>
        <td class="dept l">${esc(r.학과명)}</td>
        <td class="type l">${esc(r.전형명)}</td>
        ${pdfCell(r.내신등급, 'v')}
        ${pdfCell(r.내신점수, 'v')}
        ${pdfCell(r.실기총점, 'v')}
        ${pdfCell(r.합산점수, 'v total')}
        ${pdfCell(r.맥스컷, 'v')}
        ${pdfCell(r.지점컷, 'v')}
        <td class="risk"><span class="pill ${r.risk}">${RISK_LABEL[r.risk] || '—'}</span></td>
      </tr>
    `).join('');
    return `
      <div class="page">
        ${watermark}
        ${pdfRenderHeader(student, logoData)}
        <div class="group-header">
          <div class="group-title">
            <div class="group-dot"></div>
            <div class="group-name">지원 대학</div>
            <div class="group-count">${totalRows}개 전형</div>
          </div>
          <div class="group-range">${startIdx + 1}–${startIdx + rows.length} / ${totalRows}</div>
        </div>
        <div class="apply-wrap">
          <table class="apply-table">
            <colgroup>
              <col class="c-num"><col class="c-univ"><col><col>
              <col class="c-grade"><col class="c-score"><col class="c-score"><col class="c-score">
              <col class="c-score"><col class="c-score"><col class="c-risk">
            </colgroup>
            <thead>
              <tr>
                <th>#</th><th class="l">대학명</th><th class="l">학과명</th><th class="l">전형명</th>
                <th>내신등급</th><th>내신점수</th><th>실기총점</th><th>합산점수</th>
                <th>맥스컷</th><th>지점컷</th><th>판정</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
        <div class="page-footer">
          <div class="left">맥스수시 · 본 상담 자료는 참고용이며, 실제 합격 여부는 당해 입시 결과에 따라 달라질 수 있습니다.</div>
          <div class="right">${pageIdx}/${totalPages} · 생성일 ${dateStr}</div>
        </div>
      </div>
    `;
  }

  async function downloadPDF() {
    const studentId = getSelectedStudentId();
    if (!studentId) {
      window.showToast('먼저 학생을 선택해주세요', 'warn');
      return;
    }
    const rows = pdfCollectRows();
    if (!rows.length) {
      window.showToast('지원 대학을 먼저 추가해주세요', 'warn');
      return;
    }
    const btn = document.getElementById('btnPdf');
    if (btn) btn.disabled = true;
    showLoading('PDF 문서를 만들고 있어요');
    try {
      const s = studentMap[studentId];
      const student = {
        name: s.이름 || '-',
        grade: s.학년 ? `고${s.학년}` : '—',
        gender: s.성별 || '—',
        branch: s.지점명 || branchName || '',
        year: `${window.SUSI_YEAR}학년도`,
      };
      const stats = { stable: 0, fit: 0, reach: 0, risky: 0, unknown: 0, total: rows.length };
      rows.forEach(r => { stats[r.risk] = (stats[r.risk] || 0) + 1; });

      let logoData = null;
      try { logoData = await toBase64('25max.png'); } catch (_) {}

      const now = new Date();
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;

      const totalPages = Math.ceil(rows.length / PDF_ROWS_PER_PAGE);
      let pagesHtml = pdfRenderCoverPage(student, stats, logoData, dateStr);
      for (let p = 0; p < totalPages; p++) {
        pagesHtml += pdfRenderTablePage(
          rows.slice(p * PDF_ROWS_PER_PAGE, (p + 1) * PDF_ROWS_PER_PAGE),
          p * PDF_ROWS_PER_PAGE, rows.length, p + 1, totalPages, student, logoData, dateStr
        );
      }
      const fileBase = `맥스수시_상담지_${student.name}_${window.SUSI_YEAR}학년도`;

      /* ─── 1) 서버 사이드 Puppeteer 렌더 시도 (고품질) ─── */
      try {
        const fullHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style>${PDF_CSS}</style>
<style>html,body{margin:0;padding:0;background:#fff;}
.pdf-stage{display:block;}
.pdf-stage .page{page-break-after:always;break-after:page;}
.pdf-stage .page:last-child{page-break-after:auto;break-after:auto;}
@page{size:A4 landscape;margin:0;}</style>
</head><body><div class="pdf-stage">${pagesHtml}</div></body></html>`;

        const blob = await window.apiBinary('/counseling/render-pdf', {
          method: 'POST',
          body: JSON.stringify({ html: fullHtml, filename: fileBase }),
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileBase + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        window.showToast(`PDF 저장 완료 (${totalPages + 1}페이지)`, 'success');
        return;
      } catch (serverErr) {
        console.warn('[PDF] 서버 렌더 실패, 로컬 폴백:', serverErr && serverErr.message);
        window.showToast('서버 렌더 실패, 로컬 생성 중…', 'info');
      }

      /* ─── 2) Fallback: 로컬 html2canvas + jsPDF (서버 장애 대비) ─── */
      const stage = document.createElement('div');
      stage.className = 'pdf-stage';
      stage.style.cssText = 'position:absolute; left:-99999px; top:0; background:#ffffff; overflow:visible;';
      stage.innerHTML = `<style>${PDF_CSS}</style>` + pagesHtml;
      document.body.appendChild(stage);

      await document.fonts.ready.catch(() => {});
      const imgs = stage.querySelectorAll('img');
      await Promise.all([...imgs].map(img => new Promise(r => {
        if (img.complete && img.naturalWidth > 0) r();
        else { img.onload = r; img.onerror = r; setTimeout(r, 3000); }
      })));
      await new Promise(r => setTimeout(r, 200));

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pages = stage.querySelectorAll('.page');
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i];
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const canvas = await html2canvas(el, {
          scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          width: w, height: h, windowWidth: w, windowHeight: h,
          scrollX: 0, scrollY: 0, x: 0, y: 0,
        });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage('a4', 'landscape');
        pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
      }
      stage.remove();
      pdf.save(fileBase + '.pdf');
      window.showToast(`PDF 저장 완료 (${totalPages + 1}페이지, 로컬)`, 'success');
    } catch (error) {
      console.error('PDF 생성 오류:', error);
      window.showToast('PDF 생성 중 문제가 발생했습니다: ' + error.message, 'error');
    } finally {
      hideLoading();
      if (btn) btn.disabled = false;
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
