import { AppState, Facility, ShiftPattern, Staff, ParsedRule } from '../types';
import { FACILITY_TYPES, SPECIAL_SHIFTS, SP_COLOR, SP_TEXT_COLOR, SP_SHORT } from '../constants';

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

export function dayOfWeekIdx(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d).getDay();
}

export function dayOfWeekName(y: number, m: number, d: number): string {
  return ['日', '月', '火', '水', '木', '金', '土'][dayOfWeekIdx(y, m, d)];
}

export function dayOfWeekClass(y: number, m: number, d: number): 'sun' | 'sat' | '' {
  const w = dayOfWeekIdx(y, m, d);
  return w === 0 ? 'sun' : w === 6 ? 'sat' : '';
}

export function timeToMinutes(t: string | null | undefined): number {
  if (!t) return 0;
  const parts = t.split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function grossHours(p: ShiftPattern | null | undefined): number {
  if (!p || SPECIAL_SHIFTS.includes(p.key as any)) return 0;
  const s = timeToMinutes(p.start);
  const e = timeToMinutes(p.end);
  return e > s ? (e - s) / 60 : (1440 - s + e) / 60;
}

// 労働基準法（Labor Standards Act）に基づく休憩時間控除
// 6h超え〜8h以下: 45分 (0.75h)
// 8h超え: 1時間 (1.0h)
export function breakTime(gross: number): number {
  if (gross > 8) return 1.0;
  if (gross > 6) return 0.75;
  return 0;
}

export function netHours(p: ShiftPattern | null | undefined): number {
  const g = grossHours(p);
  return Math.max(0, g - breakTime(g));
}

export function isNight(p: ShiftPattern | null | undefined): boolean {
  if (!p || SPECIAL_SHIFTS.includes(p.key as any)) return false;
  const s = timeToMinutes(p.start);
  const e = timeToMinutes(p.end);
  if (e >= s) return false;
  // 夜勤は22:00〜翌05:00を含むパターン
  return s <= 22 * 60 && e >= 5 * 60;
}

export function parseTimeVal(val: string): { start: string; end: string } | null {
  if (!val || !val.startsWith('time:')) return null;
  const t = val.slice(5);
  const [s, e] = t.split('-');
  if (!s || !e) return null;
  return { start: s, end: e };
}

/**
 * シフトキーに対応する勤務時間帯（開始〜終了）を取得します。
 * 通常パターン、time:HH:MM-HH:MM、および半日休（前休・後休）に対応。
 */
export function getShiftTimeRange(
  key: string,
  facilityId: number | null,
  patterns: ShiftPattern[]
): { start: string; end: string } | null {
  if (!key) return null;
  if (key === '前休' || key === '午前休') {
    return { start: '13:30', end: '17:30' }; // 午後実働4h
  }
  if (key === '後休' || key === '午後休') {
    return { start: '08:30', end: '12:30' }; // 午前実働4h
  }
  if (key.startsWith('time:')) {
    return parseTimeVal(key);
  }
  const pat = getPatternByKey(key, facilityId, patterns);
  if (pat && pat.start && pat.end) {
    return { start: pat.start, end: pat.end };
  }
  return null;
}

export function getTimeKeyHours(key: string): number {
  const tv = parseTimeVal(key);
  if (!tv) return 0;
  const s = timeToMinutes(tv.start);
  const e = timeToMinutes(tv.end);
  const gross = (e > s ? e - s : 1440 - s + e) / 60;
  return Math.max(0, gross - breakTime(gross));
}

export function isWorkShift(key: string | undefined): boolean {
  if (!key || key === '' || key === '公休' || key === '有休' || key === '希望休' || key === '明け' || key === '他事業所') {
    return false;
  }
  return true;
}

export function getPatternByKey(
  key: string,
  facilityId: number | null,
  patterns: ShiftPattern[]
): ShiftPattern | undefined {
  if (!key || SPECIAL_SHIFTS.includes(key as any)) return undefined;
  return (
    patterns.find((p) => p.facilityId === facilityId && p.key === key) ||
    patterns.find((p) => p.key === key)
  );
}

export function getStaffDayNetH(
  staffId: number,
  day: number,
  key: string,
  facilityId: number,
  patterns: ShiftPattern[],
  parsedRules: ParsedRule[] = []
): number {
  if (!key || key === '公休' || key === '有休' || key === '希望休' || key === '明け' || key === '他事業所') {
    return 0;
  }
  if (key === '午前休' || key === '前休' || key === '午後休' || key === '後休') {
    return 4.0;
  }
  let baseH = 0;
  if (key.startsWith('time:')) {
    baseH = getTimeKeyHours(key);
  } else {
    const pat = getPatternByKey(key, facilityId, patterns);
    baseH = pat ? netHours(pat) : 0;
  }

  // Check custom rules parsed from instructions
  if (baseH > 0 && parsedRules.length > 0) {
    for (const r of parsedRules) {
      if (r.staffId === staffId || !r.staffId) {
        if (r.ruleType === 'deduct_hours' && r.hours) {
          // If date specific
          if (!r.dates || r.dates.includes(day)) {
            baseH = Math.max(0, baseH - r.hours);
          }
        }
      }
    }
  }

  return baseH;
}

/**
 * 職員の指定職種（デフォルト: 介護職員）に対する有効配置比率（0.0 〜 1.0）を算出します。
 * 
 * 介護保険法・指定基準の必須ルール：
 * 1. 管理者（管理職分）は介護職の人員配置基準から控除（抜く）。
 * 2. 計画作成担当者（計画作成業務分）は介護職の人員配置基準から控除（抜く）。
 * 3. 専従管理者・専従計画作成担当者は、介護職としてカウント不可（0.0）。
 * 4. 同事業所内兼務（例: 管理者4h / 介護職4h）の場合、介護職員として割り当てられた時間割合のみ（例: 4h/8h = 0.5人）を算定し、管理職分・計画作成分は厳密に除外（抜く）。
 */
export function getStaffRoleAllocationRatio(
  staff: Staff,
  targetRoles: string[] = ['介護職員']
): number {
  const staffRoles = Array.isArray(staff.roles) ? staff.roles : [staff.role];

  // 該当する職種を一切担当していない場合（例: 専従管理者、専従計画作成担当者など）
  const matchingRoles = staffRoles.filter((r) => targetRoles.includes(r));
  if (matchingRoles.length === 0) {
    return 0;
  }

  // 単一職種で、かつそれが対象職種の場合（例: 専従の介護職員）
  if (staffRoles.length === 1) {
    return 1.0;
  }

  // 複数職種（兼務）の場合: 1日の時間配分 (roleHours) に基づいて厳密に按分
  if (staff.roleHours && Object.keys(staff.roleHours).length > 0) {
    let targetHours = 0;
    let totalAllocatedHours = 0;

    staffRoles.forEach((r) => {
      const h = staff.roleHours?.[r] ?? (8 / staffRoles.length);
      totalAllocatedHours += h;
      if (targetRoles.includes(r)) {
        targetHours += h;
      }
    });

    if (totalAllocatedHours > 0) {
      return Math.min(1.0, Math.max(0, targetHours / totalAllocatedHours));
    }
  }

  // roleHoursが未指定の兼務の場合: 職種数で均等按分（例: 2職種兼務なら 1/2 = 0.5）
  return matchingRoles.length / staffRoles.length;
}

/**
 * 職員の指定職種（例: 介護職）実働時間（h）を算出
 * 管理者（管理職分）や計画作成担当者（計画作成分）は除外されます。
 */
export function getStaffDayRoleHours(
  staff: Staff,
  day: number,
  key: string,
  facilityId: number,
  patterns: ShiftPattern[],
  parsedRules: ParsedRule[] = [],
  targetRoles: string[] = ['介護職員']
): number {
  const fullDayH = getStaffDayNetH(staff.id, day, key, facilityId, patterns, parsedRules);
  if (fullDayH <= 0) return 0;
  const ratio = getStaffRoleAllocationRatio(staff, targetRoles);
  return fullDayH * ratio;
}

export function calcFTE(totalHours: number, days: number): string {
  const fullTimeMonthly = (40 / 7) * days;
  if (fullTimeMonthly <= 0) return '0.00';
  const fte = totalHours / fullTimeMonthly;
  return Math.min(fte, 1.0).toFixed(2);
}

export function isStaffWorkingOnFacilityDay(
  staff: Staff,
  year: number,
  month: number,
  day: number
): boolean {
  if (!staff.otherFacilityConcurrent) return true;

  const scheduleType = staff.interFacilityScheduleType || 'dow';
  if (scheduleType === 'dow') {
    const dow = dayOfWeekIdx(year, month, day);
    const daysList = staff.interFacilityDays || [0, 1, 2, 3, 4, 5, 6];
    return daysList.includes(dow);
  } else {
    const datesList = staff.interFacilityDates || [];
    return datesList.includes(day);
  }
}

export function isStaffAvailable(
  staff: Staff,
  year: number,
  month: number,
  day: number,
  pattern?: ShiftPattern
): boolean {
  // Check inter-facility concurrent work assignment
  if (!isStaffWorkingOnFacilityDay(staff, year, month, day)) {
    return false;
  }

  const dow = dayOfWeekIdx(year, month, day);
  // Check available days of week
  if (staff.availDays && staff.availDays.length > 0 && !staff.availDays.includes(dow)) {
    return false;
  }
  // Check available time slot
  if (staff.availTimeEnabled && staff.availStart && staff.availEnd && pattern) {
    if (pattern.key && pattern.key.startsWith('time:')) {
      return true;
    }
    if (!isNight(pattern)) {
      const avS = timeToMinutes(staff.availStart);
      const avE = timeToMinutes(staff.availEnd);
      const ptS = timeToMinutes(pattern.start);
      const ptE = timeToMinutes(pattern.end);

      // Pattern start time check (allow 60 minutes grace so 08:30 or 09:00 staff can take 09:00 or 08:30 day shift)
      if (ptS < avS - 60) return false;
      if (ptS >= avE) return false;
      // Pattern end time check (allow 120 minutes grace for standard day shift)
      if (ptE > avE + 120) return false;
    }
  }
  return true;
}

export function checkCoverageGaps(facilityId: number, patterns: ShiftPattern[]): Array<{ from: number; to: number }> {
  const pats = patterns.filter((p) => p.facilityId === facilityId);
  if (pats.length === 0) return [];
  const covered = new Array(1440).fill(false);
  pats.forEach((p) => {
    const s = timeToMinutes(p.start);
    const e = timeToMinutes(p.end);
    if (e > s) {
      for (let i = s; i < e; i++) covered[i] = true;
    } else {
      for (let i = s; i < 1440; i++) covered[i] = true;
      for (let i = 0; i < e; i++) covered[i] = true;
    }
  });

  const gaps: Array<{ from: number; to: number }> = [];
  let gapStart: number | null = null;
  for (let i = 0; i < 1440; i++) {
    if (!covered[i] && gapStart === null) gapStart = i;
    if (covered[i] && gapStart !== null) {
      gaps.push({ from: gapStart, to: i });
      gapStart = null;
    }
  }
  if (gapStart !== null) gaps.push({ from: gapStart, to: 1440 });
  return gaps;
}

function getNeededStaff(fc: Facility): number {
  const fcType = FACILITY_TYPES.find((t) => t.id === fc.typeId);
  if (!fcType || !fcType.ratio) return 2;
  return Math.max(2, Math.ceil(fc.users / fcType.ratio));
}

/**
 * 職員が前日（または前月末日）に夜勤明けであったかを判定
 */
export function isStaffPostAke(
  staffId: number,
  day: number,
  currentShifts: Record<number, Record<number, string>>,
  monthlyShifts?: Record<string, Record<number, Record<number, string>>>,
  year?: number,
  month?: number
): boolean {
  if (day > 1) {
    return currentShifts[staffId]?.[day - 1] === '明け';
  }
  if (day === 1 && monthlyShifts && year && month) {
    const prevY = month === 1 ? year - 1 : year;
    const prevM = month === 1 ? 12 : month - 1;
    const prevKey = `${prevY}-${prevM}`;
    const prevDays = daysInMonth(prevY, prevM);
    return monthlyShifts[prevKey]?.[staffId]?.[prevDays] === '明け';
  }
  return false;
}

export function generateShifts(state: AppState): Record<number, Record<number, string>> {
  const { year, month, staff, preferences, pairs, shiftPatterns, lockedStaff, parsedRules, monthlyShifts } = state;
  const days = daysInMonth(year, month);
  const lockedSet = new Set(lockedStaff);
  const newShifts: Record<number, Record<number, string>> = {};

  const isPostAke = (staffId: number, d: number) =>
    isStaffPostAke(staffId, d, newShifts, monthlyShifts, year, month);

  // Initialize all staff shifts
  staff.forEach((s) => {
    newShifts[s.id] = {};
    if (lockedSet.has(s.id)) {
      for (let d = 1; d <= days; d++) {
        newShifts[s.id][d] = state.shifts[s.id]?.[d] || '公休';
      }
    } else {
      for (let d = 1; d <= days; d++) {
        if (!isStaffWorkingOnFacilityDay(s, year, month, d)) {
          newShifts[s.id][d] = '他事業所';
        } else {
          newShifts[s.id][d] = '公休';
        }
      }
    }
  });

  // Apply user preferences first (希望休, 有休, pre-entered shifts)
  staff.forEach((s) => {
    if (lockedSet.has(s.id)) return;
    const pref = preferences[s.id] || {};
    Object.entries(pref).forEach(([dStr, val]) => {
      const d = parseInt(dStr, 10);
      newShifts[s.id][d] = val;
    });
  });

  const ruleLockedStaffDays = new Set<string>(); // "staffId-day"
  const forcedLeaveStaffDays = new Set<string>(); // "staffId-day"

  // Apply custom parsed rules (曜日指定・日付指定の出勤/公休、パターン指定等)
  if (parsedRules && parsedRules.length > 0) {
    parsedRules.forEach((rule) => {
      if (!rule.staffId || lockedSet.has(rule.staffId)) return;
      const s = staff.find((st) => st.id === rule.staffId);
      if (!s) return;

      const targetShiftKey = rule.shiftKey || shiftPatterns[0]?.key || '日';

      // 1. 曜日指定の出勤 (例: 「木村さんを月曜日に入れて」)
      if (rule.ruleType === 'specific_dow_work' && rule.dows && rule.dows.length > 0) {
        for (let d = 1; d <= days; d++) {
          const dow = dayOfWeekIdx(year, month, d);
          if (rule.dows.includes(dow) && isStaffWorkingOnFacilityDay(s, year, month, d)) {
            newShifts[s.id][d] = targetShiftKey;
            ruleLockedStaffDays.add(`${s.id}-${d}`);
          }
        }
      }

      // 2. 曜日指定の公休 (例: 「木村さんは火曜日は休みに」)
      if (rule.ruleType === 'specific_dow_leave' && rule.dows && rule.dows.length > 0) {
        for (let d = 1; d <= days; d++) {
          const dow = dayOfWeekIdx(year, month, d);
          if (rule.dows.includes(dow)) {
            newShifts[s.id][d] = '公休';
            ruleLockedStaffDays.add(`${s.id}-${d}`);
            forcedLeaveStaffDays.add(`${s.id}-${d}`);
          }
        }
      }

      // 3. 日付指定の出勤 (例: 「佐藤さんを10日と15日に入れて」)
      if (rule.ruleType === 'specific_date_work' && rule.dates && rule.dates.length > 0) {
        rule.dates.forEach((d) => {
          if (d >= 1 && d <= days && isStaffWorkingOnFacilityDay(s, year, month, d)) {
            newShifts[s.id][d] = targetShiftKey;
            ruleLockedStaffDays.add(`${s.id}-${d}`);
          }
        });
      }

      // 4. 日付指定の公休 (例: 「佐藤さんは15日不在」「10日は休み」)
      if (rule.ruleType === 'specific_date_leave' && rule.dates && rule.dates.length > 0) {
        rule.dates.forEach((d) => {
          if (d >= 1 && d <= days) {
            newShifts[s.id][d] = '公休';
            ruleLockedStaffDays.add(`${s.id}-${d}`);
            forcedLeaveStaffDays.add(`${s.id}-${d}`);
          }
        });
      }
    });
  }

  // Iterate over facilities to generate schedule
  state.facilities.forEach((fc) => {
    const fcType = FACILITY_TYPES.find((t) => t.id === fc.typeId);
    const fcStaff = staff.filter((s) => s.facilityId === fc.id);

    const fcPats = shiftPatterns.filter((p) => p.facilityId === fc.id);
    const dayPats = fcPats.filter((p) => !isNight(p));
    const nightPats = fcPats.filter((p) => isNight(p));
    const useNight = fcType && fcType.nightRequired && nightPats.length > 0;

    if (dayPats.length === 0 && !useNight) return;

    // Monthly hour limits based on contract (e.g. 171.4h for 40h in 30-day month)
    const monthHLimit = (s: Staff) => (s.hours * days) / 7;

    const getMonthH = (s: Staff) => {
      let h = 0;
      for (let i = 1; i <= days; i++) {
        const k = newShifts[s.id][i] || '公休';
        h += getStaffDayNetH(s.id, i, k, fc.id, shiftPatterns, parsedRules);
      }
      return h;
    };

    const getConsecutive = (s: Staff, day: number) => {
      let c = 0;
      for (let i = day - 1; i >= Math.max(1, day - 6); i--) {
        if (isWorkShift(newShifts[s.id][i])) c++;
        else break;
      }
      return c;
    };

    const hasForbiddenConflict = (s: Staff, day: number) => {
      const forb = pairs.filter((p) => p.type === 'forbidden' && (p.a === s.id || p.b === s.id));
      return forb.some((p) => {
        const otherId = p.a === s.id ? p.b : p.a;
        return isWorkShift(newShifts[otherId]?.[day]);
      });
    };

    // 1. Night shift assignment for residential 24h facilities
    if (useNight && nightPats.length > 0) {
      const np = nightPats[0];
      const npH = netHours(np);

      for (let d = 1; d <= days; d++) {
        const alreadyHasNight = fcStaff.some((s) => {
          const k = newShifts[s.id][d];
          return nightPats.some((p) => p.key === k);
        });
        if (alreadyHasNight) continue;

        let eligNight = fcStaff.filter((s) => {
          if (lockedSet.has(s.id)) return false;
          if (ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
          if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) return false;
          if (newShifts[s.id][d] !== '公休') return false;
          if (!s.night) return false;
          if ((s.mat || 3) < 3) return false;
          if ((preferences[s.id] || {})[d]) return false;
          if (!isStaffAvailable(s, year, month, d, np)) return false;
          if (d + 1 <= days && newShifts[s.id][d + 1] !== '公休' && newShifts[s.id][d + 1] !== '明け') return false;
          if (getMonthH(s) + npH > monthHLimit(s) + 0.1) return false;
          if (getConsecutive(s, d) >= 4) return false;
          if (hasForbiddenConflict(s, d)) return false;
          return true;
        });

        if (eligNight.length > 0) {
          const countNights = (s: Staff) =>
            Object.values(newShifts[s.id]).filter((k) => nightPats.some((p) => p.key === k)).length;

          // 1. 夜勤明けの次の日は基本休みとし、明け翌日でない職員を最優先
          const normalCandidates = eligNight.filter((s) => !isPostAke(s.id, d));
          // 2. どうしても夜勤が足りないところは夜勤専属者優先で夜勤明けの次の日も勤務可
          const shortageCandidates = eligNight.filter((s) => isPostAke(s.id, d));

          const sortNightCandidates = (list: Staff[]) => {
            list.sort((a, b) => {
              // 夜勤専属者（nightOnly）を最優先
              if (a.nightOnly && !b.nightOnly) return -1;
              if (!a.nightOnly && b.nightOnly) return 1;
              // 夜勤回数の平準化
              const nd = countNights(a) - countNights(b);
              if (nd !== 0) return nd;
              // 契約労働時間に対する消化率
              return (getMonthH(a) / monthHLimit(a)) - (getMonthH(b) / monthHLimit(b));
            });
          };

          let picked: Staff | undefined;
          if (normalCandidates.length > 0) {
            sortNightCandidates(normalCandidates);
            picked = normalCandidates[0];
          } else if (shortageCandidates.length > 0) {
            // どうしても夜勤が足りない場合: 夜勤専属者を最優先にして明け翌日勤務を許可
            sortNightCandidates(shortageCandidates);
            picked = shortageCandidates[0];
          }

          if (picked) {
            newShifts[picked.id][d] = np.key;
            if (d + 1 <= days && !lockedSet.has(picked.id)) {
              newShifts[picked.id][d + 1] = '明け';
            }
            if (d + 2 <= days && !lockedSet.has(picked.id) && !preferences[picked.id]?.[d + 2]) {
              newShifts[picked.id][d + 2] = '公休';
            }
          }
        }
      }
    }

    if (dayPats.length === 0) return;

    // Shift patterns
    const stdDayPat = dayPats.find((p) => p.key === '日') || dayPats[0];
    const earlyPat = dayPats.find((p) => p.key === '早' || p.name.includes('早')) || dayPats[0];
    const latePat = dayPats.find((p) => p.key === '遅' || p.name.includes('遅')) || (dayPats.length > 2 ? dayPats[2] : dayPats[dayPats.length - 1]);
    const stdDayH = netHours(stdDayPat);
    const earlyH = netHours(earlyPat);
    const lateH = netHours(latePat);

    // Helper to calculate weekly hours for staff in the 7-day week around a given day
    const getWeeklyH = (s: Staff, day: number) => {
      const dow = dayOfWeekIdx(year, month, day);
      const startD = Math.max(1, day - dow);
      const endD = Math.min(days, day + (6 - dow));
      let h = 0;
      for (let i = startD; i <= endD; i++) {
        const k = newShifts[s.id][i] || '公休';
        h += getStaffDayNetH(s.id, i, k, fc.id, shiftPatterns, parsedRules);
      }
      return h;
    };

    // Helper to calculate maximum permitted weekly hours (statutory 40h or contract hours)
    const getMaxWeeklyH = (s: Staff) => {
      if (s.hours && s.hours > 0) {
        return Math.min(40, s.hours);
      }
      return 40;
    };

    // Helper to determine shift key: prefers matching pattern, or generates 'time:HH:MM-HH:MM' if custom hours
    const getStaffWorkShiftKey = (s: Staff, _day: number, preferredPat?: ShiftPattern): string => {
      if (s.availTimeEnabled && s.availStart && s.availEnd) {
        const matchingPat = dayPats.find((p) => {
          const avS = timeToMinutes(s.availStart!);
          const avE = timeToMinutes(s.availEnd!);
          const ptS = timeToMinutes(p.start);
          const ptE = timeToMinutes(p.end);
          return Math.abs(ptS - avS) <= 15 && Math.abs(ptE - avE) <= 15;
        });
        if (matchingPat) return matchingPat.key;
        return `time:${s.availStart}-${s.availEnd}`;
      }
      return preferredPat?.key || stdDayPat?.key || '日';
    };

    // Helper to check day availability (taking custom hours into account)
    const isStaffAvailableForDay = (s: Staff, day: number, targetPat?: ShiftPattern): boolean => {
      if (!isStaffWorkingOnFacilityDay(s, year, month, day)) return false;
      const dow = dayOfWeekIdx(year, month, day);
      if (s.availDays && s.availDays.length > 0 && !s.availDays.includes(dow)) {
        return false;
      }
      if (s.availTimeEnabled && s.availStart && s.availEnd) {
        if (targetPat && isNight(targetPat)) return false;
        return true;
      }
      if (targetPat) {
        return isStaffAvailable(s, year, month, day, targetPat);
      }
      return true;
    };

    const neededRatio = getNeededStaff(fc);
    const ratioRoles = (fcType?.ratioRoles && fcType.ratioRoles.length > 0) ? fcType.ratioRoles : ['介護職員'];

    // Helper to check actual effective care staff currently on duty on day d
    const calcCareOnDuty = (day: number) =>
      fcStaff.reduce((sum, s) => {
        const shiftKey = newShifts[s.id][day];
        if (isWorkShift(shiftKey) || shiftKey === '明け') {
          const careRatio = getStaffRoleAllocationRatio(s, ratioRoles);
          return sum + careRatio;
        }
        return sum;
      }, 0);

    // 2. Schedule Administrative & Plan Creator Roles (管理者・計画作成担当者)
    const adminStaff = fcStaff.filter((s) => {
      const roles = Array.isArray(s.roles) ? s.roles : [s.role];
      return roles.includes('管理者') || roles.includes('計画作成担当者');
    });

    adminStaff.forEach((s) => {
      if (lockedSet.has(s.id)) return;
      const maxWeeklyH = getMaxWeeklyH(s);

      // Pass 1: Weekday Day Shift Assignment (月〜金: 平日の日勤帯)
      for (let d = 1; d <= days; d++) {
        if (ruleLockedStaffDays.has(`${s.id}-${d}`)) continue;
        if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) continue;
        if (newShifts[s.id][d] !== '公休') continue;
        if (isPostAke(s.id, d)) continue; // 夜勤明けの次の日は基本休み

        const dow = dayOfWeekIdx(year, month, d);
        const isWeekday = dow >= 1 && dow <= 5;
        if (!isWeekday) continue;

        if (!isStaffAvailableForDay(s, d, stdDayPat)) continue;

        const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
        const shiftH = getStaffDayNetH(s.id, d, shiftKey, fc.id, shiftPatterns, parsedRules);

        if (getConsecutive(s, d) >= 5) continue;
        if (getWeeklyH(s, d) + shiftH > maxWeeklyH + 0.05) continue;
        if (getMonthH(s) + shiftH > monthHLimit(s) + 0.05) continue;
        if (hasForbiddenConflict(s, d)) continue;

        newShifts[s.id][d] = shiftKey;
      }

      // Pass 2: Weekend & Holiday Day Shift Assignment (土日祝: 週40時間を超えない範囲)
      for (let d = 1; d <= days; d++) {
        if (ruleLockedStaffDays.has(`${s.id}-${d}`)) continue;
        if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) continue;
        if (newShifts[s.id][d] !== '公休') continue;
        if (isPostAke(s.id, d)) continue; // 夜勤明けの次の日は基本休み

        const dow = dayOfWeekIdx(year, month, d);
        const isWeekend = dow === 0 || dow === 6;
        if (!isWeekend) continue;

        if (!isStaffAvailableForDay(s, d, stdDayPat)) continue;

        const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
        const shiftH = getStaffDayNetH(s.id, d, shiftKey, fc.id, shiftPatterns, parsedRules);

        if (getConsecutive(s, d) >= 5) continue;
        if (getWeeklyH(s, d) + shiftH > maxWeeklyH + 0.05) continue;
        if (getMonthH(s) + shiftH > monthHLimit(s) + 0.05) continue;
        if (hasForbiddenConflict(s, d)) continue;

        newShifts[s.id][d] = shiftKey;
      }
    });

    // 3. Schedule Nursing Staff (看護職員・准看護師・看護師) 積極的優先配置
    // 医療的処置・服薬・バイタルチェックのため、看護師・准看護師は勤務可能曜日（例: 火・木 12:30〜16:00等）に最優先で確実にシフトへ組み込みます。
    const isNurseStaff = (s: Staff) => {
      const rList = Array.isArray(s.roles) ? s.roles : [s.role];
      const qList = Array.isArray(s.quals) ? s.quals : [s.qual];
      return (
        rList.some((r) => r && (r.includes('看護') || r.includes('ナース'))) ||
        qList.some((q) => q && (q.includes('看護') || q.includes('准看')))
      );
    };

    const nurseStaff = fcStaff.filter((s) => {
      if (adminStaff.some((a) => a.id === s.id)) return false;
      return isNurseStaff(s);
    });

    nurseStaff.forEach((s) => {
      if (lockedSet.has(s.id)) return;
      const maxWeeklyH = getMaxWeeklyH(s);

      for (let d = 1; d <= days; d++) {
        if (ruleLockedStaffDays.has(`${s.id}-${d}`)) continue;
        if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) continue;
        if (newShifts[s.id][d] !== '公休') continue;
        if (isPostAke(s.id, d)) continue; // 夜勤明けの次の日は基本休み

        // Facility open check for day service
        if (fc.typeId === 'dayservice' && fc.bizDays && fc.bizDays.length > 0) {
          const dow = dayOfWeekIdx(year, month, d);
          if (!fc.bizDays.includes(dow)) continue;
        }

        if (!isStaffAvailableForDay(s, d)) continue;

        const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
        const shiftH = getStaffDayNetH(s.id, d, shiftKey, fc.id, shiftPatterns, parsedRules);

        if (getConsecutive(s, d) >= 5) continue;
        if (getWeeklyH(s, d) + shiftH > maxWeeklyH + 0.05) continue;
        if (getMonthH(s) + shiftH > monthHLimit(s) + 0.05) continue;
        if (hasForbiddenConflict(s, d)) continue;

        newShifts[s.id][d] = shiftKey;
      }
    });

    // 4. Core Early ('早') and Late ('遅') Coverage Prioritized by Scarcity
    // 早番・遅番も週時間制限（40hまたは契約時間）を厳守して配置
    const careStaff = fcStaff.filter(
      (s) => !adminStaff.some((a) => a.id === s.id) && !nurseStaff.some((n) => n.id === s.id)
    );

    const allDaysSortedByScarcity = Array.from({ length: days }, (_, i) => i + 1).sort((a, b) => {
      const dowA = dayOfWeekIdx(year, month, a);
      const dowB = dayOfWeekIdx(year, month, b);
      const score = (d: number) => (d === 0 ? 0 : d === 6 ? 1 : 2);
      return score(dowA) - score(dowB);
    });

    allDaysSortedByScarcity.forEach((d) => {
      if (fc.typeId === 'dayservice' && fc.bizDays && fc.bizDays.length > 0) {
        const dow = dayOfWeekIdx(year, month, d);
        if (!fc.bizDays.includes(dow)) return;
      }

      // Early shift
      const hasEarly = careStaff.some((s) => newShifts[s.id][d] === earlyPat.key);
      if (!hasEarly && earlyPat) {
        const cand = careStaff.filter((s) => {
          if (lockedSet.has(s.id)) return false;
          if (ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
          if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) return false;
          if (newShifts[s.id][d] !== '公休') return false;
          if (s.nightOnly) return false;
          if (isPostAke(s.id, d)) return false; // 夜勤明けの次の日は基本休み
          if (!isStaffAvailableForDay(s, d, earlyPat)) return false;
          if (getConsecutive(s, d) >= 5) return false;
          if (getWeeklyH(s, d) + earlyH > getMaxWeeklyH(s) + 0.05) return false;
          if (getMonthH(s) + earlyH > monthHLimit(s) + 0.05) return false;
          if (hasForbiddenConflict(s, d)) return false;
          return true;
        });

        if (cand.length > 0) {
          cand.sort((a, b) => (getMonthH(a) / monthHLimit(a)) - (getMonthH(b) / monthHLimit(b)));
          newShifts[cand[0].id][d] = earlyPat.key;
        }
      }

      // Late shift
      const hasLate = careStaff.some((s) => newShifts[s.id][d] === latePat.key);
      if (!hasLate && latePat && latePat.key !== earlyPat.key) {
        const cand = careStaff.filter((s) => {
          if (lockedSet.has(s.id)) return false;
          if (ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
          if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) return false;
          if (newShifts[s.id][d] !== '公休') return false;
          if (s.nightOnly) return false;
          if (isPostAke(s.id, d)) return false; // 夜勤明けの次の日は基本休み
          if (!isStaffAvailableForDay(s, d, latePat)) return false;
          if (getConsecutive(s, d) >= 5) return false;
          if (getWeeklyH(s, d) + lateH > getMaxWeeklyH(s) + 0.05) return false;
          if (getMonthH(s) + lateH > monthHLimit(s) + 0.05) return false;
          if (hasForbiddenConflict(s, d)) return false;
          return true;
        });

        if (cand.length > 0) {
          cand.sort((a, b) => (getMonthH(a) / monthHLimit(a)) - (getMonthH(b) / monthHLimit(b)));
          newShifts[cand[0].id][d] = latePat.key;
        }
      }

      // Safety check: if no Late shift is on duty, convert Early shift to Day shift if needed
      const workingCareOnDay = careStaff.filter((s) => isWorkShift(newShifts[s.id][d]));
      const hasLateOnDay = workingCareOnDay.some((s) => newShifts[s.id][d] === latePat.key);
      const hasStandardDay = workingCareOnDay.some((s) => newShifts[s.id][d] === stdDayPat.key);

      if (!hasLateOnDay && !hasStandardDay) {
        const earlyWorker = workingCareOnDay.find((s) => newShifts[s.id][d] === earlyPat.key && !ruleLockedStaffDays.has(`${s.id}-${d}`));
        if (earlyWorker && isStaffAvailableForDay(earlyWorker, d, stdDayPat)) {
          newShifts[earlyWorker.id][d] = stdDayPat.key;
        }
      }
    });

    // 5. Part-Time / Specialized Hours Staff Scheduling (配置過多の防止)
    // 利用者比率に対して既に十分な人員がいる日に無理に重ねて入れず、適正人数に抑えます。
    const partTimeCareStaff = careStaff.filter((s) => s.type !== '常勤' || s.hours < 35);
    partTimeCareStaff.forEach((s) => {
      if (lockedSet.has(s.id)) return;
      const maxWeeklyH = getMaxWeeklyH(s);

      for (let d = 1; d <= days; d++) {
        if (ruleLockedStaffDays.has(`${s.id}-${d}`)) continue;
        if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) continue;
        if (newShifts[s.id][d] !== '公休') continue;
        if (isPostAke(s.id, d)) continue; // 夜勤明けの次の日は基本休み

        if (fc.typeId === 'dayservice' && fc.bizDays && fc.bizDays.length > 0) {
          const dow = dayOfWeekIdx(year, month, d);
          if (!fc.bizDays.includes(dow)) continue;
        }

        // 配置過多の防止: すでに当日の必要比率を満たしている場合は無駄な重複シフトを入れない
        if (calcCareOnDuty(d) >= neededRatio + 0.5) continue;

        if (!isStaffAvailableForDay(s, d)) continue;

        const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
        const shiftH = getStaffDayNetH(s.id, d, shiftKey, fc.id, shiftPatterns, parsedRules);

        if (getConsecutive(s, d) >= 5) continue;
        if (getWeeklyH(s, d) + shiftH > maxWeeklyH + 0.05) continue;
        if (getMonthH(s) + shiftH > monthHLimit(s) + 0.05) continue;
        if (hasForbiddenConflict(s, d)) continue;

        newShifts[s.id][d] = shiftKey;
      }
    });

    // 6. Minimum Staffing Ratio Fulfillment: 各日の介護職員人員配置基準を厳密に充足
    for (let d = 1; d <= days; d++) {
      if (fc.typeId === 'dayservice' && fc.bizDays && fc.bizDays.length > 0) {
        const dow = dayOfWeekIdx(year, month, d);
        if (!fc.bizDays.includes(dow)) continue;
      }

      let currentCareOnDuty = calcCareOnDuty(d);

      if (currentCareOnDuty < neededRatio - 0.001) {
        const cand = fcStaff.filter((s) => {
          if (lockedSet.has(s.id)) return false;
          if (ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
          if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) return false;
          if (newShifts[s.id][d] !== '公休') return false;
          if (s.nightOnly) return false;
          if (isPostAke(s.id, d)) return false; // 夜勤明けの次の日は基本休み
          if (getStaffRoleAllocationRatio(s, ratioRoles) <= 0) return false;
          if (!isStaffAvailableForDay(s, d, stdDayPat)) return false;

          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
          const shiftH = getStaffDayNetH(s.id, d, shiftKey, fc.id, shiftPatterns, parsedRules);

          if (getConsecutive(s, d) >= 5) return false;
          // 法定週40h・契約時間を絶対に超えないよう制御
          if (getWeeklyH(s, d) + shiftH > getMaxWeeklyH(s) + 0.05) return false;
          if (getMonthH(s) + shiftH > monthHLimit(s) + 0.05) return false;
          if (hasForbiddenConflict(s, d)) return false;
          return true;
        });

        cand.sort((a, b) => {
          const aRatio = getMonthH(a) / monthHLimit(a);
          const bRatio = getMonthH(b) / monthHLimit(b);
          return aRatio - bRatio;
        });

        for (const s of cand) {
          if (currentCareOnDuty >= neededRatio - 0.001) break;
          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
          newShifts[s.id][d] = shiftKey;
          currentCareOnDuty += getStaffRoleAllocationRatio(s, ratioRoles);
        }
      }
    }

    // 7. Balance Full-Time Care Staff Hours without Overstaffing
    // 常勤介護職員の標準契約時間を満たすための平準化（法定週40h上限および過多防止を徹底）
    const fullTimeCare = careStaff.filter((s) => s.type === '常勤' && s.hours >= 35);
    fullTimeCare.forEach((s) => {
      if (lockedSet.has(s.id)) return;
      const maxWeeklyH = getMaxWeeklyH(s);

      for (let d = 1; d <= days; d++) {
        if (getMonthH(s) >= monthHLimit(s) - 2) break;
        if (newShifts[s.id][d] !== '公休') continue;
        if (ruleLockedStaffDays.has(`${s.id}-${d}`)) continue;
        if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) continue;
        if (isPostAke(s.id, d)) continue; // 夜勤明けの次の日は基本休み

        if (fc.typeId === 'dayservice' && fc.bizDays && fc.bizDays.length > 0) {
          const dow = dayOfWeekIdx(year, month, d);
          if (!fc.bizDays.includes(dow)) continue;
        }

        // 過多防止: 必要比率＋0.5人を超えて人員を集中させない
        if (calcCareOnDuty(d) >= neededRatio + 0.5) continue;

        if (!isStaffAvailableForDay(s, d, stdDayPat)) continue;

        const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
        const shiftH = getStaffDayNetH(s.id, d, shiftKey, fc.id, shiftPatterns, parsedRules);

        if (getConsecutive(s, d) >= 5) continue;
        if (getWeeklyH(s, d) + shiftH > maxWeeklyH + 0.05) continue;
        if (getMonthH(s) + shiftH > monthHLimit(s) + 0.05) continue;
        if (hasForbiddenConflict(s, d)) continue;

        newShifts[s.id][d] = shiftKey;
      }
    });
  });

  return newShifts;
}
