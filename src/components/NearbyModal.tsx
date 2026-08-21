import React, { useState } from 'react';
import { X, MapPin, Crosshair, AlertTriangle } from 'lucide-react';
import { ManholeMasterItem } from '../types/survey';
import { findNearby, NearbyManhole } from '../utils/geo';
import { getSavedManholes } from './ManholeDbModal';

/**
 * 내 위치 근처 맨홀 찾기.
 *
 * 폰 GPS 오차는 개활지 ±5~10m, 중장비나 흙더미 옆에서 ±20~30m까지 벌어진다.
 * 맨홀 간격이 60~70m라 오차가 커지면 인접 맨홀이 뒤섞이므로,
 * 가장 가까운 하나를 자동 선택하지 않고 거리와 함께 목록으로 보여 사람이 고르게 한다.
 * GPS 정확도가 나쁘면 그 사실을 먼저 알린다.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  onPick: (type: 'start' | 'end', item: ManholeMasterItem) => void;
}

type Phase = 'idle' | 'locating' | 'done' | 'error';

export const NearbyModal: React.FC<Props> = ({ isOpen, onClose, onToast, onPick }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [list, setList] = useState<NearbyManhole[]>([]);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const locate = () => {
    if (!navigator.geolocation) {
      setPhase('error');
      setError('이 기기에서는 위치 기능을 쓸 수 없습니다.');
      return;
    }

    const all = getSavedManholes();
    const withCoords = all.filter(m => m.x && m.y);
    if (withCoords.length === 0) {
      setPhase('error');
      setError('좌표가 등록된 맨홀이 없습니다. 맨홀DB에 X·Y 좌표를 먼저 올리세요.');
      return;
    }

    setPhase('locating');
    setError('');

    navigator.geolocation.getCurrentPosition(
      pos => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setAccuracy(pos.coords.accuracy);
        setList(findNearby(here, withCoords, 8));
        setPhase('done');
      },
      err => {
        setPhase('error');
        setError(
          err.code === err.PERMISSION_DENIED
            ? '위치 권한이 꺼져 있습니다. 설정에서 이 앱의 위치 권한을 켜주세요.'
            : err.code === err.TIMEOUT
              ? '위치를 잡지 못했습니다. 하늘이 트인 곳에서 다시 시도하세요.'
              : '위치를 가져오지 못했습니다.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const poor = accuracy !== null && accuracy > 20;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <b><MapPin size={15} /> 내 위치 근처 맨홀</b>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {phase === 'idle' && (
            <>
              <p className="near-hint">
                현재 위치에서 가까운 맨홀을 거리와 함께 보여줍니다.
                GPS 오차가 있으니 맨홀 번호를 눈으로 확인하고 고르세요.
              </p>
              <button type="button" className="btn primary near-locate" onClick={locate}>
                <Crosshair size={16} /> 현재 위치 잡기
              </button>
            </>
          )}

          {phase === 'locating' && <p className="near-hint">위치를 잡는 중…</p>}

          {phase === 'error' && (
            <>
              <p className="near-error">{error}</p>
              <button type="button" className="btn" onClick={locate}>다시 시도</button>
            </>
          )}

          {phase === 'done' && (
            <>
              <div className={`near-acc ${poor ? 'poor' : ''}`}>
                {poor && <AlertTriangle size={14} />}
                GPS 정확도 ±{accuracy!.toFixed(0)} m
                {poor && ' — 오차가 커서 인접 맨홀이 뒤바뀔 수 있습니다. 번호를 꼭 확인하세요.'}
              </div>

              {list.length === 0 ? (
                <p className="near-hint">근처에서 찾은 맨홀이 없습니다.</p>
              ) : (
                <div className="near-list">
                  {list.map(({ item, distanceM }) => (
                    <div key={item.id} className="near-item">
                      <div className="near-info">
                        <b>{item.name}</b>
                        <span>
                          {distanceM < 1000 ? `${distanceM.toFixed(0)} m` : `${(distanceM / 1000).toFixed(2)} km`}
                          {' · 관저고 '}{item.invertEl}
                          {item.remarks ? ` · ${item.remarks}` : ''}
                        </span>
                      </div>
                      <div className="near-actions">
                        <button type="button" onClick={() => { onPick('start', item); onToast(`${item.name} → 시점`); onClose(); }}>시점</button>
                        <button type="button" onClick={() => { onPick('end', item); onToast(`${item.name} → 종점`); onClose(); }}>종점</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" className="btn near-locate" onClick={locate}>
                <Crosshair size={15} /> 위치 다시 잡기
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default NearbyModal;
