/**
 * Susi Year Utility — 다중 연도 지원
 * SUSI_API = https://supermax.kr/susi (연도 무관 단일 엔드포인트)
 * X-Susi-Year 헤더로 연도 전달
 */

(function() {
    var year = localStorage.getItem('susi_year') || '26';
    window.SUSI_YEAR = year;
    window.SUSI_API  = 'https://supermax.kr/susi';

    // 연도별 데이터 fetch 래퍼 (X-Susi-Year 헤더 자동 주입)
    window.susicFetch = function(url, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.headers['X-Susi-Year'] = window.SUSI_YEAR;
        return fetch(url, options);
    };

    // 연도 변경 (localStorage 저장 + SUSI_YEAR 갱신)
    window.setSusiYear = function(y) {
        var valid = ['26', '27', '28'];
        if (valid.indexOf(String(y)) === -1) {
            console.error('[SUSI] Invalid year:', y);
            return false;
        }
        localStorage.setItem('susi_year', String(y));
        window.SUSI_YEAR = String(y);
        return true;
    };

    window.getSusiYear = function() { return window.SUSI_YEAR; };
})();
