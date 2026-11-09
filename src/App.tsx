import React, { useState, useEffect } from 'react';
import { AppState } from './types';
import { getInitialDemoState, APP_VERSION } from './constants';
import { generateShifts } from './utils/shiftEngine';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import mascotLogo from './assets/mascot.png';

// Tabs
import { DashboardTab } from './components/tabs/DashboardTab';
import { FacilitiesTab } from './components/tabs/FacilitiesTab';
import { StaffTab } from './components/tabs/StaffTab';
import { PatternsTab } from './components/tabs/PatternsTab';
import { MaturityTab } from './components/tabs/MaturityTab';
import { CompatTab } from './components/tabs/CompatTab';
import { PreferenceTab } from './components/tabs/PreferenceTab';
import { GenerateTab } from './components/tabs/GenerateTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { BalanceTab } from './components/tabs/BalanceTab';
import { CheckTab } from './components/tabs/CheckTab';
import { ConfigTab } from './components/tabs/ConfigTab';

import {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  Award,
  HeartHandshake,
  CalendarDays,
  Sparkles,
  CalendarRange,
  TrendingUp,
  ShieldCheck,
  Settings,
} from 'lucide-react';

const DEFAULT_STORAGE_KEY = 'kaigo_shift_pro_state_v1';

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const storageKey = localStorage.getItem('kaigo_active_storage_key') || DEFAULT_STORAGE_KEY;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.facility && parsed.staff) {
          const mShifts = parsed.monthlyShifts || {};
          const mPrefs = parsed.monthlyPreferences || {};
          const key = `${parsed.year || 2026}-${parsed.month || 11}`;
          if (!mShifts[key]) {
            mShifts[key] = parsed.shifts || generateShifts(parsed);
          }
          if (!mPrefs[key]) {
            mPrefs[key] = parsed.preferences || {};
          }
          return {
            ...parsed,
            shifts: mShifts[key],
            preferences: mPrefs[key],
            monthlyShifts: mShifts,
            monthlyPreferences: mPrefs,
            storageCustomName: storageKey,
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
    const initial = getInitialDemoState();
    const key = `${initial.year}-${initial.month}`;
    const generated = generateShifts(initial);
    return {
      ...initial,
      shifts: generated,
      monthlyShifts: { [key]: generated },
      monthlyPreferences: { [key]: initial.preferences || {} },
      storageCustomName: DEFAULT_STORAGE_KEY,
    };
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // Persist to localStorage whenever state changes
  useEffect(() => {
    try {
      const storageKey = state.storageCustomName || DEFAULT_STORAGE_KEY;
      localStorage.setItem('kaigo_active_storage_key', storageKey);
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }
  }, [state]);

  const updateState = (updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const next = updater(prev);
      const prevKey = `${prev.year}-${prev.month}`;
      const newKey = `${next.year}-${next.month}`;

      const mShifts = { ...(prev.monthlyShifts || next.monthlyShifts || {}) };
      const mPrefs = { ...(prev.monthlyPreferences || next.monthlyPreferences || {}) };

      // 前の月のシフト・希望を月別保存領域に確実に同期
      mShifts[prevKey] = prev.shifts;
      mPrefs[prevKey] = prev.preferences;

      if (next.year !== prev.year || next.month !== prev.month) {
        // 月が切り替わった場合：移動先の月のシフトを復元（なければ新規生成）
        let targetShifts = mShifts[newKey];
        let targetPrefs = mPrefs[newKey] || {};

        if (!targetShifts) {
          targetShifts = generateShifts({
            ...next,
            year: next.year,
            month: next.month,
            preferences: targetPrefs,
          });
          mShifts[newKey] = targetShifts;
          mPrefs[newKey] = targetPrefs;
        }

        return {
          ...next,
          shifts: targetShifts,
          preferences: targetPrefs,
          monthlyShifts: mShifts,
          monthlyPreferences: mPrefs,
        };
      }

      // 同一月内の更新（編集、AI生成、希望入力など）
      mShifts[newKey] = next.shifts;
      mPrefs[newKey] = next.preferences;

      return {
        ...next,
        monthlyShifts: mShifts,
        monthlyPreferences: mPrefs,
      };
    });
  };

  const tabs = [
    { id: 'dashboard', label: 'ダッシュボード', icon: LayoutDashboard },
    { id: 'facilities', label: '事業所設定', icon: Building2 },
    { id: 'staff', label: '職員マスタ', icon: Users },
    { id: 'patterns', label: 'シフト設定', icon: Clock },
    { id: 'maturity', label: 'スキル', icon: Award },
    { id: 'compat', label: '相性', icon: HeartHandshake },
    { id: 'preference', label: '希望入力', icon: CalendarDays },
    { id: 'generate', label: 'AI生成', icon: Sparkles, highlight: true },
    { id: 'calendar', label: 'シフト表', icon: CalendarRange },
    { id: 'balance', label: 'バランス', icon: TrendingUp },
    { id: 'check', label: 'コンプライアンス', icon: ShieldCheck },
    { id: 'config', label: '設定', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col text-gray-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-blue-900 text-white shadow-md sticky top-0 z-40 border-b border-blue-800">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-1 rounded-xl bg-white/15 border border-white/20 shadow-xs flex items-center justify-center overflow-hidden" title="葉っぱの妖精マスコット">
              <img
                src={mascotLogo}
                alt="葉っぱの妖精マスコット"
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-lg"
              />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black tracking-tight">
                  介護シフトAI自動作成アプリ
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-blue-800/80 text-[11px] font-semibold text-blue-100 border border-blue-700">
                  {state.facility.name}
                </span>
              </div>
              <p className="text-[11px] text-blue-200/80 font-medium">
                労働基準法・36協定・介護保険人員配置基準チェック付き
              </p>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex flex-col items-end gap-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-2xs">
              ✨ {APP_VERSION}
            </span>
            <PWAInstallButton />
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="bg-slate-950/40 backdrop-blur-md border-t border-blue-900/50 px-4 overflow-x-auto scrollbar-none">
          <div className="max-w-[1800px] mx-auto flex items-center gap-1 py-1.5 min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md'
                      : tab.highlight
                      ? 'bg-purple-600/40 text-purple-200 hover:bg-purple-600/60 border border-purple-400/30'
                      : 'text-gray-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <DashboardTab state={state} onNavigateTab={setActiveTab} />
        )}
        {activeTab === 'facilities' && (
          <FacilitiesTab state={state} onUpdateState={updateState} />
        )}
        {activeTab === 'staff' && (
          <StaffTab state={state} onUpdateState={updateState} />
        )}
        {activeTab === 'patterns' && (
          <PatternsTab state={state} onUpdateState={updateState} />
        )}
        {activeTab === 'maturity' && (
          <MaturityTab state={state} onUpdateState={updateState} />
        )}
        {activeTab === 'compat' && (
          <CompatTab state={state} onUpdateState={updateState} />
        )}
        {activeTab === 'preference' && (
          <PreferenceTab state={state} onUpdateState={updateState} />
        )}
        {activeTab === 'generate' && (
          <GenerateTab
            state={state}
            onUpdateState={updateState}
            onNavigateTab={setActiveTab}
          />
        )}
        {activeTab === 'calendar' && (
          <CalendarTab state={state} onUpdateState={updateState} onNavigateTab={setActiveTab} />
        )}
        {activeTab === 'balance' && <BalanceTab state={state} />}
        {activeTab === 'check' && (
          <CheckTab state={state} onNavigateTab={setActiveTab} />
        )}
        {activeTab === 'config' && (
          <ConfigTab state={state} onUpdateState={updateState} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        <div className="max-w-[1800px] mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>介護シフトAI自動作成アプリ {APP_VERSION} &copy; 2026 — PWA Offline Supported</span>
          <span>労働基準法（34条休憩・36条協定）/ 介護保険法人員配置基準対応</span>
        </div>
      </footer>

      {/* Floating Offline Notification */}
      <OfflineIndicator />
    </div>
  );
}
