"use client";

import { useRouter } from "next/navigation";
import type { Country } from "@/lib/data";

export default function CountrySelect({ countries, value }: { countries: Country[]; value: string }) {
  const router = useRouter();
  return (
    <label className="select">
      <span>Country</span>
      <select value={value} onChange={(e) => router.push(`/?country=${e.target.value}`, { scroll: false })}>
        {countries.map((c) => (
          <option key={c.country_iso3} value={c.country_iso3}>
            {c.country_name}
          </option>
        ))}
      </select>
    </label>
  );
}
