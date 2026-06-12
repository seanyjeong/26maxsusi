/* ============================================================
 * combobox.js — 공통 combobox 헬퍼
 * Source pattern: counsel.new.html 학생 선택 콤보박스
 * Phase 3 — 모든 페이지 select 통일 (사용자 결정)
 *
 * Usage:
 *   const combo = window.createCombobox(document.getElementById('myBox'), {
 *     options: [{ value: 'a', label: '항목 A' }, ...],
 *     value: 'a',
 *     placeholder: '선택…',
 *     searchable: true,        // false 면 검색 input 숨김 (옵션 적은 select 용)
 *     searchPlaceholder: '검색…',
 *     onChange: (newValue, opt) => {},
 *   });
 *   combo.setOptions([...]);
 *   combo.setValue('b');
 *   combo.disable();  combo.enable();
 *   combo.value;      // getter
 *   combo.refresh();  // 현재 옵션·값 다시 렌더
 *
 * 컨테이너는 빈 <div> 면 충분 (헬퍼가 마크업 자동 생성).
 * 외부 클릭으로 닫힘, Escape 닫힘, Enter 첫 매치 선택.
 * ============================================================ */

(function () {
  'use strict';

  function escapeHtml(s) {
    return (window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c])));
  }

  let _idCounter = 0;
  function nextId() { return 'cb-' + (++_idCounter); }

  window.createCombobox = function (container, opts) {
    // selector 문자열도 지원
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) throw new Error('combobox: container required');
    opts = opts || {};
    const id = container.id || nextId();
    const searchable = opts.searchable !== false;
    const placeholder = opts.placeholder || '선택…';
    const searchPlaceholder = opts.searchPlaceholder || '검색…';

    let options = (opts.options || []).slice();   // [{value, label, meta}]
    let value = opts.value != null ? String(opts.value) : '';
    let disabled = !!opts.disabled;

    container.classList.add('combobox');
    if (!searchable) container.classList.add('no-search');
    if (!container.id) container.id = id;
    container.innerHTML = `
      <button type="button" class="combo-display" ${disabled ? 'disabled' : ''}>
        <span class="label placeholder"></span>
        <i class="ph-light ph-caret-down"></i>
      </button>
      <div class="combo-menu">
        ${searchable ? `
          <div class="combo-search">
            <i class="ph-light ph-magnifying-glass"></i>
            <input type="search" autocomplete="off" placeholder="${escapeHtml(searchPlaceholder)}">
          </div>` : ''}
        <div class="combo-list"></div>
      </div>
    `;

    const display = container.querySelector('.combo-display');
    const labelEl = container.querySelector('.label');
    const search = container.querySelector('.combo-search input');
    const listEl = container.querySelector('.combo-list');

    function findOpt(v) { return options.find(o => String(o.value) === String(v)); }
    function renderLabel() {
      const opt = findOpt(value);
      if (opt && opt.value !== '') {
        labelEl.textContent = opt.label;
        labelEl.classList.remove('placeholder');
      } else {
        labelEl.textContent = placeholder;
        labelEl.classList.add('placeholder');
      }
    }

    function renderList(filter) {
      const term = (filter || '').trim().toLowerCase();
      const list = term
        ? options.filter(o => String(o.label).toLowerCase().includes(term))
        : options;
      if (!list.length) {
        listEl.innerHTML = `<div class="combo-empty">${term ? '검색 결과 없음' : '항목 없음'}</div>`;
        return;
      }
      listEl.innerHTML = list.map(o => `
        <div class="combo-item ${String(o.value) === String(value) ? 'selected' : ''}"
             data-value="${escapeHtml(o.value)}">
          <span>${escapeHtml(o.label)}</span>
          ${o.meta ? `<span class="meta">${escapeHtml(o.meta)}</span>` : ''}
        </div>
      `).join('');
    }

    function open() {
      if (disabled) return;
      container.classList.add('open');
      renderList('');
      if (search) {
        search.value = '';
        setTimeout(() => search.focus(), 30);
      }
    }
    function close() {
      container.classList.remove('open');
      if (search) search.value = '';
    }
    function pick(v) {
      const opt = findOpt(v);
      value = opt ? String(opt.value) : '';
      renderLabel();
      close();
      if (typeof opts.onChange === 'function') opts.onChange(value, opt);
    }

    display.addEventListener('click', () => {
      if (container.classList.contains('open')) close();
      else open();
    });
    if (search) {
      search.addEventListener('input', () => renderList(search.value));
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        else if (e.key === 'Enter') {
          e.preventDefault();
          const first = listEl.querySelector('.combo-item');
          if (first) pick(first.dataset.value);
        }
      });
    }
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.combo-item');
      if (!item) return;
      pick(item.dataset.value);
    });
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && container.classList.contains('open')) close();
    });

    renderLabel();

    return {
      get value() { return value; },
      setValue(v) { value = v != null ? String(v) : ''; renderLabel(); },
      setOptions(opts) {
        options = (opts || []).slice();
        // value 가 새 옵션에 없으면 reset
        if (value && !findOpt(value)) value = '';
        renderLabel();
        if (container.classList.contains('open')) renderList(search ? search.value : '');
      },
      getOptions() { return options.slice(); },
      disable() { disabled = true; display.disabled = true; close(); },
      enable() { disabled = false; display.disabled = false; },
      open, close,
      refresh() { renderLabel(); if (container.classList.contains('open')) renderList(search ? search.value : ''); },
      destroy() { container.innerHTML = ''; container.classList.remove('combobox', 'no-search', 'open'); },
    };
  };
})();
