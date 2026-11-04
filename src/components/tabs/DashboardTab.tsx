import React from 'react';
import { AppState } from '../../types';
import { daysInMonth, getStaffDayNetH, isWorkShift } from '../../utils/shiftEngine';
import { collectDashboardAlerts, computeStaffSummaries } from '../../utils/complianceEngine';
import { MAT_STARS, MAT_COLOR, FACILITY_TYPES } from '../../constants';
import { Building2, Users, Clock, CalendarCheck, ShieldAlert, Award, FileSpreadsheet, Briefcase } from 'lucide-react';

interface Props {
  state: AppState;
  onNavigateTab: (tab: string) => void;
}

export const DashboardTab: React.FC<Props> = ({ state, onNavigateTab }) => {
  const { year, month, staff, shifts, facility, shiftPatterns, parsedRules } = state;
  const days = daysInMonth(year, month);

  let totalWorkDays = 0;
  let totalPaidLeave = 0;
  let totalNetHours = 0;

  staff.forEach((s) => {
    for (let d = 1; d <= days; d++) {
      const k = shifts[s.id]?.[d] || '公休';
      if (isWorkShift(k)) {
        totalWorkDays++;
        totalNetHours += getStaffDayNetH(s.id, d, k, s.facilityId, shiftPatterns, parsedRules);
      }
      if (k === '有休') {
        totalPaidLeave++;
      }
    }
  });

  const summaries = computeStaffSummaries(state);
  const totalFTE = summaries.reduce((acc, s) => acc + parseFloat(s.fte), 0);
  const alerts = collectDashboardAlerts(state);

  // Skill distribution
  const matDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  staff.forEach((s) => {
    matDist[s.mat || 3] = (matDist[s.mat || 3] || 0) + 1;
  });

  // Role distribution for this facility
  const roleDist: Record<string, number> = {};
  staff.forEach((s) => {
    const roles = Array.isArray(s.roles) ? s.roles : [s.role];
    roles.forEach((r) => {
      roleDist[r] = (roleDist[r] || 0) + 1;
    });
  });

  const ft = FACILITY_TYPES.find((t) => t.id === facility.typeId);

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>事業所定員</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{facility.users}</div>
          <div className="text-xs text-gray-400 mt-0.5">{facility.name}</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>在籍職員数</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{staff.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">名</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>総出勤日数</span>
            <CalendarCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-2">{totalWorkDays}</div>
          <div className="text-xs text-gray-400 mt-0.5">延べ日数</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>総実労働時間</span>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-700 mt-2">{totalNetHours.toFixed(0)}</div>
          <div className="text-xs text-gray-400 mt-0.5">時間 (休憩控除済)</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>常勤換算</span>
            <Award className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-700 mt-2">{totalFTE.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-0.5">人換算</div>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase">
            <span>有休取得数</span>
            <FileSpreadsheet className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-2">{totalPaidLeave}</div>
          <div className="text-xs text-gray-400 mt-0.5">日</div>
        </div>
      </div>

      {/* Main Grid: Distribution & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Skill distribution */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>⭐</span>
              <span>職員スキル・成熟度分布</span>
            </h3>
            <button
              onClick={() => onNavigateTab('maturity')}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              詳細設定 →
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {[5, 4, 3, 2, 1].map((lv) => {
              const count = matDist[lv] || 0;
              const pct = staff.length > 0 ? Math.round((count / staff.length) * 100) : 0;
              return (
                <div key={lv} className="flex items-center gap-3 text-xs">
                  <div className="w-24 font-bold text-gray-700">{MAT_STARS[lv]}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: MAT_COLOR[lv] }}
                    />
                  </div>
                  <div className="w-16 text-right font-black" style={{ color: MAT_COLOR[lv] }}>
                    {count}名 ({pct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Role breakdown */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span>職種別 職員構成</span>
            </h3>
            <button
              onClick={() => onNavigateTab('staff')}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              職員マスタ →
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {Object.entries(roleDist).map(([roleName, count]) => {
              const pct = staff.length > 0 ? Math.round((count / staff.length) * 100) : 0;
              return (
                <div key={roleName} className="flex items-center gap-3 text-xs">
                  <div className="w-36 font-bold text-gray-800 truncate" title={roleName}>
                    {roleName}
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-16 text-right font-black text-blue-700">
                    {count}名
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Real-time Alerts */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-gray-900">労基法・人員基準・相性アラート</h3>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {year}年{month}月度
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {alerts.map((al, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-sm font-medium ${
                al.type === 'danger'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : al.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <span className="text-lg shrink-0">
                {al.type === 'danger' ? '🔴' : al.type === 'warning' ? '⚠️' : '✅'}
              </span>
              <div className="leading-relaxed">{al.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
