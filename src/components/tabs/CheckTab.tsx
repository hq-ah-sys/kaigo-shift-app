import React, { useState } from 'react';
import { AppState } from '../../types';
import { runFacilityChecks, computeStaffSummaries } from '../../utils/complianceEngine';
import { runAIComplianceAudit } from '../../utils/geminiAI';
import { ShieldCheck, Bot, Sparkles, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  state: AppState;
  onNavigateTab: (tab: string) => void;
}

export const CheckTab: React.FC<Props> = ({ state, onNavigateTab }) => {
  const [aiReport, setAiReport] = useState<string>('');
  const [isAuditing, setIsAuditing] = useState(false);

  const facilityChecks = runFacilityChecks(state);
  const staffSummaries = computeStaffSummaries(state);

  const allPassed = facilityChecks.every((f) => f.allPassed);

  const handleRunAiAudit = async () => {
    setIsAuditing(true);
    try {
      const report = await runAIComplianceAudit(state);
      setAiReport(report);
    } catch (err: any) {
      alert(`AI診断エラー: ${err.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-900">人員配置基準・36協定・法令適合性チェック</h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                    allPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {allPassed ? '✅ 全基準クリア' : '❌ 要確認事項あり'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                厚生労働省の介護保険事業所指定基準（3:1配置、専従管理者、看護職、常勤換算など）の充足度を自動診断
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Compliance Rule Explanatory Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-600 text-white shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="space-y-1 text-xs">
            <div className="font-black text-blue-950 flex items-center gap-2">
              <span>⚖️ 介護職人員配置基準の法令算定ルール（管理者・計画作成担当者控除）</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                ✓ アルゴリズム適用済
              </span>
            </div>
            <p className="text-blue-900 leading-relaxed font-medium">
              厚生労働省の指定基準に基づき、<strong>管理者（管理職業務分）</strong>および<strong>計画作成担当者（ケアプラン作成業務分）</strong>は、介護職員の人員配置基準（3:1比率・日中配置人数・常勤換算FTE）から<strong>厳密に控除（除外）</strong>して計算しています。
              専従管理職・専従計画作成担当者は介護職としては0人換算、同事業所内兼務職員（例: 管理者4h / 介護職4h）は<strong>介護職として割り当てられた時間（4h＝0.5人分）のみ</strong>を算定しています。
            </p>
          </div>
        </div>
      </div>

      {/* Facility Legal Checks Grid */}
      <div className="space-y-4">
        {facilityChecks.map((fc) => (
          <div key={fc.facilityId} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-base">{fc.facilityName}</h3>
                <span className="text-xs text-gray-400 font-semibold">{fc.facilityType}</span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  fc.allPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {fc.allPassed ? '基準充足 ✓' : '不足あり ⚠️'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {fc.checks.map((c, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex flex-col justify-between ${
                    c.passed
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                      : 'bg-red-50/60 border-red-200 text-red-950'
                  }`}
                >
                  <div>
                    <div className="text-[11px] text-gray-500 font-bold mb-1">{c.label}</div>
                    <div className="text-2xl font-black mb-1" style={{ color: c.passed ? '#059669' : '#dc2626' }}>
                      {c.actual}
                    </div>
                    <div className="text-[11px] text-gray-500">{c.req}</div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-gray-200/60 flex items-center justify-between text-xs font-bold">
                    <span>適合判定:</span>
                    <span className={c.passed ? 'text-emerald-700' : 'text-red-700'}>
                      {c.passed ? '✅ 適合' : '❌ 不足'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AI Comprehensive Compliance Audit */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-bold text-gray-900 text-base">🤖 AI コンプライアンス・労務監査レポート</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                最新AIが労基法・36協定・介護人員基準を横断分析し、労務リスクと改善策を具体的に提案
              </p>
            </div>
          </div>

          <button
            onClick={handleRunAiAudit}
            disabled={isAuditing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isAuditing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>AI診断中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>AIで総合診断する</span>
              </>
            )}
          </button>
        </div>

        {aiReport ? (
          <div className="p-5 rounded-2xl bg-indigo-50/60 border border-indigo-200 text-gray-800 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {aiReport}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 text-xs">
            「AIで総合診断する」ボタンを押すと、今月のシフト全体のコンプライアンス監査が実行されます。
          </div>
        )}
      </div>

      {/* Staff 36 Agreement & Monthly Summary Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-100 font-bold text-sm text-gray-900 flex items-center justify-between">
          <span>📊 職員別 36協定・労働時間・常勤換算明細</span>
          <span className="text-xs text-gray-500 font-normal">基準労働時間: 週40時間</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">氏名</th>
                <th className="py-3 px-3">職種</th>
                <th className="py-3 px-3">専従/兼務</th>
                <th className="py-3 px-3 text-center">出勤日数</th>
                <th className="py-3 px-3 text-center">有休日数</th>
                <th className="py-3 px-3 text-center">最大連勤</th>
                <th className="py-3 px-3 text-center">総実労働時間</th>
                <th className="py-3 px-3 text-center">週平均実働</th>
                <th className="py-3 px-3 text-center">常勤換算</th>
                <th className="py-3 px-3 text-center">36協定判定</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {staffSummaries.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-bold text-gray-900">{s.name}</td>
                  <td className="py-3 px-3 text-gray-600">{s.role}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                        s.dedicated ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'
                      }`}
                    >
                      {s.dedicated ? '専従' : '兼務'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-gray-800">{s.workDays}日</td>
                  <td className="py-3 px-3 text-center font-bold text-emerald-600">
                    {s.paidLeaveCount}日
                  </td>
                  <td
                    className="py-3 px-3 text-center font-bold"
                    style={{ color: s.maxConsecutive >= 6 ? '#dc2626' : '#475569' }}
                  >
                    {s.maxConsecutive}連勤
                  </td>
                  <td className="py-3 px-3 text-center font-black text-blue-700">
                    {s.totalNetHours.toFixed(1)}h
                  </td>
                  <td
                    className="py-3 px-3 text-center font-bold"
                    style={{ color: s.over36 ? '#dc2626' : '#059669' }}
                  >
                    {s.avgWeeklyHours.toFixed(1)}h/週
                  </td>
                  <td
                    className="py-3 px-3 text-center font-black"
                    style={{
                      color:
                        parseFloat(s.fte) >= 1.0
                          ? '#059669'
                          : parseFloat(s.fte) >= 0.8
                          ? '#d97706'
                          : '#64748b',
                    }}
                  >
                    {s.fte}
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-black ${
                        s.over36
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {s.over36 ? '⚠️ 週40h超注意' : '✅ 法令適正'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
