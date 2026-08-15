# 📐 현장 측량 레벨 야장 전문 모바일 앱 (Field Survey Level App)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20%7C%20Android%20APK-blue)](#)
[![React](https://img.shields.io/badge/Framework-React%20%7C%20Vite%20%7C%20TypeScript-brightgreen)](#)

> **토목·건설 현장 기술자를 위한 스마트폰 최적화 측량 레벨 야장 전용 앱**  
> 관로 터파기 측량, 규격별 관두께 자동 세팅, 하이브리드 시공 검측, 표준 레벨 야장, GPS 맨홀 거리 측정 및 100% 오프라인 동작을 지원합니다.

---

## 📱 주요 핵심 기능

### 1. 🏗️ 관로 터파기 측량 야장 (특화 기능)
- **규격별 관두께(t) 자동 지정 엔진**:
  - **PP 이중벽관** (150mm~1100mm) 관경 선택 시 관두께(7mm~44mm) 자동 입력
  - **우수공관** (450mm~1500mm) 관경 선택 시 관두께(21mm, 21.7mm) 및 기초폭/관외경(Bd) 자동 안내
  - **사용자 직접 입력**: 커스텀 규격 지원
- **기계고(I.H) 설정 모드**: TBM + 후시(B.S) 모드 또는 기계고 직접 입력 모드
- **마이너스 관저고 부호(+/−) 터치 토글**: 키패드 입력 스트레스 없는 스마트폰 원터치 부호 조절
- **오차 범주 판정**: 허용오차(±mm) 기준 **적정(Green)** / **더파기 ▼(Red)** / **되메움 ▲(Blue)** 실시간 판정

### 2. 🎯 하이브리드 시공 단계별 검측 높이 선택
현장 시공 단계에 맞춰 검측 목표 높이를 자유롭게 전환하면 목표 읽음과 판정이 실시간 재계산됩니다:
- **터파기 바닥고**: $\text{관저고} - \text{기초총두께}$
- **잡석/골재 채움고**: $\text{관저고} - \text{관두께} - \text{콘크리트}$
- **기초 콘크리트 타설고**: $\text{관저고} - \text{관두께}$
- **관저고 (Invert EL)**: $\text{관저고}$
- **관상단고 (Pipe Crown EL)**: $\text{관저고} + \text{관경} + \text{관두께}$
- **지정 검측고**: 오프셋(m) 자유 지정

### 3. 📐 표준 레벨 야장 (고저 측량 / 수준 측량)
- **계산 방식 전환**: 기계고식 (I.H 방식) $\leftrightarrow$ 승강식 (Rise & Fall 방식)
- **자동 행 추가 (Auto Append)**: 측점 기입 시 다음 측점 행 자동 생성
- **검산식 (Page Check)**: $\sum BS - \sum FS = \text{최종GH} - \text{최초GH}$ 검산 공식 자동 판단 및 폐합오차(mm) 산출

### 4. 📷 맨홀 사진 촬영 & GPS 자동 연장(L) 거리 계산
- 시점(MH01) 및 종점(MH02) 사진 촬영 시 고정밀 GPS 위도/경도 수집
- 하버사인(Haversine) 구면거리 알고리즘으로 두 맨홀 간 실측 거리(m) 자동 계산 및 연장 L 자동 입력

### 5. 💾 다중 작업 세션 저장 & 100% 오프라인 동작
- 현장별/구간별 작업 데이터 멀티 세션 저장, 불러오기, 삭제 관리
- 통신이 터지지 않는 음영지역에서도 로컬스토리지 100% 완벽 동작
- **CSV 저장 (UTF-8 BOM)** 및 **카카오톡/메모장용 클립보드 표 복사** 지원

---

## 🚀 시작하기 (Getting Started)

### 사전 조건 (Prerequisites)
- [Node.js](https://nodejs.org/) (v18 이상 권장)

### 설치 및 로컬 실행
```bash
# 1. 저장소 클론
git clone https://github.com/YOUR_GITHUB_USERNAME/survey-level-app.git
cd survey-level-app

# 2. 패키지 설치
npm install

# 3. 개발 서버 실행
npm run dev
```

### 웹 프로덕션 빌드
```bash
npm run build
```

---

## 📲 모바일 배포 및 앱 빌드 (PWA & Android)

### 1) PWA (홈 화면에 추가)
- 모바일 Safari, Chrome, 삼성인터넷 브라우저에서 배포 URL 접속 후 **"홈 화면에 추가"**를 누르면 앱 스토어 설치 없이 독립 앱 아이콘으로 구동됩니다.

### 2) 안드로이드 APK 앱 빌드 (Capacitor)
```bash
# Web 빌드 후 Capacitor Android 동기화
npm run build
npx cap copy android
npx cap open android
```
- 안드로이드 스튜디오(Android Studio)가 시작되면 `Build > Build APK(s)`를 눌러 `.apk` 파일 생성.

---

## 📄 라이선스 (License)
This project is licensed under the [MIT License](LICENSE).
