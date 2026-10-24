import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { X, Box as BoxIcon } from 'lucide-react';
import { ManholeMasterItem, ManholeSystem, MANHOLE_SYSTEMS, SurveyRoute, manholeInvertIn, manholeInvertOut } from '../types/survey';
import { buildSpans } from '../utils/routes';

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
  const [routeId, setRouteId] = useState<string>('__all__');
  const [vexag, setVexag] = useState(8);
  const [showLabels, setShowLabels] = useState(true);
  const [panel, setPanel] = useState<string | null>(null);

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
          (d.diaMm ? ` · D${d.diaMm}` : ' · 관경미상'));
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
  }, [isOpen, manholes, routes, systemFilter, routeId, vexag, showLabels]);

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
    if (!base.length) { scene.add(group); return; }
    const xs = base.map(m => num(m.x)!), ys = base.map(m => num(m.y)!);
    const ox = (Math.min(...xs) + Math.max(...xs)) / 2;
    const oy = (Math.min(...ys) + Math.max(...ys)) / 2;

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
      if (showLabels) {
        const label = makeLabel(m.name);
        label.position.set(x - ox, top * vexag + 1.6, -(y - oy));
        group.add(label);
        s.labelSprites.push(label);
      }
    }

    const activeRoutes = routeId === '__all__' ? routes : routes.filter(r => r.id === routeId);
    for (const route of activeRoutes) {
      for (const sp of buildSpans(route, manholes)) {
        if (!passSystem(sp.start) && !passSystem(sp.end)) continue;
        const x1 = num(sp.start.x), y1 = num(sp.start.y), x2 = num(sp.end.x), y2 = num(sp.end.y);
        const z1 = num(manholeInvertOut(sp.start)), z2 = num(manholeInvertIn(sp.end));
        if (x1 === null || y1 === null || x2 === null || y2 === null || z1 === null || z2 === null) continue;
        const a = new THREE.Vector3(x1 - ox, z1 * vexag, -(y1 - oy));
        const b = new THREE.Vector3(x2 - ox, z2 * vexag, -(y2 - oy));
        const sys = sp.start.system || sp.end.system;
        const mat = new THREE.MeshStandardMaterial({ color: sys ? SYSTEM_COLOR[sys] : 0x6677aa });
        const r = sp.diaMm ? sp.diaMm / 1000 / 2 : PIPE_R_M;
        const mesh = cylinderBetween(a, b, r, mat);
        mesh.userData = { kind: 'edge', d: { startName: sp.start.name, endName: sp.end.name, system: sys, length: sp.length, diaMm: sp.diaMm } };
        group.add(mesh);
        s.pickables.push(mesh);
      }
    }

    scene.add(group);
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
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
          <select value={routeId} onChange={e => setRouteId(e.target.value)} style={{ height: '28px', fontSize: '11.5px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <option value="__all__">전체 노선</option>
            {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
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
      {panel && (
        <div style={{ position: 'absolute', left: 10, bottom: 10, maxWidth: '85%', background: 'rgba(10,14,26,.9)', color: '#cdd6f4', fontSize: 12, padding: '8px 12px', borderRadius: 10, border: '1px solid #334' }}>
          {panel}
        </div>
      )}
    </div>
  );
};
