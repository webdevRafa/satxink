import { useLayoutEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import { createViewportMotion } from "./viewportMotion";

export function MobileNavigation({ items, onNavigate }: {
  items: string[][];
  onNavigate: () => void;
}) {
  const menu = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const root = menu.current;
    if (!root) return;
    return createViewportMotion(root, Array.from(root.querySelectorAll("a")).map(element => ({
      element, group: root, style: "slide",
    })), { mobileMenu: true });
  }, []);

  return (
    <nav ref={menu} id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
      {items.map(([label, id]) => (
        <a key={id} href={`/#${id}`} onClick={onNavigate}>
          {label}<ArrowUpRight size={16} aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
