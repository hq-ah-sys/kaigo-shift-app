import React, { useState } from 'react';
import { AppState, ShiftPattern } from '../../types';
import {
  daysInMonth,
  dayOfWeekName,
  dayOfWeekClass,
  isWorkShift,
  getPatternByKey,
  getStaffDayNetH,
  netHours,
  grossHours,
  isNight,
  calcFTE,
  parseTimeVal,
  timeToMinutes,
  breakTime,
  getTimeKeyHours,
  getStaffRoleAllocationRatio,
  getShiftTimeRange,
} from '../../utils/shiftEngine';
import { FACILITY_TYPES, SPECIAL_SHIFTS, SP_COLOR, SP_TEXT_COLOR, SP_SHORT } from '../../constants';
import { exportShiftCalendarToExcel } from '../../utils/excelExport';
import { generateShifts } from '../../utils/shiftEngine';
import { collectDashboardAlerts, computeStaffSummaries } from '../../utils/complianceEngine';
import {
  Calendar,
  Lock,
  Unlock,
  FileSpreadsheet,
  RefreshCw,
  Sun,
  Clock,
  Sparkles,
  X,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Pencil,
  FileEdit,
  Eraser,
  Save,
  Users,
} from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onNavigateTab: (tab: string) => void;
}

export const CalendarTab: React.FC<Props> = ({ state, onUpdateState, onNavigateTab }) => {
  const [dispMode, setDispMode] = useState<'key' | 'time'>(state.dispMode || 'key');
  const [groupByRole, setGroupByRole] = useState<boolean>(true);

  // Quick Stamp / Edit Mode State
  const [isStampEditMode, setIsStampEditMode] = useState(false);
  const [activeStampKey, setActiveStampKey] = useState<string>(
    state.shiftPatterns[0]?.key || '日勤'
  );

  // Batch Edit Modals
  const [staffBatchModal, setStaffBatchModal] = useState<any | null>(null);
  const [dayBatchModal, setDayBatchModal] = useState<number | null>(null);

  // Popover state for editing cell
  const [popTarget, setPopTarget] = useState<{ staffId: number; day: number } | null>(null);
  const [modalMode, setModalMode] = useState<'pattern' | 'time'>('pattern');
  const [customStart, setCustomStart] = useState<string>('09:00');
  const [customEnd, setCustomEnd] = useState<string>('18:00');

  // Error / Alert Detail Modal State
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<number | null>(null);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<number | null>(null);

  const { year, month, staff, shifts, facility, shiftPatterns, lockedStaff, parsedRules } = state;
  const days = daysInMonth(year, month);
  const lockedSet = new Set(lockedStaff);

  const allAlerts = collectDashboardAlerts(state);
  const activeAlerts = allAlerts.filter((a) => a.type !== 'success');
  const staffSummaries = computeStaffSummaries(state);

  // Role sections configuration for multi-row concurrent staff display
  const ROLE_SECTIONS = [
    {
      key: '管理者',
      label: '👑 1行目：管理者',
      badgeText: '管理者',
      badgeBg: 'bg-purple-100 text-purple-900 border-purple-300',
      matchFn: (s: any) => (Array.isArray(s.roles) ? s.roles : [s.role]).includes('管理者'),
    },
    {
      key: '計画作成担当者',
      label: '📋 2行目：計画作成担当者',
      badgeText: '計画作成担当',
      badgeBg: 'bg-blue-100 text-blue-900 border-blue-300',
      matchFn: (s: any) =>
        (Array.isArray(s.roles) ? s.roles : [s.role]).some(
          (r: string) => r === '計画作成担当者' || r === '介護支援専門員'
        ),
    },
    {
      key: '介護職員',
      label: '🤝 3行目〜：介護職員',
      badgeText: '介護職',
      badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      matchFn: (s: any) => (Array.isArray(s.roles) ? s.roles : [s.role]).includes('介護職員'),
    },
    {
      key: 'その他職種',
      label: '💼 その他職種',
      badgeText: 'その他',
      badgeBg: 'bg-gray-100 text-gray-800 border-gray-300',
      matchFn: (s: any) => {
        const rList = Array.isArray(s.roles) ? s.roles : [s.role];
        return !rList.some((r: string) =>
          ['管理者', '計画作成担当者', '介護支援専門員', '介護職員'].includes(r)
        );
      },
    },
  ];

  const getDayAlerts = (day: number) => {
    const res: Array<{ type: 'danger' | 'warning'; message: string }> = [];
    const fcType = FACILITY_TYPES.find((t) => t.id === facility.typeId);
    const ratioNeeded = fcType?.ratio ? Math.ceil(facility.users / fcType.ratio) : 2;

    if (fcType?.ratio) {
      const ratioRoles = fcType.ratioRoles && fcType.ratioRoles.length > 0 ? fcType.ratioRoles : ['介護職員'];
      const careOnDuty = staff.reduce((sum, s) => {
        const k = shifts[s.id]?.[day];
        if (isWorkShift(k) || k === '明け') {
          return sum + getStaffRoleAllocationRatio(s, ratioRoles);
        }
        return sum;
      }, 0);
      if (careOnDuty < ratioNeeded - 0.001) {
        res.push({
          type: 'danger',
          message: `${month}月${day}日: 介護職人員配置基準不足 (実働介護員 ${careOnDuty.toFixed(1)}名 / 必要${ratioNeeded}名 ※管理者・計画作成分控除後)`,
        });
      }
    }

    if (fcType?.nightRequired) {
      const coverage = new Array(24).fill(false);
      staff.forEach((s) => {
        const k = shifts[s.id]?.[day];
        const range = getShiftTimeRange(k, s.facilityId, shiftPatterns);
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
          const prevK = shifts[s.id]?.[day - 1];
          const prevRange = getShiftTimeRange(prevK, s.facilityId, shiftPatterns);
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
        res.push({
          type: 'danger',
          message: `${month}月${day}日: 24時間常駐空白あり (${uncovered.slice(0, 4).join(', ')}${uncovered.length > 4 ? '…' : ''})`,
        });
      }
    }

    state.pairs
      .filter((p) => p.type === 'forbidden')
      .forEach((p) => {
        const sa = staff.find((s) => s.id === p.a);
        const sb = staff.find((s) => s.id === p.b);
        if (sa && sb) {
          if (isWorkShift(shifts[sa.id]?.[day]) && isWorkShift(shifts[sb.id]?.[day])) {
            res.push({
              type: 'danger',
              message: `${month}月${day}日: 禁止ペア同時勤務 (${sa.name} × ${sb.name})`,
            });
          }
        }
      });

    return res;
  };

  const getStaffAlerts = (staffId: number) => {
    const res: Array<{ type: 'danger' | 'warning'; message: string }> = [];
    const sum = staffSummaries.find((s) => s.id === staffId);
    const sMember = staff.find((s) => s.id === staffId);
    if (!sum || !sMember) return res;

    if (sum.over36) {
      res.push({
        type: 'warning',
        message: `${sMember.name}: 週平均実働 ${sum.avgWeeklyHours.toFixed(1)}h (法定週40h超過注意)`,
      });
    }
    if (sum.maxConsecutive >= 6) {
      res.push({
        type: 'warning',
        message: `${sMember.name}: ${sum.maxConsecutive}日連続勤務が設定されています (原則5連勤推奨)`,
      });
    }

    state.pairs
      .filter((p) => p.type === 'forbidden' && (p.a === staffId || p.b === staffId))
      .forEach((p) => {
        const otherId = p.a === staffId ? p.b : p.a;
        const other = staff.find((s) => s.id === otherId);
        if (other) {
          for (let d = 1; d <= days; d++) {
            if (isWorkShift(shifts[staffId]?.[d]) && isWorkShift(shifts[otherId]?.[d])) {
              res.push({
                type: 'danger',
                message: `${month}月${d}日: 禁止ペア (${other.name}) と同日出勤`,
              });
            }
          }
        }
      });

    return res;
  };

  const toggleLock = (staffId: number) => {
    onUpdateState((prev) => {
      const exists = prev.lockedStaff.includes(staffId);
      return {
        ...prev,
        lockedStaff: exists
          ? prev.lockedStaff.filter((id) => id !== staffId)
          : [...prev.lockedStaff, staffId],
      };
    });
  };

  const handleCellClick = (staffId: number, day: number) => {
    if (isStampEditMode) {
      onUpdateState((prev) => {
        const updatedStaffShifts = { ...(prev.shifts[staffId] || {}) };
        if (activeStampKey === 'CLEAR') {
          delete updatedStaffShifts[day];
        } else {
          updatedStaffShifts[day] = activeStampKey;
        }
        return {
          ...prev,
          shifts: {
            ...prev.shifts,
            [staffId]: updatedStaffShifts,
          },
        };
      });
      return;
    }

    const currentShift = shifts[staffId]?.[day] || '公休';
    setPopTarget({ staffId, day });

    if (currentShift.startsWith('time:')) {
      const tv = parseTimeVal(currentShift);
      if (tv) {
        setCustomStart(tv.start);
        setCustomEnd(tv.end);
        setModalMode('time');
        return;
      }
    } else {
      const staffMember = staff.find((s) => s.id === staffId);
      const pat = getPatternByKey(currentShift, staffMember?.facilityId || facility.id, shiftPatterns);
      if (pat) {
        setCustomStart(pat.start);
        setCustomEnd(pat.end);
      } else {
        setCustomStart('09:00');
        setCustomEnd('18:00');
      }
      setModalMode('pattern');
    }
  };

  const handleSelectShift = (key: string) => {
    if (!popTarget) return;
    const { staffId, day } = popTarget;

    onUpdateState((prev) => {
      const updatedStaffShifts = { ...(prev.shifts[staffId] || {}) };
      updatedStaffShifts[day] = key;
      return {
        ...prev,
        shifts: {
          ...prev.shifts,
          [staffId]: updatedStaffShifts,
        },
      };
    });

    setPopTarget(null);
  };

  const handleQuickReGenerate = () => {
    onUpdateState((prev) => {
      const newShifts = generateShifts(prev);
      return {
        ...prev,
        shifts: newShifts,
        lockedStaff: [],
      };
    });
  };

  const fcType = FACILITY_TYPES.find((t) => t.id === facility.typeId);
  const ratioNeeded = fcType?.ratio ? Math.ceil(facility.users / fcType.ratio) : 2;

  const currentTargetStaff = popTarget ? staff.find((s) => s.id === popTarget.staffId) : null;
  const currentTargetStaffPats = shiftPatterns;

  return (
    <div className="space-y-4">
      {/* Action Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{fcType?.icon || '🏢'}</span>
            <span className="font-bold text-sm text-gray-900">{facility.name}</span>
            <span className="text-xs text-gray-500 font-medium">
              (定員: {facility.users}名)
            </span>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            <button
              onClick={() => {
                setPopTarget(null);
                setDayBatchModal(null);
                setStaffBatchModal(null);
                onUpdateState((prev) => {
                  let y = prev.year;
                  let m = prev.month - 1;
                  if (m < 1) {
                    m = 12;
                    y--;
                  }
                  return { ...prev, year: y, month: m };
                });
              }}
              className="px-2 py-1 rounded-lg text-xs font-bold hover:bg-white transition cursor-pointer"
            >
              ◀
            </button>
            <span className="px-2 text-xs font-black text-gray-900">
              {year}年 {month}月
            </span>
            <button
              onClick={() => {
                setPopTarget(null);
                setDayBatchModal(null);
                setStaffBatchModal(null);
                onUpdateState((prev) => {
                  let y = prev.year;
                  let m = prev.month + 1;
                  if (m > 12) {
                    m = 1;
                    y++;
                  }
                  return { ...prev, year: y, month: m };
                });
              }}
              className="px-2 py-1 rounded-lg text-xs font-bold hover:bg-white transition cursor-pointer"
            >
              ▶
            </button>
          </div>



          {/* Display Mode toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-bold bg-white">
            <button
              onClick={() => setDispMode('key')}
              className={`px-3 py-1.5 transition cursor-pointer ${
                dispMode === 'key' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              記号表示
            </button>
            <button
              onClick={() => setDispMode('time')}
              className={`px-3 py-1.5 transition cursor-pointer ${
                dispMode === 'time' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              時間表示
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Error / Alert Details Button (!) */}
          <button
            onClick={() => {
              setSelectedDayFilter(null);
              setSelectedStaffFilter(null);
              setShowAlertModal(true);
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-black text-xs shadow-xs transition cursor-pointer ${
              activeAlerts.length > 0
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
            title="シフト表のエラー・警告詳細を表示 (!)"
          >
            {activeAlerts.length > 0 ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>エラー・警告 ({activeAlerts.length}件) (!)</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>全チェック適合 ✅ (!)</span>
              </>
            )}
          </button>

          {/* Edit Mode Toggle */}
          <button
            onClick={() => setIsStampEditMode(!isStampEditMode)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-xs transition cursor-pointer ${
              isStampEditMode
                ? 'bg-purple-600 text-white ring-2 ring-purple-300 shadow-md'
                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
            }`}
            title="クリックで即座に入力できるスタンプ編集画面を開く"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>{isStampEditMode ? '編集モード解除' : '✏️ シフト直接編集'}</span>
          </button>


          <button
            onClick={handleQuickReGenerate}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            title="固定されていない職員のシフトを再生成"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>シフト再生成</span>
          </button>

          <button
            onClick={() => exportShiftCalendarToExcel(state)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            title="掲示板貼付用・A4横印刷対応 Excelファイル（.xlsx）を出力"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel出力 (A4横)</span>
          </button>
        </div>
      </div>

      {/* Quick Stamp Edit Palette Toolbar (when isStampEditMode is active) */}
      {isStampEditMode && (
        <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 rounded-2xl border-2 border-purple-300 p-4 shadow-sm animate-in fade-in space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-purple-600 text-white rounded-lg">
                <Pencil className="w-4 h-4" />
              </span>
              <div>
                <span className="font-bold text-purple-950 text-xs">
                  シフト直接スタンプ編集画面
                </span>
                <span className="text-[11px] text-purple-700 block">
                  下の記号を選択した状態でシフト表のセルをクリックすると、そのシフトが即座に入力されます。
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab('fileEdit')}
                className="px-3 py-1 rounded-lg bg-white border border-purple-300 text-purple-700 hover:bg-purple-100 font-bold text-xs shadow-2xs transition cursor-pointer"
              >
                全データJSON編集へ →
              </button>
              <button
                type="button"
                onClick={() => setIsStampEditMode(false)}
                className="px-3 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-xs transition cursor-pointer"
              >
                編集モード終了
              </button>
            </div>
          </div>

          {/* Palette buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-bold text-gray-700 mr-1">入力スタンプ:</span>
            {shiftPatterns.map((p) => {
              const isSelected = activeStampKey === p.key;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setActiveStampKey(p.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                    isSelected
                      ? 'ring-2 ring-purple-600 ring-offset-2 scale-105'
                      : 'hover:opacity-90'
                  }`}
                  style={{ backgroundColor: p.color, color: '#ffffff' }}
                >
                  <span>{p.key}</span>
                  <span className="text-[10px] opacity-90 font-normal">({p.name})</span>
                </button>
              );
            })}

            {SPECIAL_SHIFTS.map((sp) => {
              const isSelected = activeStampKey === sp;
              return (
                <button
                  type="button"
                  key={sp}
                  onClick={() => setActiveStampKey(sp)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1 border shadow-2xs ${
                    isSelected ? 'ring-2 ring-purple-600 ring-offset-2 scale-105' : ''
                  }`}
                  style={{
                    backgroundColor: `${SP_COLOR[sp]}25`,
                    borderColor: SP_COLOR[sp],
                    color: SP_TEXT_COLOR[sp] === '#ffffff' ? '#047857' : SP_TEXT_COLOR[sp],
                  }}
                >
                  <span>{sp}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setActiveStampKey('CLEAR')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1 border border-gray-300 bg-white text-gray-600 shadow-2xs ${
                activeStampKey === 'CLEAR' ? 'ring-2 ring-purple-600 ring-offset-2 scale-105' : ''
              }`}
            >
              <Eraser className="w-3.5 h-3.5 text-gray-400" />
              <span>クリア（公休）</span>
            </button>
          </div>
        </div>
      )}

      {/* Legend Box */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-3.5">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-gray-700">
          <span className="text-gray-400 font-bold">凡例:</span>
          {shiftPatterns.map((p) => {
            const nH = netHours(p);
            return (
              <div key={p.id} className="flex items-center gap-1.5">
                <span
                  className="w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] text-white shadow-2xs"
                  style={{ backgroundColor: p.color }}
                >
                  {p.key}
                </span>
                <span>
                  <strong>{p.name}</strong> ({p.start}〜{p.end} 実{nH.toFixed(1)}h)
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-emerald-500 text-white font-bold text-[11px] flex items-center justify-center">
              有
            </span>
            <span>有給休暇 (0h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-amber-400 text-amber-900 font-bold text-[11px] flex items-center justify-center">
              希
            </span>
            <span>希望休 (0h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-gray-200 text-gray-700 font-bold text-[11px] flex items-center justify-center">
              休
            </span>
            <span>公休 (0h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-5 rounded bg-blue-300 text-blue-900 font-bold text-[11px] flex items-center justify-center">
              明
            </span>
            <span>明け (0h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-5 h-5 rounded font-bold text-[11px] flex items-center justify-center shadow-2xs border border-gray-300"
              style={{ backgroundColor: SP_COLOR['他事業所'], color: SP_TEXT_COLOR['他事業所'] }}
            >
              他
            </span>
            <span>他事業所勤務 (0h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-5 h-5 rounded font-bold text-[10px] flex items-center justify-center shadow-2xs text-white"
              style={{ backgroundColor: SP_COLOR['午前休'] }}
            >
              前休
            </span>
            <span>午前休 (午後勤務 13:30〜17:30 実4.0h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-5 h-5 rounded font-bold text-[10px] flex items-center justify-center shadow-2xs text-white"
              style={{ backgroundColor: SP_COLOR['午後休'] }}
            >
              後休
            </span>
            <span>午後休 (午前勤務 08:30〜12:30 実4.0h)</span>
          </div>
        </div>
      </div>

      {/* Main Shift Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[75vh]">
          <table className="w-full text-center border-collapse text-xs select-none">
            <thead className="sticky top-0 z-30 bg-gray-50/95 backdrop-blur-xs border-b border-gray-200 shadow-xs">
              <tr>
                <th className="py-2.5 px-2 w-8 border-r border-gray-200 sticky left-0 z-40 bg-gray-100 text-gray-500 font-bold">
                  🔒
                </th>
                <th className="py-2.5 px-3 min-w-[110px] max-w-[130px] text-left border-r border-gray-200 sticky left-8 z-40 bg-gray-100 font-bold text-gray-700">
                  氏名
                </th>
                <th className="py-2.5 px-3 min-w-[110px] max-w-[140px] text-left border-r-2 border-gray-200 sticky left-[142px] z-40 bg-gray-100 font-bold text-gray-700">
                  職種
                </th>
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const dClass = dayOfWeekClass(year, month, d);
                  const dayAlertsCount = getDayAlerts(d).length;
                  return (
                    <th
                      key={d}
                      className={`py-1.5 px-1 min-w-[34px] border-r border-gray-200 font-bold ${
                        dClass === 'sun'
                          ? 'bg-red-50 text-red-600'
                          : dClass === 'sat'
                          ? 'bg-blue-50 text-blue-600'
                          : 'text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setDayBatchModal(d)}
                          className="hover:underline hover:text-purple-700 font-bold cursor-pointer text-xs"
                          title={`${month}月${d}日の全職員シフト一括編集画面を開く`}
                        >
                          {d}
                        </button>
                        {dayAlertsCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDayFilter(d);
                              setSelectedStaffFilter(null);
                              setShowAlertModal(true);
                            }}
                            className="w-3.5 h-3.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[9px] font-black inline-flex items-center justify-center cursor-pointer shadow-2xs transition hover:scale-110"
                            title={`${month}月${d}日のエラー・警告を表示 (!)`}
                          >
                            !
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] font-normal">{dayOfWeekName(year, month, d)}</div>
                    </th>
                  );
                })}
                <th className="py-2.5 px-2 min-w-[55px] font-black text-blue-700 bg-blue-50/60 border-r border-gray-200">
                  総実労働h
                </th>
                <th className="py-2.5 px-2 min-w-[50px] font-bold text-gray-700 bg-gray-50 border-r border-gray-200">
                  週平均
                </th>
                <th className="py-2.5 px-2 min-w-[55px] font-bold text-purple-700 bg-purple-50/50">
                  常勤換算
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {(() => {
                const renderStaffRow = (s: any, roleSectionKey?: string) => {
                  const isLocked = lockedSet.has(s.id);
                  const roles = Array.isArray(s.roles) ? s.roles : [s.role];
                  const currentRole = roleSectionKey || roles[0] || '介護職員';
                  const isMultiRole = roles.length > 1;

                  let roleAllocRatio = 1.0;
                  let allocHDisplay = 0;
                  if (isMultiRole) {
                    const defaultAlloc = 8 / roles.length;
                    const currentRoleAlloc = s.roleHours?.[currentRole] ?? defaultAlloc;
                    allocHDisplay = currentRoleAlloc;
                    const sumAlloc = roles.reduce(
                      (sum: number, r: string) => sum + (s.roleHours?.[r] ?? defaultAlloc),
                      0
                    );
                    if (sumAlloc > 0) {
                      roleAllocRatio = currentRoleAlloc / sumAlloc;
                    }
                  }

                  let totalNetHours = 0;
                  for (let d = 1; d <= days; d++) {
                    const k = shifts[s.id]?.[d] || '公休';
                    const fullDayH = getStaffDayNetH(
                      s.id,
                      d,
                      k,
                      s.facilityId,
                      shiftPatterns,
                      parsedRules
                    );
                    totalNetHours += fullDayH * roleAllocRatio;
                  }

                  const weeks = days / 7;
                  const avgWeekly = weeks > 0 ? (totalNetHours / weeks).toFixed(1) : '0.0';
                  const fte = calcFTE(totalNetHours, days);
                  const rowKey = `${currentRole}-${s.id}`;

                  return (
                    <tr key={rowKey} className="hover:bg-blue-50/20 transition">
                      {/* Lock column */}
                      <td
                        onClick={() => toggleLock(s.id)}
                        className={`py-2 px-1 border-r border-gray-200 sticky left-0 z-10 text-center cursor-pointer ${
                          isLocked
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-white text-gray-300 hover:text-gray-500'
                        }`}
                        title={isLocked ? '固定ロック中（解除するにはクリック）' : 'クリックして再生成時に固定'}
                      >
                        {isLocked ? (
                          <Lock className="w-3.5 h-3.5 mx-auto text-amber-600" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5 mx-auto" />
                        )}
                      </td>

                      {/* Name column */}
                      <td className="py-2 px-3 text-left border-r border-gray-200 sticky left-8 z-10 bg-white font-bold text-gray-800 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-1">
                          <div className="flex items-center gap-1 truncate max-w-[120px]">
                            <span className="truncate">{s.name}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStaffBatchModal(s);
                              }}
                              className="p-0.5 text-gray-400 hover:text-purple-600 rounded transition cursor-pointer"
                              title={`${s.name} の月間シフト編集画面を開く`}
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                            {isMultiRole && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                                兼務
                              </span>
                            )}
                            {s.otherFacilityConcurrent && (
                              <span
                                className="px-1 py-0.2 rounded text-[9px] font-black bg-purple-100 text-purple-800 border border-purple-200 shrink-0"
                                title={`他事業所兼務 (${s.otherFacilityName || '他'})`}
                              >
                                他
                              </span>
                            )}
                          </div>
                          {getStaffAlerts(s.id).length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStaffFilter(s.id);
                                setSelectedDayFilter(null);
                                setShowAlertModal(true);
                              }}
                              className="w-3.5 h-3.5 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black inline-flex items-center justify-center cursor-pointer shrink-0 shadow-2xs hover:scale-110"
                              title={`${s.name} のエラー・警告詳細を表示 (!)`}
                            >
                              !
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Role column */}
                      <td className="py-2 px-2.5 text-left border-r-2 border-gray-200 sticky left-[142px] z-10 bg-white whitespace-nowrap font-medium">
                        {currentRole === '管理者' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-purple-100 text-purple-900 border border-purple-300">
                            <span>管理者</span>
                            {isMultiRole && allocHDisplay > 0 && (
                              <span className="text-purple-700 font-extrabold text-[9px]">({allocHDisplay}h/日)</span>
                            )}
                          </span>
                        ) : currentRole === '計画作成担当者' || currentRole === '介護支援専門員' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-blue-100 text-blue-900 border border-blue-300">
                            <span>計画作成</span>
                            {isMultiRole && allocHDisplay > 0 && (
                              <span className="text-blue-700 font-extrabold text-[9px]">({allocHDisplay}h/日)</span>
                            )}
                          </span>
                        ) : currentRole === '介護職員' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <span>介護職</span>
                            {isMultiRole && allocHDisplay > 0 && (
                              <span className="text-emerald-700 font-extrabold text-[9px]">({allocHDisplay}h/日)</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-gray-100 text-gray-800 border border-gray-300">
                            <span>{currentRole}</span>
                            {isMultiRole && allocHDisplay > 0 && (
                              <span className="text-gray-600 font-extrabold text-[9px]">({allocHDisplay}h/日)</span>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Day Cells */}
                      {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                        const key = shifts[s.id]?.[d] || '公休';
                        const pat = getPatternByKey(key, s.facilityId, shiftPatterns);
                        const timeVal = key.startsWith('time:') ? parseTimeVal(key) : null;
                        const isNightOff = key === '明け';
                        const isOtherFacShift = key === '他事業所';
                        const isMorningOff = key === '午前休' || key === '前休';
                        const isAfternoonOff = key === '午後休' || key === '後休';

                        let bg = pat?.color || SP_COLOR[key] || '#f3f4f6';
                        let tc = '#ffffff';

                        if (key === '公休') {
                          bg = '#f1f5f9';
                          tc = '#64748b';
                        } else if (key === '希望休') {
                          tc = '#78350f';
                        } else if (isNightOff) {
                          bg = '#93c5fd';
                          tc = '#1e3a8a';
                        } else if (isOtherFacShift) {
                          bg = SP_COLOR['他事業所'] || '#e2e8f0';
                          tc = SP_TEXT_COLOR['他事業所'] || '#475569';
                        } else if (isMorningOff) {
                          bg = SP_COLOR['午前休'] || '#14b8a6';
                          tc = SP_TEXT_COLOR['午前休'] || '#ffffff';
                        } else if (isAfternoonOff) {
                          bg = SP_COLOR['午後休'] || '#0284c7';
                          tc = SP_TEXT_COLOR['午後休'] || '#ffffff';
                        } else if (timeVal) {
                          bg = '#7c3aed';
                          tc = '#ffffff';
                        }

                        return (
                          <td
                            key={d}
                            onClick={() => handleCellClick(s.id, d)}
                            className="border-r border-gray-200 p-0 h-9 relative hover:brightness-90 transition cursor-pointer"
                            style={{ backgroundColor: isNightOff ? undefined : bg }}
                            title={`${s.name} ${month}/${d}: ${key}${
                              isMorningOff
                                ? ' (午前半日休 / 実働4.0h 13:30〜17:30)'
                                : isAfternoonOff
                                ? ' (午後半日休 / 実働4.0h 08:30〜12:30)'
                                : s.otherFacilityConcurrent && isOtherFacShift
                                ? ` (${s.otherFacilityName || '他事業所勤務'})`
                                : ''
                            }`}
                          >
                            {isNightOff ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-blue-500 to-blue-200 text-white font-black text-xs shadow-inner">
                                <span className="drop-shadow-sm">明</span>
                              </div>
                            ) : isOtherFacShift ? (
                              <div
                                className="w-full h-full flex items-center justify-center font-black text-xs"
                                style={{ backgroundColor: SP_COLOR['他事業所'], color: SP_TEXT_COLOR['他事業所'] }}
                              >
                                <span className="drop-shadow-2xs">他</span>
                              </div>
                            ) : (
                              <div
                                className="w-full h-full flex flex-col items-center justify-center font-bold text-xs"
                                style={{ color: tc }}
                              >
                                {isMorningOff ? (
                                  dispMode === 'time' ? (
                                    <div className="text-center leading-none">
                                      <div className="text-[9px] font-black leading-tight">13:30</div>
                                      <div className="text-[8px] opacity-90 leading-tight">~17:30</div>
                                      <div className="text-[7.5px] font-extrabold opacity-95">前休4h</div>
                                    </div>
                                  ) : (
                                    <div className="text-center leading-none">
                                      <div className="font-black text-xs leading-tight">前休</div>
                                      <div className="text-[8.5px] font-extrabold opacity-90 leading-tight">4.0h</div>
                                    </div>
                                  )
                                ) : isAfternoonOff ? (
                                  dispMode === 'time' ? (
                                    <div className="text-center leading-none">
                                      <div className="text-[9px] font-black leading-tight">08:30</div>
                                      <div className="text-[8px] opacity-90 leading-tight">~12:30</div>
                                      <div className="text-[7.5px] font-extrabold opacity-95">後休4h</div>
                                    </div>
                                  ) : (
                                    <div className="text-center leading-none">
                                      <div className="font-black text-xs leading-tight">後休</div>
                                      <div className="text-[8.5px] font-extrabold opacity-90 leading-tight">4.0h</div>
                                    </div>
                                  )
                                ) : dispMode === 'time' && pat ? (
                                  <span className="text-[9px] leading-tight text-center">
                                    {pat.start}
                                    <br />
                                    {pat.end}
                                  </span>
                                ) : timeVal ? (
                                  <span className="text-[9px] leading-tight text-center font-bold">
                                    {timeVal.start}
                                    <br />
                                    {timeVal.end}
                                  </span>
                                ) : (
                                  SP_SHORT[key] || key
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Summary columns */}
                      <td className="py-2 px-1 text-right font-black text-blue-700 bg-blue-50/40 border-r border-gray-200 whitespace-nowrap">
                        {totalNetHours.toFixed(1)}h
                      </td>
                      <td className="py-2 px-1 text-right font-bold text-gray-700 bg-gray-50/50 border-r border-gray-200 whitespace-nowrap">
                        {avgWeekly}h
                      </td>
                      <td
                        className="py-2 px-1 text-right font-black whitespace-nowrap"
                        style={{
                          color:
                            parseFloat(fte) >= 1.0
                              ? '#059669'
                              : parseFloat(fte) >= 0.8
                              ? '#d97706'
                              : '#64748b',
                        }}
                      >
                        {fte}
                      </td>
                    </tr>
                  );
                };

                return ROLE_SECTIONS.flatMap((sec) => {
                  const secStaff = staff.filter(sec.matchFn);
                  return secStaff.map((s) => renderStaffRow(s, sec.key));
                });
              })()}

              {/* Staffing Ratio Check Row */}
              {fcType?.ratio && (
                <tr className="bg-gray-50/90 font-bold text-[11px] text-gray-600">
                  <td className="sticky left-0 bg-gray-100 border-r border-gray-200"></td>
                  <td colSpan={2} className="py-1 px-3 text-left sticky left-8 bg-gray-100 border-r-2 border-gray-200 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className="font-bold text-gray-900">📊 介護職比率 ({fcType.ratio}:1 要{ratioNeeded}名)</span>
                      <span className="text-[9px] text-indigo-700 font-semibold">※管理者・計画作成分は控除済</span>
                    </div>
                  </td>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const ratioRoles = fcType.ratioRoles && fcType.ratioRoles.length > 0 ? fcType.ratioRoles : ['介護職員'];
                    const careOnDuty = staff.reduce((sum, s) => {
                      const k = shifts[s.id]?.[d];
                      if (isWorkShift(k) || k === '明け') {
                        return sum + getStaffRoleAllocationRatio(s, ratioRoles);
                      }
                      return sum;
                    }, 0);
                    const ok = careOnDuty >= ratioNeeded - 0.001;
                    const dispVal = careOnDuty % 1 === 0 ? careOnDuty.toFixed(0) : careOnDuty.toFixed(1);

                    return (
                      <td
                        key={d}
                        onClick={() => {
                          if (!ok) {
                            setSelectedDayFilter(d);
                            setSelectedStaffFilter(null);
                            setShowAlertModal(true);
                          }
                        }}
                        className={`border-r border-gray-200 text-center font-black ${
                          ok
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer'
                        }`}
                        title={`${d}日: 実働介護職員 ${careOnDuty.toFixed(1)}名 / 基準必要 ${ratioNeeded}名 (※管理者・計画作成分控除後) ${!ok ? '(不足 ! クリックで詳細表示)' : ''}`}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <span>{dispVal}/{ratioNeeded}</span>
                          {!ok && (
                            <span className="w-3.5 h-3.5 rounded-full bg-red-600 text-white text-[9px] font-black inline-flex items-center justify-center shrink-0">
                              !
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td colSpan={3} className="bg-gray-100"></td>
                </tr>
              )}

              {/* 24h Coverage Check Row */}
              {fcType?.nightRequired && (
                <tr className="bg-gray-50/90 font-bold text-[11px] text-gray-600">
                  <td className="sticky left-0 bg-gray-100 border-r border-gray-200"></td>
                  <td colSpan={2} className="py-1 px-3 text-left sticky left-8 bg-gray-100 border-r-2 border-gray-200 whitespace-nowrap">
                    🌙 24h常駐チェック
                  </td>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const coverage = new Array(24).fill(false);
                    staff.forEach((s) => {
                      const k = shifts[s.id]?.[d];
                      const range = getShiftTimeRange(k, s.facilityId, shiftPatterns);
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
                      if (d > 1) {
                        const prevK = shifts[s.id]?.[d - 1];
                        const prevRange = getShiftTimeRange(prevK, s.facilityId, shiftPatterns);
                        if (prevRange) {
                          const prevSMin = timeToMinutes(prevRange.start);
                          const prevEMin = timeToMinutes(prevRange.end);
                          if (prevEMin <= prevSMin) {
                            for (let h = 0; h < Math.ceil(prevEMin / 60); h++) coverage[h] = true;
                          }
                        }
                      }
                    });

                    const allCovered = coverage.every(Boolean);

                    return (
                      <td
                        key={d}
                        onClick={() => {
                          if (!allCovered) {
                            setSelectedDayFilter(d);
                            setSelectedStaffFilter(null);
                            setShowAlertModal(true);
                          }
                        }}
                        className={`border-r border-gray-200 text-center font-black ${
                          allCovered
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer'
                        }`}
                        title={allCovered ? `${d}日: 24h全時間帯カバー済` : `${d}日: 空白時間帯あり (クリックで詳細表示 !)`}
                      >
                        {allCovered ? (
                          '✅'
                        ) : (
                          <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-black inline-flex items-center justify-center shrink-0 shadow-2xs">
                            !
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td colSpan={3} className="bg-gray-100"></td>
                </tr>
              )}

              {/* FTE Total Row */}
              <tr className="bg-purple-50/90 font-black text-xs text-purple-950 border-t-2 border-purple-200">
                <td className="sticky left-0 bg-purple-50 border-r border-gray-200"></td>
                <td colSpan={2} className="py-2 px-3 text-left sticky left-8 bg-purple-50 border-r-2 border-purple-200 whitespace-nowrap">
                  📊 常勤換算（FTE）合計
                </td>
                <td colSpan={days} className="border-r border-gray-200 text-center font-bold text-gray-500 text-[11px] bg-white">
                  （全職員合計）
                </td>
                <td className="py-2 px-1 text-right font-black text-blue-700 bg-blue-50/60 border-r border-gray-200 whitespace-nowrap">
                  {staff.reduce((sum, s) => {
                    const sTotalH = Object.entries(shifts[s.id] || {}).reduce((hSum, [dStr, k]) => {
                      const d = parseInt(dStr, 10);
                      return hSum + getStaffDayNetH(s.id, d, k, s.facilityId, shiftPatterns, parsedRules);
                    }, 0);
                    return sum + sTotalH;
                  }, 0).toFixed(1)}h
                </td>
                <td className="py-2 px-1 text-right font-bold text-gray-700 bg-gray-50/60 border-r border-gray-200 whitespace-nowrap">
                  -
                </td>
                <td className="py-2 px-2 text-right font-black text-purple-700 bg-purple-100 whitespace-nowrap text-sm">
                  {staff.reduce((sum, s) => {
                    const sTotalH = Object.entries(shifts[s.id] || {}).reduce((hSum, [dStr, k]) => {
                      const d = parseInt(dStr, 10);
                      return hSum + getStaffDayNetH(s.id, d, k, s.facilityId, shiftPatterns, parsedRules);
                    }, 0);
                    return sum + parseFloat(calcFTE(sTotalH, days));
                  }, 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Popover / Modal for selecting shift on cell click (Pattern or Custom Time) */}
      {popTarget && currentTargetStaff && (() => {
        const curKey = shifts[popTarget.staffId]?.[popTarget.day] || '公休';
        const curTv = curKey.startsWith('time:') ? parseTimeVal(curKey) : null;
        const curPat = !curTv ? getPatternByKey(curKey, currentTargetStaff.facilityId, shiftPatterns) : null;

        const sMin = timeToMinutes(customStart || '09:00');
        const eMin = timeToMinutes(customEnd || '18:00');
        const customGross = (eMin > sMin ? eMin - sMin : 1440 - sMin + eMin) / 60;
        const customBreak = breakTime(customGross);
        const customNet = Math.max(0, customGross - customBreak);
        const isOvernight = eMin <= sMin;

        const QUICK_TIME_PRESETS = [
          { label: '午前短時間', start: '09:00', end: '13:00', hours: '4.0h', tag: '休憩無' },
          { label: '午後短時間', start: '13:00', end: '17:00', hours: '4.0h', tag: '休憩無' },
          { label: '昼間パート', start: '10:00', end: '15:00', hours: '4.25h', tag: '休45分' },
          { label: '夕方支援', start: '16:00', end: '20:00', hours: '4.0h', tag: '休憩無' },
          { label: '時短勤務', start: '09:00', end: '16:00', hours: '6.25h', tag: '休45分' },
          { label: '標準日勤', start: '08:30', end: '17:30', hours: '8.0h', tag: '休1時間' },
          { label: 'フル日勤', start: '09:00', end: '18:00', hours: '8.0h', tag: '休1時間' },
          { label: '夜勤シフト', start: '17:00', end: '09:00', hours: '15.0h', tag: '休1時間' },
        ];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h4 className="font-bold text-gray-900 text-base">
                    {currentTargetStaff.name} のシフト変更
                  </h4>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {month}月{popTarget.day}日 ({dayOfWeekName(year, month, popTarget.day)})
                  </div>
                </div>
                <button
                  onClick={() => setPopTarget(null)}
                  className="p-1 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Current Shift Banner */}
              <div className="mt-3 p-2.5 bg-gray-50 rounded-xl border border-gray-200 text-xs flex items-center justify-between">
                <span className="text-gray-500 font-medium">現在の設定:</span>
                <div className="font-bold">
                  {curTv ? (
                    <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      ⏰ 時間指定 {curTv.start}〜{curTv.end} ({getTimeKeyHours(curKey).toFixed(1)}h)
                    </span>
                  ) : curPat ? (
                    <span
                      className="px-2 py-0.5 rounded border"
                      style={{
                        backgroundColor: `${curPat.color}15`,
                        borderColor: curPat.color,
                        color: curPat.color,
                      }}
                    >
                      [{curPat.key}] {curPat.name} ({netHours(curPat).toFixed(1)}h)
                    </span>
                  ) : (
                    <span
                      className="px-2 py-0.5 rounded border"
                      style={{
                        backgroundColor: `${SP_COLOR[curKey] || '#e2e8f0'}20`,
                        borderColor: SP_COLOR[curKey] || '#cbd5e1',
                        color: SP_TEXT_COLOR[curKey] === '#ffffff' ? '#047857' : SP_TEXT_COLOR[curKey] || '#475569',
                      }}
                    >
                      {curKey} (0h)
                    </span>
                  )}
                </div>
              </div>

              {/* Mode Selector Tabs */}
              <div className="mt-3.5 flex bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setModalMode('pattern')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    modalMode === 'pattern'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span>📋 パターンから選択</span>
                </button>
                <button
                  type="button"
                  onClick={() => setModalMode('time')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    modalMode === 'time'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>⏰ 時間指定で変更</span>
                </button>
              </div>

              {/* Tab 1: Pattern Selector */}
              {modalMode === 'pattern' && (
                <div className="mt-3.5 space-y-3">
                  <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                    シフトパターンから選択
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {currentTargetStaffPats.map((p) => {
                      const nH = netHours(p);
                      const isCur = curKey === p.key;
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleSelectShift(p.key)}
                          className={`p-2.5 rounded-xl border text-left font-bold text-xs flex items-center justify-between transition cursor-pointer hover:scale-[1.02] ${
                            isCur ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                          }`}
                          style={{
                            backgroundColor: `${p.color}15`,
                            borderColor: p.color,
                            color: p.color,
                          }}
                        >
                          <span className="truncate">
                            [{p.key}] {p.name}
                          </span>
                          <span className="text-[10px] opacity-80 shrink-0 ml-1">
                            {nH.toFixed(1)}h
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setModalMode('time')}
                    className="w-full p-2.5 rounded-xl border border-dashed border-purple-300 bg-purple-50/60 hover:bg-purple-100 text-purple-700 text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Clock className="w-4 h-4 text-purple-600" />
                    <span>時短・変則時間（個別開始/終了時間）を指定する →</span>
                  </button>
                </div>
              )}

              {/* Tab 2: Custom Time Selector */}
              {modalMode === 'time' && (
                <div className="mt-3.5 space-y-3.5">
                  <div className="p-3.5 bg-gradient-to-br from-purple-50/70 to-indigo-50/70 border border-purple-200 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-purple-600" />
                      <span>勤務開始・終了時間の指定</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          開始時間
                        </label>
                        <input
                          type="time"
                          value={customStart}
                          onChange={(e) => setCustomStart(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white font-bold text-sm text-gray-900 focus:outline-hidden focus:border-purple-600 shadow-2xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                          終了時間
                        </label>
                        <input
                          type="time"
                          value={customEnd}
                          onChange={(e) => setCustomEnd(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-purple-200 bg-white font-bold text-sm text-gray-900 focus:outline-hidden focus:border-purple-600 shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Live Calculation Preview */}
                    <div className="bg-white rounded-lg p-2.5 border border-purple-100 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-gray-500 text-[10px]">総拘束: </span>
                        <span className="font-bold text-gray-800">{customGross.toFixed(1)}h</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px]">法定休憩: </span>
                        <span className="font-bold text-amber-700">
                          {customBreak > 0 ? `${customBreak * 60}分 (${customBreak}h)` : 'なし (0h)'}
                        </span>
                      </div>
                      <div className="bg-purple-100 px-2 py-1 rounded text-purple-900 font-black">
                        実働 {customNet.toFixed(2)}h
                      </div>
                    </div>

                    {isOvernight && (
                      <div className="text-[11px] text-indigo-700 font-bold bg-indigo-50 p-2 rounded-lg border border-indigo-100 flex items-center gap-1.5">
                        <span>🌙 翌日をまたぐ夜勤シフトとして24h稼働・実労働時間を計算します</span>
                      </div>
                    )}

                    {/* Apply Button */}
                    <button
                      type="button"
                      onClick={() => handleSelectShift(`time:${customStart}-${customEnd}`)}
                      className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Clock className="w-4 h-4" />
                      <span>この時間（{customStart}〜{customEnd}：実働{customNet.toFixed(2)}h）で確定</span>
                    </button>
                  </div>

                  {/* Quick Presets */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-gray-500">
                      よく使われる時短・パート枠（ワンタップ入力）:
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {QUICK_TIME_PRESETS.map((qp) => (
                        <button
                          key={qp.label}
                          type="button"
                          onClick={() => {
                            setCustomStart(qp.start);
                            setCustomEnd(qp.end);
                          }}
                          className="p-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-purple-50 hover:border-purple-300 text-left transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between font-bold text-[11px] text-gray-800">
                            <span>{qp.label}</span>
                            <span className="text-[10px] text-purple-700 font-extrabold">{qp.hours}</span>
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {qp.start}〜{qp.end} ({qp.tag})
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Special Shifts (Holidays/Leaves) */}
              <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
                <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                  固定休暇・公休・明け
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {SPECIAL_SHIFTS.map((sp) => (
                    <button
                      key={sp}
                      onClick={() => handleSelectShift(sp)}
                      className={`p-2 rounded-xl border text-center font-bold text-xs transition cursor-pointer hover:scale-[1.02] ${
                        curKey === sp ? 'ring-2 ring-gray-400 ring-offset-1' : ''
                      }`}
                      style={{
                        backgroundColor: `${SP_COLOR[sp]}20`,
                        borderColor: SP_COLOR[sp],
                        color: SP_TEXT_COLOR[sp] === '#ffffff' ? '#047857' : SP_TEXT_COLOR[sp],
                      }}
                    >
                      {sp}
                    </button>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setPopTarget(null)}
                  className="px-4 py-1.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-bold cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Error & Alert Details Modal (!) */}
      {showAlertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-800 font-black">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                    <span>シフト表のエラー・警告詳細</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-800">
                      {activeAlerts.length}件のアラート
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    労働基準法・36協定・介護保険人員配置基準・相性設定の診断結果
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAlertModal(false);
                  setSelectedDayFilter(null);
                  setSelectedStaffFilter(null);
                }}
                className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Badges if triggered by specific day or staff */}
            {(selectedDayFilter !== null || selectedStaffFilter !== null) && (
              <div className="mt-3.5 p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-blue-900">
                  <span>絞り込み中:</span>
                  {selectedDayFilter !== null && (
                    <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-black">
                      {month}月{selectedDayFilter}日のエラー
                    </span>
                  )}
                  {selectedStaffFilter !== null && (
                    <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-black">
                      {staff.find((s) => s.id === selectedStaffFilter)?.name} さんのエラー
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayFilter(null);
                    setSelectedStaffFilter(null);
                  }}
                  className="text-blue-700 font-bold hover:underline cursor-pointer"
                >
                  全表示に戻す
                </button>
              </div>
            )}

            {/* Alert List */}
            <div className="mt-4 space-y-3">
              {(() => {
                let displayAlerts = activeAlerts;

                if (selectedDayFilter !== null) {
                  const dayRes = getDayAlerts(selectedDayFilter);
                  displayAlerts =
                    dayRes.length > 0
                      ? dayRes.map((r) => ({ type: r.type, message: r.message }))
                      : activeAlerts.filter(
                          (a) =>
                            a.message.includes(`${month}/${selectedDayFilter}`) ||
                            a.message.includes(`${month}月${selectedDayFilter}日`)
                        );
                } else if (selectedStaffFilter !== null) {
                  const sMem = staff.find((s) => s.id === selectedStaffFilter);
                  if (sMem) {
                    displayAlerts = activeAlerts.filter((a) => a.message.includes(sMem.name));
                  }
                }

                if (displayAlerts.length === 0) {
                  return (
                    <div className="p-6 text-center bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-800 text-xs font-bold space-y-1">
                      <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                      <div className="text-sm font-extrabold">該当するエラー・警告はありません</div>
                      <p className="text-emerald-700 font-normal">
                        選択された条件（日付・職員）における法令・人員基準の指摘事項はありません。
                      </p>
                    </div>
                  );
                }

                return displayAlerts.map((al, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border text-xs sm:text-sm font-medium transition ${
                      al.type === 'danger'
                        ? 'bg-red-50/80 border-red-200 text-red-950'
                        : 'bg-amber-50/80 border-amber-200 text-amber-950'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg shrink-0 mt-0.5">
                        {al.type === 'danger' ? '🔴' : '⚠️'}
                      </span>
                      <div className="space-y-1 flex-1">
                        <div className="font-bold text-gray-900 leading-snug">
                          {al.message}
                        </div>
                        <div className="text-xs text-gray-600 pt-1 border-t border-gray-200/60 mt-1 flex items-center justify-between">
                          <span>
                            {al.type === 'danger'
                              ? '🚨 種別: 指定基準・配置不可違反 (即時要修正)'
                              : '⚠️ 種別: 労働基準・36協定・連勤の注意勧告'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Resolution Suggestions */}
            <div className="mt-5 p-4 rounded-xl bg-purple-50 border border-purple-200 text-xs text-purple-900 space-y-2">
              <div className="font-extrabold flex items-center gap-1.5 text-purple-950">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>💡 エラー解消・修正のためのワンポイントガイド</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-purple-800 font-medium">
                <li>
                  <strong>「シフト再生成」を実行</strong>: 固定ロック（🔒）以外のシフトをAIアルゴリズムで再計算し、衝突や不足を自動回避します。
                </li>
                <li>
                  <strong>手動セル変更</strong>: シフト表のマス目を直接クリックして「公休」や「希望休」「時間指定」に変更できます。
                </li>
                <li>
                  <strong>コンプライアンス監査</strong>: 上部メニュー『コンプライアンス』タブで36協定・常勤換算の全詳細を確認できます。
                </li>
              </ul>
            </div>

            {/* Footer buttons */}
            <div className="mt-6 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAlertModal(false);
                  onNavigateTab('check');
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-xs transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>コンプライアンス詳細タブへ</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleQuickReGenerate();
                    setShowAlertModal(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>シフト再生成で自動解消</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAlertModal(false);
                    setSelectedDayFilter(null);
                    setSelectedStaffFilter(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Staff Month Batch Edit Modal */}
      {staffBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {staffBatchModal.name} の月間シフト一括編集画面
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {year}年{month}月のすべての日のシフトを一括で確認・編集できます。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStaffBatchModal(null)}
                className="p-1 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Batch Fill Actions */}
            <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-purple-900">一括パターン適用:</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const defaultDay = shiftPatterns[0]?.key || '日勤';
                    onUpdateState((prev) => {
                      const cur = { ...(prev.shifts[staffBatchModal.id] || {}) };
                      for (let d = 1; d <= days; d++) {
                        const dow = new Date(year, month - 1, d).getDay();
                        if (dow >= 1 && dow <= 5) cur[d] = defaultDay;
                      }
                      return { ...prev, shifts: { ...prev.shifts, [staffBatchModal.id]: cur } };
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-purple-300 text-purple-800 font-bold hover:bg-purple-100 transition cursor-pointer"
                >
                  平日をすべて「{shiftPatterns[0]?.key || '日勤'}」にする
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateState((prev) => {
                      const cur = { ...(prev.shifts[staffBatchModal.id] || {}) };
                      for (let d = 1; d <= days; d++) {
                        const dow = new Date(year, month - 1, d).getDay();
                        if (dow === 0 || dow === 6) cur[d] = '公休';
                      }
                      return { ...prev, shifts: { ...prev.shifts, [staffBatchModal.id]: cur } };
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-purple-300 text-purple-800 font-bold hover:bg-purple-100 transition cursor-pointer"
                >
                  土日をすべて「公休」にする
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateState((prev) => {
                      const cur = { ...(prev.shifts[staffBatchModal.id] || {}) };
                      for (let d = 1; d <= days; d++) {
                        cur[d] = '公休';
                      }
                      return { ...prev, shifts: { ...prev.shifts, [staffBatchModal.id]: cur } };
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition cursor-pointer"
                >
                  全日を「公休」にクリア
                </button>
              </div>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                const curVal = shifts[staffBatchModal.id]?.[d] || '公休';
                const dClass = dayOfWeekClass(year, month, d);
                return (
                  <div
                    key={d}
                    className="p-2.5 rounded-xl border border-gray-200 bg-gray-50/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span
                        className={
                          dClass === 'sun'
                            ? 'text-red-600'
                            : dClass === 'sat'
                            ? 'text-blue-600'
                            : 'text-gray-700'
                        }
                      >
                        {d}日 ({dayOfWeekName(year, month, d)})
                      </span>
                    </div>
                    <select
                      value={curVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        onUpdateState((prev) => {
                          const cur = { ...(prev.shifts[staffBatchModal.id] || {}) };
                          cur[d] = val;
                          return {
                            ...prev,
                            shifts: {
                              ...prev.shifts,
                              [staffBatchModal.id]: cur,
                            },
                          };
                        });
                      }}
                      className="w-full px-2 py-1 rounded-lg border border-gray-300 text-xs font-bold bg-white focus:border-purple-600 outline-hidden"
                    >
                      {shiftPatterns.map((p) => (
                        <option key={p.id} value={p.key}>
                          [{p.key}] {p.name}
                        </option>
                      ))}
                      {SPECIAL_SHIFTS.map((sp) => (
                        <option key={sp} value={sp}>
                          {sp}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setStaffBatchModal(null)}
                className="px-6 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                編集を完了して閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Batch Edit Modal */}
      {dayBatchModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700 font-black">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {month}月{dayBatchModal}日（{dayOfWeekName(year, month, dayBatchModal)}）の全職員シフト一括編集画面
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    この日の出勤・休暇スタッフの配置を一覧で調整できます。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDayBatchModal(null)}
                className="p-1 rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Staff list on this day */}
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl overflow-hidden">
              {staff.map((s) => {
                const curVal = shifts[s.id]?.[dayBatchModal] || '公休';
                return (
                  <div
                    key={s.id}
                    className="p-3 bg-white hover:bg-gray-50 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="w-48 truncate">
                      <div className="font-bold text-gray-900">{s.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {(Array.isArray(s.roles) ? s.roles : [s.role]).join(', ')} / {s.type}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <select
                        value={curVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          onUpdateState((prev) => {
                            const cur = { ...(prev.shifts[s.id] || {}) };
                            cur[dayBatchModal] = val;
                            return {
                              ...prev,
                              shifts: {
                                ...prev.shifts,
                                [s.id]: cur,
                              },
                            };
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-300 font-bold text-xs bg-white focus:border-purple-600 outline-hidden"
                      >
                        {shiftPatterns.map((p) => (
                          <option key={p.id} value={p.key}>
                            [{p.key}] {p.name}
                          </option>
                        ))}
                        {SPECIAL_SHIFTS.map((sp) => (
                          <option key={sp} value={sp}>
                            {sp}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDayBatchModal(null)}
                className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                編集を完了して閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
