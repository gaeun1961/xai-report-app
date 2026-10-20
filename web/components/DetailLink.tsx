import styles from "./report.module.css";

// "자세히 보기 →" on a card that has a fuller version in the 특성 자세히 보기
// tab. data-no-capture keeps it out of "이미지로 저장" (SaveImageButton skips
// anything carrying it).
export default function DetailLink({ feature, onOpen }: { feature: string; onOpen: (feature: string) => void }) {
  return (
    <button
      type="button"
      className={styles.detailLink}
      data-no-capture
      aria-label={`${feature} 특성 자세히 보기`}
      onClick={() => onOpen(feature)}
    >
      자세히 보기 →
    </button>
  );
}
