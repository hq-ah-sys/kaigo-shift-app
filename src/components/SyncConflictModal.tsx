import React from 'react';
import { SyncConflictData } from '../utils/gasSync';
import { Smartphone, Cloud, AlertTriangle, Check, Clock, Users, Building2 } from 'lucide-react';

interface Props {
  conflict: SyncConflictData | null;
  busy: boolean;
  onChooseLocal: () => void;
  onChooseRemote: () => void;
  onPostpone: () => void;
}

function formatDateTime(ts: number): string {
  if (!ts) return '日時不明';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export const SyncConflictModal: React.FC<Props> = ({
  conflict,
  busy,
  onChooseLocal,
  onChooseRemote,
  onPostpone,
}) => {
  if (!conflict) return null;

  const isOfflineRecovery = conflict.reason === 'offline_recovery';
  const remoteSum = conflict.remoteRecord.summary || {
    facilityName: conflict.remoteRecord.facilityName || conflict.facilityLabel,
    year: conflict.remoteRecord.state?.year || conflict.localSummary.year,
    month: conflict.remoteRecord.state?.month || conflict.localSummary.month,
    staffCount: conflict.remoteRecord.state?.staff?.length || 0,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-sky-200 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-sky-100 via-blue-50 to-indigo-100 px-6 py-4 border-b border-sky-200 flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">
              {isOfflineRecovery
                ? 'オンラインに復帰しました — どちらのデータを採用しますか？'
                : '共有データと内容が異なります — どちらを採用しますか？'}
            </h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {isOfflineRecovery
                ? `「${conflict.facilityLabel}」について、オフライン中にこの端末で変更された内容があります。Google Drive上の共有データと見比べて、採用する方を選択してください。`
                : `「${conflict.facilityLabel}」について、他の端末でGoogle Driveが更新されたか、この端末に未送信の変更があります。採用する方を選択してください。`}
            </p>
          </div>
        </div>

        {/* Comparison Cards */}
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70">
          {/* Local Card */}
          <div className="rounded-2xl bg-white border-2 border-sky-300 p-4 flex flex-col justify-between shadow-xs space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sky-900 font-black text-sm">
                  <Smartphone className="w-4 h-4 text-sky-600" />
                  <span>この端末（ローカル）</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                  手元の作業データ
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-700 bg-sky-50/60 p-3 rounded-xl border border-sky-100">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>
                    最終編集: <strong>{formatDateTime(conflict.localUpdatedAt)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="truncate">{conflict.localSummary.facilityName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>
                    {conflict.localSummary.year}年{conflict.localSummary.month}月 / 職員{' '}
                    {conflict.localSummary.staffCount}名
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onChooseLocal}
              className="w-full py-2.5 px-4 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>ローカルを採用して共有へ反映</span>
            </button>
          </div>

          {/* Remote Drive Card */}
          <div className="rounded-2xl bg-white border-2 border-emerald-300 p-4 flex flex-col justify-between shadow-xs space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                  <Cloud className="w-4 h-4 text-emerald-600" />
                  <span>Google Drive（共有）</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  履歴 #{conflict.remoteRecord.revision}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-700 bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    最終保存: <strong>{formatDateTime(conflict.remoteRecord.updatedAt)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="truncate">{remoteSum.facilityName}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    {remoteSum.year}年{remoteSum.month}月 / 職員 {remoteSum.staffCount}名
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onChooseRemote}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Cloud className="w-4 h-4" />
              <span>共有データを採用して読み込む</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            ※ 採用しなかった方のデータは上書きされます（必要なら先に設定タブからJSONバックアップも保存できます）
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={onPostpone}
            className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer shrink-0 disabled:opacity-50"
          >
            あとで決める
          </button>
        </div>
      </div>
    </div>
  );
};
