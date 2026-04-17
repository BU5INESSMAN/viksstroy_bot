import { createPortal } from 'react-dom';

/**
 * Wraps children in a React portal targeted at `document.body`.
 *
 * Why: modals rendered inside the page tree (under `<motion.main>` or
 * similar) inherit stacking/containing-block behavior from ancestors.
 * When an ancestor has `transform`, `filter`, `perspective`, `will-change`
 * or `contain`, any descendant with `position: fixed` is positioned
 * relative to that ancestor — which causes the "backdrop doesn't cover
 * the whole screen" bug reported on modals throughout the app.
 *
 * Portaling to `document.body` escapes all ancestors, so `fixed inset-0`
 * truly covers the viewport.
 *
 * Usage: wrap the modal root element.
 *
 *   <ModalPortal>
 *     <div className="fixed inset-0 z-[100] bg-black/60 ...">…</div>
 *   </ModalPortal>
 */
export default function ModalPortal({ children }) {
    if (typeof document === 'undefined') return null;
    return createPortal(children, document.body);
}
