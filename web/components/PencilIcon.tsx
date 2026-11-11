// the "edit" glyph on rename buttons — an SVG, not the ✎ character, so it
// renders the same in every font and inherits the button's colour
export default function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.5 12.3 2.5 13l.7-3 8.1-7.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
