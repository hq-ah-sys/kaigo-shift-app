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

    // =========================================================================
    // PASS 1: Night Shift Assignment for 24h Residential Facilities
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

      for (let d = 1; d <= days; d++) {
        const alreadyHasNight = fcStaff.some((s) => {
          const k = newShifts[s.id][d];
          return nightPats.some((p) => p.key === k);
        });
        if (alreadyHasNight) continue;

        const findNightCandidates = (
          allowPostAkeFlag: boolean,
          requireMat3: boolean,
          excludeMustFillStaff: boolean
        ) =>
          fcStaff.filter((s) => {
            if (!s.night) return false;
            if (excludeMustFillStaff && getMustFillRule(s) && !s.nightOnly) return false;
            if (requireMat3 && (s.mat || 3) < 3 && !s.nightOnly) return false;

            // Enforce AI night_limit rules (e.g. 鈴木 健太 夜勤は週1回のみ)
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

        // Priority 1: Exclude must_fill_hours staff (so they keep calendar days for full 40h daytime), mat >= 3
        let candidates = findNightCandidates(false, true, true);
        // Priority 2: Exclude must_fill_hours staff, any mat
        if (candidates.length === 0) {
          candidates = findNightCandidates(false, false, true);
        }
        // Priority 3: Include must_fill_hours staff if needed, mat >= 3
        if (candidates.length === 0) {
          candidates = findNightCandidates(false, true, false);
        }
        // Priority 4: Any available night staff
        if (candidates.length === 0) {
          candidates = findNightCandidates(false, false, false);
        }
        // Priority 5: Shortage fallback (allow post-Ake)
        if (candidates.length === 0) {
          candidates = findNightCandidates(true, false, false);
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => {
            if (a.nightOnly && !b.nightOnly) return -1;
            if (!a.nightOnly && b.nightOnly) return 1;
            const distA = minDistanceToOtherNight(a, d);
            const distB = minDistanceToOtherNight(b, d);
            const closePenaltyA = distA < 6 ? (6 - distA) * 5 : 0;
            const closePenaltyB = distB < 6 ? (6 - distB) * 5 : 0;
            const strandPenaltyA =
              d > 2 && isRestForPair(newShifts[a.id][d - 1]) && !isRestForPair(newShifts[a.id][d - 2]) ? 6 : 0;
            const strandPenaltyB =
              d > 2 && isRestForPair(newShifts[b.id][d - 1]) && !isRestForPair(newShifts[b.id][d - 2]) ? 6 : 0;
            const scoreA =
              countNights(a) * 2 + closePenaltyA + strandPenaltyA + (getMonthH(a) / Math.max(1, monthHLimit(a))) * 3;
            const scoreB =
              countNights(b) * 2 + closePenaltyB + strandPenaltyB + (getMonthH(b) / Math.max(1, monthHLimit(b))) * 3;
            return scoreA - scoreB;
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
    }

    if (dayPats.length === 0) return;

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

    // =========================================================================
    // PASS 2: Administrative, Plan Creator & Specialized Roles (Balanced Across Weeks)
    // =========================================================================
    const hasRole = (s: Staff, roleKeywords: string[]) => {
      const rList = Array.isArray(s.roles) ? s.roles : [s.role];
      const qList = Array.isArray(s.quals) ? s.quals : [s.qual];
      return (
        rList.some((r) => r && roleKeywords.some((kw) => r.includes(kw))) ||
        qList.some((q) => q && roleKeywords.some((kw) => q.includes(kw)))
      );
    };

    const specialRoleStaff = fcStaff.filter(
      (s) =>
        !s.nightOnly &&
        hasRole(s, ['管理者', '計画作成', '介護支援専門員', '看護', 'ナース', '准看', '生活相談員', '機能訓練', 'サービス提供責任者'])
    );

    specialRoleStaff.forEach((s) => {
      if (lockedSet.has(s.id)) return;
      const isAdminOrPlan = hasRole(s, ['管理者', '計画作成', '介護支援専門員']);
      const typicalH = getTypicalShiftH(s);

      let safety = 0;
      while (getMonthH(s) + typicalH <= monthHLimit(s) + 0.5 && safety < days + 5) {
        safety++;
        const validDays: Array<{ d: number; key: string; score: number }> = [];

        for (let d = 1; d <= days; d++) {
          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
          if (!canAssignShift(s, d, shiftKey)) continue;

          const dow = dayOfWeekIdx(year, month, d);
          const isWeekday = dow >= 1 && dow <= 5;
          let sc = scoreDayForStaff(s, d, shiftKey);

          if (isAdminOrPlan && isWeekday) {
            sc -= 8;
          }
          validDays.push({ d, key: shiftKey, score: sc });
        }

        if (validDays.length === 0) break;
        validDays.sort((a, b) => a.score - b.score);
        const best = validDays[0];
        newShifts[s.id][best.d] = best.key;
      }
    });

    // =========================================================================
    // PASS 2.5: Priority Contracted Hour Fulfillment (`must_fill_hours` AI Rule)
    // (例: 「佐藤 由美は必ず週所定労働時間数は入れて」)
    // =========================================================================
    const mustFillStaff = fcStaff.filter((s) => !lockedSet.has(s.id) && !s.nightOnly && Boolean(getMustFillRule(s)));
    mustFillStaff.forEach((s) => {
      const typicalH = getTypicalShiftH(s);
      let safety = 0;
      while (getMonthH(s) + typicalH <= monthHLimit(s) + 0.5 && safety < days + 5) {
        safety++;
        const validDays: Array<{ d: number; key: string; score: number }> = [];

        // First try strictly within s.availDays
        for (let d = 1; d <= days; d++) {
          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat, false);
          if (!canAssignShift(s, d, shiftKey, { ignoreDowConstraint: false })) continue;
          validDays.push({ d, key: shiftKey, score: scoreDayForStaff(s, d, shiftKey) });
        }

        // Fallback: if blocked by availDays (e.g. a weekday had 希望休 or forbidden pair), allow other open days
        if (validDays.length === 0 && isStaffWorkingOnFacilityDay(s, year, month, 1)) {
          for (let d = 1; d <= days; d++) {
            if (!isStaffWorkingOnFacilityDay(s, year, month, d)) continue;
            const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat, true);
            if (!canAssignShift(s, d, shiftKey, { ignoreDowConstraint: true })) continue;
            validDays.push({ d, key: shiftKey, score: scoreDayForStaff(s, d, shiftKey) + 15 });
          }
        }

        if (validDays.length === 0) break;
        validDays.sort((a, b) => a.score - b.score);
        const best = validDays[0];
        newShifts[s.id][best.d] = best.key;
      }
    });

    // =========================================================================
    // PASS 3: Daily Early ('早番') and Late ('遅番') Coverage
    // =========================================================================
    const allOpenDaysByScarcity = Array.from({ length: days }, (_, i) => i + 1)
      .filter((d) => isFacilityOpenDay(fc, d))
      .sort((a, b) => {
        const dowA = dayOfWeekIdx(year, month, a);
        const dowB = dayOfWeekIdx(year, month, b);
        const score = (w: number) => (w === 0 ? 0 : w === 6 ? 1 : 2);
        return score(dowA) - score(dowB);
      });

    const countPatternForStaff = (s: Staff, patKey: string) =>
      Object.values(newShifts[s.id]).filter((k) => k === patKey).length;

    allOpenDaysByScarcity.forEach((d) => {
      // Early shift coverage
      if (earlyPat && earlyPat.key !== stdDayPat?.key) {
        const hasEarly = fcStaff.some((s) => newShifts[s.id][d] === earlyPat.key);
        if (!hasEarly) {
          const cand = fcStaff.filter((s) =>
            canAssignShift(s, d, earlyPat.key, { targetPat: earlyPat })
          );
          if (cand.length > 0) {
            cand.sort((a, b) => {
              const scA = scoreDayForStaff(a, d, earlyPat.key) + countPatternForStaff(a, earlyPat.key) * 4;
              const scB = scoreDayForStaff(b, d, earlyPat.key) + countPatternForStaff(b, earlyPat.key) * 4;
              return scA - scB;
            });
            newShifts[cand[0].id][d] = earlyPat.key;
          } else {
            // Upgrade an already-assigned standard day shift staff member (not locked by rules/prefs) to Early shift if net hours match
            const convertible = fcStaff.filter(
              (s) =>
                !lockedSet.has(s.id) &&
                !prefLockedStaffDays.has(`${s.id}-${d}`) &&
                !ruleLockedStaffDays.has(`${s.id}-${d}`) &&
                newShifts[s.id][d] === stdDayPat?.key &&
                !isPatternExcludedForStaff(s, earlyPat.key) &&
                isStaffAvailable(s, year, month, d, earlyPat) &&
                Math.abs(netHours(earlyPat) - netHours(stdDayPat)) <= 0.25
            );
            if (convertible.length > 0) {
              convertible.sort((a, b) => countPatternForStaff(a, earlyPat.key) - countPatternForStaff(b, earlyPat.key));
              newShifts[convertible[0].id][d] = earlyPat.key;
            }
          }
        }
      }

      // Late shift coverage
      if (latePat && latePat.key !== earlyPat?.key && latePat.key !== stdDayPat?.key) {
        const hasLate = fcStaff.some((s) => newShifts[s.id][d] === latePat.key);
        if (!hasLate) {
          const cand = fcStaff.filter((s) =>
            canAssignShift(s, d, latePat.key, { targetPat: latePat })
          );
          if (cand.length > 0) {
            cand.sort((a, b) => {
              const scA = scoreDayForStaff(a, d, latePat.key) + countPatternForStaff(a, latePat.key) * 4;
              const scB = scoreDayForStaff(b, d, latePat.key) + countPatternForStaff(b, latePat.key) * 4;
              return scA - scB;
            });
            newShifts[cand[0].id][d] = latePat.key;
          } else {
            const convertible = fcStaff.filter(
              (s) =>
                !lockedSet.has(s.id) &&
                !prefLockedStaffDays.has(`${s.id}-${d}`) &&
                !ruleLockedStaffDays.has(`${s.id}-${d}`) &&
                newShifts[s.id][d] === stdDayPat?.key &&
                !isPatternExcludedForStaff(s, latePat.key) &&
                isStaffAvailable(s, year, month, d, latePat) &&
                Math.abs(netHours(latePat) - netHours(stdDayPat)) <= 0.25
            );
            if (convertible.length > 0) {
              convertible.sort((a, b) => countPatternForStaff(a, latePat.key) - countPatternForStaff(b, latePat.key));
              newShifts[convertible[0].id][d] = latePat.key;
            }
          }
        }
      }
    });

    // =========================================================================
    // PASS 4: Daily Skill Leader Coverage & Minimum Staffing Ratio Fulfillment
    // =========================================================================
    allOpenDaysByScarcity.forEach((d) => {
      const skillStats = getDaySkillStats(d);
      if (skillStats.maxMat < 3) {
        const leaderCand = fcStaff.filter((s) => {
          if ((s.mat || 3) < 3) return false;
          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
          return canAssignShift(s, d, shiftKey);
        });
        if (leaderCand.length > 0) {
          leaderCand.sort((a, b) => {
            if ((b.mat || 3) !== (a.mat || 3)) return (b.mat || 3) - (a.mat || 3);
            return scoreDayForStaff(a, d) - scoreDayForStaff(b, d);
          });
          const picked = leaderCand[0];
          newShifts[picked.id][d] = getStaffWorkShiftKey(picked, d, stdDayPat);
        }
      }

      let currentCareOnDuty = calcCareOnDuty(d);
      let safety = 0;
      while (currentCareOnDuty < neededRatio - 0.001 && safety < fcStaff.length + 2) {
        safety++;
        const cand = fcStaff.filter((s) => {
          if (getStaffRoleAllocationRatio(s, ratioRoles) <= 0) return false;
          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
          return canAssignShift(s, d, shiftKey);
        });

        if (cand.length === 0) break;

        cand.sort((a, b) => scoreDayForStaff(a, d) - scoreDayForStaff(b, d));
        const picked = cand[0];
        const shiftKey = getStaffWorkShiftKey(picked, d, stdDayPat);
        newShifts[picked.id][d] = shiftKey;
        currentCareOnDuty += getStaffRoleAllocationRatio(picked, ratioRoles);
      }
    });

    // =========================================================================
    // PASS 5: Round-Robin Balanced Fulfillment for ALL Staff (Full-Time & Part-Time)
    // =========================================================================
    let roundSafety = 0;
    const maxTotalAssignments = fcStaff.length * days;

    while (roundSafety < maxTotalAssignments) {
      roundSafety++;

      const UnderscheduledStaff: Array<{
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

        let bestDay = -1;
        let bestKey = '';
        let bestScore = Infinity;

        for (let d = 1; d <= days; d++) {
          if (!isFacilityOpenDay(fc, d)) continue;
          const shiftKey = getStaffWorkShiftKey(s, d, stdDayPat);
          if (!canAssignShift(s, d, shiftKey)) continue;

          const sc = scoreDayForStaff(s, d, shiftKey);
          if (sc < bestScore) {
            bestScore = sc;
            bestDay = d;
            bestKey = shiftKey;
          }
        }

        if (bestDay !== -1) {
          UnderscheduledStaff.push({
            s,
            ratio: curH / Math.max(1, limitH),
            bestDay,
            bestKey,
            bestScore,
          });
        }
      }

      if (UnderscheduledStaff.length === 0) break;

      UnderscheduledStaff.sort((a, b) => {
        const aMust = Boolean(getMustFillRule(a.s));
        const bMust = Boolean(getMustFillRule(b.s));
        if (aMust !== bMust) return aMust ? -1 : 1;
        if (Math.abs(a.ratio - b.ratio) > 0.02) {
          return a.ratio - b.ratio;
        }
        return a.bestScore - b.bestScore;
      });

      const chosen = UnderscheduledStaff[0];
      newShifts[chosen.s.id][chosen.bestDay] = chosen.bestKey;
    }

    // =========================================================================
    // PASS 6: Consecutive 公休 (2-Day Off Block) Optimization
    // Merges isolated single 公休 days into 2+ consecutive days off via
    // constraint-safe single-staff moves and pairwise staff swaps.
    // =========================================================================
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

    const isWorkDayMovableToKyu = (s: Staff, d: number): boolean => {
      if (d < 1 || d > days) return false;
      if (lockedSet.has(s.id)) return false;
      if (prefLockedStaffDays.has(`${s.id}-${d}`)) return false;
      if (ruleLockedStaffDays.has(`${s.id}-${d}`)) return false;
      const k = newShifts[s.id][d];
      if (!isWorkShift(k)) return false;
      if (nightPats.some((p) => p.key === k)) return false;
      if (k === '前休' || k === '後休' || k === '午前休' || k === '午後休') return false;
      return true;
    };

    const hasOtherPatternOnDay = (d: number, excludeStaffId: number, patKey: string): boolean =>
      fcStaff.some((st) => st.id !== excludeStaffId && newShifts[st.id][d] === patKey);

    const hasOtherSkillLeaderOnDay = (d: number, excludeStaffId: number): boolean =>
      fcStaff.some((st) => st.id !== excludeStaffId && isWorkShift(newShifts[st.id][d]) && (st.mat || 3) >= 3);

    for (let passIter = 0; passIter < 4; passIter++) {
      let improvedInPass = false;

      for (const s of fcStaff) {
        if (lockedSet.has(s.id) || s.nightOnly) continue;

        let safetyInner = 0;
        while (safetyInner < days) {
          safetyInner++;
          const beforeIso = countIsolatedKyu(s.id);
          if (beforeIso === 0) break;

          // Collect candidate rest days to turn into work (`dOff`) and work days adjacent to a rest day (`dAdj`)
          const kyuCandidates: number[] = [];
          const adjWorkCandidates: number[] = [];

          for (let d = 1; d <= days; d++) {
            if (isDayKyuMovableToWork(s, d)) {
              kyuCandidates.push(d);
            }
            if (isWorkDayMovableToKyu(s, d)) {
              const prevIsRest = d > 1 && isRestForPair(newShifts[s.id][d - 1]);
              const nextIsRest = d < days && isRestForPair(newShifts[s.id][d + 1]);
              if (prevIsRest || nextIsRest) {
                adjWorkCandidates.push(d);
              }
            }
          }

          if (kyuCandidates.length === 0 || adjWorkCandidates.length === 0) break;

          let bestApplied = false;

          // 6A: Single-staff move (only move from a day with equal/higher staff count so coverage remains balanced)
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

            for (const dOff of kyuCandidates) {
              if (dOff === dAdj) continue;
              // Never widen daily headcount gap by moving from sparser day to busier day
              if (adjCount - 1 < countWorkingStaffOnDay(dOff)) continue;

              const origPat = getPatternByKey(origKey, fc.id, shiftPatterns);
              const candidateKey = origKey.startsWith('time:')
                ? origKey
                : getStaffWorkShiftKey(s, dOff, origPat || stdDayPat);
              const newH = getStaffDayNetH(s.id, dOff, candidateKey, fc.id, shiftPatterns, parsedRules);
              if (Math.abs(newH - origH) > 0.25) continue;

              // Temporarily apply to evaluate all hard constraints and isolated 公休 count
              newShifts[s.id][dAdj] = '公休';
              const canPlace = canAssignShift(s, dOff, candidateKey);
              let afterIso = beforeIso;
              if (canPlace) {
                newShifts[s.id][dOff] = candidateKey;
                afterIso = countIsolatedKyu(s.id);
                newShifts[s.id][dOff] = '公休';
              }
              newShifts[s.id][dAdj] = origKey;

              if (!canPlace || afterIso >= beforeIso) continue;

              const sameWeekBonus =
                Math.floor((dAdj - 1 - dayOfWeekIdx(year, month, dAdj)) / 7) ===
                Math.floor((dOff - 1 - dayOfWeekIdx(year, month, dOff)) / 7)
                  ? -20
                  : 0;
              const moveScore =
                (beforeIso - afterIso) * -100 +
                sameWeekBonus +
                (countWorkingStaffOnDay(dOff) - adjCount) * 10 +
                (calcCareOnDuty(dOff) - adjCare) * 5 +
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

          // 6B: Pairwise swap with another staff member (preserves exact daily headcount & coverage)
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

            for (const dOff of kyuCandidates) {
              if (dOff === dAdj) continue;
              const beforeCareOff = calcCareOnDuty(dOff);
              const beforeHasEarlyOff = Boolean(earlyPat && fcStaff.some((st) => newShifts[st.id][dOff] === earlyPat.key));
              const beforeHasLateOff = Boolean(latePat && fcStaff.some((st) => newShifts[st.id][dOff] === latePat.key));
              const beforeLeaderOff = getDaySkillStats(dOff).maxMat >= 3;

              for (const other of fcStaff) {
                if (other.id === s.id || lockedSet.has(other.id) || other.nightOnly) continue;
                if (!isWorkDayMovableToKyu(other, dOff)) continue;
                if (!isDayKyuMovableToWork(other, dAdj)) continue;

                const origKey2 = newShifts[other.id][dOff];
                const origH2 = getStaffDayNetH(other.id, dOff, origKey2, fc.id, shiftPatterns, parsedRules);
                const beforeIso2 = countIsolatedKyu(other.id);

                // Match patterns if either day needs early/late coverage
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

                // Tentatively clear both and validate hard constraints
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
                    leaderOkOff;
                }

                // Restore state before evaluating next candidate
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
  });

  return newShifts;
}
