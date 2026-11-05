import { FacilityTypeConfig, AppState, Facility } from './types';

export const APP_VERSION = 'v1.0.36';

export const SPECIAL_SHIFTS = ['有休', '希望休', '公休', '明け', '他事業所', '午前休', '午後休'] as const;

export const SP_COLOR: Record<string, string> = {
  有休: '#10b981', // Emerald green
  希望休: '#f59e0b', // Amber
  公休: '#e2e8f0', // Slate 200
  明け: '#93c5fd', // Blue 300
  他事業所: '#e2e8f0', // Light gray matching 公休
  午前休: '#14b8a6', // Teal
  午後休: '#0284c7', // Sky Blue
};

export const SP_TEXT_COLOR: Record<string, string> = {
  有休: '#ffffff',
  希望休: '#78350f',
  公休: '#475569',
  明け: '#1e3a8a',
  他事業所: '#475569', // Dark text matching 公休
  午前休: '#ffffff',
  午後休: '#ffffff',
};

export const SP_SHORT: Record<string, string> = {
  有休: '有',
  希望休: '希',
  公休: '休',
  明け: '明',
  他事業所: '他',
  午前休: '前休',
  午後休: '後休',
};

export const MAT_LABEL: Record<number, string> = {
  1: '新人',
  2: '初級',
  3: '中堅',
  4: '上級',
  5: 'ベテラン',
};

export const MAT_STARS = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];

export const MAT_COLOR: Record<number, string> = {
  1: '#ef4444',
  2: '#f59e0b',
  3: '#eab308',
  4: '#10b981',
  5: '#3b82f6',
};

export const PATTERN_COLORS = [
  '#2563eb', // Blue
  '#f59e0b', // Amber
  '#7c3aed', // Purple
  '#0f172a', // Slate Night
  '#db2777', // Pink
  '#0d9488', // Teal
  '#dc2626', // Red
  '#16a34a', // Green
  '#ea580c', // Orange
  '#4f46e5', // Indigo
  '#0284c7', // Sky Blue
  '#059669', // Emerald
  '#d97706', // Amber dark
  '#9333ea', // Purple dark
  '#e11d48', // Rose
  '#475569', // Slate
  '#0891b2', // Cyan
  '#65a30d', // Lime
  '#c026d3', // Fuchsia
  '#57534e', // Stone
];

export const FACILITY_TYPES: FacilityTypeConfig[] = [
  {
    id: 'grouphome',
    name: 'グループホーム（認知症対応型）',
    icon: '🏠',
    nightRequired: true,
    ratio: 3,
    ratioRoles: ['介護職員'],
    checks: [
      { label: '介護職員（日中）', req: '利用者3人に1人以上', minPerDay: 3, roles: ['介護職員'] },
      { label: '計画作成担当者', req: '1人（ケアマネ）', minTotal: 1, roles: ['計画作成担当者', '介護支援専門員'] },
      { label: '管理者', req: '常勤専従1人', minTotal: 1, roles: ['管理者'] },
    ],
  },
  {
    id: 'tokutei',
    name: '特定施設入居者生活介護',
    icon: '🏨',
    nightRequired: true,
    ratio: 3,
    ratioRoles: ['介護職員', '看護職員'],
    checks: [
      { label: '介護・看護職員', req: '要介護者3人に1人以上', minPerDay: 2, roles: ['介護職員', '看護職員'] },
      { label: '看護職員', req: '入居者30人以下: 1人以上', minTotal: 1, roles: ['看護職員'] },
      { label: '生活相談員', req: '常勤専従1人以上', minTotal: 1, roles: ['生活相談員'] },
      { label: '機能訓練指導員', req: '1人以上', minTotal: 1, roles: ['機能訓練指導員'] },
      { label: '管理者', req: '常勤専従1人', minTotal: 1, roles: ['管理者'] },
    ],
  },
  {
    id: 'dayservice',
    name: '通所介護（デイサービス）',
    icon: '☀️',
    nightRequired: false,
    ratio: 15,
    ratioRoles: ['介護職員'],
    checks: [
      { label: '介護職員', req: '利用者15人に1人以上', minPerDay: 2, roles: ['介護職員'] },
      { label: '看護職員', req: '専従1人以上', minTotal: 1, roles: ['看護職員'] },
      { label: '生活相談員', req: '専従1人以上', minTotal: 1, roles: ['生活相談員'] },
      { label: '機能訓練指導員', req: '1人以上', minTotal: 1, roles: ['機能訓練指導員'] },
    ],
  },
  {
    id: 'houmon',
    name: '訪問介護',
    icon: '🚗',
    nightRequired: false,
    ratio: null,
    ratioRoles: [],
    checks: [
      { label: '訪問介護員', req: '常勤換算2.5人以上', minFTE: 2.5, roles: ['介護職員'] },
      { label: 'サービス提供責任者', req: '利用者40人に1人', minTotal: 1, roles: ['サービス提供責任者'] },
      { label: '管理者', req: '常勤専従1人', minTotal: 1, roles: ['管理者'] },
    ],
  },
  {
    id: 'yuryou',
    name: '有料老人ホーム',
    icon: '🏡',
    nightRequired: true,
    ratio: 3,
    ratioRoles: ['介護職員', '看護職員'],
    checks: [
      { label: '介護・看護職員', req: '入居者3人に1人以上', minPerDay: 2, roles: ['介護職員', '看護職員'] },
      { label: '管理者', req: '常勤1人', minTotal: 1, roles: ['管理者'] },
    ],
  },
  {
    id: 'jihi_houmon',
    name: '自費サービス（訪問）',
    icon: '🚶',
    nightRequired: false,
    ratio: null,
    ratioRoles: [],
    checks: [
      { label: '訪問スタッフ', req: '1人以上', minTotal: 1, roles: ['介護職員'] },
    ],
  },
  {
    id: 'jihi_day',
    name: '自費サービス（デイ）',
    icon: '🌞',
    nightRequired: false,
    ratio: null,
    ratioRoles: [],
    checks: [
      { label: 'スタッフ', req: '十分な人員配置', minPerDay: 1, roles: ['介護職員'] },
    ],
  },
];

export const ALL_ROLES = [
  '介護職員',
  '看護職員',
  '生活相談員',
  '機能訓練指導員',
  '管理者',
  '計画作成担当者',
  'サービス提供責任者',
  '認知症対応型専門員',
  '介護支援専門員',
  '事務員',
];

export const ALL_QUALS = [
  '介護福祉士',
  '社会福祉士',
  '看護師',
  '准看護師',
  'ケアマネージャー',
  '主任ケアマネ',
  '初任者研修',
  '実務者研修',
  '理学療法士',
  '作業療法士',
  '管理栄養士',
  '栄養士',
  '資格なし',
];

export function getInitialDemoState(): AppState {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const defaultFacility: Facility = {
    id: 1,
    name: 'グループホーム さくら',
    typeId: 'grouphome',
    users: 9,
  };

  return {
    version: APP_VERSION,
    year,
    month,
    facility: defaultFacility,
    facilities: [defaultFacility],
    activeFacilityId: 1,
    dispMode: 'key',
    patDispMode: 'key',
    nextFacId: 2,
    nextStaffId: 11,
    nextPatId: 5,
    lockedStaff: [],
    parsedRules: [],
    customPatternColors: [],
    aiConfig: {
      provider: 'gemini',
      geminiKey: '',
      geminiModel: 'gemini-2.5-flash',
      claudeKey: '',
      claudeModel: 'claude-3-7-sonnet-20250219',
    },
    shiftPatterns: [
      { id: 1, facilityId: 1, key: '早', name: '早番', start: '07:00', end: '16:00', color: '#f59e0b', dispMode: 'default' },
      { id: 2, facilityId: 1, key: '日', name: '日勤', start: '09:00', end: '18:00', color: '#2563eb', dispMode: 'default' },
      { id: 3, facilityId: 1, key: '遅', name: '遅番', start: '13:00', end: '22:00', color: '#7c3aed', dispMode: 'default' },
      { id: 4, facilityId: 1, key: '夜', name: '夜勤', start: '17:00', end: '09:00', color: '#0f172a', dispMode: 'default' },
    ],
    staff: [
      {
        id: 1,
        facilityId: 1,
        name: '田中 美咲',
        type: '常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['介護福祉士'],
        role: '介護職員',
        qual: '介護福祉士',
        hours: 40,
        night: true,
        nightOnly: false,
        mat: 5,
        availDays: [0, 1, 2, 3, 4, 5, 6],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
        comment: '介護リーダー',
      },
      {
        id: 2,
        facilityId: 1,
        name: '鈴木 健太',
        type: '常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['介護福祉士'],
        role: '介護職員',
        qual: '介護福祉士',
        hours: 40,
        night: true,
        nightOnly: false,
        mat: 4,
        availDays: [0, 1, 2, 3, 4, 5, 6],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
        comment: '夜勤リーダー対応',
      },
      {
        id: 3,
        facilityId: 1,
        name: '佐藤 由美',
        type: '常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['実務者研修'],
        role: '介護職員',
        qual: '実務者研修',
        hours: 40,
        night: true,
        nightOnly: false,
        mat: 3,
        availDays: [1, 2, 3, 4, 5, 6],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
      },
      {
        id: 4,
        facilityId: 1,
        name: '山田 花子',
        type: '非常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['初任者研修'],
        role: '介護職員',
        qual: '初任者研修',
        hours: 24,
        night: false,
        nightOnly: false,
        mat: 2,
        availDays: [1, 2, 3, 4, 5],
        availTimeEnabled: true,
        availStart: '09:00',
        availEnd: '17:00',
        comment: '平日日勤専門',
      },
      {
        id: 5,
        facilityId: 1,
        name: '木村 正男',
        type: '常勤',
        dedicated: false, // 同事業所内兼務 (管理者兼介護職員)
        roles: ['管理者', '介護職員'],
        roleHours: { 管理者: 4, 介護職員: 4 },
        quals: ['介護福祉士'],
        role: '管理者',
        qual: '介護福祉士',
        hours: 40,
        night: false,
        nightOnly: false,
        mat: 5,
        availDays: [1, 2, 3, 4, 5],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
        comment: '管理者/介護職 兼務 (管理者4h/介護職4h)',
      },
      {
        id: 6,
        facilityId: 1,
        name: '中川 明子',
        type: '常勤',
        dedicated: false, // 同事業所内兼務 (計画作成担当者兼介護職員)
        roles: ['計画作成担当者', '介護職員'],
        roleHours: { 計画作成担当者: 4, 介護職員: 4 },
        quals: ['介護福祉士'],
        role: '計画作成担当者',
        qual: '介護福祉士',
        hours: 40,
        night: false,
        nightOnly: false,
        mat: 4,
        availDays: [1, 2, 3, 4, 5],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
        comment: '計画作成/介護職 兼務 (計画作成4h/介護職4h)',
      },
      {
        id: 7,
        facilityId: 1,
        name: '高橋 健二',
        type: '常勤',
        dedicated: false, // 両方パターン: 同事業所内兼務 (計画作成/介護職) & 他事業所兼務 (特養ひまわり)
        roles: ['計画作成担当者', '介護職員'],
        roleHours: { 計画作成担当者: 3, 介護職員: 5 },
        quals: ['介護福祉士'],
        role: '介護職員',
        qual: '介護福祉士',
        hours: 40,
        night: true,
        nightOnly: false,
        mat: 4,
        availDays: [0, 1, 2, 3, 4, 5, 6],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
        comment: '両方兼務 (同事業所内兼務 & 他事業所兼務)',
        otherFacilityConcurrent: true,
        otherFacilityName: '特養 ひまわり',
        interFacilityScheduleType: 'dow',
        interFacilityDays: [1, 2, 3, 4, 5, 6], // 当事業所出勤曜日
      },
      {
        id: 8,
        facilityId: 1,
        name: '渡辺 裕子',
        type: '常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['実務者研修'],
        role: '介護職員',
        qual: '実務者研修',
        hours: 40,
        night: true,
        nightOnly: false,
        mat: 3,
        availDays: [0, 1, 2, 3, 4, 5, 6],
        availTimeEnabled: false,
        availStart: null,
        availEnd: null,
      },
      {
        id: 9,
        facilityId: 1,
        name: '小林 誠',
        type: '非常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['初任者研修'],
        role: '介護職員',
        qual: '初任者研修',
        hours: 20,
        night: false,
        nightOnly: false,
        mat: 2,
        availDays: [1, 3, 5],
        availTimeEnabled: true,
        availStart: '09:00',
        availEnd: '17:00',
        comment: '他事業所兼務 (曜日指定: 月水金)',
        otherFacilityConcurrent: true,
        otherFacilityName: 'デイサービス あおい',
        interFacilityScheduleType: 'dow',
        interFacilityDays: [1, 3, 5], // 月・水・金が当事業所
      },
      {
        id: 10,
        facilityId: 1,
        name: '伊藤 綾乃',
        type: '非常勤',
        dedicated: true,
        roles: ['介護職員'],
        quals: ['初任者研修'],
        role: '介護職員',
        qual: '初任者研修',
        hours: 16,
        night: false,
        nightOnly: false,
        mat: 2,
        availDays: [2, 4, 6],
        availTimeEnabled: true,
        availStart: '09:00',
        availEnd: '17:00',
        comment: '他事業所兼務 (日付指定)',
        otherFacilityConcurrent: true,
        otherFacilityName: '訪問介護 サクラ',
        interFacilityScheduleType: 'date',
        interFacilityDates: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30], // 具体的な日付指定
      },
    ],
    preferences: {
      1: { 5: '有休', 20: '希望休' },
      2: { 10: '希望休', 25: '有休' },
      3: { 15: '希望休' },
      4: { 8: '希望休' },
    },
    shifts: {},
    pairs: [
      { type: 'forbidden', a: 3, b: 4 },
      { type: 'recommended', a: 1, b: 4 },
    ],
  };
}
