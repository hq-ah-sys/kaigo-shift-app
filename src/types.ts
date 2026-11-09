export type FacilityTypeId =
  | 'tokutei'
  | 'grouphome'
  | 'dayservice'
  | 'houmon'
  | 'yuryou'
  | 'jihi_houmon'
  | 'jihi_day';

export interface FacilityCheck {
  label: string;
  req: string;
  minPerDay?: number;
  minTotal?: number;
  minFTE?: number;
  roles: string[];
}

export interface FacilityTypeConfig {
  id: FacilityTypeId;
  name: string;
  icon: string;
  nightRequired: boolean;
  ratio: number | null;
  ratioRoles: string[];
  checks: FacilityCheck[];
}

export interface Facility {
  id: number;
  name: string;
  typeId: FacilityTypeId;
  users: number;
  bizDays?: number[]; // [0..6] for day service
  openTime?: string;
  closeTime?: string;
}

export interface Staff {
  id: number;
  facilityId: number; // Facility ID
  name: string;
  type: '常勤' | '非常勤' | 'パート';
  dedicated: boolean; // 専従 (true) vs 同事業所内兼務 (false)
  roles: string[]; // 担当職種リスト (e.g. ['管理者', '介護職員'])
  quals: string[];
  role: string; // メイン職種
  qual: string; // メイン資格
  hours: number;
  night: boolean;
  nightOnly: boolean;
  mat: number; // 1..5
  availDays: number[]; // 0: Sun, 1: Mon, ..., 6: Sat (empty = unrestricted)
  availTimeEnabled: boolean;
  availStart: string | null;
  availEnd: string | null;
  comment?: string;

  // 時間配分設定 (Intra-facility multi-role daily hour allocation)
  roleHours?: Record<string, number>; // 例: { '管理者': 4, '介護職員': 4 }

  // 他事業所との兼務設定 (Inter-facility concurrent position settings)
  otherFacilityConcurrent?: boolean; // 他事業所（別施設）との兼務の有無
  otherFacilityName?: string; // 兼務先事業所名 (例: デイサービスあおい, 訪問介護サクラ)
  interFacilityScheduleType?: 'dow' | 'date'; // 当事業所の出勤指定方式 ('dow': 曜日設定 - デフォルト, 'date': 日付設定)
  interFacilityDays?: number[]; // 当事業所出勤曜日 (0:日〜6:土)
  interFacilityDates?: number[]; // 当事業所出勤日付 (1〜31)
}

export interface ShiftPattern {
  id: number;
  facilityId: number | null;
  key: string;
  name: string;
  start: string;
  end: string;
  color: string;
  dispMode?: 'default' | 'key' | 'time';
}

export interface Pair {
  type: 'forbidden' | 'recommended';
  a: number; // Staff ID
  b: number; // Staff ID
}

export interface ParsedRule {
  id: string;
  text: string;
  staffName?: string;
  staffId?: number;
  secondStaffName?: string;
  secondStaffId?: number;
  ruleType:
    | 'specific_dow_work'
    | 'specific_dow_leave'
    | 'specific_date_work'
    | 'specific_date_leave'
    | 'specific_pattern'
    | 'exclude_pattern'
    | 'night_limit'
    | 'must_fill_hours'
    | 'deduct_hours'
    | 'max_days'
    | 'max_consecutive'
    | 'pair_override'
    | 'specific_date_time'
    | 'custom_label';
  hours?: number;
  maxDays?: number;
  maxConsecutive?: number;
  maxNightPerWeek?: number;
  maxNightPerMonth?: number;
  dates?: number[];
  dows?: number[]; // 0: 日, 1: 月, 2: 火, 3: 水, 4: 木, 5: 金, 6: 土
  shiftKey?: string;
  explicitShiftKey?: boolean;
  onlyThisPattern?: boolean;
  pairType?: 'forbidden' | 'recommended';
  timeStart?: string;
  timeEnd?: string;
  customLabel?: string;
}

export interface AIConfig {
  provider: 'gemini' | 'claude';
  geminiKey: string;
  geminiModel: string;
  claudeKey: string;
  claudeModel: string;
}

export interface AppState {
  version: string;
  year: number;
  month: number;
  facility: Facility; // Single facility
  facilities: Facility[]; // Kept as single-item array for backwards compatibility
  activeFacilityId: number;
  staff: Staff[];
  shiftPatterns: ShiftPattern[];
  preferences: Record<number, Record<number, string>>; // staffId -> day -> shiftKey or 'time:...'
  shifts: Record<number, Record<number, string>>; // staffId -> day -> shiftKey
  pairs: Pair[];
  lockedStaff: number[]; // staffIds that should not be altered during re-generation
  dispMode: 'key' | 'time';
  patDispMode: 'key' | 'time';
  aiConfig: AIConfig;
  parsedRules: ParsedRule[];
  nextFacId: number;
  nextStaffId: number;
  nextPatId: number;
  
  // 月別データ保持 (Key: "YYYY-M")
  monthlyShifts?: Record<string, Record<number, Record<number, string>>>;
  monthlyPreferences?: Record<string, Record<number, Record<number, string>>>;
  
  // ローカル保存先・ストレージ設定
  storageLocation?: 'localstorage' | 'custom_file';
  storageCustomName?: string;
  customPatternColors?: string[];
}
