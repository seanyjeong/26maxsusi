const assert = require('node:assert/strict');
const test = require('node:test');

const {
  maskBranch,
  maskName,
  maskSchool,
  maskStudent,
  verifyOwnerPassword,
} = require('../live-privacy.js');

test('maskName hides the middle of Korean student names', () => {
  assert.equal(maskName('김민수'), '김○수');
  assert.equal(maskName('김민'), '김○');
  assert.equal(maskName('김'), '○');
  assert.equal(maskName(''), '');
});

test('maskBranch hides the branch identity completely', () => {
  assert.equal(maskBranch('수원'), '○○');
  assert.equal(maskBranch('서울북부'), '○○');
  assert.equal(maskBranch('강남점'), '○○');
});

test('maskSchool hides one base character and preserves the school suffix', () => {
  assert.equal(maskSchool('행복고'), '행X고');
  assert.equal(maskSchool('서라벌고등학교'), '서X벌고등학교');
  assert.equal(maskSchool('대전고등학교'), '대X고등학교');
  assert.equal(maskSchool('한고'), 'X고');
});

test('maskStudent does not mutate the API response object', () => {
  const original = { 이름: '김민수', 지점명: '수원', 학교명: '행복고' };
  const masked = maskStudent(original);

  assert.deepEqual(masked, { 이름: '김○수', 지점명: '○○', 학교명: '행X고' });
  assert.deepEqual(original, { 이름: '김민수', 지점명: '수원', 학교명: '행복고' });
});

test('verifyOwnerPassword reauthenticates the current owner without storing the new token', async () => {
  let request;
  const ok = await verifyOwnerPassword({
    apiBase: 'https://example.test/susi',
    fetchFn: async (url, options) => {
      request = { url, options };
      return { status: 200, json: async () => ({ success: true, token: 'unused-token' }) };
    },
    password: 'secret',
    userid: 'owner-1',
    year: '27',
  });

  assert.equal(ok, true);
  assert.equal(request.url, 'https://example.test/susi/login');
  assert.equal(request.options.headers['X-Susi-Year'], '27');
  assert.deepEqual(JSON.parse(request.options.body), { userid: 'owner-1', password: 'secret' });
});

test('verifyOwnerPassword returns safe Korean guidance for invalid credentials', async () => {
  await assert.rejects(
    verifyOwnerPassword({
      apiBase: 'https://example.test/susi',
      fetchFn: async () => ({ status: 200, json: async () => ({ success: false }) }),
      password: 'wrong',
      userid: 'owner-1',
      year: '27',
    }),
    { message: '비밀번호가 올바르지 않습니다.' }
  );
});
