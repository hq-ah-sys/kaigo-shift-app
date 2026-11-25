import { AppState } from '../types';

export interface SyncFacilityEntry {
  facilityKey: string;
  label: string;
  passcode: string;
}

export interface SyncConfig {
  enabled: boolean;
  gasUrl: string;
  role: 'admin' | 'branch';
  activeFacilityKey: string;
  facilities: SyncFacilityEntry[];
  deviceLabel?: string;
}

export interface SyncFacilityMeta {
  lastSyncedRevision: number;
  lastSyncedAt: number;
  localUpdatedAt: number;
  localDirty: boolean;
  hadOfflineEdits: boolean;
}

export interface GasSyncSummary {
  facilityName: string;
  year: number;
  month: number;
  staffCount: number;
}

export interface GasSyncRecord {
  facilityKey: string;
  facilityName: string;
  revision: number;
  updatedAt: number;
  updatedBy?: string;
  summary?: GasSyncSummary;
  state: AppState;
}

export interface SyncConflictData {
  facilityKey: string;
  facilityLabel: string;
  reason: 'offline_recovery' | 'remote_conflict';
  localUpdatedAt: number;
  localSummary: GasSyncSummary;
  localState: AppState;
  remoteRecord: GasSyncRecord;
}

const SYNC_CONFIG_KEY = 'kaigo_gas_sync_config_v1';
const SYNC_META_KEY = 'kaigo_gas_sync_meta_v1';
const FACILITY_STATE_PREFIX = 'kaigo_gas_facility_state_v1_';

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  enabled: false,
  gasUrl: '',
  role: 'admin',
  activeFacilityKey: 'kyoten_a',
  facilities: [
    {
      facilityKey: 'kyoten_a',
      label: '拠点A（本部）',
      passcode: '',
    },
  ],
  deviceLabel: 'PC',
};

export function sanitizeFacilityKey(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || 'kyoten_a';
}

export function loadSyncConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const facilities: SyncFacilityEntry[] = Array.isArray(parsed.facilities) && parsed.facilities.length > 0
          ? parsed.facilities.map((f: any) => ({
              facilityKey: sanitizeFacilityKey(f.facilityKey || 'kyoten_a'),
              label: String(f.label || f.facilityKey || '拠点'),
              passcode: String(f.passcode || ''),
            }))
          : DEFAULT_SYNC_CONFIG.facilities;
        const activeKey = sanitizeFacilityKey(parsed.activeFacilityKey || facilities[0].facilityKey);
        return {
          enabled: Boolean(parsed.enabled),
          gasUrl: String(parsed.gasUrl || '').trim(),
          role: parsed.role === 'branch' ? 'branch' : 'admin',
          activeFacilityKey: activeKey,
          facilities,
          deviceLabel: String(parsed.deviceLabel || '端末'),
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load sync config:', e);
  }
  return { ...DEFAULT_SYNC_CONFIG, facilities: [...DEFAULT_SYNC_CONFIG.facilities] };
}

export function saveSyncConfig(config: SyncConfig): void {
  try {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save sync config:', e);
  }
}

export function loadAllSyncMeta(): Record<string, SyncFacilityMeta> {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.warn('Failed to load sync meta:', e);
  }
  return {};
}

export function getFacilitySyncMeta(facilityKey: string): SyncFacilityMeta {
  const all = loadAllSyncMeta();
  return (
    all[facilityKey] || {
      lastSyncedRevision: 0,
      lastSyncedAt: 0,
      localUpdatedAt: 0,
      localDirty: false,
      hadOfflineEdits: false,
    }
  );
}

export function saveFacilitySyncMeta(facilityKey: string, meta: SyncFacilityMeta): void {
  try {
    const all = loadAllSyncMeta();
    all[facilityKey] = meta;
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Failed to save sync meta:', e);
  }
}

export function loadCachedFacilityState(facilityKey: string): AppState | null {
  try {
    const raw = localStorage.getItem(`${FACILITY_STATE_PREFIX}${sanitizeFacilityKey(facilityKey)}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.facility && Array.isArray(parsed.staff)) {
      return parsed as AppState;
    }
  } catch (e) {
    console.warn('Failed to load cached facility state:', e);
  }
  return null;
}

export function saveCachedFacilityState(facilityKey: string, state: AppState): void {
  try {
    localStorage.setItem(
      `${FACILITY_STATE_PREFIX}${sanitizeFacilityKey(facilityKey)}`,
      JSON.stringify(state)
    );
  } catch (e) {
    console.warn('Failed to save cached facility state:', e);
  }
}

export function summarizeAppState(state: AppState): GasSyncSummary {
  return {
    facilityName: state.facility?.name || '未設定施設',
    year: state.year || new Date().getFullYear(),
    month: state.month || new Date().getMonth() + 1,
    staffCount: Array.isArray(state.staff) ? state.staff.length : 0,
  };
}

export function parseShareParamsFromUrl(): {
  gasUrl: string;
  facilityKey: string;
  passcode: string;
  label: string;
} | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const gas = params.get('gas')?.trim();
    const fac = params.get('fac')?.trim();
    if (!gas || !fac) return null;

    if (!gas.startsWith('https://script.google.com/')) {
      return null;
    }

    const code = params.get('code') || '';
    const label = params.get('name') || fac;
    return {
      gasUrl: gas,
      facilityKey: sanitizeFacilityKey(fac),
      passcode: code,
      label,
    };
  } catch {
    return null;
  }
}

export function buildBranchShareUrl(
  gasUrl: string,
  entry: SyncFacilityEntry
): string {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const params = new URLSearchParams();
  params.set('gas', gasUrl.trim());
  params.set('fac', sanitizeFacilityKey(entry.facilityKey));
  if (entry.passcode) {
    params.set('code', entry.passcode);
  }
  if (entry.label) {
    params.set('name', entry.label);
  }
  return `${baseUrl}?${params.toString()}`;
}

async function callGasEndpoint<T = any>(
  gasUrl: string,
  payload: Record<string, any>
): Promise<T> {
  const cleanUrl = gasUrl.trim();
  if (!cleanUrl.startsWith('https://script.google.com/')) {
    throw new Error('有効なGoogle Apps ScriptのウェブアプリURL（https://script.google.com/...）を入力してください');
  }

  const res = await fetch(cleanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`通信エラー (HTTP ${res.status})`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('GASからの応答を解析できませんでした（デプロイ設定で「アクセスできるユーザー：全員」になっているか確認してください）');
  }

  return parsed as T;
}

export async function gasPing(gasUrl: string): Promise<{
  ok: boolean;
  folderName?: string;
  folderId?: string;
  error?: string;
}> {
  return callGasEndpoint(gasUrl, { action: 'ping' });
}

export async function gasFetchMeta(
  gasUrl: string,
  facilityKey: string,
  passcode: string
): Promise<{
  ok: boolean;
  exists?: boolean;
  revision?: number;
  updatedAt?: number;
  updatedBy?: string;
  facilityName?: string;
  summary?: GasSyncSummary;
  error?: string;
  message?: string;
}> {
  return callGasEndpoint(gasUrl, {
    action: 'meta',
    facilityKey: sanitizeFacilityKey(facilityKey),
    passcode,
  });
}

export async function gasLoadFacility(
  gasUrl: string,
  facilityKey: string,
  passcode: string
): Promise<{
  ok: boolean;
  exists?: boolean;
  record?: GasSyncRecord;
  error?: string;
  message?: string;
}> {
  return callGasEndpoint(gasUrl, {
    action: 'load',
    facilityKey: sanitizeFacilityKey(facilityKey),
    passcode,
  });
}

export async function gasSaveFacility(
  gasUrl: string,
  facilityKey: string,
  passcode: string,
  state: AppState,
  options?: {
    expectedRevision?: number;
    force?: boolean;
    updatedBy?: string;
  }
): Promise<{
  ok: boolean;
  revision?: number;
  updatedAt?: number;
  record?: GasSyncRecord;
  error?: string;
  message?: string;
}> {
  return callGasEndpoint(gasUrl, {
    action: 'save',
    facilityKey: sanitizeFacilityKey(facilityKey),
    passcode,
    expectedRevision: options?.expectedRevision ?? 0,
    force: Boolean(options?.force),
    updatedBy: options?.updatedBy || 'Web',
    facilityName: state.facility?.name || facilityKey,
    summary: summarizeAppState(state),
    state,
  });
}

export async function gasListFacilities(gasUrl: string): Promise<{
  ok: boolean;
  facilities?: Array<{
    facilityKey: string;
    facilityName: string;
    revision: number;
    updatedAt: number;
    hasPasscode: boolean;
  }>;
  error?: string;
  message?: string;
}> {
  return callGasEndpoint(gasUrl, { action: 'list' });
}

export const GAS_TEMPLATE_CODE = `// ==========================================================
// 介護シフトAI自動作成アプリ - Google Drive 共有サーバー (GAS)
// 完全無料・Google Cloud課金ゼロ / 拠点間自動同期用スクリプト
// ==========================================================

// 【任意】特定のフォルダIDを使いたい場合はここに入力（空欄なら「介護シフト共有データ」フォルダを自動作成します）
var FOLDER_ID = '';
var DEFAULT_FOLDER_NAME = '介護シフト共有データ';

function getOrCreateFolder_() {
  if (FOLDER_ID && FOLDER_ID.trim() !== '') {
    return DriveApp.getFolderById(FOLDER_ID.trim());
  }
  var folders = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(DEFAULT_FOLDER_NAME);
}

function getSafeFileName_(facilityKey) {
  var safe = String(facilityKey || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return 'shift_' + safe + '.json';
}

function findFile_(folder, fileName) {
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) {
    return files.next();
  }
  return null;
}

function readRecord_(file) {
  var raw = file.getBlob().getDataAsString('UTF-8');
  return JSON.parse(raw);
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonOut_({
    ok: true,
    service: 'kaigo-shift-gas-sync',
    message: 'Google Drive 共有サーバーは正常に稼働しています'
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var action = body.action || 'ping';
    var folder = getOrCreateFolder_();

    if (action === 'ping') {
      return jsonOut_({
        ok: true,
        folderName: folder.getName(),
        folderId: folder.getId(),
        serverTime: Date.now()
      });
    }

    if (action === 'list') {
      var list = [];
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var name = f.getName();
        if (name.indexOf('shift_') === 0 && name.slice(-5) === '.json') {
          try {
            var rec = readRecord_(f);
            list.push({
              facilityKey: rec.facilityKey || name.replace(/^shift_|\\.json$/g, ''),
              facilityName: rec.facilityName || '',
              revision: rec.revision || 0,
              updatedAt: rec.updatedAt || 0,
              hasPasscode: Boolean(rec.passcode && String(rec.passcode).length > 0)
            });
          } catch (err) {}
        }
      }
      return jsonOut_({ ok: true, facilities: list });
    }

    var facilityKey = body.facilityKey;
    var passcode = String(body.passcode || '');
    if (!facilityKey) {
      return jsonOut_({ ok: false, error: 'MISSING_KEY', message: '拠点キーが指定されていません' });
    }

    var fileName = getSafeFileName_(facilityKey);

    if (action === 'meta' || action === 'load') {
      var file = findFile_(folder, fileName);
      if (!file) {
        return jsonOut_({ ok: true, exists: false, revision: 0, updatedAt: 0 });
      }
      var rec = readRecord_(file);
      if (rec.passcode && String(rec.passcode) !== '' && String(rec.passcode) !== passcode) {
        return jsonOut_({ ok: false, error: 'INVALID_PASSCODE', message: '合言葉（パスコード）が一致しません' });
      }
      if (action === 'meta') {
        return jsonOut_({
          ok: true,
          exists: true,
          revision: rec.revision || 1,
          updatedAt: rec.updatedAt || 0,
          updatedBy: rec.updatedBy || '',
          facilityName: rec.facilityName || '',
          summary: rec.summary || null
        });
      }
      return jsonOut_({
        ok: true,
        exists: true,
        record: {
          facilityKey: rec.facilityKey,
          facilityName: rec.facilityName,
          revision: rec.revision || 1,
          updatedAt: rec.updatedAt || 0,
          updatedBy: rec.updatedBy || '',
          summary: rec.summary || null,
          state: rec.state
        }
      });
    }

    if (action === 'save') {
      lock.waitLock(15000);
      var targetFile = findFile_(folder, fileName);
      var existing = targetFile ? readRecord_(targetFile) : null;

      if (existing && existing.passcode && String(existing.passcode) !== '' && String(existing.passcode) !== passcode) {
        return jsonOut_({ ok: false, error: 'INVALID_PASSCODE', message: '合言葉（パスコード）が一致しません' });
      }

      var currentRev = existing ? (existing.revision || 1) : 0;
      var expectedRev = Number(body.expectedRevision || 0);
      var force = Boolean(body.force);

      if (existing && !force && expectedRev !== currentRev) {
        return jsonOut_({
          ok: false,
          error: 'CONFLICT',
          message: '他の端末で新しいデータが保存されています',
          record: {
            facilityKey: existing.facilityKey,
            facilityName: existing.facilityName,
            revision: existing.revision || 1,
            updatedAt: existing.updatedAt || 0,
            updatedBy: existing.updatedBy || '',
            summary: existing.summary || null,
            state: existing.state
          }
        });
      }

      var nextRev = currentRev + 1;
      var now = Date.now();
      var newRecord = {
        facilityKey: facilityKey,
        facilityName: body.facilityName || (body.state && body.state.facility && body.state.facility.name) || facilityKey,
        passcode: passcode !== '' ? passcode : (existing && existing.passcode ? existing.passcode : ''),
        revision: nextRev,
        updatedAt: now,
        updatedBy: body.updatedBy || 'Web',
        summary: body.summary || null,
        state: body.state
      };

      var serialized = JSON.stringify(newRecord);
      if (targetFile) {
        targetFile.setContent(serialized);
      } else {
        folder.createFile(fileName, serialized, MimeType.PLAIN_TEXT);
      }

      return jsonOut_({
        ok: true,
        revision: nextRev,
        updatedAt: now
      });
    }

    return jsonOut_({ ok: false, error: 'UNKNOWN_ACTION', message: '未対応の操作です' });
  } catch (err) {
    return jsonOut_({ ok: false, error: 'SERVER_ERROR', message: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}`;
