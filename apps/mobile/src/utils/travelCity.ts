/** Pick a single city/area name for POI search from messy destination text. */
export function resolveSearchCity(destination?: string | null, hint?: string | null) {
  const candidates: string[] = [];

  const push = (value?: string | null) => {
    const text = value?.trim();
    if (!text) return;
    text
      .split(/[/、,，;；|>→\-–—]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => candidates.push(part));
  };

  push(hint);
  push(destination);

  if (!candidates.length) return "目的地";

  const scored = candidates.map((name) => {
    let score = 0;
    if (/(镇|乡|村|景区|古城|湖|岛)/.test(name)) score += 3;
    if (/(区|县|市)/.test(name)) score += 1;
    if (name.length >= 2 && name.length <= 8) score += 1;
    if (/(省|自治区)/.test(name)) score -= 2;
    return { name, score };
  });

  scored.sort((a, b) => b.score - a.score || b.name.length - a.name.length);
  return scored[0]?.name ?? candidates[candidates.length - 1];
}
