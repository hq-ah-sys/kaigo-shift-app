import ExcelJS from 'exceljs';
import { AppState, ShiftPattern } from '../types';
import {
  daysInMonth,
  dayOfWeekName,
  dayOfWeekIdx,
  getStaffDayNetH,
  calcFTE,
  getPatternByKey,
  parseTimeVal,
  isNight,
} from './shiftEngine';
import { SPECIAL_SHIFTS } from '../constants';
import { computeStaffSummaries, runFacilityChecks } from './complianceEngine';

// Helper to convert hex colors to ExcelJS ARGB hex string (AARRGGBB)
function toArgb(hex: string, defaultAlpha = 'FF'): string {
  if (!hex) return defaultAlpha + '000000';
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (clean.length === 6) {
    return defaultAlpha + clean.toUpperCase();
  }
  if (clean.length === 8) {
    return clean.toUpperCase();
  }
  return defaultAlpha + '000000';
}

// Border definitions
const thinSlateBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const stampBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF94A3B8' } },
  left: { style: 'thin', color: { argb: 'FF94A3B8' } },
  bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
  right: { style: 'thin', color: { argb: 'FF94A3B8' } },
};

const headerBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: 'FF475569' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'medium', color: { argb: 'FF475569' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const totalTopBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'medium', color: { argb: 'FF1E3A8A' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

const doubleBottomBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'double', color: { argb: 'FF1E3A8A' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

// Styling definitions for shift badge cells
interface ShiftStyle {
  bgArgb: string;
  fgArgb: string;
  bold: boolean;
  fontSize?: number;
}

function getShiftCellStyle(key: string, patterns: ShiftPattern[]): ShiftStyle {
  if (key === '早') {
    return { bgArgb: 'FFFEF3C7', fgArgb: 'FF92400E', bold: true, fontSize: 10 }; // Amber
  }
  if (key === '日') {
    return { bgArgb: 'FFDBEAFE', fgArgb: 'FF1E40AF', bold: true, fontSize: 10 }; // Blue
  }
  if (key === '遅') {
    return { bgArgb: 'FFEDE9FE', fgArgb: 'FF5B21B6', bold: true, fontSize: 10 }; // Purple
  }
  if (key === '夜') {
    return { bgArgb: 'FF1E293B', fgArgb: 'FFFFFFFF', bold: true, fontSize: 10 }; // Dark slate + white text
  }
  if (key === '明' || key === '明け') {
    return { bgArgb: 'FFBAE6FD', fgArgb: 'FF0369A1', bold: true, fontSize: 10 }; // Sky blue
  }
  if (key === '有' || key === '有休') {
    return { bgArgb: 'FFD1FAE5', fgArgb: 'FF065F46', bold: true, fontSize: 10 }; // Emerald green
  }
  if (key === '希' || key === '希望休') {
    return { bgArgb: 'FFFFEDD5', fgArgb: 'FF9A3412', bold: true, fontSize: 10 }; // Light orange
  }
  if (key === '休' || key === '公休') {
    return { bgArgb: 'FFF1F5F9', fgArgb: 'FF64748B', bold: true, fontSize: 10 }; // Muted slate
  }
  if (key === '他' || key === '他事業所') {
    return { bgArgb: 'FFE2E8F0', fgArgb: 'FF334155', bold: true, fontSize: 10 }; // Neutral gray
  }
  if (key === '午前休' || key === '前休') {
    return { bgArgb: 'FFCCFBF1', fgArgb: 'FF0F766E', bold: true, fontSize: 10 }; // Teal
  }
  if (key === '午後休' || key === '後休') {
    return { bgArgb: 'FFE0F2FE', fgArgb: 'FF0369A1', bold: true, fontSize: 10 }; // Sky
  }
  if (key === '時間' || key.startsWith('time:')) {
    return { bgArgb: 'FFEDE9FE', fgArgb: 'FF581C87', bold: true, fontSize: 8 }; // Distinct purple for custom time shifts
  }

  // Check custom pattern
  const pat = patterns.find((p) => p.key === key);
  if (pat && pat.color) {
    return { bgArgb: toArgb(pat.color), fgArgb: 'FFFFFFFF', bold: true, fontSize: 9.5 };
  }

  return { bgArgb: 'FFFFFFFF', fgArgb: 'FF334155', bold: false, fontSize: 9.5 };
}

export async function exportShiftCalendarToExcel(state: AppState): Promise<void> {
  const { year, month, staff, shifts, facility, shiftPatterns, parsedRules } = state;
  const days = daysInMonth(year, month);
  const now = new Date();
  const createdDateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(
    now.getDate()
  ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = '介護シフトPRO';
  wb.created = now;

  // =========================================================================
  // 1. 勤務シフト表シート (掲示板用・A4横)
  // =========================================================================
  const ws = wb.addWorksheet('勤務シフト表', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape', // A4横
      fitToPage: true,
      fitToWidth: 1, // 横1ページに収める
      fitToHeight: 0, // 縦は行数に合わせて自然に収める
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.15,
        footer: 0.15,
      },
      showGridLines: true,
      horizontalCentered: true,
    },
    headerFooter: {
      oddHeader: `&L&B介護勤務シフト表 - ${facility.name}&R${year}年${month}月度`,
      oddFooter: '&C&P / &N ページ',
    },
  });

  // Calculate total columns:
  // Col 1: No (A)
  // Col 2: 氏名 (B)
  // Col 3 ~ 2+days: 1日〜days日 (C...)
  // Summary column: 出勤のみ
  const dayStartCol = 3;
  const dayEndCol = dayStartCol + days - 1;
  const sumCols = [
    { title: '出勤', key: 'workDays', width: 6.0 },
  ];
  const totalCols = dayEndCol + sumCols.length;

  // Set column widths
  ws.getColumn(1).width = 4.2; // No
  ws.getColumn(2).width = 15.0; // 氏名
  for (let c = dayStartCol; c <= dayEndCol; c++) {
    ws.getColumn(c).width = 6.4; // 日付列（職種・形態列の削除に伴い広めの幅を確保し、時間勤務の視認性を向上）
  }
  sumCols.forEach((sc, idx) => {
    ws.getColumn(dayEndCol + 1 + idx).width = sc.width;
  });

  // -------------------------------------------------------------------------
  // Header / Title Block (Row 1-2)
  // -------------------------------------------------------------------------
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 6; // Spacer

  // Title in Row 1
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `介護勤務シフト表　【${facility.name}】　${year}年${month}月度`;
  titleCell.font = { name: 'Meiryo', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Subtitle in Row 2
  const subCell = ws.getCell(2, 1);
  subCell.value = `定員: ${facility.users}名　|　出力日時: ${createdDateStr}　|　印刷サイズ: A4横`;
  subCell.font = { name: 'Meiryo', size: 8.5, color: { argb: 'FF64748B' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };

  // Approval Stamp Box (施設長 / 管理者 / 作成者) on top right
  const stampCol1 = totalCols - 2;
  const stampCol2 = totalCols - 1;
  const stampCol3 = totalCols;
  const stampLabels = ['施設長', '管理者', '作成者'];

  [stampCol1, stampCol2, stampCol3].forEach((col, idx) => {
    // Header
    const hCell = ws.getCell(1, col);
    hCell.value = stampLabels[idx];
    hCell.font = { name: 'Meiryo', size: 8, bold: true, color: { argb: 'FF475569' } };
    hCell.alignment = { vertical: 'middle', horizontal: 'center' };
    hCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    hCell.border = stampBorder;

    // Body (seal space)
    const bCell = ws.getCell(2, col);
    bCell.value = '';
    bCell.border = stampBorder;
  });

  // -------------------------------------------------------------------------
  // Table Header Rows (Row 4: Day numbers, Row 5: Weekdays)
  // -------------------------------------------------------------------------
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 18;

  // Fixed info headers (Merged across row 4 and 5)
  const fixedHeaders = [
    { col: 1, title: 'No.' },
    { col: 2, title: '氏名' },
  ];

  fixedHeaders.forEach((fh) => {
    ws.mergeCells(4, fh.col, 5, fh.col);
    const cell = ws.getCell(4, fh.col);
    cell.value = fh.title;
    cell.font = { name: 'Meiryo', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Deep Navy
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = headerBorder;
    ws.getCell(5, fh.col).border = headerBorder;
  });

  // Day columns (Row 4 = day number, Row 5 = weekday name)
  for (let d = 1; d <= days; d++) {
    const colIdx = dayStartCol + d - 1;
    const wIdx = dayOfWeekIdx(year, month, d);
    const wName = dayOfWeekName(year, month, d);

    const isSat = wIdx === 6;
    const isSun = wIdx === 0;

    // Day number cell
    const dCell = ws.getCell(4, colIdx);
    dCell.value = d;
    dCell.font = {
      name: 'Meiryo',
      size: 9.5,
      bold: true,
      color: { argb: isSat ? 'FF1E40AF' : isSun ? 'FFDC2626' : 'FF1E293B' },
    };
    dCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isSat ? 'FFDBEAFE' : isSun ? 'FFFEE2E2' : 'FFF1F5F9' },
    };
    dCell.alignment = { vertical: 'middle', horizontal: 'center' };
    dCell.border = headerBorder;

    // Weekday cell
    const wCell = ws.getCell(5, colIdx);
    wCell.value = wName;
    wCell.font = {
      name: 'Meiryo',
      size: 9,
      bold: true,
      color: { argb: isSat ? 'FF1E40AF' : isSun ? 'FFDC2626' : 'FF475569' },
    };
    wCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isSat ? 'FFEFF6FF' : isSun ? 'FFFFF1F2' : 'FFF8FAFC' },
    };
    wCell.alignment = { vertical: 'middle', horizontal: 'center' };
    wCell.border = headerBorder;
  }

  // Summary headers (Merged across row 4 and 5)
  sumCols.forEach((sc, idx) => {
    const colIdx = dayEndCol + 1 + idx;
    ws.mergeCells(4, colIdx, 5, colIdx);
    const cell = ws.getCell(4, colIdx);
    cell.value = sc.title;
    cell.font = { name: 'Meiryo', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = headerBorder;
    ws.getCell(5, colIdx).border = headerBorder;
  });

  // -------------------------------------------------------------------------
  // Staff Rows (Starting Row 6)
  // -------------------------------------------------------------------------
  let currentRow = 6;
  const staffStartRow = 6;

  staff.forEach((s, sIdx) => {
    ws.getRow(currentRow).height = 26; // 広めの行高にして時間指定勤務（2行表示）を見やすく配置

    // Col 1: No
    const noCell = ws.getCell(currentRow, 1);
    noCell.value = sIdx + 1;
    noCell.font = { name: 'Meiryo', size: 9, color: { argb: 'FF64748B' } };
    noCell.alignment = { vertical: 'middle', horizontal: 'center' };
    noCell.border = thinSlateBorder;

    // Col 2: Name
    const nameCell = ws.getCell(currentRow, 2);
    nameCell.value = s.name;
    nameCell.font = { name: 'Meiryo', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    nameCell.border = thinSlateBorder;

    let totalNetH = 0;
    let workDaysCount = 0;
    let nightCount = 0;
    let akeCount = 0;
    let paidCount = 0;
    let holidayCount = 0;

    // Daily Shift Cells
    for (let d = 1; d <= days; d++) {
      const colIdx = dayStartCol + d - 1;
      const rawVal = shifts[s.id]?.[d] || '公休';
      const cell = ws.getCell(currentRow, colIdx);

      const netH = getStaffDayNetH(s.id, d, rawVal, s.facilityId, shiftPatterns, parsedRules);
      totalNetH += netH;

      if (rawVal === '有休' || rawVal === '有') {
        paidCount++;
      } else if (rawVal === '明け' || rawVal === '明') {
        akeCount++;
      } else if (rawVal === '公休' || rawVal === '休') {
        holidayCount++;
      } else if (rawVal === '希望休' || rawVal === '希') {
        holidayCount++;
      } else if (rawVal === '他事業所' || rawVal === '他') {
        // other facility
      } else {
        workDaysCount++;
        const pat = getPatternByKey(rawVal, s.facilityId, shiftPatterns);
        if (rawVal === '夜' || rawVal === '夜勤' || isNight(pat)) {
          nightCount++;
        }
      }

      // Format display symbol (時間勤務は2行で見やすく表記、「他事業所」は「他」と表記)
      let dispSymbol = rawVal;
      if (rawVal === '他事業所') {
        dispSymbol = '他';
      } else if (rawVal.startsWith('time:')) {
        const tv = parseTimeVal(rawVal);
        dispSymbol = tv ? `${tv.start}\n~${tv.end}` : rawVal.replace('time:', '');
      }

      const style = getShiftCellStyle(rawVal, shiftPatterns);
      cell.value = dispSymbol;
      cell.font = {
        name: 'Meiryo',
        size: style.fontSize || 9.5,
        bold: style.bold,
        color: { argb: style.fgArgb },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: style.bgArgb },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinSlateBorder;
    }

    // Summary cells (「出勤」のみ配置)
    const sumValues = [workDaysCount];

    sumCols.forEach((sc, idx) => {
      const colIdx = dayEndCol + 1 + idx;
      const cell = ws.getCell(currentRow, colIdx);
      cell.value = sumValues[idx];
      cell.font = {
        name: 'Meiryo',
        size: 9.5,
        bold: true,
        color: { argb: 'FF1E3A8A' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: sIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = thinSlateBorder;
    });

    currentRow++;
  });

  const staffEndRow = currentRow - 1;

  // -------------------------------------------------------------------------
  // Daily Staffing Summary Rows (日別出勤者数集計)
  // 早番人数・日勤人数・遅番人数・夜勤人数の行を削除し、日中出勤・総出勤のみ表示
  // -------------------------------------------------------------------------
  const breakdownRows = [
    { label: '日中出勤人数', isDayTotal: true, bg: 'FFDBEAFE', textArgb: 'FF1E3A8A', isBold: true },
    { label: '1日総出勤人数', isGrandTotal: true, bg: 'FFE0E7FF', textArgb: 'FF312E81', isBold: true },
  ];

  breakdownRows.forEach((br, bIdx) => {
    ws.getRow(currentRow).height = br.isGrandTotal ? 22 : 18;

    // Label merged across Col 1 to 2
    ws.mergeCells(currentRow, 1, currentRow, 2);
    const labelCell = ws.getCell(currentRow, 1);
    labelCell.value = br.label;
    labelCell.font = {
      name: 'Meiryo',
      size: 9,
      bold: br.isBold || false,
      color: { argb: br.textArgb },
    };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: br.bg } };
    labelCell.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };

    const borderStyle = br.isGrandTotal ? doubleBottomBorder : bIdx === 0 ? totalTopBorder : thinSlateBorder;
    labelCell.border = borderStyle;
    ws.getCell(currentRow, 2).border = borderStyle;

    // Day counts
    for (let d = 1; d <= days; d++) {
      const colIdx = dayStartCol + d - 1;
      let count = 0;

      staff.forEach((s) => {
        const k = shifts[s.id]?.[d] || '公休';
        if (br.isDayTotal) {
          // Daytime work shift (早, 日, 遅 or custom daytime time)
          if (k === '早' || k === '日' || k === '遅') {
            count++;
          } else if (k.startsWith('time:')) {
            const tv = parseTimeVal(k);
            if (tv && tv.start >= '06:00' && tv.start < '18:00') {
              count++;
            }
          }
        } else if (br.isGrandTotal) {
          // Any working shift
          if (!SPECIAL_SHIFTS.includes(k as any)) {
            count++;
          }
        }
      });

      const cell = ws.getCell(currentRow, colIdx);
      cell.value = count;
      cell.font = {
        name: 'Meiryo',
        size: 9,
        bold: br.isBold || false,
        color: { argb: br.textArgb },
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: br.bg } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = borderStyle;
    }

    // Blank out summary columns on the right for breakdown rows
    sumCols.forEach((_, idx) => {
      const colIdx = dayEndCol + 1 + idx;
      const cell = ws.getCell(currentRow, colIdx);
      cell.value = '';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: br.bg } };
      cell.border = borderStyle;
    });

    currentRow++;
  });

  // -------------------------------------------------------------------------
  // Legend Section (凡例) Below Table
  // -------------------------------------------------------------------------
  currentRow += 2; // Blank row spacing
  ws.getRow(currentRow).height = 19;
  const legendTitleCell = ws.getCell(currentRow, 1);
  legendTitleCell.value = '【シフト記号 凡例】';
  legendTitleCell.font = { name: 'Meiryo', size: 9.5, bold: true, color: { argb: 'FF1E3A8A' } };

  currentRow++;
  ws.getRow(currentRow).height = 18;

  // Legend Headers
  const legendEndCol = 6;
  const lKeyHeader = ws.getCell(currentRow, 1);
  lKeyHeader.value = '記号';
  lKeyHeader.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
  lKeyHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  lKeyHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  lKeyHeader.border = thinSlateBorder;

  const lNameHeader = ws.getCell(currentRow, 2);
  lNameHeader.value = '名称';
  lNameHeader.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
  lNameHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  lNameHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  lNameHeader.border = thinSlateBorder;

  // 勤務時間帯（列統合）
  ws.mergeCells(currentRow, 3, currentRow, legendEndCol);
  const lTimeHeader = ws.getCell(currentRow, 3);
  lTimeHeader.value = '勤務時間帯';
  lTimeHeader.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
  lTimeHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  lTimeHeader.alignment = { vertical: 'middle', horizontal: 'center' };
  for (let c = 3; c <= legendEndCol; c++) {
    ws.getCell(currentRow, c).border = thinSlateBorder;
  }

  currentRow++;

  // Shift Patterns Legend Entries
  shiftPatterns.forEach((p) => {
    ws.getRow(currentRow).height = 18;
    const style = getShiftCellStyle(p.key, shiftPatterns);

    // Key
    const kCell = ws.getCell(currentRow, 1);
    kCell.value = p.key;
    kCell.font = { name: 'Meiryo', size: 9, bold: true, color: { argb: style.fgArgb } };
    kCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bgArgb } };
    kCell.alignment = { vertical: 'middle', horizontal: 'center' };
    kCell.border = thinSlateBorder;

    // Name
    const nCell = ws.getCell(currentRow, 2);
    nCell.value = p.name;
    nCell.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
    nCell.alignment = { vertical: 'middle', horizontal: 'center' };
    nCell.border = thinSlateBorder;

    // Time (列統合)
    ws.mergeCells(currentRow, 3, currentRow, legendEndCol);
    const tCell = ws.getCell(currentRow, 3);
    tCell.value = `${p.start} 〜 ${p.end}`;
    tCell.font = { name: 'Meiryo', size: 8.5, color: { argb: 'FF334155' } };
    tCell.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = 3; c <= legendEndCol; c++) {
      ws.getCell(currentRow, c).border = thinSlateBorder;
    }

    currentRow++;
  });

  // Special shifts in legend
  const specials = [
    { key: '明', name: '夜勤明け', time: '前日夜勤の退勤後（公休扱い）' },
    { key: '有', name: '有給休暇', time: '終日（有休取得）' },
    { key: '希', name: '希望休', time: '終日（職員希望による公休）' },
    { key: '休', name: '公休', time: '終日（所定休日）' },
    { key: '他', name: '他', time: '他事業所勤務（各事業所基準）' },
    { key: '前休', name: '午前休', time: '午前半日休暇（実働4.0h）' },
    { key: '後休', name: '午後休', time: '午後半日休暇（実働4.0h）' },
    { key: '時間', name: '時間指定勤務', time: '個別指定時間帯（例 12:30~16:00）' },
  ];

  specials.forEach((sp) => {
    ws.getRow(currentRow).height = 18;
    const style = getShiftCellStyle(sp.key, shiftPatterns);

    const kCell = ws.getCell(currentRow, 1);
    kCell.value = sp.key;
    kCell.font = { name: 'Meiryo', size: 9, bold: true, color: { argb: style.fgArgb } };
    kCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.bgArgb } };
    kCell.alignment = { vertical: 'middle', horizontal: 'center' };
    kCell.border = thinSlateBorder;

    const nCell = ws.getCell(currentRow, 2);
    nCell.value = sp.name;
    nCell.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
    nCell.alignment = { vertical: 'middle', horizontal: 'center' };
    nCell.border = thinSlateBorder;

    // Time (列統合)
    ws.mergeCells(currentRow, 3, currentRow, legendEndCol);
    const tCell = ws.getCell(currentRow, 3);
    tCell.value = sp.time;
    tCell.font = { name: 'Meiryo', size: 8.5, color: { argb: 'FF334155' } };
    tCell.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let c = 3; c <= legendEndCol; c++) {
      ws.getCell(currentRow, c).border = thinSlateBorder;
    }

    currentRow++;
  });

  // Freeze panes: keep headers and staff name pinned when viewing on PC
  ws.views = [
    {
      state: 'frozen',
      xSplit: 2, // Freeze No., Name
      ySplit: 5, // Freeze title & header rows
      showGridLines: true,
    },
  ];

  // =========================================================================
  // 2. 集計・法令遵守チェック シート (A4横)
  // =========================================================================
  const wsSum = wb.addWorksheet('月間集計・法令チェック', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2,
      },
      showGridLines: true,
    },
    headerFooter: {
      oddHeader: `&L&B月間集計・法令チェック - ${facility.name}&R${year}年${month}月度`,
      oddFooter: '&C&P / &N ページ',
    },
  });

  const summaries = computeStaffSummaries(state);
  const facilityChecks = runFacilityChecks(state);

  // Set column widths for sheet 2
  const sumSheetCols = [
    { col: 1, width: 4.5 }, // No
    { col: 2, width: 14 }, // 氏名
    { col: 3, width: 12 }, // 職種
    { col: 4, width: 7.5 }, // スキル
    { col: 5, width: 7.5 }, // 専従/兼務
    { col: 6, width: 7.5 }, // 出勤日数
    { col: 7, width: 7.5 }, // 有休取得
    { col: 8, width: 7.5 }, // 夜勤回数
    { col: 9, width: 8.5 }, // 最大連勤
    { col: 10, width: 9.5 }, // 総実労働h
    { col: 11, width: 9.5 }, // 週平均h
    { col: 12, width: 9.5 }, // 常勤換算
    { col: 13, width: 12.5 }, // 36協定判定
  ];
  sumSheetCols.forEach((c) => {
    wsSum.getColumn(c.col).width = c.width;
  });

  // Sheet 2 Title
  wsSum.getRow(1).height = 24;
  const s2Title = wsSum.getCell(1, 1);
  s2Title.value = `職員別 月間勤務集計表　【${facility.name}】　${year}年${month}月度`;
  s2Title.font = { name: 'Meiryo', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  s2Title.alignment = { vertical: 'middle', horizontal: 'left' };

  wsSum.getRow(2).height = 16;
  const s2Sub = wsSum.getCell(2, 1);
  s2Sub.value = `定員: ${facility.users}名　|　発行日: ${createdDateStr}`;
  s2Sub.font = { name: 'Meiryo', size: 8.5, color: { argb: 'FF64748B' } };

  // Headers (Row 4)
  wsSum.getRow(4).height = 20;
  const s2Headers = [
    'No.',
    '氏名',
    '職種',
    'スキル',
    '区分',
    '出勤日数',
    '有休取得',
    '夜勤回数',
    '最大連勤',
    '総労働時間',
    '週平均時間',
    '常勤換算',
    '36協定判定',
  ];

  s2Headers.forEach((h, idx) => {
    const cell = wsSum.getCell(4, idx + 1);
    cell.value = h;
    cell.font = { name: 'Meiryo', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = headerBorder;
  });

  // Staff rows
  let s2Row = 5;
  summaries.forEach((sum, idx) => {
    wsSum.getRow(s2Row).height = 19;
    const isEven = idx % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    const vals = [
      idx + 1,
      sum.name,
      sum.role,
      `Lv.${sum.mat}`,
      sum.dedicated ? '専従' : '兼務',
      sum.workDays,
      sum.paidLeaveCount,
      sum.nightShiftCount,
      `${sum.maxConsecutive}日`,
      Number(sum.totalNetHours.toFixed(1)),
      Number(sum.avgWeeklyHours.toFixed(1)),
      Number(sum.fte),
      sum.over36 ? '⚠️ 40h超過注意' : '✅ 法定内適正',
    ];

    vals.forEach((v, cIdx) => {
      const cell = wsSum.getCell(s2Row, cIdx + 1);
      cell.value = v;
      cell.font = {
        name: 'Meiryo',
        size: 9,
        bold: cIdx === 1 || cIdx >= 9,
        color: {
          argb:
            cIdx === 12
              ? sum.over36
                ? 'FFDC2626'
                : 'FF059669'
              : cIdx >= 9
              ? 'FF1E3A8A'
              : 'FF1E293B',
        },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb:
            cIdx === 12
              ? sum.over36
                ? 'FFFEE2E2'
                : 'FFECFDF5'
              : bgArgb,
        },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: cIdx === 1 ? 'left' : 'center',
        indent: cIdx === 1 ? 1 : 0,
      };
      cell.border = thinSlateBorder;
    });

    s2Row++;
  });

  // Facility staffing criteria checks section
  s2Row += 2;
  wsSum.getRow(s2Row).height = 22;
  const fcTitle = wsSum.getCell(s2Row, 1);
  fcTitle.value = '【人員配置基準 適合判定（厚生労働省指定基準）】';
  fcTitle.font = { name: 'Meiryo', size: 11, bold: true, color: { argb: 'FF1E3A8A' } };

  s2Row++;
  wsSum.getRow(s2Row).height = 16;
  const fcNote = wsSum.getCell(s2Row, 1);
  fcNote.value =
    '※管理者（管理職業務分）および計画作成担当者の専従時間は介護職直接処遇基準から控除して算定しています。';
  fcNote.font = { name: 'Meiryo', size: 8, color: { argb: 'FF64748B' } };

  s2Row++;
  wsSum.getRow(s2Row).height = 19;
  const fcHeaders = ['事業所名 / 区分', '判定基準項目', '指定基準要件', '当月実績値', '適合判定'];
  fcHeaders.forEach((h, idx) => {
    const colIdx = idx === 0 ? 1 : idx === 1 ? 3 : idx === 2 ? 6 : idx === 3 ? 9 : 12;
    const mergeTo = idx === 0 ? 2 : idx === 1 ? 5 : idx === 2 ? 8 : idx === 3 ? 11 : 13;
    wsSum.mergeCells(s2Row, colIdx, s2Row, mergeTo);
    const cell = wsSum.getCell(s2Row, colIdx);
    cell.value = h;
    cell.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = headerBorder;
    for (let c = colIdx; c <= mergeTo; c++) wsSum.getCell(s2Row, c).border = headerBorder;
  });

  s2Row++;

  facilityChecks.forEach((fc) => {
    fc.checks.forEach((c) => {
      wsSum.getRow(s2Row).height = 18;

      // Facility name
      wsSum.mergeCells(s2Row, 1, s2Row, 2);
      const fCell = wsSum.getCell(s2Row, 1);
      fCell.value = `${fc.facilityName}`;
      fCell.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
      fCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      fCell.border = thinSlateBorder;
      wsSum.getCell(s2Row, 2).border = thinSlateBorder;

      // Check item
      wsSum.mergeCells(s2Row, 3, s2Row, 5);
      const cCell = wsSum.getCell(s2Row, 3);
      cCell.value = c.label;
      cCell.font = { name: 'Meiryo', size: 8.5, color: { argb: 'FF1E293B' } };
      cCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      cCell.border = thinSlateBorder;
      for (let ci = 3; ci <= 5; ci++) wsSum.getCell(s2Row, ci).border = thinSlateBorder;

      // Req
      wsSum.mergeCells(s2Row, 6, s2Row, 8);
      const rCell = wsSum.getCell(s2Row, 6);
      rCell.value = c.req;
      rCell.font = { name: 'Meiryo', size: 8.5, color: { argb: 'FF475569' } };
      rCell.alignment = { vertical: 'middle', horizontal: 'center' };
      rCell.border = thinSlateBorder;
      for (let ci = 6; ci <= 8; ci++) wsSum.getCell(s2Row, ci).border = thinSlateBorder;

      // Actual
      wsSum.mergeCells(s2Row, 9, s2Row, 11);
      const aCell = wsSum.getCell(s2Row, 9);
      aCell.value = c.actual;
      aCell.font = { name: 'Meiryo', size: 8.5, bold: true, color: { argb: 'FF1E3A8A' } };
      aCell.alignment = { vertical: 'middle', horizontal: 'center' };
      aCell.border = thinSlateBorder;
      for (let ci = 9; ci <= 11; ci++) wsSum.getCell(s2Row, ci).border = thinSlateBorder;

      // Result
      wsSum.mergeCells(s2Row, 12, s2Row, 13);
      const resCell = wsSum.getCell(s2Row, 12);
      resCell.value = c.passed ? '✅ 基準適合' : '❌ 要改善';
      resCell.font = {
        name: 'Meiryo',
        size: 8.5,
        bold: true,
        color: { argb: c.passed ? 'FF059669' : 'FFDC2626' },
      };
      resCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: c.passed ? 'FFECFDF5' : 'FFFEE2E2' },
      };
      resCell.alignment = { vertical: 'middle', horizontal: 'center' };
      resCell.border = thinSlateBorder;
      wsSum.getCell(s2Row, 13).border = thinSlateBorder;

      s2Row++;
    });
  });

  // Freeze panes on sheet 2
  wsSum.views = [
    {
      state: 'frozen',
      ySplit: 4,
      xSplit: 2,
      showGridLines: true,
    },
  ];

  // -------------------------------------------------------------------------
  // File Download Execution
  // -------------------------------------------------------------------------
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `介護勤務シフト表_${facility.name}_${year}年${month}月度.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
