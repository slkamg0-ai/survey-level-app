import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { X, Box as BoxIcon } from 'lucide-react';
import { ManholeMasterItem, ManholeSystem, MANHOLE_SYSTEMS, MANHOLE_SYSTEM_COLOR, SurveyRoute, manholeInvertIn, manholeInvertOut } from '../types/survey';
import { buildSpans, findRelatedRoutes, RelatedRoute, routeSystem } from '../utils/routes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  manholes: ManholeMasterItem[];
  routes: SurveyRoute[];
}

/**
 * 맨홀 유형별 치수 — 도면분석 파이프라인의 config/layers.yaml manhole_types 와 같은 값
 * (samples/맨홀조서.xlsx 헤더로 확인, 확정 2026-10-24). 여기 없는 유형(예: 집수정)은
 * 크기를 모른다는 뜻이라 자리표시 크기를 쓴다 — 실측으로 간주하지 않는다.
 */
const TYPE_SIZE: Record<string, { circleM?: number; boxM?: number }> = {
  '원형1호': { circleM: 0.9 },
  '원형2호': { circleM: 1.2 },
  '특2호': { boxM: 1.2 },
  '특3호': { boxM: 1.5 },
  '특4호': { boxM: 1.5 },
  '특5호': { boxM: 1.8 },
  'BOX맨홀': { boxM: 0.9 }
};
const DEFAULT_BOX_M = 1.2; // 크기 데이터 없는 유형(집수정 등)의 자리표시 — 실측 아님
const LABEL_MIN_DIST = 25; // 이 거리보다 가까워지면 라벨 화면크기를 고정(계속 확대되며 객체를 가리지 않도록)
const PIPE_R_M = 0.25;     // 구간 관경(diaMm)을 모를 때만 쓰는 자리표시 반지름 — 실측 아님

const SYSTEM_COLOR: Record<ManholeSystem, number> = {
  우수: 0x5fa9e6, 오수: 0xc77dff, 전기: 0xffd166, 가스: 0xff9a3c, 상수도: 0x6ee7b7
};
const WARN_COLOR = 0xff6b6b;
const RELATED_COLOR = 0xffe066; // 선택한 노선 주변(겹침/근접) 다른 노선 추천 강조색 (three.js 16진수)
const RELATED_COLOR_CSS = '#ffe066'; // 위와 같은 색의 CSS 문자열 — 패널 UI에서 사용

function num(v?: string | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as any).material;
    if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
    else if (mat) {
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
  });
}

export const ThreeDViewModal: React.FC<Props> = ({ isOpen, onClose, manholes, routes }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [systemFilter, setSystemFilter] = useState<ManholeSystem | '전체'>('전체');
  // 빈 배열 = 전체 노선. 여러 노선을 동시에 골라 한 화면에 띄워볼 수 있다(겹치는 구간 비교 등).
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [routePanelOpen, setRoutePanelOpen] = useState(false);
  const [routeSearch, setRouteSearch] = useState('');
  // 노선 선택 패널 안에서 노선 목록을 시설로도 좁혀볼 수 있게 — 노선 자체엔 시설 태그가
  // 없어 routeSystem()으로 구성 맨홀 다수결 추정값을 쓴다.
  const [routePanelSystemFilter, setRoutePanelSystemFilter] = useState<ManholeSystem | '전체'>('전체');
  // 선택한 노선 주변에서 "관련 노선"(겹치거나 가까운 다른 공종 노선)으로 칠 거리(m)
  const [relatedThresholdM, setRelatedThresholdM] = useState(10);
  const [vexag, setVexag] = useState(8);
  const [showLabels, setShowLabels] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);
  const [emptyMsg, setEmptyMsg] = useState<string | null>(null);

  const s = useRef<{
    renderer?: THREE.WebGLRenderer; scene?: THREE.Scene; camera?: THREE.PerspectiveCamera;
    controls?: OrbitControls; group?: THREE.Group; pickables: THREE.Object3D[]; labelSprites: THREE.Sprite[];
    raf?: number;
  }>({ pickables: [], labelSprites: [] }).current;

  // ---- 모달 열릴 때 1회: renderer/scene/camera/controls 생성, 닫히면 정리 ----
  useEffect(() => {
    if (!isOpen || !mountRef.current) return;
    const el = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f1a);
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 100000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(200, 400, 300);
    scene.add(sun);
    const group = new THREE.Group();
    scene.add(group);

    s.renderer = renderer; s.scene = scene; s.camera = camera; s.controls = controls; s.group = group;

    const onResize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let downX = 0, downY = 0;
    const onDown = (ev: PointerEvent) => { downX = ev.clientX; downY = ev.clientY; };
    const onUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) >= 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ptr, camera);
      const hits = raycaster.intersectObjects(s.pickables);
      if (!hits.length) { setPanel(null); return; }
      const ud: any = hits[0].object.userData;
      if (ud.kind === 'node') {
        const d = ud.d;
        setPanel(
          `${d.name}${d.typeLabel ? ' (' + d.typeLabel + ')' : ''} — 관저고 ${d.z ?? '-'}` +
          `${d.gl !== null ? ' · 계획고 ' + d.gl : ''}${d.remarks ? ' · ' + d.remarks : ''}`
        );
      } else {
        const d = ud.d;
        setPanel(`${d.startName} → ${d.endName} (${d.system || '시설미지정'}) · L${d.length !== null ? d.length.toFixed(1) : '-'}m` +
          (d.diaMm ? ` · D${d.diaMm}` : ' · 관경미상') +
          (ud.related ? ` · 추천 노선 '${ud.routeName}' 선택에 추가됨` : ''));
        // 강조 표시된 추천 노선을 탭하면 바로 선택에 넣어 그 자리에서 비교·검토할 수 있게 한다
        if (ud.related && ud.routeId) {
          setSelectedRouteIds(prev => prev.includes(ud.routeId) ? prev : [...prev, ud.routeId]);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const loop = () => {
      s.raf = requestAnimationFrame(loop);
      controls.update();
      for (const sp of s.labelSprites) {
        const dist = camera.position.distanceTo(sp.position);
        const f = Math.min(1, dist / LABEL_MIN_DIST);
        const base = sp.userData.base as { w: number; h: number };
        sp.scale.set(base.w * f, base.h * f, 1);
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      if (s.raf) cancelAnimationFrame(s.raf);
      disposeObject(group);
      renderer.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
      s.renderer = s.scene = s.camera = s.controls = s.group = undefined;
      s.pickables = []; s.labelSprites = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---- 데이터/필터/수직과장/이름표시 바뀔 때마다 장면 다시 그림 ----
  useEffect(() => {
    if (!isOpen || !s.scene || !s.group || !s.camera || !s.controls) return;
    rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, manholes, routes, systemFilter, selectedRouteIds, relatedThresholdM, vexag, showLabels]);

  function makeLabel(text: string): THREE.Sprite {
    const fontPx = 40;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d')!;
    ctx.font = `${fontPx}px sans-serif`;
    const w = Math.ceil(ctx.measureText(text).width) + 20;
    cv.width = w; cv.height = fontPx + 16;
    ctx.font = `${fontPx}px sans-serif`;
    ctx.fillStyle = 'rgba(11,15,26,0.78)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#e8edfc';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 10, cv.height / 2);
    const tex = new THREE.CanvasTexture(cv);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true }));
    const sc = 0.045;
    sprite.userData.base = { w: cv.width * sc, h: cv.height * sc };
    sprite.scale.set(sprite.userData.base.w, sprite.userData.base.h, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length() || 0.01;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10, 1), mat);
    mesh.position.copy(a).add(d.clone().multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    return mesh;
  }

  function rebuild() {
    const { scene, camera, controls } = s;
    if (!scene || !camera || !controls) return;
    if (s.group) { scene.remove(s.group); disposeObject(s.group); }
    const group = new THREE.Group();
    s.group = group;
    s.pickables = [];
    s.labelSprites = [];

    const passSystem = (m: ManholeMasterItem) => systemFilter === '전체' || m.system === systemFilter;
    const withCoord = manholes.filter(m => num(m.x) !== null && num(m.y) !== null);
    const shown = withCoord.filter(passSystem);
    const base = shown.length ? shown : withCoord;
    if (!base.length) {
      scene.add(group);
      setEmptyMsg(
        withCoord.length === 0
          ? `맨홀 ${manholes.length}개 중 X/Y 좌표가 있는 게 없습니다 — 좌표 없이 등록된 맨홀은 3D에 표시할 수 없습니다. 도면분석 CSV 가져오기(X/Y 열 포함)로 넣어주세요.`
          : `"${systemFilter}" 시설엔 좌표 있는 맨홀이 없습니다 (전체 좌표 있는 맨홀 ${withCoord.length}개) — 필터를 바꿔보세요.`
      );
      return;
    }
    setEmptyMsg(null);
    const xs = base.map(m => num(m.x)!), ys = base.map(m => num(m.y)!);
    const ox = (Math.min(...xs) + Math.max(...xs)) / 2;
    const oy = (Math.min(...ys) + Math.max(...ys)) / 2;

    // 노선을 하나 이상 골랐으면 카메라는 그 노선들 범위로만 맞춘다 — 맨홀은 여전히 전체(시설
    // 필터만 적용)를 그리되, 줌/시점은 고른 노선 쪽에 집중시켜야 "노선 선택 = 확대"로 느껴진다.
    const activeRoutes = selectedRouteIds.length === 0 ? routes : routes.filter(r => selectedRouteIds.includes(r.id));
    const focusIds = selectedRouteIds.length === 0 ? null : new Set(activeRoutes.flatMap(r => r.manholeIds));
    const focusBox = new THREE.Box3();

    for (const m of shown) {
      const x = num(m.x), y = num(m.y);
      if (x === null || y === null) continue;
      const bottom = num(manholeInvertOut(m));
      if (bottom === null) continue;
      const top = num(m.gl) ?? bottom;
      const h = Math.max(0.3, (top - bottom) * vexag);
      const sizeInfo = TYPE_SIZE[m.typeLabel || ''];
      const color = m.remarks ? WARN_COLOR : (m.system ? SYSTEM_COLOR[m.system] : 0x9fb4e0);
      const mat = new THREE.MeshStandardMaterial({ color });
      let mesh: THREE.Mesh;
      if (sizeInfo?.circleM) {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(sizeInfo.circleM / 2, sizeInfo.circleM / 2, h, 16), mat);
      } else {
        const side = sizeInfo?.boxM || DEFAULT_BOX_M;
        mesh = new THREE.Mesh(new THREE.BoxGeometry(side, h, side), mat);
      }
      mesh.position.set(x - ox, bottom * vexag + h / 2, -(y - oy));
      mesh.userData = { kind: 'node', d: { name: m.name, z: bottom, gl: num(m.gl), typeLabel: m.typeLabel || '', remarks: m.remarks || '' } };
      group.add(mesh);
      s.pickables.push(mesh);
      if (focusIds === null || focusIds.has(m.id)) focusBox.expandByPoint(mesh.position);
      if (showLabels) {
        const label = makeLabel(m.name);
        label.position.set(x - ox, top * vexag + 1.6, -(y - oy));
        group.add(label);
        s.labelSprites.push(label);
      }
    }

    const drawRouteEdges = (route: SurveyRoute, highlight: boolean) => {
      for (const sp of buildSpans(route, manholes)) {
        if (!passSystem(sp.start) && !passSystem(sp.end)) continue;
        const x1 = num(sp.start.x), y1 = num(sp.start.y), x2 = num(sp.end.x), y2 = num(sp.end.y);
        const z1 = num(manholeInvertOut(sp.start)), z2 = num(manholeInvertIn(sp.end));
        if (x1 === null || y1 === null || x2 === null || y2 === null || z1 === null || z2 === null) continue;
        const a = new THREE.Vector3(x1 - ox, z1 * vexag, -(y1 - oy));
        const b = new THREE.Vector3(x2 - ox, z2 * vexag, -(y2 - oy));
        const sys = sp.start.system || sp.end.system;
        const mat = highlight
          ? new THREE.MeshStandardMaterial({ color: RELATED_COLOR, emissive: RELATED_COLOR, emissiveIntensity: 0.35, transparent: true, opacity: 0.8 })
          : new THREE.MeshStandardMaterial({ color: sys ? SYSTEM_COLOR[sys] : 0x6677aa });
        const r = (sp.diaMm ? sp.diaMm / 1000 / 2 : PIPE_R_M) * (highlight ? 1.15 : 1);
        const mesh = cylinderBetween(a, b, r, mat);
        mesh.userData = {
          kind: 'edge',
          d: { startName: sp.start.name, endName: sp.end.name, system: sys, length: sp.length, diaMm: sp.diaMm },
          related: highlight, routeId: route.id, routeName: route.name
        };
        group.add(mesh);
        s.pickables.push(mesh);
        // 선택한 노선의 구간만 포커스 범위에 넣는다 — 추천(강조) 노선까지 넣으면 매번 화면이
        // 넓어져 "선택 = 확대"가 흐려진다. 추천 노선은 보이기만 하고 줌 범위는 안 바꾼다.
        if (!highlight) {
          focusBox.expandByPoint(a);
          focusBox.expandByPoint(b);
        }
      }
    };

    for (const route of activeRoutes) drawRouteEdges(route, false);

    // 선택한 노선 주변에 겹치거나 가까운 다른 공종 노선을 강조색으로 같이 보여준다 —
    // 탭하면 바로 선택에 추가된다(위 picking 핸들러의 ud.related 처리).
    const related: RelatedRoute[] = selectedRouteIds.length > 0
      ? findRelatedRoutes(activeRoutes, routes, manholes, relatedThresholdM)
      : [];
    for (const rr of related) drawRouteEdges(rr.route, true);

    scene.add(group);
    group.updateMatrixWorld(true);
    // 노선을 하나 골랐는데 그 노선에 좌표 있는 맨홀/구간이 하나도 없으면(포커스 범위가 비면)
    // 전체 범위로라도 보여준다 — 화면이 안 움직이는 것보다는 낫다.
    const box = !focusBox.isEmpty() ? focusBox : new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x, size.z, 20) * 1.3;
    camera.position.set(center.x + dist * 0.6, dist * 0.5 + 20, center.z + dist * 0.6);
    controls.target.copy(center);
    controls.update();
  }

  if (!isOpen) return null;

  const systemCounts = manholes.reduce<Record<string, number>>((acc, m) => {
    const k = m.system || '미지정';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  // 패널에 보여줄 "관련 노선 추천" — 고른 노선과 겹치거나 가까운 다른 노선을 거리순으로.
  const activeRouteObjs = selectedRouteIds.length === 0 ? [] : routes.filter(r => selectedRouteIds.includes(r.id));
  const relatedSuggestions: RelatedRoute[] = activeRouteObjs.length > 0
    ? findRelatedRoutes(activeRouteObjs, routes, manholes, relatedThresholdM)
    : [];

  // 노선 선택 패널의 시설 필터용 — 노선마다 구성 맨홀로 추정한 시설과, 시설별 개수
  const routeSystems = new Map(routes.map(r => [r.id, routeSystem(r, manholes)]));
  const routeSystemCounts = routes.reduce<Record<string, number>>((acc, r) => {
    const sys = routeSystems.get(r.id) || '미지정';
    acc[sys] = (acc[sys] || 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: 105, display: 'flex', flexDirection: 'column', background: '#0b0f1a' }}>
      <div style={{ background: 'var(--surface)', padding: '8px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <BoxIcon size={18} className="text-blue-500" />
          <b style={{ fontSize: '14px' }}>3D 뷰어</b>
          <select value={systemFilter} onChange={e => setSystemFilter(e.target.value as any)} style={{ height: '28px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <option value="전체">전체 {manholes.length}</option>
            {MANHOLE_SYSTEMS.map(sys => <option key={sys} value={sys}>{sys} {systemCounts[sys] || 0}</option>)}
          </select>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setRoutePanelOpen(v => !v)}
              style={{
                height: '28px', fontSize: '11.5px', borderRadius: '6px', padding: '0 8px', cursor: 'pointer',
                border: `1px solid ${selectedRouteIds.length ? 'var(--primary)' : 'var(--line)'}`,
                background: selectedRouteIds.length ? 'var(--primary-bg)' : 'var(--surface-2)',
                color: selectedRouteIds.length ? 'var(--primary)' : 'inherit'
              }}
            >
              {selectedRouteIds.length === 0 ? '전체 노선' : `노선 ${selectedRouteIds.length}개 선택됨`}
            </button>
            {routePanelOpen && (
              <div style={{
                position: 'absolute', top: '32px', left: 0, zIndex: 20, width: '280px', maxHeight: '420px',
                display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,.4)', overflow: 'hidden'
              }}>
                {activeRouteObjs.length > 0 && (
                  <div style={{ padding: '8px', borderBottom: '1px solid var(--line-2)', background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-2)' }}>🔶 근처 다른 노선 추천</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', color: 'var(--ink-3)' }}>
                        반경
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={relatedThresholdM}
                          onChange={e => setRelatedThresholdM(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                          style={{ width: '40px', height: '22px', fontSize: '10.5px', padding: '0 4px' }}
                        />
                        m
                      </label>
                    </div>
                    {relatedSuggestions.length === 0 ? (
                      <div style={{ fontSize: '11px', color: 'var(--ink-3)' }}>반경 {relatedThresholdM}m 안에 겹치거나 가까운 다른 노선이 없습니다.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                        {relatedSuggestions.map(rr => (
                          <button
                            key={rr.route.id}
                            type="button"
                            onClick={() => setSelectedRouteIds(prev => prev.includes(rr.route.id) ? prev : [...prev, rr.route.id])}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
                              fontSize: '11px', padding: '4px 8px', borderRadius: '6px', textAlign: 'left',
                              border: `1px solid ${RELATED_COLOR_CSS}`, background: `${RELATED_COLOR_CSS}22`, cursor: 'pointer'
                            }}
                          >
                            <span>{rr.route.name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                              {rr.distanceM <= 0.1 ? '교차' : `${rr.distanceM.toFixed(1)}m`} · +추가
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding: '8px', borderBottom: '1px solid var(--line-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10.5px', color: 'var(--ink-2)', fontWeight: 600 }}>시설</span>
                  <select
                    value={routePanelSystemFilter}
                    onChange={e => setRoutePanelSystemFilter(e.target.value as any)}
                    style={{ flex: 1, height: '24px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--line)' }}
                  >
                    <option value="전체">전체 {routes.length}</option>
                    {MANHOLE_SYSTEMS.map(sys => <option key={sys} value={sys}>{sys} {routeSystemCounts[sys] || 0}</option>)}
                  </select>
                </div>
                <div style={{ padding: '8px', borderBottom: '1px solid var(--line-2)', display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="노선 검색..."
                    value={routeSearch}
                    onChange={e => setRouteSearch(e.target.value)}
                    style={{ flex: 1, height: '26px', fontSize: '11.5px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedRouteIds([])}
                    disabled={selectedRouteIds.length === 0}
                    style={{ fontSize: '10.5px', padding: '2px 8px', borderRadius: '6px' }}
                  >
                    전체보기
                  </button>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {routes
                    .filter(r => !routeSearch.trim() || r.name.toLowerCase().includes(routeSearch.trim().toLowerCase()))
                    .filter(r => routePanelSystemFilter === '전체' || routeSystems.get(r.id) === routePanelSystemFilter)
                    .map(r => {
                      const sys = routeSystems.get(r.id);
                      return (
                        <label
                          key={r.id}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', borderBottom: '1px solid var(--line-2)' }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedRouteIds.includes(r.id)}
                            onChange={() => setSelectedRouteIds(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                          />
                          {sys && <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: MANHOLE_SYSTEM_COLOR[sys], flexShrink: 0 }} />}
                          {r.name}
                        </label>
                      );
                    })}
                  {routes.length === 0 && <div style={{ padding: '10px', fontSize: '11px', color: 'var(--ink-3)' }}>노선이 없습니다</div>}
                </div>
                <div style={{ padding: '6px 8px', borderTop: '1px solid var(--line-2)', textAlign: 'right' }}>
                  <button type="button" onClick={() => setRoutePanelOpen(false)} style={{ fontSize: '11px', padding: '3px 10px' }}>닫기</button>
                </div>
              </div>
            )}
          </div>
          <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '11px' }}>
            과장
            <input type="range" min={1} max={30} value={vexag} onChange={e => setVexag(Number(e.target.value))} style={{ width: '80px' }} />
            {vexag}x
          </label>
          <label style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '11px' }}>
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> 이름
          </label>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--ink-2)', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>
      <div ref={mountRef} style={{ flex: 1, position: 'relative', minHeight: 0 }} />
      {emptyMsg && (
        <div style={{ position: 'absolute', inset: 0, top: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', pointerEvents: 'none' }}>
          <div style={{ maxWidth: 360, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13, lineHeight: 1.6 }}>
            {emptyMsg}
          </div>
        </div>
      )}
      {panel && (
        <div style={{ position: 'absolute', left: 10, bottom: 10, maxWidth: '85%', background: 'rgba(10,14,26,.9)', color: '#cdd6f4', fontSize: 12, padding: '8px 12px', borderRadius: 10, border: '1px solid #334' }}>
          {panel}
        </div>
      )}
    </div>
  );
};
