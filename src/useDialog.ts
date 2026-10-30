import { useEffect, useRef } from "react";
export function useDialog(key: string, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!key) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".content,.desktop-sidebar,.bottom-nav",
      ),
    );
    background.forEach((e) => {
      e.inert = true;
    });
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ).filter((e) => e.getClientRects().length > 0);
    if (!dialog.contains(document.activeElement)) (dialog.querySelector<HTMLElement>("[data-autofocus]")||controls()[0])?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key === "Tab") {
        const elements = controls();
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      background.forEach((e) => {
        e.inert = false;
      });
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [key]);
}
