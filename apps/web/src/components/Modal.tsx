"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title}
      className="relative m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm"
      onClick={(event) => { if (event.target === event.currentTarget) {
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      } }}>
      <button type="button" onClick={onClose} aria-label="Close dialog" className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full bg-raised text-lg text-muted hover:text-fg">×</button>
      {children}
    </dialog>
  );
}
