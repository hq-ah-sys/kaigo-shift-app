import React, { useState } from 'react';
import { AppState } from '../types';
import {
  SyncConfig,
  SyncFacilityEntry,
  SyncFacilityMeta,
  GAS_TEMPLATE_CODE,
  buildBranchShareUrl,
  gasPing,
  gasListFacilities,
  sanitizeFacilityKey,
} from '../utils/gasSync';
import {
  Cloud,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Link2,
  Upload,
  Download,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  FolderSearch,
  Building2,
  Shield,
} from 'lucide-react';

interface Props {
  syncConfig: SyncConfig;
  syncMeta: SyncFacilityMeta;
  isOnline: boolean;
  isSyncing: boolean;
  syncError: string | null;
  state: AppState;
  onUpdateSyncConfig: (next: SyncConfig) => void;
  onManualPush: (force?: boolean) => Promise<void>;
  onManualPull: () => Promise<void>;
  onSwitchFacility: (facilityKey: string) => Promise<void>;
  onCreateFacility: (
    entry: SyncFacilityEntry,
    templateMode: 'copy_patterns' | 'demo' | 'from_drive'
  ) => Promise<void>;
}

export const GasSyncPanel: React.FC<Props> = ({
  syncConfig,
  syncMeta,
  isOnline,
  isSyncing,
  syncError,
  onUpdateSyncConfig,
  onManualPush,
  onManualPull,
  onSwitchFacility,
  onCreateFacility,
}) => {
  const [urlInput, setUrlInput] = useState(syncConfig.gasUrl || '');
  const [showScript, setShowScript] = useState(!syncConfig.gasUrl);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedShareKey, setCopiedShareKey] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pinging, setPinging] = useState(false);

  // Add facility form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFacLabel, setNewFacLabel] = useState('');
  const [newFacKey, setNewFacKey] = useState('');
  const [newFacPasscode, setNewFacPasscode] = useState('');
  const [newFacMode, setNewFacMode] = useState<'copy_patterns' | 'demo' | 'from_drive'>('copy_patterns');
  const [creatingFac, setCreatingFac] = useState(false);

  // Drive discovery
  const [discovering, setDiscovering] = useState(false);
  const [driveFiles, setDriveFiles] = useState<
    Array<{ facilityKey: string; facilityName: string; revision: number; updatedAt: number; hasPasscode: boolean }>
  >([]);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(GAS_TEMPLATE_CODE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      alert('コピーに失敗しました。コード欄を選択してコピーしてください。');
    }
  };

  const handleSaveAndTest = async () => {
    const cleanUrl = urlInput.trim();
    if (!cleanUrl) {
      setPingResult({ ok: false, msg: 'GASのウェブアプリURLを入力してください' });
      return;
    }
    setPinging(true);
    setPingResult(null);
    try {
      const res = await gasPing(cleanUrl);
      if (!res.ok) {
        setPingResult({ ok: false, msg: res.error || '接続テストに失敗しました' });
        return;
      }
      onUpdateSyncConfig({
        ...syncConfig,
        enabled: true,
        gasUrl: cleanUrl,
      });
      setPingResult({
        ok: true,
        msg: `接続成功！Driveフォルダ「${res.folderName || '介護シフト共有データ'}」と連携しました`,
      });
    } catch (err: any) {
      setPingResult({ ok: false, msg: err.message || '接続に失敗しました' });
    } finally {
      setPinging(false);
    }
  };

  const handleToggleEnabled = () => {
    if (!syncConfig.enabled && !urlInput.trim()) {
      setPingResult({ ok: false, msg: '先にGASのウェブアプリURLを入力して接続テストを行ってください' });
      return;
    }
    onUpdateSyncConfig({
      ...syncConfig,
      gasUrl: urlInput.trim() || syncConfig.gasUrl,
      enabled: !syncConfig.enabled,
    });
  };

  const handleCopyShareUrl = async (entry: SyncFacilityEntry) => {
    const activeUrl = urlInput.trim() || syncConfig.gasUrl;
    if (!activeUrl) {
      alert('先にGASウェブアプリURLを設定してください');
      return;
    }
    const shareUrl = buildBranchShareUrl(activeUrl, entry);
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareKey(entry.facilityKey);
      setTimeout(() => setCopiedShareKey(null), 2500);
    } catch {
      window.prompt('以下のURLをコピーして拠点担当者へ送ってください:', shareUrl);
    }
  };

  const handleAddFacilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newFacLabel.trim();
    if (!label) {
      alert('拠点名を入力してください（例：グループホーム 拠点B）');
      return;
    }
    const autoKey =
      newFacKey.trim() ||
      `kyoten_${syncConfig.facilities.length + 1}_${Math.random().toString(36).slice(2, 5)}`;
    const safeKey = sanitizeFacilityKey(autoKey);

    if (syncConfig.facilities.some((f) => f.facilityKey === safeKey)) {
      alert(`拠点ID「${safeKey}」は既に登録されています`);
      return;
    }

    setCreatingFac(true);
    try {
      await onCreateFacility(
        {
          facilityKey: safeKey,
          label,
          passcode: newFacPasscode.trim(),
        },
        newFacMode
      );
      setNewFacLabel('');
      setNewFacKey('');
      setNewFacPasscode('');
      setShowAddForm(false);
    } finally {
      setCreatingFac(false);
    }
  };

  const handleRemoveFacility = (key: string) => {
    if (syncConfig.facilities.length <= 1) return;
    if (key === syncConfig.activeFacilityKey) {
      alert('現在表示中の拠点は削除できません。別の拠点に切り替えてから削除してください。');
      return;
    }
    if (!window.confirm(`拠点リストから「${key}」を削除しますか？（Drive上のファイル自体は削除されません）`)) {
      return;
    }
    onUpdateSyncConfig({
      ...syncConfig,
      facilities: syncConfig.facilities.filter((f) => f.facilityKey !== key),
    });
  };

  const handleDiscoverDrive = async () => {
    const activeUrl = urlInput.trim() || syncConfig.gasUrl;
    if (!activeUrl) return;
    setDiscovering(true);
    try {
      const res = await gasListFacilities(activeUrl);
      if (res.ok && Array.isArray(res.facilities)) {
        setDriveFiles(res.facilities);
      } else {
        setPingResult({ ok: false, msg: res.message || 'Drive一覧の取得に失敗しました' });
      }
    } catch (err: any) {
      setPingResult({ ok: false, msg: err.message || 'Drive一覧の取得に失敗しました' });
    } finally {
      setDiscovering(false);
    }
  };

  const handleImportDiscovered = (f: { facilityKey: string; facilityName: string; hasPasscode: boolean }) => {
    const passcode = f.hasPasscode
      ? window.prompt(`「${f.facilityName || f.facilityKey}」の合言葉（パスコード）を入力してください:`, '') || ''
      : '';
    if (!syncConfig.facilities.some((e) => e.facilityKey === f.facilityKey)) {
      onUpdateSyncConfig({
        ...syncConfig,
        facilities: [
          ...syncConfig.facilities,
          {
            facilityKey: f.facilityKey,
            label: f.facilityName || f.facilityKey,
            passcode,
          },
        ],
      });
    }
    onSwitchFacility(f.facilityKey);
  };

  const activeEntry = syncConfig.facilities.find((f) => f.facilityKey === syncConfig.activeFacilityKey);

  return (
    <div className="bg-white rounded-2xl border border-sky-200 shadow-xs p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-base">
                Google Drive 自動共有設定（GAS連携）
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                完全無料・Google Cloud課金ゼロ
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              拠点AのGoogle Driveをデータ保存庫にし、拠点B・Cは専用URLを開くだけでログイン不要・自動で同じ画面を共有できます
            </p>
          </div>
        </div>

        {syncConfig.role === 'admin' && syncConfig.gasUrl && (
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
              syncConfig.enabled
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
          >
            {syncConfig.enabled ? '● 自動同期 ON' : '○ 自動同期 OFF'}
          </button>
        )}
      </div>

      {/* Sync Error / Status Banner */}
      {syncError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{syncError}</span>
        </div>
      )}

      {/* Branch simplified view */}
      {syncConfig.role === 'branch' ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-sky-50 border border-sky-200 text-xs space-y-2">
            <div className="font-bold text-sky-950 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-sky-700" />
              <span>共有接続中の拠点: {activeEntry?.label || syncConfig.activeFacilityKey}</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              本部が設定したGoogle Driveと自動同期しています。オフラインで作業した場合は、オンライン復帰時に「ローカル」か「共有データ」のどちらを使うか選択できます。
            </p>
            <div className="text-[11px] text-slate-500">
              同期状態:{' '}
              {!isOnline
                ? 'オフライン（端末内に自動保存中）'
                : syncMeta.hadOfflineEdits
                ? 'オフライン編集あり（同期確認が必要）'
                : syncMeta.localDirty
                ? '送信待機中...'
                : syncMeta.lastSyncedAt
                ? `同期済み (${new Date(syncMeta.lastSyncedAt).toLocaleString('ja-JP')})`
                : '接続待機中'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={!isOnline || isSyncing}
              onClick={() => onManualPull()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Driveの最新データを取り込む</span>
            </button>
            <button
              type="button"
              disabled={!isOnline || isSyncing}
              onClick={() => onManualPush(false)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>この端末の内容をDriveへ送信</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('管理者モード（拠点追加・GAS設定変更画面）に切り替えますか？')) {
                  onUpdateSyncConfig({ ...syncConfig, role: 'admin' });
                }
              }}
              className="ml-auto text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              管理者設定を開く
            </button>
          </div>
        </div>
      ) : (
        /* Admin View */
        <div className="space-y-5">
          {/* Step 1: GAS Script Accordion */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowScript((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-slate-100/70 transition cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-sky-700 text-white text-[10px]">STEP 1</span>
                <span>Google Apps Script（GAS）初回設置手順 & コードコピー</span>
              </span>
              {showScript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showScript && (
              <div className="px-4 pb-4 pt-2 border-t border-slate-200 space-y-3 bg-white text-xs text-slate-700">
                <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                  <li>
                    <strong>script.google.com</strong> を開き「新しいプロジェクト」を作成（課金・クレジットカード登録不要）。
                  </li>
                  <li>下の「GASコードをコピー」を押し、エディタの中身をすべて消して貼り付け・保存します。</li>
                  <li>
                    右上の<strong>「デプロイ」→「新しいデプロイ」→ 種類の選択「ウェブアプリ」</strong>を選び、
                    <strong>次のユーザーとして実行：「自分」</strong>、<strong>アクセスできるユーザー：「全員」</strong>にしてデプロイします。
                    <span className="block text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1">
                      ※ 会社のGoogleアカウントで「全員」が選べない場合は、無料の個人用Gmailアカウント側で同じ手順を行えば制限なく使えます。
                    </span>
                  </li>
                  <li>発行された「ウェブアプリURL（https://script.google.com/macros/s/.../exec）」を下のSTEP 2へ貼り付けてください。</li>
                </ol>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] font-bold text-slate-500">
                    Drive内に「介護シフト共有データ」フォルダを自動作成します
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyScript}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition cursor-pointer"
                  >
                    {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedScript ? 'コピーしました！' : 'GASコードをコピー'}</span>
                  </button>
                </div>

                <pre className="p-3 rounded-xl bg-slate-900 text-slate-100 text-[10px] font-mono max-h-44 overflow-auto leading-relaxed">
                  {GAS_TEMPLATE_CODE}
                </pre>
              </div>
            )}
          </div>

          {/* Step 2: GAS URL Input */}
          <div className="space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <span className="px-2 py-0.5 rounded-md bg-sky-700 text-white text-[10px]">STEP 2</span>
              <span>GAS ウェブアプリURL を登録</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="flex-1 min-w-[260px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:border-sky-600 focus:ring-2 focus:ring-sky-100 outline-hidden"
              />
              <button
                type="button"
                disabled={pinging || !isOnline}
                onClick={handleSaveAndTest}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pinging ? 'animate-spin' : ''}`} />
                <span>{pinging ? '接続確認中...' : '接続テスト＆有効化'}</span>
              </button>
            </div>

            {pingResult && (
              <div
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                  pingResult.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {pingResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{pingResult.msg}</span>
              </div>
            )}
          </div>

          {/* Step 3: Multi-facility Management & Share URLs */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <span className="px-2 py-0.5 rounded-md bg-sky-700 text-white text-[10px]">STEP 3</span>
                <span>拠点管理 & 拠点B/C用の専用共有URL発行</span>
              </div>
              <div className="flex items-center gap-2">
                {syncConfig.gasUrl && (
                  <button
                    type="button"
                    disabled={discovering || !isOnline}
                    onClick={handleDiscoverDrive}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                  >
                    <FolderSearch className="w-3.5 h-3.5 text-sky-700" />
                    <span>{discovering ? '読込中...' : 'Drive内の拠点を検索'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddForm((v) => !v)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-[11px] transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>拠点を追加 (B, C…)</span>
                </button>
              </div>
            </div>

            {/* Discovered Drive files */}
            {driveFiles.length > 0 && (
              <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200 space-y-2 text-xs">
                <div className="font-bold text-sky-900">Google Drive上で見つかった拠点データ:</div>
                <div className="flex flex-wrap gap-2">
                  {driveFiles.map((df) => (
                    <button
                      type="button"
                      key={df.facilityKey}
                      onClick={() => handleImportDiscovered(df)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-sky-300 hover:bg-sky-100 text-sky-900 font-bold text-[11px] transition cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{df.facilityName || df.facilityKey}</span>
                      <span className="text-[10px] text-slate-500">({df.facilityKey})</span>
                      {df.hasPasscode && <Shield className="w-3 h-3 text-amber-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add Facility Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddFacilitySubmit}
                className="p-4 rounded-xl bg-teal-50/60 border border-teal-200 space-y-3 text-xs"
              >
                <div className="font-bold text-teal-950">新しい拠点（施設）を登録</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">拠点名 *</label>
                    <input
                      type="text"
                      value={newFacLabel}
                      onChange={(e) => setNewFacLabel(e.target.value)}
                      placeholder="例：拠点B（デイサービス）"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      ファイルID（英数字・任意）
                    </label>
                    <input
                      type="text"
                      value={newFacKey}
                      onChange={(e) => setNewFacKey(e.target.value)}
                      placeholder="例：kyoten_b（空欄で自動）"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      合言葉 / パスコード（任意）
                    </label>
                    <input
                      type="text"
                      value={newFacPasscode}
                      onChange={(e) => setNewFacPasscode(e.target.value)}
                      placeholder="例：1234"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">初期データの作り方</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setNewFacMode('copy_patterns')}
                      className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                        newFacMode === 'copy_patterns'
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      現在のシフト設定のみ引き継ぐ（職員は空で開始）
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFacMode('demo')}
                      className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                        newFacMode === 'demo'
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      デモデータで開始
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFacMode('from_drive')}
                      className={`px-3 py-1.5 rounded-lg border font-bold transition cursor-pointer ${
                        newFacMode === 'from_drive'
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Driveに既にあるデータを読む
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 font-bold cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={creatingFac}
                    className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold cursor-pointer disabled:opacity-50"
                  >
                    {creatingFac ? '追加中...' : 'この拠点を追加'}
                  </button>
                </div>
              </form>
            )}

            {/* Facility List */}
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {syncConfig.facilities.map((entry) => {
                const isActive = entry.facilityKey === syncConfig.activeFacilityKey;
                return (
                  <div
                    key={entry.facilityKey}
                    className={`p-3 flex flex-wrap items-center justify-between gap-2 text-xs ${
                      isActive ? 'bg-sky-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                          isActive ? 'bg-sky-700 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {entry.facilityKey}
                      </span>
                      <span className="font-bold text-slate-900 truncate">{entry.label}</span>
                      {entry.passcode && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-mono">
                          合言葉あり
                        </span>
                      )}
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          表示中
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!isActive && (
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={() => onSwitchFacility(entry.facilityKey)}
                          className="px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-800 text-white font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                        >
                          切り替える
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!syncConfig.gasUrl && !urlInput.trim()}
                        onClick={() => handleCopyShareUrl(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sky-300 bg-white hover:bg-sky-50 text-sky-900 font-bold text-[11px] transition cursor-pointer disabled:opacity-40"
                        title="この拠点専用の共有URLをコピーして担当者へ送れます"
                      >
                        {copiedShareKey === entry.facilityKey ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>コピー済み</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3 h-3 text-sky-700" />
                            <span>共有URLをコピー</span>
                          </>
                        )}
                      </button>
                      {syncConfig.facilities.length > 1 && !isActive && (
                        <button
                          type="button"
                          onClick={() => handleRemoveFacility(entry.facilityKey)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                          title="リストから削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500">
              ※ 各拠点の「共有URLをコピー」を拠点B・Cの担当者へ送るだけで、担当者はGoogleログインなしでその拠点専用の画面を開けます（A↔B、A↔Cの分離）。
            </p>
          </div>

          {/* Step 4: Manual Sync Controls */}
          {syncConfig.enabled && syncConfig.gasUrl && (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                現在の拠点（<strong>{activeEntry?.label || syncConfig.activeFacilityKey}</strong>）:{' '}
                {!isOnline
                  ? 'オフライン中（端末に一時保存中）'
                  : syncMeta.hadOfflineEdits
                  ? 'オフライン編集あり（同期確認が必要）'
                  : syncMeta.localDirty
                  ? '未送信の変更あり'
                  : syncMeta.lastSyncedAt
                  ? `最終同期 ${new Date(syncMeta.lastSyncedAt).toLocaleString('ja-JP')} (履歴 #${syncMeta.lastSyncedRevision})`
                  : 'まだDriveに未保存'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isOnline || isSyncing}
                  onClick={() => onManualPull()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-900 font-bold text-xs transition cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Driveから読込</span>
                </button>
                <button
                  type="button"
                  disabled={!isOnline || isSyncing}
                  onClick={() => onManualPush(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Driveへ今すぐ保存</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
