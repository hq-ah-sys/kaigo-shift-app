import { Facility, ShiftPattern, Staff, AppState } from '../types';
import { FACILITY_TYPES } from '../constants';

export function downloadCSV(rows: (string | number)[][], filename: string): void {
  const csvContent = rows
    .map((row) =>
      row
        .map((val) => {
          const str = String(val === null || val === undefined ? '' : val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseCSV(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  });
}

// Facility CSV
export const FACILITY_CSV_HEADERS = [
  '事業所名',
  '種別ID',
  '種別名',
  '利用者数',
  '営業曜日（0日〜6土 /区切り、通所介護のみ）',
  '営業開始時刻（通所介護のみ）',
  '営業終了時刻（通所介護のみ）',
];

export function exportFacilitiesCSV(facilities: Facility[]): void {
  const rows: (string | number)[][] = [FACILITY_CSV_HEADERS];
  facilities.forEach((fc) => {
    const ft = FACILITY_TYPES.find((t) => t.id === fc.typeId);
    const bizDays = fc.bizDays ? fc.bizDays.join('/') : fc.typeId === 'dayservice' ? '1/2/3/4/5' : '';
    rows.push([
      fc.name,
      fc.typeId,
      ft?.name || '',
      fc.users || 0,
      bizDays,
      fc.openTime || '',
      fc.closeTime || '',
    ]);
  });
  downloadCSV(rows, '事業所マスタ.csv');
}

export function downloadFacilityTemplate(): void {
  const rows: (string | number)[][] = [
    FACILITY_CSV_HEADERS,
    ['グループホーム さくら', 'grouphome', 'グループホーム（認知症対応型）', 9, '', '', ''],
    ['デイサービス ひまわり', 'dayservice', '通所介護（デイサービス）', 20, '1/2/3/4/5', '09:00', '17:00'],
    ['訪問介護 なでしこ', 'houmon', '訪問介護', 15, '', '', ''],
  ];
  downloadCSV(rows, '事業所マスタ_テンプレート.csv');
}

// Staff CSV
export const STAFF_CSV_HEADERS = [
  '氏名',
  '雇用形態',
  '専従/兼務',
  '職種（/区切り）',
  '資格（/区切り）',
  '週所定時間',
  '夜勤（可能/夜勤のみ/不可）',
  '出勤可能曜日（月〜日 /区切り、空白=制限なし）',
  '時間帯指定（有/無）',
  '出勤可能時間_開始',
  '出勤可能時間_終了',
  'スキルレベル（1〜5）',
  '特記事項',
];

export function formatAvailDaysForCSV(availDays?: number[]): string {
  // 制限なし（未設定または全曜日7日）の場合は空白を出力
  if (!availDays || availDays.length === 0 || availDays.length >= 7) {
    return '';
  }
  const WDS = ['日', '月', '火', '水', '木', '金', '土'];
  return availDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WDS[d])
    .filter(Boolean)
    .join('/');
}

export function parseAvailDays(str?: string): number[] {
  if (!str) return [0, 1, 2, 3, 4, 5, 6];
  const trimmed = str.trim();
  if (trimmed === '' || trimmed === '制限なし' || trimmed === '全曜日' || trimmed === '全日') {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (trimmed === '平日') {
    return [1, 2, 3, 4, 5];
  }
  if (trimmed === '土日' || trimmed === '週末') {
    return [0, 6];
  }

  const DAY_MAP: Record<string, number> = {
    日: 0,
    日曜日: 0,
    '0': 0,
    月: 1,
    月曜日: 1,
    '1': 1,
    火: 2,
    火曜日: 2,
    '2': 2,
    水: 3,
    水曜日: 3,
    '3': 3,
    木: 4,
    木曜日: 4,
    '4': 4,
    金: 5,
    金曜日: 5,
    '5': 5,
    土: 6,
    土曜日: 6,
    '6': 6,
  };

  const tokens = trimmed.split(/[/,、・\s]+/).map((s) => s.trim()).filter(Boolean);
  const result: number[] = [];
  tokens.forEach((t) => {
    if (DAY_MAP[t] !== undefined && !result.includes(DAY_MAP[t])) {
      result.push(DAY_MAP[t]);
    }
  });

  return result.length > 0 ? result.sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
}

export function exportStaffCSV(staff: Staff[], facilityName?: string): void {
  const rows: (string | number)[][] = [STAFF_CSV_HEADERS];
  staff.forEach((s) => {
    const roles = (Array.isArray(s.roles) && s.roles.length > 0 ? s.roles : [s.role || '介護職員']).join('/');
    const quals = (Array.isArray(s.quals) && s.quals.length > 0 ? s.quals : [s.qual || '資格なし']).join('/');
    const availDaysStr = formatAvailDaysForCSV(s.availDays);
    const nightVal = s.nightOnly ? '夜勤のみ' : s.night ? '可能' : '不可';
    const timeEnabledStr = s.availTimeEnabled ? '有' : '無';
    const startTimeStr = s.availTimeEnabled && s.availStart ? s.availStart : '';
    const endTimeStr = s.availTimeEnabled && s.availEnd ? s.availEnd : '';

    rows.push([
      s.name,
      s.type || '常勤',
      s.dedicated ? '専従' : '兼務',
      roles,
      quals,
      s.hours || 40,
      nightVal,
      availDaysStr,
      timeEnabledStr,
      startTimeStr,
      endTimeStr,
      s.mat || 3,
      s.comment || '',
    ]);
  });
  downloadCSV(rows, `職員マスタ${facilityName ? `_${facilityName}` : ''}.csv`);
}

export function downloadStaffTemplate(): void {
  const rows: (string | number)[][] = [
    STAFF_CSV_HEADERS,
    [
      '田中 美咲',
      '常勤',
      '専従',
      '介護職員',
      '介護福祉士',
      40,
      '可能',
      '',
      '無',
      '',
      '',
      5,
      'リーダー対応可',
    ],
    [
      '山田 花子',
      '非常勤',
      '専従',
      '介護職員',
      '初任者研修',
      24,
      '不可',
      '月/火/水/木/金',
      '有',
      '09:00',
      '17:00',
      2,
      '平日日勤のみ',
    ],
    [
      '小林 誠',
      'パート',
      '専従',
      '介護職員',
      '資格なし',
      16,
      '不可',
      '月/水/金',
      '有',
      '09:00',
      '15:00',
      2,
      '午前・昼パート',
    ],
  ];
  downloadCSV(rows, '職員マスタ_テンプレート.csv');
}

// Patterns CSV
export const PATTERN_CSV_HEADERS = [
  '表示記号',
  'パターン名',
  '開始時刻',
  '終了時刻',
  '色（#RRGGBB）',
  'シフト表示（default/key/time）',
];

export function exportPatternsCSV(patterns: ShiftPattern[]): void {
  const rows: (string | number)[][] = [PATTERN_CSV_HEADERS];
  patterns.forEach((p) => {
    rows.push([
      p.key,
      p.name,
      p.start,
      p.end,
      p.color || '#2563eb',
      p.dispMode || 'default',
    ]);
  });
  downloadCSV(rows, 'シフトパターン.csv');
}

export function downloadPatternTemplate(): void {
  const rows: (string | number)[][] = [
    PATTERN_CSV_HEADERS,
    ['早', '早番', '07:00', '16:00', '#f59e0b', 'default'],
    ['日', '日勤', '09:00', '18:00', '#2563eb', 'default'],
    ['遅', '遅番', '13:00', '22:00', '#7c3aed', 'default'],
    ['夜', '夜勤', '17:00', '09:00', '#0f172a', 'default'],
  ];
  downloadCSV(rows, 'シフトパターン_テンプレート.csv');
}

// Preferences CSV
export const PREF_CSV_HEADERS = ['職員名', '日付(YYYY/MM/DD)', '希望内容(有休/希望休/time:HH:MM-HH:MM)'];

export function exportPreferencesCSV(state: AppState): void {
  const { year, month, staff, preferences } = state;
  const rows: (string | number)[][] = [PREF_CSV_HEADERS];
  const mm = String(month).padStart(2, '0');

  staff.forEach((s) => {
    const sp = preferences[s.id] || {};
    Object.entries(sp)
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
      .forEach(([d, val]) => {
        const dd = String(d).padStart(2, '0');
        rows.push([s.name, `${year}/${mm}/${dd}`, val]);
      });
  });

  downloadCSV(rows, `希望入力_${year}年${month}月.csv`);
}

export function downloadPrefTemplate(year: number, month: number): void {
  const mm = String(month).padStart(2, '0');
  const rows: (string | number)[][] = [
    PREF_CSV_HEADERS,
    ['田中 美咲', `${year}/${mm}/05`, '有休'],
    ['鈴木 健太', `${year}/${mm}/10`, '希望休'],
    ['山田 花子', `${year}/${mm}/15`, 'time:09:00-17:00'],
  ];
  downloadCSV(rows, '希望入力_テンプレート.csv');
}
