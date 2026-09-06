import React, { useState, useEffect, useRef } from 'react';
import {
  X, MapPin, Layers, Navigation, Upload, Crosshair,
  Maximize2, RotateCw, Eye, Sparkles, Check, Compass, Sliders, ChevronDown
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ManholeMasterItem } from '../types/survey';
import {
  toLatLng, LatLng, SupportedCRS, SUPPORTED_CRS_LIST,
  haversineM, calibrateBlueprint2Points, ImagePoint, HelmertCalibrationResult
} from '../utils/geo';
import { parseNum } from '../utils/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
  manholes: ManholeMasterItem[];
  onSelectManhole?: (type: 'start' | 'end', item: ManholeMasterItem) => void;
}

const STORAGE_MAP_CRS = 'survey_map_crs_v1';
const STORAGE_OVERLAY_CONFIG = 'survey_blueprint_overlay_v1';

interface SavedOverlayConfig {
  crs: SupportedCRS;
  opacity: number;
  bounds?: [[number, number], [number, number]];
  pt1?: { img: ImagePoint; mhId: string };
  pt2?: { img: ImagePoint; mhId: string };
  manualAdjust?: { dx: number; dy: number; scale: number; rot: number };
}

export const SiteMapModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onToast,
  manholes,
  onSelectManhole
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const imageOverlayRef = useRef<L.ImageOverlay | null>(null);
  const myLocationMarkerRef = useRef<L.CircleMarker | null>(null);
  const myAccuracyCircleRef = useRef<L.Circle | null>(null);

  // 지도 상태
  const [crs, setCrs] = useState<SupportedCRS>(() => {
    return (localStorage.getItem(STORAGE_MAP_CRS) as SupportedCRS) || 'EPSG:5174';
  });
  const [mapType, setMapType] = useState<'osm' | 'vworld_sat'>('vworld_sat');
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [myAccuracy, setMyAccuracy] = useState<number | null>(null);
  const [isWatchingGps, setIsWatchingGps] = useState(false);

  // 도면 업로드 & 정합 상태
  const [blueprintUrl, setBlueprintUrl] = useState<string | null>(null);
  const [blueprintSize, setBlueprintSize] = useState<{ w: number; h: number } | null>(null);
  const [opacity, setOpacity] = useState(0.75);
  const [overlayBounds, setOverlayBounds] = useState<L.LatLngBoundsExpression | null>(null);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<'crs' | 'calibrate' | 'adjust'>('crs');

  // 2점 캘리브레이션 제어점
  const [calibStep, setCalibStep] = useState<'idle' | 'pick_p1' | 'pick_p2'>('idle');
  const [calibP1, setCalibP1] = useState<{ img: ImagePoint; mhId: string } | null>(null);
  const [calibP2, setCalibP2] = useState<{ img: ImagePoint; mhId: string } | null>(null);

  // 미세 조정 (수동 이동/스케일)
  const [adjustOffset, setAdjustOffset] = useState({ dx: 0, dy: 0, scale: 1, rot: 0 });

  // 1. 초기 로컬 설정 불러오기
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_OVERLAY_CONFIG);
      if (saved) {
        const conf = JSON.parse(saved) as SavedOverlayConfig;
        if (conf.crs) setCrs(conf.crs);
        if (conf.opacity !== undefined) setOpacity(conf.opacity);
        if (conf.bounds) setOverlayBounds(conf.bounds);
        if (conf.pt1) setCalibP1(conf.pt1);
        if (conf.pt2) setCalibP2(conf.pt2);
        if (conf.manualAdjust) setAdjustOffset(conf.manualAdjust);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // CRS 변경 시 저장
  useEffect(() => {
    localStorage.setItem(STORAGE_MAP_CRS, crs);
  }, [crs]);

  // 2. Leaflet 지도 인스턴스 초기화
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // 초기 중심 좌표: 첫 번째 유효 맨홀 좌표 또는 송산그린시티 기본 좌표 (37.228, 126.791)
      let initialCenter: [number, number] = [37.228, 126.791];
      for (const m of manholes) {
        const x = parseNum(m.x);
        const y = parseNum(m.y);
        if (x !== null && y !== null) {
          const ll = toLatLng(x, y, crs);
          if (ll) {
            initialCenter = [ll.lat, ll.lng];
            break;
          }
        }
      }

      const map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 16,
        maxZoom: 20,
        zoomControl: false
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
    }

    const map = mapInstanceRef.current;

    // 타일 레이어 설정
    map.eachLayer(layer => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    if (mapType === 'vworld_sat') {
      // VWorld 위성 영상
      L.tileLayer(
        'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg',
        {
          maxZoom: 19,
          subdomains: ['xdworld'],
          attribution: '© VWorld Satellite'
        }
      ).addTo(map);
    } else {
      // OpenStreetMap 일반 도로 지도
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(map);
    }

    // 모달이 열릴 때 크기 재조정
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      // 모달이 완전히 unmount될 때만 정리
    };
  }, [isOpen, mapType]);

  // 3. 맨홀 마커 렌더링 (좌표계 CRS 변경 시 자동 재배치)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    const validLatLngs: [number, number][] = [];

    manholes.forEach(m => {
      const x = parseNum(m.x);
      const y = parseNum(m.y);
      if (x === null || y === null) return;

      const ll = toLatLng(x, y, crs);
      if (!ll) return;

      validLatLngs.push([ll.lat, ll.lng]);

      // 커스텀 SVG 마커 아이콘
      const markerHtml = `
        <div class="mh-map-pin" style="
          background: #2B4FD1;
          color: white;
          font-weight: 700;
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 12px;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 3px;
          transform: translate(-50%, -50%);
        ">
          <span>🕳️</span>
          <span>${m.name}</span>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-mh-icon',
        html: markerHtml,
        iconSize: [0, 0]
      });

      const marker = L.marker([ll.lat, ll.lng], { icon: customIcon });

      // 팝업 내용
      const distText = myLocation
        ? `<div style="font-size:11px; color:#666; margin-bottom:4px;">📍 내 위치에서 <b>${haversineM(myLocation, ll).toFixed(1)} m</b></div>`
        : '';

      const popupContent = document.createElement('div');
      popupContent.style.minWidth = '160px';
      popupContent.innerHTML = `
        <div style="font-weight:700; font-size:14px; margin-bottom:4px; color:#1C2B63;">
          ${m.name} ${m.remarks ? `<small style="font-size:11px; color:#666;">(${m.remarks})</small>` : ''}
        </div>
        <div style="font-size:12px; margin-bottom:2px;">• 유출관저고: <b>${m.invertEl} m</b></div>
        ${m.invertElIn ? `<div style="font-size:12px; margin-bottom:2px; color:#D6473F;">• 유입관저고: <b>${m.invertElIn} m (낙차)</b></div>` : ''}
        ${distText}
        <div style="display:flex; gap:6px; margin-top:8px;">
          <button id="btn-pick-start-${m.id}" style="
            flex:1; padding:6px; font-size:11px; font-weight:700; background:#2B4FD1; color:white; border:none; border-radius:6px; cursor:pointer;
          ">시점 적용</button>
          <button id="btn-pick-end-${m.id}" style="
            flex:1; padding:6px; font-size:11px; font-weight:700; background:#1F9D63; color:white; border:none; border-radius:6px; cursor:pointer;
          ">종점 적용</button>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('popupopen', () => {
        const btnStart = document.getElementById(`btn-pick-start-${m.id}`);
        const btnEnd = document.getElementById(`btn-pick-end-${m.id}`);
        if (btnStart) {
          btnStart.onclick = () => {
            if (onSelectManhole) onSelectManhole('start', m);
            onToast(`'${m.name}' 맨홀을 관로 야장 [시점]으로 적용했습니다`);
            onClose();
          };
        }
        if (btnEnd) {
          btnEnd.onclick = () => {
            if (onSelectManhole) onSelectManhole('end', m);
            onToast(`'${m.name}' 맨홀을 관로 야장 [종점]으로 적용했습니다`);
            onClose();
          };
        }
      });

      markersLayer.addLayer(marker);
    });

    // 맨홀 좌표 영역으로 지도 포커스 자동 맞춤
    if (validLatLngs.length > 0 && !blueprintUrl) {
      const bounds = L.latLngBounds(validLatLngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
    }
  }, [manholes, crs, myLocation, isOpen]);

  // 4. 도면 이미지 오버레이 (Overlay) 업데이트
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (imageOverlayRef.current) {
      map.removeLayer(imageOverlayRef.current);
      imageOverlayRef.current = null;
    }

    if (blueprintUrl && overlayBounds) {
      const overlay = L.imageOverlay(blueprintUrl, overlayBounds, {
        opacity: opacity,
        interactive: false
      }).addTo(map);

      imageOverlayRef.current = overlay;
    }
  }, [blueprintUrl, overlayBounds, opacity]);

  // 5. 실시간 GPS 위치 추적
  const toggleGpsWatch = () => {
    if (isWatchingGps) {
      setIsWatchingGps(false);
      onToast('실시간 GPS 추적을 종료했습니다');
      return;
    }

    if (!navigator.geolocation) {
      onToast('기기에서 GPS 위치 서비스를 지원하지 않습니다');
      return;
    }

    setIsWatchingGps(true);
    onToast('📍 실시간 내 위치(GPS) 추적을 시작합니다...');

    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latLng: LatLng = { lat: latitude, lng: longitude };
        setMyLocation(latLng);
        setMyAccuracy(Math.round(accuracy));

        const map = mapInstanceRef.current;
        if (map) {
          // 내 위치 펄스 마커 갱신
          if (!myLocationMarkerRef.current) {
            myAccuracyCircleRef.current = L.circle([latitude, longitude], {
              radius: accuracy,
              color: '#2B4FD1',
              fillColor: '#2B4FD1',
              fillOpacity: 0.15,
              weight: 1
            }).addTo(map);

            myLocationMarkerRef.current = L.circleMarker([latitude, longitude], {
              radius: 8,
              color: '#FFFFFF',
              weight: 3,
              fillColor: '#2B4FD1',
              fillOpacity: 1
            }).addTo(map);
          } else {
            myLocationMarkerRef.current.setLatLng([latitude, longitude]);
            myAccuracyCircleRef.current?.setLatLng([latitude, longitude]);
            myAccuracyCircleRef.current?.setRadius(accuracy);
          }
        }
      },
      err => {
        console.error('GPS watch error:', err);
        setIsWatchingGps(false);
        onToast('GPS 신호를 잡을 수 없습니다. 위치 권한을 확인하세요.');
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  };

  // 내 위치로 지도 중심 이동
  const handlePanToMyLocation = () => {
    if (!myLocation || !mapInstanceRef.current) {
      onToast('현재 GPS 위치를 측정 중입니다. 잠시만 기다려주세요.');
      toggleGpsWatch();
      return;
    }
    mapInstanceRef.current.setView([myLocation.lat, myLocation.lng], 18, { animate: true });
  };

  // 6. 도면 파일 업로드 핸들러
  const handleBlueprintUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      const url = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setBlueprintSize({ w: img.width, h: img.height });
        setBlueprintUrl(url);

        // 기본 바운딩 박스: 현재 지도 화면 또는 맨홀 중심 300만㎡ 영역(약 1.7km x 1.7km)으로 초기 배치
        const map = mapInstanceRef.current;
        if (map) {
          const center = map.getCenter();
          const dLat = 0.008; // 약 900m
          const dLng = 0.010;
          const initialBounds: [[number, number], [number, number]] = [
            [center.lat - dLat, center.lng - dLng],
            [center.lat + dLat, center.lng + dLng]
          ];
          setOverlayBounds(initialBounds);
          map.fitBounds(initialBounds);
          onToast(`📐 도면 업로드 완료 (${img.width}x${img.height}) — [정합/보정]에서 위치를 맞춰주세요`);
          setShowConfigPanel(true);
          setActiveTab('calibrate');
        }
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  // 7. 2점 기준점 캘리브레이션 실행
  const executeCalibration = (
    p1: { img: ImagePoint; mhId: string },
    p2: { img: ImagePoint; mhId: string }
  ) => {
    if (!blueprintSize) return;

    const mh1 = manholes.find(m => m.id === p1.mhId);
    const mh2 = manholes.find(m => m.id === p2.mhId);
    if (!mh1 || !mh2) {
      onToast('선택한 맨홀을 찾을 수 없습니다');
      return;
    }

    const world1 = toLatLng(parseNum(mh1.x) || 0, parseNum(mh1.y) || 0, crs);
    const world2 = toLatLng(parseNum(mh2.x) || 0, parseNum(mh2.y) || 0, crs);
    if (!world1 || !world2) {
      onToast('맨홀에 좌표가 입력되어 있지 않습니다');
      return;
    }

    const res: HelmertCalibrationResult | null = calibrateBlueprint2Points(
      p1.img, world1,
      p2.img, world2,
      blueprintSize.w, blueprintSize.h
    );

    if (!res) {
      onToast('정합 계산 실패: 두 점 사이의 거리가 너무 가깝습니다');
      return;
    }

    const newBounds: [[number, number], [number, number]] = [
      [res.southWest.lat, res.southWest.lng],
      [res.northEast.lat, res.northEast.lng]
    ];

    setOverlayBounds(newBounds);

    // 설정 영속화
    const conf: SavedOverlayConfig = {
      crs,
      opacity,
      bounds: newBounds,
      pt1: p1,
      pt2: p2,
      manualAdjust: adjustOffset
    };
    localStorage.setItem(STORAGE_OVERLAY_CONFIG, JSON.stringify(conf));

    if (mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(newBounds, { padding: [30, 30] });
    }

    onToast(`🎯 2점 헬머트 정합 완료! (회전각: ${res.rotationDeg.toFixed(2)}°)`);
    setShowConfigPanel(false);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 105,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* 1. 상단 제어 헤더 */}
      <div
        style={{
          background: 'var(--surface)',
          padding: '10px 14px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={20} className="text-blue-600" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--ink)' }}>
              3백만㎡ 현장 평면도 지도 뷰어
            </span>
            <span style={{ fontSize: '10.5px', color: 'var(--ink-2)' }}>
              좌표계: <b>{crs}</b> · 맨홀 {manholes.length}개소 표시
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* 도면 업로드 버튼 */}
          <label
            className="btn mini"
            style={{
              padding: '6px 10px',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: blueprintUrl ? 'var(--ok-bg)' : 'var(--primary-bg)',
              color: blueprintUrl ? 'var(--ok)' : 'var(--primary)',
              borderColor: blueprintUrl ? 'var(--ok)' : 'var(--primary)'
            }}
          >
            <Upload size={13} />
            {blueprintUrl ? '도면 교체' : '📐 평면도 업로드'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleBlueprintUpload(f);
                e.target.value = '';
              }}
            />
          </label>

          {/* 설정 및 정합 옵션 패널 열기 */}
          <button
            type="button"
            className={`btn mini ${showConfigPanel ? 'primary' : ''}`}
            style={{ padding: '6px 10px', fontSize: '11px' }}
            onClick={() => setShowConfigPanel(!showConfigPanel)}
          >
            <Sliders size={13} /> 정합·옵션
          </button>

          {/* 지도 닫기 */}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* 2. 메인 지도 뷰포트 영역 */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* 플로팅 컨트롤러: 내 위치 GPS & 위성 전환 */}
        <div
          style={{
            position: 'absolute',
            top: '14px',
            right: '14px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {/* 내 위치 GPS 버튼 */}
          <button
            type="button"
            onClick={toggleGpsWatch}
            style={{
              background: isWatchingGps ? '#2B4FD1' : 'white',
              color: isWatchingGps ? 'white' : '#1C2B63',
              border: '1px solid #C7CFEF',
              borderRadius: '8px',
              padding: '10px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            <Navigation size={16} />
            {isWatchingGps ? `GPS 추적 (±${myAccuracy}m)` : '내 위치'}
          </button>

          {/* 내 위치로 즉시 이동 */}
          {myLocation && (
            <button
              type="button"
              onClick={handlePanToMyLocation}
              style={{
                background: 'white',
                color: '#1C2B63',
                border: '1px solid #C7CFEF',
                borderRadius: '8px',
                padding: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                cursor: 'pointer'
              }}
              title="내 위치로 이동"
            >
              <Crosshair size={16} />
            </button>
          )}

          {/* 배경 지도 타입 전환 (위성 ↔ 일반) */}
          <button
            type="button"
            onClick={() => setMapType(mapType === 'vworld_sat' ? 'osm' : 'vworld_sat')}
            style={{
              background: 'white',
              color: '#1C2B63',
              border: '1px solid #C7CFEF',
              borderRadius: '8px',
              padding: '8px 10px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 700
            }}
          >
            {mapType === 'vworld_sat' ? '🗺️ 일반지도' : '🛰️ 위성지도'}
          </button>
        </div>

        {/* 도면 투명도 조절 플로팅 바 (도면이 탑재되었을 때) */}
        {blueprintUrl && (
          <div
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '14px',
              zIndex: 1000,
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(6px)',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid var(--line)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}
          >
            <Eye size={16} className="text-blue-600" />
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink)' }}>도면 투명도</span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={e => setOpacity(parseFloat(e.target.value))}
              style={{ width: '100px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, width: '32px' }}>{Math.round(opacity * 100)}%</span>
          </div>
        )}

        {/* 3. 좌표계 변환 및 도면 2점 정합 팝업 패널 */}
        {showConfigPanel && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              width: '340px',
              maxWidth: 'calc(100vw - 24px)',
              maxHeight: 'calc(100% - 24px)',
              overflowY: 'auto',
              zIndex: 1001,
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--line)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--ink)' }}>
                📐 좌표계 및 도면 정합(보정) 설정
              </span>
              <button
                type="button"
                onClick={() => setShowConfigPanel(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-2)' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* 탭 네비게이션 */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: '8px', padding: '3px' }}>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '6px 2px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '6px',
                  background: activeTab === 'crs' ? 'var(--surface)' : 'transparent',
                  color: activeTab === 'crs' ? 'var(--primary)' : 'var(--ink-2)',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('crs')}
              >
                좌표계 선택
              </button>
              <button
                type="button"
                style={{
                  flex: 1,
                  padding: '6px 2px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: 'none',
                  borderRadius: '6px',
                  background: activeTab === 'calibrate' ? 'var(--surface)' : 'transparent',
                  color: activeTab === 'calibrate' ? 'var(--primary)' : 'var(--ink-2)',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTab('calibrate')}
              >
                2점 정합(보정)
              </button>
            </div>

            {/* 탭 1: 한국 표준 좌표계 CRS 프리셋 */}
            {activeTab === 'crs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--ink-2)', lineHeight: 1.4 }}>
                  도면과 맨홀 CAD 좌표가 작성된 좌표계를 선택하세요. 변경 시 지도 상의 모든 위치가 올바른 위경도로 실시간 변환됩니다.
                </span>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {SUPPORTED_CRS_LIST.map(item => (
                    <label
                      key={item.code}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        padding: '8px 10px',
                        background: crs === item.code ? 'var(--primary-bg)' : 'var(--surface-2)',
                        border: `1px solid ${crs === item.code ? 'var(--primary)' : 'var(--line)'}`,
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="crs-choice"
                        checked={crs === item.code}
                        onChange={() => {
                          setCrs(item.code);
                          onToast(`좌표계를 '${item.name}'으로 변경했습니다`);
                        }}
                        style={{ marginTop: '2px' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--ink)' }}>{item.name}</span>
                        <span style={{ fontSize: '10.5px', color: 'var(--ink-2)' }}>{item.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 탭 2: 2점 기준점 헬머트 정합 (도면 좌표계가 틀리거나 모를 때) */}
            {activeTab === 'calibrate' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ background: 'var(--surface-2)', padding: '10px', borderRadius: '8px', fontSize: '11.5px', color: 'var(--ink)', lineHeight: 1.4 }}>
                  💡 <b>도면 좌표계를 모르거나 틀린 경우:</b><br />
                  도면 상의 <b>기준 맨홀 2개</b>를 지정하면, 회전각·크기·위치를 자동 역산(Helmert 아핀 변환)하여 지도에 완벽 정합시킵니다.
                </div>

                {/* 기준점 1 설정 */}
                <div style={{ border: '1px solid var(--line)', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '6px', color: 'var(--primary)' }}>
                    📍 기준점 1 (시점측 맨홀)
                  </div>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--line)' }}
                    value={calibP1?.mhId || ''}
                    onChange={e => {
                      const id = e.target.value;
                      // 도면 상의 좌측 부근(0.2, 0.5)을 기본 픽셀 위치로 지정
                      setCalibP1({ img: calibP1?.img || { u: 0.2, v: 0.5 }, mhId: id });
                    }}
                  >
                    <option value="">-- 맨홀 선택 --</option>
                    {manholes.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (X:{m.x || '—'}, Y:{m.y || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 기준점 2 설정 */}
                <div style={{ border: '1px solid var(--line)', padding: '8px 10px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '6px', color: 'var(--ok)' }}>
                    📍 기준점 2 (종점측 맨홀)
                  </div>
                  <select
                    style={{ width: '100%', padding: '6px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--line)' }}
                    value={calibP2?.mhId || ''}
                    onChange={e => {
                      const id = e.target.value;
                      // 도면 상의 우측 부근(0.8, 0.5)을 기본 픽셀 위치로 지정
                      setCalibP2({ img: calibP2?.img || { u: 0.8, v: 0.5 }, mhId: id });
                    }}
                  >
                    <option value="">-- 맨홀 선택 --</option>
                    {manholes.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (X:{m.x || '—'}, Y:{m.y || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 정합 실행 버튼 */}
                <button
                  type="button"
                  className="btn primary"
                  style={{ width: '100%', padding: '8px', fontSize: '12px', fontWeight: 700 }}
                  disabled={!calibP1?.mhId || !calibP2?.mhId || !blueprintUrl}
                  onClick={() => {
                    if (calibP1 && calibP2) executeCalibration(calibP1, calibP2);
                  }}
                >
                  <Sparkles size={14} /> 2점 헬머트 자동 정합 실행
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteMapModal;
