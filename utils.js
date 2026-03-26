// =================================================================
// 수시엔진 연도 파라미터 유틸리티
// 사용법: 각 HTML 파일의 <head>에 <script src="utils.js"></script> 추가
// =================================================================
(function() {
    // localStorage에서 연도 설정 읽기 (기본: 26)
    window.SUSI_YEAR = localStorage.getItem("susi_year") || "26";
    
    // API 베이스 URL 자동 생성
    window.SUSI_API = "https://supermax.kr/" + window.SUSI_YEAR + "susi";
    
    // 연도 변경 함수 (UI에서 호출)
    window.setSusiYear = function(year) {
        localStorage.setItem("susi_year", year);
        window.location.reload();
    };
    
    // 콘솔에 현재 설정 표시
    console.log("[수시엔진] 연도: " + window.SUSI_YEAR + ", API: " + window.SUSI_API);
})();

// Auto-populate year display elements
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.year-display').forEach(function(el) {
        el.textContent = window.SUSI_YEAR;
    });
});
