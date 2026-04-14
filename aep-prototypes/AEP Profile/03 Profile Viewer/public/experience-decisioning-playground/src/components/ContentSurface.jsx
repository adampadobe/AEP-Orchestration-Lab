/**
 * Shared layout shell — uses global .decisioning-content-surface (decisioning-content-surface.css).
 * No local spacing/border overrides; framing is identical to Decisioning visualiser.
 */
export function ContentSurface({ children }) {
  return <div className="decisioning-content-surface">{children}</div>;
}
