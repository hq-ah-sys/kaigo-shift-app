import React, { useState } from 'react';
import { AppState } from '../../types';
import { daysInMonth, dayOfWeekIdx, dayOfWeekName, dayOfWeekClass, parseTimeVal } from '../../utils/shiftEngine';
import { exportPreferencesCSV, downloadPrefTemplate, parseCSV } from '../../utils/csvHelper';
import { Calendar, Download, Upload, FileText, Clock, Trash2 } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const PreferenceTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(state.staff[0]?.id ?? null);
  const [clickMode, setClickMode] = useState<'toggle' | 'time'>('toggle');
  const [timeStart, setTimeStart] = useState('09:00');
  const [timeEnd, setTimeEnd] = useState('17:00');

  const { year, month, staff, preferences } = state;
  const days = daysInMonth(year, month);

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);
  const staffPrefs = selectedStaffId ? preferences[selectedStaffId] || {} : {};

  const handleCellClick = (d: number) => {
    if (!selectedStaffId) {
      alert('先に職員を選択してください');
      return;
    }

    onUpdateState((prev) => {
      const prevStaffPrefs = { ...(prev.preferences[selectedStaffId] || {}) };

      if (clickMode === 'time') {
        const cur = prevStaffPrefs[d];
        if (cur && cur.startsWith('time:')) {
          delete prevStaffPrefs[d];
        } else {
          prevStaffPrefs[d] = `time:${timeStart}-${timeEnd}`;
        }
      } else {
        // Toggle Cycle: none -> 有休 -> 希望休 -> none
        const cycle = [undefined, '有休', '希望休'];
        const currentVal = prevStaffPrefs[d];
        const safeVal = currentVal && currentVal.startsWith('time:') ? undefined : currentVal;
        const currentIdx = cycle.indexOf(safeVal);
        const nextVal = cycle[(currentIdx + 1) % cycle.length];

        if (!nextVal) {
          delete prevStaffPrefs[d];
        } else {
          prevStaffPrefs[d] = nextVal;
        }
      }

      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          [selectedStaffId]: prevStaffPrefs,
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
            if (!newPrefs[st.id]) newPrefs[st.id] = {};
            newPrefs[st.id][dayNum] = pType;
            added++;
          });

          return { ...prev, preferences: newPrefs };
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
  const allPrefsList: Array<{ staffName: string; day: number; type: string }> = [];
  staff.forEach((s) => {
    const sp = preferences[s.id] || {};
    Object.entries(sp).forEach(([dStr, val]) => {
      allPrefsList.push({
        staffName: s.name,
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
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>希望休・有休・個別勤務時間 入力</span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              職員を選択して日付をクリック。有休・希望休や勤務時間帯をワンクリックで設定
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
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Click Mode Toggle */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs">
          <div className="flex items-center gap-3">
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
              <span>休日切替（有休 → 希望休）</span>
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
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
            <span>📅</span>
            <span>{selectedStaff?.name || '職員未選択'} のシフト希望カレンダー</span>
            <span className="text-xs text-gray-500 font-normal">
              ({year}年{month}月)
            </span>
          </h3>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-emerald-500 text-white text-[10px] font-black flex items-center justify-center">
                有
              </span>
              <span>有休</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-amber-400 text-amber-900 text-[10px] font-black flex items-center justify-center">
                希
              </span>
              <span>希望休</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-4 h-4 rounded bg-purple-600 text-white text-[10px] font-black flex items-center justify-center">
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
            <div key={`empty-${i}`} className="min-h-[70px] bg-gray-50/50 rounded-xl" />
          ))}

          {/* Month Days */}
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
            const dClass = dayOfWeekClass(year, month, d);
            const val = staffPrefs[d];
            const timeVal = val ? parseTimeVal(val) : null;

            let bgClass = 'bg-white hover:border-blue-400';
            if (val === '有休') bgClass = 'bg-emerald-50 border-emerald-300';
            else if (val === '希望休') bgClass = 'bg-amber-50 border-amber-300';
            else if (timeVal) bgClass = 'bg-purple-50 border-purple-300';

            return (
              <div
                key={d}
                onClick={() => handleCellClick(d)}
                className={`min-h-[70px] p-2 rounded-xl border border-gray-200 transition-all cursor-pointer flex flex-col justify-between ${bgClass}`}
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
                    <div className="px-2 py-0.5 rounded-md bg-amber-400 text-amber-900 font-black text-center text-xs">
                      希望休
                    </div>
                  )}
                  {timeVal && (
                    <div className="px-1.5 py-0.5 rounded-md bg-purple-600 text-white font-bold text-center text-[10px]">
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
            {allPrefsList.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-800"
              >
                <span>{p.staffName}</span>
                <span className="text-gray-400">({month}/{p.day}日)</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md font-bold text-[11px] ${
                    p.type === '有休'
                      ? 'bg-emerald-100 text-emerald-800'
                      : p.type === '希望休'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {p.type}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
