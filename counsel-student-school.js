(function (root, factory) {
  'use strict';

  var feature = factory();
  if (typeof module === 'object' && module.exports) module.exports = feature;
  if (root && root.document) {
    root.CounselStudentSchool = feature;
    feature.install(root);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeHtml(value) {
    return cleanText(value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character];
    });
  }

  function getStudentSchool(student) {
    if (!student || typeof student !== 'object') return '';
    return cleanText(
      student.학교명 || student.고교명 || student.school || student.school_name
    );
  }

  function addSchoolToPdfHtml(html, school) {
    var source = String(html == null ? '' : html);
    var schoolName = cleanText(school);
    if (!schoolName || source.indexOf('counsel-pdf-school') !== -1) return source;

    var safeSchool = escapeHtml(schoolName);
    var coverSchool = '<div class="cover-chip counsel-pdf-school">' +
      '<span class="lbl">학교</span>' + safeSchool + '</div>' +
      '<div class="cover-divider-dot"></div>';
    var detailSchool = '<span class="counsel-pdf-school">' + safeSchool + '</span>' +
      '<span class="sep"></span>';

    source = source.replace(
      '<div class="cover-student-row">',
      '<div class="cover-student-row">' + coverSchool
    );
    return source.split('<div class="meta">').join('<div class="meta">' + detailSchool);
  }

  function addSchoolToPdfRequestBody(body, school) {
    if (!cleanText(school) || typeof body !== 'string') return body;
    try {
      var payload = JSON.parse(body);
      if (!payload || typeof payload.html !== 'string') return body;
      payload.html = addSchoolToPdfHtml(payload.html, school);
      return JSON.stringify(payload);
    } catch (_) {
      return body;
    }
  }

  function appendCoverSchool(row, school, documentRef) {
    if (row.querySelector('.counsel-pdf-school')) return;
    var chip = documentRef.createElement('div');
    chip.className = 'cover-chip counsel-pdf-school';
    var label = documentRef.createElement('span');
    label.className = 'lbl';
    label.textContent = '학교';
    chip.appendChild(label);
    chip.appendChild(documentRef.createTextNode(school));

    var divider = documentRef.createElement('div');
    divider.className = 'cover-divider-dot';
    row.insertBefore(divider, row.firstChild);
    row.insertBefore(chip, divider);
  }

  function prependDetailSchool(meta, school, documentRef) {
    if (meta.querySelector('.counsel-pdf-school')) return;
    var value = documentRef.createElement('span');
    value.className = 'counsel-pdf-school';
    value.textContent = school;
    var separator = documentRef.createElement('span');
    separator.className = 'sep';
    meta.insertBefore(separator, meta.firstChild);
    meta.insertBefore(value, separator);
  }

  function decoratePdfStage(stage, school, documentRef) {
    var schoolName = cleanText(school);
    if (!stage || !schoolName || !documentRef || !stage.querySelectorAll) return;
    stage.querySelectorAll('.cover-student-row').forEach(function (row) {
      appendCoverSchool(row, schoolName, documentRef);
    });
    stage.querySelectorAll('.page-header .student .meta').forEach(function (meta) {
      prependDetailSchool(meta, schoolName, documentRef);
    });
  }

  function observePdfStages(root, getSchool) {
    if (!root.MutationObserver || !root.document.body) return null;
    var observer = new root.MutationObserver(function (records) {
      records.forEach(function (record) {
        Array.prototype.forEach.call(record.addedNodes || [], function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches('.pdf-stage')) {
            decoratePdfStage(node, getSchool(), root.document);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('.pdf-stage').forEach(function (stage) {
              decoratePdfStage(stage, getSchool(), root.document);
            });
          }
        });
      });
    });
    observer.observe(root.document.body, { childList: true, subtree: true });
    return observer;
  }

  function install(root) {
    if (!root || !root.document || root.__counselStudentSchoolInstalled) return;
    root.__counselStudentSchoolInstalled = true;

    var studentsById = Object.create(null);
    var selectedStudentId = '';
    var originalApi = root.api;
    var originalApiBinary = root.apiBinary;
    var originalCreateCombobox = root.createCombobox;

    function selectedStudent() {
      return studentsById[selectedStudentId] || null;
    }

    function selectedSchool() {
      return getStudentSchool(selectedStudent());
    }

    function renderSchool() {
      var element = root.document.getElementById('pSchool');
      if (!element) return;
      var school = selectedSchool();
      element.textContent = selectedStudentId ? (school || '학교 정보 없음') : '—';
    }

    if (typeof originalApi === 'function') {
      root.api = async function (path, options) {
        var response = await originalApi.call(root, path, options);
        if (String(path).indexOf('_student_list') !== -1 && response && Array.isArray(response.students)) {
          response.students.forEach(function (student) {
            studentsById[String(student.학생ID)] = student;
          });
        }
        return response;
      };
    }

    if (typeof originalCreateCombobox === 'function') {
      root.createCombobox = function (container, options) {
        if (!container || container.id !== 'studentCombo') {
          return originalCreateCombobox.call(root, container, options);
        }
        var nextOptions = Object.assign({}, options || {});
        var originalOnChange = nextOptions.onChange;
        nextOptions.onChange = function (value, option) {
          selectedStudentId = cleanText(value);
          renderSchool();
          if (typeof originalOnChange === 'function') originalOnChange(value, option);
        };
        return originalCreateCombobox.call(root, container, nextOptions);
      };
    }

    if (typeof originalApiBinary === 'function') {
      root.apiBinary = function (path, options) {
        var nextOptions = options;
        if (path === '/counseling/render-pdf' && options && selectedSchool()) {
          nextOptions = Object.assign({}, options, {
            body: addSchoolToPdfRequestBody(options.body, selectedSchool()),
          });
        }
        return originalApiBinary.call(root, path, nextOptions);
      };
    }

    observePdfStages(root, selectedSchool);
    renderSchool();
  }

  return {
    addSchoolToPdfHtml: addSchoolToPdfHtml,
    addSchoolToPdfRequestBody: addSchoolToPdfRequestBody,
    decoratePdfStage: decoratePdfStage,
    getStudentSchool: getStudentSchool,
    install: install,
  };
});
