// Short Korean descriptions for each preset domain's columns, shown as a
// hover tooltip on feature names. Uploaded CSVs have no entry here — callers
// should hide the tooltip affordance when columnDesc() returns undefined.

export const COLUMN_GLOSSARY: Record<string, Record<string, string>> = {
  titanic: {
    Sex: "성별 (0=남성, 1=여성)",
    Pclass: "객실 등급 (1=1등석, 2=2등석, 3=3등석)",
    Age: "나이",
    Fare: "지불한 운임",
    Embarked: "탑승 항구 (0=Cherbourg, 1=Queenstown, 2=Southampton)",
    sibsp: "함께 탑승한 형제자매·배우자 수",
    Parch: "함께 탑승한 부모·자녀 수",
  },
  hr_attrition: {
    Age: "나이",
    OverTime: "야근 여부 (Yes/No)",
    MonthlyIncome: "월 소득",
    DailyRate: "일급",
    TotalWorkingYears: "총 경력 연수",
    YearsAtCompany: "현재 회사 근속 연수",
    YearsWithCurrManager: "현재 상사와 함께한 연수",
    NumCompaniesWorked: "이전에 근무한 회사 수",
    DistanceFromHome: "집–회사 거리",
    StockOptionLevel: "스톡옵션 등급 (0~3)",
    JobLevel: "직급 레벨 (1~5)",
    JobRole: "직무",
    MaritalStatus: "결혼 상태",
    JobInvolvement: "업무 몰입도 (1~4)",
    EnvironmentSatisfaction: "근무 환경 만족도 (1~4)",
    RelationshipSatisfaction: "대인관계 만족도 (1~4)",
  },
  telco_churn: {
    Contract: "계약 형태 (월별 / 1년 / 2년)",
    tenure: "가입 유지 개월 수",
    MonthlyCharges: "월 요금",
    TotalCharges: "누적 청구 총액",
    InternetService: "인터넷 서비스 종류 (DSL / 광랜 / 없음)",
    OnlineSecurity: "온라인 보안 서비스 가입 여부",
    OnlineBackup: "온라인 백업 서비스 가입 여부",
    DeviceProtection: "단말기 보호 서비스 가입 여부",
    TechSupport: "기술 지원 서비스 가입 여부",
    StreamingTV: "스트리밍 TV 가입 여부",
    StreamingMovies: "스트리밍 영화 가입 여부",
    MultipleLines: "복수 회선 사용 여부",
    PaperlessBilling: "종이 없는 청구서 사용 여부",
    PaymentMethod: "결제 수단",
    gender: "성별",
  },
};

export function columnDesc(domain: string, column: string): string | undefined {
  return COLUMN_GLOSSARY[domain]?.[column];
}
