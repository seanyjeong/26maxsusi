from __future__ import annotations

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return


@pytest.fixture(scope="module")
def base_url() -> str:
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        thread.join(timeout=5)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        instance = playwright.chromium.launch(headless=True)
        yield instance
        instance.close()


@pytest.mark.parametrize(
    ("selected_year", "previous_year", "rate", "quota", "applicants"),
    [
        ("27", 2026, "59.10", 40, 2364),
        ("26", 2025, "49.18", 40, 1967),
    ],
)
def test_explore_renders_only_the_selected_years_previous_competition(
    browser,
    base_url: str,
    selected_year: str,
    previous_year: int,
    rate: str,
    quota: int,
    applicants: int,
) -> None:
    captured_headers: list[dict[str, str]] = []
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.add_init_script(
        f"localStorage.setItem('token','jwt-token');"
        f"localStorage.setItem('susi_year',{json.dumps(selected_year)});"
    )

    def handle(route) -> None:
        url = route.request.url
        if url.endswith("/filter-options/regions"):
            body = {"success": True, "regions": []}
        elif url.endswith("/filter-options/events"):
            body = {"success": True, "events": []}
        elif url.endswith("_student_list"):
            body = {"success": True, "students": []}
        elif "/explore-universities" in url:
            captured_headers.append(route.request.headers)
            body = {
                "success": True,
                "universities": [{
                    "대학ID": "1",
                    "광역": "경기",
                    "대학명": "가천대학교",
                    "학과명": "체육학전공",
                    "전형명": "실기우수자",
                    "1단계배수": None,
                    "실기종목들": "20m왕복달리기",
                    "전년도학년도": previous_year,
                    "전년도모집인원": quota,
                    "전년도지원자수": applicants,
                    "전년도경쟁률": rate,
                    "전년도경쟁률범위": None,
                }],
            }
        else:
            route.fulfill(status=404, content_type="application/json", body='{"success":false}')
            return
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(body, ensure_ascii=False),
        )

    page.route("https://supermax.kr/**", handle)
    page.goto(f"{base_url}/explore.html", wait_until="domcontentloaded")
    page.locator("#resultTbody .competition-cell").wait_for()

    text = page.locator("#resultTbody .competition-cell").inner_text()
    assert f"{str(previous_year)[-2:]} 경쟁률" in text
    assert f"{float(rate):.2f}:1" in text
    assert f"모집 {quota:,}명 · 지원 {applicants:,}명" in text
    assert page.locator("#competitionHeader").inner_text() == f"{previous_year}학년도 경쟁률"
    assert captured_headers[0]["authorization"] == "Bearer jwt-token"
    assert captured_headers[0]["x-susi-year"] == selected_year
    page.close()
