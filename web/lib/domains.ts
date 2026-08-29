export type Domain = {
  slug: string;
  label: string; // sidebar nav
  title: string; // report heading / card title
  description: string; // landing card
};

export const DOMAINS: Domain[] = [
  {
    slug: "titanic",
    label: "Titanic",
    title: "Titanic 생존 예측",
    description:
      "승객 정보로 생존 여부를 예측하는 모델의 특성 중요도와 케이스별 근거",
  },
  {
    slug: "hr_attrition",
    label: "HR 이직",
    title: "HR 이직 예측",
    description: "직원 정보로 이직(퇴사) 여부를 예측하는 모델의 예측 근거",
  },
  {
    slug: "telco_churn",
    label: "Telco 이탈",
    title: "Telco 고객 이탈 예측",
    description: "통신사 고객 정보로 이탈 여부를 예측하는 모델의 예측 근거",
  },
];

export function findDomain(slug: string): Domain | undefined {
  return DOMAINS.find((d) => d.slug === slug);
}
