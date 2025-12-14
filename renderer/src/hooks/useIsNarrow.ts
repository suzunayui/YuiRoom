import { useEffect, useState } from "react";

export function useIsNarrow(maxWidthPx = 900): boolean {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    function update() {
      try {
        setIsNarrow(window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches);
      } catch {
        setIsNarrow(false);
      }
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [maxWidthPx]);

  return isNarrow;
}

