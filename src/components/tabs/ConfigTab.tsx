import React, { useState } from 'react';
import { AppState } from '../../types';
import { getInitialDemoState } from '../../constants';
import { testAIServerConnection } from '../../utils/geminiAI';
import {
  downloadFile,
  pickFileToRead,
} from '../../utils/fileStorage';
import {
  Settings,
  Key,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  Server,
  FolderOpen,
  Save,
  Info,
} from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const ConfigTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [geminiModel, setGeminiModel] = useState(state.aiConfig.geminiModel || 'gemini-3.8-flash');
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(state.storageCustomName || 'kaigo_shift_pro_state_v1');

  // Backup & Restore states
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [lastBackupInfo, setLastBackupInfo] = useState<{ time: string; fileName: string } | null>(null);

  const handleSaveAIConfig = () => {
    onUpdateState((prev) => ({
      ...prev,
      aiConfig: {
        ...prev.aiConfig,
        geminiModel,
      },
    }));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await testAIServerConnection();
      setTestResult({
        success: res.success,
        msg: res.message,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        msg: `接続失敗: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  // デフォルトファイル名の生成
  const generateDefaultBackupName = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    return `介護シフトバックアップ_${state.facility.name}_${state.year}年${state.month}月度_${timeStr}.json`;
  };

  // 1. バックアップ（Downloadフォルダ固定で保存）
  const handleBackupClick = () => {
    setIsProcessing(true);
    setStatusMsg(null);
    const fileName = generateDefaultBackupName();
    const jsonStr = JSON.stringify(state, null, 2);

    try {
      downloadFile(fileName, jsonStr);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeDisplay = `${now.getHours()}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      setLastBackupInfo({
        time: timeDisplay,
        fileName,
      });
      setStatusMsg({
        type: 'success',
        text: `💾 バックアップファイルを保存しました: 「${fileName}」 (${timeDisplay})`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: `バックアップの保存に失敗しました: ${err.message}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. 復元（OSネイティブの「開く」ダイアログを起動）
  const handleRestore = async () => {
    setIsProcessing(true);
    setStatusMsg(null);
    try {
      // OSネイティブのファイル選択ダイアログを表示
      const result = await pickFileToRead();
      if (!result) {
        setIsProcessing(false);
        return; // キャンセル時
      }

      const { fileName, content } = result;
      const parsed = JSON.parse(content);

      if (!parsed.facility || !parsed.staff) {
        throw new Error('介護シフトのバックアップデータとして無効なファイル形式です。');
      }

      const confirmMsg = `選択されたバックアップファイル「${fileName}」を復元しますか？\n\n` +
        `【施設名】: ${parsed.facility.name || '不明'}\n` +
        `【対象年月】: ${parsed.year || state.year}年${parsed.month || state.month}月度\n` +
        `【職員数】: ${(parsed.staff || []).length}名\n\n` +
        `※現在の画面上のシフト表および設定がこのファイルの内容で上書き復元されます。`;

      if (window.confirm(confirmMsg)) {
        onUpdateState(() => parsed);
        setStatusMsg({
          type: 'success',
          text: `✅ バックアップファイル「${fileName}」からデータを正常に復元しました。`,
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: `復元エラー: ${err.message || 'ファイルの読み込みに失敗しました'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSlotChange = (newSlot: string) => {
    if (confirm(`ローカル保存先を "${newSlot}" に変更しますか？ (※別の保存先に切り替わります)`)) {
      setSelectedSlot(newSlot);
      localStorage.setItem('kaigo_active_storage_key', newSlot);
      const saved = localStorage.getItem(newSlot);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          onUpdateState(() => parsed);
          alert(`✅ 保存先 "${newSlot}" のデータを読み込みました`);
          return;
        } catch {}
      }
      onUpdateState((prev) => ({
        ...prev,
        storageCustomName: newSlot,
      }));
      alert(`✅ 保存先を "${newSlot}" に切り替えました`);
    }
  };

  const handleResetToDemo = () => {
    if (confirm('すべての変更を破棄し、初期デモデータに戻しますか？')) {
      const demo = getInitialDemoState();
      onUpdateState(() => demo);
      alert('初期デモデータに戻しました');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-600">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">システム設定</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              データのバックアップと復元、ブラウザ内自動保存、AI設定を行います
            </p>
          </div>
        </div>
      </div>

      {/* 💾 Backup & Restore Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Save className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-gray-900 text-base">データのバックアップ & 復元</h3>
          </div>
          <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
            PC / USBメモリ対応
          </span>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          現在のシフト表、職員マスタ、施設情報などの全データをファイルに保存（バックアップ）したり、保存したバックアップファイルからデータを復元します。
        </p>

        {/* Action Buttons: バックアップ & 復元 */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* バックアップボタン */}
          <button
            onClick={handleBackupClick}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition cursor-pointer disabled:opacity-50"
            title="バックアップファイルを保存します"
          >
            <Save className="w-4 h-4" />
            <span>💾 バックアップ</span>
          </button>

          {/* 復元ボタン */}
          <button
            onClick={handleRestore}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-xs transition cursor-pointer disabled:opacity-50"
            title="バックアップファイルを選択して現在のデータを復元します"
          >
            <FolderOpen className="w-4 h-4" />
            <span>📂 復元</span>
          </button>
        </div>

        {/* Status Message Display */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusMsg.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {statusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {statusMsg.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
            {statusMsg.type === 'info' && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Last Saved File Information */}
        {lastBackupInfo && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 flex items-center justify-between">
            <span className="font-medium">
              直近のバックアップ: <strong className="text-gray-900">{lastBackupInfo.fileName}</strong>
            </span>
            <span className="text-[11px] text-gray-400 font-mono">{lastBackupInfo.time}</span>
          </div>
        )}

        {/* Backup Destination Notice */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-medium flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>バックアップの保存先は、「Download」フォルダ</span>
        </div>
      </div>

      {/* Local Storage Slot Setting */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <HardDrive className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-gray-900 text-base">ブラウザ内蔵自動保存スロット</h3>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          普段の作業内容は、ファイルに保存しなくてもブラウザ内にリアルタイムで自動保存されています。
          この「スロット」を切り替えることで、同じブラウザ内で別の事業所データやテスト用データを分けて管理することができます。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedSlot}
            onChange={(e) => handleSlotChange(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:border-purple-600 outline-hidden"
          >
            <option value="kaigo_shift_pro_state_v1">スロット 1 (標準: kaigo_shift_pro_state_v1)</option>
            <option value="kaigo_shift_pro_slot_2">スロット 2 (バックアップ・別事業所用)</option>
            <option value="kaigo_shift_pro_slot_3">スロット 3 (テスト・別月用)</option>
          </select>
          <span className="text-[11px] text-gray-500">
            保存先キー: <code className="bg-gray-200 px-1.5 py-0.5 rounded font-mono">{selectedSlot}</code>
          </span>
        </div>
      </div>

      {/* AI Provider & API Key Settings */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
          <Key className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-gray-900 text-base">Gemini AI API 設定</h3>
        </div>

        <div className="space-y-4 text-xs sm:text-sm">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-900">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <Server className="w-4.5 h-4.5 text-blue-600 shrink-0" />
              <span>クライアントサイド・AIエンジン統合稼働中（完全無料・サーバーレス対応）</span>
            </div>
            <p className="text-gray-600 leading-relaxed">
              自然言語による個別指示の解析やコンプライアンス診断は、ローカルのスマートAIエンジンおよびサーバーレス環境で安全に動作します。
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              使用モデル
            </label>
            <select
              value={geminiModel}
              onChange={(e) => setGeminiModel(e.target.value)}
              className="w-full max-w-sm px-3.5 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-700 focus:border-blue-600 outline-hidden"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (推奨・高速高精度)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (軽量)</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleSaveAIConfig}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
            >
              設定を保存する
            </button>

            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2.5 rounded-xl border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>{testing ? '接続テスト中...' : '🔌 API接続テスト'}</span>
            </button>

            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>設定を保存しました</span>
              </span>
            )}
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{testResult.msg}</span>
            </div>
          )}
        </div>
      </div>

      {/* Reset Section */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-gray-900 text-base">⚠️ 初期デモデータへのリセット</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            すべての変更を破棄し、初期のデモデータ（サンプル事業所・職員）に戻します。
          </p>
        </div>
        <button
          onClick={handleResetToDemo}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold text-xs transition cursor-pointer shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
          <span>初期デモデータに戻す</span>
        </button>
      </div>
    </div>
  );
};
