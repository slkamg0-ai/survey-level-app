import React, { useState } from 'react';
import { ManholeMasterItem } from '../types/survey';
import { Database, Plus, Trash2, X, FileText, Check, Upload, Search } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  onSelectManholes?: (startMh: ManholeMasterItem | null, endMh: ManholeMasterItem | null) => void;
}

export const MANHOLE_DB_KEY = 'survey_manhole_master_db_v1';

export function getSavedManholes(): ManholeMasterItem[] {
  try {
    const saved = localStorage.getItem(MANHOLE_DB_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error(e);
  }
  // 기본 샘플 데이터
  return [
    { id: '1', name: 'MH01', invertEl: '-0.430', remarks: '오수 시점맨홀' },
    { id: '2', name: 'MH02', invertEl: '-0.190', remarks: '오수 중간맨홀' },
    { id: '3', name: 'MH03', invertEl: '0.120', remarks: '오수 종점맨홀' },
    { id: '4', name: 'MH04', invertEl: '0.450', remarks: '우수 1호' }
  ];
}

export function saveManholeList(list: ManholeMasterItem[]) {
  try {
    localStorage.setItem(MANHOLE_DB_KEY, JSON.stringify(list));
  } catch (e) {
    console.error(e);
  }
}

export const ManholeDbModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onToast
}) => {
  const [items, setItems] = useState<ManholeMasterItem[]>(() => getSavedManholes());
  const [mhName, setMhName] = useState('');
  const [invertEl, setInvertEl] = useState('');
  const [remarks, setRemarks] = useState('');
  const [batchText, setBatchText] = useState('');
  const [showBatchInput, setShowBatchInput] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const handleAddItem = () => {
    if (!mhName.trim()) {
      onToast('맨홀 명칭(예: MH01)을 입력해주세요');
      return;
    }
    if (!invertEl.trim()) {
      onToast('관저고(EL)를 입력해주세요');
      return;
    }

    const newItem: ManholeMasterItem = {
      id: Date.now().toString(),
      name: mhName.trim().toUpperCase(),
      invertEl: invertEl.trim(),
      remarks: remarks.trim()
    };

    const updated = [newItem, ...items.filter(i => i.name.toUpperCase() !== newItem.name)];
    setItems(updated);
    saveManholeList(updated);
    setMhName('');
    setInvertEl('');
    setRemarks('');
    onToast(`✅ '${newItem.name}' 관저고(${newItem.invertEl}m) 등록 완료`);
  };

  const handleBatchImport = () => {
    if (!batchText.trim()) return;
    const lines = batchText.split('\n');
    const newItems: ManholeMasterItem[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/[,	\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        const name = parts[0].trim().toUpperCase();
        const el = parts[1].trim();
        const rem = parts.slice(2).join(' ').trim();
        newItems.push({
          id: `${Date.now()}_${idx}`,
          name,
          invertEl: el,
          remarks: rem
        });
      }
    });

    if (newItems.length === 0) {
      onToast('형식에 맞게 입력해주세요 (예: MH01 -0.430)');
      return;
    }

    // 이름 중복 제거 후 합치기
    const existingNames = new Set(newItems.map(i => i.name));
    const merged = [...newItems, ...items.filter(i => !existingNames.has(i.name))];

    setItems(merged);
    saveManholeList(merged);
    setBatchText('');
    setShowBatchInput(false);
    onToast(`🎉 ${newItems.length}개 CAD 맨홀 관저고 일괄 등록 완료!`);
  };

  const handleDeleteItem = (id: string, name: string) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    saveManholeList(updated);
    onToast(`삭제되었습니다: ${name}`);
  };

  const filteredItems = items.filter(i =>
    i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.remarks && i.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 0 calc(12px + env(safe-area-inset-bottom)) 0'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          backgroundColor: 'var(--surface)',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          border: '1px solid var(--line)',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '15px' }}>
            <Database size={18} className="text-blue-500" />
            CAD 맨홀 관저고(Inv EL) DB 관리
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 바디 내용 */}
        <div style={{ padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 새 맨홀 등록폼 */}
          <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>➕ 맨홀 관저고 신규 등록</span>
              <button
                type="button"
                className="mini"
                onClick={() => setShowBatchInput(!showBatchInput)}
                style={{ fontSize: '10.5px' }}
              >
                {showBatchInput ? '개별 입력' : '📋 CAD 다중 텍스트 붙여넣기'}
              </button>
            </div>

            {showBatchInput ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  rows={4}
                  placeholder={`CAD 도면 수치 일괄 붙여넣기 예시:\nMH01  -0.430  오수시점\nMH02  -0.190\nMH03  0.120  오수종점`}
                  value={batchText}
                  onChange={e => setBatchText(e.target.value)}
                  style={{ width: '100%', fontSize: '12px', padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}
                />
                <button className="btn primary" onClick={handleBatchImport} style={{ height: '36px' }}>
                  <Upload size={14} /> CAD 맨홀 관저고 일괄 등록
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="맨홀명 (예: MH01)"
                  value={mhName}
                  onChange={e => setMhName(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="관저고 (예: -0.430)"
                  value={invertEl}
                  onChange={e => setInvertEl(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder="비고 (선택)"
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  style={{ height: '36px', fontSize: '13px' }}
                />
                <button className="btn primary" onClick={handleAddItem} style={{ height: '36px', padding: '0 10px', minWidth: 'auto' }}>
                  <Plus size={16} /> 등록
                </button>
              </div>
            )}
          </div>

          {/* 저장된 맨홀 검색 및 리스트 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-2)' }}>
                📍 등록된 맨홀 DB ({items.length}개)
              </span>
              <div style={{ position: 'relative', width: '140px' }}>
                <input
                  type="text"
                  placeholder="맨홀 검색..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ height: '28px', fontSize: '11px', paddingLeft: '22px', width: '100%' }}
                />
                <Search size={12} style={{ position: 'absolute', left: '6px', top: '8px', color: 'var(--ink-3)' }} />
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--ink-3)', fontSize: '12.5px' }}>
                등록된 맨홀 데이터가 없습니다. 상단에서 추가해보세요!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '350px', overflowY: 'auto' }}>
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--primary)', minWidth: '55px' }}>
                        {item.name}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                        관저고 EL <b style={{ color: 'var(--ink)', fontSize: '14px' }}>{item.invertEl} m</b>
                      </span>
                      {item.remarks && (
                        <span style={{ fontSize: '11px', color: 'var(--ink-3)' }}>
                          ({item.remarks})
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteItem(item.id, item.name)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ink-3)',
                        padding: '4px',
                        cursor: 'pointer'
                      }}
                      title="삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
