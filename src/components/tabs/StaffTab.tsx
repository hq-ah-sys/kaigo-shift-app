import React, { useState } from 'react';
import { AppState, Staff } from '../../types';
import { ALL_ROLES, ALL_QUALS, MAT_STARS } from '../../constants';
import { exportStaffCSV, downloadStaffTemplate, parseCSV, parseAvailDays } from '../../utils/csvHelper';
import { Users, Plus, Download, Upload, FileText, Edit2, Trash2, GripVertical, Moon } from 'lucide-react';

interface Props {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export const StaffTab: React.FC<Props> = ({ state, onUpdateState }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [deletingStaff, setDeletingStaff] = useState<Staff | null>(null);

  // Drag and drop state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState<'常勤' | '非常勤' | 'パート'>('常勤');
  const [dedicated, setDedicated] = useState(true);
  const [roles, setRoles] = useState<string[]>(['介護職員']);
  const [quals, setQuals] = useState<string[]>(['介護福祉士']);
  const [hours, setHours] = useState(40);
  const [nightOption, setNightOption] = useState<'yes' | 'night_only' | 'no'>('no');
  const [mat, setMat] = useState(3);
  const [availDays, setAvailDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [availTimeEnabled, setAvailTimeEnabled] = useState(false);
  const [availStart, setAvailStart] = useState('07:00');
  const [availEnd, setAvailEnd] = useState('22:00');
  const [comment, setComment] = useState('');

  // Intra-facility multi-role daily hour allocation (同事業所内兼務の時間配分)
  const [roleHours, setRoleHours] = useState<Record<string, number>>({});

  // Inter-facility concurrent position state (他事業所との兼務)
  const [otherFacilityConcurrent, setOtherFacilityConcurrent] = useState(false);
  const [otherFacilityName, setOtherFacilityName] = useState('');
  const [interFacilityScheduleType, setInterFacilityScheduleType] = useState<'dow' | 'date'>('dow');
  const [interFacilityDays, setInterFacilityDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [interFacilityDates, setInterFacilityDates] = useState<number[]>(
    Array.from({ length: 30 }, (_, i) => i + 1)
  );

  const openAddModal = () => {
    setEditingStaff(null);
    setName('');
    setType('常勤');
    setDedicated(true);
    setRoles(['介護職員']);
    setRoleHours({});
    setQuals(['介護福祉士']);
    setHours(40);
    setNightOption('no');
    setMat(3);
    setAvailDays([0, 1, 2, 3, 4, 5, 6]);
    setAvailTimeEnabled(false);
    setAvailStart('07:00');
    setAvailEnd('22:00');
    setComment('');
    setOtherFacilityConcurrent(false);
    setOtherFacilityName('');
    setInterFacilityScheduleType('dow');
    setInterFacilityDays([0, 1, 2, 3, 4, 5, 6]);
    setInterFacilityDates(Array.from({ length: 30 }, (_, i) => i + 1));
    setModalOpen(true);
  };

  const openEditModal = (s: Staff) => {
    setEditingStaff(s);
    setName(s.name);
    setType(s.type);
    setDedicated(s.dedicated);
    const rList = Array.isArray(s.roles) ? s.roles : [s.role];
    setRoles(rList);
    setRoleHours(s.roleHours || {});
    setQuals(Array.isArray(s.quals) ? s.quals : [s.qual]);
    setHours(s.hours);
    setNightOption(s.nightOnly ? 'night_only' : s.night ? 'yes' : 'no');
    setMat(s.mat || 3);
    setAvailDays(s.availDays || []);
    setAvailTimeEnabled(!!s.availTimeEnabled);
    setAvailStart(s.availStart || '07:00');
    setAvailEnd(s.availEnd || '22:00');
    setComment(s.comment || '');
    setOtherFacilityConcurrent(!!s.otherFacilityConcurrent);
    setOtherFacilityName(s.otherFacilityName || '');
    setInterFacilityScheduleType(s.interFacilityScheduleType || 'dow');
    setInterFacilityDays(s.interFacilityDays || [0, 1, 2, 3, 4, 5, 6]);
    setInterFacilityDates(
      s.interFacilityDates || Array.from({ length: 30 }, (_, i) => i + 1)
    );
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('職員名を入力してください');
      return;
    }
    if (roles.length === 0) {
      alert('職種を少なくとも1つ選択してください');
      return;
    }

    const facId = state.facility.id;
    const isMultiRoleInFacility = roles.length > 1;
    const isDedicatedCalculated = !isMultiRoleInFacility && !otherFacilityConcurrent;

    onUpdateState((prev) => {
      let updatedStaff: Staff[];
      const staffObj: Staff = {
        id: editingStaff ? editingStaff.id : prev.nextStaffId,
        facilityId: facId,
        name: name.trim(),
        type,
        dedicated: isDedicatedCalculated,
        roles,
        roleHours: isMultiRoleInFacility ? roleHours : undefined,
        role: roles[0] || '介護職員',
        quals,
        qual: quals[0] || '資格なし',
        hours,
        night: nightOption === 'yes' || nightOption === 'night_only',
        nightOnly: nightOption === 'night_only',
        mat,
        availDays,
        availTimeEnabled,
        availStart: availTimeEnabled ? availStart : null,
        availEnd: availTimeEnabled ? availEnd : null,
        comment: comment.trim() || undefined,
        otherFacilityConcurrent,
        otherFacilityName: otherFacilityConcurrent ? otherFacilityName.trim() : undefined,
        interFacilityScheduleType: otherFacilityConcurrent ? interFacilityScheduleType : undefined,
        interFacilityDays: otherFacilityConcurrent && interFacilityScheduleType === 'dow' ? interFacilityDays : undefined,
        interFacilityDates: otherFacilityConcurrent && interFacilityScheduleType === 'date' ? interFacilityDates : undefined,
      };

      if (editingStaff) {
        updatedStaff = prev.staff.map((s) => (s.id === editingStaff.id ? staffObj : s));
      } else {
        updatedStaff = [...prev.staff, staffObj];
      }

      return {
        ...prev,
        staff: updatedStaff,
        nextStaffId: editingStaff ? prev.nextStaffId : prev.nextStaffId + 1,
      };
    });

    setModalOpen(false);
  };

  const handleDelete = (s: Staff) => {
    setDeletingStaff(s);
  };

  const confirmDelete = () => {
    if (!deletingStaff) return;
    const id = deletingStaff.id;
    onUpdateState((prev) => {
      const newShifts = { ...prev.shifts };
      delete newShifts[id];
      const newPreferences = { ...prev.preferences };
      delete newPreferences[id];

      return {
        ...prev,
        staff: prev.staff.filter((item) => item.id !== id),
        pairs: prev.pairs.filter((p) => p.a !== id && p.b !== id),
        lockedStaff: prev.lockedStaff.filter((sid) => sid !== id),
        shifts: newShifts,
        preferences: newPreferences,
      };
    });
    setDeletingStaff(null);
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          alert('CSVデータが見つかりません');
          return;
        }

        let added = 0;
        let updated = 0;

        const headerRow = rows[0].map((h) => h.trim());
        const getColIdx = (names: string[], defaultIdx: number) => {
          const found = headerRow.findIndex((h) => names.some((n) => h.includes(n)));
          return found >= 0 ? found : defaultIdx;
        };

        const idxName = getColIdx(['氏名', '名前', '職員名'], 0);
        const idxType = getColIdx(['雇用形態', '形態'], 1);
        const idxDedicated = getColIdx(['専従', '兼務'], 2);
        const idxRole = getColIdx(['職種'], 3);
        const idxQual = getColIdx(['資格'], 4);
        const idxHours = getColIdx(['週所定', '所定時間', '時間'], 5);
        const idxNight = getColIdx(['夜勤'], 6);
        const idxDays = getColIdx(['出勤可能曜日', '出勤可能日', '曜日'], 7);
        const idxTimeEn = getColIdx(['時間帯指定', '時間指定'], 8);
        const idxStart = getColIdx(['開始'], 9);
        const idxEnd = getColIdx(['終了'], 10);
        const idxSkill = getColIdx(['スキル', '成熟度', 'レベル'], 11);
        const idxNote = getColIdx(['特記', '備考', 'コメント'], 12);

        onUpdateState((prev) => {
          const newStaff = [...prev.staff];
          let nextId = prev.nextStaffId;
          const facId = prev.facility.id;

          rows.slice(1).forEach((cols) => {
            const staffName = cols[idxName]?.trim();
            if (!staffName) return;

            const staffType = (cols[idxType]?.trim() as any) || '常勤';
            const isDedicated = cols[idxDedicated]?.trim() === '専従';
            const roleList = (cols[idxRole] || '').split(/[/,、]/).map((s) => s.trim()).filter(Boolean);
            const qualList = (cols[idxQual] || '').split(/[/,、]/).map((s) => s.trim()).filter(Boolean);
            const hrs = parseInt(cols[idxHours], 10) || 40;
            const nightStr = cols[idxNight]?.trim();
            const isNight = nightStr === '可能' || nightStr === '夜勤のみ' || nightStr === '可' || nightStr === '有' || nightStr === '○' || nightStr === '〇';
            const isNightOnly = nightStr === '夜勤のみ' || nightStr === '夜専' || nightStr === '夜勤専従';
            const avDays = parseAvailDays(cols[idxDays]);
            const normalizeTime = (t?: string) => {
              if (!t) return '';
              const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
              return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
            };
            const normSt = normalizeTime(cols[idxStart]);
            const normEd = normalizeTime(cols[idxEnd]);
            const rawTimeFlag = cols[idxTimeEn]?.trim() || '';
            const timeEn =
              ['有', 'あり', '○', '〇', '可', 'true', 'TRUE', '1'].includes(rawTimeFlag) ||
              (rawTimeFlag !== '無' && rawTimeFlag !== 'なし' && Boolean(normSt && normEd));
            const avSt = timeEn ? normSt || '07:00' : null;
            const avEd = timeEn ? normEd || '22:00' : null;
            const skillLevel = parseInt(cols[idxSkill], 10) || 3;
            const note = cols[idxNote]?.trim() || undefined;

            const existingIdx = newStaff.findIndex((s) => s.name === staffName);
            const sObj: Staff = {
              id: existingIdx >= 0 ? newStaff[existingIdx].id : nextId++,
              facilityId: facId,
              name: staffName,
              type: staffType,
              dedicated: isDedicated,
              roles: roleList.length ? roleList : ['介護職員'],
              role: roleList[0] || '介護職員',
              quals: qualList.length ? qualList : ['資格なし'],
              qual: qualList[0] || '資格なし',
              hours: hrs,
              night: isNight,
              nightOnly: isNightOnly,
              mat: skillLevel,
              availDays: avDays,
              availTimeEnabled: timeEn,
              availStart: avSt,
              availEnd: avEd,
              comment: note,
            };

            if (existingIdx >= 0) {
              newStaff[existingIdx] = sObj;
              updated++;
            } else {
              newStaff.push(sObj);
              added++;
            }
          });

          return {
            ...prev,
            staff: newStaff,
            nextStaffId: nextId,
          };
        });

        alert(`✅ 職員マスタCSV取込完了: ${added}名追加、${updated}名更新`);
      } catch (err: any) {
        alert(`インポートに失敗しました: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx);
  };

  const handleDrop = (dropIdx: number) => {
    if (draggedIdx === null || draggedIdx === dropIdx) return;
    onUpdateState((prev) => {
      const copy = [...prev.staff];
      const [removed] = copy.splice(draggedIdx, 1);
      copy.splice(dropIdx, 0, removed);
      return { ...prev, staff: copy };
    });
    setDraggedIdx(null);
  };

  const WDS = ['日', '月', '火', '水', '木', '金', '土'];

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" />
              <span>職員マスタ一覧</span>
              <span className="text-xs font-semibold text-gray-500">
                ({state.facility.name}・全{state.staff.length}名)
              </span>
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              ドラッグ＆ドロップで並び替え可能。職種・資格・出勤可能曜日・時間帯を一元管理
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>職員を追加</span>
            </button>

            <button
              onClick={() => exportStaffCSV(state.staff, state.facility.name)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>CSV出力</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer">
              <Upload className="w-4 h-4" />
              <span>CSV取込</span>
              <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
            </label>

            <button
              onClick={downloadStaffTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold text-xs shadow-xs transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>テンプレート</span>
            </button>
          </div>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                <th className="py-3 px-3 w-8 text-center"></th>
                <th className="py-3 px-4">氏名</th>
                <th className="py-3 px-3">形態</th>
                <th className="py-3 px-3">専従/兼務</th>
                <th className="py-3 px-4">職種</th>
                <th className="py-3 px-4">資格</th>
                <th className="py-3 px-3">週所定</th>
                <th className="py-3 px-3">夜勤</th>
                <th className="py-3 px-4">出勤可能条件</th>
                <th className="py-3 px-3">スキル</th>
                <th className="py-3 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {state.staff.map((s, idx) => {
                const roles = Array.isArray(s.roles) ? s.roles : [s.role];
                const quals = Array.isArray(s.quals) ? s.quals : [s.qual];

                const dayStr =
                  s.availDays && s.availDays.length > 0
                    ? s.availDays.map((d) => WDS[d]).join(', ')
                    : '制限なし (いつでも可)';

                const timeStr =
                  s.availTimeEnabled && s.availStart
                    ? `${s.availStart}〜${s.availEnd}`
                    : '時間制限なし';

                return (
                  <tr
                    key={s.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    className="hover:bg-blue-50/40 transition group cursor-default"
                  >
                    <td className="py-3 px-3 text-center text-gray-400 group-hover:text-gray-600 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-4 h-4 mx-auto" />
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-900 whitespace-nowrap">
                      {s.name}
                      {s.comment && (
                        <span className="block text-[10px] text-gray-400 font-normal truncate max-w-[140px]">
                          {s.comment}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
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
                    <td className="py-3 px-3 whitespace-nowrap">
                      {s.roles && s.roles.length > 1 && s.otherFacilityConcurrent ? (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-purple-100 text-purple-800 border border-purple-300">
                          両方兼務 (同+他)
                        </span>
                      ) : s.otherFacilityConcurrent ? (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-indigo-100 text-indigo-800 border border-indigo-200">
                          他事業所兼務
                        </span>
                      ) : (s.roles && s.roles.length > 1) || !s.dedicated ? (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-orange-100 text-orange-800 border border-orange-200">
                          同事業所兼務
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200">
                          専従
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {roles.map((r, rIdx) => (
                          <span key={rIdx} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {quals.map((q, qIdx) => (
                          <span key={qIdx} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">
                            {q}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold text-gray-700 whitespace-nowrap">
                      {s.hours}h
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {s.nightOnly ? (
                        <span className="px-2 py-0.5 rounded-full bg-slate-900 text-blue-200 font-bold">
                          🌙 夜専
                        </span>
                      ) : s.night ? (
                        <span className="text-emerald-600 font-bold">可</span>
                      ) : (
                        <span className="text-gray-400">不可</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[11px] text-gray-500 leading-tight">
                      <div>曜日: {dayStr}</div>
                      <div>時間: {timeStr}</div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-bold text-amber-600">
                      {MAT_STARS[s.mat || 3]}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(s)}
                          className="p-1 rounded-md text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-1 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
              {editingStaff ? '職員情報を編集' : '新規職員を追加'}
            </h3>

            <div className="space-y-4 text-sm">
              {/* Name and Employment Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">氏名</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="田中 美咲"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium focus:border-blue-600 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">雇用形態</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium bg-white focus:border-blue-600 outline-hidden"
                  >
                    <option value="常勤">常勤</option>
                    <option value="非常勤">非常勤</option>
                    <option value="パート">パート</option>
                  </select>
                </div>
              </div>

              {/* Dedicated / Non-dedicated */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">専従 / 兼務</label>
                <div className="flex gap-4 mt-1">
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="dedicated"
                      checked={dedicated}
                      onChange={() => setDedicated(true)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>専従（介護業務専任）</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="radio"
                      name="dedicated"
                      checked={!dedicated}
                      onChange={() => setDedicated(false)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>兼務（他業務と兼任）</span>
                  </label>
                </div>
              </div>

              {/* Roles */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  担当職種（複数選択可 - パターン1: 同事業所内兼務）
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-gray-50 border border-gray-200">
                  {ALL_ROLES.map((r) => {
                    const checked = roles.includes(r);
                    return (
                      <button
                        type="button"
                        key={r}
                        onClick={() => {
                          if (checked) {
                            if (roles.length > 1) setRoles(roles.filter((x) => x !== r));
                          } else {
                            setRoles([...roles, r]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          checked
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                {roles.length > 1 && (
                  <div className="mt-2.5 p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                        <span>⏱️</span>
                        <span>1日あたりの職種別時間配分設定（同事業所内兼務）</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const eqVal = Math.round((8 / roles.length) * 10) / 10;
                          const newRH: Record<string, number> = {};
                          roles.forEach((r) => {
                            newRH[r] = eqVal;
                          });
                          setRoleHours(newRH);
                        }}
                        className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition cursor-pointer"
                      >
                        均等割り (8h÷{roles.length})
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {roles.map((r) => {
                        const curH = roleHours[r] ?? Math.round((8 / roles.length) * 10) / 10;
                        return (
                          <div
                            key={r}
                            className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-xl border border-blue-200 text-xs shadow-2xs"
                          >
                            <span className="font-bold text-gray-800 truncate flex-1">{r}</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0.5"
                                max="24"
                                step="0.5"
                                value={curH}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setRoleHours((prev) => ({ ...prev, [r]: val }));
                                }}
                                className="w-16 px-1.5 py-1 rounded-lg border border-blue-300 text-right font-black text-blue-900 bg-gray-50 focus:bg-white outline-hidden"
                              />
                              <span className="text-[11px] font-bold text-gray-500">h/日</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-blue-800 font-medium leading-tight">
                      ※1日の勤務時間（例: 8時間）を各職種に何時間ずつ配分するか設定します。シフト表では各職種行に指定時間（例: 管理者4h / 介護職4h）が自動振り分けされ、職種別の常勤換算（FTE）が正確に集計されます。
                    </p>
                  </div>
                )}
              </div>

              {/* Inter-facility Concurrent Position Section (パターン2 & 3) */}
              <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs font-bold text-purple-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={otherFacilityConcurrent}
                      onChange={(e) => setOtherFacilityConcurrent(e.target.checked)}
                      className="w-4 h-4 text-purple-600 rounded-sm"
                    />
                    <span>他事業所（別施設・外部事業所）との兼務あり</span>
                  </label>
                  {otherFacilityConcurrent && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-200 text-purple-800">
                      {roles.length > 1 ? 'パターン3: 両方兼務' : 'パターン2: 他事業所兼務'}
                    </span>
                  )}
                </div>

                {otherFacilityConcurrent && (
                  <div className="space-y-3 pt-1">
                    {/* Other Facility Name */}
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        兼務先事業所名
                      </label>
                      <input
                        type="text"
                        value={otherFacilityName}
                        onChange={(e) => setOtherFacilityName(e.target.value)}
                        placeholder="例: デイサービス あおい, 訪問介護サクラ"
                        className="w-full px-3 py-1.5 bg-white rounded-xl border border-purple-200 text-xs font-medium focus:border-purple-600 outline-hidden"
                      />
                    </div>

                    {/* Schedule Mode Selector (曜日 vs 日付) */}
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 mb-1">
                        当事業所の勤務指定方式 (デフォルト: 曜日設定)
                      </label>
                      <div className="flex rounded-xl border border-purple-300 overflow-hidden text-xs font-bold bg-white">
                        <button
                          type="button"
                          onClick={() => setInterFacilityScheduleType('dow')}
                          className={`flex-1 py-1.5 text-center transition cursor-pointer ${
                            interFacilityScheduleType === 'dow'
                              ? 'bg-purple-600 text-white'
                              : 'text-purple-700 hover:bg-purple-50'
                          }`}
                        >
                          曜日設定 (毎週固定)
                        </button>
                        <button
                          type="button"
                          onClick={() => setInterFacilityScheduleType('date')}
                          className={`flex-1 py-1.5 text-center transition cursor-pointer ${
                            interFacilityScheduleType === 'date'
                              ? 'bg-purple-600 text-white'
                              : 'text-purple-700 hover:bg-purple-50'
                          }`}
                        >
                          日付設定 (具体日指定)
                        </button>
                      </div>
                    </div>

                    {/* Schedule Settings View */}
                    {interFacilityScheduleType === 'dow' ? (
                      <div className="bg-white p-2.5 rounded-xl border border-purple-200 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-purple-900">
                            当事業所での勤務曜日を選択（未選択は他事業所勤務日）
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (interFacilityDays.length === 7) setInterFacilityDays([]);
                              else setInterFacilityDays([0, 1, 2, 3, 4, 5, 6]);
                            }}
                            className="text-[10px] text-purple-600 font-bold hover:underline"
                          >
                            {interFacilityDays.length === 7 ? '全解除' : '全選択'}
                          </button>
                        </div>
                        <div className="flex gap-1.5">
                          {['日', '月', '火', '水', '木', '金', '土'].map((dName, idx) => {
                            const isAtThisFacility = interFacilityDays.includes(idx);
                            return (
                              <button
                                type="button"
                                key={idx}
                                onClick={() => {
                                  if (isAtThisFacility) {
                                    setInterFacilityDays(interFacilityDays.filter((d) => d !== idx));
                                  } else {
                                    setInterFacilityDays([...interFacilityDays, idx].sort((a, b) => a - b));
                                  }
                                }}
                                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                  isAtThisFacility
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'bg-purple-100 border border-purple-200 text-purple-700'
                                }`}
                              >
                                <div>{dName}</div>
                                <div className="text-[9px] font-normal leading-none mt-0.5">
                                  {isAtThisFacility ? '当' : '他'}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white p-2.5 rounded-xl border border-purple-200 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-purple-900">
                            当事業所での勤務日付（1〜31日）を選択
                          </span>
                          <div className="flex gap-2 text-[10px]">
                            <button
                              type="button"
                              onClick={() =>
                                setInterFacilityDates(Array.from({ length: 30 }, (_, i) => i + 1))
                              }
                              className="text-purple-600 font-bold hover:underline"
                            >
                              全日（当事業所）
                            </button>
                            <button
                              type="button"
                              onClick={() => setInterFacilityDates([])}
                              className="text-purple-600 font-bold hover:underline"
                            >
                              クリア
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
                            const isAtThisFacility = interFacilityDates.includes(d);
                            return (
                              <button
                                type="button"
                                key={d}
                                onClick={() => {
                                  if (isAtThisFacility) {
                                    setInterFacilityDates(interFacilityDates.filter((x) => x !== d));
                                  } else {
                                    setInterFacilityDates([...interFacilityDates, d].sort((a, b) => a - b));
                                  }
                                }}
                                className={`py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                                  isAtThisFacility
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                                }`}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Qualifications */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  保有資格（複数選択可）
                </label>
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-gray-50 border border-gray-200">
                  {ALL_QUALS.map((q) => {
                    const checked = quals.includes(q);
                    return (
                      <button
                        type="button"
                        key={q}
                        onClick={() => {
                          if (checked) {
                            if (quals.length > 1) setQuals(quals.filter((x) => x !== q));
                          } else {
                            setQuals([...quals, q]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          checked
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white border border-gray-300 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {q}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hours and Night Shift */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    週所定労働時間 (時間)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={hours}
                    onChange={(e) => setHours(parseInt(e.target.value, 10) || 40)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium focus:border-blue-600 outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">夜勤対応</label>
                  <select
                    value={nightOption}
                    onChange={(e) => setNightOption(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium bg-white focus:border-blue-600 outline-hidden"
                  >
                    <option value="yes">対応可能</option>
                    <option value="night_only">夜勤専従（夜勤のみ）</option>
                    <option value="no">不可（日勤のみ）</option>
                  </select>
                </div>
              </div>

              {/* Skill Level */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  スキルレベル・成熟度
                </label>
                <div className="grid grid-cols-5 gap-1.5 mt-1">
                  {[1, 2, 3, 4, 5].map((lv) => (
                    <button
                      type="button"
                      key={lv}
                      onClick={() => setMat(lv)}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                        mat === lv
                          ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-xs text-amber-500">{MAT_STARS[lv]}</div>
                      <div className="text-[11px] font-bold mt-0.5">Lv.{lv}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Available Days */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-gray-700 uppercase">
                    出勤可能曜日（未選択=曜日制限なし）
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (availDays.length === 7) setAvailDays([]);
                      else setAvailDays([0, 1, 2, 3, 4, 5, 6]);
                    }}
                    className="text-[11px] text-blue-600 font-bold hover:underline"
                  >
                    {availDays.length === 7 ? '全解除' : '全選択'}
                  </button>
                </div>
                <div className="flex gap-2">
                  {['日', '月', '火', '水', '木', '金', '土'].map((dName, idx) => {
                    const checked = availDays.includes(idx);
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => {
                          if (checked) setAvailDays(availDays.filter((d) => d !== idx));
                          else setAvailDays([...availDays, idx]);
                        }}
                        className={`w-9 h-9 rounded-xl text-xs font-bold transition cursor-pointer ${
                          checked
                            ? idx === 0
                              ? 'bg-red-600 text-white'
                              : idx === 6
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-800 text-white'
                            : 'bg-white border border-gray-200 text-gray-400'
                        }`}
                      >
                        {dName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Available Time Slot */}
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={availTimeEnabled}
                    onChange={(e) => setAvailTimeEnabled(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded-sm"
                  />
                  <span>出勤可能な時間帯を指定する（非常勤・時短等）</span>
                </label>

                {availTimeEnabled && (
                  <div className="flex items-center gap-2 pt-1 text-xs">
                    <input
                      type="time"
                      value={availStart}
                      onChange={(e) => setAvailStart(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
                    />
                    <span className="text-gray-400 font-bold">〜</span>
                    <input
                      type="time"
                      value={availEnd}
                      onChange={(e) => setAvailEnd(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  備考・特記事項
                </label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="例：リーダー研修修了、送迎担当可能"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-medium focus:border-blue-600 outline-hidden"
                />
              </div>
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
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-gray-900 mb-2">職員の削除</h3>
            <p className="text-sm text-gray-600 mb-6">
              「<span className="font-bold text-gray-900">{deletingStaff.name}</span>」さんを削除してもよろしいですか？シフトや希望休のデータもあわせて削除されます。
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingStaff(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 font-bold text-xs transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
