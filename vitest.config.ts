import { defineConfig } from 'vitest/config';

/**
 * 빌드용 vite.config.ts 와 분리해 둔다. PWA 플러그인은 테스트 실행과 무관하고,
 * 끼어들면 불필요한 사이드이펙트(서비스워커 생성 시도 등)가 생길 수 있다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
