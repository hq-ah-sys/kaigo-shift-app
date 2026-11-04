import React, { useState } from 'react';
import { AppState, Facility, FacilityTypeId } from '../../types';
import { FACILITY_TYPES } from '../../constants';
import { Building2, Edit2, Users, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const FacilitiesTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [modalOpen, setModalOpen] = useState(false);

  const currentFacility = state.facility;

  // Form State
  const [name, setName] = useState(currentFacility.name);
  const [typeId, setTypeId] = useState<FacilityTypeId>(currentFacility.typeId);
  const [users, setUsers] = useState(currentFacility.users);
  const [bizDays, setBizDays] = useState<number[]>(currentFacility.bizDays || [1, 2, 3, 4, 5]);
  const [openTime, setOpenTime] = useState(currentFacility.openTime || '09:00');
  const [closeTime, setCloseTime] = useState(currentFacility.closeTime || '17:00');

  const openEditModal = () => {
    setName(currentFacility.name);
    setTypeId(currentFacility.typeId);
    setUsers(currentFacility.users);
    setBizDays(currentFacility.bizDays || [1, 2, 3, 4, 5]);
    setOpenTime(currentFacility.openTime || '09:00');
    setCloseTime(currentFacility.closeTime || '17:00');
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('事業所名を入力してください');
      return;
    }

    onUpdateState((prev) => {
      const updatedFc: Facility = {
        ...prev.facility,
        name: name.trim(),
        typeId,
        users,
        bizDays: typeId === 'dayservice' ? bizDays : undefined,
        openTime: typeId === 'dayservice' ? openTime : undefined,
        closeTime: typeId === 'dayservice' ? closeTime : undefined,
      };

      return {
        ...prev,
        facility: updatedFc,
        facilities: [updatedFc],
        activeFacilityId: updatedFc.id,
      };
    });

    setModalOpen(false);
  };

  const ft = FACILITY_TYPES.find((t) => t.id === currentFacility.typeId);
  const staffCount = state.staff.length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl p-3 rounded-2xl bg-blue-50 border border-blue-100 shrink-0">
              {ft?.icon || '🏢'}
            </span>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{currentFacility.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                  {ft?.name || 'その他'}
                </span>
                <span className="text-xs text-gray-500">
                  定員: <strong>{currentFacility.users}名</strong>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-xs transition cursor-pointer"
          >
            <Edit2 className="w-4 h-4" />
            <span>事業所情報を編集</span>
          </button>
        </div>
      </div>

      {/* Facility Details Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
            <Users className="w-4 h-4 text-blue-600" />
            <span>登録職員数</span>
          </div>
          <div className="text-3xl font-black text-gray-900">{staffCount}名</div>
          <div className="text-xs text-gray-400 mt-1">「職員マスタ」タブで管理</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
            <Clock className="w-4 h-4 text-purple-600" />
            <span>勤務パターン</span>
          </div>
          <div className="text-3xl font-black text-purple-700">
            {state.shiftPatterns.length}種類
          </div>
          <div className="text-xs text-gray-400 mt-1">「シフト設定」タブで管理</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>夜勤体制要件</span>
          </div>
          <div className="text-lg font-black text-gray-900 mt-1">
            {ft?.nightRequired ? '🌙 24時間常駐・夜勤必須' : '☀️ 日勤体制'}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {ft?.ratio ? `配置基準: ${ft.ratio}:1` : '配置基準に準拠'}
          </div>
        </div>
      </div>

      {/* Day Service Business Configuration (if day service) */}
      {currentFacility.typeId === 'dayservice' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>☀️ 通所介護（デイサービス）営業設定</span>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
            <div>
              <strong>営業曜日:</strong>{' '}
              {(currentFacility.bizDays || [1, 2, 3, 4, 5])
                .map((d) => ['日', '月', '火', '水', '木', '金', '土'][d])
                .join(', ')}
            </div>
            <div className="mt-1">
              <strong>営業時間:</strong> {currentFacility.openTime || '09:00'} 〜{' '}
              {currentFacility.closeTime || '17:00'}
            </div>
          </div>
        </div>
      )}

      {/* Facility Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              事業所情報を編集
            </h3>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  事業所名
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例：グループホーム さくら"
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  事業所種別（介護保険サービス種別）
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {FACILITY_TYPES.map((fType) => (
                    <button
                      type="button"
                      key={fType.id}
                      onClick={() => setTypeId(fType.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${
                        typeId === fType.id
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-bold'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{fType.icon}</span>
                      <span className="text-xs truncate">{fType.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  利用者定員数 (人)
                </label>
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={users}
                  onChange={(e) => setUsers(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-hidden font-medium"
                />
              </div>

              {typeId === 'dayservice' && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 space-y-3">
                  <div className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>☀️ 通所介護（デイサービス）営業日・営業時間</span>
                  </div>

                  <div>
                    <span className="block text-xs text-blue-800 font-semibold mb-1">営業曜日</span>
                    <div className="flex gap-2">
                      {['日', '月', '火', '水', '木', '金', '土'].map((dName, idx) => {
                        const checked = bizDays.includes(idx);
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => {
                              if (checked) {
                                setBizDays(bizDays.filter((d) => d !== idx));
                              } else {
                                setBizDays([...bizDays, idx]);
                              }
                            }}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition cursor-pointer ${
                              checked
                                ? 'bg-blue-600 text-white'
                                : 'bg-white border border-blue-200 text-gray-500'
                            }`}
                          >
                            {dName}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-xs text-blue-800 font-semibold mb-1">始業時刻</span>
                      <input
                        type="time"
                        value={openTime}
                        onChange={(e) => setOpenTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white font-medium text-xs"
                      />
                    </div>
                    <div>
                      <span className="block text-xs text-blue-800 font-semibold mb-1">終業時刻</span>
                      <input
                        type="time"
                        value={closeTime}
                        onChange={(e) => setCloseTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-blue-200 bg-white font-medium text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold text-xs transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
