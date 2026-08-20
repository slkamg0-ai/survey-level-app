import React from 'react';
import { AlertTriangle, AlertCircle, ShieldCheck } from 'lucide-react';
import { TargetHeightMode } from '../types/survey';
import { SurveyWarning } from '../utils/validation';
import { TrenchDiagram } from './TrenchDiagram';

/**
 * 기초 층 구성을 항상 화면에 보여주고, 도면과 대조해 확정하게 만드는 게이트.
 *
 * 두께 입력이 접힌 설정 패널 안에만 있어 측량 중에는 어떤 층 구성으로 계산 중인지
 * 볼 수 없었다. 여기서 아래에서 위로 쌓인 순서 그대로, 각 층의 두께와 상단 EL을
 * 함께 보여준다. 지금 검측 중인 층은 강조되므로 층이 중복 반영됐는지 눈으로 잡힌다.
 */

export interface LayerRow {
  key: string;
  label: string;
  /** 층 두께. 바닥면처럼 두께 개념이 없는 행은 null */
  thickness: number | null;
  topEl: number | null;
  /** 현재 검측 기준이 이 층의 상단인지 */
  active: boolean;
}

export interface DiagramInput {
  invEl: number | null;
  sand: number;
  conc: number;
  agg: number;
  t: number;
  dia: number | null;
  mhBase: number;
}

interface Props {
  warnings: SurveyWarning[];
  layers: LayerRow[];
  diagram: DiagramInput;
  mode: TargetHeightMode;
  modeLabel: string;
  confirmed: boolean;
  confirmedAt?: string;
  onConfirm: () => void;
}

export const SpecGuard: React.FC<Props> = ({
  warnings, layers, diagram, mode, modeLabel, confirmed, confirmedAt, onConfirm
}) => {
  const dangers = warnings.filter(x => x.level === 'danger');
  const warns = warnings.filter(x => x.level === 'warn');

  return (
    <section className="guard">
      <h2 className="guard-head">
        <span>기초 층 구성 · 확인</span>
        {confirmed ? (
          <span className="guard-badge ok"><ShieldCheck size={13} /> 확정됨</span>
        ) : (
          <span className="guard-badge bad"><AlertTriangle size={13} /> 미확정</span>
        )}
      </h2>

      {/* 단면 그래픽 — 바쁠 때는 이것만 봐도 되게 */}
      <div className="diagram-wrap">
        <TrenchDiagram {...diagram} mode={mode} />
        <p className="diagram-cap">
          붉은 파선이 지금 잡는 면 — <strong>{modeLabel}</strong>
        </p>
      </div>

      {/* 아래에서 위로 쌓인 순서 그대로 */}
      <div className="layer-stack">
        {layers.map(l => (
          <div key={l.key} className={`layer ${l.active ? 'active' : ''} ${l.thickness === 0 ? 'empty' : ''}`}>
            <span className="layer-name">{l.label}</span>
            <span className="layer-thick">
              {l.thickness === null ? '—' : l.thickness === 0 ? '없음' : `${l.thickness.toFixed(3)} m`}
            </span>
            <span className="layer-el">{l.topEl === null ? '—' : l.topEl.toFixed(3)}</span>
          </div>
        ))}
      </div>

      <p className="layer-legend">
        오른쪽은 각 층 <strong>상단</strong>의 EL입니다. 지금 검측 기준은 <strong>{modeLabel}</strong> 이며
        표에 굵게 표시된 층입니다.
      </p>

      {(dangers.length > 0 || warns.length > 0) && (
        <ul className="warn-list">
          {dangers.concat(warns).map(x => (
            <li key={x.id} className={`warn-item ${x.level}`}>
              {x.level === 'danger' ? <AlertCircle size={15} /> : <AlertTriangle size={15} />}
              <div>
                <b>{x.title}</b>
                <span>{x.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirmed ? (
        <p className="guard-confirmed">
          이 기초 제원으로 확정했습니다{confirmedAt ? ` · ${confirmedAt}` : ''}. 두께를 바꾸면 다시 확인해야 합니다.
        </p>
      ) : (
        <button type="button" className="guard-confirm-btn" onClick={onConfirm}>
          도면과 대조했습니다 — 이 기초 제원으로 확정
        </button>
      )}
    </section>
  );
};

export default SpecGuard;
