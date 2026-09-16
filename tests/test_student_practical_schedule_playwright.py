from __future__ import annotations

import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlparse

import pytest
from playwright.sync_api import Page, Route, expect, sync_playwright


ROOT = Path(__file__).parents[1]
ORIGIN = 'https://student-schedule.test'


@pytest.fixture
def schedule_page():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, timezone_id='America/Los_Angeles')
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        state = {'saves': [], 'fail_save': False, 'errors': errors}
        college = {'대학ID': 1, '대학명': '검증대학교', '학과명': '체육학과', '전형명': '일반', '실기ID': None}
        students = [
            {'학생ID': 1, '이름': '검증학생', '학년': '3', '성별': '남', '실기일정': '2026-10-10', '합산점수': 200},
            {'학생ID': 2, '이름': '시간학생', '학년': '3', '성별': '여', '실기일정': '2026-10-10 14:05', '합산점수': 190},
        ]

        def route_request(route: Route) -> None:
            url = urlparse(route.request.url)
            if url.netloc == 'supermax.kr':
                assert route.request.headers['authorization'] == 'Bearer schedule-test-token'
                assert route.request.headers['x-susi-year'] == '27'
                if url.path.endswith('_final_save'):
                    payload = route.request.post_data_json
                    state['saves'].append(payload)
                    if state['fail_save']:
                        route.fulfill(status=500, json={'message': 'SQL secret stack'})
                        return
                    for changed in payload['studentData']:
                        next(s for s in students if s['학생ID'] == changed['학생ID']).update(changed)
                    body = {'success': True}
                elif url.path.endswith('/branch_summary_by_university'):
                    body = {'success': True, 'universities': [{**college, '학생들': students}]}
                elif url.path.endswith('_college_list'):
                    body = {'success': True, 'colleges': [college]}
                elif url.path.endswith('_final_list') or url.path.endswith('_student_list'):
                    body = {'success': True, 'students': students}
                elif url.path.endswith('/profile'):
                    body = {'success': True, 'user': {'branch': '검증지점'}}
                elif url.path.endswith('/branch-schedule'):
                    body = {'success': True, 'schedule': [
                        {'date': s['실기일정'], 'university': college['대학명'],
                         'department': college['학과명'], 'students': [s['이름']]}
                        for s in reversed(students) if s['실기일정']
                    ]}
                else:
                    body = {'success': True, 'dates': [], 'announcements': []}
                route.fulfill(json=body)
            elif url.netloc == 'student-schedule.test':
                file = (ROOT / unquote(url.path).lstrip('/')).resolve()
                if file.is_relative_to(ROOT) and file.is_file():
                    route.fulfill(body=file.read_bytes(), content_type=mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
                else:
                    route.fulfill(status=404)
            else:
                route.fulfill(body='')

        page.route('**/*', route_request)
        page.add_init_script("localStorage.setItem('token','schedule-test-token'); localStorage.setItem('susi_year','27');")
        yield page, state
        assert errors == []
        browser.close()


def open_editor(page: Page, filename: str) -> None:
    page.goto(ORIGIN + '/' + filename)
    if filename == 'branch_summary.html':
        page.locator('.uni-card summary').click()
    else:
        for selector, text in [('collegeCombo', '검증대학교'), ('majorCombo', '체육학과'), ('typeCombo', '일반')]:
            page.locator('#' + selector + ' .combo-display').click()
            page.locator('#' + selector + ' .combo-item').filter(has_text=text).click()
    expect(page.get_by_label('검증학생 실기 날짜')).to_have_value('2026-10-10')


def save_button(page: Page, filename: str):
    return page.locator('[data-action="save-uni"]' if filename == 'branch_summary.html' else '#btnSaveAll')


@pytest.mark.parametrize('filename', ['branch_summary.html', 'final_confirm.html'])
def test_time_round_trip_across_both_editors_and_dashboard(schedule_page, filename: str, tmp_path: Path) -> None:
    page, state = schedule_page
    open_editor(page, filename)
    expect(page.get_by_label('검증학생 실기 시간')).to_have_value('')
    expect(page.get_by_label('시간학생 실기 시간')).to_have_value('14:05')
    page.get_by_label('검증학생 실기 시간').fill('09:30')
    with page.expect_response('**/susi_final_save'):
        save_button(page, filename).click()
    expect(page.get_by_label('검증학생 실기 시간')).to_have_value('09:30')
    assert state['saves'][-1]['studentData'][0]['실기일정'] == '2026-10-10 09:30'
    assert state['saves'][-1]['studentData'][1]['실기일정'] == '2026-10-10 14:05'

    open_editor(page, filename)
    expect(page.get_by_label('검증학생 실기 시간')).to_have_value('09:30')
    other = 'final_confirm.html' if filename == 'branch_summary.html' else 'branch_summary.html'
    open_editor(page, other)
    expect(page.get_by_label('검증학생 실기 시간')).to_have_value('09:30')
    with page.expect_response('**/susi_final_save'):
        save_button(page, other).click()
    assert state['saves'][-1]['studentData'][0]['실기일정'] == '2026-10-10 09:30'

    page.goto(ORIGIN + '/dashboard.html')
    expect(page.locator('#schedule-list')).to_contain_text('10월 10일 (토) 09:30')
    expect(page.locator('#schedule-list')).to_contain_text('10월 10일 (토) 14:05')
    expect(page.locator('#schedule-list li').first).to_contain_text('09:30')
    page.screenshot(path=str(tmp_path / 'dashboard.png'), full_page=True)


@pytest.mark.parametrize('filename', ['branch_summary.html', 'final_confirm.html'])
def test_optional_time_clear_and_date_required(schedule_page, filename: str, tmp_path: Path) -> None:
    page, state = schedule_page
    page.set_viewport_size({'width': 768, 'height': 1000})
    open_editor(page, filename)
    date = page.get_by_label('검증학생 실기 날짜')
    time = page.get_by_label('검증학생 실기 시간')
    time.fill('00:00')
    date.fill('')
    save_button(page, filename).click()
    expect(page.get_by_text('실기 시간을 입력하려면 날짜도 선택해 주세요.')).to_be_visible()
    expect(date).to_be_focused()
    assert state['saves'] == []
    date.fill('2026-10-10')
    with page.expect_response('**/susi_final_save'):
        save_button(page, filename).click()
    assert state['saves'][-1]['studentData'][0]['실기일정'] == '2026-10-10 00:00'
    expect(time).to_have_value('00:00')
    time.fill('')
    with page.expect_response('**/susi_final_save'):
        save_button(page, filename).click()
    assert state['saves'][-1]['studentData'][0]['실기일정'] == '2026-10-10'
    expect(time).to_have_value('')
    date.fill('')
    with page.expect_response('**/susi_final_save'):
        save_button(page, filename).click()
    assert state['saves'][-1]['studentData'][0]['실기일정'] is None
    expect(date).to_have_value('')
    expect(time).to_have_value('')
    time.scroll_into_view_if_needed()
    page.screenshot(path=str(tmp_path / (filename + '.png')), full_page=True)


@pytest.mark.parametrize('filename', ['branch_summary.html', 'final_confirm.html'])
def test_failed_save_keeps_entered_time_and_plain_korean_error(schedule_page, filename: str) -> None:
    page, state = schedule_page
    open_editor(page, filename)
    state['fail_save'] = True
    page.get_by_label('검증학생 실기 시간').fill('23:59')
    with page.expect_response('**/susi_final_save'):
        save_button(page, filename).click()
    expect(page.get_by_label('검증학생 실기 시간')).to_have_value('23:59')
    expect(save_button(page, filename)).to_be_enabled()
    expect(page.get_by_text('SQL secret stack')).to_have_count(0)
    expect(page.locator('.toast').first).to_contain_text('잠시 후 다시 시도')
