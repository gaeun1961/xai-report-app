import styles from "./report.module.css";

type Props = {
  ids: string[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function CaseSelector({ ids, selectedId, onSelect }: Props) {
  return (
    <div className={styles.selector}>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`${styles.selectorBtn} ${
            id === selectedId ? styles.selectorBtnActive : ""
          }`}
        >
          #{id}
        </button>
      ))}
    </div>
  );
}
