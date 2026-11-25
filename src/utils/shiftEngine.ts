import { AppState, Facility, Pair, ShiftPattern, Staff, ParsedRule } from '../types';
import { FACILITY_TYPES, SPECIAL_SHIFTS } from '../constants';

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
  const parts = t.trim().split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

export function minutesToTime(m: number): string {
  const normalized = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60) % 24;
  const min = normalized % 60;
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
  // 夜勤は22:00〜翌05:00を含むパターン、または日またぎパターン
  return s <= 22 * 60 && e >= 5 * 60;
}

export function parseTimeVal(val: string): { start: string; end: string } | null {
  if (!val || !val.startsWith('time:')) return null;
  const t = val.slice(5);
  const [s, e] = t.split('-');
  if (!s || !e) return null;
  const norm = (str: string) => {
    const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}` : str.trim();
  };
  return { start: norm(s), end: norm(e) };
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
    patterns.find((p) => p.facilityId === facilityId && (p.key === key || p.name === key)) ||
    patterns.find((p) => p.key === key || p.name === key)
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
 */
export function getStaffRoleAllocationRatio(
  staff: Staff,
  targetRoles: string[] = ['介護職員']
): number {
  const staffRoles = Array.isArray(staff.roles) ? staff.roles : [staff.role];

  const matchingRoles = staffRoles.filter((r) => targetRoles.includes(r));
  if (matchingRoles.length === 0) {
    return 0;
  }

  if (staffRoles.length === 1) {
    return 1.0;
  }

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

  return matchingRoles.length / staffRoles.length;
}

/**
 * 職員の指定職種（例: 介護職）実働時間（h）を算出
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

/**
 * 職員が指定日の特定パターン（または当該日）に出勤可能かを厳密に判定します。
 * ・他事業所兼務日の除外
 * ・出勤可能曜日（availDays）の厳守
 * ・夜勤可否（night / nightOnly）の厳守
 * ・時間帯制限（availTimeEnabled: availStart〜availEnd）の厳守（1分でも範囲外なら不可）
 */
export function isStaffAvailable(
  staff: Staff,
  year: number,
  month: number,
  day: number,
  pattern?: ShiftPattern,
  ignoreDowConstraint?: boolean
): boolean {
  if (!ignoreDowConstraint && !isStaffWorkingOnFacilityDay(staff, year, month, day)) {
    return false;
  }

  if (!ignoreDowConstraint) {
    const dow = dayOfWeekIdx(year, month, day);
    if (staff.availDays && staff.availDays.length > 0 && !staff.availDays.includes(dow)) {
      return false;
    }
  }

  if (pattern) {
    const patIsNight = isNight(pattern);
    if (patIsNight && !staff.night) {
      return false;
    }
    if (!patIsNight && staff.nightOnly) {
      return false;
    }

    if (staff.availTimeEnabled && staff.availStart && staff.availEnd) {
      if (pattern.key && pattern.key.startsWith('time:')) {
        const tv = parseTimeVal(pattern.key);
        if (!tv) return false;
        const avS = timeToMinutes(staff.availStart);
        const avE = timeToMinutes(staff.availEnd);
        const ptS = timeToMinutes(tv.start);
        const ptE = timeToMinutes(tv.end);
        if (avE > avS) {
          return ptE > ptS && ptS >= avS && ptE <= avE;
        }
        return true;
      }

      const avS = timeToMinutes(staff.availStart);
      const avE = timeToMinutes(staff.availEnd);
      const ptS = timeToMinutes(pattern.start);
      const ptE = timeToMinutes(pattern.end);

      if (avE > avS) {
        if (patIsNight || ptE <= ptS) return false;
        if (ptS < avS || ptE > avE) return false;
      } else {
        if (ptE > ptS) {
          const inEvening = ptS >= avS && ptE <= 1440;
          const inMorning = ptS >= 0 && ptE <= avE;
          if (!inEvening && !inMorning) return false;
        } else {
          if (ptS < avS || ptE > avE) return false;
        }
      }
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

function getPrevMonthTailConsecutive(
  staffId: number,
  monthlyShifts?: Record<string, Record<number, Record<number, string>>>,
  year?: number,
  month?: number
): number {
  if (!monthlyShifts || !year || !month) return 0;
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const prevKey = `${prevY}-${prevM}`;
  const prevStaffShifts = monthlyShifts[prevKey]?.[staffId];
  if (!prevStaffShifts) return 0;

  const prevDays = daysInMonth(prevY, prevM);
  let count = 0;
  for (let d = prevDays; d >= Math.max(1, prevDays - 6); d--) {
    if (isWorkShift(prevStaffShifts[d])) count++;
    else break;
  }
  return count;
}

export function generateShifts(state: AppState): Record<number, Record<number, string>> {
  const { year, month, staff, preferences, pairs, shiftPatterns, lockedStaff, parsedRules, monthlyShifts } = state;
  const days = daysInMonth(year, month);
  const lockedSet = new Set(lockedStaff);
  const newShifts: Record<number, Record<number, string>> = {};

  // Merge pairs from CompatTab with any pair_override AI rules
  const effectivePairs: Pair[] = [...(pairs || [])];
  if (parsedRules && parsedRules.length > 0) {
    parsedRules.forEach((r) => {
      if (r.ruleType === 'pair_override' && r.staffId && r.secondStaffId && r.pairType) {
        effectivePairs.push({
          type: r.pairType,
          a: r.staffId,
          b: r.secondStaffId,
        });
      }
    });
  }

  const isPostAke = (staffId: number, d: number) =>
    isStaffPostAke(staffId, d, newShifts, monthlyShifts, year, month);

  const isFacilityOpenDay = (fc: Facility, d: number): boolean => {
    if (fc.bizDays && fc.bizDays.length > 0 && (fc.typeId === 'dayservice' || fc.typeId === 'jihi_day')) {
      const dow = dayOfWeekIdx(year, month, d);
      return fc.bizDays.includes(dow);
    }
    return true;
  };

  // 1. Initialize all staff shifts
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

  // Track cells locked by preferences or rules so they are never overwritten
  const prefLockedStaffDays = new Set<string>(); // "staffId-day"
  const ruleLockedStaffDays = new Set<string>(); // "staffId-day"
  const forcedLeaveStaffDays = new Set<string>(); // "staffId-day"
  const postNightRestDays = new Set<string>(); // "staffId-day"

  // 2. Apply user preferences first (有休, 希望休, 前休, 後休, シフトパターン, time:HH:MM-HH:MM, etc.)
  staff.forEach((s) => {
    if (lockedSet.has(s.id)) return;
    const pref = preferences[s.id] || {};
    Object.entries(pref).forEach(([dStr, val]) => {
      const d = parseInt(dStr, 10);
      if (d >= 1 && d <= days && val) {
        const matchedPat = getPatternByKey(val, s.facilityId, shiftPatterns);
        const resolvedVal = matchedPat ? matchedPat.key : val;
        newShifts[s.id][d] = resolvedVal;
        prefLockedStaffDays.add(`${s.id}-${d}`);
        if (resolvedVal === '有休' || resolvedVal === '希望休' || resolvedVal === '公休') {
          forcedLeaveStaffDays.add(`${s.id}-${d}`);
        }
      }
    });
  });

  // Iterate over facilities to generate schedule
  state.facilities.forEach((fc) => {
    const fcType = FACILITY_TYPES.find((t) => t.id === fc.typeId);
    const fcStaff = staff.filter((s) => s.facilityId === fc.id);

    const fcPats = shiftPatterns.filter((p) => p.facilityId === fc.id || p.facilityId === null);
    const dayPats = fcPats.filter((p) => !isNight(p));
    const nightPats = fcPats.filter((p) => isNight(p));
    const useNight = Boolean(fcType && fcType.nightRequired && nightPats.length > 0);

    if (dayPats.length === 0 && !useNight) return;

    // Classify daytime patterns accurately
    const earlyPat =
      dayPats.find((p) => p.key === '早' || p.key === '早番' || p.name.includes('早')) ||
      dayPats.find((p) => timeToMinutes(p.start) <= 7 * 60 + 30);

    const latePat =
      dayPats.find((p) => p.key === '遅' || p.key === '遅番' || p.name.includes('遅')) ||
      dayPats.find((p) => timeToMinutes(p.end) >= 19 * 60 + 30 && p.id !== earlyPat?.id);

    const stdDayPat =
      dayPats.find((p) => p.key === '日' || p.key === '日勤' || p.name.includes('日勤') || p.name.includes('通常')) ||
      dayPats.find((p) => p.id !== earlyPat?.id && p.id !== latePat?.id) ||
      dayPats.slice().sort((a, b) => Math.abs(timeToMinutes(a.start) - 525) - Math.abs(timeToMinutes(b.start) - 525))[0] ||
      dayPats[0];

    // Check if pattern is excluded for staff `s` via AI rules
    const isPatternExcludedForStaff = (s: Staff, shiftKey: string): boolean => {
      if (!parsedRules || parsedRules.length === 0) return false;
      const pat = getPatternByKey(shiftKey, fc.id, shiftPatterns);
      for (const r of parsedRules) {
        if (r.staffId !== s.id) continue;
        if (r.ruleType === 'exclude_pattern' && r.shiftKey) {
          if (r.shiftKey === shiftKey || (pat && (pat.key === r.shiftKey || pat.name === r.shiftKey))) {
            return true;
          }
        }
        if (r.ruleType === 'specific_pattern' && r.onlyThisPattern && r.shiftKey) {
          if (r.shiftKey !== shiftKey && (!pat || (pat.key !== r.shiftKey && pat.name !== r.shiftKey))) {
            return true;
          }
        }
      }
      return false;
    };

    // Helper: Determine the valid shift key for staff `s` on `day`, respecting `availStart`~`availEnd`
    const getStaffWorkShiftKey = (
      s: Staff,
      day: number,
      preferredPat?: ShiftPattern,
      ignoreDowConstraint?: boolean
    ): string => {
      let targetPat = preferredPat;
      if (parsedRules && parsedRules.length > 0) {
        const patRule = parsedRules.find((r) => r.staffId === s.id && r.ruleType === 'specific_pattern' && r.shiftKey);
        if (patRule && patRule.shiftKey) {
          const matchedRulePat = dayPats.find((p) => p.key === patRule.shiftKey || p.name === patRule.shiftKey);
          if (matchedRulePat && isStaffAvailable(s, year, month, day, matchedRulePat, ignoreDowConstraint)) {
            targetPat = matchedRulePat;
          }
        }
      }

      if (s.availTimeEnabled && s.availStart && s.availEnd) {
        const avS = timeToMinutes(s.availStart);
        const avE = timeToMinutes(s.availEnd);
        const windowGrossH = (avE > avS ? avE - avS : 1440 - avS + avE) / 60;
        const windowNetH = Math.max(0, windowGrossH - breakTime(windowGrossH));

        const exactMatchingPat = dayPats.find((p) => {
          if (isPatternExcludedForStaff(s, p.key)) return false;
          const ptS = timeToMinutes(p.start);
          const ptE = timeToMinutes(p.end);
          return (
            ptE > ptS &&
            ptS >= avS &&
            ptE <= avE &&
            Math.abs(ptS - avS) <= 15 &&
            Math.abs(ptE - avE) <= 15
          );
        });
        if (exactMatchingPat) return exactMatchingPat.key;

        if (windowGrossH > 9.0) {
          if (
            targetPat &&
            !isNight(targetPat) &&
            !isPatternExcludedForStaff(s, targetPat.key) &&
            isStaffAvailable(s, year, month, day, targetPat, ignoreDowConstraint)
          ) {
            return targetPat.key;
          }
          if (
            stdDayPat &&
            !isNight(stdDayPat) &&
            !isPatternExcludedForStaff(s, stdDayPat.key) &&
            isStaffAvailable(s, year, month, day, stdDayPat, ignoreDowConstraint)
          ) {
            return stdDayPat.key;
          }
          const fittingPats = dayPats.filter(
            (p) => !isPatternExcludedForStaff(s, p.key) && isStaffAvailable(s, year, month, day, p, ignoreDowConstraint)
          );
          if (fittingPats.length > 0) {
            fittingPats.sort((a, b) => Math.abs(netHours(a) - 8) - Math.abs(netHours(b) - 8));
            return fittingPats[0].key;
          }
          const clampEnd = Math.min(avE, avS + 540);
          return `time:${minutesToTime(avS)}-${minutesToTime(clampEnd)}`;
        }

        const fittingSameDurationPat = dayPats.find((p) => {
          if (isPatternExcludedForStaff(s, p.key)) return false;
          if (!isStaffAvailable(s, year, month, day, p, ignoreDowConstraint)) return false;
          return Math.abs(netHours(p) - windowNetH) <= 0.25;
        });
        if (fittingSameDurationPat) return fittingSameDurationPat.key;

        return `time:${minutesToTime(avS)}-${minutesToTime(avE)}`;
      }

      if (
        targetPat &&
        !isPatternExcludedForStaff(s, targetPat.key) &&
        isStaffAvailable(s, year, month, day, targetPat, ignoreDowConstraint)
      ) {
        return targetPat.key;
      }
      if (
        stdDayPat &&
        !isPatternExcludedForStaff(s, stdDayPat.key) &&
        isStaffAvailable(s, year, month, day, stdDayPat, ignoreDowConstraint)
      ) {
        return stdDayPat.key;
      }
      const anyAvailPat = dayPats.find(
        (p) => !isPatternExcludedForStaff(s, p.key) && isStaffAvailable(s, year, month, day, p, ignoreDowConstraint)
      );
      return anyAvailPat?.key || stdDayPat?.key || '日';
    };

    // 3. Apply custom parsed rules (曜日指定・日付指定の出勤/公休、時間指定等)
    if (parsedRules && parsedRules.length > 0) {
      parsedRules.forEach((rule) => {
        if (!rule.staffId || lockedSet.has(rule.staffId)) return;
        const s = fcStaff.find((st) => st.id === rule.staffId);
        if (!s) return;

        const reqPat = rule.shiftKey
          ? fcPats.find((p) => p.key === rule.shiftKey || p.name === rule.shiftKey)
          : undefined;

        const assignRuleShiftOnDay = (d: number) => {
          if (d < 1 || d > days) return;
          // Preserve any user preference (有休, 希望休, シフトパターン等) entered in 希望入力タブ
          if (prefLockedStaffDays.has(`${s.id}-${d}`)) return;
          if (!isFacilityOpenDay(fc, d)) return;

          let assignedKey: string;
          if (rule.timeStart && rule.timeEnd) {
            assignedKey = `time:${rule.timeStart}-${rule.timeEnd}`;
          } else if (rule.explicitShiftKey && reqPat) {
            // ユーザーが明示的に「(日)」「早番」などシフトを指定した場合はマスタ時間制限より優先してそのシフトを配置
            assignedKey = reqPat.key;
          } else if (rule.explicitShiftKey && rule.shiftKey && rule.shiftKey.startsWith('time:')) {
            assignedKey = rule.shiftKey;
          } else {
            // シフト未指定（「月曜日に入れて」等）の場合はその職員の標準勤務シフト（または時間指定）を配置
            assignedKey = getStaffWorkShiftKey(s, d, reqPat || stdDayPat, true);
          }

          newShifts[s.id][d] = assignedKey;
          ruleLockedStaffDays.add(`${s.id}-${d}`);
          forcedLeaveStaffDays.delete(`${s.id}-${d}`);

          if (reqPat && isNight(reqPat)) {
            if (d + 1 <= days && !lockedSet.has(s.id) && !prefLockedStaffDays.has(`${s.id}-${d + 1}`)) {
              newShifts[s.id][d + 1] = '明け';
              ruleLockedStaffDays.add(`${s.id}-${d + 1}`);
            }
            if (
              d + 2 <= days &&
              !lockedSet.has(s.id) &&
              !prefLockedStaffDays.has(`${s.id}-${d + 2}`) &&
              !ruleLockedStaffDays.has(`${s.id}-${d + 2}`)
            ) {
              newShifts[s.id][d + 2] = '公休';
              postNightRestDays.add(`${s.id}-${d + 2}`);
            }
          }
        };

        // 1. 曜日指定の出勤 (例: 田中 美咲さんを毎週月曜日に入れて / 山田 花子 毎週木曜日出勤(日))
        if (rule.ruleType === 'specific_dow_work' && rule.dows && rule.dows.length > 0) {
          for (let d = 1; d <= days; d++) {
            const dow = dayOfWeekIdx(year, month, d);
            if (rule.dows.includes(dow)) {
              assignRuleShiftOnDay(d);
            }
          }
        }

        // 2. 曜日指定の公休/有休/希望休
        if (rule.ruleType === 'specific_dow_leave' && rule.dows && rule.dows.length > 0) {
          const leaveVal = rule.shiftKey && ['有休', '希望休', '公休'].includes(rule.shiftKey) ? rule.shiftKey : '公休';
          for (let d = 1; d <= days; d++) {
            if (prefLockedStaffDays.has(`${s.id}-${d}`)) continue;
            const dow = dayOfWeekIdx(year, month, d);
            if (rule.dows.includes(dow) && isStaffWorkingOnFacilityDay(s, year, month, d)) {
              newShifts[s.id][d] = leaveVal;
              ruleLockedStaffDays.add(`${s.id}-${d}`);
              forcedLeaveStaffDays.add(`${s.id}-${d}`);
            }
          }
        }

        // 3. 日付指定の出勤
        if (rule.ruleType === 'specific_date_work' && rule.dates && rule.dates.length > 0) {
          rule.dates.forEach((d) => {
            assignRuleShiftOnDay(d);
          });
        }

        // 4. 日付指定の公休/有休/希望休
        if (rule.ruleType === 'specific_date_leave' && rule.dates && rule.dates.length > 0) {
          const leaveVal = rule.shiftKey && ['有休', '希望休', '公休'].includes(rule.shiftKey) ? rule.shiftKey : '公休';
          rule.dates.forEach((d) => {
            if (d >= 1 && d <= days && !prefLockedStaffDays.has(`${s.id}-${d}`)) {
              if (isStaffWorkingOnFacilityDay(s, year, month, d)) {
                newShifts[s.id][d] = leaveVal;
                ruleLockedStaffDays.add(`${s.id}-${d}`);
                forcedLeaveStaffDays.add(`${s.id}-${d}`);
              }
            }
          });
        }

        // 5. 日付＆時間指定
        if (rule.ruleType === 'specific_date_time' && rule.dates && rule.timeStart && rule.timeEnd) {
          rule.dates.forEach((d) => {
            assignRuleShiftOnDay(d);
          });
        }
      });
    }

    // Check if staff has a `must_fill_hours` rule (例: 佐藤 由美は必ず週所定労働時間数は入れて)
    const getMustFillRule = (s: Staff): ParsedRule | undefined =>
      parsedRules?.find((r) => r.staffId === s.id && r.ruleType === 'must_fill_hours');

    // Monthly contracted hour limit (e.g. 171.4h for 40h/week in 30-day month)
    const monthHLimit = (s: Staff) => {
      const mustRule = getMustFillRule(s);
      const weeklyTarget = mustRule?.hours || s.hours || 40;
      return (weeklyTarget * days) / 7;
    };

    const getMonthH = (s: Staff) => {
      let h = 0;
      for (let i = 1; i <= days; i++) {
        const k = newShifts[s.id][i] || '公休';
        h += getStaffDayNetH(s.id, i, k, fc.id, shiftPatterns, parsedRules);
      }
      return h;
    };

    const getTypicalShiftH = (s: Staff): number => {
      if (s.nightOnly && nightPats.length > 0) {
        return netHours(nightPats[0]);
      }
      const key = getStaffWorkShiftKey(s, 1, stdDayPat);
      return Math.max(1, getStaffDayNetH(s.id, 1, key, fc.id, shiftPatterns, parsedRules));
    };

    // Total consecutive work days IF staff `s` is assigned a work shift on `day`
    const getConsecutiveIfAssigned = (s: Staff, day: number): number => {
      let back = 0;
      for (let i = day - 1; i >= 1; i--) {
        if (isWorkShift(newShifts[s.id][i])) back++;
        else break;
      }
      if (back === day - 1) {
        back += getPrevMonthTailConsecutive(s.id, monthlyShifts, year, month);
      }

      let forward = 0;
      for (let i = day + 1; i <= days; i++) {
        if (isWorkShift(newShifts[s.id][i])) forward++;
        else break;
      }

      return back + 1 + forward;
    };

    const getCalendarWeekH = (s: Staff, day: number): number => {
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

    const getCalendarWeekWorkDays = (s: Staff, day: number): number => {
      const dow = dayOfWeekIdx(year, month, day);
      const startD = Math.max(1, day - dow);
      const endD = Math.min(days, day + (6 - dow));
      let count = 0;
      for (let i = startD; i <= endD; i++) {
        if (isWorkShift(newShifts[s.id][i])) count++;
      }
      return count;
    };

    const getStaffMaxDaysPerWeekRule = (s: Staff): number | null => {
      if (!parsedRules || parsedRules.length === 0) return null;
      const r = parsedRules.find((rule) => rule.staffId === s.id && rule.ruleType === 'max_days' && rule.maxDays !== undefined);
      return r?.maxDays ?? null;
    };

    const getStaffMaxConsecutiveRule = (s: Staff): number => {
      if (!parsedRules || parsedRules.length === 0) return 5;
      const r = parsedRules.find(
        (rule) => rule.staffId === s.id && rule.ruleType === 'max_consecutive' && rule.maxConsecutive !== undefined
      );
      return r?.maxConsecutive ? Math.min(5, r.maxConsecutive) : 5;
    };

    const getStaffNightLimits = (s: Staff): { maxPerWeek?: number; maxPerMonth?: number } => {
      let maxPerWeek: number | undefined = undefined;
      let maxPerMonth: number | undefined = undefined;
      if (parsedRules && parsedRules.length > 0) {
        for (const r of parsedRules) {
          if (r.staffId !== s.id) continue;
          if (r.ruleType === 'night_limit') {
            if (r.maxNightPerWeek !== undefined) {
              maxPerWeek = maxPerWeek !== undefined ? Math.min(maxPerWeek, r.maxNightPerWeek) : r.maxNightPerWeek;
            }
            if (r.maxNightPerMonth !== undefined) {
              maxPerMonth = maxPerMonth !== undefined ? Math.min(maxPerMonth, r.maxNightPerMonth) : r.maxNightPerMonth;
            }
          }
          if (r.ruleType === 'exclude_pattern' && r.shiftKey) {
            const pat = getPatternByKey(r.shiftKey, fc.id, shiftPatterns);
            if ((pat && isNight(pat)) || r.shiftKey.includes('夜')) {
              maxPerWeek = 0;
              maxPerMonth = 0;
            }
          }
          if (r.ruleType === 'specific_pattern' && r.onlyThisPattern && r.shiftKey) {
            const pat = getPatternByKey(r.shiftKey, fc.id, shiftPatterns);
            if (pat && !isNight(pat)) {
              maxPerWeek = 0;
              maxPerMonth = 0;
            }
          }
        }
      }
      return { maxPerWeek, maxPerMonth };
    };

    // Forbidden pair check
    const hasForbiddenConflict = (s: Staff, day: number): boolean => {
      const forb = effectivePairs.filter((p) => p.type === 'forbidden' && (p.a === s.id || p.b === s.id));
      return forb.some((p) => {
        const otherId = p.a === s.id ? p.b : p.a;
        return isWorkShift(newShifts[otherId]?.[day]);
      });
    };

    // Recommended pair (OJT / good compatibility) check
    const hasRecommendedPartnerOnDuty = (s: Staff, day: number): boolean => {
      const rec = effectivePairs.filter((p) => p.type === 'recommended' && (p.a === s.id || p.b === s.id));
      return rec.some((p) => {
        const otherId = p.a === s.id ? p.b : p.a;
        return isWorkShift(newShifts[otherId]?.[day]);
      });
    };

    // Unified hard-constraint checker for assigning `shiftKey` to staff `s` on `day`
    const canAssignShift = (
      s: Staff,
      day: number,
      shiftKey: string,
      options?: {
        allowPostAke?: boolean;
        targetPat?: ShiftPattern;
        ignoreDowConstraint?: boolean;
      }
    ): boolean => {
      if (lockedSet.has(s.id)) return false;
      if (prefLockedStaffDays.has(`${s.id}-${day}`)) return false;
      if (ruleLockedStaffDays.has(`${s.id}-${day}`)) return false;
      if (forcedLeaveStaffDays.has(`${s.id}-${day}`)) return false;
      if (!options?.allowPostAke && postNightRestDays.has(`${s.id}-${day}`)) return false;
      if (newShifts[s.id][day] !== '公休') return false;
      if (!isFacilityOpenDay(fc, day)) return false;

      if (!options?.allowPostAke && isPostAke(s.id, day)) return false;

      if (isPatternExcludedForStaff(s, shiftKey)) return false;

      const pat = options?.targetPat || getPatternByKey(shiftKey, fc.id, shiftPatterns);
      if (pat) {
        if (!isStaffAvailable(s, year, month, day, pat, options?.ignoreDowConstraint)) return false;
      } else {
        if (s.nightOnly) return false;
        if (!isStaffAvailable(s, year, month, day, undefined, options?.ignoreDowConstraint)) return false;
        if (shiftKey.startsWith('time:') && s.availTimeEnabled && s.availStart && s.availEnd) {
          const tv = parseTimeVal(shiftKey);
          if (!tv) return false;
          const avS = timeToMinutes(s.availStart);
          const avE = timeToMinutes(s.availEnd);
          const ptS = timeToMinutes(tv.start);
          const ptE = timeToMinutes(tv.end);
          if (avE > avS && (ptS < avS || ptE > avE)) return false;
        }
      }

      const maxConsec = getStaffMaxConsecutiveRule(s);
      if (getConsecutiveIfAssigned(s, day) > maxConsec) return false;

      const maxDaysRule = getStaffMaxDaysPerWeekRule(s);
      if (maxDaysRule !== null && getCalendarWeekWorkDays(s, day) + 1 > maxDaysRule) {
        return false;
      }

      const shiftH = getStaffDayNetH(s.id, day, shiftKey, fc.id, shiftPatterns, parsedRules);

      // Weekly hour check
      const curWeekH = getCalendarWeekH(s, day);
      const mustRule = getMustFillRule(s);
      const targetWeeklyH = mustRule?.hours || s.hours || 40;
      if (targetWeeklyH >= 40) {
        if (curWeekH + shiftH > 40 + 0.1) return false;
      } else {
        const maxWeekShifts = Math.max(1, Math.ceil((targetWeeklyH - 0.05) / Math.max(1, shiftH)));
        const maxAllowedWeekH = Math.min(40, Math.max(targetWeeklyH, maxWeekShifts * shiftH));
        if (curWeekH + shiftH > maxAllowedWeekH + 0.1) return false;
      }

      // Monthly hour check
      if (getMonthH(s) + shiftH > monthHLimit(s) + 0.5) return false;

      // Forbidden pair conflict check
      if (hasForbiddenConflict(s, day)) return false;

      return true;
    };

    const countWorkingStaffOnDay = (day: number): number =>
      fcStaff.reduce((cnt, s) => (isWorkShift(newShifts[s.id][day]) ? cnt + 1 : cnt), 0);

    const getDaySkillStats = (day: number) => {
      let maxMat = 0;
      let sumMat = 0;
      let count = 0;
      fcStaff.forEach((s) => {
        if (isWorkShift(newShifts[s.id][day])) {
          const m = s.mat || 3;
          maxMat = Math.max(maxMat, m);
          sumMat += m;
          count++;
        }
      });
      return { maxMat, avgMat: count > 0 ? sumMat / count : 0, count };
    };

    const isRestForPair = (k: string | undefined): boolean =>
      k === '公休' || k === '希望休' || k === '有休';

    // Composite score for assigning staff `s` on `day` (lower score = higher priority / better fit)
    const scoreDayForStaff = (s: Staff, day: number, shiftKey?: string): number => {
      const mRatio = getMonthH(s) / Math.max(1, monthHLimit(s));
      const wRatio = getCalendarWeekH(s, day) / Math.max(1, s.hours || 40);
      const consecAfter = getConsecutiveIfAssigned(s, day);
      const dayStaffCnt = countWorkingStaffOnDay(day);
      const skillStats = getDaySkillStats(day);
      const sMat = s.mat || 3;

      let score = 0;
      score += wRatio * 45;
      score += mRatio * 35;

      // Cluster work gently (2-3 days) instead of scattering 1-day work islands across rest days
      if (consecAfter === 1) score += 4;
      else if (consecAfter === 2) score += 2;
      else if (consecAfter === 3) score += 5;
      else if (consecAfter === 4) score += 16;
      else score += 40;

      // Preserve 2+ consecutive 公休/休 blocks; prefer filling already-isolated single 公休 or trimming the edge of 3+ day blocks
      let restBefore = 0;
      for (let i = day - 1; i >= 1; i--) {
        if (isRestForPair(newShifts[s.id][i])) restBefore++;
        else break;
      }
      let restAfter = 0;
      for (let i = day + 1; i <= days; i++) {
        if (isRestForPair(newShifts[s.id][i])) restAfter++;
        else break;
      }

      if (restBefore === 1 && restAfter === 1) {
        // Splitting a 3-day rest block into two isolated 1-day rests
        score += 32;
      } else if (restBefore === 1 || restAfter === 1) {
        // Stranding an adjacent single 公休 (including post-明け 公休 at d+2)
        score += 22;
      } else if (restBefore === 0 && restAfter === 0) {
        // Eliminating an isolated 1-day rest
        score -= 6;
      } else if ((restBefore >= 2 && restAfter === 0) || (restBefore === 0 && restAfter >= 2)) {
        // Assigning at the edge adjacent to existing work keeps a 2+ day rest block intact
        score -= 5;
      }

      score += dayStaffCnt * 8;

      if (hasRecommendedPartnerOnDuty(s, day)) {
        score -= 12;
      }

      if (skillStats.maxMat < 4 && sMat >= 4) {
        score -= 10;
      } else if (skillStats.maxMat < 3 && sMat >= 3) {
        score -= 6;
      } else if (skillStats.maxMat >= 4 && sMat <= 2) {
        score -= 5;
      } else if (skillStats.count > 0 && skillStats.maxMat <= 2 && sMat <= 2) {
        score += 10;
      }

      if (shiftKey && parsedRules && parsedRules.length > 0) {
        const hasPatRule = parsedRules.some(
          (r) => r.staffId === s.id && r.ruleType === 'specific_pattern' && r.shiftKey === shiftKey
        );
        if (hasPatRule) score -= 15;
      }

      if (getMustFillRule(s)) {
        score -= 20;
      }

      return score;
    };

    // Helper: Hourly 24h coverage mask (exact match with complianceEngine & CalendarTab)
    const getDayCoverageHours = (day: number): boolean[] => {
      const coverage = new Array(24).fill(false);
      fcStaff.forEach((s) => {
        const k = newShifts[s.id][day];
        const range = getShiftTimeRange(k, fc.id, shiftPatterns);
        if (range) {
          const sMin = timeToMinutes(range.start);
          const eMin = timeToMinutes(range.end);
          if (eMin <= sMin) {
            for (let h = Math.floor(sMin / 60); h < 24; h++) coverage[h] = true;
            for (let h = 0; h < Math.ceil(eMin / 60); h++) coverage[h] = true;
          } else {
            for (let h = Math.floor(sMin / 60); h < Math.ceil(eMin / 60); h++) coverage[h] = true;
          }
        }
        if (day > 1) {
          const prevK = newShifts[s.id][day - 1];
          const prevRange = getShiftTimeRange(prevK, fc.id, shiftPatterns);
          if (prevRange) {
            const prevSMin = timeToMinutes(prevRange.start);
            const prevEMin = timeToMinutes(prevRange.end);
            if (prevEMin <= prevSMin) {
              for (let h = 0; h < Math.ceil(prevEMin / 60); h++) coverage[h] = true;
            }
          }
        }
      });
      return coverage;
    };

    const getUncoveredHours = (day: number): number[] => {
      if (!useNight) return [];
      const cov = getDayCoverageHours(day);
      const res: number[] = [];
      for (let h = 0; h < 24; h++) {
        if (!cov[h]) res.push(h);
      }
      return res;
    };

    const getRangeHoursMask = (start: string, end: string): boolean[] => {
      const mask = new Array(24).fill(false);
      const sMin = timeToMinutes(start);
      const eMin = timeToMinutes(end);
      if (eMin <= sMin) {
        for (let h = Math.floor(sMin / 60); h < 24; h++) mask[h] = true;
        for (let h = 0; h < Math.ceil(eMin / 60); h++) mask[h] = true;
      } else {
        for (let h = Math.floor(sMin / 60); h < Math.ceil(eMin / 60); h++) mask[h] = true;
      }
      return mask;
    };

    const countUncoveredCoveredByKey = (day: number, shiftKey: string, uncov: number[]): number => {
      if (uncov.length === 0) return 0;
      const range = getShiftTimeRange(shiftKey, fc.id, shiftPatterns);
      if (!range) return 0;
      const mask = getRangeHoursMask(range.start, range.end);
      let cnt = 0;
      for (const h of uncov) {
        if (mask[h]) cnt++;
      }
      return cnt;
    };

    const neededRatio = getNeededStaff(fc);
    const ratioRoles = fcType?.ratioRoles && fcType.ratioRoles.length > 0 ? fcType.ratioRoles : ['介護職員'];

    const calcCareOnDuty = (day: number) =>
      fcStaff.reduce((sum, s) => {
        const shiftKey = newShifts[s.id][day];
        if (isWorkShift(shiftKey) || shiftKey === '明け') {
          return sum + getStaffRoleAllocationRatio(s, ratioRoles);
        }
        return sum;
      }, 0);

    // Precompute daily eligibility capacity so scarce days (e.g. Sundays) are protected
    const dayEligibleCareCap: Record<number, number> = {};
    const dayNightEligibleCount: Record<number, number> = {};
    for (let d = 1; d <= days; d++) {
      let careCap = 0;
      let nightCap = 0;
      fcStaff.forEach((s) => {
        if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) return;
        if (!isStaffWorkingOnFacilityDay(s, year, month, d)) return;
        if (isStaffAvailable(s, year, month, d, undefined, false)) {
          careCap += getStaffRoleAllocationRatio(s, ratioRoles);
          if (s.night && nightPats.length > 0 && isStaffAvailable(s, year, month, d, nightPats[0], false)) {
            nightCap++;
          }
        }
      });
      dayEligibleCareCap[d] = careCap;
      dayNightEligibleCount[d] = nightCap;
    }

    // Estimate available remaining care capacity on `targetDay` (accounting for locked leaves, 他事業所, post-night rest, and already-assigned shifts)
    const getRemainingCarePotentialOnDay = (targetDay: number, excludeStaffId?: number): number => {
      if (targetDay < 1 || targetDay > days) return 99;
      let cap = 0;
      fcStaff.forEach((st) => {
        if (st.id === excludeStaffId) return;
        const k = newShifts[st.id][targetDay];
        const r = getStaffRoleAllocationRatio(st, ratioRoles);
        if (r <= 0) return;
        if (isWorkShift(k) || k === '明け') {
          cap += r;
          return;
        }
        if (k !== '公休') return; // 有休, 希望休, 他事業所
        if (forcedLeaveStaffDays.has(`${st.id}-${targetDay}`)) return;
        if (postNightRestDays.has(`${st.id}-${targetDay}`)) return;
        if (isPostAke(st.id, targetDay)) return;
        if (lockedSet.has(st.id)) return;
        if (isStaffAvailable(st, year, month, targetDay, undefined, false)) {
          cap += r;
        }
      });
      return cap;
    };

    const hasRole = (s: Staff, roleKeywords: string[]) => {
      const rList = Array.isArray(s.roles) ? s.roles : [s.role];
      const qList = Array.isArray(s.quals) ? s.quals : [s.qual];
      return (
        rList.some((r) => r && roleKeywords.some((kw) => r.includes(kw))) ||
        qList.some((q) => q && roleKeywords.some((kw) => q.includes(kw)))
      );
    };

    // Ratio-balanced day score (lower = better fit)
    const scoreDayBalanced = (s: Staff, day: number, shiftKey?: string): number => {
      const mRatio = getMonthH(s) / Math.max(1, monthHLimit(s));
      const wRatio = getCalendarWeekH(s, day) / Math.max(1, s.hours || 40);
      const consecAfter = getConsecutiveIfAssigned(s, day);
      const dayStaffCnt = countWorkingStaffOnDay(day);
      const skillStats = getDaySkillStats(day);
      const sMat = s.mat || 3;
      const sRatio = getStaffRoleAllocationRatio(s, ratioRoles);
      const curCare = calcCareOnDuty(day);
      const careAfter = curCare + sRatio;

      let score = 0;
      score += wRatio * 35;
      score += mRatio * 25;

      // Strong daily care ratio balancing (prevents 6.6/3 spikes & understaffed troughs)
      if (sRatio > 0 && fcType?.ratio) {
        if (curCare < neededRatio - 0.001) {
          score -= 70;
        } else {
          const surplusAfter = Math.max(0, careAfter - neededRatio);
          score += surplusAfter * 26 + surplusAfter * surplusAfter * 10;
        }
      }
      score += dayStaffCnt * 4;

      // Cluster work gently (2-3 days)
      if (consecAfter === 1) score += 4;
      else if (consecAfter === 2) score += 2;
      else if (consecAfter === 3) score += 5;
      else if (consecAfter === 4) score += 16;
      else score += 40;

      // Preserve 2+ consecutive 公休 blocks
      let restBefore = 0;
      for (let i = day - 1; i >= 1; i--) {
        if (isRestForPair(newShifts[s.id][i])) restBefore++;
        else break;
      }
      let restAfter = 0;
      for (let i = day + 1; i <= days; i++) {
        if (isRestForPair(newShifts[s.id][i])) restAfter++;
        else break;
      }

      if (restBefore === 1 && restAfter === 1) {
        score += 32;
      } else if (restBefore === 1 || restAfter === 1) {
        score += 22;
      } else if (restBefore === 0 && restAfter === 0) {
        score -= 6;
      } else if ((restBefore >= 2 && restAfter === 0) || (restBefore === 0 && restAfter >= 2)) {
        score -= 5;
      }

      if (hasRecommendedPartnerOnDuty(s, day)) {
        score -= 12;
      }

      if (skillStats.maxMat < 4 && sMat >= 4) {
        score -= 10;
      } else if (skillStats.maxMat < 3 && sMat >= 3) {
        score -= 6;
      } else if (skillStats.maxMat >= 4 && sMat <= 2) {
        score -= 5;
      } else if (skillStats.count > 0 && skillStats.maxMat <= 2 && sMat <= 2) {
        score += 10;
      }

      if (shiftKey && parsedRules && parsedRules.length > 0) {
        const hasPatRule = parsedRules.some(
          (r) => r.staffId === s.id && r.ruleType === 'specific_pattern' && r.shiftKey === shiftKey
        );
        if (hasPatRule) score -= 15;
      }

      if (getMustFillRule(s)) {
        score -= 20;
      }

      return score;
    };

    // =========================================================================
    // PASS 1: Night Shift Assignment (Scarce-Day Preserving & MRV-Ordered)
    // =========================================================================
    if (useNight && nightPats.length > 0) {
      const np = nightPats[0];
      const npH = netHours(np);

      // Ensure any pre-entered or rule-locked night shifts have 明け on d+1
      for (let d = 1; d <= days; d++) {
        fcStaff.forEach((s) => {
          const k = newShifts[s.id][d];
          if (nightPats.some((p) => p.key === k)) {
            if (d + 1 <= days && !lockedSet.has(s.id) && !prefLockedStaffDays.has(`${s.id}-${d + 1}`)) {
              newShifts[s.id][d + 1] = '明け';
            }
            if (
              d + 2 <= days &&
              !lockedSet.has(s.id) &&
              !prefLockedStaffDays.has(`${s.id}-${d + 2}`) &&
              !ruleLockedStaffDays.has(`${s.id}-${d + 2}`) &&
              newShifts[s.id][d + 2] === '公休'
            ) {
              postNightRestDays.add(`${s.id}-${d + 2}`);
            }
          }
        });
      }

      const countNights = (s: Staff) =>
        Object.values(newShifts[s.id]).filter((k) => nightPats.some((p) => p.key === k)).length;

      const countNightsInCalendarWeek = (s: Staff, day: number): number => {
        const dow = dayOfWeekIdx(year, month, day);
        const startD = Math.max(1, day - dow);
        const endD = Math.min(days, day + (6 - dow));
        let cnt = 0;
        for (let i = startD; i <= endD; i++) {
          if (nightPats.some((p) => p.key === newShifts[s.id][i])) cnt++;
        }
        return cnt;
      };

      const minDistanceToOtherNight = (s: Staff, day: number): number => {
        let minDist = 99;
        for (let i = 1; i <= days; i++) {
          if (i !== day && nightPats.some((p) => p.key === newShifts[s.id][i])) {
            minDist = Math.min(minDist, Math.abs(day - i));
          }
        }
        return minDist;
      };

      // Order days by scarcity tier FIRST so scarce days, nights before scarce d+1, and nights before scarce d+2
      // (e.g. Fridays before Sundays) are assigned BEFORE ordinary weekdays with incidental leave
      const nightDaysOrdered = Array.from({ length: days }, (_, i) => i + 1).sort((a, b) => {
        const tier = (d: number) => {
          if (dayNightEligibleCount[d] <= 2) return 0; // Critical night bottleneck
          const w = dayOfWeekIdx(year, month, d);
          if (w === 0 || dayEligibleCareCap[d] <= neededRatio + 0.5) return 1; // Sunday / critically scarce day
          if (w === 6 || (d + 1 <= days && dayEligibleCareCap[d + 1] <= neededRatio + 0.5)) return 2; // Saturday / before critically scarce d+1
          if (d + 2 <= days && dayEligibleCareCap[d + 2] <= neededRatio + 0.5) return 3; // Day whose d+2 is critically scarce (e.g. Friday before Sunday)
          if (
            (d + 1 <= days && dayEligibleCareCap[d + 1] <= neededRatio + 1.8) ||
            (d + 2 <= days && dayEligibleCareCap[d + 2] <= neededRatio + 1.8)
          ) {
            return 4;
          }
          return 5;
        };
        const tA = tier(a);
        const tB = tier(b);
        if (tA !== tB) return tA - tB;
        const capDiff = dayNightEligibleCount[a] - dayNightEligibleCount[b];
        if (capDiff !== 0) return capDiff;
        return a - b;
      });

      for (const d of nightDaysOrdered) {
        const alreadyHasNight = fcStaff.some((s) => {
          const k = newShifts[s.id][d];
          return nightPats.some((p) => p.key === k);
        });
        if (alreadyHasNight) continue;

        const findNightCandidates = (
          allowPostAkeFlag: boolean,
          requireMat3: boolean,
          excludeMustFillStaff: boolean,
          minDistReq: number = 3
        ) =>
          fcStaff.filter((s) => {
            if (!s.night) return false;
            if (excludeMustFillStaff && getMustFillRule(s) && !s.nightOnly) return false;
            if (requireMat3 && (s.mat || 3) < 3 && !s.nightOnly) return false;
            if (minDistanceToOtherNight(s, d) < minDistReq) return false;

            const nightLimits = getStaffNightLimits(s);
            if (nightLimits.maxPerMonth !== undefined && countNights(s) >= nightLimits.maxPerMonth) {
              return false;
            }
            if (nightLimits.maxPerWeek !== undefined) {
              if (countNightsInCalendarWeek(s, d) >= nightLimits.maxPerWeek) {
                return false;
              }
              if (nightLimits.maxPerWeek === 1 && minDistanceToOtherNight(s, d) < 6) {
                return false;
              }
            }

            if (!canAssignShift(s, d, np.key, { allowPostAke: allowPostAkeFlag, targetPat: np })) {
              return false;
            }
            // d + 1 must be available for '明け'
            if (d + 1 <= days) {
              if (prefLockedStaffDays.has(`${s.id}-${d + 1}`) && newShifts[s.id][d + 1] !== '明け') return false;
              if (ruleLockedStaffDays.has(`${s.id}-${d + 1}`) && newShifts[s.id][d + 1] !== '明け') return false;
              if (newShifts[s.id][d + 1] !== '公休' && newShifts[s.id][d + 1] !== '明け') return false;
            }
            // d + 2 should not have a locked work shift
            if (d + 2 <= days && isWorkShift(newShifts[s.id][d + 2])) {
              return false;
            }
            if (getMonthH(s) + npH > monthHLimit(s) + 0.5) return false;
            return true;
          });

        let candidates = findNightCandidates(false, true, true, 3);
        if (candidates.length === 0) candidates = findNightCandidates(false, false, true, 3);
        if (candidates.length === 0) candidates = findNightCandidates(false, true, false, 3);
        if (candidates.length === 0) candidates = findNightCandidates(false, false, false, 3);

        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            if (a.nightOnly && !b.nightOnly) return -1;
            if (!a.nightOnly && b.nightOnly) return 1;

            const scoreCand = (s: Staff): number => {
              const dist = minDistanceToOtherNight(s, d);
              const closePenalty = dist <= 2 ? 250 : dist === 3 ? 70 : dist === 4 ? 25 : dist === 5 ? 10 : 0;
              const weekNights = countNightsInCalendarWeek(s, d);
              const strandPenalty =
                d > 2 && isRestForPair(newShifts[s.id][d - 1]) && !isRestForPair(newShifts[s.id][d - 2]) ? 6 : 0;

              let scarcePenalty = 0;
              if (d + 1 <= days) {
                const worksFacD1 = isStaffWorkingOnFacilityDay(s, year, month, d + 1);
                const sAvailD1 = isStaffAvailable(s, year, month, d + 1, undefined, false);
                if (!worksFacD1) {
                  // Works at another facility on d+1 -> avoid putting on d night
                  scarcePenalty += 120;
                } else if (!sAvailD1) {
                  // d+1 is already an off day in availDays: taking d night frees daytime-eligible staff on d+1!
                  if (dayEligibleCareCap[d + 1] <= neededRatio + 1.8) {
                    scarcePenalty -= 150;
                  } else {
                    scarcePenalty -= 15;
                  }
                } else if (dayEligibleCareCap[d + 1] <= neededRatio + 0.5) {
                  // Putting a scarce d+1 worker on night loses 1 daytime/night slot on d+1 (since 明け cannot work daytime)
                  scarcePenalty += 40;
                }
              }
              // Avoid starving d+2 (postNightRestDays) if d+2 is a scarce day
              if (d + 2 <= days) {
                const sCanWorkD2 =
                  isStaffAvailable(s, year, month, d + 2, undefined, false) &&
                  isStaffWorkingOnFacilityDay(s, year, month, d + 2);
                const d2IsScarce = dayEligibleCareCap[d + 2] <= neededRatio + 1.8;
                if (!sCanWorkD2) {
                  // Staff cannot work d+2 anyway -> taking d night does NOT lose d+2 capacity!
                  if (d2IsScarce) scarcePenalty -= 180;
                  else scarcePenalty -= 10;
                } else {
                  const remAfter = getRemainingCarePotentialOnDay(d + 2, s.id);
                  // Also count active (non-明け) care potential on d+2 so 1 明け doesn't mask a daytime shortage
                  let remActiveD2 = 0;
                  fcStaff.forEach((st) => {
                    if (st.id === s.id) return;
                    const k2 = newShifts[st.id][d + 2];
                    if (k2 === '明け') return;
                    const r2 = getStaffRoleAllocationRatio(st, ratioRoles);
                    if (r2 <= 0) return;
                    if (isWorkShift(k2)) {
                      remActiveD2 += r2;
                    } else if (
                      k2 === '公休' &&
                      !forcedLeaveStaffDays.has(`${st.id}-${d + 2}`) &&
                      !postNightRestDays.has(`${st.id}-${d + 2}`) &&
                      !isPostAke(st.id, d + 2) &&
                      !lockedSet.has(st.id) &&
                      isStaffAvailable(st, year, month, d + 2, undefined, false) &&
                      isStaffWorkingOnFacilityDay(st, year, month, d + 2)
                    ) {
                      remActiveD2 += r2;
                    }
                  });
                  if (remAfter < neededRatio - 0.001 || (d2IsScarce && remActiveD2 < 2.99)) {
                    scarcePenalty += 600;
                  } else if (remAfter < neededRatio + 0.9 || (d2IsScarce && remActiveD2 < 3.99)) {
                    scarcePenalty += 120;
                  }
                }
              }

              return (
                scarcePenalty +
                weekNights * 55 +
                countNights(s) * 8 +
                closePenalty +
                strandPenalty +
                (getMonthH(s) / Math.max(1, monthHLimit(s))) * 4
              );
            };

            return scoreCand(a) - scoreCand(b);
          });

          const picked = candidates[0];
          newShifts[picked.id][d] = np.key;
          if (d + 1 <= days && !lockedSet.has(picked.id)) {
            newShifts[picked.id][d + 1] = '明け';
          }
          if (
            d + 2 <= days &&
            !lockedSet.has(picked.id) &&
            !prefLockedStaffDays.has(`${picked.id}-${d + 2}`) &&
            !ruleLockedStaffDays.has(`${picked.id}-${d + 2}`)
          ) {
            newShifts[picked.id][d + 2] = '公休';
            postNightRestDays.add(`${picked.id}-${d + 2}`);
          }
        }
      }

      // Helper to assign/clear a night shift and its 明け / postNightRestDays safely
      const setNightOnDay = (s: Staff, d: number) => {
        newShifts[s.id][d] = np.key;
        if (d + 1 <= days && !lockedSet.has(s.id)) {
          newShifts[s.id][d + 1] = '明け';
        }
        if (
          d + 2 <= days &&
          !lockedSet.has(s.id) &&
          !prefLockedStaffDays.has(`${s.id}-${d + 2}`) &&
          !ruleLockedStaffDays.has(`${s.id}-${d + 2}`) &&
          newShifts[s.id][d + 2] === '公休'
        ) {
          postNightRestDays.add(`${s.id}-${d + 2}`);
        }
      };

      const clearNightOnDay = (s: Staff, d: number) => {
        newShifts[s.id][d] = '公休';
        if (d + 1 <= days && !lockedSet.has(s.id) && !prefLockedStaffDays.has(`${s.id}-${d + 1}`) && !ruleLockedStaffDays.has(`${s.id}-${d + 1}`) && newShifts[s.id][d + 1] === '明け') {
          newShifts[s.id][d + 1] = '公休';
        }
        if (d + 2 <= days) {
          postNightRestDays.delete(`${s.id}-${d + 2}`);
        }
      };

      const canTakeNightStrict = (s: Staff, d: number, minDistReq: number = 3): boolean => {
        if (!s.night) return false;
        if (minDistanceToOtherNight(s, d) < minDistReq) return false;
        const nightLimits = getStaffNightLimits(s);
        if (nightLimits.maxPerMonth !== undefined && countNights(s) >= nightLimits.maxPerMonth) return false;
        if (nightLimits.maxPerWeek !== undefined) {
          if (countNightsInCalendarWeek(s, d) >= nightLimits.maxPerWeek) return false;
          if (nightLimits.maxPerWeek === 1 && minDistanceToOtherNight(s, d) < 6) return false;
        }
        if (!canAssignShift(s, d, np.key, { allowPostAke: false, targetPat: np })) return false;
        if (d + 1 <= days) {
          if (prefLockedStaffDays.has(`${s.id}-${d + 1}`) && newShifts[s.id][d + 1] !== '明け') return false;
          if (ruleLockedStaffDays.has(`${s.id}-${d + 1}`) && newShifts[s.id][d + 1] !== '明け') return false;
          if (newShifts[s.id][d + 1] !== '公休' && newShifts[s.id][d + 1] !== '明け') return false;
        }
        if (d + 2 <= days && isWorkShift(newShifts[s.id][d + 2])) return false;
        if (getMonthH(s) + npH > monthHLimit(s) + 0.5) return false;
        return true;
      };

      // 1A: Repair any day that ended up without a night shift (try dist>=3 swap before allowing dist=2 fallback)
      for (let d = 1; d <= days; d++) {
        const hasN = fcStaff.some((s) => nightPats.some((p) => p.key === newShifts[s.id][d]));
        if (hasN) continue;

        let fixedN = false;
        for (let delta = -3; delta <= 3 && !fixedN; delta++) {
          const dBlock = d + delta;
          if (dBlock < 1 || dBlock > days || dBlock === d) continue;
          for (const holder of fcStaff) {
            if (newShifts[holder.id][dBlock] !== np.key) continue;
            if (lockedSet.has(holder.id) || prefLockedStaffDays.has(`${holder.id}-${dBlock}`) || ruleLockedStaffDays.has(`${holder.id}-${dBlock}`)) continue;

            clearNightOnDay(holder, dBlock);
            if (canTakeNightStrict(holder, d, 3)) {
              for (const alt of fcStaff) {
                if (alt.id === holder.id) continue;
                if (canTakeNightStrict(alt, dBlock, 3)) {
                  setNightOnDay(alt, dBlock);
                  setNightOnDay(holder, d);
                  fixedN = true;
                  break;
                }
              }
            }
            if (!fixedN) {
              setNightOnDay(holder, dBlock);
            } else {
              break;
            }
          }
        }

        // Last resort fallback (dist>=2 or allowPostAke) if still unfilled
        if (!fixedN) {
          const fb = fcStaff.filter(
            (s) =>
              canTakeNightStrict(s, d, 2) ||
              (s.night &&
                canAssignShift(s, d, np.key, { allowPostAke: true, targetPat: np }) &&
                (d + 1 > days || newShifts[s.id][d + 1] === '公休' || newShifts[s.id][d + 1] === '明け') &&
                (d + 2 > days || !isWorkShift(newShifts[s.id][d + 2])))
          );
          if (fb.length > 0) {
            fb.sort((a, b) => countNights(a) - countNights(b));
            setNightOnDay(fb[0], d);
          }
        }
      }

      // 1B: Ensure every open day retains enough care potential (accounting for 40h/week limits, Sunday reservation & postNightRestDays)
      const typicalDayH = dayPats.length > 0 ? Math.min(...dayPats.map((p) => netHours(p))) : 8;
      const getEffectiveCareCapAfterNights = (targetD: number): number => {
        let cap = 0;
        const dowT = dayOfWeekIdx(year, month, targetD);
        const weekStartT = Math.max(1, targetD - dowT);
        fcStaff.forEach((st) => {
          const k = newShifts[st.id][targetD];
          const r = getStaffRoleAllocationRatio(st, ratioRoles);
          if (r <= 0) return;
          if (isWorkShift(k) || k === '明け') {
            cap += r;
            return;
          }
          if (k !== '公休') return;
          if (forcedLeaveStaffDays.has(`${st.id}-${targetD}`)) return;
          if (postNightRestDays.has(`${st.id}-${targetD}`)) return;
          if (isPostAke(st.id, targetD)) return;
          if (!isStaffAvailable(st, year, month, targetD, undefined, false)) return;
          if (!isStaffWorkingOnFacilityDay(st, year, month, targetD)) return;
          // Check weekly hours room (reserving hours for scarce earlier days in the same week such as Sunday)
          let wH = getCalendarWeekH(st, targetD);
          if (
            dowT > 0 &&
            weekStartT >= 1 &&
            dayEligibleCareCap[weekStartT] <= neededRatio + 0.5 &&
            newShifts[st.id][weekStartT] === '公休' &&
            !forcedLeaveStaffDays.has(`${st.id}-${weekStartT}`) &&
            !postNightRestDays.has(`${st.id}-${weekStartT}`) &&
            isStaffAvailable(st, year, month, weekStartT, undefined, false) &&
            isStaffWorkingOnFacilityDay(st, year, month, weekStartT)
          ) {
            wH += typicalDayH;
          }
          const mH = getMonthH(st);
          const sLim = getMustFillRule(st)?.hours || st.hours || 40;
          const maxW = sLim >= 40 ? 40 : Math.min(40, Math.max(sLim, Math.ceil((sLim - 0.05) / Math.max(1, typicalDayH)) * typicalDayH));
          if (wH + (st.availTimeEnabled ? 4 : typicalDayH) > maxW + 0.1) return;
          if (mH + (st.availTimeEnabled ? 4 : typicalDayH) > monthHLimit(st) + 0.5) return;
          cap += r;
        });
        return cap;
      };

      for (let d = 1; d <= days; d++) {
        if (!isFacilityOpenDay(fc, d)) continue;
        if (getEffectiveCareCapAfterNights(d) >= neededRatio - 0.001) continue;

        // Try relocating a night shift in the same week (d-6..d) from a staff member whose d capacity is blocked
        let improvedCap = true;
        while (getEffectiveCareCapAfterNights(d) < neededRatio - 0.001 && improvedCap) {
          improvedCap = false;
          const beforeCapD = getEffectiveCareCapAfterNights(d);
          const dowD = dayOfWeekIdx(year, month, d);
          const wStart = Math.max(1, d - dowD);

          let bestSwap: { fromD: number; fromS: Staff; toS: Staff; score: number } | null = null;
          for (let nD = wStart; nD <= d; nD++) {
            for (const fromS of fcStaff) {
              if (newShifts[fromS.id][nD] !== np.key) continue;
              if (lockedSet.has(fromS.id) || prefLockedStaffDays.has(`${fromS.id}-${nD}`) || ruleLockedStaffDays.has(`${fromS.id}-${nD}`)) continue;

              clearNightOnDay(fromS, nD);
              for (const toS of fcStaff) {
                if (toS.id === fromS.id) continue;
                if (!canTakeNightStrict(toS, nD, 3)) continue;
                setNightOnDay(toS, nD);
                const afterCapD = getEffectiveCareCapAfterNights(d);
                const afterCapD2 = nD + 2 <= days ? getEffectiveCareCapAfterNights(nD + 2) : 99;
                const d1CapOk = nD + 1 <= days ? getEffectiveCareCapAfterNights(nD + 1) >= neededRatio - 0.001 : true;
                if (afterCapD > beforeCapD + 0.05 && afterCapD2 >= neededRatio - 0.001 && d1CapOk) {
                  const sc = countNightsInCalendarWeek(toS, nD) * 50 + countNights(toS) * 10 - afterCapD * 20;
                  if (!bestSwap || sc < bestSwap.score) {
                    bestSwap = { fromD: nD, fromS, toS, score: sc };
                  }
                }
                clearNightOnDay(toS, nD);
              }
              setNightOnDay(fromS, nD);
            }
          }

          if (bestSwap) {
            clearNightOnDay(bestSwap.fromS, bestSwap.fromD);
            setNightOnDay(bestSwap.toS, bestSwap.fromD);
            improvedCap = true;
          }
        }
      }
    }

    if (dayPats.length === 0) return;

    // Sort open days by scarcity (fewest eligible care staff first -> Sundays/holidays before weekdays)
    const allOpenDaysByScarcity = Array.from({ length: days }, (_, i) => i + 1)
      .filter((d) => isFacilityOpenDay(fc, d))
      .sort((a, b) => {
        const capDiff = dayEligibleCareCap[a] - dayEligibleCareCap[b];
        if (Math.abs(capDiff) > 0.1) return capDiff;
        const dowA = dayOfWeekIdx(year, month, a);
        const dowB = dayOfWeekIdx(year, month, b);
        const prio = (w: number) => (w === 0 ? 0 : w === 6 ? 1 : 2);
        return prio(dowA) - prio(dowB);
      });

    const countPatternForStaff = (s: Staff, patKey: string) =>
      Object.values(newShifts[s.id]).filter((k) => k === patKey).length;

    const isAdminOrPlanRole = (s: Staff) => hasRole(s, ['管理者', '計画作成', '介護支援専門員']);

    // Helper: Pick best pattern for `s` on `day` considering uncovered hours, early/late presence, and preferences
    const pickBestDayPatternForStaff = (
      s: Staff,
      day: number,
      preferCoverage: boolean = true
    ): string | null => {
      const uncov = preferCoverage ? getUncoveredHours(day) : [];
      const hasEarly = Boolean(earlyPat && fcStaff.some((st) => newShifts[st.id][day] === earlyPat.key));
      const hasLate = Boolean(latePat && fcStaff.some((st) => newShifts[st.id][day] === latePat.key));
      const isAdminPlan = isAdminOrPlanRole(s);

      // Build candidate keys for `s` on `day`
      const candKeys: string[] = [];
      for (const p of dayPats) {
        if (canAssignShift(s, day, p.key, { targetPat: p })) {
          candKeys.push(p.key);
        }
      }
      const defaultKey = getStaffWorkShiftKey(s, day, stdDayPat);
      if (defaultKey && !candKeys.includes(defaultKey) && canAssignShift(s, day, defaultKey)) {
        candKeys.push(defaultKey);
      }

      if (candKeys.length === 0) return null;

      candKeys.sort((a, b) => {
        const scoreKey = (k: string): number => {
          let sc = 0;
          const covCnt = countUncoveredCoveredByKey(day, k, uncov);
          if (uncov.length > 0) {
            sc -= covCnt * 100;
            // Slight preference for covering 17:00-18:00+ evening hours if tied
            const range = getShiftTimeRange(k, fc.id, shiftPatterns);
            if (range) {
              const mask = getRangeHoursMask(range.start, range.end);
              if (uncov.includes(17) && mask[17]) sc -= 10;
              if (uncov.includes(18) && mask[18]) sc -= 10;
            }
          }
          // When no gaps or as tie-breaker: cover missing early/late shifts (prefer pure care staff over admin/plan)
          if (!isAdminPlan) {
            if (latePat && k === latePat.key && !hasLate) sc -= 40;
            if (earlyPat && k === earlyPat.key && !hasEarly) sc -= 35;
          } else {
            if (stdDayPat && k === stdDayPat.key) sc -= 20;
          }
          if (stdDayPat && k === stdDayPat.key) sc -= 10;
          sc += countPatternForStaff(s, k) * 2;
          return sc;
        };
        return scoreKey(a) - scoreKey(b);
      });

      return candKeys[0];
    };

    // =========================================================================
    // PASS 2: Core Coverage (24h Gaps incl. 17-18時, Early/Late, Skill Leader, Min Care Ratio)
    // Run in scarcity order BEFORE bulk weekday filling so scarce days keep capacity!
    // =========================================================================
    allOpenDaysByScarcity.forEach((d) => {
      // 2A: Eliminate ALL 24h uncovered hours (e.g., 16時, 17時, 18時) on day `d`
      if (useNight) {
        let guard = 0;
        while (getUncoveredHours(d).length > 0 && guard < fcStaff.length + 3) {
          guard++;
          const uncov = getUncoveredHours(d);
          const beforeLen = uncov.length;

          // Try finding an unassigned staff member who covers the maximum uncovered hours
          let bestPick: { s: Staff; key: string; covCnt: number; sc: number } | null = null;
          for (const s of fcStaff) {
            if (s.nightOnly) continue;
            const candidateKeys: string[] = [];
            for (const p of dayPats) {
              if (canAssignShift(s, d, p.key, { targetPat: p })) candidateKeys.push(p.key);
            }
            const defK = getStaffWorkShiftKey(s, d, stdDayPat);
            if (defK && !candidateKeys.includes(defK) && canAssignShift(s, d, defK)) {
              candidateKeys.push(defK);
            }

            for (const k of candidateKeys) {
              const covCnt = countUncoveredCoveredByKey(d, k, uncov);
              if (covCnt <= 0) continue;
              const isAdminPlan = isAdminOrPlanRole(s);
              const adminPenalty = isAdminPlan ? 120 : 0;
              let patTieBreaker = 0;
              if (!isAdminPlan) {
                if (latePat && k === latePat.key) patTieBreaker -= 6;
                else if (earlyPat && k === earlyPat.key) patTieBreaker -= 4;
              } else if (stdDayPat && k === stdDayPat.key) {
                patTieBreaker -= 12;
              }
              const sc = -covCnt * 100 + adminPenalty + patTieBreaker + scoreDayBalanced(s, d, k);
              if (!bestPick || sc < bestPick.sc) {
                bestPick = { s, key: k, covCnt, sc };
              }
            }
          }

          if (bestPick) {
            newShifts[bestPick.s.id][d] = bestPick.key;
            continue;
          }

          // Fallback: convert an already-assigned daytime worker on `d` to a pattern covering more uncovered hours
          let converted = false;
          for (const s of fcStaff) {
            if (lockedSet.has(s.id) || prefLockedStaffDays.has(`${s.id}-${d}`) || ruleLockedStaffDays.has(`${s.id}-${d}`)) {
              continue;
            }
            const curK = newShifts[s.id][d];
            if (!isWorkShift(curK) || nightPats.some((p) => p.key === curK)) continue;
            const curH = getStaffDayNetH(s.id, d, curK, fc.id, shiftPatterns, parsedRules);

            for (const p of dayPats) {
              if (p.key === curK) continue;
              if (isPatternExcludedForStaff(s, p.key)) continue;
              if (!isStaffAvailable(s, year, month, d, p)) continue;
              const newH = netHours(p);
              if (newH - curH > 0.5 && (getMonthH(s) - curH + newH > monthHLimit(s) + 0.5 || getCalendarWeekH(s, d) - curH + newH > 40.1)) {
                continue;
              }
              newShifts[s.id][d] = p.key;
              const afterLen = getUncoveredHours(d).length;
              if (afterLen < beforeLen) {
                converted = true;
                break;
              }
              newShifts[s.id][d] = curK;
            }
            if (converted) break;
          }

          if (!converted) break;
        }
      }

      // 2B: Ensure Early ('早') and Late ('遅') coverage when staffing permits (protects 17-18時 handover!)
      const hasEnoughCapForExtra = dayEligibleCareCap[d] >= neededRatio + 0.4;
      if (latePat && latePat.key !== stdDayPat?.key && !fcStaff.some((s) => newShifts[s.id][d] === latePat.key)) {
        if (hasEnoughCapForExtra || !useNight || calcCareOnDuty(d) < neededRatio - 0.001) {
          const cand = fcStaff.filter((s) => canAssignShift(s, d, latePat.key, { targetPat: latePat }));
          if (cand.length > 0) {
            cand.sort((a, b) => {
              const adminA = isAdminOrPlanRole(a) ? 120 : 0;
              const adminB = isAdminOrPlanRole(b) ? 120 : 0;
              return (
                adminA +
                scoreDayBalanced(a, d, latePat.key) +
                countPatternForStaff(a, latePat.key) * 4 -
                (adminB + scoreDayBalanced(b, d, latePat.key) + countPatternForStaff(b, latePat.key) * 4)
              );
            });
            newShifts[cand[0].id][d] = latePat.key;
          }
        }
      }

      if (
        earlyPat &&
        earlyPat.key !== stdDayPat?.key &&
        earlyPat.key !== latePat?.key &&
        !fcStaff.some((s) => newShifts[s.id][d] === earlyPat.key)
      ) {
        if (hasEnoughCapForExtra || !useNight || calcCareOnDuty(d) < neededRatio - 0.001) {
          const cand = fcStaff.filter((s) => canAssignShift(s, d, earlyPat.key, { targetPat: earlyPat }));
          if (cand.length > 0) {
            cand.sort((a, b) => {
              const adminA = isAdminOrPlanRole(a) ? 120 : 0;
              const adminB = isAdminOrPlanRole(b) ? 120 : 0;
              return (
                adminA +
                scoreDayBalanced(a, d, earlyPat.key) +
                countPatternForStaff(a, earlyPat.key) * 4 -
                (adminB + scoreDayBalanced(b, d, earlyPat.key) + countPatternForStaff(b, earlyPat.key) * 4)
              );
            });
            newShifts[cand[0].id][d] = earlyPat.key;
          }
        }
      }

      // 2C: Skill Leader Coverage (mat >= 3)
      const skillStats = getDaySkillStats(d);
      if (skillStats.maxMat < 3) {
        const leaderCand = fcStaff.filter((s) => {
          if ((s.mat || 3) < 3) return false;
          return pickBestDayPatternForStaff(s, d) !== null;
        });
        if (leaderCand.length > 0) {
          leaderCand.sort((a, b) => {
            if ((b.mat || 3) !== (a.mat || 3)) return (b.mat || 3) - (a.mat || 3);
            return scoreDayBalanced(a, d) - scoreDayBalanced(b, d);
          });
          const picked = leaderCand[0];
          const k = pickBestDayPatternForStaff(picked, d);
          if (k) newShifts[picked.id][d] = k;
        }
      }

      // 2D: Minimum Care Staff Ratio Fulfillment
      let currentCareOnDuty = calcCareOnDuty(d);
      let safety = 0;
      while (currentCareOnDuty < neededRatio - 0.001 && safety < fcStaff.length + 2) {
        safety++;
        const cand = fcStaff.filter((s) => {
          if (getStaffRoleAllocationRatio(s, ratioRoles) <= 0) return false;
          return pickBestDayPatternForStaff(s, d) !== null;
        });
        if (cand.length === 0) break;

        cand.sort((a, b) => scoreDayBalanced(a, d) - scoreDayBalanced(b, d));
        const picked = cand[0];
        const k = pickBestDayPatternForStaff(picked, d);
        if (!k) break;
        newShifts[picked.id][d] = k;
        currentCareOnDuty += getStaffRoleAllocationRatio(picked, ratioRoles);
      }
    });

    // =========================================================================
    // PASS 3: Administrative, Plan Creator, Specialized Roles & `must_fill_hours`
    // Placed using ratio-balanced scoring so they spread across least-crowded days
    // =========================================================================
    const specialRoleStaff = fcStaff.filter(
      (s) =>
        !s.nightOnly &&
        hasRole(s, ['管理者', '計画作成', '介護支援専門員', '看護', 'ナース', '准看', '生活相談員', '機能訓練', 'サービス提供責任者'])
    );

    specialRoleStaff.forEach((s) => {
      if (lockedSet.has(s.id)) return;
      const isAdminOrPlan = isAdminOrPlanRole(s);
      const typicalH = getTypicalShiftH(s);

      let safety = 0;
      while (getMonthH(s) + typicalH <= monthHLimit(s) + 0.5 && safety < days + 5) {
        safety++;
        const validDays: Array<{ d: number; key: string; score: number }> = [];

        for (let d = 1; d <= days; d++) {
          if (!isFacilityOpenDay(fc, d)) continue;
          const shiftKey = pickBestDayPatternForStaff(s, d) || getStaffWorkShiftKey(s, d, stdDayPat);
          if (!canAssignShift(s, d, shiftKey)) continue;

          const dow = dayOfWeekIdx(year, month, d);
          const isWeekday = dow >= 1 && dow <= 5;
          let sc = scoreDayBalanced(s, d, shiftKey);
          if (isAdminOrPlan && isWeekday) {
            sc -= 4;
          }
          validDays.push({ d, key: shiftKey, score: sc });
        }

        if (validDays.length === 0) break;
        validDays.sort((a, b) => a.score - b.score);
        const best = validDays[0];
        newShifts[s.id][best.d] = best.key;
      }
    });

    const mustFillStaff = fcStaff.filter((s) => !lockedSet.has(s.id) && !s.nightOnly && Boolean(getMustFillRule(s)));
    mustFillStaff.forEach((s) => {
      const typicalH = getTypicalShiftH(s);
      let safety = 0;
      while (getMonthH(s) + typicalH <= monthHLimit(s) + 0.5 && safety < days + 5) {
        safety++;
        const validDays: Array<{ d: number; key: string; score: number }> = [];

        for (let d = 1; d <= days; d++) {
          if (!isFacilityOpenDay(fc, d)) continue;
          const shiftKey = pickBestDayPatternForStaff(s, d) || getStaffWorkShiftKey(s, d, stdDayPat, false);
          if (!canAssignShift(s, d, shiftKey, { ignoreDowConstraint: false })) continue;
          validDays.push({ d, key: shiftKey, score: scoreDayBalanced(s, d, shiftKey) });
        }

        if (validDays.length === 0 && isStaffWorkingOnFacilityDay(s, year, month, 1)) {
          for (let d = 1; d <= days; d++) {
            if (!isFacilityOpenDay(fc, d) || !isStaffWorkingOnFacilityDay(s, year, month, d)) continue;
            const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat, true);
            if (!canAssignShift(s, d, shiftKey, { ignoreDowConstraint: true })) continue;
            validDays.push({ d, key: shiftKey, score: scoreDayBalanced(s, d, shiftKey) + 15 });
          }
        }

        if (validDays.length === 0) break;
        validDays.sort((a, b) => a.score - b.score);
        const best = validDays[0];
        newShifts[s.id][best.d] = best.key;
      }
    });

    // =========================================================================
    // PASS 4: Ratio-Balanced Round-Robin Fulfillment for Remaining Staff
    // (Prevents weekday 過多 by always placing staff on the lowest-ratio days first
    //  and avoiding excessive surplus once contracted hours are reasonably met)
    // =========================================================================
    const hasMinFTECheck = Boolean(fcType?.checks.some((c) => c.minFTE !== undefined));
    const overstaffSoftCeiling = fcType?.ratio ? Math.max(neededRatio + 1.6, neededRatio * 1.55) : Infinity;

    let roundSafety = 0;
    const maxTotalAssignments = fcStaff.length * days;

    while (roundSafety < maxTotalAssignments) {
      roundSafety++;

      const underscheduledStaff: Array<{
        s: Staff;
        ratio: number;
        bestDay: number;
        bestKey: string;
        bestScore: number;
      }> = [];

      for (const s of fcStaff) {
        if (lockedSet.has(s.id) || s.nightOnly) continue;
        const curH = getMonthH(s);
        const limitH = monthHLimit(s);
        const typicalH = getTypicalShiftH(s);

        if (curH + typicalH > limitH + 0.5) continue;

        const isMustFill = Boolean(getMustFillRule(s));
        const sRatio = getStaffRoleAllocationRatio(s, ratioRoles);
        const minReasonableRatio = s.type === '非常勤' ? 0.75 : 0.88;
        const hasReasonableHours = !isMustFill && !hasMinFTECheck && curH >= limitH * minReasonableRatio;

        let bestDay = -1;
        let bestKey = '';
        let bestScore = Infinity;

        for (let d = 1; d <= days; d++) {
          if (!isFacilityOpenDay(fc, d)) continue;
          const shiftKey = pickBestDayPatternForStaff(s, d) || getStaffWorkShiftKey(s, d, stdDayPat);
          if (!canAssignShift(s, d, shiftKey)) continue;

          // Avoid piling redundant shifts onto already heavily overstaffed (過多) days
          if (hasReasonableHours && sRatio > 0 && fcType?.ratio) {
            const curCare = calcCareOnDuty(d);
            const curUncov = getUncoveredHours(d).length;
            if (curUncov === 0 && curCare + sRatio > overstaffSoftCeiling + 0.05) {
              continue;
            }
          }

          const sc = scoreDayBalanced(s, d, shiftKey);
          if (sc < bestScore) {
            bestScore = sc;
            bestDay = d;
            bestKey = shiftKey;
          }
        }

        if (bestDay !== -1) {
          underscheduledStaff.push({
            s,
            ratio: curH / Math.max(1, limitH),
            bestDay,
            bestKey,
            bestScore,
          });
        }
      }

      if (underscheduledStaff.length === 0) break;

      underscheduledStaff.sort((a, b) => {
        const aMust = Boolean(getMustFillRule(a.s));
        const bMust = Boolean(getMustFillRule(b.s));
        if (aMust !== bMust) return aMust ? -1 : 1;
        if (Math.abs(a.ratio - b.ratio) > 0.02) {
          return a.ratio - b.ratio;
        }
        return a.bestScore - b.bestScore;
      });

      const chosen = underscheduledStaff[0];
      newShifts[chosen.s.id][chosen.bestDay] = chosen.bestKey;
    }

    // =========================================================================
    // PASS 5: Repair Residual 24h Coverage Gaps (17時/18時等), Care Ratio Deficits,
    // and Smooth Overstaffed (過多) Spikes Across Days
    // =========================================================================
    const isMovableWorkCell = (s: Staff, d: number): boolean => {
      if (d < 1 || d > days) return false;
      if (lockedSet.has(s.id)) return false;
      if (prefLockedStaffDays.has(`${s.id}-${d}`) || ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
      const k = newShifts[s.id][d];
      if (!isWorkShift(k) || nightPats.some((p) => p.key === k)) return false;
      if (k === '前休' || k === '後休' || k === '午前休' || k === '午後休') return false;
      return true;
    };

    const hasOtherSkillLeaderOnDay = (d: number, excludeStaffId: number): boolean =>
      fcStaff.some((st) => st.id !== excludeStaffId && isWorkShift(newShifts[st.id][d]) && (st.mat || 3) >= 3);

    const repairCoverageAndRatio = () => {
      for (const d of allOpenDaysByScarcity) {
        // 5A: Repair Care Staff Ratio deficit by assigning or relocating from an overstaffed day
        let careGuard = 0;
        while (calcCareOnDuty(d) < neededRatio - 0.001 && careGuard < fcStaff.length) {
          careGuard++;
          let fixed = false;

          // Try direct assignment first
          const directCand = fcStaff.filter(
            (s) => getStaffRoleAllocationRatio(s, ratioRoles) > 0 && pickBestDayPatternForStaff(s, d) !== null
          );
          if (directCand.length > 0) {
            directCand.sort((a, b) => scoreDayBalanced(a, d) - scoreDayBalanced(b, d));
            const picked = directCand[0];
            const k = pickBestDayPatternForStaff(picked, d);
            if (k) {
              newShifts[picked.id][d] = k;
              fixed = true;
            }
          }
          if (fixed) continue;

          // Relocate from an overstaffed day (過多日 -> 不足日)
          let bestReloc: { s: Staff; fromDay: number; newKey: string; surplus: number } | null = null;
          for (const s of fcStaff) {
            if (s.nightOnly || getStaffRoleAllocationRatio(s, ratioRoles) <= 0) continue;
            const sRatio = getStaffRoleAllocationRatio(s, ratioRoles);

            for (let fromDay = 1; fromDay <= days; fromDay++) {
              if (fromDay === d || !isMovableWorkCell(s, fromDay)) continue;
              const fromCare = calcCareOnDuty(fromDay);
              if (fromCare - sRatio < neededRatio - 0.001) continue;
              if ((s.mat || 3) >= 3 && !hasOtherSkillLeaderOnDay(fromDay, s.id)) continue;

              const origFromKey = newShifts[s.id][fromDay];
              const origFromCov = getUncoveredHours(fromDay).length;

              newShifts[s.id][fromDay] = '公休';
              const fromCovAfter = getUncoveredHours(fromDay).length;
              const candKey = fromCovAfter <= origFromCov ? pickBestDayPatternForStaff(s, d) : null;
              newShifts[s.id][fromDay] = origFromKey;

              if (candKey && fromCovAfter <= origFromCov) {
                const surplus = fromCare - neededRatio;
                if (!bestReloc || surplus > bestReloc.surplus) {
                  bestReloc = { s, fromDay, newKey: candKey, surplus };
                }
              }
            }
          }

          if (bestReloc) {
            newShifts[bestReloc.s.id][bestReloc.fromDay] = '公休';
            newShifts[bestReloc.s.id][d] = bestReloc.newKey;
            fixed = true;
          }
          if (!fixed) break;
        }

        // 5B: Repair ANY remaining 24h coverage gaps (especially 17時, 18時, 16時)
        if (!useNight) continue;
        let gapGuard = 0;
        while (getUncoveredHours(d).length > 0 && gapGuard < fcStaff.length + 5) {
          gapGuard++;
          const uncov = getUncoveredHours(d);
          const beforeLen = uncov.length;
          let improved = false;

          // Step 1: Convert an existing daytime shift on day `d` to a pattern covering more uncovered hours
          let bestConv: { s: Staff; pat: ShiftPattern; afterLen: number; adminPen: number } | null = null;
          for (const s of fcStaff) {
            if (!isMovableWorkCell(s, d)) continue;
            const curK = newShifts[s.id][d];
            const curH = getStaffDayNetH(s.id, d, curK, fc.id, shiftPatterns, parsedRules);

            for (const p of dayPats) {
              if (p.key === curK) continue;
              if (isPatternExcludedForStaff(s, p.key)) continue;
              if (!isStaffAvailable(s, year, month, d, p)) continue;
              const newH = netHours(p);
              if (
                newH - curH > 0.5 &&
                (getMonthH(s) - curH + newH > monthHLimit(s) + 0.5 || getCalendarWeekH(s, d) - curH + newH > 40.1)
              ) {
                continue;
              }
              newShifts[s.id][d] = p.key;
              const afterLen = getUncoveredHours(d).length;
              newShifts[s.id][d] = curK;

              if (afterLen < beforeLen) {
                const adminPen = isAdminOrPlanRole(s) ? 1 : 0;
                if (
                  !bestConv ||
                  afterLen < bestConv.afterLen ||
                  (afterLen === bestConv.afterLen && adminPen < bestConv.adminPen)
                ) {
                  bestConv = { s, pat: p, afterLen, adminPen };
                }
              }
            }
          }

          if (bestConv) {
            newShifts[bestConv.s.id][d] = bestConv.pat.key;
            improved = true;
            continue;
          }

          // Step 2: Assign an idle staff member on day `d` to cover missing hours
          let bestAssign: { s: Staff; key: string; covCnt: number } | null = null;
          for (const s of fcStaff) {
            if (s.nightOnly) continue;
            const candidateKeys: string[] = [];
            for (const p of dayPats) {
              if (canAssignShift(s, d, p.key, { targetPat: p })) candidateKeys.push(p.key);
            }
            const defK = getStaffWorkShiftKey(s, d, stdDayPat);
            if (defK && !candidateKeys.includes(defK) && canAssignShift(s, d, defK)) {
              candidateKeys.push(defK);
            }
            for (const k of candidateKeys) {
              const covCnt = countUncoveredCoveredByKey(d, k, uncov);
              if (covCnt > 0 && (!bestAssign || covCnt > bestAssign.covCnt)) {
                bestAssign = { s, key: k, covCnt };
              }
            }
          }
          if (bestAssign) {
            newShifts[bestAssign.s.id][d] = bestAssign.key;
            improved = true;
            continue;
          }

          // Step 3: Relocate a staff member from an overstaffed day `fromDay` to cover the gap on `d`
          let bestGapReloc: { s: Staff; fromDay: number; key: string; afterLen: number; surplus: number } | null = null;
          for (const s of fcStaff) {
            if (s.nightOnly) continue;
            const sRatio = getStaffRoleAllocationRatio(s, ratioRoles);

            for (let fromDay = 1; fromDay <= days; fromDay++) {
              if (fromDay === d || !isMovableWorkCell(s, fromDay)) continue;
              const fromCare = calcCareOnDuty(fromDay);
              if (fromCare - sRatio < neededRatio - 0.001) continue;
              if ((s.mat || 3) >= 3 && !hasOtherSkillLeaderOnDay(fromDay, s.id)) continue;

              const origFromKey = newShifts[s.id][fromDay];
              const origFromCov = getUncoveredHours(fromDay).length;

              newShifts[s.id][fromDay] = '公休';
              const fromCovAfter = getUncoveredHours(fromDay).length;
              if (fromCovAfter <= origFromCov) {
                const candidateKeys: string[] = [];
                for (const p of dayPats) {
                  if (canAssignShift(s, d, p.key, { targetPat: p })) candidateKeys.push(p.key);
                }
                const defK = getStaffWorkShiftKey(s, d, stdDayPat);
                if (defK && !candidateKeys.includes(defK) && canAssignShift(s, d, defK)) {
                  candidateKeys.push(defK);
                }
                for (const k of candidateKeys) {
                  if (countUncoveredCoveredByKey(d, k, uncov) <= 0) continue;
                  newShifts[s.id][d] = k;
                  const afterLen = getUncoveredHours(d).length;
                  newShifts[s.id][d] = '公休';
                  if (afterLen < beforeLen) {
                    const surplus = fromCare - neededRatio;
                    if (
                      !bestGapReloc ||
                      afterLen < bestGapReloc.afterLen ||
                      (afterLen === bestGapReloc.afterLen && surplus > bestGapReloc.surplus)
                    ) {
                      bestGapReloc = { s, fromDay, key: k, afterLen, surplus };
                    }
                  }
                }
              }
              newShifts[s.id][fromDay] = origFromKey;
            }
          }

          if (bestGapReloc) {
            newShifts[bestGapReloc.s.id][bestGapReloc.fromDay] = '公休';
            newShifts[bestGapReloc.s.id][d] = bestGapReloc.key;
            improved = true;
            continue;
          }

          // Step 4: Pairwise swap with another day's staff so someone capable of covering the gap works on `d`
          let bestSwapGap: {
            s1: Staff;
            s2: Staff;
            d2: number;
            newKey1: string;
            newKey2: string;
            afterLen: number;
          } | null = null;
          for (const s1 of fcStaff) {
            if (!isMovableWorkCell(s1, d)) continue;
            const origKey1 = newShifts[s1.id][d];
            const origH1 = getStaffDayNetH(s1.id, d, origKey1, fc.id, shiftPatterns, parsedRules);

            for (const s2 of fcStaff) {
              if (s2.id === s1.id || s2.nightOnly || newShifts[s2.id][d] !== '公休') continue;
              if (lockedSet.has(s2.id) || prefLockedStaffDays.has(`${s2.id}-${d}`) || ruleLockedStaffDays.has(`${s2.id}-${d}`)) {
                continue;
              }

              for (let d2 = 1; d2 <= days; d2++) {
                if (d2 === d || !isMovableWorkCell(s2, d2) || newShifts[s1.id][d2] !== '公休') continue;
                const origKey2 = newShifts[s2.id][d2];
                const origH2 = getStaffDayNetH(s2.id, d2, origKey2, fc.id, shiftPatterns, parsedRules);
                const beforeLenD2 = getUncoveredHours(d2).length;
                const beforeCareD = calcCareOnDuty(d);
                const beforeCareD2 = calcCareOnDuty(d2);

                const newKey1 = getStaffWorkShiftKey(s1, d2, getPatternByKey(origKey2, fc.id, shiftPatterns) || stdDayPat);
                if (Math.abs(getStaffDayNetH(s1.id, d2, newKey1, fc.id, shiftPatterns, parsedRules) - origH1) > 0.5) continue;

                for (const p of dayPats) {
                  if (Math.abs(netHours(p) - origH2) > 0.5) continue;
                  newShifts[s1.id][d] = '公休';
                  newShifts[s2.id][d2] = '公休';

                  const ok1 = canAssignShift(s1, d2, newKey1);
                  const ok2 = canAssignShift(s2, d, p.key, { targetPat: p });
                  let swapWorks = false;
                  let afterLen = beforeLen;

                  if (ok1 && ok2) {
                    newShifts[s1.id][d2] = newKey1;
                    newShifts[s2.id][d] = p.key;
                    afterLen = getUncoveredHours(d).length;
                    const afterLenD2 = getUncoveredHours(d2).length;
                    const careOkD = calcCareOnDuty(d) >= Math.min(beforeCareD, neededRatio) - 0.001;
                    const careOkD2 = calcCareOnDuty(d2) >= Math.min(beforeCareD2, neededRatio) - 0.001;
                    swapWorks = afterLen < beforeLen && afterLenD2 <= beforeLenD2 && careOkD && careOkD2;
                  }

                  newShifts[s1.id][d] = origKey1;
                  newShifts[s1.id][d2] = '公休';
                  newShifts[s2.id][d2] = origKey2;
                  newShifts[s2.id][d] = '公休';

                  if (swapWorks && (!bestSwapGap || afterLen < bestSwapGap.afterLen)) {
                    bestSwapGap = { s1, s2, d2, newKey1, newKey2: p.key, afterLen };
                  }
                }
              }
            }
          }

          if (bestSwapGap) {
            newShifts[bestSwapGap.s1.id][d] = '公休';
            newShifts[bestSwapGap.s1.id][bestSwapGap.d2] = bestSwapGap.newKey1;
            newShifts[bestSwapGap.s2.id][bestSwapGap.d2] = '公休';
            newShifts[bestSwapGap.s2.id][d] = bestSwapGap.newKey2;
            improved = true;
            continue;
          }

          // Step 5: If `d > 1` still has an uncovered hour because the night worker from `d-1` (`明け` on `d`)
          // is one of the few staff eligible to work daytime on `d`, hand off `d-1`'s night shift to another
          // night-capable staff member (e.g. a Mon-Sat night worker taking Sat night -> 明 on Sun morning)
          // so the freed staff member can cover `d`'s missing hours (e.g. 18時)!
          if (d > 1 && nightPats.length > 0) {
            const np = nightPats[0];
            const akeHolder = fcStaff.find(
              (st) =>
                !lockedSet.has(st.id) &&
                !prefLockedStaffDays.has(`${st.id}-${d - 1}`) &&
                !ruleLockedStaffDays.has(`${st.id}-${d - 1}`) &&
                !prefLockedStaffDays.has(`${st.id}-${d}`) &&
                !ruleLockedStaffDays.has(`${st.id}-${d}`) &&
                nightPats.some((p) => p.key === newShifts[st.id][d - 1]) &&
                newShifts[st.id][d] === '明け'
            );

            if (akeHolder) {
              const origAkeDPrev = newShifts[akeHolder.id][d - 1];
              const origAkeDNext = d + 1 <= days ? newShifts[akeHolder.id][d + 1] : undefined;
              const akeDNextWasPostRest = d + 1 <= days && postNightRestDays.has(`${akeHolder.id}-${d + 1}`);

              const donorNightCands = fcStaff.filter((dn) => {
                if (dn.id === akeHolder.id || !dn.night || lockedSet.has(dn.id)) return false;
                if (!isStaffWorkingOnFacilityDay(dn, year, month, d)) return false;
                if (forcedLeaveStaffDays.has(`${dn.id}-${d}`)) return false;
                if (prefLockedStaffDays.has(`${dn.id}-${d}`) || ruleLockedStaffDays.has(`${dn.id}-${d}`)) return false;
                if (newShifts[dn.id][d] !== '公休') return false;
                if (d + 1 <= days && isWorkShift(newShifts[dn.id][d + 1])) return false;
                const nl = getStaffNightLimits(dn);
                if (nl.maxPerMonth !== undefined) {
                  const cnt = Object.values(newShifts[dn.id]).filter((k) => nightPats.some((p) => p.key === k)).length;
                  if (cnt >= nl.maxPerMonth) return false;
                }
                if (nl.maxPerWeek !== undefined) {
                  const dowPrev = dayOfWeekIdx(year, month, d - 1);
                  const wStart = Math.max(1, d - 1 - dowPrev);
                  const wEnd = Math.min(days, d - 1 + (6 - dowPrev));
                  let wCnt = 0;
                  for (let wd = wStart; wd <= wEnd; wd++) {
                    if (nightPats.some((p) => p.key === newShifts[dn.id][wd])) wCnt++;
                  }
                  if (wCnt >= nl.maxPerWeek) return false;
                  if (nl.maxPerWeek === 1) {
                    for (let i = 1; i <= days; i++) {
                      if (i !== d - 1 && nightPats.some((p) => p.key === newShifts[dn.id][i]) && Math.abs(d - 1 - i) < 6) {
                        return false;
                      }
                    }
                  }
                }
                return true;
              });

              let handoffApplied = false;
              for (const dn of donorNightCands) {
                const dnOrigPrev = newShifts[dn.id][d - 1];
                if (
                  prefLockedStaffDays.has(`${dn.id}-${d - 1}`) ||
                  ruleLockedStaffDays.has(`${dn.id}-${d - 1}`) ||
                  forcedLeaveStaffDays.has(`${dn.id}-${d - 1}`)
                ) {
                  continue;
                }
                if (dnOrigPrev !== '公休' && !isMovableWorkCell(dn, d - 1)) continue;

                // Clear donor's d-1 temporarily and check if donor can take night on d-1
                const beforeCarePrev = calcCareOnDuty(d - 1);
                const beforeCovPrev = getUncoveredHours(d - 1).length;
                newShifts[dn.id][d - 1] = '公休';
                const dnCanNight = canAssignShift(dn, d - 1, np.key, { targetPat: np });

                if (dnCanNight) {
                  newShifts[dn.id][d - 1] = np.key;
                  newShifts[dn.id][d] = '明け';
                  newShifts[akeHolder.id][d - 1] = '公休';
                  newShifts[akeHolder.id][d] = '公休';
                  if (akeDNextWasPostRest) postNightRestDays.delete(`${akeHolder.id}-${d + 1}`);

                  const freedKey = pickBestDayPatternForStaff(akeHolder, d);
                  const prevKey =
                    dnOrigPrev !== '公休'
                      ? pickBestDayPatternForStaff(akeHolder, d - 1) || getStaffWorkShiftKey(akeHolder, d - 1, stdDayPat)
                      : null;

                  if (freedKey && (!prevKey || canAssignShift(akeHolder, d - 1, prevKey))) {
                    newShifts[akeHolder.id][d] = freedKey;
                    if (prevKey) newShifts[akeHolder.id][d - 1] = prevKey;

                    const afterLenD = getUncoveredHours(d).length;
                    const afterCovPrev = getUncoveredHours(d - 1).length;
                    const afterCarePrev = calcCareOnDuty(d - 1);

                    if (
                      afterLenD < beforeLen &&
                      afterCovPrev <= beforeCovPrev &&
                      afterCarePrev >= Math.min(beforeCarePrev, neededRatio) - 0.001
                    ) {
                      if (d + 1 <= days && !prefLockedStaffDays.has(`${dn.id}-${d + 1}`) && !ruleLockedStaffDays.has(`${dn.id}-${d + 1}`) && newShifts[dn.id][d + 1] === '公休') {
                        postNightRestDays.add(`${dn.id}-${d + 1}`);
                      }
                      handoffApplied = true;
                      break;
                    }
                  }
                }

                // Restore if not applied
                newShifts[dn.id][d - 1] = dnOrigPrev;
                newShifts[dn.id][d] = '公休';
                newShifts[akeHolder.id][d - 1] = origAkeDPrev;
                newShifts[akeHolder.id][d] = '明け';
                if (akeDNextWasPostRest && origAkeDNext === '公休') {
                  postNightRestDays.add(`${akeHolder.id}-${d + 1}`);
                }
              }

              if (handoffApplied) {
                improved = true;
                continue;
              }
            }
          }

          if (!improved) break;
        }
      }
    };

    repairCoverageAndRatio();

    const countIsolatedKyu = (staffId: number): number => {
      let cnt = 0;
      for (let d = 1; d <= days; d++) {
        if (newShifts[staffId][d] !== '公休') continue;
        const prevOff = d > 1 && isRestForPair(newShifts[staffId][d - 1]);
        const nextOff = d < days && isRestForPair(newShifts[staffId][d + 1]);
        if (!prevOff && !nextOff) cnt++;
      }
      return cnt;
    };

    // Smooth extreme care-ratio spikes (e.g. 5.6/3 vs 3.6/3 -> 4.6/3 and 4.6/3)
    const smoothCareRatioSpikes = (preserveIsolated: boolean = false) => {
      for (let iter = 0; iter < days * 3; iter++) {
        let bestMove: { s: Staff; fromD: number; toD: number; newKey: string; gain: number } | null = null;

        for (const s of fcStaff) {
          if (lockedSet.has(s.id) || s.nightOnly) continue;
          const sRatio = getStaffRoleAllocationRatio(s, ratioRoles);
          if (sRatio <= 0) continue;
          const beforeIso = preserveIsolated ? countIsolatedKyu(s.id) : 0;

          for (let fromD = 1; fromD <= days; fromD++) {
            if (!isMovableWorkCell(s, fromD)) continue;
            const fromCare = calcCareOnDuty(fromD);
            if (fromCare - sRatio < neededRatio - 0.001) continue;
            if ((s.mat || 3) >= 3 && !hasOtherSkillLeaderOnDay(fromD, s.id)) continue;

            const origKey = newShifts[s.id][fromD];
            const origH = getStaffDayNetH(s.id, fromD, origKey, fc.id, shiftPatterns, parsedRules);
            const origFromCov = getUncoveredHours(fromD).length;
            const hadEarly = Boolean(earlyPat && origKey === earlyPat.key);
            const hadLate = Boolean(latePat && origKey === latePat.key);
            if (hadEarly && !fcStaff.some((st) => st.id !== s.id && newShifts[st.id][fromD] === earlyPat!.key)) {
              continue;
            }
            if (hadLate && !fcStaff.some((st) => st.id !== s.id && newShifts[st.id][fromD] === latePat!.key)) {
              continue;
            }

            for (let toD = 1; toD <= days; toD++) {
              if (toD === fromD || newShifts[s.id][toD] !== '公休') continue;
              if (!isFacilityOpenDay(fc, toD)) continue;
              const toCare = calcCareOnDuty(toD);
              // Moving sRatio reduces (fromCare^2 + toCare^2) iff fromCare - toCare > sRatio
              if (fromCare - toCare <= sRatio + 0.05) continue;

              const origPat = getPatternByKey(origKey, fc.id, shiftPatterns);
              const candidateKey = origKey.startsWith('time:')
                ? origKey
                : getStaffWorkShiftKey(s, toD, origPat || stdDayPat);
              const newH = getStaffDayNetH(s.id, toD, candidateKey, fc.id, shiftPatterns, parsedRules);
              if (Math.abs(newH - origH) > 0.25) continue;

              newShifts[s.id][fromD] = '公休';
              const fromCovOk = getUncoveredHours(fromD).length <= origFromCov;
              let canPlace = fromCovOk && canAssignShift(s, toD, candidateKey);
              if (canPlace && preserveIsolated) {
                newShifts[s.id][toD] = candidateKey;
                if (countIsolatedKyu(s.id) > beforeIso) canPlace = false;
                newShifts[s.id][toD] = '公休';
              }
              newShifts[s.id][fromD] = origKey;

              if (!canPlace) continue;

              // Variance reduction = 2 * sRatio * (fromCare - toCare - sRatio)
              const gain = 2 * sRatio * (fromCare - toCare - sRatio);
              if (!bestMove || gain > bestMove.gain) {
                bestMove = { s, fromD, toD, newKey: candidateKey, gain };
              }
            }
          }
        }

        if (!bestMove) break;
        newShifts[bestMove.s.id][bestMove.fromD] = '公休';
        newShifts[bestMove.s.id][bestMove.toD] = bestMove.newKey;
      }
    };

    smoothCareRatioSpikes(false);

    // =========================================================================
    // PASS 6: Consecutive 公休 (2-Day Off Block) Optimization
    // Merges isolated single 公休 days into 2+ consecutive days off while
    // strictly preserving 24h coverage (incl. 17-18時) and daily care ratios.
    // =========================================================================

    const isDayKyuMovableToWork = (s: Staff, d: number): boolean => {
      if (d < 1 || d > days) return false;
      if (lockedSet.has(s.id)) return false;
      if (newShifts[s.id][d] !== '公休') return false;
      if (prefLockedStaffDays.has(`${s.id}-${d}`)) return false;
      if (ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
      if (forcedLeaveStaffDays.has(`${s.id}-${d}`)) return false;
      if (postNightRestDays.has(`${s.id}-${d}`)) return false;
      return isFacilityOpenDay(fc, d);
    };

    const isWorkDayMovableToKyu = (s: Staff, d: number): boolean => isMovableWorkCell(s, d);

    const hasOtherPatternOnDay = (d: number, excludeStaffId: number, patKey: string): boolean =>
      fcStaff.some((st) => st.id !== excludeStaffId && newShifts[st.id][d] === patKey);

    for (let passIter = 0; passIter < 4; passIter++) {
      let improvedInPass = false;

      for (const s of fcStaff) {
        if (lockedSet.has(s.id) || s.nightOnly) continue;

        let safetyInner = 0;
        while (safetyInner < days) {
          safetyInner++;
          const beforeIso = countIsolatedKyu(s.id);
          if (beforeIso === 0) break;

          const kyuCandidates: number[] = [];
          const adjWorkCandidates: number[] = [];

          for (let d = 1; d <= days; d++) {
            if (isDayKyuMovableToWork(s, d)) kyuCandidates.push(d);
            if (isWorkDayMovableToKyu(s, d)) {
              const prevIsRest = d > 1 && isRestForPair(newShifts[s.id][d - 1]);
              const nextIsRest = d < days && isRestForPair(newShifts[s.id][d + 1]);
              if (prevIsRest || nextIsRest) adjWorkCandidates.push(d);
            }
          }

          if (kyuCandidates.length === 0 || adjWorkCandidates.length === 0) break;

          let bestApplied = false;

          // 6A: Single-staff move (only move from a day with equal/higher staff & care ratio, preserving 24h coverage)
          let bestMove: {
            dAdj: number;
            dOff: number;
            newKey: string;
            handoffStaffId?: number;
            handoffKey?: string;
            score: number;
          } | null = null;

          const findPatternHandoff = (d: number, excludeStaffId: number, targetPat: ShiftPattern): Staff | undefined => {
            return fcStaff.find((st) => {
              if (st.id === excludeStaffId || lockedSet.has(st.id)) return false;
              if (prefLockedStaffDays.has(`${st.id}-${d}`) || ruleLockedStaffDays.has(`${st.id}-${d}`)) return false;
              const curK = newShifts[st.id][d];
              const curPat = getPatternByKey(curK, fc.id, shiftPatterns);
              if (!curPat || isNight(curPat)) return false;
              if (earlyPat && curPat.key === earlyPat.key && !hasOtherPatternOnDay(d, st.id, earlyPat.key)) return false;
              if (latePat && curPat.key === latePat.key && !hasOtherPatternOnDay(d, st.id, latePat.key)) return false;
              if (Math.abs(netHours(targetPat) - netHours(curPat)) > 0.25) return false;
              return !isPatternExcludedForStaff(st, targetPat.key) && isStaffAvailable(st, year, month, d, targetPat);
            });
          };

          for (const dAdj of adjWorkCandidates) {
            const origKey = newShifts[s.id][dAdj];
            const origH = getStaffDayNetH(s.id, dAdj, origKey, fc.id, shiftPatterns, parsedRules);
            const sRatio = getStaffRoleAllocationRatio(s, ratioRoles);

            if (calcCareOnDuty(dAdj) - sRatio < neededRatio - 0.001) continue;
            if ((s.mat || 3) >= 3 && !hasOtherSkillLeaderOnDay(dAdj, s.id)) continue;

            let handoffStaff: Staff | undefined;
            let handoffKey: string | undefined;

            if (earlyPat && origKey === earlyPat.key && !hasOtherPatternOnDay(dAdj, s.id, earlyPat.key)) {
              handoffStaff = findPatternHandoff(dAdj, s.id, earlyPat);
              if (!handoffStaff) continue;
              handoffKey = earlyPat.key;
            }
            if (latePat && origKey === latePat.key && !hasOtherPatternOnDay(dAdj, s.id, latePat.key)) {
              handoffStaff = findPatternHandoff(dAdj, s.id, latePat);
              if (!handoffStaff) continue;
              handoffKey = latePat.key;
            }

            const adjCount = countWorkingStaffOnDay(dAdj);
            const adjCare = calcCareOnDuty(dAdj);
            const beforeUncovAdj = getUncoveredHours(dAdj).length;

            for (const dOff of kyuCandidates) {
              if (dOff === dAdj) continue;
              if (adjCount - 1 < countWorkingStaffOnDay(dOff)) continue;
              if (adjCare - sRatio < calcCareOnDuty(dOff)) continue;

              const origPat = getPatternByKey(origKey, fc.id, shiftPatterns);
              const candidateKey = origKey.startsWith('time:')
                ? origKey
                : getStaffWorkShiftKey(s, dOff, origPat || stdDayPat);
              const newH = getStaffDayNetH(s.id, dOff, candidateKey, fc.id, shiftPatterns, parsedRules);
              if (Math.abs(newH - origH) > 0.25) continue;

              const beforeUncovOff = getUncoveredHours(dOff).length;
              const origHandoffKey = handoffStaff ? newShifts[handoffStaff.id][dAdj] : undefined;

              newShifts[s.id][dAdj] = '公休';
              if (handoffStaff && handoffKey) newShifts[handoffStaff.id][dAdj] = handoffKey;

              const canPlace = canAssignShift(s, dOff, candidateKey);
              let afterIso = beforeIso;
              let covPreserved = false;
              if (canPlace) {
                newShifts[s.id][dOff] = candidateKey;
                afterIso = countIsolatedKyu(s.id);
                covPreserved =
                  getUncoveredHours(dAdj).length <= beforeUncovAdj &&
                  getUncoveredHours(dOff).length <= beforeUncovOff;
                newShifts[s.id][dOff] = '公休';
              }
              newShifts[s.id][dAdj] = origKey;
              if (handoffStaff && origHandoffKey !== undefined) {
                newShifts[handoffStaff.id][dAdj] = origHandoffKey;
              }

              if (!canPlace || !covPreserved || afterIso >= beforeIso) continue;

              const sameWeekBonus =
                Math.floor((dAdj - 1 - dayOfWeekIdx(year, month, dAdj)) / 7) ===
                Math.floor((dOff - 1 - dayOfWeekIdx(year, month, dOff)) / 7)
                  ? -20
                  : 0;
              const moveScore =
                (beforeIso - afterIso) * -100 +
                sameWeekBonus +
                (countWorkingStaffOnDay(dOff) - adjCount) * 10 +
                (calcCareOnDuty(dOff) - adjCare) * 10 +
                Math.abs(dOff - dAdj);

              if (!bestMove || moveScore < bestMove.score) {
                bestMove = {
                  dAdj,
                  dOff,
                  newKey: candidateKey,
                  handoffStaffId: handoffStaff?.id,
                  handoffKey,
                  score: moveScore,
                };
              }
            }
          }

          if (bestMove) {
            newShifts[s.id][bestMove.dAdj] = '公休';
            newShifts[s.id][bestMove.dOff] = bestMove.newKey;
            if (bestMove.handoffStaffId !== undefined && bestMove.handoffKey) {
              newShifts[bestMove.handoffStaffId][bestMove.dAdj] = bestMove.handoffKey;
            }
            improvedInPass = true;
            bestApplied = true;
          }

          if (bestApplied) continue;

          // 6B: Pairwise swap with another staff member (preserves daily headcount, care ratio, and 24h coverage)
          let bestSwap: {
            other: Staff;
            dAdj: number;
            dOff: number;
            newKey1: string;
            newKey2: string;
            score: number;
          } | null = null;

          for (const dAdj of adjWorkCandidates) {
            const origKey1 = newShifts[s.id][dAdj];
            const origH1 = getStaffDayNetH(s.id, dAdj, origKey1, fc.id, shiftPatterns, parsedRules);
            const beforeCareAdj = calcCareOnDuty(dAdj);
            const beforeHasEarlyAdj = Boolean(earlyPat && fcStaff.some((st) => newShifts[st.id][dAdj] === earlyPat.key));
            const beforeHasLateAdj = Boolean(latePat && fcStaff.some((st) => newShifts[st.id][dAdj] === latePat.key));
            const beforeLeaderAdj = getDaySkillStats(dAdj).maxMat >= 3;
            const beforeUncovAdj = getUncoveredHours(dAdj).length;

            for (const dOff of kyuCandidates) {
              if (dOff === dAdj) continue;
              const beforeCareOff = calcCareOnDuty(dOff);
              const beforeHasEarlyOff = Boolean(earlyPat && fcStaff.some((st) => newShifts[st.id][dOff] === earlyPat.key));
              const beforeHasLateOff = Boolean(latePat && fcStaff.some((st) => newShifts[st.id][dOff] === latePat.key));
              const beforeLeaderOff = getDaySkillStats(dOff).maxMat >= 3;
              const beforeUncovOff = getUncoveredHours(dOff).length;

              for (const other of fcStaff) {
                if (other.id === s.id || lockedSet.has(other.id) || other.nightOnly) continue;
                if (!isWorkDayMovableToKyu(other, dOff)) continue;
                if (!isDayKyuMovableToWork(other, dAdj)) continue;

                const origKey2 = newShifts[other.id][dOff];
                const origH2 = getStaffDayNetH(other.id, dOff, origKey2, fc.id, shiftPatterns, parsedRules);
                const beforeIso2 = countIsolatedKyu(other.id);

                const origPat2 = getPatternByKey(origKey2, fc.id, shiftPatterns);
                const origPat1 = getPatternByKey(origKey1, fc.id, shiftPatterns);
                const newKey1 = origKey2.startsWith('time:')
                  ? getStaffWorkShiftKey(s, dOff, stdDayPat)
                  : getStaffWorkShiftKey(s, dOff, origPat2 || stdDayPat);
                const newKey2 = origKey1.startsWith('time:')
                  ? getStaffWorkShiftKey(other, dAdj, stdDayPat)
                  : getStaffWorkShiftKey(other, dAdj, origPat1 || stdDayPat);

                const newH1 = getStaffDayNetH(s.id, dOff, newKey1, fc.id, shiftPatterns, parsedRules);
                const newH2 = getStaffDayNetH(other.id, dAdj, newKey2, fc.id, shiftPatterns, parsedRules);
                if (Math.abs(newH1 - origH1) > 0.25 || Math.abs(newH2 - origH2) > 0.25) continue;

                newShifts[s.id][dAdj] = '公休';
                newShifts[other.id][dOff] = '公休';

                const valid1 = canAssignShift(s, dOff, newKey1);
                const valid2 = canAssignShift(other, dAdj, newKey2);

                let swapOk = false;
                let afterIso1 = beforeIso;
                let afterIso2 = beforeIso2;

                if (valid1 && valid2) {
                  newShifts[s.id][dOff] = newKey1;
                  newShifts[other.id][dAdj] = newKey2;

                  afterIso1 = countIsolatedKyu(s.id);
                  afterIso2 = countIsolatedKyu(other.id);

                  const careOkAdj = calcCareOnDuty(dAdj) >= Math.min(beforeCareAdj, neededRatio) - 0.001;
                  const careOkOff = calcCareOnDuty(dOff) >= Math.min(beforeCareOff, neededRatio) - 0.001;
                  const earlyOkAdj = !beforeHasEarlyAdj || Boolean(earlyPat && fcStaff.some((st) => newShifts[st.id][dAdj] === earlyPat.key));
                  const earlyOkOff = !beforeHasEarlyOff || Boolean(earlyPat && fcStaff.some((st) => newShifts[st.id][dOff] === earlyPat.key));
                  const lateOkAdj = !beforeHasLateAdj || Boolean(latePat && fcStaff.some((st) => newShifts[st.id][dAdj] === latePat.key));
                  const lateOkOff = !beforeHasLateOff || Boolean(latePat && fcStaff.some((st) => newShifts[st.id][dOff] === latePat.key));
                  const leaderOkAdj = !beforeLeaderAdj || getDaySkillStats(dAdj).maxMat >= 3;
                  const leaderOkOff = !beforeLeaderOff || getDaySkillStats(dOff).maxMat >= 3;
                  const covOkAdj = getUncoveredHours(dAdj).length <= beforeUncovAdj;
                  const covOkOff = getUncoveredHours(dOff).length <= beforeUncovOff;

                  swapOk =
                    afterIso1 < beforeIso &&
                    afterIso2 <= beforeIso2 &&
                    careOkAdj &&
                    careOkOff &&
                    earlyOkAdj &&
                    earlyOkOff &&
                    lateOkAdj &&
                    lateOkOff &&
                    leaderOkAdj &&
                    leaderOkOff &&
                    covOkAdj &&
                    covOkOff;
                }

                newShifts[s.id][dAdj] = origKey1;
                newShifts[s.id][dOff] = '公休';
                newShifts[other.id][dOff] = origKey2;
                newShifts[other.id][dAdj] = '公休';

                if (!swapOk) continue;

                const swapScore =
                  (beforeIso - afterIso1 + (beforeIso2 - afterIso2)) * -100 + Math.abs(dOff - dAdj);
                if (!bestSwap || swapScore < bestSwap.score) {
                  bestSwap = { other, dAdj, dOff, newKey1, newKey2, score: swapScore };
                }
              }
            }
          }

          if (bestSwap) {
            newShifts[s.id][bestSwap.dAdj] = '公休';
            newShifts[s.id][bestSwap.dOff] = bestSwap.newKey1;
            newShifts[bestSwap.other.id][bestSwap.dOff] = '公休';
            newShifts[bestSwap.other.id][bestSwap.dAdj] = bestSwap.newKey2;
            improvedInPass = true;
          } else {
            break;
          }
        }
      }

      if (!improvedInPass) break;
    }

    // Final safety pass & variance smoothing (preserving 2-day off blocks)
    repairCoverageAndRatio();
    smoothCareRatioSpikes(true);
  });

  return newShifts;
}
