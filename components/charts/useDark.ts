"use client";
import { useEffect, useState } from "react";

export function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(q.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return dark;
}
