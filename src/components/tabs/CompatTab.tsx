import React, { useState } from 'react';
import { AppState, Pair } from '../../types';
import { daysInMonth, isWorkShift } from '../../utils/shiftEngine';
import { HeartHandshake, UserX, UserCheck, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const CompatTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [pairA, setPairA] = useState<number>(state.staff[0]?.id ?? 1);
  const [pairB, setPairB] = useState<number>(state.staff[1]?.id ?? 2);

  const forbiddenPairs = state.pairs.filter((p) => p.type === 'forbidden');
  const recommendedPairs = state.pairs.filter((p) => p.type === 'recommended');

  const handleAddPair = (type: 'forbidden' | 'recommended') => {
    if (pairA === pairB) {
      alert('異なる職員を2名選択してください');
      return;
    }

    const exists = state.pairs.some(
      (p) => (p.a === pairA && p.b === pairB) || (p.a === pairB && p.b === pairA)
    );
    if (exists) {
      alert('この2名のペア設定は既に登録されています');
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      pairs: [...prev.pairs, { type, a: pairA, b: pairB }],
    }));
  };

  const handleRemovePair = (index: number) => {
    onUpdateState((prev) => {
      const copy = [...prev.pairs];
      copy.splice(index, 1);
      return { ...prev, pairs: copy };
    });
  };

  // Inspect active schedule for conflicts
  const days = daysInMonth(state.year, state.month);
  const conflicts: Array<{ day: number; saName: string; sbName: string }> = [];

  forbiddenPairs.forEach((p) => {
    const sa = state.staff.find((s) => s.id === p.a);
    const sb = state.staff.find((s) => s.id === p.b);
    if (!sa || !sb) return;

    for (let d = 1; d <= days; d++) {
      if (isWorkShift(state.shifts[sa.id]?.[d]) && isWorkShift(state.shifts[sb.id]?.[d])) {
        conflicts.push({ day: d, saName: sa.name, sbName: sb.name });
      }
    }
  });

  return (
    <div className="space-y-6">
      {/* Top Description */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-600">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">職員相性・ペア制約設定</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              人間関係や指導育成を考慮し、「同日勤務禁止」または「同日勤務推奨（OJT）」を設定できます
            </p>
          </div>
        </div>
      </div>

      {/* Grid: Forbidden vs Recommended */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Forbidden */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
              <UserX className="w-4 h-4" />
              <span>❌ 禁止ペア（同日出勤を回避）</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
              {forbiddenPairs.length}件
            </span>
          </div>

          <div className="space-y-2.5 min-h-[120px]">
            {forbiddenPairs.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">設定された禁止ペアはありません</div>
            ) : (
              forbiddenPairs.map((p) => {
                const globalIdx = state.pairs.indexOf(p);
                const sa = state.staff.find((s) => s.id === p.a);
                const sb = state.staff.find((s) => s.id === p.b);
                return (
                  <div
                    key={globalIdx}
                    className="flex items-center justify-between p-3 rounded-xl bg-red-50/70 border border-red-200 text-xs font-bold text-red-900"
                  >
                    <div className="flex items-center gap-2">
                      <span>{sa?.name || '不明'}</span>
                      <span className="text-red-400 font-normal">×</span>
                      <span>{sb?.name || '不明'}</span>
                    </div>
                    <button
                      onClick={() => handleRemovePair(globalIdx)}
                      className="p-1 rounded-md text-red-400 hover:bg-red-200 hover:text-red-700 transition"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recommended */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
              <UserCheck className="w-4 h-4" />
              <span>✅ 推奨ペア（OJT・相乗効果で同日勤務推奨）</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
              {recommendedPairs.length}件
            </span>
          </div>

          <div className="space-y-2.5 min-h-[120px]">
            {recommendedPairs.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">設定された推奨ペアはありません</div>
            ) : (
              recommendedPairs.map((p) => {
                const globalIdx = state.pairs.indexOf(p);
                const sa = state.staff.find((s) => s.id === p.a);
                const sb = state.staff.find((s) => s.id === p.b);
                return (
                  <div
                    key={globalIdx}
                    className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs font-bold text-emerald-900"
                  >
                    <div className="flex items-center gap-2">
                      <span>{sa?.name || '不明'}</span>
                      <span className="text-emerald-500 font-normal">＋</span>
                      <span>{sb?.name || '不明'}</span>
                      <span className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-md font-semibold">
                        OJT
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemovePair(globalIdx)}
                      className="p-1 rounded-md text-emerald-400 hover:bg-emerald-200 hover:text-emerald-700 transition"
                      title="削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Add Pair Form */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">＋ ペアの追加登録</h3>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={pairA}
            onChange={(e) => setPairA(parseInt(e.target.value, 10))}
            className="flex-1 min-w-[180px] px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-semibold bg-white"
          >
            {state.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>

          <span className="text-gray-400 font-bold text-xs">と</span>

          <select
            value={pairB}
            onChange={(e) => setPairB(parseInt(e.target.value, 10))}
            className="flex-1 min-w-[180px] px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-semibold bg-white"
          >
            {state.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddPair('forbidden')}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              ❌ 禁止ペアに追加
            </button>
            <button
              onClick={() => handleAddPair('recommended')}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              ✅ 推奨ペアに追加
            </button>
          </div>
        </div>
      </div>

      {/* Real-time schedule conflict check */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
          <span>🔍</span>
          <span>現在のシフト表における相性チェック結果</span>
        </h3>

        {conflicts.length === 0 ? (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>禁止ペアの同日出勤はありません。相性ルールに完全準拠しています ✅</span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                <strong>{conflicts.length}件の禁止ペア同日出勤が検出されました：</strong>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {conflicts.map((c, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-white border border-red-200 text-xs text-red-800 font-semibold"
                >
                  {state.month}/{c.day}日: {c.saName} × {c.sbName}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
