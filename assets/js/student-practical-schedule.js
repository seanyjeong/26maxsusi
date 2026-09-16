(function (root, factory) {
  const feature = factory();
  if (typeof module === 'object' && module.exports) module.exports = feature;
  else root.StudentPracticalSchedule = feature;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function validTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  }

  function split(value) {
    const match = String(value || '').trim().match(
      /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?$/
    );
    if (!match || !validDate(match[1])) return { date: '', time: '' };
    return { date: match[1], time: validTime(match[2] || '') ? match[2] : '' };
  }

  function serialize(date, time) {
    if (!date && !time) return null;
    if (!date) throw new Error('실기 시간을 입력하려면 날짜도 선택해 주세요.');
    if (!validDate(date)) throw new Error('실기 날짜를 올바르게 입력해 주세요.');
    if (time && !validTime(time)) throw new Error('실기 시간을 시와 분까지 입력해 주세요.');
    // Store the wall-clock time as entered; timezone conversion can change the exam day.
    return time ? date + ' ' + time : date;
  }

  function escape(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function renderInputs(value, studentName) {
    const schedule = split(value);
    const name = escape(studentName);
    return '<div class="practical-schedule">'
      + '<label><span>날짜</span><input class="input-date" type="date" max="9999-12-31"'
      + ' aria-label="' + name + ' 실기 날짜" value="' + schedule.date + '"></label>'
      + '<label><span>시간 <small>(선택)</small></span><input class="input-time" type="time" step="60"'
      + ' aria-label="' + name + ' 실기 시간" value="' + schedule.time + '"></label>'
      + '</div>';
  }

  function readRow(row) {
    return serialize(row.querySelector('.input-date').value, row.querySelector('.input-time').value);
  }

  function validate(container) {
    for (const group of container.querySelectorAll('.practical-schedule')) {
      const date = group.querySelector('.input-date');
      const time = group.querySelector('.input-time');
      if (!date.validity.valid) return { input: date, message: '실기 날짜를 올바르게 입력해 주세요.' };
      if (!time.validity.valid) return { input: time, message: '실기 시간을 시와 분까지 입력해 주세요.' };
      try {
        serialize(date.value, time.value);
      } catch (error) {
        return { input: date.value ? time : date, message: error.message };
      }
    }
    return null;
  }

  function compare(left, right) {
    const a = split(left), b = split(right);
    const aKey = a.date + ' ' + a.time, bKey = b.date + ' ' + b.time;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  }

  return { split, serialize, renderInputs, readRow, validate, compare };
});
