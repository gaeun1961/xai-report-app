# xai-report-app

모델 예측 결과를 SHAP 기반으로 설명하는 XAI(설명가능한 AI) 리포트 생성 웹앱입니다. Titanic 생존 예측, HR 이직(Attrition) 예측, Telco 고객 이탈(Churn) 예측 3개 도메인을 다룹니다.

## 구조

- `analysis/` — 로컬 전용. 모델 학습 및 SHAP 특성중요도 계산, 결과를 JSON으로 저장 (Git에는 원본 데이터 미포함)
- `web/` — Next.js 프론트엔드. `analysis/`에서 생성된 JSON을 읽어 자연어 리포트로 렌더링 (Vercel 배포)

## 데이터 받는 법 (Kaggle)

TODO: 각 도메인별 Kaggle 데이터셋 링크와 다운로드 절차 (다음 세션에 채울 예정)

1. Titanic (`titanic.csv`, 타겟: `2urvived`)
2. HR 이직 예측 (`HR-Employee-Attrition.csv`, 타겟: `Attrition`)
3. Telco 고객 이탈 예측 (`Telco-Customer-Churn.csv`, 타겟: `Churn`)
