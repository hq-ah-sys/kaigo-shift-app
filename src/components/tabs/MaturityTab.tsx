import React from 'react';
import { AppState } from '../../types';
import { MAT_STARS, MAT_LABEL, MAT_COLOR } from '../../constants';
import { Award, Star, Moon, Shield, Info } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const MaturityTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const handleSetMat = (staffId: number, level: number) => {
    onUpdateState((prev) => ({
      ...prev,
      staff: prev.staff.map((s) => (s.id === staffId ? { ...s, mat: level } : s)),
    }));
  };

  const handleSetComment = (staffId: number, comment: string) => {
    onUpdateState((prev) => ({
      ...prev,
      staff: prev.staff.map((s) => (s.id === staffId ? { ...s, comment } : s)),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">スキル・成熟度設定</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              各職員のスキルレベル（1〜5）を設定します。AIシフト生成時に1日あたりのベテラン配置や新人偏りの防止に活用されます。
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {[1, 2, 3, 4, 5].map((lv) => (
            <div
              key={lv}
              className="px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold"
              style={{
                backgroundColor: `${MAT_COLOR[lv]}15`,
                borderColor: `${MAT_COLOR[lv]}40`,
                color: MAT_COLOR[lv],
              }}
            >
              <span>{MAT_STARS[lv]}</span>
              <span>
                {lv}: {MAT_LABEL[lv]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Staff Maturity List Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">氏名</th>
                <th className="py-3 px-3">職種</th>
                <th className="py-3 px-3">形態</th>
                <th className="py-3 px-5">スキルレベル (クリックで変更)</th>
                <th className="py-3 px-4">特定スキル</th>
                <th className="py-3 px-4">特記事項・メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {state.staff.map((s) => {
                const roles = Array.isArray(s.roles) ? s.roles : [s.role];

                return (
                  <tr key={s.id} className="hover:bg-amber-50/30 transition">
                    <td className="py-3.5 px-4 font-bold text-gray-900 whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="py-3.5 px-3 text-gray-600 whitespace-nowrap">
                      {roles.join(', ')}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full font-bold ${
                          s.type === '常勤'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {s.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((starIdx) => {
                            const active = (s.mat || 3) >= starIdx;
                            return (
                              <button
                                key={starIdx}
                                type="button"
                                onClick={() => handleSetMat(s.id, starIdx)}
                                className={`text-base transition-transform hover:scale-125 cursor-pointer ${
                                  active ? 'text-amber-500' : 'text-gray-300'
                                }`}
                                title={`レベル${starIdx}に変更`}
                              >
                                ★
                              </button>
                            );
                          })}
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-bold"
                          style={{
                            backgroundColor: `${MAT_COLOR[s.mat || 3]}18`,
                            color: MAT_COLOR[s.mat || 3],
                          }}
                        >
                          {MAT_LABEL[s.mat || 3]}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {s.night && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 text-blue-200 text-[10px] font-bold">
                            <Moon className="w-2.5 h-2.5" /> 夜勤可
                          </span>
                        )}
                        {(s.mat || 3) >= 4 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            <Shield className="w-2.5 h-2.5" /> リーダー適格
                          </span>
                        )}
                        {roles.some((r) => r.includes('計画作成') || r.includes('責任者') || r.includes('管理')) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-bold">
                            責任者職
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <input
                        type="text"
                        value={s.comment || ''}
                        onChange={(e) => handleSetComment(s.id, e.target.value)}
                        placeholder="メモ入力..."
                        className="w-full max-w-xs px-2.5 py-1 rounded-lg border border-gray-200 text-xs focus:border-amber-500 outline-hidden bg-white"
                      />
                    </td>
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
