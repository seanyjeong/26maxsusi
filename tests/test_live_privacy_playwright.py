from __future__ import annotations

import base64
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from playwright.sync_api import Page, Route, sync_playwright


ROOT = Path(__file__).parents[1]
WINDOWS_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


@pytest.fixture(scope="module")
def app_url() -> str:
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/live.html"
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        yield browser
        browser.close()


def jwt_for_owner() -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps({"userid": "owner-1", "branch": "수원", "role": "owner"}).encode()
    ).decode().rstrip("=")
    return f"header.{payload}.signature"


def mock_api(route: Route) -> None:
    url = route.request.url
    if url.endswith("/susi/profile"):
        body = {"success": True, "user": {"branch": "수원"}}
    elif url.endswith("/susi_college_list"):
        body = {
            "success": True,
            "colleges": [{"대학명": "한국대", "학과명": "체육학과", "전형명": "일반", "대학ID": 1}],
        }
    elif url.endswith("/susi_get_practical_colleges"):
        body = []
    elif "/realtime-rank-by-college" in url:
        body = {
            "success": True,
            "events": ["제자리멀리뛰기"],
            "ranking": [{
                "학생ID": 7,
                "순위": 1,
                "지점명": "수원",
                "이름": "김민수",
                "학교명": "서라벌고등학교",
                "성별": "남",
                "기록1": "270",
                "점수1": 100,
                "내신등급": 2,
                "내신점수": 95,
                "실기총점": 100,
                "합산점수": 195,
            }],
        }
    elif url.endswith("/susi/login"):
        request = json.loads(route.request.post_data or "{}")
        body = {"success": request.get("password") == "correct-password"}
        if body["success"]:
            body["token"] = "reauth-token-not-stored"
    else:
        route.continue_()
        return
    route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))


def open_live_page(browser, app_url: str) -> Page:
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(f"localStorage.setItem('token', {json.dumps(jwt_for_owner())})")
    page.route("https://supermax.kr/**", mock_api)
    page.goto(app_url, wait_until="domcontentloaded")
    page.locator("#comboCollege .combo-display").click()
    page.locator("#comboCollege .combo-item", has_text="한국대").click()
    page.locator("#comboMajor .combo-display").click()
    page.locator("#comboMajor .combo-item", has_text="체육학과").click()
    page.locator("#comboType .combo-display").click()
    page.locator("#comboType .combo-item", has_text="일반").click()
    page.locator("#resultTable").get_by_text("김민수").wait_for()
    return page


def test_privacy_mode_requires_password_and_masks_every_personal_label(browser, app_url: str) -> None:
    page = open_live_page(browser, app_url)

    page.locator(".student-card").evaluate("element => element.click()")
    assert "김민수 상세 정보" in page.locator("#studentDetailModal").text_content()
    page.evaluate("window.closeModal('studentDetailModal')")

    page.locator("#btnPrivacy").click()
    page.locator("#privacyPassword").fill("wrong-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("비밀번호가 올바르지 않습니다.").wait_for()
    assert "김민수" in page.locator("#resultTable").inner_text()

    page.locator("#privacyPassword").fill("correct-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("개인정보 가리기가 활성화되었습니다.").wait_for()

    visible = " ".join([
        page.locator("#resultTable").inner_text(),
        page.locator("#studentListContainer").inner_text(),
    ])
    assert "김○수" in visible
    assert "○○" in visible
    assert "서X벌고등학교" in visible
    assert "김민수" not in visible
    assert "서라벌고등학교" not in visible
    assert page.locator("#btnPrivacy").get_attribute("aria-pressed") == "true"
    assert "개인정보 원문 보기" in page.locator("#btnPrivacy").inner_text()

    body_text = page.locator("body").text_content()
    assert "김민수" not in body_text
    assert "서라벌고등학교" not in body_text

    page.locator("#btnPrivacy").click()
    page.locator("#privacyPassword").fill("wrong-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("비밀번호가 올바르지 않습니다.").wait_for()
    assert "김민수" not in page.locator("body").text_content()

    page.locator("#privacyPassword").fill("correct-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("개인정보 원문 보기가 활성화되었습니다.").wait_for()
    assert "김민수" in page.locator("#resultTable").inner_text()
    assert page.locator("#btnPrivacy").get_attribute("aria-pressed") == "false"
    assert page.evaluate("localStorage.getItem('token')") == jwt_for_owner()
    page.close()


def test_privacy_failure_copy_never_exposes_protocol_terms(browser, app_url: str) -> None:
    page = open_live_page(browser, app_url)
    page.locator("#btnPrivacy").click()
    page.locator("#privacyPassword").fill("wrong-password")
    page.locator("#privacyPasswordSubmit").click()
    page.get_by_text("비밀번호가 올바르지 않습니다.").wait_for()
    message = page.locator("#privacyPasswordMessage").inner_text()
    assert message == "비밀번호가 올바르지 않습니다."
    assert not any(term in message for term in ("HTTP", "401", "SQL", "stack", "CORS"))
    page.close()


def test_windows_typography_uses_clear_rendering_and_aa_text_token(browser, app_url: str) -> None:
    context = browser.new_context(
        user_agent=WINDOWS_USER_AGENT,
        viewport={"width": 1440, "height": 900},
    )
    page = context.new_page()
    page.add_init_script(f"localStorage.setItem('token', {json.dumps(jwt_for_owner())})")
    page.route("https://supermax.kr/**", mock_api)
    page.goto(app_url, wait_until="domcontentloaded")

    values = page.evaluate(
        """() => {
          const body = getComputedStyle(document.body);
          const root = getComputedStyle(document.documentElement);
          return {
            isWindows: document.documentElement.classList.contains('os-win'),
            family: body.fontFamily,
            rendering: body.textRendering,
            text3: root.getPropertyValue('--text-3').trim(),
          };
        }"""
    )
    assert values["isWindows"] is True
    assert "Pretendard" in values["family"]
    assert values["rendering"] == "auto"
    assert values["text3"] == "#78716c"
    context.close()
