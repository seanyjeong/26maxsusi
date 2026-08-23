from __future__ import annotations

import re
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).parents[1]
MIN_TEXT_CONTRAST = 4.5


def relative_luminance(rgb: str) -> float:
    channels = [int(value) / 255 for value in re.findall(r"\d+", rgb)[:3]]

    def linear(channel: float) -> float:
        if channel <= 0.04045:
            return channel / 12.92
        return ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def contrast_ratio(foreground: str, background: str) -> float:
    lighter, darker = sorted(
        (relative_luminance(foreground), relative_luminance(background)),
        reverse=True,
    )
    return (lighter + 0.05) / (darker + 0.05)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        instance = playwright.chromium.launch(headless=True)
        yield instance
        instance.close()


def render_schedule_styles(browser, app_theme: str) -> dict[str, object]:
    tokens = (ROOT / "assets/css/tokens.css").read_text(encoding="utf-8")
    counsel = (ROOT / "counsel.css").read_text(encoding="utf-8")
    schedule = (ROOT / "counsel-schedule.css").read_text(encoding="utf-8")
    page = browser.new_page(color_scheme="dark")
    page.set_content(
        f"""
        <html class="{app_theme}">
          <head><style>{tokens}\n{counsel}\n{schedule}</style></head>
          <body>
            <div class="sched-banner">
              <div class="sb-head">
                <strong>실기일정 충돌 3일</strong>
                <span class="sb-tag warn">예약 조정 가능 1</span>
              </div>
              <div class="sb-list">가천대학교 체육전공 · 한신대학교 특수체육학과</div>
            </div>
            <div class="sched-line"><span class="k">배정</span></div>
          </body>
        </html>
        """
    )
    styles = page.evaluate(
        """() => {
          const read = selector => {
            const style = getComputedStyle(document.querySelector(selector));
            return { color: style.color, background: style.backgroundColor };
          };
          const banner = getComputedStyle(document.querySelector('.sched-banner'));
          return {
            bannerImage: banner.backgroundImage,
            heading: read('.sb-head strong'),
            list: read('.sb-list'),
            adjustment: read('.sb-tag.warn'),
            assigned: read('.sched-line .k'),
          };
        }"""
    )
    page.close()
    return styles


def test_light_app_ignores_dark_operating_system_for_schedule_alerts(browser) -> None:
    html = (ROOT / "counsel.html").read_text(encoding="utf-8")
    assert html.index("counsel-schedule.css") > html.index("counsel.css")

    styles = render_schedule_styles(browser, "light")
    assert "rgb(255, 245, 245)" in styles["bannerImage"]
    assert contrast_ratio(styles["heading"]["color"], "rgb(255, 245, 245)") >= MIN_TEXT_CONTRAST
    assert contrast_ratio(styles["list"]["color"], "rgb(255, 245, 245)") >= MIN_TEXT_CONTRAST
    assert contrast_ratio(
        styles["adjustment"]["color"],
        styles["adjustment"]["background"],
    ) >= MIN_TEXT_CONTRAST
    assert contrast_ratio(
        styles["assigned"]["color"],
        styles["assigned"]["background"],
    ) >= MIN_TEXT_CONTRAST


def test_dark_app_keeps_schedule_alert_text_readable(browser) -> None:
    styles = render_schedule_styles(browser, "dark")
    assert "rgb(31, 20, 22)" in styles["bannerImage"]
    assert contrast_ratio(styles["heading"]["color"], "rgb(31, 20, 22)") >= MIN_TEXT_CONTRAST
    assert contrast_ratio(styles["list"]["color"], "rgb(31, 20, 22)") >= MIN_TEXT_CONTRAST
    assert contrast_ratio(
        styles["adjustment"]["color"],
        styles["adjustment"]["background"],
    ) >= MIN_TEXT_CONTRAST
    assert contrast_ratio(
        styles["assigned"]["color"],
        styles["assigned"]["background"],
    ) >= MIN_TEXT_CONTRAST
