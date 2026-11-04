import React, { useState } from 'react';
import { AppState, ParsedRule } from '../../types';
import { generateShifts } from '../../utils/shiftEngine';
import { interpretInstructionsWithAI } from '../../utils/geminiAI';
import { Sparkles, Bot, Play, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onNavigateTab: (tab: string) => void;
}

export const GenerateTab: React.FC<Props> = ({ state, onUpdateState, onNavigateTab }) => {
  const [instructionText, setInstructionText] = useState('');
  const [isInterpreting, setIsInterpreting] = useState(false);
  const [interpretResultText, setInterpretResultText] = useState('');

  // Generation progress state
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStepMsg, setProgressStepMsg] = useState('');

  const handleInterpret = async () => {
    if (!instructionText.trim()) {
      alert('自然言語による指示を入力してください');
      return;
    }

    setIsInterpreting(true);
    setInterpretResultText('');

    try {
      const res = await interpretInstructionsWithAI(instructionText, state);
      onUpdateState((prev) => ({
        ...prev,
        parsedRules: [...prev.parsedRules, ...res.rules],
      }));
      setInterpretResultText(res.rawAnalysis);
    } catch (err: any) {
      alert(`AI解析エラー: ${err.message}`);
    } finally {
      setIsInterpreting(false);
    }
  };

  const handleRemoveRule = (id: string) => {
    onUpdateState((prev) => ({
      ...prev,
      parsedRules: prev.parsedRules.filter((r) => r.id !== id),
    }));
  };

  const handleClearAllRules = () => {
    onUpdateState((prev) => ({
      ...prev,
      parsedRules: [],
    }));
    setInstructionText('');
    setInterpretResultText('');
  };

  const handleRunGenerate = async () => {
    if (state.shiftPatterns.length === 0) {
      alert('シフトパターンが設定されていません。「🕐 シフト設定」タブでパターンを追加してください。');
      return;
    }

    // Auto-parse any text in the instruction box if user hasn't pressed interpret
    let activeParsedRules = [...state.parsedRules];
    if (instructionText.trim()) {
      const res = await interpretInstructionsWithAI(instructionText, state);
      if (res.rules.length > 0) {
        // Filter out duplicate rule texts
        const existingTexts = new Set(activeParsedRules.map((r) => r.text));
        const newUnique = res.rules.filter((r) => !existingTexts.has(r.text));
        activeParsedRules = [...activeParsedRules, ...newUnique];
        onUpdateState((prev) => ({
          ...prev,
          parsedRules: activeParsedRules,
        }));
        setInterpretResultText(res.rawAnalysis);
      }
    }

    setIsGenerating(true);
    setProgressPercent(10);
    setProgressStepMsg('希望休・有休・AI個別条件を適用中...');

    const lockedCount = state.lockedStaff.length;

    const steps: Array<[number, string, number]> = [
      [300, lockedCount > 0 ? `🔒 ${lockedCount}名の固定シフトを保護中...` : '勤務パターン初期化中...', 30],
      [700, activeParsedRules.length > 0 ? `✨ ${activeParsedRules.length}件のAI指示ルール（曜日・出勤指定）を反映中...` : '相性ルール・禁止ペア制約を適用中...', 50],
      [1100, '24時間体制・夜勤・明けの自動割り当て中...', 70],
      [1500, '人員配置基準・常勤換算を最適化中...', 85],
      [1800, '労働基準法・36協定・5連勤制限の最終適合チェック...', 95],
    ];

    steps.forEach(([timeMs, msg, pct]) => {
      setTimeout(() => {
        setProgressStepMsg(msg);
        setProgressPercent(pct);
      }, timeMs);
    });

    setTimeout(() => {
      // Generate with latest active rules
      const stateToGenerate = {
        ...state,
        parsedRules: activeParsedRules,
      };
      const newShifts = generateShifts(stateToGenerate);
      onUpdateState((prev) => ({
        ...prev,
        shifts: newShifts,
        parsedRules: activeParsedRules,
        lockedStaff: [],
      }));

      setProgressPercent(100);
      setProgressStepMsg('✅ AIシフト自動生成が完了しました！');

      setTimeout(() => {
        setIsGenerating(false);
        onNavigateTab('calendar');
      }, 700);
    }, 2200);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-10 pointer-events-none">
          <Sparkles className="w-80 h-80" />
        </div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 text-xs font-bold mb-4 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI Caregiving Shift Engine Pro</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
            法令遵守・労働時間・希望を
            <br />
            AIが瞬時に最適化して自動生成
          </h2>

          <p className="mt-3 text-sm text-blue-100/90 leading-relaxed font-normal">
            労働基準法の休憩控除・週40時間上限、36協定残業抑制、24時間常駐基準、経験者配置、相性ペア、有給希望をすべて同時に満たす最適なシフト表を自動構築します。
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-blue-200">
            <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/20">
              ✓ 労基法休憩自動控除
            </span>
            <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/20">
              ✓ 36協定・5連勤制限
            </span>
            <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/20">
              ✓ 夜勤・明け自動ペア
            </span>
            <span className="px-3 py-1 rounded-xl bg-white/10 border border-white/20">
              ✓ 🔒特定職員の固定
            </span>
          </div>
        </div>
      </div>

      {/* Natural Language Custom Instructions */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
        <div className="flex items-center gap-2 mb-2">
          <Bot className="w-5 h-5 text-purple-600" />
          <h3 className="font-bold text-gray-900 text-base">自然言語で追加指示・個別事情を入力（任意）</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          「木村さんを毎週月曜日に入れて」「佐藤さんを水曜と金曜に早番で入れて」「田中さんは火曜日は休みに」「高橋さんは10日と15日に入れて」「山田さんは週3日以内」など、自然な日本語で入力するとAIが正確にルール化し、シフト表に確実に反映されます。
        </p>

        <textarea
          rows={4}
          value={instructionText}
          onChange={(e) => setInstructionText(e.target.value)}
          placeholder={`例：
・${state.staff[0]?.name || '木村'}さんを毎週月曜日に入れて
・${state.staff[1]?.name || '佐藤'}さんを水曜と金曜に早番で入れて
・${state.staff[2]?.name || '田中'}さんは火曜日は休みに
・${state.staff[3]?.name || '高橋'}さんを10日と15日に日勤で入れて`}
          className="w-full px-4 py-3 rounded-xl border border-purple-200 text-sm focus:border-purple-600 focus:ring-2 focus:ring-purple-100 outline-hidden font-medium leading-relaxed bg-purple-50/20"
        />

        {/* Quick Sample Instruction Chips */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-gray-500 mr-1">💡 クイック指示の入力例:</span>
          {[
            `${state.staff[0]?.name?.split(/\s+/)[0] || '木村'}さんを月曜日に入れて`,
            `${state.staff[1]?.name?.split(/\s+/)[0] || '佐藤'}さんを水曜と金曜に早番で入れて`,
            `${state.staff[2]?.name?.split(/\s+/)[0] || '田中'}さんは火曜日は休みに`,
            `${state.staff[3]?.name?.split(/\s+/)[0] || '高橋'}さんを10日と15日に入れて`,
          ].map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setInstructionText((prev) => (prev ? `${prev}\n${sample}` : sample));
              }}
              className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-[11px] font-medium transition cursor-pointer"
            >
              + {sample}
            </button>
          ))}
        </div>

        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleInterpret}
              disabled={isInterpreting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isInterpreting ? 'AIが解釈中...' : '🤖 AIで指示を解釈・ルール登録'}</span>
            </button>
            <button
              onClick={() => setInstructionText('')}
              className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-xs transition cursor-pointer"
            >
              クリア
            </button>
          </div>
        </div>

        {/* Parsed Rules Display */}
        {state.parsedRules.length > 0 && (
          <div className="mt-5 p-4 rounded-xl bg-purple-50 border border-purple-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-purple-600" />
                <span>適用予定のAI個別ルール（{state.parsedRules.length}件）</span>
              </span>
              <button
                onClick={handleClearAllRules}
                className="text-[11px] text-red-600 font-bold hover:underline cursor-pointer"
              >
                全ルールをリセット
              </button>
            </div>

            <div className="space-y-2">
              {state.parsedRules.map((rule) => {
                const DOWS = ['日', '月', '火', '水', '木', '金', '土'];
                return (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-purple-200 text-xs text-gray-800 font-medium"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-purple-700">
                        [{rule.staffName || '全職員対象'}]
                      </span>
                      <span>{rule.text}</span>
                      {rule.dows && rule.dows.length > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            rule.ruleType === 'specific_dow_work'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          毎週{rule.dows.map((d) => DOWS[d]).join('・')}曜{' '}
                          {rule.ruleType === 'specific_dow_work' ? '出勤' : '公休'}
                          {rule.shiftKey ? ` (${rule.shiftKey})` : ''}
                        </span>
                      )}
                      {rule.dates && rule.dates.length > 0 && (
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            rule.ruleType === 'specific_date_work'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {rule.dates.join('・')}日{' '}
                          {rule.ruleType === 'specific_date_work' ? '出勤' : '公休'}
                          {rule.shiftKey ? ` (${rule.shiftKey})` : ''}
                        </span>
                      )}
                      {rule.hours && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">
                          実働 -{rule.hours}h
                        </span>
                      )}
                      {rule.maxDays && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[10px]">
                          週上限 {rule.maxDays}日
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveRule(rule.id)}
                      className="p-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {interpretResultText && (
              <div className="text-[11px] text-purple-800/80 pt-1 font-mono">
                {interpretResultText}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Execution Area */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-8 text-center space-y-5">
        <div>
          <h3 className="text-xl font-black text-gray-900">
            {state.facility.name} — {state.year}年{state.month}月度 シフト自動生成
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            生成後も「🗓️ シフト表」タブで個別のマス目をクリックして手動微調整が可能です
          </p>
        </div>

        {/* Progress Bar during generation */}
        {isGenerating && (
          <div className="max-w-md mx-auto space-y-2 animate-in fade-in">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden p-0.5 border border-gray-200">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-xs font-bold text-blue-700 flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>{progressStepMsg}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleRunGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-3 px-10 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-black text-base shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer tracking-wider"
        >
          <Play className="w-5 h-5 fill-current" />
          <span>{isGenerating ? 'AIが生成中...' : '🚀 AIシフトを自動生成する'}</span>
        </button>

        {state.lockedStaff.length > 0 && (
          <div className="text-xs font-bold text-amber-600 flex items-center justify-center gap-1.5">
            <span>🔒</span>
            <span>{state.lockedStaff.length}名の職員が固定ロックされています（ロックされたシフトは保持されます）</span>
          </div>
        )}
      </div>
    </div>
  );
};
