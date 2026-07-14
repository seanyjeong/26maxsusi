const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const competition = require('../assets/js/competition-rate.js');

const ROOT = path.join(__dirname, '..');

function details(year = 2026) {
  return {
    전년도학년도: year,
    전년도모집인원: 40,
    전년도지원자수: 2364,
    전년도경쟁률: '59.10',
    전년도경쟁률범위: null,
    '25정원': '오래된 정원',
    '25경쟁률': '오래된 경쟁률',
  };
}

test('selected admission year exposes only its immediately previous year', () => {
  assert.deepEqual(competition.getPreviousCompetition(details(2026), '27'), {
    year: 2026,
    quota: 40,
    applicants: 2364,
    rate: 59.1,
    scope: null,
  });
  assert.equal(competition.getPreviousCompetition(details(2025), '27'), null);
  assert.equal(competition.getPreviousCompetition(details(2026), '26'), null);
});

test('formatter shows a Korean plain-language value and safe empty state', () => {
  const rendered = competition.render(details(2026), '27');
  assert.match(rendered, /2026학년도 경쟁률/);
  assert.match(rendered, /59\.10:1/);
  assert.match(rendered, /모집 40명 · 지원 2,364명/);

  const empty = competition.render(details(2025), '27');
  assert.match(empty, /전년도 경쟁률 자료 없음/);
  assert.doesNotMatch(empty, /400|401|CORS|stack|Error/);
});

test('legacy counsel adapter replaces stale values without mutating API data', () => {
  const original = details(2026);
  const adapted = competition.adaptUniversityDetails(original, '27');

  assert.equal(adapted['25정원'], '40명');
  assert.equal(adapted['25경쟁률'], '59.10:1 · 지원 2,364명');
  assert.equal(adapted._previousCompetitionYear, 2026);
  assert.equal(original['25정원'], '오래된 정원');

  const missing = competition.adaptUniversityDetails(details(2025), '27');
  assert.equal(missing['25정원'], null);
  assert.equal(missing['25경쟁률'], null);
});

test('page contracts expose competition data on every Susi school-info path', () => {
  const livePage = fs.readFileSync(path.join(ROOT, 'live-page.js'), 'utf8');
  assert.match(livePage, /\/university-details\?college_id=/);
  assert.match(livePage, /SusiCompetitionRate\.render/);

  for (const page of ['counsel.html', 'explore.html', 'live.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /assets\/js\/competition-rate\.js/);
    assert.ok(
      html.indexOf('assets/js/competition-rate.js') < html.indexOf('assets/js/api.js'),
      `${page} must load competition formatter before API calls`
    );
    assert.match(html, /assets\/css\/competition-rate\.css/);
  }
});

test('university details fetch keeps auth/year headers and applies the frontend contract', async () => {
  let request;
  const window = {
    API_BASE: 'https://example.test/susi',
    SUSI_YEAR: '27',
    getToken: () => 'jwt-token',
    handleAuthError: () => assert.fail('auth must remain valid'),
    SusiCompetitionRate: {
      adaptUniversityDetails: (value, year) => ({ ...value, adaptedFor: year }),
    },
  };
  const context = {
    window,
    console,
    setTimeout,
    fetch: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true, details: details(2026) }),
      };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets/js/api.js'), 'utf8'), context);

  const response = await window.api('/university-details?college_id=1');

  assert.equal(request.options.headers.Authorization, 'Bearer jwt-token');
  assert.equal(request.options.headers['X-Susi-Year'], '27');
  assert.equal(response.details.adaptedFor, '27');
});
