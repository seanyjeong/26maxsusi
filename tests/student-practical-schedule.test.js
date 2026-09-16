const assert = require('node:assert/strict');
const test = require('node:test');
const schedule = require('../assets/js/student-practical-schedule.js');

test('date-only, SQL datetime and local datetime schedules retain their entered day and minute', () => {
  for (const value of ['2026-10-10 09:30', '2026-10-10 09:30:00', '2026-10-10T09:30']) {
    assert.deepEqual(schedule.split(value), { date: '2026-10-10', time: '09:30' });
  }
  assert.deepEqual(schedule.split('2026-10-10'), { date: '2026-10-10', time: '' });
  assert.deepEqual(schedule.split(null), { date: '', time: '' });
  assert.deepEqual(schedule.split('2026-02-30'), { date: '', time: '' });
});

test('optional times round-trip without inventing midnight for a date-only schedule', () => {
  for (const time of ['', '00:00', '09:30', '23:59']) {
    const stored = schedule.serialize('2026-10-10', time);
    assert.equal(stored, time ? '2026-10-10 ' + time : '2026-10-10');
    assert.deepEqual(schedule.split(stored), { date: '2026-10-10', time });
  }
  assert.equal(schedule.serialize('', ''), null);
  assert.equal(schedule.serialize('2028-02-29', ''), '2028-02-29');
});

test('dashboard schedules sort by date then optional time without timezone conversion', () => {
  const values = ['2026-10-11', '2026-10-10 14:05', '2026-10-10T09:30', '2026-10-10', '2026-10-10 00:00'];
  assert.deepEqual(values.sort(schedule.compare), [
    '2026-10-10', '2026-10-10 00:00', '2026-10-10T09:30', '2026-10-10 14:05', '2026-10-11',
  ]);
  assert.equal(schedule.compare('2026-10-10 09:30', '2026-10-10T09:30:00'), 0);
});

test('time without a date, invalid calendar dates and invalid minutes are rejected', () => {
  assert.throws(() => schedule.serialize('', '09:30'), /날짜도 선택/);
  for (const date of ['2026-02-29', '2026-13-01', '0000-01-01', '2026-2-1']) {
    assert.throws(() => schedule.serialize(date, ''), /날짜/);
  }
  for (const time of ['24:00', '12:60', '9:30', '09:30:00']) {
    assert.throws(() => schedule.serialize('2026-10-10', time), /시와 분/);
  }
});

test('input labels escape names and never place raw schedule text in HTML', () => {
  const html = schedule.renderInputs('2026-10-10 09:30', '학생 "<이름>');
  assert.match(html, /학생 &quot;&lt;이름&gt; 실기 시간/);
  assert.match(html, /type="time" step="60"/);
  assert.match(html, /value="09:30"/);
  assert.doesNotMatch(schedule.renderInputs('<script>bad()</script>', '학생'), /script/);
});

test('incomplete native time input is rejected even when its value is empty', () => {
  const date = { value: '2026-10-10', validity: { valid: true } };
  const time = { value: '', validity: { valid: false } };
  const group = { querySelector: (selector) => selector === '.input-date' ? date : time };
  const container = { querySelectorAll: () => [group] };
  assert.equal(schedule.validate(container).input, time);
  assert.match(schedule.validate(container).message, /시와 분/);
  time.validity.valid = true;
  assert.equal(schedule.validate(container), null);
  assert.equal(schedule.readRow(group), '2026-10-10');
});
