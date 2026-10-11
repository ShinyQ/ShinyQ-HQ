"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";

export interface ModalProps {
  /** id of the element that names the dialog. */
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  /** Panel width on tablets and desktops; phones always get a full-screen sheet. */
  width?: "sm" | "md" | "lg";
  testId?: string;
}

const WIDTH = { sm: "sm:h-auto sm:max-w-[480px]", md: "sm:h-auto sm:max-w-[720px]", lg: "sm:h-[min(92dvh,1100px)] sm:max-w-[1040px]" };

/**
 * Shared modal dialog for the CV viewer, paper and certification previews: portals into document.body, moves focus
 * to the first `[data-autofocus]` element (else the panel), traps Tab, closes on Esc and backdrop
 * click, locks page scroll and stays above the 3D HUD and the room drawer. Esc is captured on the
 * window so the drawer, hologram and rover ignore it; other world keys already pause while an
 * `aria-modal` dialog exists. The caller restores focus to the opener.
 */
export function Modal({ labelledBy, onClose, children, width = "md", testId }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const target = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
    target?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    // Portal events bubble through the React tree; keep them away from any host component.
    event.stopPropagation();
    if (event.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6" data-testid={testId ? `${testId}-root` : undefined}>
      <div aria-hidden="true" className="absolute inset-0 bg-void/80 backdrop-blur-sm" onClick={() => close.current()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-testid={testId}
        onKeyDown={onKeyDown}
        className={`glass glass-solid relative flex h-full w-full flex-col overflow-hidden rounded-none border-0 shadow-[0_0_64px_-16px_rgb(0_0_0/0.9)] outline-none sm:max-h-[min(92dvh,1100px)] sm:rounded-2xl sm:border ${WIDTH[width]}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
