/* ============================================================
 * silgi_review.js — 실기장 후기 (구글시트 "맥스 후기" 캐시)
 * 공용 api()/showToast()/createCombobox()/escapeHtml() 사용.
 * 흐름: 연도 목록 로드 → 학년도/전형 선택 → 후기 로드 → 대학/검색 필터 (클라이언트)
 * ============================================================ */

(function () {
  'use strict';

  var escape = window.escapeHtml;

  var state = {
    years: [],        // [{학년도, 전형, 건수}]
    year: null,
    type: null,
    reviews: [],
    univ: '',
    query: '',
  };
  var univCombo = null;

  var META_FIELDS = ['학과명', '학년', '시험형태', '입실시간', '날씨', '지점'];
  var EXTRA_FIELDS = [
    ['면접유무', '면접'], ['면접난이도', '면접 난이도'], ['면접질문', '면접 질문'],
    ['면접대기분위기', '대기 분위기'], ['꼬리질문', '꼬리 질문'],
    ['직책', '직책'], ['연차', '체대입시 연차'], ['실기분위기', '실기장 분위기'],
    ['측정특이점', '측정 방법 특이점'], ['주의점', '내년 지원 시 주의점'],
  ];

  function isAdminUser() {
    var info = (window.getCounselorFromToken && window.getCounselorFromToken()) || {};
    return info.userid === 'admin' || info.role === 'admin';
  }

  function renderSyncMeta(sync) {
    var el = document.getElementById('syncMeta');
    if (!el || !sync) return;
    if (sync.lastError) {
      el.textContent = '동기화 실패 · 이전 캐시 표시 중';
      el.classList.add('error');
      return;
    }
    el.classList.remove('error');
    el.textContent = sync.lastSyncAt
      ? '동기화 ' + window.formatRelative(sync.lastSyncAt) + ' · ' + sync.rowCount.toLocaleString() + '건'
      : '첫 동기화 대기 중';
  }

  /* ---------- 학년도 / 전형 ---------- */
  function yearsOf() {
    var seen = {};
    return state.years.filter(function (y) {
      if (seen[y.학년도]) return false;
      seen[y.학년도] = true;
      return true;
    }).map(function (y) { return y.학년도; }).sort(function (a, b) { return b - a; });
  }
  function countOf(year, type) {
    var hit = state.years.filter(function (y) { return y.학년도 === year && y.전형 === type; })[0];
    return hit ? hit.건수 : 0;
  }

  function renderYearButtons() {
    var box = document.getElementById('yearButtons');
    box.innerHTML = '';
    yearsOf().forEach(function (y) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn' + (y === state.year ? ' active' : '');
      btn.dataset.value = y;
      btn.textContent = y + '학년도';
      btn.addEventListener('click', function () { selectYear(y); });
      box.appendChild(btn);
    });
  }

  function renderTypeButtons() {
    document.querySelectorAll('#typeButtons .filter-btn').forEach(function (btn) {
      var t = btn.dataset.value;
      var n = countOf(state.year, t);
      btn.disabled = n === 0;
      btn.classList.toggle('active', t === state.type);
      btn.innerHTML = escape(t) + (n ? '<span class="count">' + n.toLocaleString() + '</span>' : '');
    });
  }

  function selectYear(y) {
    state.year = y;
    if (countOf(y, state.type) === 0) state.type = countOf(y, '수시') ? '수시' : '정시';
    renderYearButtons();
    renderTypeButtons();
    loadReviews();
  }

  function selectType(t) {
    if (t === state.type || countOf(state.year, t) === 0) return;
    state.type = t;
    renderTypeButtons();
    loadReviews();
  }

  /* ---------- 후기 로드 / 필터 ---------- */
  async function loadReviews() {
    var list = document.getElementById('reviewList');
    list.innerHTML = '<div class="placeholder">로딩중...</div>';
    try {
      var data = await window.api('/silgi-reviews?year=' + state.year + '&type=' + encodeURIComponent(state.type));
      state.reviews = (data && data.reviews) || [];
      renderSyncMeta(data && data.sync);
      state.univ = '';
      refreshUnivOptions();
      render();
    } catch (e) {
      console.error('[loadReviews]', e);
      list.innerHTML = '<div class="placeholder">후기를 불러오지 못했습니다.</div>';
    }
  }

  function refreshUnivOptions() {
    var counts = {};
    state.reviews.forEach(function (r) { counts[r.대학명] = (counts[r.대학명] || 0) + 1; });
    var opts = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, 'ko'); })
      .map(function (u) { return { value: u, label: u, meta: counts[u] + '건' }; });
    opts.unshift({ value: '', label: '전체 대학', meta: state.reviews.length + '건' });
    univCombo.setOptions(opts);
    univCombo.setValue('');
  }

  function matches(r) {
    if (state.univ && r.대학명 !== state.univ) return false;
    if (!state.query) return true;
    var q = state.query;
    return ['후기', '조언', '학과명', '대학명'].some(function (k) {
      return r[k] && r[k].toLowerCase().indexOf(q) !== -1;
    });
  }

  function render() {
    var list = document.getElementById('reviewList');
    var meta = document.getElementById('headMeta');
    var rows = state.reviews.filter(matches);
    if (meta) {
      meta.textContent = state.year + '학년도 ' + state.type + ' · ' + rows.length.toLocaleString() + '건'
        + (rows.length !== state.reviews.length ? ' / ' + state.reviews.length.toLocaleString() + '건' : '');
    }
    if (!rows.length) {
      list.innerHTML = '<div class="placeholder">'
        + (state.reviews.length ? '조건에 맞는 후기가 없습니다.' : '등록된 후기가 없습니다.') + '</div>';
      return;
    }
    var groups = [];
    var byUniv = {};
    rows.forEach(function (r) {
      if (!byUniv[r.대학명]) {
        byUniv[r.대학명] = { name: r.대학명, items: [], depts: {} };
        groups.push(byUniv[r.대학명]);
      }
      byUniv[r.대학명].items.push(r);
      if (r.학과명) byUniv[r.대학명].depts[r.학과명] = true;
    });
    groups.sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    list.innerHTML = groups.map(renderGroup).join('');
  }

  function renderGroup(g) {
    return '<section class="univ-group">'
      + '<div class="univ-head">'
      + '<span class="name">' + escape(g.name) + '</span>'
      + '<span class="depts">' + escape(Object.keys(g.depts).join(' · ')) + '</span>'
      + '<span class="badge ok">' + g.items.length + '건</span>'
      + '</div>'
      + g.items.map(renderCard).join('')
      + '</section>';
  }

  function renderCard(r) {
    var chips = META_FIELDS.filter(function (k) { return r[k]; })
      .map(function (k) { return '<span class="chip">' + escape(r[k]) + '</span>'; }).join('');
    var date = r.작성일시 ? window.formatDateKo(r.작성일시) : '';
    var advice = r.조언
      ? '<div class="review-advice"><span class="label">후배들에게</span>' + escape(r.조언) + '</div>'
      : '';
    var extras = EXTRA_FIELDS.filter(function (f) { return r[f[0]]; });
    var extra = extras.length
      ? '<details class="review-extra"><summary>면접 · 인솔자 상세 ' + extras.length + '항목</summary><dl>'
        + extras.map(function (f) { return '<dt>' + escape(f[1]) + '</dt><dd>' + escape(r[f[0]]) + '</dd>'; }).join('')
        + '</dl></details>'
      : '';
    var author = [r.성명, r.출신고].filter(Boolean).join(' · ');
    return '<article class="review-card">'
      + '<div class="review-meta">' + chips + (date ? '<span class="date">' + date + '</span>' : '') + '</div>'
      + '<div class="review-body">' + escape(r.후기 || '') + '</div>'
      + advice + extra
      + (author ? '<div class="review-author">' + escape(author) + '</div>' : '')
      + '</article>';
  }

  /* ---------- 동기화 버튼 (관리자) ---------- */
  async function syncNow() {
    var btn = document.getElementById('btnSync');
    btn.disabled = true;
    try {
      var data = await window.api('/silgi-reviews/sync', { method: 'POST' });
      renderSyncMeta(data && data.sync);
      window.showToast('시트 동기화 완료', 'success');
      await loadYears();
      await loadReviews();
    } catch (e) {
      window.showToast(e.message || '동기화 실패', 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- 후기 참여 링크 복사 ---------- */
  async function copyShareLink() {
    var url = document.getElementById('shareUrl').href;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        var ta = document.createElement('textarea');
        ta.value = url;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      window.showToast('후기 참여 링크가 복사되었습니다', 'success');
    } catch (e) {
      console.error('[copyShareLink]', e);
      window.showToast('복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.', 'error');
    }
  }

  /* ---------- 초기화 ---------- */
  async function loadYears() {
    var data = await window.api('/silgi-reviews/years');
    state.years = (data && data.years) || [];
    renderSyncMeta(data && data.sync);
  }

  async function init() {
    if (!window.getToken()) {
      location.href = 'login.html';
      return;
    }
    univCombo = window.createCombobox(document.getElementById('univCombo'), {
      options: [{ value: '', label: '전체 대학' }],
      value: '',
      placeholder: '전체 대학',
      searchPlaceholder: '대학명 검색…',
      onChange: function (v) { state.univ = v; render(); },
    });
    document.getElementById('searchInput').addEventListener('input', window.debounce(function (e) {
      state.query = e.target.value.trim().toLowerCase();
      render();
    }, 200));
    document.querySelectorAll('#typeButtons .filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { selectType(btn.dataset.value); });
    });
    document.getElementById('btnCopyLink').addEventListener('click', copyShareLink);
    if (isAdminUser()) {
      var btn = document.getElementById('btnSync');
      btn.hidden = false;
      btn.addEventListener('click', syncNow);
    }

    try {
      await loadYears();
    } catch (e) {
      console.error('[loadYears]', e);
      document.getElementById('reviewList').innerHTML = '<div class="placeholder">후기 목록을 불러오지 못했습니다.</div>';
      return;
    }
    var years = yearsOf();
    if (!years.length) {
      document.getElementById('reviewList').innerHTML = '<div class="placeholder">아직 동기화된 후기가 없습니다.</div>';
      return;
    }
    selectYear(years[0]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
