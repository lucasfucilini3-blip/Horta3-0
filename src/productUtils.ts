/**
 * Utility functions for product normalization, canonical naming, and synonym resolution.
 */

// Helper to remove accents, lowercase, and keep only alphanumeric chars
export function stripAccentsAndSpecial(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Returns a clean, capitalized canonical product name.
 * Automatically unifies:
 * - "pct alface roxa", "alface roxa", "pacote alface roxa" -> "Alface Roxa"
 * - "pct alface crespa", "alface crespa" -> "Alface Crespa"
 * - "pct alface americana", "alface americana" -> "Alface Americana"
 * - "salsa", "salsinha", "molho de salsa" -> "Salsinha"
 * - and any generic "pct [produto]", "pacote [produto]", "pct. [produto]"
 */
export function getCanonicalProductName(rawName?: string | null): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // Strip prefixes like "pct ", "pct. ", "pacote ", "pacotes ", "pcts ", "pct de ", "pacote de ", "pc ", "molho de "
  name = name
    .replace(/^(pct\.?|pacotes?|pcts?|pc\.?)\s+(de\s+)?/i, '')
    .replace(/^molho\s+(de\s+)?/i, '')
    .replace(/^unidade\s+(de\s+)?/i, '')
    .trim();

  // Strip trailing unit tags like " (pct)", " - pct", " (un)", " (kg)", " (mç)"
  name = name
    .replace(/\s*\((pct|un|kg|mc|mç|pacote|pe|pé|pés)\)$/i, '')
    .replace(/\s*-\s*(pct|un|kg|mc|mç|pacote|pe|pé|pés)$/i, '')
    .trim();

  // Remove leading non-alphanumeric punctuation
  name = name.replace(/^[-–—:.]\s*/, '').trim();

  const stripped = stripAccentsAndSpecial(name);

  // Exact & synonym mappings
  if (stripped === 'salsa' || stripped === 'salsinha') {
    return 'Salsinha';
  }
  if (stripped === 'alfaceroxa') {
    return 'Alface Roxa';
  }
  if (stripped === 'alfacecrespa') {
    return 'Alface Crespa';
  }
  if (stripped === 'alfaceamericana') {
    return 'Alface Americana';
  }
  if (stripped === 'alfacelisa') {
    return 'Alface Lisa';
  }
  if (stripped === 'alface' || stripped === 'alfaces') {
    return 'Alface';
  }
  if (stripped === 'cebolinha') {
    return 'Cebolinha';
  }
  if (stripped === 'cheiroverde') {
    return 'Cheiro Verde';
  }
  if (stripped === 'rucula') {
    return 'Rúcula';
  }
  if (stripped === 'couve' || stripped === 'couvemanteiga') {
    return 'Couve Manteiga';
  }
  if (stripped === 'espinafre') {
    return 'Espinafre';
  }
  if (stripped === 'manjericao') {
    return 'Manjericão';
  }
  if (stripped === 'agriao') {
    return 'Agrião';
  }
  if (stripped === 'alecrim') {
    return 'Alecrim';
  }
  if (stripped === 'hortela') {
    return 'Hortelã';
  }
  if (stripped === 'coentro') {
    return 'Coentro';
  }
  if (stripped === 'tomatecereja') {
    return 'Tomate Cereja';
  }
  if (stripped === 'tomate') {
    return 'Tomate';
  }

  if (name.length > 0) {
    // Standardize title case
    return name
      .split(' ')
      .filter(w => w.length > 0)
      .map(w => {
        const lower = w.toLowerCase();
        if (['de', 'da', 'do', 'das', 'dos', 'com', 'e'].includes(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join(' ');
  }

  return rawName.trim();
}

/**
 * Returns a standardized normalized key for grouping and searching products.
 * Guarantees that "pct alface roxa" and "alface roxa" produce the exact same key: "alfaceroxa".
 * "salsa" and "salsinha" produce the exact same key: "salsinha".
 */
export function normalizeProductName(name?: string | null): string {
  if (!name) return '';
  const canonical = getCanonicalProductName(name);
  return stripAccentsAndSpecial(canonical);
}
