import type { GeneratedCard } from "../domain/model";
export const escapeHtml = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function lines(text: string, width: number, max: number) {
  const words = text.split(/\s+/);
  const result: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).length > width && line) {
      result.push(line);
      line = w;
    } else line += (line ? " " : "") + w;
  }
  if (line) result.push(line);
  return result.slice(0, max);
}
export function illustration(kind = "none") {
  if (kind === "none") return "";
  if (kind === "protein")
    return Array.from(
      { length: 13 },
      (_, i) =>
        `<circle cx="${700 + Math.sin(i * 0.65) * 95}" cy="${100 + i * 23}" r="22" fill="${i % 2 ? "#bee98d" : "#7da98e"}" stroke="#183326" stroke-width="3"/>`,
    ).join("");
  return Array.from({ length: 16 }, (_, i) => {
    const x = 720 + Math.sin(i * 0.55) * 87;
    const y = 78 + i * 23;
    const other = 720 - Math.sin(i * 0.55) * 87;
    return `<path d="M${x} ${y}L${other} ${y}" stroke="#789b73" stroke-width="${kind === "rna" ? 2 : 4}" opacity=".6"/><circle cx="${x}" cy="${y}" r="9" fill="#cbef97"/>${kind !== "rna" ? `<circle cx="${other}" cy="${y}" r="9" fill="${kind === "mutation" && i === 7 ? "#efb785" : "#76b7a0"}"/>` : ""}`;
  }).join("");
}
export function cardSvg(card: GeneratedCard, index = 0): string {
  const bg =
    card.background === "sand"
      ? "#e2e3cd"
      : card.background === "ink"
        ? "#182129"
        : "#142b21";
  const fg = card.background === "sand" ? "#19271c" : "#eef2df";
  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    width: number,
    max: number,
    serif = false,
    opacity = 1,
  ) =>
    lines(value, width, max)
      .map(
        (line, i) =>
          `<text x="${x}" y="${y + i * size * 1.18}" fill="${fg}" opacity="${opacity}" font-family="${serif ? "Georgia,serif" : "Arial,sans-serif"}" font-size="${size}">${escapeHtml(line)}</text>`,
      )
      .join("");
  const art = card.image
    ? `<image href="${escapeHtml(card.image)}" x="605" y="100" width="295" height="330" preserveAspectRatio="xMidYMid meet"/>`
    : card.illustration === "none"
      ? ""
      : illustration(card.illustration);
  let content = "";
  switch (card.layout) {
    case "title":
      content =
        text(card.heading, 56, 165, 52, 20, 3, true) +
        text(card.body, 58, 365, 18, 43, 3, false, 0.75) +
        art;
      break;
    case "comparison": {
      const halves = card.body.split("|");
      content =
        text(card.heading, 58, 135, 38, 39, 2, true) +
        `<path d="M480 220V430" stroke="${fg}" opacity=".25"/>` +
        text(halves[0] || "", 58, 265, 24, 27, 5) +
        text(
          halves.slice(1).join(" | ") || "Compare with the next scene.",
          520,
          265,
          24,
          27,
          5,
        );
      break;
    }
    case "quote":
      content =
        `<text x="52" y="160" fill="${fg}" opacity=".2" font-family="Georgia" font-size="135">&#8220;</text>` +
        text(card.body || card.heading, 108, 195, 34, 40, 5, true) +
        text(card.body ? card.heading : "", 110, 430, 16, 70, 1, false, 0.65);
      break;
    case "recap": {
      const points = card.body.split(/\n|\|/).filter(Boolean).slice(0, 4);
      content =
        text(card.heading, 58, 140, 40, 38, 2, true) +
        points
          .map(
            (point, i) =>
              `<circle cx="76" cy="${230 + i * 60}" r="18" fill="#71906c"/><text x="76" y="${236 + i * 60}" text-anchor="middle" fill="#fff" font-family="Arial" font-size="16">${i + 1}</text>` +
              text(point, 115, 236 + i * 60, 19, 66, 2),
          )
          .join("");
      break;
    }
    case "image-focus":
      content =
        `<rect x="58" y="100" width="495" height="335" rx="12" fill="${fg}" opacity=".06"/>` +
        (card.image
          ? `<image href="${escapeHtml(card.image)}" x="68" y="110" width="475" height="315" preserveAspectRatio="xMidYMid meet"/>`
          : `<g transform="translate(-240,-3)">${illustration(card.illustration)}</g>`) +
        text(card.heading, 600, 160, 34, 17, 3, true) +
        text(card.body, 602, 300, 17, 28, 5, false, 0.75);
      break;
    case "quiz-intro":
      content =
        `<circle cx="755" cy="267" r="126" fill="${fg}" opacity=".06"/><text x="755" y="318" text-anchor="middle" fill="${fg}" font-size="150" font-family="Georgia">?</text>` +
        text(card.heading, 58, 180, 44, 23, 3, true) +
        text(card.body, 60, 365, 18, 44, 3, false, 0.75);
      break;
    default: {
      const headingLines = lines(card.heading, 23, 3).length;
      content =
        text(card.heading, 56, 145, 44, 23, 3, true) +
        text(
          card.body,
          58,
          172 + headingLines * 51,
          17,
          47,
          Math.min(5, Math.floor((440 - 172 - headingLines * 51) / 20)),
          false,
          0.75,
        ) +
        art;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${bg}"/><defs><pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="${fg}" stroke-opacity=".045"/></pattern></defs><rect width="960" height="540" fill="url(#grid)"/><text x="58" y="65" fill="${fg}" opacity=".65" font-family="Arial,sans-serif" font-size="12" letter-spacing="3">TIMETRAIL / ${String(index + 1).padStart(2, "0")} / ${escapeHtml(card.layout.toUpperCase())}</text>${content}<path d="M58 471H900" stroke="${fg}" opacity=".17"/><text x="58" y="502" fill="${fg}" opacity=".6" font-family="Arial,sans-serif" font-size="11" letter-spacing="2">${escapeHtml((card.source || "AN INTERACTIVE EXPLAINER").slice(0, 75))}</text></svg>`;
}
