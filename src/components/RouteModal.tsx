import React, { useState } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown, Route as RouteIcon, Play, Upload } from 'lucide-react';
import { ManholeMasterItem, SurveyRoute } from '../types/survey';
import { loadRoutes, saveRoutes, buildSpans, lengthDiscrepancy, parseRouteImport } from '../utils/routes';
import { getSavedManholes } from './ManholeDbModal';

/**
 * 노선 관리.
 *
 * 맨홀을 상류에서 하류 순서대로 담으면 연속한 두 맨홀이 한 구간이 된다.
 * 맨홀 N개 → 구간 N-1개. 구간 연장은 좌표로 계산하고, 도면 연장표 값이
 * 함께 있으면 대조해서 어긋날 때 표시한다.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  /** 노선의 특정 구간으로 측량 시작 */
  onStartSpan: (routeId: string, spanIndex: number) => void;
}

export const RouteModal: React.FC<Props> = ({ isOpen, onClose, onToast, onStartSpan }) => {
  const [routes, setRoutes] = useState<SurveyRoute[]>(() => loadRoutes());
  const [manholes] = useState<ManholeMasterItem[]>(() => getSavedManholes());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [pickerTerm, setPickerTerm] = useState('');

  if (!isOpen) return null;

  const editing = routes.find(r => r.id === editingId) || null;
  const spans = buildSpans(editing, manholes);

  const persist = (list: SurveyRoute[]) => {
    setRoutes(list);
    saveRoutes(list);
  };

  const touch = (r: SurveyRoute): SurveyRoute => {
    const now = new Date();
    return { ...r, updatedAt: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` };
  };

  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target?.result as string;
      const res = content ? parseRouteImport(content, manholes) : null;
      if (!res) {
        onToast('노선 파일 형식이 아닙니다 (routes 목록이 있는 JSON)');
        return;
      }
      if (res.routes.length === 0) {
        onToast(
          res.missingNames.length
            ? `맨홀DB에 없는 이름뿐입니다 (${res.missingNames.length}종). 맨홀DB를 먼저 올리세요`
            : '가져올 노선이 없습니다'
        );
        return;
      }
      // 같은 이름은 덮어쓰지 않고 건너뛴다
      const existing = new Set(routes.map(r => r.name));
      const add = res.routes.filter(r => !existing.has(r.name));
      persist([...add, ...routes]);

      const notes = [`노선 ${add.length}개 추가`];
      if (res.routes.length - add.length > 0) notes.push(`이름 중복 ${res.routes.length - add.length}개 건너뜀`);
      if (res.dropped > 0) notes.push(`맨홀 부족 ${res.dropped}개 제외`);
      if (res.missingNames.length) notes.push(`DB에 없는 맨홀 ${res.missingNames.length}종`);
      onToast(notes.join(' · '));
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      onToast('노선 이름을 입력하세요 (예: 오수 간선 1공구)');
      return;
    }
    const route = touch({ id: `route_${Date.now()}`, name: newName.trim(), manholeIds: [], updatedAt: '' });
    persist([route, ...routes]);
    setEditingId(route.id);
    setNewName('');
    onToast(`노선 '${route.name}' 생성 — 맨홀을 순서대로 추가하세요`);
  };

  const updateEditing = (fn: (r: SurveyRoute) => SurveyRoute) => {
    if (!editing) return;
    persist(routes.map(r => (r.id === editing.id ? touch(fn(r)) : r)));
  };

  const addManhole = (mh: ManholeMasterItem) => {
    updateEditing(r => ({ ...r, manholeIds: [...r.manholeIds, mh.id] }));
  };

  const removeAt = (i: number) => {
    updateEditing(r => ({ ...r, manholeIds: r.manholeIds.filter((_, idx) => idx !== i) }));
  };

  const move = (i: number, dir: -1 | 1) => {
    updateEditing(r => {
      const ids = [...r.manholeIds];
      const j = i + dir;
      if (j < 0 || j >= ids.length) return r;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...r, manholeIds: ids };
    });
  };

  const orderedManholes = editing
    ? editing.manholeIds
      .map(id => manholes.find(m => m.id === id))
      .filter((m): m is ManholeMasterItem => !!m)
    : [];

  const candidates = manholes.filter(m =>
    !pickerTerm.trim() || m.name.toLowerCase().includes(pickerTerm.trim().toLowerCase())
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <b><RouteIcon size={15} /> 노선 · 다구간 측량</b>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {!editing ? (
            <>
              <div className="route-create">
                <input
                  type="text"
                  placeholder="새 노선 이름 (예: 오수 간선 1공구)"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
                <button type="button" className="btn primary" onClick={handleCreate}>
                  <Plus size={15} /> 만들기
                </button>
              </div>

              {/* 종단면도에서 뽑은 노선 순서를 그대로 받는다 */}
              <label className="btn route-import">
                <Upload size={15} /> 노선 파일 불러오기 (.json)
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = '';
                  }}
                />
              </label>

              {routes.length === 0 ? (
                <p className="route-empty">
                  아직 노선이 없습니다. 맨홀을 상류에서 하류 순서대로 담으면
                  구간이 자동으로 만들어집니다.
                </p>
              ) : (
                <div className="route-list">
                  {routes.map(r => {
                    const s = buildSpans(r, manholes);
                    return (
                      <div key={r.id} className="route-item">
                        <button type="button" className="route-open" onClick={() => setEditingId(r.id)}>
                          <b>{r.name}</b>
                          <span>맨홀 {r.manholeIds.length}개 · 구간 {s.length}개{r.updatedAt ? ` · ${r.updatedAt}` : ''}</span>
                        </button>
                        <button
                          type="button"
                          className="route-del"
                          onClick={() => {
                            persist(routes.filter(x => x.id !== r.id));
                            onToast(`노선 '${r.name}' 삭제`);
                          }}
                          aria-label={`${r.name} 삭제`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <button type="button" className="route-back" onClick={() => setEditingId(null)}>
                ← 노선 목록
              </button>

              <h3 className="route-title">{editing.name}</h3>

              {/* 노선에 담긴 맨홀 순서 */}
              <div className="route-order">
                {orderedManholes.length === 0 ? (
                  <p className="route-empty">아래에서 맨홀을 순서대로 추가하세요.</p>
                ) : orderedManholes.map((m, i) => (
                  <div key={`${m.id}-${i}`} className="route-node">
                    <span className="route-idx">{i + 1}</span>
                    <span className="route-name">{m.name}</span>
                    <span className="route-el">EL {m.invertEl}</span>
                    <div className="route-node-actions">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === orderedManholes.length - 1} aria-label="아래로"><ArrowDown size={14} /></button>
                      <button type="button" onClick={() => removeAt(i)} aria-label="제거"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* 구간 목록 */}
              {spans.length > 0 && (
                <div className="span-list">
                  <div className="span-head">구간 {spans.length}개 — 눌러서 측량 시작</div>
                  {spans.map(sp => {
                    const diff = lengthDiscrepancy(sp);
                    const mismatch = diff !== null && Math.abs(diff) > 0.5;
                    return (
                      <button
                        key={sp.index}
                        type="button"
                        className="span-item"
                        onClick={() => {
                          onStartSpan(editing.id, sp.index);
                          onClose();
                        }}
                      >
                        <span className="span-no">{sp.index + 1}</span>
                        <span className="span-name">{sp.start.name} ~ {sp.end.name}</span>
                        <span className="span-len">
                          {sp.length === null ? '연장 없음' : `${sp.length.toFixed(2)} m`}
                          {sp.coordLength !== null && <em> 좌표</em>}
                          {sp.coordLength === null && sp.sheetLength !== null && <em> 도면</em>}
                        </span>
                        {mismatch && (
                          <span className="span-warn">
                            도면 {sp.sheetLength!.toFixed(2)}m와 {Math.abs(diff!).toFixed(2)}m 차이
                          </span>
                        )}
                        <Play size={14} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 맨홀 추가 */}
              <div className="route-picker">
                <input
                  type="text"
                  placeholder="맨홀 검색해서 순서대로 추가..."
                  value={pickerTerm}
                  onChange={e => setPickerTerm(e.target.value)}
                />
                <div className="picker-grid">
                  {candidates.slice(0, 40).map(m => (
                    <button key={m.id} type="button" onClick={() => addManhole(m)}>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteModal;
