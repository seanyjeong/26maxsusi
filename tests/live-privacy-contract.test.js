const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('live page loads privacy behavior before the renderer', () => {
  const html = read('live.html');
  assert.match(html, /<script src="live-privacy\.js"><\/script>[\s\S]*<script src="live-page\.js"><\/script>/);
  assert.match(html, /id="btnPrivacy"/);
  assert.match(html, /id="privacyPasswordModal"/);
});

test('live renderer masks every personal label when privacy mode is enabled', () => {
  const source = read('live-page.js');
  assert.match(source, /privacy\.maskStudent/);
  assert.match(source, /학교/);
  assert.doesNotMatch(source, /textContent = `\$\{stu\.이름\} 학생 상세 정보`/);
});

test('live Excel applies the same privacy mode and includes the school column', () => {
  const source = read('live-excel.js');
  assert.match(source, /response\.ranking\.map\(privacy\.maskStudent\)/);
  assert.match(source, /\['순위', '지점', '이름', '고교', '성별'\]/);
  assert.doesNotMatch(source, /엑셀 생성 중 오류:/);
});

test('visibility tokens and Windows rendering meet the shared contract', () => {
  const base = read('assets/css/base.css');
  const tokens = read('assets/css/tokens.css');

  assert.match(base, /html\.os-win[\s\S]*font-family:\s*'Pretendard'/);
  assert.match(base, /html\.os-win[\s\S]*text-rendering:\s*auto/);
  assert.match(base, /html\.os-win[\s\S]*letter-spacing:\s*0/);
  assert.match(tokens, /--text-3:\s*#78716c/);
  assert.match(tokens, /\.dark[\s\S]*--text-3:\s*#a8a29e/);
});
