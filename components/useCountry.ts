"use client";
import { useCallback, useEffect, useState } from "react";
import type { Country } from "@/lib/data";

/** Selected country, shared across pages through ?c= in the URL and remembered locally. */
export function useCountry(countries: Country[], fallback = "ESP") {
  const valid = useCallback((c: string | null) => !!c && countries.some((x) => x.country_iso3 === c), [countries]);
  const [iso3, set] = useState(fallback);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("c");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("country");
    } catch {}
    const pick = valid(fromUrl) ? fromUrl! : valid(saved) ? saved! : fallback;
    set(pick);
  }, [valid, fallback]);
  const setIso3 = useCallback((c: string) => {
    set(c);
    const url = new URL(window.location.href);
    url.searchParams.set("c", c);
    window.history.replaceState(null, "", url);
    try {
      localStorage.setItem("country", c);
    } catch {}
  }, []);
  return [iso3, setIso3] as const;
}
