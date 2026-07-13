/* 수시 라이브 전체 수합 엑셀 생성: 목차, 대학별, 합격자 */
(function () {
  'use strict';

  const COLORS = {
    border: 'FFE7E5E4',
    dark: 'FF1C1917',
    green: 'FF047857',
    light: 'FFF5F5F4',
    primary: 'FF0F766E',
    white: 'FFFFFFFF',
  };

  function border() {
    const side = { style: 'thin', color: { argb: COLORS.border } };
    return { top: side, left: side, bottom: side, right: side };
  }

  function styleHeader(row, color) {
    row.height = 28;
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
      cell.font = { name: 'Pretendard', size: 10, bold: true, color: { argb: COLORS.white } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border();
    });
  }

  function styleDataRow(row, isEven) {
    row.eachCell(cell => {
      cell.font = { name: 'Pretendard', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border();
      if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
    });
  }

  function sanitizeSheetName(name) {
    return String(name).replace(/[[\]:*?/\\]/g, '').slice(0, 31);
  }

  function numberOrDash(value, digits) {
    if (value == null || value === '') return '-';
    const number = Number(value);
    if (!Number.isFinite(number)) return '-';
    return digits == null ? number : Number(number.toFixed(digits));
  }

  async function collectData(colleges) {
    const privacy = window.MaxLivePrivacy;
    const shouldMask = privacy.isEnabled();
    const data = [];
    const progressText = document.getElementById('excelProgressText');
    const progressBar = document.getElementById('excelProgressBar');

    for (let index = 0; index < colleges.length; index += 1) {
      const college = colleges[index];
      progressText.textContent = `${index + 1}/${colleges.length} · ${college.대학명} ${college.학과명}`;
      progressBar.style.width = Math.round(((index + 1) / colleges.length) * 100) + '%';
      try {
        const response = await window.api(`/realtime-rank-by-college?college_id=${encodeURIComponent(college.대학ID)}`);
        if (response && response.success && response.ranking && response.ranking.length) {
          data.push({
            대학명: college.대학명,
            학과명: college.학과명,
            전형명: college.전형명,
            events: response.events || [],
            ranking: shouldMask ? response.ranking.map(privacy.maskStudent) : response.ranking,
          });
        }
      } catch (error) {
        console.error('[live-excel] ranking fetch', college.대학ID, error);
      }
    }
    return data;
  }

  function groupByUniversity(allData) {
    return allData.reduce((groups, section) => {
      if (!groups[section.대학명]) groups[section.대학명] = [];
      groups[section.대학명].push(section);
      return groups;
    }, {});
  }

  function createContentsSheet(workbook, grouped, allData, year) {
    const sheet = workbook.addWorksheet('목차', { properties: { defaultRowHeight: 24 } });
    const universities = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ko'));
    const totalStudents = allData.reduce((sum, section) => sum + section.ranking.length, 0);
    const title = sheet.addRow([`${year}수시 전체 수합결과`]);
    sheet.mergeCells(title.number, 1, title.number, 5);
    title.height = 42;
    title.getCell(1).font = { name: 'Pretendard', size: 18, bold: true, color: { argb: COLORS.primary } };
    const privacyLabel = window.MaxLivePrivacy.isEnabled() ? ' · 개인정보 가림' : '';
    const summary = sheet.addRow([`총 ${universities.length}개 대학 · ${allData.length}개 학과/전형 · ${totalStudents}명${privacyLabel}`]);
    sheet.mergeCells(summary.number, 1, summary.number, 5);
    summary.getCell(1).font = { name: 'Pretendard', size: 11, bold: true };
    sheet.addRow([]);
    const passLink = sheet.addRow(['합격자 명단 시트로 이동']);
    sheet.mergeCells(passLink.number, 1, passLink.number, 5);
    passLink.getCell(1).value = { text: '합격자 명단 시트로 이동 →', hyperlink: "#'합격자 명단'!A1" };
    passLink.getCell(1).font = { name: 'Pretendard', size: 12, bold: true, color: { argb: COLORS.green }, underline: true };
    sheet.addRow([]);
    styleHeader(sheet.addRow(['No.', '대학명', '학과 수', '총 인원', '바로가기']), COLORS.primary);
    universities.forEach((name, index) => {
      const sections = grouped[name];
      const count = sections.reduce((sum, section) => sum + section.ranking.length, 0);
      const row = sheet.addRow([index + 1, name, sections.length, count, '→ 이동']);
      styleDataRow(row, index % 2 === 0);
      row.getCell(5).value = { text: '→ 이동', hyperlink: `#'${sanitizeSheetName(name)}'!A1` };
      row.getCell(5).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: COLORS.primary }, underline: true };
    });
    [6, 25, 10, 10, 12].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    return totalStudents;
  }

  function sectionHeaders(events) {
    const headers = ['순위', '지점', '이름', '고교', '성별'];
    events.forEach(event => headers.push(event + ' 기록', event + ' 점수'));
    return headers.concat(['내신등급', '내신점수', '실기총점', '합산점수', '최초합', '최종합']);
  }

  function studentRow(student, eventCount) {
    const values = [student.순위, student.지점명, student.이름, student.학교명 || '-', student.성별];
    for (let index = 1; index <= eventCount; index += 1) {
      values.push(student['기록' + index] || '-', numberOrDash(student['점수' + index]));
    }
    return values.concat([
      student.내신등급 || '-',
      numberOrDash(student.내신점수),
      numberOrDash(student.실기총점, 2),
      numberOrDash(student.합산점수, 2),
      student.최초합여부 || '-',
      student.최종합여부 || '-',
    ]);
  }

  function createUniversitySheets(workbook, grouped) {
    Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ko')).forEach(university => {
      const sheet = workbook.addWorksheet(sanitizeSheetName(university), { properties: { defaultRowHeight: 22 } });
      const title = sheet.addRow([university]);
      title.height = 38;
      sheet.mergeCells(title.number, 1, title.number, 8);
      title.getCell(1).font = { name: 'Pretendard', size: 16, bold: true, color: { argb: COLORS.primary } };
      const back = sheet.addRow(['← 목차로 돌아가기']);
      back.getCell(1).value = { text: '← 목차로 돌아가기', hyperlink: "#'목차'!A1" };
      back.getCell(1).font = { name: 'Pretendard', size: 10, color: { argb: COLORS.primary }, underline: true };
      sheet.addRow([]);
      let maximumColumns = 0;

      grouped[university].forEach(section => {
        const headers = sectionHeaders(section.events);
        maximumColumns = Math.max(maximumColumns, headers.length);
        const sectionTitle = sheet.addRow([`${section.학과명} · ${section.전형명} (${section.ranking.length}명)`]);
        sheet.mergeCells(sectionTitle.number, 1, sectionTitle.number, headers.length);
        sectionTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dark } };
        sectionTitle.getCell(1).font = { name: 'Pretendard', size: 12, bold: true, color: { argb: COLORS.white } };
        styleHeader(sheet.addRow(headers), COLORS.primary);
        const totalIndex = headers.indexOf('합산점수') + 1;
        const firstPassIndex = headers.indexOf('최초합') + 1;
        const finalPassIndex = headers.indexOf('최종합') + 1;
        section.ranking.forEach((student, index) => {
          const row = sheet.addRow(studentRow(student, section.events.length));
          styleDataRow(row, index % 2 === 0);
          if (student.순위 <= 3) row.getCell(1).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: COLORS.primary } };
          row.getCell(totalIndex).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: COLORS.primary } };
          [firstPassIndex, finalPassIndex].forEach(cellIndex => {
            if (row.getCell(cellIndex).value === '합격') row.getCell(cellIndex).font = { name: 'Pretendard', size: 10, bold: true, color: { argb: COLORS.green } };
          });
        });
        sheet.addRow([]);
      });

      const widths = [6, 14, 10, 18, 6];
      while (widths.length < maximumColumns - 6) widths.push(widths.length % 2 ? 10 : 12);
      widths.push(10, 10, 10, 12, 8, 8);
      widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    });
  }

  function createPassSheet(workbook, allData) {
    const sheet = workbook.addWorksheet('합격자 명단', { properties: { defaultRowHeight: 22 } });
    const title = sheet.addRow(['합격자 명단']);
    sheet.mergeCells(title.number, 1, title.number, 7);
    title.getCell(1).font = { name: 'Pretendard', size: 18, bold: true, color: { argb: COLORS.green } };
    const back = sheet.addRow(['← 목차로 돌아가기']);
    back.getCell(1).value = { text: '← 목차로 돌아가기', hyperlink: "#'목차'!A1" };
    back.getCell(1).font = { name: 'Pretendard', size: 10, color: { argb: COLORS.primary }, underline: true };
    sheet.addRow([]);

    allData.forEach(section => {
      const passers = section.ranking.filter(student => student.최초합여부 === '합격' || student.최종합여부 === '합격');
      if (!passers.length) return;
      const sectionTitle = sheet.addRow([`${section.대학명} · ${section.학과명} · ${section.전형명} (${passers.length}명)`]);
      sheet.mergeCells(sectionTitle.number, 1, sectionTitle.number, 7);
      sectionTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dark } };
      sectionTitle.getCell(1).font = { name: 'Pretendard', size: 12, bold: true, color: { argb: COLORS.white } };
      styleHeader(sheet.addRow(['No.', '지점', '이름', '고교', '성별', '최초합', '최종합']), COLORS.green);
      passers.forEach((student, index) => {
        const row = sheet.addRow([index + 1, student.지점명, student.이름, student.학교명 || '-', student.성별, student.최초합여부 || '-', student.최종합여부 || '-']);
        styleDataRow(row, index % 2 === 0);
      });
      sheet.addRow([]);
    });
    [6, 14, 10, 18, 6, 10, 10].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  }

  async function saveWorkbook(workbook, year) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${year}수시_전체수합결과_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  window.downloadLiveExcel = async function (colleges) {
    document.getElementById('excelProgressText').textContent = '준비 중...';
    document.getElementById('excelProgressBar').style.width = '0%';
    window.openModal('excelProgressModal');
    try {
      const allData = await collectData(colleges || []);
      if (!allData.length) {
        window.closeModal('excelProgressModal');
        window.showToast('수합된 데이터가 없습니다.', 'info');
        return;
      }
      allData.sort((a, b) => a.대학명.localeCompare(b.대학명, 'ko') || a.학과명.localeCompare(b.학과명, 'ko'));
      const year = window.SUSI_YEAR || '27';
      const workbook = new window.ExcelJS.Workbook();
      workbook.creator = 'MAX 수시 시스템';
      const grouped = groupByUniversity(allData);
      const totalStudents = createContentsSheet(workbook, grouped, allData, year);
      createUniversitySheets(workbook, grouped);
      createPassSheet(workbook, allData);
      await saveWorkbook(workbook, year);
      window.closeModal('excelProgressModal');
      window.showToast(`다운로드가 완료되었습니다. ${allData.length}개 학과, ${totalStudents}명`, 'success');
    } catch (error) {
      console.error('[live-excel] create', error);
      window.closeModal('excelProgressModal');
      window.showToast('엑셀을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    }
  };
})();
