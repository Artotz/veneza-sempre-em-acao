import { useEffect } from "react";

let lockCount = 0;
let originalBodyOverflow: string | null = null;
let originalHtmlOverflow: string | null = null;
let originalPaddingRight: string | null = null;

const lockBodyScroll = () => {
  if (typeof document === "undefined") return;
  const { body, documentElement } = document;
  if (!body || !documentElement) return;

  if (lockCount === 0) {
    originalBodyOverflow = body.style.overflow;
    originalHtmlOverflow = documentElement.style.overflow;
    originalPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
  }

  lockCount += 1;
};

const unlockBodyScroll = () => {
  if (typeof document === "undefined") return;
  const { body, documentElement } = document;
  if (!body || !documentElement) return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    body.style.overflow = originalBodyOverflow ?? "";
    documentElement.style.overflow = originalHtmlOverflow ?? "";
    body.style.paddingRight = originalPaddingRight ?? "";
    originalBodyOverflow = null;
    originalHtmlOverflow = null;
    originalPaddingRight = null;
  }
};

export const useLockBodyScroll = (active: boolean) => {
  useEffect(() => {
    if (!active) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [active]);
};
