/* Full catalog visibility without inventing students or admission results. */
(function () {
  'use strict';

  window.mergePassResultCatalog = function (colleges, summaries) {
    var byId = new Map();
    colleges.forEach(function (college) {
      byId.set(String(college.대학ID), Object.assign({}, college, { 학생들: [] }));
    });
    summaries.forEach(function (summary) {
      var id = String(summary.대학ID);
      byId.set(id, Object.assign({}, byId.get(id), summary));
    });
    return Array.from(byId.values()).sort(function (a, b) {
      return String(a.대학명).localeCompare(String(b.대학명), 'ko')
        || String(a.학과명).localeCompare(String(b.학과명), 'ko')
        || String(a.전형명).localeCompare(String(b.전형명), 'ko');
    });
  };
})();
