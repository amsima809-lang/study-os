import { useLayoutEffect, useRef, type RefObject } from "react";
import "./lectureNoteTray.css";

/** Give the actual reader the upper half of the visible viewport while a writing tool occupies the lower half. */
export function useLectureSplitPane(
  reader: HTMLElement | null | undefined,
  panelRef: RefObject<HTMLElement | null>,
  getReference: (reader: HTMLElement) => DOMRectReadOnly | null | undefined,
  align: "start" | "center",
  restoreFocus?: (reader: HTMLElement) => HTMLElement | null,
) {
  const callbacks = useRef({ getReference, restoreFocus });
  callbacks.current = { getReference, restoreFocus };
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!reader || !panel) return;
    const page = document.documentElement;
    const start = window.scrollY, opener = document.activeElement;
    const inert: HTMLElement[] = [];
    // The reader and the portalled editor stay interactive. Keep covered shell buttons out of tab order.
    for (let node: HTMLElement | null = reader; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (sibling instanceof HTMLElement && sibling !== node && !sibling.contains(panel) && !sibling.inert) {
          sibling.inert = true;
          inert.push(sibling);
        }
      }
    }
    page.classList.add("lecture-writing");
    reader.classList.add("lecture-tray-reader");
    const viewport = window.visualViewport;
    const resize = () => {
      page.style.setProperty("--lecture-vh", (viewport?.height ?? window.innerHeight) + "px");
      page.style.setProperty("--lecture-vw", (viewport?.width ?? window.innerWidth) + "px");
      page.style.setProperty("--lecture-vtop", (viewport?.offsetTop ?? 0) + "px");
      page.style.setProperty("--lecture-vleft", (viewport?.offsetLeft ?? 0) + "px");
    };
    resize();
    viewport?.addEventListener("scroll", resize);
    viewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    const showReference = () => {
      const rect = callbacks.current.getReference(reader);
      if (!rect) return;
      const padding = align === "center" ? Math.max(12, (reader.clientHeight - rect.height) / 2) : 12;
      reader.scrollTop += rect.top - reader.getBoundingClientRect().top - padding;
      observer.disconnect();
    };
    const observer = new MutationObserver(showReference);
    observer.observe(reader, { childList: true, subtree: true });
    showReference();
    panel.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("scroll", resize);
      viewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      for (const el of inert) el.inert = false;
      reader.inert = false;
      reader.classList.remove("lecture-tray-reader");
      reader.scrollTop = 0;
      page.classList.remove("lecture-writing");
      for (const variable of ["--lecture-vh", "--lecture-vw", "--lecture-vtop", "--lecture-vleft"]) {
        page.style.removeProperty(variable);
      }
      window.scrollTo({ top: start, behavior: "instant" });
      const trigger = opener instanceof HTMLElement && opener !== document.body && opener.isConnected
        ? opener : callbacks.current.restoreFocus?.(reader);
      trigger?.focus({ preventScroll: true });
    };
  }, [reader, panelRef, align]);
}
