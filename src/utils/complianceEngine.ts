import { AppState, Facility } from '../types';
import { FACILITY_TYPES } from '../constants';
import {
  daysInMonth,
  getStaffDayNetH,
  isNight,
  isWorkShift,
  timeToMinutes,
  parseTimeVal,
  getStaffRoleAllocationRatio,
  dayOfWeekIdx,
  getShiftTimeRange,
} from './shiftEngine';

export interface ComplianceCheckResult {
  facilityId: number;
  facilityName: string;
  facilityType: string;
  checks: Array<{
    label: string;
    req: string;
    actual: string | number;
    passed: boolean;
  }>;
  allPassed: boolean;
}

export interface StaffSummary {
  id: number;
  name: string;
  facilityName: string;
  role: string;
  mat: number;
  dedicated: boolean;
  workDays: number;
  paidLeaveCount: number;
  nightShiftCount: number;
  totalNetHours: number;
  avgWeeklyHours: number;
  fte: string;
  over36: boolean;
  maxConsecutive: number;
}

export function runFacilityChecks(state: AppState): ComplianceCheckResult[] {
  const { year, month, staff, shifts, facilities, shiftPatterns, parsedRules } = state;
  const days = daysInMonth(year, month);

  return facilities.map((fc) => {
    const fcType = FACILITY_TYPES.find((t) => t.id === fc.typeId);
    const mainStaff = staff.filter((s) => s.facilityId === fc.id);
    const checks: Array<{ label: string; req: string; actual: string | number; passed: boolean }> = [];

    if (fcType) {
      fcType.checks.forEach((c) => {
        let passed = false;
        let actual: string | number = 0;

        if (c.minTotal !== undefined) {
          actual = mainStaff.filter((s) =>
            (Array.isArray(s.roles) ? s.roles : [s.role]).some((r) => c.roles.includes(r))
          ).length;
          passed = actual >= c.minTotal;
        } else if (c.minPerDay !== undefined) {
          // 日中配置人数集計:
          // 管理者（管理職分）および計画作成担当者は介護職人員配置基準から厳密に控除（抜く）
          let totalCareOnDuty = 0;
          for (let d = 1; d <= days; d++) {
            const count = mainStaff.reduce((sum, s) => {
              const working = isWorkShift(shifts[s.id]?.[d]) || shifts[s.id]?.[d] === '明け';
              if (!working) return sum;
              const roleRatio = getStaffRoleAllocationRatio(s, c.roles);
              return sum + roleRatio;
            }, 0);
            totalCareOnDuty += count;
          }
          const avg = days > 0 ? totalCareOnDuty / days : 0;
          actual = `${avg.toFixed(1)}人/日`;
          const reqTarget = (c.roles.includes('介護職員') && fcType.ratio)
            ? Math.max(c.minPerDay, Math.ceil(fc.users / fcType.ratio))
            : c.minPerDay;
          passed = avg >= (reqTarget - 0.001);
        } else if (c.minFTE !== undefined) {
          // 常勤換算 (FTE):
          // 兼務者の労働時間から管理職分・計画作成分を除外して純粋な職種別実労働時間で換算
          const totalFTE = mainStaff.reduce((acc, s) => {
            const roleRatio = getStaffRoleAllocationRatio(s, c.roles);
            if (roleRatio <= 0) return acc;
            let h = 0;
            for (let d = 1; d <= days; d++) {
              const fullH = getStaffDayNetH(s.id, d, shifts[s.id]?.[d] || '公休', fc.id, shiftPatterns, parsedRules);
              h += fullH * roleRatio;
            }
            const fullTimeMonthly = (40 / 7) * days;
            return acc + (fullTimeMonthly > 0 ? h / fullTimeMonthly : 0);
          }, 0);
          actual = `${totalFTE.toFixed(2)}`;
          passed = totalFTE >= c.minFTE;
        }

        checks.push({
          label: c.label,
          req: c.req,
          actual,
          passed,
        });
      });
    }

    return {
      facilityId: fc.id,
      facilityName: fc.name,
      facilityType: fcType?.name || 'その他',
      checks,
      allPassed: checks.every((c) => c.passed),
    };
  });
}

export function computeStaffSummaries(state: AppState): StaffSummary[] {
  const { year, month, staff, shifts, facilities, shiftPatterns, parsedRules } = state;
  const days = daysInMonth(year, month);

  return staff.map((s) => {
    const fc = facilities.find((f) => f.id === s.facilityId);
    let workDays = 0;
    let paidLeaveCount = 0;
    let nightShiftCount = 0;
    let totalNetHours = 0;
    let curConsecutive = 0;
    let maxConsecutive = 0;

    for (let d = 1; d <= days; d++) {
      const k = shifts[s.id]?.[d] || '公休';
      if (k === '有休') paidLeaveCount++;

      if (isWorkShift(k)) {
        workDays++;
        curConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, curConsecutive);

        const h = getStaffDayNetH(s.id, d, k, s.facilityId, shiftPatterns, parsedRules);
        totalNetHours += h;

        const pat = shiftPatterns.find((p) => p.facilityId === s.facilityId && p.key === k) ||
          shiftPatterns.find((p) => p.key === k);
        if (pat && isNight(pat)) {
          nightShiftCount++;
        }
      } else {
        curConsecutive = 0;
      }
    }

    const weeks = days / 7;
    const avgWeeklyHours = weeks > 0 ? totalNetHours / weeks : 0;
    const fullTimeMonthly = 40 * weeks;
    const fte = fullTimeMonthly > 0 ? Math.min(1.0, totalNetHours / fullTimeMonthly).toFixed(2) : '0.00';
    // 36 Agreement check: average weekly hours exceeds 40h or staff's contracted hours
    const over36 = avgWeeklyHours > Math.max(40, s.hours);

    return {
      id: s.id,
      name: s.name,
      facilityName: fc?.name || '未設定',
      role: Array.isArray(s.roles) ? s.roles.join('・') : s.role,
      mat: s.mat || 3,
      dedicated: s.dedicated,
      workDays,
      paidLeaveCount,
      nightShiftCount,
      totalNetHours,
      avgWeeklyHours,
      fte,
      over36,
      maxConsecutive,
    };
  });
}

export function collectDashboardAlerts(state: AppState): Array<{ type: 'danger' | 'warning' | 'success'; message: string }> {
  const { year, month, staff, shifts, pairs, facilities, shiftPatterns } = state;
  const days = daysInMonth(year, month);
  const alerts: Array<{ type: 'danger' | 'warning' | 'success'; message: string }> = [];

  // 1. Forbidden pairs
  pairs
    .filter((p) => p.type === 'forbidden')
    .forEach((p) => {
      const sa = staff.find((s) => s.id === p.a);
      const sb = staff.find((s) => s.id === p.b);
      if (!sa || !sb) return;

      const violationDays: number[] = [];
      for (let d = 1; d <= days; d++) {
        if (isWorkShift(shifts[sa.id]?.[d]) && isWorkShift(shifts[sb.id]?.[d])) {
          violationDays.push(d);
        }
      }
      if (violationDays.length > 0) {
        alerts.push({
          type: 'danger',
          message: `禁止ペア違反: ${sa.name} × ${sb.name} が同日出勤しています (${violationDays.join(', ')}日)`,
        });
      }
    });

  // 2. Consecutive work days (> 5 days)
  staff.forEach((s) => {
    let consec = 0;
    let maxConsec = 0;
    for (let d = 1; d <= days; d++) {
      if (isWorkShift(shifts[s.id]?.[d])) {
        consec++;
        maxConsec = Math.max(maxConsec, consec);
      } else {
        consec = 0;
      }
    }
    if (maxConsec >= 6) {
      alerts.push({
        type: 'warning',
        message: `${s.name}: ${maxConsec}日連続勤務が設定されています（労働基準局指導: 原則5連勤まで推奨）`,
      });
    }
  });

  // 3. Weekly hours (> 40h)
  const summaries = computeStaffSummaries(state);
  summaries.forEach((sum) => {
    if (sum.avgWeeklyHours > 40) {
      alerts.push({
        type: 'warning',
        message: `${sum.name}: 週平均実働${sum.avgWeeklyHours.toFixed(1)}h（法定週40h超過の可能性）`,
      });
    }
  });

  // 4. Night 24h residential facility gaps
  facilities
    .filter((fc) => {
      const ft = FACILITY_TYPES.find((t) => t.id === fc.typeId);
      return ft && ft.nightRequired;
    })
    .forEach((fc) => {
      const fcStaff = staff.filter((s) => s.facilityId === fc.id);
      for (let d = 1; d <= days; d++) {
        const coverage = new Array(24).fill(false);
        fcStaff.forEach((s) => {
          const k = shifts[s.id]?.[d];
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
          // Prior day night shift morning hours
          if (d > 1) {
            const prevK = shifts[s.id]?.[d - 1];
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

        const uncovered: string[] = [];
        for (let h = 0; h < 24; h++) {
          if (!coverage[h]) uncovered.push(`${h}時`);
        }
        if (uncovered.length > 0) {
          alerts.push({
            type: 'danger',
            message: `${fc.name}: ${month}/${d} 空白時間帯あり (${uncovered.slice(0, 3).join(', ')}${uncovered.length > 3 ? '…' : ''})`,
          });
        }
      }
    });

  // 5. 介護職人員配置基準チェック（管理者・計画作成担当者分控除）
  facilities.forEach((fc) => {
    const fcType = FACILITY_TYPES.find((t) => t.id === fc.typeId);
    if (!fcType || !fcType.ratio) return;
    const ratioNeeded = Math.ceil(fc.users / fcType.ratio);
    const ratioRoles = fcType.ratioRoles && fcType.ratioRoles.length > 0 ? fcType.ratioRoles : ['介護職員'];
    const fcStaff = staff.filter((s) => s.facilityId === fc.id);

    const deficitDays: Array<{ day: number; actual: number }> = [];
    for (let d = 1; d <= days; d++) {
      if (fc.typeId === 'dayservice' && fc.bizDays && fc.bizDays.length > 0) {
        const dow = dayOfWeekIdx(year, month, d);
        if (!fc.bizDays.includes(dow)) continue;
      }

      const careOnDuty = fcStaff.reduce((sum, s) => {
        const k = shifts[s.id]?.[d];
        if (isWorkShift(k) || k === '明け') {
          return sum + getStaffRoleAllocationRatio(s, ratioRoles);
        }
        return sum;
      }, 0);

      if (careOnDuty < ratioNeeded - 0.001) {
        deficitDays.push({ day: d, actual: careOnDuty });
      }
    }

    if (deficitDays.length > 0) {
      const dayList = deficitDays
        .slice(0, 5)
        .map((x) => `${x.day}日(${x.actual.toFixed(1)}名)`)
        .join(', ');
      alerts.push({
        type: 'danger',
        message: `${fc.name}: 介護職員人員配置基準不足（${fcType.ratio}:1 要${ratioNeeded}名、管理者・計画作成分控除後）: ${dayList}${deficitDays.length > 5 ? '等' : ''}`,
      });
    }
  });

  if (alerts.length === 0) {
    alerts.push({
      type: 'success',
      message: '現時点で法令違反・人員不足・相性衝突のアラートはありません ✅',
    });
  }

  return alerts;
}
