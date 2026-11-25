import React, { useState } from 'react';
import { AppState } from '../../types';
import {
  daysInMonth,
  dayOfWeekIdx,
  dayOfWeekName,
  dayOfWeekClass,
  parseTimeVal,
  getPatternByKey,
  isNight,
  isStaffWorkingOnFacilityDay,
} from '../../utils/shiftEngine';
import { exportPreferencesCSV, downloadPrefTemplate, parseCSV } from '../../utils/csvHelper';
import { Calendar, Download, Upload, FileText, Clock } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const PreferenceTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(state.staff[0]?.id ?? null);
  const [clickMode, setClickMode] = useState<'toggle' | 'preset' | 'pattern' | 'time'>('toggle');
  const [presetType, setPresetType] = useState<'有休' | '希望休' | '前休' | '後休'>('前休');
  const [selectedPatternKey, setSelectedPatternKey] = useState<string>(
    state.shiftPatterns[0]?.key || ''
  );
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('17:00');

  const { year, month, staff, preferences, shiftPatterns, facility } = state;
  const days = daysInMonth(year, month);

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);
  const staffPrefs = selectedStaffId ? preferences[selectedStaffId] || {} : {};
  const activePatternKey = shiftPatterns.some((p) => p.key === selectedPatternKey)
    ? selectedPatternKey
    : shiftPatterns[0]?.key || '';

  const handleCellClick = (d: number) => {
    if (!selectedStaffId) {
      alert('先に職員を選択してください');
      return;
    }

    onUpdateState((prev) => {
      const prevStaffPrefs = { ...(prev.preferences[selectedStaffId] || {}) };
      const prevStaffShifts = { ...(prev.shifts[selectedStaffId] || {}) };
      const targetStaff = prev.staff.find((s) => s.id === selectedStaffId);
      const facId = targetStaff?.facilityId ?? prev.facility.id;
      const oldVal = prevStaffPrefs[d];
      let nextVal: string | undefined = oldVal;

      if (clickMode === 'time') {
        if (oldVal && oldVal.startsWith('time:')) {
          delete prevStaffPrefs[d];
          nextVal = undefined;
        } else {
          nextVal = `time:${timeStart}-${timeEnd}`;
          prevStaffPrefs[d] = nextVal;
        }
      } else if (clickMode === 'preset') {
        if (oldVal === presetType) {
          delete prevStaffPrefs[d];
          nextVal = undefined;
        } else {
          nextVal = presetType;
          prevStaffPrefs[d] = nextVal;
        }
      } else if (clickMode === 'pattern') {
        const patKey = prev.shiftPatterns.some((p) => p.key === selectedPatternKey)
          ? selectedPatternKey
          : prev.shiftPatterns[0]?.key || '';
        if (!patKey) return prev;
        if (oldVal === patKey) {
          delete prevStaffPrefs[d];
          nextVal = undefined;
        } else {
          nextVal = patKey;
          prevStaffPrefs[d] = nextVal;
        }
      } else {
        // Toggle Cycle: none -> 有休 -> 希望休 -> 前休 -> 後休 -> none
        const cycle = [undefined, '有休', '希望休', '前休', '後休'];
        const safeVal = oldVal && oldVal.startsWith('time:') ? undefined : oldVal;
        const currentIdx = cycle.indexOf(safeVal);
        nextVal = cycle[(currentIdx + 1) % cycle.length];

        if (!nextVal) {
          delete prevStaffPrefs[d];
        } else {
          prevStaffPrefs[d] = nextVal;
        }
      }

      // 希望入力の内容をシフト表にも即座に反映する
      const totalDays = daysInMonth(prev.year, prev.month);
      const oldPat = oldVal ? getPatternByKey(oldVal, facId, prev.shiftPatterns) : undefined;
      const newPat = nextVal ? getPatternByKey(nextVal, facId, prev.shiftPatterns) : undefined;

      if (nextVal) {
        prevStaffShifts[d] = nextVal;
        if (newPat && isNight(newPat) && d + 1 <= totalDays && !prevStaffPrefs[d + 1]) {
          prevStaffShifts[d + 1] = '明け';
        }
      } else {
        if (prevStaffShifts[d] === oldVal) {
          prevStaffShifts[d] =
            targetStaff && !isStaffWorkingOnFacilityDay(targetStaff, prev.year, prev.month, d)
              ? '他事業所'
              : '公休';
        }
      }

      if (
        oldPat &&
        isNight(oldPat) &&
        (!newPat || !isNight(newPat)) &&
        d + 1 <= totalDays &&
        !prevStaffPrefs[d + 1] &&
        prevStaffShifts[d + 1] === '明け'
      ) {
        prevStaffShifts[d + 1] =
          targetStaff && !isStaffWorkingOnFacilityDay(targetStaff, prev.year, prev.month, d + 1)
            ? '他事業所'
            : '公休';
      }

      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          [selectedStaffId]: prevStaffPrefs,
        },
        shifts: {
          ...prev.shifts,
          [selectedStaffId]: prevStaffShifts,
        },
      };
    });
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          alert('CSVデータが見つかりません');
          return;
        }

        let added = 0;
        onUpdateState((prev) => {
          const newPrefs = { ...prev.preferences };
          const newShifts = { ...prev.shifts };
          const totalDays = daysInMonth(prev.year, prev.month);

          rows.slice(1).forEach((cols) => {
            const sName = cols[0]?.trim();
            const dateStr = cols[1]?.trim();
            const pType = cols[2]?.trim();

            if (!sName || !dateStr || !pType) return;

            const st = prev.staff.find((s) => s.name === sName);
            if (!st) return;

            const match = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
            if (!match) return;

            const dayNum = parseInt(match[3], 10);
            if (dayNum < 1 || dayNum > totalDays) return;

            const matchedPat = getPatternByKey(pType, st.facilityId, prev.shiftPatterns);
            const resolvedType = matchedPat ? matchedPat.key : pType;

            if (!newPrefs[st.id]) newPrefs[st.id] = {};
            newPrefs[st.id] = { ...newPrefs[st.id], [dayNum]: resolvedType };

            if (!newShifts[st.id]) newShifts[st.id] = {};
            newShifts[st.id] = { ...newShifts[st.id], [dayNum]: resolvedType };

            if (matchedPat && isNight(matchedPat) && dayNum + 1 <= totalDays && !newPrefs[st.id][dayNum + 1]) {
              newShifts[st.id][dayNum + 1] = '明け';
            }

            added++;
          });

          return { ...prev, preferences: newPrefs, shifts: newShifts };
        });

        alert(`✅ 希望休CSVインポート完了: ${added}件登録`);
      } catch (err: any) {
        alert(`インポートに失敗しました: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Compile all preferences for summary display
  const allPrefsList: Array<{ staffId: number; staffName: string; facilityId: number; day: number; type: string }> = [];
  staff.forEach((s) => {
    const sp = preferences[s.id] || {};
    Object.entries(sp).forEach(([dStr, val]) => {
      allPrefsList.push({
        staffId: s.id,
        staffName: s.name,
        facilityId: s.facilityId,
        day: parseInt(dStr, 10),
        type: val,
      });
    });
  });
  allPrefsList.sort((a, b) => a.day - b.day);

  // Month starting empty cells
  const firstDayDow = dayOfWeekIdx(year, month, 1);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-700" />
              <span>希望休・有休・個別勤務時間 入力</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              職員を選択して日付をクリック。有休・希望休・勤務パターンや勤務時間帯をワンクリックで設定（シフト表へ必ず反映されます）
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => exportPreferencesCSV(state)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>CSV出力</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>CSV取込</span>
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>

            <button
              onClick={() => downloadPrefTemplate(year, month)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>テンプレート</span>
            </button>
          </div>
        </div>

        {/* Staff Pill Selector */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            対象職員を選択：
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {staff.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedStaffId(s.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  selectedStaffId === s.id
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Click Mode Toggle */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-100/80 border border-slate-200 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-gray-700">カレンダークリック動作：</span>
            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-800">
              <input
                type="radio"
                name="prefClickMode"
                value="toggle"
                checked={clickMode === 'toggle'}
                onChange={() => setClickMode('toggle')}
                className="w-4 h-4 text-blue-600"
              />
              <span>順次切替（有休 → 希望休 → 前休 → 後休）</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-800">
              <input
                type="radio"
                name="prefClickMode"
                value="preset"
                checked={clickMode === 'preset'}
                onChange={() => setClickMode('preset')}
                className="w-4 h-4 text-blue-600"
              />
              <span>指定スタンプ</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-800">
              <input
                type="radio"
                name="prefClickMode"
                value="pattern"
                checked={clickMode === 'pattern'}
                onChange={() => setClickMode('pattern')}
                className="w-4 h-4 text-blue-600"
              />
              <span>シフトパターン指定</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-800">
              <input
                type="radio"
                name="prefClickMode"
                value="time"
                checked={clickMode === 'time'}
                onChange={() => setClickMode('time')}
                className="w-4 h-4 text-blue-600"
              />
              <span>時間帯指定（非常勤等の希望出勤枠）</span>
            </label>
          </div>

          {clickMode === 'preset' && (
            <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in">
              <span className="text-gray-500 font-bold">選択項目:</span>
              <button
                type="button"
                onClick={() => setPresetType('前休')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  presetType === '前休'
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-white text-teal-800 border-teal-300 hover:bg-teal-50'
                }`}
              >
                前休 (午前休・4h)
              </button>
              <button
                type="button"
                onClick={() => setPresetType('後休')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  presetType === '後休'
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-white text-sky-800 border-sky-300 hover:bg-sky-50'
                }`}
              >
                後休 (午後休・4h)
              </button>
              <button
                type="button"
                onClick={() => setPresetType('有休')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  presetType === '有休'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                有休
              </button>
              <button
                type="button"
                onClick={() => setPresetType('希望休')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                  presetType === '希望休'
                    ? 'bg-[#7d4a51] text-white border-[#7d4a51] shadow-xs'
                    : 'bg-white text-[#6b3a41] border-[#d4b8bd] hover:bg-[#f6eff0]'
                }`}
              >
                希望休
              </button>
            </div>
          )}

          {clickMode === 'pattern' && (
            <div className="flex flex-wrap items-center gap-1.5 animate-in fade-in w-full pt-2 border-t border-slate-200/80">
              <span className="text-gray-600 font-bold mr-1">シフトパターン:</span>
              {shiftPatterns.length === 0 ? (
                <span className="text-amber-700 font-semibold">
                  「シフト設定」タブでパターンが登録されていません
                </span>
              ) : (
                shiftPatterns.map((p) => {
                  const isSelected = activePatternKey === p.key;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setSelectedPatternKey(p.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5 shadow-2xs ${
                        isSelected
                          ? 'ring-2 ring-teal-700 ring-offset-1 scale-105 opacity-100'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: p.color, color: '#ffffff' }}
                    >
                      <span>{p.key}</span>
                      <span className="text-[10px] font-medium opacity-95">
                        ({p.name} {p.start}〜{p.end})
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {clickMode === 'time' && (
            <div className="flex items-center gap-2 animate-in fade-in">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <input
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="px-2 py-1 rounded-lg border border-gray-300 bg-white font-medium"
              />
              <span className="text-gray-400 font-bold">〜</span>
              <input
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="px-2 py-1 rounded-lg border border-gray-300 bg-white font-medium"
              />
            </div>
          )}
        </div>
      </div>

      {/* Interactive Calendar Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <span>📅</span>
            <span>{selectedStaff?.name || '職員未選択'} のシフト希望カレンダー</span>
            <span className="text-xs text-gray-500 font-normal">
              ({year}年{month}月)
            </span>
          </h3>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
                有
              </span>
              <span>有休</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-[#e4d0d3] text-[#6b3a41] border border-[#d4b8bd] text-[10px] font-black flex items-center justify-center">
                希
              </span>
              <span>希望休</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-teal-500 text-white text-[9px] font-black flex items-center justify-center">
                前
              </span>
              <span>前休(4h)</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-sky-500 text-white text-[9px] font-black flex items-center justify-center">
                後
              </span>
              <span>後休(4h)</span>
            </span>
            {shiftPatterns.map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1">
                <span
                  className="px-1 min-w-4 h-4 rounded text-white text-[10px] font-black flex items-center justify-center"
                  style={{ backgroundColor: p.color }}
                >
                  {p.key}
                </span>
                <span>{p.name}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-cyan-600 text-white text-[10px] font-black flex items-center justify-center">
                ⏰
              </span>
              <span>時間指定</span>
            </span>
          </div>
        </div>

        {/* 7-column Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {['日', '月', '火', '水', '木', '金', '土'].map((dName, idx) => (
            <div
              key={dName}
              className={`py-2 text-center font-bold uppercase ${
                idx === 0 ? 'text-red-600' : idx === 6 ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              {dName}
            </div>
          ))}

          {/* Empty cells before month day 1 */}
          {Array.from({ length: firstDayDow }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[70px] bg-slate-100/70 rounded-xl" />
          ))}

          {/* Month Days */}
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
            const dClass = dayOfWeekClass(year, month, d);
            const val = staffPrefs[d];
            const timeVal = val ? parseTimeVal(val) : null;
            const isMae = val === '前休' || val === '午前休';
            const isAto = val === '後休' || val === '午後休';
            const matchedPat =
              val && !timeVal && !isMae && !isAto && val !== '有休' && val !== '希望休'
                ? getPatternByKey(val, selectedStaff?.facilityId ?? facility.id, shiftPatterns)
                : undefined;

            let bgClass = 'bg-white hover:border-teal-400';
            if (val === '有休') bgClass = 'bg-emerald-100/75 border-emerald-300';
            else if (val === '希望休') bgClass = 'bg-[#f5ecee] border-[#d4b8bd]';
            else if (isMae) bgClass = 'bg-teal-100/75 border-teal-300';
            else if (isAto) bgClass = 'bg-sky-100/75 border-sky-300';
            else if (timeVal) bgClass = 'bg-cyan-100/75 border-cyan-300';

            const cellStyle = matchedPat
              ? {
                  backgroundColor: `${matchedPat.color}18`,
                  borderColor: `${matchedPat.color}88`,
                }
              : undefined;

            return (
              <div
                key={d}
                onClick={() => handleCellClick(d)}
                style={cellStyle}
                className={`min-h-[70px] p-2 rounded-xl border border-slate-200 transition-all cursor-pointer flex flex-col justify-between ${bgClass}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-bold ${
                      dClass === 'sun'
                        ? 'text-red-600'
                        : dClass === 'sat'
                        ? 'text-blue-600'
                        : 'text-gray-700'
                    }`}
                  >
                    {d}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {dayOfWeekName(year, month, d)}
                  </span>
                </div>

                <div className="mt-1">
                  {val === '有休' && (
                    <div className="px-2 py-0.5 rounded-md bg-emerald-500 text-white font-black text-center text-xs">
                      有給休暇
                    </div>
                  )}
                  {val === '希望休' && (
                    <div className="px-2 py-0.5 rounded-md bg-[#e4d0d3] text-[#6b3a41] border border-[#d4b8bd] font-black text-center text-xs">
                      希望休
                    </div>
                  )}
                  {isMae && (
                    <div className="px-2 py-0.5 rounded-md bg-teal-600 text-white font-black text-center text-xs">
                      前休 (4h)
                    </div>
                  )}
                  {isAto && (
                    <div className="px-2 py-0.5 rounded-md bg-sky-600 text-white font-black text-center text-xs">
                      後休 (4h)
                    </div>
                  )}
                  {matchedPat && (
                    <div
                      className="px-1.5 py-0.5 rounded-md text-white font-black text-center text-xs shadow-2xs"
                      style={{ backgroundColor: matchedPat.color }}
                    >
                      <div className="truncate">
                        {matchedPat.key} ({matchedPat.name})
                      </div>
                      <div className="text-[9px] font-bold opacity-90 leading-tight">
                        {matchedPat.start}〜{matchedPat.end}
                      </div>
                    </div>
                  )}
                  {!matchedPat &&
                    val &&
                    val !== '有休' &&
                    val !== '希望休' &&
                    !isMae &&
                    !isAto &&
                    !timeVal && (
                      <div className="px-2 py-0.5 rounded-md bg-slate-600 text-white font-black text-center text-xs">
                        {val}
                      </div>
                    )}
                  {timeVal && (
                    <div className="px-1.5 py-0.5 rounded-md bg-cyan-600 text-white font-bold text-center text-[10px]">
                      {timeVal.start}〜{timeVal.end}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary List of registered preferences */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">
          📝 登録済み希望一覧（全職員・{allPrefsList.length}件）
        </h3>
        {allPrefsList.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">登録された希望はありません</div>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {allPrefsList.map((p, idx) => {
              const isMae = p.type === '前休' || p.type === '午前休';
              const isAto = p.type === '後休' || p.type === '午後休';
              const matchedPat =
                !isMae && !isAto && p.type !== '有休' && p.type !== '希望休' && !p.type.startsWith('time:')
                  ? getPatternByKey(p.type, p.facilityId, shiftPatterns)
                  : undefined;

              let badgeClass = 'bg-cyan-100 text-cyan-800';
              if (p.type === '有休') badgeClass = 'bg-emerald-100 text-emerald-800';
              else if (p.type === '希望休') badgeClass = 'bg-[#f0e3e5] text-[#6b3a41]';
              else if (isMae) badgeClass = 'bg-teal-100 text-teal-800';
              else if (isAto) badgeClass = 'bg-sky-100 text-sky-800';

              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setSelectedStaffId(p.staffId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-800 transition cursor-pointer"
                >
                  <span>{p.staffName}</span>
                  <span className="text-gray-400">({month}/{p.day}日)</span>
                  {matchedPat ? (
                    <span
                      className="px-1.5 py-0.5 rounded-md font-bold text-[11px] text-white"
                      style={{ backgroundColor: matchedPat.color }}
                    >
                      {matchedPat.key} ({matchedPat.name})
                    </span>
                  ) : (
                    <span className={`px-1.5 py-0.5 rounded-md font-bold text-[11px] ${badgeClass}`}>
                      {isMae ? '前休 (4h)' : isAto ? '後休 (4h)' : p.type}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

