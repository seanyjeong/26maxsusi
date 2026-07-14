(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SusiCompetitionRate = api;
  if (root && root.document) {
    api.startLegacyLabelObserver(root.document, function () { return root.SUSI_YEAR || '27'; });
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function selectedYear(value) {
    var text = String(value == null ? '' : value).trim();
    if (text === '26') return 2026;
    if (text === '27') return 2027;
    var number = Number(text);
    return number === 2026 || number === 2027 ? number : null;
  }

  function numberValue(value) {
    if (value == null || value === '') return null;
    var normalized = String(value).replace(/,/g, '').replace(/:1$/, '').trim();
    var number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  }

  function getPreviousCompetition(record, admissionYear) {
    if (!record || typeof record !== 'object') return null;
    var currentYear = selectedYear(admissionYear);
    var year = numberValue(record.전년도학년도);
    var quota = numberValue(record.전년도모집인원);
    var applicants = numberValue(record.전년도지원자수);
    var rate = numberValue(record.전년도경쟁률);
    if (
      !currentYear || year !== currentYear - 1 ||
      !Number.isInteger(quota) || quota <= 0 ||
      !Number.isInteger(applicants) || applicants < 0 ||
      rate == null || rate < 0
    ) return null;
    return {
      year: year,
      quota: quota,
      applicants: applicants,
      rate: rate,
      scope: record.전년도경쟁률범위 || null,
    };
  }

  function formatCount(value) {
    return new Intl.NumberFormat('ko-KR').format(value);
  }

  function formatRate(value) {
    return Number(value).toFixed(2) + ':1';
  }

  function summary(record, admissionYear) {
    var data = getPreviousCompetition(record, admissionYear);
    if (!data) return null;
    return {
      label: data.year + '학년도 경쟁률',
      compactLabel: String(data.year).slice(-2) + ' 경쟁률',
      value: formatRate(data.rate),
      meta: '모집 ' + formatCount(data.quota) + '명 · 지원 ' + formatCount(data.applicants) + '명',
      scope: data.scope,
    };
  }

  function render(record, admissionYear, options) {
    options = options || {};
    var data = summary(record, admissionYear);
    if (!data) {
      return '<span class="competition-rate-empty">전년도 경쟁률 자료 없음</span>';
    }
    var label = options.compact ? data.compactLabel : data.label;
    var scope = data.scope
      ? '<span class="competition-rate-scope">' + escapeHtml(data.scope) + '</span>'
      : '';
    return '<span class="competition-rate" title="' + escapeHtml(data.label + ' · ' + data.meta) + '">'
      + '<span class="competition-rate-label">' + escapeHtml(label) + '</span>'
      + '<strong>' + escapeHtml(data.value) + '</strong>'
      + (options.hideMeta ? '' : '<small>' + escapeHtml(data.meta) + '</small>')
      + scope
      + '</span>';
  }

  function adaptUniversityDetails(details, admissionYear) {
    var adapted = Object.assign({}, details || {});
    var data = getPreviousCompetition(adapted, admissionYear);
    adapted['25정원'] = data ? formatCount(data.quota) + '명' : null;
    adapted['25경쟁률'] = data
      ? formatRate(data.rate) + ' · 지원 ' + formatCount(data.applicants) + '명'
      : null;
    adapted._previousCompetitionYear = data ? data.year : null;
    return adapted;
  }

  function relabelLegacy(rootNode, admissionYear) {
    if (!rootNode || typeof rootNode.querySelectorAll !== 'function') return;
    var year = selectedYear(admissionYear);
    if (!year) return;
    var previous = year - 1;
    rootNode.querySelectorAll('.info-row .k').forEach(function (label) {
      if (label.textContent === '25학년도 정원') label.textContent = previous + '학년도 정원';
      if (label.textContent === '25학년도 경쟁률') label.textContent = previous + '학년도 경쟁률';
    });
  }

  function startLegacyLabelObserver(documentNode, yearProvider) {
    if (!documentNode || typeof MutationObserver === 'undefined') return null;
    var apply = function () { relabelLegacy(documentNode, yearProvider()); };
    var start = function () {
      apply();
      var observer = new MutationObserver(apply);
      observer.observe(documentNode.documentElement, { childList: true, subtree: true });
      return observer;
    };
    if (documentNode.readyState === 'loading') {
      documentNode.addEventListener('DOMContentLoaded', start, { once: true });
      return null;
    }
    return start();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    adaptUniversityDetails: adaptUniversityDetails,
    formatRate: formatRate,
    getPreviousCompetition: getPreviousCompetition,
    relabelLegacy: relabelLegacy,
    render: render,
    selectedYear: selectedYear,
    startLegacyLabelObserver: startLegacyLabelObserver,
    summary: summary,
  };
});
