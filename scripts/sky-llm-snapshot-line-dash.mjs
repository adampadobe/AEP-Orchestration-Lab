/**
 * Fix frozen Recharts responsive shell (0×0 inner div collapses SVG to clientWidth 0).
 */
export function repairRechartsResponsiveHtml(html) {
  html = html.replace(
    /<div style="width: 0px; height: 0px; overflow: visible;">/g,
    '<div class="sky-llm-recharts-measure" style="width: 100%; height: 100%; min-height: 300px; overflow: visible;">',
  );
  html = html.replace(
    /(<svg[^>]*class="recharts-surface"[^>]*) style="width: 100%; height: 100%; display: block;"/g,
    '$1 style="display: block; width: 100%; height: auto; max-width: 100%;"',
  );
  return html;
}

/**
 * Strip Recharts line animation dash attributes from frozen snapshot HTML.
 */
export function stripLineDash(html) {
  html = html.replace(
    /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dasharray="[^"]*"/g,
    '$1',
  );
  html = html.replace(
    /(<path[^>]*)\sstroke-dasharray="[^"]*"([^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*>)/g,
    '$1$2',
  );
  html = html.replace(
    /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dashoffset="[^"]*"/g,
    '$1',
  );
  html = html.replace(
    /(<path[^>]*)\sstroke-dashoffset="[^"]*"([^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*>)/g,
    '$1$2',
  );
  return html;
}
