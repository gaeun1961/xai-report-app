// One placement rule for every tooltip bubble (InfoTip "?", glossary terms,
// chart point tooltips): right of the anchor by default; if it doesn't fit
// in the viewport there, left; then above; then below. Always clamped so the
// bubble stays on screen. Pure function (no DOM) so it can be unit-tested.

export type Side = "right" | "left" | "above" | "below";
type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export const GAP = 10; // anchor -> bubble
export const MARGIN = 8; // bubble -> viewport edge
const ARROW_INSET = 12; // keep the arrow off the rounded corners

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

// Viewport coordinates of the bubble's top-left corner, plus where along
// the facing edge the arrow should sit (px from the bubble's own left/top).
export function placeTooltip(a: Rect, w: number, h: number, vw: number, vh: number) {
  const cx = a.left + a.width / 2;
  const cy = a.top + a.height / 2;
  const side = (s: "right" | "left", left: number) => {
    const top = clamp(cy - h / 2, MARGIN, vh - h - MARGIN);
    return { side: s as Side, left, top, arrow: clamp(cy - top, ARROW_INSET, h - ARROW_INSET) };
  };
  if (a.right + GAP + w <= vw - MARGIN) return side("right", a.right + GAP);
  if (a.left - GAP - w >= MARGIN) return side("left", a.left - GAP - w);

  const left = clamp(cx - w / 2, MARGIN, vw - w - MARGIN);
  const arrow = clamp(cx - left, ARROW_INSET, w - ARROW_INSET);
  const roomAbove = a.top - GAP - MARGIN;
  const roomBelow = vh - a.bottom - GAP - MARGIN;
  // above if it fits; below if that fits; otherwise whichever has more room
  const s: Side = h <= roomAbove || (h > roomBelow && roomAbove >= roomBelow) ? "above" : "below";
  return { side: s, left, top: s === "above" ? a.top - GAP - h : a.bottom + GAP, arrow };
}

// Positions `bubble` (absolutely positioned inside `host`, which must be a
// positioned element) per placeTooltip. A CSS-hidden bubble (display:none
// until :hover) is measured by briefly forcing `display` off-eye, reset
// before the browser paints. Writes left/top, data-side and --arrow.
export function positionBubble(host: HTMLElement, bubble: HTMLElement, display = "block") {
  const hidden = getComputedStyle(bubble).display === "none";
  if (hidden) {
    bubble.style.visibility = "hidden";
    bubble.style.display = display;
  }
  const w = bubble.offsetWidth;
  const h = bubble.offsetHeight;
  if (hidden) {
    bubble.style.display = "";
    bubble.style.visibility = "";
  }
  const r = host.getBoundingClientRect();
  const p = placeTooltip(r, w, h, document.documentElement.clientWidth, window.innerHeight);
  bubble.style.left = `${p.left - r.left}px`;
  bubble.style.top = `${p.top - r.top}px`;
  bubble.dataset.side = p.side;
  bubble.style.setProperty("--arrow", `${p.arrow}px`);
}

// Place a hover/focus bubble now, and keep re-placing it while the page (or
// any scroll container) scrolls and it's still open - a bubble opened by
// keyboard focus or a tap stays open during a scroll, and its side was only
// picked when it opened, so near the top edge it slid off screen. The
// listener removes itself on the first scroll after the bubble has closed.
const tracked = new WeakSet<HTMLElement>();

export function trackBubble(host: HTMLElement, bubble: HTMLElement, display = "block") {
  positionBubble(host, bubble, display);
  if (tracked.has(host)) return;
  tracked.add(host);
  const onScroll = () => {
    if (host.isConnected && host.matches(":hover, :focus-within")) {
      positionBubble(host, bubble, display);
      return;
    }
    window.removeEventListener("scroll", onScroll, true);
    tracked.delete(host);
  };
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
}

// onMouseEnter/onFocus handler for a host whose bubble is its direct
// role="tooltip" child (glossary terms)
export function placeChildBubble(e: { currentTarget: HTMLElement }) {
  const b = e.currentTarget.querySelector<HTMLElement>(':scope > [role="tooltip"]');
  if (b) trackBubble(e.currentTarget, b);
}

// ref callback for a bubble that's already showing when it mounts (chart
// point tooltips, the glossary editor), anchored to its parent element
export function placeInParent(el: HTMLElement | null) {
  if (el?.parentElement) positionBubble(el.parentElement, el);
}
