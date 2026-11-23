"use client";
// A select that is exactly as wide as its current label, so it reads as a word in a sentence.
import { useLayoutEffect, useRef, useState } from "react";

type Props = { value: string | number; options: { value: string | number; label: string }[]; onChange: (v: string) => void; label: string };

export function AutoSelect({ value, options, onChange, label }: Props) {
  const measure = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState<number | undefined>(undefined);
  const current = options.find((o) => String(o.value) === String(value))?.label ?? "";
  useLayoutEffect(() => {
    if (measure.current) setW(measure.current.getBoundingClientRect().width);
  }, [current]);
  return (
    <span className="picker">
      <span ref={measure} aria-hidden="true" style={{ position: "absolute", visibility: "hidden", whiteSpace: "pre" }}>
        {current}
      </span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: w ? `calc(${w}px + 1.25em)` : undefined }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
