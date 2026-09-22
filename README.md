# 모델 설명 리포트 (XAI Report App)

CSV 하나만 올리면 이진분류 모델을 실시간으로 학습하고, **SHAP** 기여도를 사람이 읽을 수 있는 문장으로 풀어서 보여주는 웹앱입니다. "AI가 왜 그렇게 판단했는지"를 케이스별로, 그리고 전체 데이터 관점에서 설명합니다.

**🔗 Live demo: https://xai-report.vercel.app**

## 무엇을 보여주나요

- **예측 근거 설명**: 케이스 하나하나에 대해 "이 요인이 예측을 어느 쪽으로, 얼마나 밀었는지"를 SHAP 값 기반 문장으로 풀이
- **전체 모델 품질 평가**: 정확도를 다수결(baseline) 기준과 비교, 소수 클래스 재현율까지 반영한 양호/참고/주의 판정
- **특성 중요도 & 방향성**: 어떤 컬럼이 예측에 큰 영향을 주는지, 값이 클수록 어느 쪽으로 작용하는 경향이 있는지
- **데이터 품질 진단**: 상관관계 매트릭스, IQR 기반 이상치, 결측치, 그리고 **0으로 기록된 숨은 결측 의심**까지(빈칸은 아니지만 통계적으로 "측정 안 함"에 가까운 값을 도메인 무관 기준으로 탐지)
- **케이스 탐색**: 예측이 맞은/틀린 케이스, 확신도 애매한(40~60%) 케이스를 필터링해서 확인
- **AI 자동 라벨링(Gemini)**: 업로드 CSV의 타겟 컬럼 값(예: `1`/`0`)과 각 컬럼의 의미를 Gemini API로 추측해서 미리 채워줌 — 항상 "AI 추정" 표시가 붙고, 직접 수정 가능
- **분석 결과 비교 · 이미지 저장**: 두 리포트를 나란히 비교하거나, 리포트를 PNG로 저장해서 공유

## 구조

```
analysis/   모델 학습 + SHAP 계산 스크립트 (로컬 전용, 원본 CSV는 Git에 미포함)
backend/    FastAPI — 업로드된 CSV를 실시간으로 학습·분석하는 API (Render 배포)
web/        Next.js(App Router) 프론트엔드 (Vercel 배포)
```

- 프리셋 3종(Titanic 생존 예측, HR 이직 예측, Telco 고객 이탈 예측)은 `analysis/`에서 미리 계산한 JSON을 `web/public/data/`에 정적으로 올려둔 것이고, 그 외 임의의 CSV는 `backend/`가 업로드 즉시 학습·분석합니다.

## 기술 스택

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, CSS Modules
- **Backend**: FastAPI, scikit-learn(RandomForest), SHAP
- **LLM**: Google Gemini API (`google-genai`) — 타겟값/컬럼 설명 자동 추정
- **배포**: Vercel(프론트) + Render(백엔드)

## 로컬 실행

### 백엔드

```bash
cd backend
pip install -r requirements.txt
export GEMINI_API_KEY=...   # 선택 — 없으면 AI 자동 라벨링만 조용히 꺼짐
uvicorn main:app --port 8000
```

### 프론트엔드

```bash
cd web
npm install
npm run dev   # http://localhost:3000, 기본적으로 http://localhost:8000 백엔드를 바라봄
```

다른 백엔드 주소를 쓰려면 `NEXT_PUBLIC_API_URL` 환경변수를 설정하세요.

## 데이터 받는 법 (Kaggle)

프리셋 3종의 원본 데이터는 라이선스상 저장소에 포함하지 않습니다(`analysis/data/raw/*.csv`는 gitignore). 아래에서 받아 같은 경로에 두면 `analysis/scripts/`의 학습 스크립트를 재현할 수 있습니다.

| 도메인 | 파일명 | 타겟 컬럼 | 출처 |
|---|---|---|---|
| Titanic 생존 예측 | `titanic.csv` | `2urvived` | [Kaggle](https://www.kaggle.com/datasets/yasserh/titanic-dataset) |
| HR 이직 예측 | `HR-Employee-Attrition.csv` | `Attrition` | [Kaggle](https://www.kaggle.com/datasets/pavansubhasht/ibm-hr-analytics-attrition-dataset) |
| Telco 고객 이탈 예측 | `Telco-Customer-Churn.csv` | `Churn` | [Kaggle](https://www.kaggle.com/datasets/blastchar/telco-customer-churn) |

업로드 기능 자체는 임의의 이진분류 CSV(정답 컬럼이 정확히 두 값을 갖는 데이터)를 바로 분석하므로, 위 데이터가 없어도 다른 CSV로 웹앱을 테스트할 수 있습니다.
