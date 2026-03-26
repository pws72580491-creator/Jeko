# 🥚 계란 재고관리

계란 입고·출고·완제품 제작/출고를 관리하는 모바일 친화적 웹 앱입니다.  
Firebase Realtime Database로 실시간 동기화되며, 오프라인에서도 localStorage로 동작합니다.

---

## 📁 프로젝트 구조

```
egg-inventory/
├── index.html        # 메인 HTML (UI 구조)
├── css/
│   └── style.css     # 전체 스타일
├── js/
│   ├── config.js     # ⚙️ Firebase 설정 (본인 값으로 교체)
│   └── app.js        # 앱 로직 전체
├── .gitignore
└── README.md
```

---

## 🚀 설치 및 실행

### 1. 저장소 클론

```bash
git clone https://github.com/본인아이디/egg-inventory.git
cd egg-inventory
```

### 2. Firebase 설정

`js/config.js` 파일을 열어 본인의 Firebase 프로젝트 값으로 교체합니다.

```js
const FIREBASE_CONFIG = {
  apiKey: "본인 키",
  authDomain: "본인 도메인",
  databaseURL: "본인 DB URL",
  ...
};
```

Firebase 콘솔 → 프로젝트 설정 → 앱 등록 → 웹 앱 구성에서 값을 확인할 수 있습니다.

### 3. Firebase Realtime Database 규칙 설정

Firebase 콘솔 → Realtime Database → 규칙 탭에서 아래 규칙을 게시합니다.

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### 4. 실행

#### 방법 A — 파일 직접 열기
`index.html`을 브라우저로 바로 열면 됩니다.

#### 방법 B — 로컬 서버 (권장)
```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .
```
브라우저에서 `http://localhost:8080` 접속

#### 방법 C — GitHub Pages 배포
1. GitHub에 Push
2. 저장소 Settings → Pages → Source: `main` 브랜치 루트(`/`) 선택
3. `https://본인아이디.github.io/egg-inventory` 로 접속

---

## 🔧 주요 기능

| 기능 | 설명 |
|------|------|
| 📊 대시보드 | 원란·완제품 재고 현황, 오늘 입출고, 최근 거래 내역 |
| 📥 입고 | 통·판·개 단위 입고 등록, 단가 관리 |
| 📤 원란출고 | 직원별 원란 출고, 재고 자동 차감 |
| 🏭 완제품제작 | 원란 → 완제품 전환, 원료 자동 차감 |
| 📦 완제품출고 | 완제품 출고, 직원별 관리 |
| 📈 통계 | 연/월별 입출고 금액 집계 |
| ✏️ 빠른입력 | 텍스트/음성으로 빠른 데이터 입력 |
| 📊 엑셀 | 전체 거래내역 XLSX 내보내기 |
| 🔥 Firebase | 실시간 동기화 + localStorage 오프라인 폴백 |

---

## 📦 단위 기준

| 품목 | 1통 | 1판 |
|------|-----|-----|
| 일반란 (왕란·특란 등) | 150판 | 30개 |
| 퓨왕·영왕 | 150판 | 15개 |
| 영특·10왕·10대 등 | 150판 | 10개 |
| 메추리 | 24판 | 1개 |

---

## 🛠 기술 스택

- **HTML / CSS / Vanilla JS** — 빌드 도구 없음, 파일 그대로 실행
- **Firebase Realtime Database** — 실시간 데이터 동기화
- **SheetJS (xlsx)** — 엑셀 내보내기
- **Web Speech API** — 음성 입력 (HTTPS 필요)
- **Google Fonts** — Nanum Gothic, Black Han Sans
