import { CadEntity, CadLine, CadPolyline, CadCircle, CadArc, CadDrawingData } from '../types/cad';

/**
 * AutoCAD Color Index (ACI 1~9) 표준 색상 매핑
 */
const ACI_COLORS: Record<number, string> = {
  1: '#EF4444', // 빨강
  2: '#F59E0B', // 노랑
  3: '#10B981', // 초록
  4: '#06B6D4', // 시안 (하늘)
  5: '#3B82F6', // 파랑
  6: '#EC4899', // 마젠타 (분홍)
  7: '#E5E7EB', // 흰색/밝은회색
  8: '#6B7280', // 진회색
  9: '#9CA3AF'  // 연회색
};

const LAYER_PALETTE = [
  '#3B82F6', // 파랑
  '#10B981', // 초록
  '#F59E0B', // 주황/노랑
  '#EF4444', // 빨강
  '#8B5CF6', // 보라
  '#06B6D4', // 시안
  '#EC4899', // 핑크
  '#F97316', // 오렌지
  '#14B8A6', // 청록
  '#6366F1'  // 인디고
];

function getPaletteColor(layerIndex: number): string {
  return LAYER_PALETTE[layerIndex % LAYER_PALETTE.length];
}

function calc2dDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

/**
 * 표준 DXF (ASCII) 파일 텍스트를 파싱하여 선, 폴리라인, 원, 호 객체를 추출합니다.
 */
export function parseDxf(text: string, fileName = 'drawing.dxf'): CadDrawingData {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const n = lines.length;

  let inEntities = false;
  let i = 0;

  const entities: CadEntity[] = [];
  const layerSet = new Set<string>();
  const layerColors: Record<string, string> = {};

  // 통계
  let lineCount = 0;
  let polylineCount = 0;
  let circleCount = 0;
  let arcCount = 0;

  let entityId = 1;

  while (i < n - 1) {
    const code = parseInt(lines[i].trim(), 10);
    const val = lines[i + 1] ? lines[i + 1].trim() : '';
    i += 2;

    // SECTION 탐색
    if (code === 0 && val === 'SECTION') {
      const nextCode = parseInt(lines[i]?.trim(), 10);
      const nextVal = lines[i + 1]?.trim();
      if (nextCode === 2 && nextVal === 'ENTITIES') {
        inEntities = true;
        i += 2;
        continue;
      }
    }

    if (code === 0 && val === 'ENDSEC') {
      if (inEntities) {
        inEntities = false;
        break; // ENTITIES 섹션 파싱 완료
      }
    }

    if (!inEntities) continue;

    // ENTITIES 내부의 엔티티 파싱
    if (code === 0) {
      const entityType = val.toUpperCase();

      if (entityType === 'LINE') {
        let layer = '0';
        let colorIndex: number | undefined;
        let x1: number | null = null;
        let y1: number | null = null;
        let x2: number | null = null;
        let y2: number | null = null;

        while (i < n - 1) {
          const c = parseInt(lines[i].trim(), 10);
          const v = lines[i + 1] ? lines[i + 1].trim() : '';
          if (c === 0) break; // 다음 엔티티
          i += 2;

          if (c === 8) layer = v;
          else if (c === 62) colorIndex = parseInt(v, 10);
          else if (c === 10) x1 = parseFloat(v);
          else if (c === 20) y1 = parseFloat(v);
          else if (c === 11) x2 = parseFloat(v);
          else if (c === 21) y2 = parseFloat(v);
        }

        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null && isFinite(x1) && isFinite(x2)) {
          layerSet.add(layer);
          const color = (colorIndex && ACI_COLORS[colorIndex]) || undefined;
          const len = calc2dDist(x1, y1, x2, y2);
          entities.push({
            type: 'line',
            id: `line_${entityId++}`,
            layer,
            start: [x1, y1],
            end: [x2, y2],
            color,
            lengthM: Math.round(len * 1000) / 1000
          });
          lineCount++;
        }
      } else if (entityType === 'LWPOLYLINE') {
        let layer = '0';
        let colorIndex: number | undefined;
        let isClosed = false;
        const vertices: [number, number][] = [];
        let currX: number | null = null;

        while (i < n - 1) {
          const c = parseInt(lines[i].trim(), 10);
          const v = lines[i + 1] ? lines[i + 1].trim() : '';
          if (c === 0) break;
          i += 2;

          if (c === 8) layer = v;
          else if (c === 62) colorIndex = parseInt(v, 10);
          else if (c === 70) isClosed = (parseInt(v, 10) & 1) === 1;
          else if (c === 10) {
            currX = parseFloat(v);
          } else if (c === 20) {
            if (currX !== null) {
              const y = parseFloat(v);
              if (isFinite(currX) && isFinite(y)) {
                vertices.push([currX, y]);
              }
              currX = null;
            }
          }
        }

        if (vertices.length >= 2) {
          layerSet.add(layer);
          const color = (colorIndex && ACI_COLORS[colorIndex]) || undefined;
          let totalLen = 0;
          for (let vi = 0; vi < vertices.length - 1; vi++) {
            totalLen += calc2dDist(vertices[vi][0], vertices[vi][1], vertices[vi + 1][0], vertices[vi + 1][1]);
          }
          if (isClosed && vertices.length > 2) {
            totalLen += calc2dDist(vertices[vertices.length - 1][0], vertices[vertices.length - 1][1], vertices[0][0], vertices[0][1]);
          }
          entities.push({
            type: 'polyline',
            id: `poly_${entityId++}`,
            layer,
            vertices,
            closed: isClosed,
            color,
            lengthM: Math.round(totalLen * 1000) / 1000
          });
          polylineCount++;
        }
      } else if (entityType === 'POLYLINE') {
        // 구버전 2D/3D POLYLINE: VERTEX 엔티티들이 뒤따르고 SEQEND로 종료
        let layer = '0';
        let colorIndex: number | undefined;
        let isClosed = false;
        const vertices: [number, number][] = [];

        while (i < n - 1) {
          const c = parseInt(lines[i].trim(), 10);
          const v = lines[i + 1] ? lines[i + 1].trim() : '';
          if (c === 0) {
            if (v.toUpperCase() === 'VERTEX') {
              i += 2;
              let vx: number | null = null;
              let vy: number | null = null;
              while (i < n - 1) {
                const vc = parseInt(lines[i].trim(), 10);
                const vv = lines[i + 1] ? lines[i + 1].trim() : '';
                if (vc === 0) break;
                i += 2;
                if (vc === 10) vx = parseFloat(vv);
                else if (vc === 20) vy = parseFloat(vv);
              }
              if (vx !== null && vy !== null && isFinite(vx) && isFinite(vy)) {
                vertices.push([vx, vy]);
              }
              continue;
            } else if (v.toUpperCase() === 'SEQEND') {
              i += 2;
              break;
            } else {
              break;
            }
          }
          i += 2;
          if (c === 8) layer = v;
          else if (c === 62) colorIndex = parseInt(v, 10);
          else if (c === 70) isClosed = (parseInt(v, 10) & 1) === 1;
        }

        if (vertices.length >= 2) {
          layerSet.add(layer);
          const color = (colorIndex && ACI_COLORS[colorIndex]) || undefined;
          let totalLen = 0;
          for (let vi = 0; vi < vertices.length - 1; vi++) {
            totalLen += calc2dDist(vertices[vi][0], vertices[vi][1], vertices[vi + 1][0], vertices[vi + 1][1]);
          }
          entities.push({
            type: 'polyline',
            id: `poly_${entityId++}`,
            layer,
            vertices,
            closed: isClosed,
            color,
            lengthM: Math.round(totalLen * 1000) / 1000
          });
          polylineCount++;
        }
      } else if (entityType === 'CIRCLE') {
        let layer = '0';
        let colorIndex: number | undefined;
        let cx: number | null = null;
        let cy: number | null = null;
        let r: number | null = null;

        while (i < n - 1) {
          const c = parseInt(lines[i].trim(), 10);
          const v = lines[i + 1] ? lines[i + 1].trim() : '';
          if (c === 0) break;
          i += 2;

          if (c === 8) layer = v;
          else if (c === 62) colorIndex = parseInt(v, 10);
          else if (c === 10) cx = parseFloat(v);
          else if (c === 20) cy = parseFloat(v);
          else if (c === 40) r = parseFloat(v);
        }

        if (cx !== null && cy !== null && r !== null && isFinite(cx) && isFinite(r) && r > 0) {
          layerSet.add(layer);
          const color = (colorIndex && ACI_COLORS[colorIndex]) || undefined;
          entities.push({
            type: 'circle',
            id: `circle_${entityId++}`,
            layer,
            center: [cx, cy],
            radius: Math.round(r * 1000) / 1000,
            color
          });
          circleCount++;
        }
      } else if (entityType === 'ARC') {
        let layer = '0';
        let colorIndex: number | undefined;
        let cx: number | null = null;
        let cy: number | null = null;
        let r: number | null = null;
        let startAngle: number | null = null;
        let endAngle: number | null = null;

        while (i < n - 1) {
          const c = parseInt(lines[i].trim(), 10);
          const v = lines[i + 1] ? lines[i + 1].trim() : '';
          if (c === 0) break;
          i += 2;

          if (c === 8) layer = v;
          else if (c === 62) colorIndex = parseInt(v, 10);
          else if (c === 10) cx = parseFloat(v);
          else if (c === 20) cy = parseFloat(v);
          else if (c === 40) r = parseFloat(v);
          else if (c === 50) startAngle = parseFloat(v);
          else if (c === 51) endAngle = parseFloat(v);
        }

        if (cx !== null && cy !== null && r !== null && startAngle !== null && endAngle !== null && isFinite(cx) && r > 0) {
          layerSet.add(layer);
          const color = (colorIndex && ACI_COLORS[colorIndex]) || undefined;
          entities.push({
            type: 'arc',
            id: `arc_${entityId++}`,
            layer,
            center: [cx, cy],
            radius: Math.round(r * 1000) / 1000,
            startAngle,
            endAngle,
            color
          });
          arcCount++;
        }
      }
    }
  }

  // 레이어 색상 및 가시성 초기화
  const layers = Array.from(layerSet).sort();
  const visibleLayers: Record<string, boolean> = {};

  layers.forEach((layerName, idx) => {
    layerColors[layerName] = getPaletteColor(idx);
    visibleLayers[layerName] = true; // 기본값 모두 보임
  });

  return {
    id: `cad_${Date.now()}`,
    fileName,
    uploadedAt: new Date().toLocaleString('ko-KR'),
    layers,
    layerColors,
    visibleLayers,
    entities,
    stats: {
      total: entities.length,
      lines: lineCount,
      polylines: polylineCount,
      circles: circleCount,
      arcs: arcCount
    }
  };
}

/**
 * 텍스트 또는 CSV 블록에서 선/원 객체를 파싱합니다.
 *
 * 지원 형식:
 * 1) 선: LINE, 레이어명, X1, Y1, X2, Y2 (또는 선, 레이어명, X1, Y1, X2, Y2)
 * 2) 원: CIRCLE, 레이어명, X, Y, 반지름 (또는 원, 레이어명, X, Y, 반지름)
 * 3) 좌표쌍: X1, Y1, X2, Y2 (기본 레이어 'CAD_LINE')
 */
export function parseCadText(text: string): CadEntity[] {
  const lines = text.split(/\r?\n/);
  const entities: CadEntity[] = [];
  let id = 1;

  lines.forEach(line => {
    const clean = line.trim();
    if (!clean || clean.startsWith('#') || clean.startsWith('//')) return;

    // 쉼표, 탭, 공백 분리
    const parts = clean.split(/[,\t\s]+/).filter(Boolean);
    if (parts.length < 3) return;

    const first = parts[0].toUpperCase();

    if (first === 'LINE' || first === '선') {
      // LINE, [layer], x1, y1, x2, y2
      if (parts.length >= 6) {
        const layer = parts[1];
        const x1 = parseFloat(parts[2]);
        const y1 = parseFloat(parts[3]);
        const x2 = parseFloat(parts[4]);
        const y2 = parseFloat(parts[5]);
        if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
          entities.push({
            type: 'line',
            id: `text_line_${id++}`,
            layer,
            start: [x1, y1],
            end: [x2, y2],
            lengthM: Math.round(calc2dDist(x1, y1, x2, y2) * 1000) / 1000
          });
        }
      } else if (parts.length === 5) {
        // LINE, x1, y1, x2, y2
        const x1 = parseFloat(parts[1]);
        const y1 = parseFloat(parts[2]);
        const x2 = parseFloat(parts[3]);
        const y2 = parseFloat(parts[4]);
        if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
          entities.push({
            type: 'line',
            id: `text_line_${id++}`,
            layer: '선',
            start: [x1, y1],
            end: [x2, y2],
            lengthM: Math.round(calc2dDist(x1, y1, x2, y2) * 1000) / 1000
          });
        }
      }
    } else if (first === 'CIRCLE' || first === '원') {
      // CIRCLE, [layer], cx, cy, r
      if (parts.length >= 5) {
        const layer = parts[1];
        const cx = parseFloat(parts[2]);
        const cy = parseFloat(parts[3]);
        const r = parseFloat(parts[4]);
        if (isFinite(cx) && isFinite(cy) && isFinite(r) && r > 0) {
          entities.push({
            type: 'circle',
            id: `text_circle_${id++}`,
            layer,
            center: [cx, cy],
            radius: Math.round(r * 1000) / 1000
          });
        }
      } else if (parts.length === 4) {
        const cx = parseFloat(parts[1]);
        const cy = parseFloat(parts[2]);
        const r = parseFloat(parts[3]);
        if (isFinite(cx) && isFinite(cy) && isFinite(r) && r > 0) {
          entities.push({
            type: 'circle',
            id: `text_circle_${id++}`,
            layer: '원',
            center: [cx, cy],
            radius: Math.round(r * 1000) / 1000
          });
        }
      }
    } else if (parts.length >= 4) {
      // 숫자 4개 연속 -> X1 Y1 X2 Y2 선분
      const x1 = parseFloat(parts[0]);
      const y1 = parseFloat(parts[1]);
      const x2 = parseFloat(parts[2]);
      const y2 = parseFloat(parts[3]);
      if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
        entities.push({
          type: 'line',
          id: `text_line_${id++}`,
          layer: '기타선',
          start: [x1, y1],
          end: [x2, y2],
          lengthM: Math.round(calc2dDist(x1, y1, x2, y2) * 1000) / 1000
        });
      }
    }
  });

  return entities;
}

/**
 * ARC(호) 객체를 Leaflet Polyline으로 그리기 위한 정점 배열로 변환합니다.
 */
export function arcToVertices(
  center: [number, number],
  radius: number,
  startAngle: number,
  endAngle: number,
  steps = 24
): [number, number][] {
  const [cx, cy] = center;
  let start = startAngle;
  let end = endAngle;
  if (end < start) end += 360;

  const sweep = end - start;
  const numSteps = Math.max(8, Math.min(steps, Math.ceil((sweep / 360) * steps)));
  const vertices: [number, number][] = [];

  for (let s = 0; s <= numSteps; s++) {
    const angleDeg = start + (sweep * s) / numSteps;
    const rad = (angleDeg * Math.PI) / 180;
    const x = cx + radius * Math.cos(rad);
    const y = cy + radius * Math.sin(rad);
    vertices.push([x, y]);
  }

  return vertices;
}

/**
 * CadEntity 배열로부터 CadDrawingData 객체를 생성합니다.
 */
export function createCadDrawingData(entities: CadEntity[], fileName = '직접입력_도면'): CadDrawingData {
  const layerSet = new Set<string>();
  const layerColors: Record<string, string> = {};
  const visibleLayers: Record<string, boolean> = {};

  let lines = 0;
  let polylines = 0;
  let circles = 0;
  let arcs = 0;

  entities.forEach(e => {
    const l = e.layer || '기본';
    layerSet.add(l);
    if (e.type === 'line') lines++;
    else if (e.type === 'polyline') polylines++;
    else if (e.type === 'circle') circles++;
    else if (e.type === 'arc') arcs++;
  });

  const layers = Array.from(layerSet).sort();
  layers.forEach((layerName, idx) => {
    layerColors[layerName] = getPaletteColor(idx);
    visibleLayers[layerName] = true;
  });

  return {
    id: `cad_${Date.now()}`,
    fileName,
    uploadedAt: new Date().toLocaleString('ko-KR'),
    layers,
    layerColors,
    visibleLayers,
    entities,
    stats: {
      total: entities.length,
      lines,
      polylines,
      circles,
      arcs
    }
  };
}

