"use client";

import type { ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";

export function Modal({ title, open, onClose, children, width = "560px" }: { title: string; open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close"><CloseIcon /></button></div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
