import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  Download,
  Smartphone,
  Monitor,
  Copy,
  Check,
  ExternalLink,
  X,
  CheckCircle,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, isInIframe, appUrl, install } =
    usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'pc' | 'ios' | 'android'>(
    isIOS ? 'ios' : isAndroid ? 'android' : 'pc'
  );

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl || window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API restricted
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleButtonClick = async () => {
    if (isInstallable && !isInIframe) {
      const ok = await install();
      if (!ok) {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  if (isInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-200 text-xs font-bold border border-emerald-400/30">
        <CheckCircle className="w-3.5 h-3.5 text-emerald-300" />
        <span>インストール済</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleButtonClick}
        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-700 px-3 py-1.5 text-xs font-black text-white shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
        title="アプリをPCまたはスマホにインストール"
      >
        <Download className="w-3.5 h-3.5" />
        <span>アプリをインストール</span>
      </button>

      {/* Installation Guide Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-blue-50 text-xl border border-blue-100">
                  📲
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-gray-900">
                    アプリのインストール手順（PWA）
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    PC・スマートフォン・タブレットのホーム画面に直接追加できます
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If in iframe: show clear explanation */}
            {isInIframe && (
              <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-2">
                <div className="flex items-start gap-2 font-bold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>AI Studioのプレビュー画面（iframe）内での制限について</span>
                </div>
                <p className="leading-relaxed text-amber-900/90 pl-6">
                  ブラウザのセキュリティ仕様により、埋め込みプレビュー枠内からは直接インストールダイアログを起動できません。
                  <strong>以下のURLをコピーして別タブまたはスマートフォンのブラウザで直接開く</strong>と、1クリックでホーム画面に追加できます。
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 pl-6">
                  <button
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'URLをコピーしました！' : 'アプリURLをコピー'}</span>
                  </button>
                  <a
                    href={appUrl || window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 font-bold transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>別タブで直接開く</span>
                  </a>
                </div>
              </div>
            )}

            {/* Direct install button if prompt is available and not in iframe */}
            {isInstallable && !isInIframe && (
              <div className="mt-4 p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between gap-3">
                <div className="text-xs text-blue-900 font-medium">
                  <strong>ワンクリックでインストール可能です：</strong>
                  <div className="text-blue-700 text-[11px] mt-0.5">
                    ボタンを押すとブラウザのインストール確認画面が表示されます。
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const ok = await install();
                    if (ok) setShowModal(false);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>今すぐインストール</span>
                </button>
              </div>
            )}

            {/* Device-specific tab navigation */}
            <div className="mt-5">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                端末別の追加手順：
              </div>
              <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('pc')}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeTab === 'pc'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  <span>パソコン (PC)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ios')}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeTab === 'ios'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>iPhone / iPad</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('android')}
                  className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    activeTab === 'android'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Android</span>
                </button>
              </div>

              {/* Instructions Content */}
              <div className="mt-4 p-4 rounded-2xl bg-gray-50 border border-gray-200 text-xs text-gray-800 space-y-3">
                {activeTab === 'pc' && (
                  <>
                    <div className="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
                      <Monitor className="w-4 h-4 text-blue-600" />
                      <span>Windows / Mac (Chrome または Edge)</span>
                    </div>
                    <ol className="space-y-2.5 list-decimal list-inside leading-relaxed text-gray-700">
                      <li>
                        ブラウザのアドレスバー（URL入力欄）の<strong>右端</strong>に表示される「<strong>インストール</strong>」アイコン（🖥️ または ⬇️）をクリックします。
                      </li>
                      <li>
                        またはブラウザ右上のメニュー「<strong>︙</strong>」→「<strong>『介護シフトAI』をインストール</strong>」を選択します。
                      </li>
                      <li>
                        確認ダイアログで「<strong>インストール</strong>」をクリックすると、デスクトップにアプリアイコンが生成され、独立した専用ウィンドウで起動します。
                      </li>
                    </ol>
                  </>
                )}

                {activeTab === 'ios' && (
                  <>
                    <div className="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
                      <Smartphone className="w-4 h-4 text-blue-600" />
                      <span>iPhone / iPad (Safari)</span>
                    </div>
                    <ol className="space-y-2.5 list-decimal list-inside leading-relaxed text-gray-700">
                      <li>
                        <strong>Safari</strong>でアプリのURLを開きます（Chrome等の他ブラウザではなくSafariをご利用ください）。
                      </li>
                      <li>
                        画面下部（iPadは右上）にある「<strong>共有</strong>」ボタン（四角から上矢印が出ているアイコン）をタップします。
                      </li>
                      <li>
                        共有メニューを下にスクロールして「<strong>ホーム画面に追加</strong>」をタップします。
                      </li>
                      <li>
                        右上の「<strong>追加</strong>」をタップすると、ホーム画面に専用アイコンが配置され、ワンタップで全画面起動できます。
                      </li>
                    </ol>
                  </>
                )}

                {activeTab === 'android' && (
                  <>
                    <div className="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
                      <Smartphone className="w-4 h-4 text-blue-600" />
                      <span>Android (Google Chrome)</span>
                    </div>
                    <ol className="space-y-2.5 list-decimal list-inside leading-relaxed text-gray-700">
                      <li>
                        <strong>Google Chrome</strong>でアプリのURLを開きます。
                      </li>
                      <li>
                        画面右上のメニューボタン「<strong>︙</strong>」をタップします。
                      </li>
                      <li>
                        メニュー内の「<strong>アプリをインストール</strong>」または「<strong>ホーム画面に追加</strong>」をタップします。
                      </li>
                      <li>
                        確認画面で「<strong>インストール</strong>」を押すと、スマホのホーム画面にアプリアイコンが追加されます。
                      </li>
                    </ol>
                  </>
                )}
              </div>
            </div>

            {/* PWA Benefits */}
            <div className="mt-4 p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-[11px] text-indigo-900 space-y-1">
              <div className="font-bold flex items-center gap-1 text-indigo-950">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-600" />
                <span>PWA（インストール版）のメリット</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-indigo-800">
                <li>ブラウザのアドレスバーなしで、ネイティブアプリ感覚の全画面で快適に操作可能</li>
                <li>電波の届かないオフライン環境でもシフト表の確認・入力が可能（自動キャッシュ）</li>
                <li>入力データはお手元の端末内に安全に保持されます</li>
              </ul>
            </div>

            {/* Modal Footer */}
            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs transition cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
