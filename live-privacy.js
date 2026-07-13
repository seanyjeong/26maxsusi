/* 수시 라이브 화면·엑셀 개인정보 마스킹과 원장 비밀번호 재확인 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxLivePrivacy = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STORAGE_KEY = 'max_live_privacy_enabled';
  const BRANCH_MASK = '○○';
  const NAME_MASK = '○';
  const SCHOOL_MASK = 'X';

  function chars(value) {
    return Array.from(String(value == null ? '' : value).trim());
  }

  function maskMiddle(value) {
    const parts = chars(value);
    if (parts.length === 0) return '';
    if (parts.length === 1) return NAME_MASK;
    if (parts.length === 2) return parts[0] + NAME_MASK;
    return parts[0] + NAME_MASK.repeat(parts.length - 2) + parts[parts.length - 1];
  }

  function maskName(value) {
    return maskMiddle(value);
  }

  function maskBranch(value) {
    return chars(value).length ? BRANCH_MASK : '';
  }

  function maskSchool(value) {
    const school = String(value == null ? '' : value).trim();
    if (!school) return '';

    const suffix = school.endsWith('고등학교') ? '고등학교' : (school.endsWith('고') ? '고' : '');
    const base = chars(suffix ? school.slice(0, -suffix.length) : school);
    if (base.length === 0) return SCHOOL_MASK + suffix;

    const maskIndex = Math.floor(base.length / 2);
    base[maskIndex] = SCHOOL_MASK;
    return base.join('') + suffix;
  }

  function maskStudent(student) {
    return Object.assign({}, student, {
      이름: maskName(student && student.이름),
      지점명: maskBranch(student && student.지점명),
      학교명: maskSchool(student && (student.학교명 || student.학교)),
    });
  }

  function isEnabled(storage) {
    const target = storage || (typeof window !== 'undefined' ? window.sessionStorage : null);
    return !!target && target.getItem(STORAGE_KEY) === 'true';
  }

  function setEnabled(enabled, storage) {
    const target = storage || (typeof window !== 'undefined' ? window.sessionStorage : null);
    if (target) target.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    return !!enabled;
  }

  async function verifyOwnerPassword(options) {
    const opts = options || {};
    const password = String(opts.password || '');
    const userid = String(opts.userid || '').trim();
    if (!userid) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
    if (!password) throw new Error('비밀번호를 입력해 주세요.');

    let response;
    try {
      response = await opts.fetchFn(opts.apiBase + '/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Susi-Year': opts.year || '27',
        },
        body: JSON.stringify({ userid, password }),
      });
    } catch (_) {
      throw new Error('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
    }

    let data = {};
    try { data = await response.json(); } catch (_) { data = {}; }
    const status = Number(response && response.status) || 0;
    if (data && data.success && data.token) return true;
    if (status === 429) throw new Error('확인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    if (status >= 500) throw new Error('비밀번호를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    throw new Error('비밀번호가 올바르지 않습니다.');
  }

  return {
    STORAGE_KEY,
    isEnabled,
    maskBranch,
    maskName,
    maskSchool,
    maskStudent,
    setEnabled,
    verifyOwnerPassword,
  };
});
