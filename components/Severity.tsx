// Status is never colour alone: an icon and a word carry it too.
export function Severity({ level }: { level: "high" | "medium" }) {
  return (
    <span className={`sev ${level}`}>
      {level === "high" ? (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 1 L13 12 H1 Z" fill="currentColor" />
          <rect x="6.25" y="5" width="1.5" height="3.8" fill="var(--bg)" />
          <rect x="6.25" y="9.6" width="1.5" height="1.5" fill="var(--bg)" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6" fill="var(--medium-fill)" />
          <rect x="6.25" y="3.4" width="1.5" height="4.6" fill="var(--bg)" />
          <rect x="6.25" y="9" width="1.5" height="1.5" fill="var(--bg)" />
        </svg>
      )}
      {level === "high" ? "High" : "Medium"}
    </span>
  );
}
