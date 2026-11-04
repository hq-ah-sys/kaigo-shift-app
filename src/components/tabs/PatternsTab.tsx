import React, { useState } from 'react';
import { AppState, ShiftPattern } from '../../types';
import { PATTERN_COLORS } from '../../constants';
import {
  grossHours,
  breakTime,
  netHours,
  isNight,
  checkCoverageGaps,
  minutesToTime,
} from '../../utils/shiftEngine';
import { exportPatternsCSV, downloadPatternTemplate, parseCSV } from '../../utils/csvHelper';
import { Clock, Plus, Download, Upload, FileText, Edit2, Trash2, Moon, Sun, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const PatternsTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPattern, setEditingPattern] = useState<ShiftPattern | null>(null);

  // Form State
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [color, setColor] = useState(PATTERN_COLORS[0]);
  const [dispMode, setDispMode] = useState<'default' | 'key' | 'time'>('default');

  const openAddModal = () => {
    setEditingPattern(null);
    setKey('');
    setName('');
    setStart('09:00');
    setEnd('18:00');
    const colorIdx = state.shiftPatterns.length % PATTERN_COLORS.length;
    setColor(PATTERN_COLORS[colorIdx]);
    setDispMode('default');
    setModalOpen(true);
  };

  const openEditModal = (p: ShiftPattern) => {
    setEditingPattern(p);
    setKey(p.key);
    setName(p.name);
    setStart(p.start);
    setEnd(p.end);
    setColor(p.color);
    setDispMode(p.dispMode || 'default');
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!key.trim()) {
      alert('表示記号（1〜3文字）を入力してください');
      return;
    }
    if (!name.trim()) {
      alert('パターン名を入力してください');
      return;
    }

    const facId = state.facility.id;

    onUpdateState((prev) => {
      let updated: ShiftPattern[];
      const patObj: ShiftPattern = {
        id: editingPattern ? editingPattern.id : prev.nextPatId,
        facilityId: facId,
        key: key.trim(),
        name: name.trim(),
        start,
        end,
        color,
        dispMode,
      };

      if (editingPattern) {
        updated = prev.shiftPatterns.map((p) => (p.id === editingPattern.id ? patObj : p));
      } else {
        if (prev.shiftPatterns.some((p) => p.key === key.trim())) {
          alert('同じ記号が既に使用されています');
          return prev;
        }
        updated = [...prev.shiftPatterns, patObj];
      }

      const customCols = prev.customPatternColors || [];
      const isNewCustom = !PATTERN_COLORS.includes(color) && !customCols.includes(color);
      const updatedCustomCols = isNewCustom ? [...customCols, color] : customCols;

      return {
        ...prev,
        shiftPatterns: updated,
        customPatternColors: updatedCustomCols,
        nextPatId: editingPattern ? prev.nextPatId : prev.nextPatId + 1,
      };
    });

    setModalOpen(false);
  };

  const handleDelete = (id: number) => {
    if (!confirm('このシフトパターンを削除しますか？')) return;
    onUpdateState((prev) => ({
      ...prev,
      shiftPatterns: prev.shiftPatterns.filter((p) => p.id !== id),
    }));
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
        let updated = 0;

        onUpdateState((prev) => {
          const newPats = [...prev.shiftPatterns];
          let nextId = prev.nextPatId;
          const facId = prev.facility.id;

          rows.slice(1).forEach((cols) => {
            if (!cols[0]?.trim()) return;
            const pKey = cols[0].trim();
            const pName = cols[1]?.trim() || `${pKey}シフト`;
            const pStart = cols[2]?.trim() || '09:00';
            const pEnd = cols[3]?.trim() || '18:00';
            const pColor = cols[4]?.trim() || '#2563eb';
            const pDisp = (cols[5]?.trim() as any) || 'default';

            const existingIdx = newPats.findIndex((p) => p.key === pKey);
            if (existingIdx >= 0) {
              newPats[existingIdx] = {
                ...newPats[existingIdx],
                name: pName,
                start: pStart,
                end: pEnd,
                color: pColor,
                dispMode: pDisp,
              };
              updated++;
            } else {
              newPats.push({
                id: nextId++,
                facilityId: facId,
                key: pKey,
                name: pName,
                start: pStart,
                end: pEnd,
                color: pColor,
                dispMode: pDisp,
              });
              added++;
            }
          });

          return {
            ...prev,
            shiftPatterns: newPats,
            nextPatId: nextId,
          };
        });

        alert(`✅ シフトパターンCSV取込完了: ${added}件追加、${updated}件更新`);
      } catch (err: any) {
        alert(`インポートに失敗しました: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const currentGross = grossHours({ start, end } as any);
  const currentBreak = breakTime(currentGross);
  const currentNet = Math.max(0, currentGross - currentBreak);
  const currentNight = isNight({ start, end } as any);

  // Coverage gaps for current facility
  const gaps = checkCoverageGaps(state.facility.id, state.shiftPatterns);
  const is24hNeeded = ['grouphome', 'tokutei', 'yuryou'].includes(state.facility.typeId);

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span>シフトパターン設定</span>
              <span className="text-xs font-semibold text-gray-500">
                ({state.facility.name}・全{state.shiftPatterns.length}種類)
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              勤務パターン（早・日・遅・夜勤等）と、労働基準法に基づく自動休憩控除を管理
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>パターンを追加</span>
            </button>

            <button
              onClick={() => exportPatternsCSV(state.shiftPatterns)}
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
              onClick={downloadPatternTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>テンプレート</span>
            </button>
          </div>
        </div>

        {/* Legal notice banner */}
        <div className="mt-4 p-3.5 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-3 text-xs text-blue-900 leading-relaxed">
          <span className="text-base shrink-0">💡</span>
          <div>
            <strong>労働基準法第34条に基づく休憩時間自動控除</strong>：労働時間が6時間を超える場合は少なくとも45分（0.75h）、8時間を超える場合は少なくとも1時間（1.0h）の休憩が自動で差し引かれ、実労働時間が正確に集計されます。
          </div>
        </div>
      </div>

      {/* Patterns Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">表示記号</th>
                <th className="py-3 px-4">パターン名</th>
                <th className="py-3 px-3">時間帯</th>
                <th className="py-3 px-3">拘束時間</th>
                <th className="py-3 px-3">法定休憩</th>
                <th className="py-3 px-3">実労働時間</th>
                <th className="py-3 px-3">種別</th>
                <th className="py-3 px-3">カラー</th>
                <th className="py-3 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {state.shiftPatterns.map((p) => {
                const gH = grossHours(p);
                const bH = breakTime(gH);
                const nH = netHours(p);
                const night = isNight(p);

                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4">
                      <span
                        className="px-2.5 py-1 rounded-md font-black text-xs inline-block shadow-2xs"
                        style={{ backgroundColor: p.color, color: '#ffffff' }}
                      >
                        {p.key}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900">{p.name}</td>
                    <td className="py-3 px-3 font-semibold text-gray-700 whitespace-nowrap">
                      {p.start} 〜 {p.end}
                    </td>
                    <td className="py-3 px-3 text-gray-600">{gH.toFixed(1)}h</td>
                    <td className="py-3 px-3 text-amber-700 font-semibold">
                      {bH > 0 ? `-${bH}h 控除` : 'なし'}
                    </td>
                    <td className="py-3 px-3 font-black text-blue-700">{nH.toFixed(1)}h</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {night ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 text-blue-200 text-[11px] font-bold">
                          <Moon className="w-3 h-3" /> 夜勤
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold">
                          <Sun className="w-3 h-3" /> 日勤
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded-md border border-gray-300 shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-[11px] text-gray-400 font-mono">{p.color}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(p)}
                          className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-1 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 24h Coverage Gap Check */}
      {is24hNeeded && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
          <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
            <span>🌙</span>
            <span>24時間体制カバレッジ診断（パターンの時間帯連続性）</span>
          </h3>

          <div>
            {gaps.length === 0 ? (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>{state.facility.name}</strong>: 登録されたシフトパターンで24時間（00:00〜24:00）完全に切れ目なくカバーされています ✅
                </span>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 font-medium">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <strong>{state.facility.name}</strong>: 以下の時間帯に対応するシフトパターンが存在しません（空白あり）：
                  <span className="font-bold underline ml-1">
                    {gaps.map((g) => `${minutesToTime(g.from)}〜${minutesToTime(g.to)}`).join(', ')}
                  </span>
                  <div className="text-[11px] text-red-700 mt-0.5">
                    夜間・早朝または日勤間の引き継ぎをカバーするパターンを追加してください。
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fixed Patterns Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">📋 システム固定記号（自動計算・0h集計）</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="font-black text-emerald-700 text-sm">有</span>
            <div className="font-bold text-gray-900 mt-1">有給休暇 (0h)</div>
            <div className="text-[11px] text-gray-500">年次有給休暇の取得</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="font-black text-amber-700 text-sm">希</span>
            <div className="font-bold text-gray-900 mt-1">希望休 (0h)</div>
            <div className="text-[11px] text-gray-500">職員の事前希望による公休</div>
          </div>
          <div className="p-3 rounded-xl bg-gray-100 border border-gray-200">
            <span className="font-black text-gray-700 text-sm">休</span>
            <div className="font-bold text-gray-900 mt-1">公休 (0h)</div>
            <div className="text-[11px] text-gray-500">法定休日・所定休日</div>
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
            <span className="font-black text-blue-800 text-sm">明</span>
            <div className="font-bold text-gray-900 mt-1">明け (0h)</div>
            <div className="text-[11px] text-gray-500">夜勤翌日の非勤務日</div>
          </div>
        </div>
      </div>

      {/* Pattern Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              {editingPattern ? 'シフトパターンを編集' : '新規シフトパターンを追加'}
            </h3>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    表示記号（セル内表記）
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="例：早、A、夜"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-bold text-center focus:border-blue-600 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    パターン名
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例：早番（入浴）"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium focus:border-blue-600 outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    始業時刻
                  </label>
                  <input
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium focus:border-blue-600 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    終業時刻
                  </label>
                  <input
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium focus:border-blue-600 outline-hidden"
                  />
                </div>
              </div>

              {/* Dynamic Calculation Info */}
              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-1">
                <div className="flex items-center justify-between">
                  <span>拘束時間:</span>
                  <strong className="text-gray-900">{currentGross.toFixed(1)} 時間</strong>
                </div>
                <div className="flex items-center justify-between text-amber-700">
                  <span>労基法休憩控除:</span>
                  <strong>{currentBreak > 0 ? `-${currentBreak} 時間` : '0 時間'}</strong>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-blue-200 font-black text-sm text-blue-700">
                  <span>実労働時間:</span>
                  <span>{currentNet.toFixed(1)} 時間</span>
                </div>
              </div>

              {currentNight && (
                <div className="p-3 rounded-xl bg-slate-900 text-blue-200 text-xs flex items-center gap-2">
                  <Moon className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>このパターンは22:00〜翌05:00を跨ぐため、<strong>夜勤扱い</strong>になります。</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  カラーテーマ（プリセット & カスタム）
                </label>
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center gap-1">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-10 h-10 rounded-xl border border-gray-300 p-0 cursor-pointer shadow-xs"
                      title="カラーピッカーで自由に変更"
                    />
                    <span className="text-[10px] text-gray-500 font-mono">カスタム</span>
                  </div>
                  <div className="flex-1 max-h-36 overflow-y-auto p-2 rounded-xl border border-gray-200 bg-gray-50/50">
                    <div className="flex flex-wrap gap-1.5">
                      {[...PATTERN_COLORS, ...(state.customPatternColors || [])].map((c) => (
                        <button
                          type="button"
                          key={c}
                          onClick={() => setColor(c)}
                          className={`w-6 h-6 rounded-lg transition-transform shadow-2xs ${color === c ? 'scale-125 ring-2 ring-blue-600 z-10' : 'hover:scale-110'}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold text-xs transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
