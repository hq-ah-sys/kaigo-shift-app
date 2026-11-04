import React, { useState } from 'react';
import { AppState } from '../../types';
import {
  daysInMonth,
  dayOfWeekName,
  dayOfWeekClass,
  isWorkShift,
  getStaffDayNetH,
} from '../../utils/shiftEngine';
import { MAT_COLOR, MAT_LABEL, MAT_STARS } from '../../constants';
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  state: AppState;
}

export const BalanceTab: React.FC<Props> = ({ state }) => {
  const { year, month, staff, shifts, facility, shiftPatterns, parsedRules } = state;
  const days = daysInMonth(year, month);

  const dailyStats: Array<{
    day: number;
    dow: string;
    dowClass: string;
    workingStaff: typeof staff;
    avgMat: number;
  }> = [];

  const balanceIssues: Array<{ day: number; message: string; severity: 'danger' | 'warning' }> = [];

  for (let d = 1; d <= days; d++) {
    const working = staff.filter((s) => isWorkShift(shifts[s.id]?.[d]));
    const avg =
      working.length > 0
        ? working.reduce((acc, s) => acc + (s.mat || 3), 0) / working.length
        : 0;

    dailyStats.push({
      day: d,
      dow: dayOfWeekName(year, month, d),
      dowClass: dayOfWeekClass(year, month, d),
      workingStaff: working,
      avgMat: avg,
    });

    if (working.length > 0) {
      if (!working.some((s) => (s.mat || 3) >= 4)) {
        balanceIssues.push({
          day: d,
          message: `${d}日: 上級・ベテラン職員（Lv.4以上）が出勤していません`,
          severity: 'warning',
        });
      }
      if (working.every((s) => (s.mat || 3) <= 2)) {
        balanceIssues.push({
          day: d,
          message: `${d}日: 全ての出勤職員が新人・初級レベル（Lv.2以下）です`,
          severity: 'danger',
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">スキルバランス分析</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                各日の出勤メンバーの経験値・スキルレベル構成を可視化し、新人偏重やリーダー不在を防止します
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Daily Balance Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
        <h3 className="font-bold text-gray-900 text-sm">日別スキルレベル構成バーチャート</h3>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
          {dailyStats.map((st) => {
            const hasWorkers = st.workingStaff.length > 0;
            return (
              <div key={st.day} className="flex items-center gap-3 text-xs">
                <div
                  className={`w-14 font-bold shrink-0 ${
                    st.dowClass === 'sun'
                      ? 'text-red-600'
                      : st.dowClass === 'sat'
                      ? 'text-blue-600'
                      : 'text-gray-600'
                  }`}
                >
                  {st.day}日 ({st.dow})
                </div>

                <div className="flex-1 bg-gray-100 rounded-lg h-6 flex overflow-hidden p-0.5 gap-0.5 border border-gray-200">
                  {hasWorkers ? (
                    st.workingStaff.map((ws, i) => (
                      <div
                        key={i}
                        className="h-full rounded-sm flex items-center justify-center font-black text-white text-[10px] transition-all"
                        style={{
                          flex: 1,
                          backgroundColor: MAT_COLOR[ws.mat || 3],
                        }}
                        title={`${ws.name} (Lv.${ws.mat || 3} ${MAT_LABEL[ws.mat || 3]})`}
                      >
                        {ws.mat || 3}
                      </div>
                    ))
                  ) : (
                    <div className="w-full text-center text-gray-400 text-[10px] leading-5">
                      出勤なし
                    </div>
                  )}
                </div>

                <div
                  className="w-24 text-right font-black shrink-0"
                  style={{
                    color:
                      st.avgMat >= 4
                        ? '#059669'
                        : st.avgMat >= 3
                        ? '#2563eb'
                        : st.avgMat >= 2
                        ? '#d97706'
                        : '#dc2626',
                  }}
                >
                  {hasWorkers ? `Avg ${st.avgMat.toFixed(1)}/5.0` : '-'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Issues Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">⚠️ スキルバランス注意喚起</h3>
        {balanceIssues.length === 0 ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>全ての出勤日で適切なスキルバランスとリーダー配置が保たれています ✅</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {balanceIssues.slice(0, 10).map((issue, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                  issue.severity === 'danger'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Staff Monthly Stats Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 font-bold text-sm text-gray-900">
          👤 職員別 月間出勤・労働時間集計
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">氏名</th>
                <th className="py-3 px-3">スキル</th>
                <th className="py-3 px-3 text-center">出勤日数</th>
                <th className="py-3 px-3 text-center">有休日数</th>
                <th className="py-3 px-3 text-center">総実労働時間</th>
                <th className="py-3 px-3 text-center">週平均時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {staff.map((s) => {
                let wCount = 0;
                let pCount = 0;
                let totH = 0;
                for (let d = 1; d <= days; d++) {
                  const k = shifts[s.id]?.[d] || '公休';
                  if (isWorkShift(k)) {
                    wCount++;
                    totH += getStaffDayNetH(s.id, d, k, s.facilityId, shiftPatterns, parsedRules);
                  }
                  if (k === '有休') pCount++;
                }

                const weeks = days / 7;
                const weekAvg = weeks > 0 ? (totH / weeks).toFixed(1) : '0.0';

                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="py-3 px-4 font-bold text-gray-900">{s.name}</td>
                    <td className="py-3 px-3 text-amber-600 font-bold">{MAT_STARS[s.mat || 3]}</td>
                    <td className="py-3 px-3 text-center font-bold text-gray-800">{wCount}日</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">{pCount}日</td>
                    <td className="py-3 px-3 text-center font-black text-blue-700">{totH.toFixed(1)}h</td>
                    <td className="py-3 px-3 text-center font-bold text-gray-700">{weekAvg}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
