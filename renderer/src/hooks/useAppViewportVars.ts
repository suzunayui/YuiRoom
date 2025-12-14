import { useEffect } from "react";

export function useAppViewportVars() {
  useEffect(() => {
    let raf = 0;
    function apply() {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const vv = (window as any).visualViewport as VisualViewport | undefined;
        const h = Math.round((vv?.height ?? window.innerHeight) || window.innerHeight);
        const top = Math.round(vv?.offsetTop ?? 0);
        const left = Math.round(vv?.offsetLeft ?? 0);
        const occludedBottom = Math.max(
          0,
          Math.round(window.innerHeight - (vv?.height ?? window.innerHeight) - (vv?.offsetTop ?? 0))
        );
        document.documentElement.style.setProperty("--app-height", `${h}px`);
        document.documentElement.style.setProperty("--app-offset-top", `${top}px`);
        document.documentElement.style.setProperty("--app-offset-left", `${left}px`);
        document.documentElement.style.setProperty("--app-occluded-bottom", `${occludedBottom}px`);
      });
    }

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    const vv = (window as any).visualViewport as VisualViewport | undefined;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
    };
  }, []);
}

