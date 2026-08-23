const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');

test('학생 학교명은 수시 학생 응답의 학교명 필드를 우선 사용한다', () => {
  const feature = require('../counsel-student-school.js');

  assert.equal(feature.getStudentSchool({ 학교명: '백신고등학교', school: 'legacy' }), '백신고등학교');
  assert.equal(feature.getStudentSchool({ 고교명: '일산동고' }), '일산동고');
  assert.equal(feature.getStudentSchool({ school: '주엽고' }), '주엽고');
  assert.equal(feature.getStudentSchool({ 학교명: '   ' }), '');
  assert.equal(feature.getStudentSchool(null), '');
});

test('상담 PDF HTML의 표지와 상세 페이지에 이스케이프된 학교명을 넣는다', () => {
  const feature = require('../counsel-student-school.js');
  const source = [
    '<div class="cover-student-row"><div class="cover-chip">기존</div></div>',
    '<div class="student"><div class="meta"><span>고3</span></div></div>',
  ].join('');

  const decorated = feature.addSchoolToPdfHtml(source, '백신고 & <본교>');

  assert.match(decorated, /counsel-pdf-school/);
  assert.match(decorated, /<span class="lbl">학교<\/span>백신고 &amp; &lt;본교&gt;/);
  assert.match(decorated, /백신고 &amp; &lt;본교&gt;<\/span><span class="sep"><\/span><span>고3/);
  assert.equal((decorated.match(/counsel-pdf-school/g) || []).length, 2);
  assert.equal(feature.addSchoolToPdfHtml(decorated, '다른학교'), decorated);
});

test('서버 PDF 요청 본문에만 학교명을 반영하고 다른 요청은 보존한다', () => {
  const feature = require('../counsel-student-school.js');
  const body = JSON.stringify({ html: '<div class="cover-student-row"></div>', filename: '상담지' });

  const changed = feature.addSchoolToPdfRequestBody(body, '백신고');
  const parsed = JSON.parse(changed);

  assert.match(parsed.html, /백신고/);
  assert.equal(parsed.filename, '상담지');
  assert.equal(feature.addSchoolToPdfRequestBody(body, ''), body);
  assert.equal(feature.addSchoolToPdfRequestBody('not-json', '백신고'), 'not-json');
});

test('학생 선택 시 화면과 서버 PDF 요청이 같은 학교명으로 갱신된다', async () => {
  const feature = require('../counsel-student-school.js');
  const schoolElement = { textContent: '' };
  let studentOnChange;
  let originalOnChangeValue = '';
  const root = {
    api: async () => ({ success: true, students: [{ 학생ID: 7, 이름: '홍길동', 학교명: '백신고' }] }),
    apiBinary: async (requestPath, options) => ({ requestPath, options }),
    createCombobox: (container, options) => {
      studentOnChange = options.onChange;
      return { value: '' };
    },
    document: {
      body: null,
      getElementById: (id) => id === 'pSchool' ? schoolElement : null,
    },
  };

  feature.install(root);
  await root.api('_student_list');
  root.createCombobox({ id: 'studentCombo' }, {
    onChange: (value) => { originalOnChangeValue = value; },
  });
  studentOnChange('7');

  assert.equal(originalOnChangeValue, '7');
  assert.equal(schoolElement.textContent, '백신고');

  const result = await root.apiBinary('/counseling/render-pdf', {
    body: JSON.stringify({ html: '<div class="cover-student-row"></div>' }),
  });
  assert.match(JSON.parse(result.options.body).html, /백신고/);
});

test('개인상담 화면은 학교 표시 영역과 전용 모듈을 상담 본체보다 먼저 로드한다', () => {
  const page = fs.readFileSync(path.join(ROOT, 'counsel.html'), 'utf8');
  const schoolScript = page.indexOf('counsel-student-school.js');
  const counselScript = page.indexOf('counsel.js');

  assert.match(page, /id="pSchool"/);
  assert.ok(schoolScript >= 0);
  assert.ok(counselScript > schoolScript);
});
