import { describe, it, expect } from 'vitest';
import { parseDxf, parseCadText, createCadDrawingData } from './dxfParser';

describe('dxfParser — DXF 파일 파싱 검증', () => {
  it('LINE, LWPOLYLINE, CIRCLE, ARC 엔티티를 정확히 파싱한다', () => {
    const sampleDxf = `
  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LINE
  8
C-ROAD
 10
181500.0
 20
414500.0
 11
181530.0
 21
414540.0
  0
LWPOLYLINE
  8
C-PIPE
 90
3
 70
1
 10
181200.0
 20
412300.0
 10
181250.0
 20
412300.0
 10
181250.0
 20
412350.0
  0
CIRCLE
  8
C-MH
 10
181520.0
 20
414510.0
 40
1.5
  0
ARC
  8
C-STR
 10
181530.0
 20
414520.0
 40
5.0
 50
0.0
 51
90.0
  0
ENDSEC
  0
EOF
`;

    const res = parseDxf(sampleDxf, 'test.dxf');

    expect(res.stats.lines).toBe(1);
    expect(res.stats.polylines).toBe(1);
    expect(res.stats.circles).toBe(1);
    expect(res.stats.arcs).toBe(1);
    expect(res.stats.total).toBe(4);

    // LINE 검증
    const line = res.entities.find(e => e.type === 'line');
    expect(line).toBeDefined();
    if (line && line.type === 'line') {
      expect(line.layer).toBe('C-ROAD');
      expect(line.start).toEqual([181500.0, 414500.0]);
      expect(line.end).toEqual([181530.0, 414540.0]);
      expect(line.lengthM).toBe(50); // 3-4-5 직각삼각형 30^2 + 40^2 = 50^2
    }

    // LWPOLYLINE 검증
    const poly = res.entities.find(e => e.type === 'polyline');
    expect(poly).toBeDefined();
    if (poly && poly.type === 'polyline') {
      expect(poly.layer).toBe('C-PIPE');
      expect(poly.vertices.length).toBe(3);
      expect(poly.closed).toBe(true);
    }

    // CIRCLE 검증
    const circle = res.entities.find(e => e.type === 'circle');
    expect(circle).toBeDefined();
    if (circle && circle.type === 'circle') {
      expect(circle.layer).toBe('C-MH');
      expect(circle.center).toEqual([181520.0, 414510.0]);
      expect(circle.radius).toBe(1.5);
    }

    // ARC 검증
    const arc = res.entities.find(e => e.type === 'arc');
    expect(arc).toBeDefined();
    if (arc && arc.type === 'arc') {
      expect(arc.layer).toBe('C-STR');
      expect(arc.center).toEqual([181530.0, 414520.0]);
      expect(arc.radius).toBe(5.0);
      expect(arc.startAngle).toBe(0.0);
      expect(arc.endAngle).toBe(90.0);
    }

    // 레이어 목록 검증
    expect(res.layers).toEqual(['C-MH', 'C-PIPE', 'C-ROAD', 'C-STR']);
    expect(res.visibleLayers['C-ROAD']).toBe(true);
  });
});

describe('dxfParser — 텍스트/CSV 직접 입력 파싱 검증', () => {
  it('LINE 및 CIRCLE 형식 문자열을 올바르게 엔티티로 변환한다', () => {
    const textInput = `
LINE, 도로중심선, 181000, 412000, 181100, 412000
CIRCLE, 맨홀외경, 181050, 412000, 1.2
선, 관로선, 181000, 412050, 181100, 412050
원, 집수정, 181020, 412020, 0.8
181200, 412100, 181300, 412100
`;

    const entities = parseCadText(textInput);
    expect(entities.length).toBe(5);

    expect(entities[0].type).toBe('line');
    expect(entities[0].layer).toBe('도로중심선');
    if (entities[0].type === 'line') {
      expect(entities[0].lengthM).toBe(100);
    }

    expect(entities[1].type).toBe('circle');
    expect(entities[1].layer).toBe('맨홀외경');
    if (entities[1].type === 'circle') {
      expect(entities[1].radius).toBe(1.2);
    }

    expect(entities[2].type).toBe('line');
    expect(entities[2].layer).toBe('관로선');

    expect(entities[3].type).toBe('circle');
    expect(entities[3].layer).toBe('집수정');

    expect(entities[4].type).toBe('line');
    expect(entities[4].layer).toBe('기타선');
  });

  it('createCadDrawingData가 CadEntity 배열을 올바른 CadDrawingData 구조로 래핑한다', () => {
    const textInput = `
LINE, 도로중심선, 181000, 412000, 181100, 412000
CIRCLE, 맨홀외경, 181050, 412000, 1.2
`;
    const entities = parseCadText(textInput);
    const drawing = createCadDrawingData(entities, '사용자입력_도면');

    expect(drawing.fileName).toBe('사용자입력_도면');
    expect(drawing.layers).toEqual(['도로중심선', '맨홀외경']);
    expect(drawing.visibleLayers['도로중심선']).toBe(true);
    expect(drawing.visibleLayers['맨홀외경']).toBe(true);
    expect(drawing.stats.lines).toBe(1);
    expect(drawing.stats.circles).toBe(1);
    expect(drawing.stats.total).toBe(2);
  });
});
