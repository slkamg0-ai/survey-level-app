import React from 'react';
import { Delete } from 'lucide-react';

/**
 * 앱 자체 숫자 키패드.
 *
 * inputMode="decimal" 네이티브 키패드는 제조사·기기에 따라 "-" 키가 아예 없는
 * 경우가 많아, 해수면 아래 지반고처럼 음수가 흔한 현장에서 입력 자체가 막혔다.
 * 이 키패드는 OS 키보드를 완전히 대체해 모든 기기에서 "-"를 항상 보장한다.
 *
 * 대상 입력칸은 readOnly로 두고 포커스만 받아 이 키패드를 연다 — 네이티브 키보드가
 * 뜨지 않으므로 이중 입력(키패드+네이티브 동시 입력) 걱정이 없다.
 */

interface Props {
  isOpen: boolean;
  /** 지금 편집 중인 필드를 사람이 읽을 라벨로 (예: "BM1 · 후시(BS)") */
  label: string;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.'];

export const NumericKeypad: React.FC<Props> = ({ isOpen, label, value, onChange, onClose }) => {
  if (!isOpen) return null;

  const press = (key: string) => {
    if (key === '-') {
      // 선행 부호만 토글한다 (문자열 중간에 '-'가 끼는 걸 막는다)
      const body = value.replace(/^-/, '');
      onChange(value.startsWith('-') ? body : `-${body}`);
      return;
    }
    if (key === '.') {
      if (value.includes('.')) return; // 소수점은 하나만
      onChange(value + (value === '' || value === '-' ? '0.' : '.'));
      return;
    }
    onChange(value + key);
  };

  const backspace = () => onChange(value.slice(0, -1));
  const clear = () => onChange('');

  return (
    <div className="modal-backdrop keypad-backdrop" onClick={onClose}>
      <div className="modal-panel keypad-panel" onClick={e => e.stopPropagation()}>
        <div className="keypad-display">
          <span className="keypad-label">{label}</span>
          <span className="keypad-value">{value || '0'}</span>
        </div>

        <div className="keypad-grid">
          {KEYS.map(k => (
            <button
              key={k}
              type="button"
              className={`keypad-key ${k === '-' ? 'minus' : ''}`}
              onClick={() => press(k)}
            >
              {k}
            </button>
          ))}
          <button type="button" className="keypad-key keypad-back" onClick={backspace} aria-label="한 글자 지우기">
            <Delete size={18} />
          </button>
        </div>

        <div className="keypad-actions">
          <button type="button" className="btn ghost" onClick={clear}>전체 지우기</button>
          <button type="button" className="btn primary keypad-done" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  );
};

export default NumericKeypad;
