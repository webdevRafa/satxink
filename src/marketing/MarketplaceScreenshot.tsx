import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const src = "/media/flash-marketplace-desktop.webp";
const alt = "Graven House demo studio’s flash collection, with artist attribution, prices, and one-of-one designs";

export function MarketplaceScreenshot() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const modal = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    modal.showModal(); // Native focus containment and inert background.
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="marketplace-image-trigger"
      aria-label="Expand flash collection screenshot" aria-haspopup="dialog"
      onClick={() => setOpen(true)}>
      <img src={src} alt={alt} width="1825" height="906" loading="lazy" decoding="async" />
    </button>
    {open && createPortal(
      <dialog ref={dialog} className="marketplace-lightbox" aria-label="Expanded flash collection screenshot"
        onCancel={(event) => { event.preventDefault(); setOpen(false); }}
        onClose={() => setOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <button type="button" className="marketplace-lightbox-close" autoFocus
          aria-label="Close expanded screenshot" onClick={() => setOpen(false)}><X size={24} /></button>
        <img src={src} alt={alt} width="1825" height="906" />
      </dialog>, document.body)}
  </>;
}
