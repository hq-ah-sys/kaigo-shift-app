import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from './types';
import { getInitialDemoState, APP_VERSION } from './constants';
import { generateShifts } from './utils/shiftEngine';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SyncConflictModal } from './components/SyncConflictModal';
import { GasSyncPanel } from './components/GasSyncPanel';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  SyncConfig,
  SyncFacilityEntry,
  SyncFacilityMeta,
  SyncConflictData,
  GasSyncRecord,
  loadSyncConfig,
  saveSyncConfig,
  getFacilitySyncMeta,
  saveFacilitySyncMeta,
  loadCachedFacilityState,
  saveCachedFacilityState,
  parseShareParamsFromUrl,
  summarizeAppState,
  gasFetchMeta,
  gasLoadFacility,
  gasSaveFacility,
} from './utils/gasSync';
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
  Cloud,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react';

const DEFAULT_STORAGE_KEY = 'kaigo_shift_pro_state_v1';

function normalizeAppState(parsed: any, fallbackStorageKey = DEFAULT_STORAGE_KEY): AppState {
  const base = parsed && parsed.facility && parsed.staff ? parsed : getInitialDemoState();
  const year = base.year || new Date().getFullYear();
  const month = base.month || new Date().getMonth() + 1;
  const mShifts = { ...(base.monthlyShifts || {}) };
  const mPrefs = { ...(base.monthlyPreferences || {}) };
  const key = `${year}-${month}`;
  if (!mShifts[key]) {
    mShifts[key] = base.shifts || generateShifts(base);
  }
  if (!mPrefs[key]) {
    mPrefs[key] = base.preferences || {};
  }
  return {
    ...base,
    year,
    month,
    shifts: mShifts[key],
    preferences: mPrefs[key],
    monthlyShifts: mShifts,
    monthlyPreferences: mPrefs,
    storageCustomName: base.storageCustomName || fallbackStorageKey,
  };
}

function initSyncConfigWithShareUrl(): SyncConfig {
  const existing = loadSyncConfig();
  const share = parseShareParamsFromUrl();
  if (!share) return existing;

  // Clean query parameters from address bar after capturing share config
  try {
    window.history.replaceState({}, '', window.location.pathname);
  } catch {
    // ignore if restricted
  }

  const matched = existing.facilities.find((f) => f.facilityKey === share.facilityKey);
  const updatedFacilities: SyncFacilityEntry[] = matched
    ? existing.facilities.map((f) =>
        f.facilityKey === share.facilityKey
          ? { ...f, label: share.label || f.label, passcode: share.passcode }
          : f
      )
    : [
        {
          facilityKey: share.facilityKey,
          label: share.label,
          passcode: share.passcode,
        },
      ];

  const nextConfig: SyncConfig = {
    enabled: true,
    gasUrl: share.gasUrl,
    role: 'branch',
    activeFacilityKey: share.facilityKey,
    facilities: updatedFacilities,
    deviceLabel: '拠点端末',
  };
  saveSyncConfig(nextConfig);
  return nextConfig;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => initSyncConfigWithShareUrl());

  const [state, setState] = useState<AppState>(() => {
    try {
      const cfg = loadSyncConfig();
      if (cfg.enabled) {
        const cached = loadCachedFacilityState(cfg.activeFacilityKey);
        if (cached) {
          return normalizeAppState(cached);
        }
      }
      const storageKey = localStorage.getItem('kaigo_active_storage_key') || DEFAULT_STORAGE_KEY;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.facility && parsed.staff) {
          return normalizeAppState(parsed, storageKey);
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
    return normalizeAppState(getInitialDemoState(), DEFAULT_STORAGE_KEY);
  });

  const [syncMeta, setSyncMeta] = useState<SyncFacilityMeta>(() =>
    getFacilitySyncMeta(syncConfig.activeFacilityKey)
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [conflictData, setConflictData] = useState<SyncConflictData | null>(null);
  const [conflictBusy, setConflictBusy] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  const stateRef = useRef(state);
  stateRef.current = state;
  const syncConfigRef = useRef(syncConfig);
  syncConfigRef.current = syncConfig;
  const conflictRef = useRef(conflictData);
  conflictRef.current = conflictData;
  const pushTimerRef = useRef<number | null>(null);
  const lastCheckAtRef = useRef<number>(0);
  const prevOnlineRef = useRef<boolean>(isOnline);

  const getActivePasscode = useCallback((cfg: SyncConfig, key: string) => {
    return cfg.facilities.find((f) => f.facilityKey === key)?.passcode || '';
  }, []);

  const getActiveLabel = useCallback((cfg: SyncConfig, key: string) => {
    return cfg.facilities.find((f) => f.facilityKey === key)?.label || stateRef.current.facility?.name || key;
  }, []);

  const persistLocalMirror = useCallback((targetState: AppState, cfg: SyncConfig) => {
    try {
      if (cfg.enabled) {
        saveCachedFacilityState(cfg.activeFacilityKey, targetState);
      }
      if (!cfg.enabled || cfg.role === 'admin') {
        const storageKey = targetState.storageCustomName || DEFAULT_STORAGE_KEY;
        localStorage.setItem('kaigo_active_storage_key', storageKey);
        localStorage.setItem(storageKey, JSON.stringify(targetState));
      }
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }
  }, []);

  // Apply remote Drive state locally without marking localDirty
  const applyRemoteRecord = useCallback(
    (facilityKey: string, record: GasSyncRecord) => {
      const normalized = normalizeAppState(record.state);
      setState(normalized);
      saveCachedFacilityState(facilityKey, normalized);
      if (syncConfigRef.current.role === 'admin' && facilityKey === syncConfigRef.current.activeFacilityKey) {
        const storageKey = normalized.storageCustomName || DEFAULT_STORAGE_KEY;
        try {
          localStorage.setItem(storageKey, JSON.stringify(normalized));
        } catch {
          // ignore quota error
        }
      }
      const nextMeta: SyncFacilityMeta = {
        lastSyncedRevision: record.revision || 1,
        lastSyncedAt: Date.now(),
        localUpdatedAt: record.updatedAt || Date.now(),
        localDirty: false,
        hadOfflineEdits: false,
      };
      saveFacilitySyncMeta(facilityKey, nextMeta);
      if (facilityKey === syncConfigRef.current.activeFacilityKey) {
        setSyncMeta(nextMeta);
      }
    },
    []
  );

  // Push local state to Google Drive via GAS
  const pushFacilityState = useCallback(
    async (facilityKey: string, targetState: AppState, force = false): Promise<boolean> => {
      const cfg = syncConfigRef.current;
      if (!cfg.enabled || !cfg.gasUrl || !navigator.onLine) return false;
      const passcode = getActivePasscode(cfg, facilityKey);
      const curMeta = getFacilitySyncMeta(facilityKey);

      setIsSyncing(true);
      setSyncError(null);
      try {
        const res = await gasSaveFacility(cfg.gasUrl, facilityKey, passcode, targetState, {
          expectedRevision: curMeta.lastSyncedRevision,
          force,
          updatedBy: cfg.deviceLabel || (cfg.role === 'admin' ? '本部' : '拠点'),
        });

        if (res.ok) {
          const nextMeta: SyncFacilityMeta = {
            lastSyncedRevision: res.revision || curMeta.lastSyncedRevision + 1,
            lastSyncedAt: res.updatedAt || Date.now(),
            localUpdatedAt: curMeta.localUpdatedAt || Date.now(),
            localDirty: false,
            hadOfflineEdits: false,
          };
          saveFacilitySyncMeta(facilityKey, nextMeta);
          if (facilityKey === syncConfigRef.current.activeFacilityKey) {
            setSyncMeta(nextMeta);
          }
          return true;
        }

        if (res.error === 'CONFLICT' && res.record) {
          setConflictData({
            facilityKey,
            facilityLabel: getActiveLabel(cfg, facilityKey),
            reason: curMeta.hadOfflineEdits ? 'offline_recovery' : 'remote_conflict',
            localUpdatedAt: curMeta.localUpdatedAt || Date.now(),
            localSummary: summarizeAppState(targetState),
            localState: targetState,
            remoteRecord: res.record,
          });
          return false;
        }

        setSyncError(res.message || 'Driveへの保存に失敗しました');
        return false;
      } catch (err: any) {
        if (!navigator.onLine) {
          const latestMeta = getFacilitySyncMeta(facilityKey);
          const offlineMeta: SyncFacilityMeta = { ...latestMeta, localDirty: true, hadOfflineEdits: true };
          saveFacilitySyncMeta(facilityKey, offlineMeta);
          if (facilityKey === syncConfigRef.current.activeFacilityKey) {
            setSyncMeta(offlineMeta);
          }
        }
        setSyncError(err.message || 'Drive通信エラー');
        return false;
      } finally {
        setIsSyncing(false);
      }
    },
    [getActiveLabel, getActivePasscode]
  );

  // Check remote Drive metadata and either auto-pull, auto-push, or ask user via modal
  const checkAndSyncFacility = useCallback(
    async (facilityKey: string, cfgOverride?: SyncConfig) => {
      const cfg = cfgOverride || syncConfigRef.current;
      if (!cfg.enabled || !cfg.gasUrl || !navigator.onLine) return;
      if (conflictRef.current) return;

      const passcode = getActivePasscode(cfg, facilityKey);
      const curMeta = getFacilitySyncMeta(facilityKey);
      lastCheckAtRef.current = Date.now();

      setIsSyncing(true);
      setSyncError(null);
      try {
        // If edits were made offline, always fetch remote and let user choose when remote exists
        if (curMeta.hadOfflineEdits) {
          const loadRes = await gasLoadFacility(cfg.gasUrl, facilityKey, passcode);
          if (!loadRes.ok) {
            setSyncError(loadRes.message || '同期確認に失敗しました');
            return;
          }
          if (loadRes.exists && loadRes.record) {
            const localData =
              facilityKey === cfg.activeFacilityKey
                ? stateRef.current
                : loadCachedFacilityState(facilityKey) || stateRef.current;
            setConflictData({
              facilityKey,
              facilityLabel: getActiveLabel(cfg, facilityKey),
              reason: 'offline_recovery',
              localUpdatedAt: curMeta.localUpdatedAt || Date.now(),
              localSummary: summarizeAppState(localData),
              localState: localData,
              remoteRecord: loadRes.record,
            });
          } else {
            const localData =
              facilityKey === cfg.activeFacilityKey
                ? stateRef.current
                : loadCachedFacilityState(facilityKey) || stateRef.current;
            await pushFacilityState(facilityKey, localData, true);
          }
          return;
        }

        const metaRes = await gasFetchMeta(cfg.gasUrl, facilityKey, passcode);
        if (!metaRes.ok) {
          setSyncError(metaRes.message || '共有メタデータの確認に失敗しました');
          return;
        }

        if (!metaRes.exists) {
          if (cfg.role === 'admin') {
            const localData =
              facilityKey === cfg.activeFacilityKey
                ? stateRef.current
                : loadCachedFacilityState(facilityKey);
            if (localData) {
              await pushFacilityState(facilityKey, localData, true);
            }
          } else {
            setSyncError('共有元（拠点A）のDrive上にこの拠点のデータがまだ作成されていません。');
          }
          return;
        }

        const remoteRev = metaRes.revision || 1;
        if (remoteRev > curMeta.lastSyncedRevision) {
          const loadRes = await gasLoadFacility(cfg.gasUrl, facilityKey, passcode);
          if (!loadRes.ok || !loadRes.record) {
            setSyncError(loadRes.message || '共有データの読み込みに失敗しました');
            return;
          }
          if (curMeta.localDirty) {
            const localData =
              facilityKey === cfg.activeFacilityKey
                ? stateRef.current
                : loadCachedFacilityState(facilityKey) || stateRef.current;
            setConflictData({
              facilityKey,
              facilityLabel: getActiveLabel(cfg, facilityKey),
              reason: 'remote_conflict',
              localUpdatedAt: curMeta.localUpdatedAt || Date.now(),
              localSummary: summarizeAppState(localData),
              localState: localData,
              remoteRecord: loadRes.record,
            });
          } else {
            applyRemoteRecord(facilityKey, loadRes.record);
          }
        } else if (curMeta.localDirty && remoteRev === curMeta.lastSyncedRevision) {
          const localData =
            facilityKey === cfg.activeFacilityKey
              ? stateRef.current
              : loadCachedFacilityState(facilityKey) || stateRef.current;
          await pushFacilityState(facilityKey, localData, false);
        }
      } catch (err: any) {
        setSyncError(err.message || 'Driveとの同期確認に失敗しました');
      } finally {
        setIsSyncing(false);
      }
    },
    [applyRemoteRecord, getActiveLabel, getActivePasscode, pushFacilityState]
  );

  // Sync on startup, when syncConfig changes, and when recovering from offline
  useEffect(() => {
    const cameOnline = !prevOnlineRef.current && isOnline;
    const wentOffline = prevOnlineRef.current && !isOnline;
    prevOnlineRef.current = isOnline;

    if (wentOffline && syncConfig.enabled) {
      const curMeta = getFacilitySyncMeta(syncConfig.activeFacilityKey);
      if (curMeta.localDirty && !curMeta.hadOfflineEdits) {
        const nextMeta = { ...curMeta, hadOfflineEdits: true };
        saveFacilitySyncMeta(syncConfig.activeFacilityKey, nextMeta);
        setSyncMeta(nextMeta);
      }
    }

    if (syncConfig.enabled && syncConfig.gasUrl && isOnline) {
      if (cameOnline || Date.now() - lastCheckAtRef.current > 2000) {
        checkAndSyncFacility(syncConfig.activeFacilityKey, syncConfig);
      }
    }
  }, [isOnline, syncConfig.enabled, syncConfig.gasUrl, syncConfig.activeFacilityKey, checkAndSyncFacility, syncConfig]);

  // Check for remote updates when window regains focus
  useEffect(() => {
    const handleFocusOrVisible = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const cfg = syncConfigRef.current;
      if (!cfg.enabled || !cfg.gasUrl || !navigator.onLine) return;
      if (conflictRef.current) return;
      if (Date.now() - lastCheckAtRef.current < 12000) return;
      checkAndSyncFacility(cfg.activeFacilityKey, cfg);
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
    };
  }, [checkAndSyncFacility]);

  const updateState = (updater: (prev: AppState) => AppState) => {
    setState((prev) => {
      const nextRaw = updater(prev);
      const prevKey = `${prev.year}-${prev.month}`;
      const newKey = `${nextRaw.year}-${nextRaw.month}`;

      const mShifts = { ...(prev.monthlyShifts || nextRaw.monthlyShifts || {}) };
      const mPrefs = { ...(prev.monthlyPreferences || nextRaw.monthlyPreferences || {}) };

      mShifts[prevKey] = prev.shifts;
      mPrefs[prevKey] = prev.preferences;

      let finalized: AppState;
      if (nextRaw.year !== prev.year || nextRaw.month !== prev.month) {
        let targetShifts = mShifts[newKey];
        let targetPrefs = mPrefs[newKey] || {};

        if (!targetShifts) {
          targetShifts = generateShifts({
            ...nextRaw,
            year: nextRaw.year,
            month: nextRaw.month,
            preferences: targetPrefs,
          });
          mShifts[newKey] = targetShifts;
          mPrefs[newKey] = targetPrefs;
        }

        finalized = {
          ...nextRaw,
          shifts: targetShifts,
          preferences: targetPrefs,
          monthlyShifts: mShifts,
          monthlyPreferences: mPrefs,
        };
      } else {
        mShifts[newKey] = nextRaw.shifts;
        mPrefs[newKey] = nextRaw.preferences;

        finalized = {
          ...nextRaw,
          monthlyShifts: mShifts,
          monthlyPreferences: mPrefs,
        };
      }

      const cfg = syncConfigRef.current;
      persistLocalMirror(finalized, cfg);

      if (cfg.enabled) {
        const curMeta = getFacilitySyncMeta(cfg.activeFacilityKey);
        const offlineNow = !navigator.onLine;
        const nextMeta: SyncFacilityMeta = {
          ...curMeta,
          localDirty: true,
          localUpdatedAt: Date.now(),
          hadOfflineEdits: curMeta.hadOfflineEdits || offlineNow,
        };
        saveFacilitySyncMeta(cfg.activeFacilityKey, nextMeta);
        setSyncMeta(nextMeta);

        if (cfg.gasUrl && !offlineNow && !nextMeta.hadOfflineEdits && !conflictRef.current) {
          if (pushTimerRef.current) {
            window.clearTimeout(pushTimerRef.current);
          }
          const activeKeySnap = cfg.activeFacilityKey;
          pushTimerRef.current = window.setTimeout(() => {
            pushFacilityState(activeKeySnap, stateRef.current, false);
          }, 1800);
        }
      }

      return finalized;
    });
  };

  const handleUpdateSyncConfig = (next: SyncConfig) => {
    if (next.enabled) {
      saveCachedFacilityState(next.activeFacilityKey, stateRef.current);
    }
    saveSyncConfig(next);
    setSyncConfig(next);
    setSyncMeta(getFacilitySyncMeta(next.activeFacilityKey));
  };

  const handleManualPush = async (force = false) => {
    const cfg = syncConfigRef.current;
    await pushFacilityState(cfg.activeFacilityKey, stateRef.current, force);
  };

  const handleManualPull = async () => {
    const cfg = syncConfigRef.current;
    if (!cfg.enabled || !cfg.gasUrl || !navigator.onLine) return;
    const passcode = getActivePasscode(cfg, cfg.activeFacilityKey);
    const curMeta = getFacilitySyncMeta(cfg.activeFacilityKey);
    setIsSyncing(true);
    setSyncError(null);
    try {
      const res = await gasLoadFacility(cfg.gasUrl, cfg.activeFacilityKey, passcode);
      if (!res.ok) {
        setSyncError(res.message || 'Driveからの読み込みに失敗しました');
        return;
      }
      if (!res.exists || !res.record) {
        setSyncError('Drive上にこの拠点のファイルがまだありません。「Driveへ今すぐ保存」を実行してください。');
        return;
      }
      if (curMeta.localDirty || curMeta.hadOfflineEdits) {
        setConflictData({
          facilityKey: cfg.activeFacilityKey,
          facilityLabel: getActiveLabel(cfg, cfg.activeFacilityKey),
          reason: curMeta.hadOfflineEdits ? 'offline_recovery' : 'remote_conflict',
          localUpdatedAt: curMeta.localUpdatedAt || Date.now(),
          localSummary: summarizeAppState(stateRef.current),
          localState: stateRef.current,
          remoteRecord: res.record,
        });
      } else {
        applyRemoteRecord(cfg.activeFacilityKey, res.record);
      }
    } catch (err: any) {
      setSyncError(err.message || '読み込みエラー');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSwitchFacility = async (targetKey: string) => {
    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }

    const curCfg = syncConfigRef.current;
    // Flush current facility local cache before switching
    saveCachedFacilityState(curCfg.activeFacilityKey, stateRef.current);

    const nextCfg: SyncConfig = {
      ...curCfg,
      activeFacilityKey: targetKey,
    };
    saveSyncConfig(nextCfg);
    setSyncConfig(nextCfg);
    setSyncError(null);

    const cached = loadCachedFacilityState(targetKey);
    const targetEntry = nextCfg.facilities.find((f) => f.facilityKey === targetKey);
    if (cached) {
      setState(normalizeAppState(cached));
    } else {
      const blank = normalizeAppState({
        ...getInitialDemoState(),
        facility: {
          ...getInitialDemoState().facility,
          name: targetEntry?.label || targetKey,
        },
      });
      setState(blank);
      saveCachedFacilityState(targetKey, blank);
    }
    setSyncMeta(getFacilitySyncMeta(targetKey));

    if (nextCfg.enabled && nextCfg.gasUrl && navigator.onLine) {
      await checkAndSyncFacility(targetKey, nextCfg);
    }
  };

  const handleCreateFacility = async (
    entry: SyncFacilityEntry,
    templateMode: 'copy_patterns' | 'demo' | 'from_drive'
  ) => {
    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    const curCfg = syncConfigRef.current;
    saveCachedFacilityState(curCfg.activeFacilityKey, stateRef.current);

    const nextCfg: SyncConfig = {
      ...curCfg,
      enabled: Boolean(curCfg.gasUrl) ? true : curCfg.enabled,
      activeFacilityKey: entry.facilityKey,
      facilities: [...curCfg.facilities, entry],
    };
    saveSyncConfig(nextCfg);
    setSyncConfig(nextCfg);
    setSyncError(null);

    if (templateMode === 'from_drive' && nextCfg.gasUrl && navigator.onLine) {
      setIsSyncing(true);
      try {
        const res = await gasLoadFacility(nextCfg.gasUrl, entry.facilityKey, entry.passcode);
        if (res.ok && res.exists && res.record) {
          applyRemoteRecord(entry.facilityKey, res.record);
          return;
        }
      } catch (err: any) {
        setSyncError(err.message || 'Drive読込エラー');
      } finally {
        setIsSyncing(false);
      }
    }

    let nextState: AppState;
    if (templateMode === 'copy_patterns') {
      const cur = stateRef.current;
      nextState = normalizeAppState({
        ...cur,
        facility: {
          ...cur.facility,
          id: 1,
          name: entry.label,
        },
        facilities: [
          {
            ...cur.facility,
            id: 1,
            name: entry.label,
          },
        ],
        staff: [],
        shifts: {},
        preferences: {},
        monthlyShifts: {},
        monthlyPreferences: {},
        pairs: [],
        parsedRules: [],
        lockedStaff: [],
        nextStaffId: 1,
      });
    } else {
      const demo = getInitialDemoState();
      nextState = normalizeAppState({
        ...demo,
        facility: {
          ...demo.facility,
          name: entry.label,
        },
        facilities: [
          {
            ...demo.facility,
            name: entry.label,
          },
        ],
      });
    }

    setState(nextState);
    saveCachedFacilityState(entry.facilityKey, nextState);
    const freshMeta: SyncFacilityMeta = {
      lastSyncedRevision: 0,
      lastSyncedAt: 0,
      localUpdatedAt: Date.now(),
      localDirty: true,
      hadOfflineEdits: false,
    };
    saveFacilitySyncMeta(entry.facilityKey, freshMeta);
    setSyncMeta(freshMeta);

    if (nextCfg.enabled && nextCfg.gasUrl && navigator.onLine) {
      await pushFacilityState(entry.facilityKey, nextState, true);
    }
  };

  const handleConflictChooseLocal = async () => {
    if (!conflictData) return;
    setConflictBusy(true);
    try {
      const ok = await pushFacilityState(conflictData.facilityKey, conflictData.localState, true);
      if (ok) {
        setConflictData(null);
      }
    } finally {
      setConflictBusy(false);
    }
  };

  const handleConflictChooseRemote = () => {
    if (!conflictData) return;
    applyRemoteRecord(conflictData.facilityKey, conflictData.remoteRecord);
    setConflictData(null);
  };

  const handleConflictPostpone = () => {
    setConflictData(null);
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
    <div className="min-h-screen bg-gradient-to-br from-sky-50/50 via-[#f8fbff] to-blue-50/50 flex flex-col text-slate-800 font-sans selection:bg-sky-700 selection:text-white">
      {/* Header */}
      <header className="bg-gradient-to-r from-sky-200/90 via-sky-100/90 to-blue-200/90 text-slate-900 shadow-xs sticky top-0 z-40 border-b border-sky-300/90 backdrop-blur-md">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-1 rounded-xl bg-white border border-sky-300 shadow-xs flex items-center justify-center overflow-hidden" title="葉っぱの妖精マスコット">
              <img
                src={mascotLogo}
                alt="葉っぱの妖精マスコット"
                className="w-8 h-8 sm:w-9 sm:h-9 object-contain rounded-lg"
              />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                  介護シフトAI自動作成アプリ
                </h1>
                {syncConfig.enabled && syncConfig.role === 'admin' && syncConfig.facilities.length > 1 ? (
                  <select
                    value={syncConfig.activeFacilityKey}
                    onChange={(e) => handleSwitchFacility(e.target.value)}
                    disabled={isSyncing}
                    title="表示・編集する拠点を切り替えます"
                    className="px-2.5 py-0.5 rounded-md bg-white/90 text-[11px] font-bold text-sky-950 border border-sky-400/70 focus:border-sky-700 outline-hidden cursor-pointer"
                  >
                    {syncConfig.facilities.map((f) => (
                      <option key={f.facilityKey} value={f.facilityKey}>
                        🏢 {f.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-md bg-sky-700/10 text-[11px] font-bold text-sky-950 border border-sky-400/50">
                    {state.facility.name}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 font-medium">
                労働基準法・36協定・介護保険人員配置基準チェック付き
              </p>
            </div>
          </div>

          {/* Header Controls */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (syncConfig.enabled && syncMeta.hadOfflineEdits && isOnline) {
                    checkAndSyncFacility(syncConfig.activeFacilityKey);
                  } else {
                    setShowSyncModal(true);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                  syncConfig.enabled && syncMeta.hadOfflineEdits
                    ? 'bg-amber-100 text-amber-900 border-amber-400 hover:bg-amber-200 animate-pulse'
                    : syncConfig.enabled
                    ? 'bg-white/90 text-sky-900 border-sky-400 hover:bg-white'
                    : 'bg-white/80 text-slate-700 border-sky-300 hover:bg-white'
                }`}
                title="Google Drive 拠点間共有設定・手動同期"
              >
                {syncConfig.enabled && syncMeta.hadOfflineEdits ? (
                  <>
                    <AlertTriangle className="w-3 h-3 text-amber-700" />
                    <span>同期の確認が必要</span>
                  </>
                ) : isSyncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 text-sky-700 animate-spin" />
                    <span>Drive同期中...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-3 h-3 text-sky-700" />
                    <span>{syncConfig.enabled ? 'Drive共有中' : 'Drive共有設定'}</span>
                  </>
                )}
              </button>

              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/85 text-sky-800 border border-sky-300">
                {APP_VERSION}
              </span>
            </div>
            <PWAInstallButton />
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="bg-sky-50/90 backdrop-blur-md border-t border-sky-300/70 px-4 overflow-x-auto scrollbar-none">
          <div className="max-w-[1800px] mx-auto flex items-center gap-1 py-1.5 min-w-max">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-sky-700 text-white shadow-sm'
                      : tab.highlight
                      ? 'bg-blue-100 text-blue-800 hover:bg-blue-200/80 border border-blue-300'
                      : 'text-slate-700 hover:bg-sky-100/80 hover:text-sky-950'
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
          <ConfigTab
            state={state}
            onUpdateState={updateState}
            syncConfig={syncConfig}
            syncMeta={syncMeta}
            isOnline={isOnline}
            isSyncing={isSyncing}
            syncError={syncError}
            onUpdateSyncConfig={handleUpdateSyncConfig}
            onManualPush={handleManualPush}
            onManualPull={handleManualPull}
            onSwitchFacility={handleSwitchFacility}
            onCreateFacility={handleCreateFacility}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-sky-300/70 bg-sky-100/60 py-4 text-center text-xs text-slate-600">
        <div className="max-w-[1800px] mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>介護シフトAI自動作成アプリ {APP_VERSION} &copy; 2026 — PWA Offline Supported</span>
          <span>労働基準法（34条休憩・36条協定）/ 介護保険法人員配置基準対応</span>
        </div>
      </footer>

      {/* GAS Sync Setup & Management Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl relative animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowSyncModal(false)}
              className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
            <GasSyncPanel
              syncConfig={syncConfig}
              syncMeta={syncMeta}
              isOnline={isOnline}
              isSyncing={isSyncing}
              syncError={syncError}
              state={state}
              onUpdateSyncConfig={handleUpdateSyncConfig}
              onManualPush={handleManualPush}
              onManualPull={handleManualPull}
              onSwitchFacility={async (key) => {
                await handleSwitchFacility(key);
                setShowSyncModal(false);
              }}
              onCreateFacility={handleCreateFacility}
            />
          </div>
        </div>
      )}

      {/* Offline Recovery / Conflict Resolution Modal */}
      <SyncConflictModal
        conflict={conflictData}
        busy={conflictBusy}
        onChooseLocal={handleConflictChooseLocal}
        onChooseRemote={handleConflictChooseRemote}
        onPostpone={handleConflictPostpone}
      />

      {/* Floating Offline Notification */}
      <OfflineIndicator />
    </div>
  );
}
