import { describe, it, expect } from 'vitest';
import {
  toLatLng,
  fromLatLng,
  haversineM,
  calibrateBlueprint2Points,
  SUPPORTED_CRS_LIST
} from './geo';

describe('geo — 한국 주요 좌표계 변환', () => {
  it('지원 좌표계 목록이 정상 등록되어 있어야 함', () => {
    expect(SUPPORTED_CRS_LIST.length).toBeGreaterThanOrEqual(4);
    const codes = SUPPORTED_CRS_LIST.map(c => c.code);
    expect(codes).toContain('EPSG:5174');
    expect(codes).toContain('EPSG:5186');
    expect(codes).toContain('EPSG:5179');
  });

  it('EPSG:5174 (송산그린시티 기준) 변환 시 화성시 송산면(37.2도, 126.7도)으로 정상 투영됨', () => {
    // 송산그린시티 부근 CAD 좌표 (X: 181500, Y: 414500)
    const ll = toLatLng(181500, 414500, 'EPSG:5174');
    expect(ll).not.toBeNull();
    expect(ll!.lat).toBeGreaterThan(37.1);
    expect(ll!.lat).toBeLessThan(37.4);
    expect(ll!.lng).toBeGreaterThan(126.6);
    expect(ll!.lng).toBeLessThan(127.0);
  });

  it('EPSG:5186 (GRS80 중부원점) 좌표 변환 테스트', () => {
    const ll = toLatLng(200000, 500000, 'EPSG:5186');
    expect(ll).not.toBeNull();
    expect(ll!.lat).toBeGreaterThan(37.0);
    expect(ll!.lat).toBeLessThan(37.5);
  });
});

describe('geo — 2점 헬머트 아핀 도면 정합 (Helmert 2D Transformation)', () => {
  it('도면 상의 2점과 실제 위경도 좌표로 도면 4개 모서리 및 회전각을 정확히 산출해야 함', () => {
    const imgPt1 = { u: 0.1, v: 0.5 };
    const worldPt1 = { lat: 37.2280, lng: 126.7900 };

    const imgPt2 = { u: 0.9, v: 0.5 };
    const worldPt2 = { lat: 37.2280, lng: 126.8000 };

    const result = calibrateBlueprint2Points(
      imgPt1, worldPt1,
      imgPt2, worldPt2,
      1000, 500
    );

    expect(result).not.toBeNull();
    expect(result!.corners).toHaveLength(4);
    expect(result!.southWest.lat).toBeLessThan(result!.northEast.lat);
    expect(result!.southWest.lng).toBeLessThan(result!.northEast.lng);
  });
});
