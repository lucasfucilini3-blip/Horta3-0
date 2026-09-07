import { Sale, ThirdPartyPurchase, ThirdPartyStockItem } from './types';

/**
 * Utility functions for product normalization, canonical naming, and synonym/abbreviation resolution.
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
 * Strips all common packaging prefixes, unit annotations, and origin tags
 * such as "(Revenda)", "(Terceiro)", "(Horta Própria)", "(Ceasa)", etc.
 */
export function cleanRawProductName(rawName?: string | null): string {
  if (!rawName) return '';
  let name = rawName.trim();

  let prev = '';
  // Repeat stripping until stable (handles chained tags like "Tomate (kg) (Revenda)")
  while (prev !== name) {
    prev = name;
    name = name
      // Strip leading non-alphanumeric punctuation
      .replace(/^[-–—:.]\s*/, '')
      // Strip common prefixes
      .replace(/^(pct\.?|pacotes?|pcts?|pc\.?)\s+(de\s+)?/i, '')
      .replace(/^(p[eé]s?)\s+(de\s+)?/i, '')
      .replace(/^molho\s+(de\s+)?/i, '')
      .replace(/^unidade\s+(de\s+)?/i, '')
      .replace(/^(cx\.?|caixas?)\s+(de\s+)?/i, '')
      // Strip parenthesized / bracketed / hyphenated units
      .replace(/\s*[\(\[\-]\s*(pct|un|kg|mc|mç|pacote|pacotes|pe|pé|pés|cx|caixa|caixas|g|gramas?|dz|dúzia|duzia)\s*[\)\]]?/gi, '')
      .replace(/\s*-\s*(pct|un|kg|mc|mç|pacote|pacotes|pe|pé|pés|cx|caixa|caixas|g|gramas?|dz|dúzia|duzia)$/gi, '')
      // Strip origin or resale tags (Revenda, Terceiro, Horta Própria, etc.)
      .replace(/\s*[\(\[\-]\s*(revenda|terceiros?|horta\s*pr[oó]pria|horta|produ[cç][aã]o\s*pr[oó]pria|ceasa)\s*[\)\]]?/gi, '')
      .replace(/\s+(revenda|terceiros?|horta\s*pr[oó]pria|produ[cç][aã]o\s*pr[oó]pria|ceasa)$/gi, '')
      .trim();
  }

  return name;
}

/**
 * Standardizes units of measurement into consistent canonical abbreviations
 */
export function normalizeUnit(unit?: string | null): string {
  if (!unit) return 'kg';
  const u = unit.toLowerCase().trim();
  if (u === 'quilo' || u === 'quilos' || u === 'kilo' || u === 'kilos' || u === 'kg') return 'kg';
  if (u === 'unidade' || u === 'unidades' || u === 'und' || u === 'un') return 'un';
  if (u === 'pacote' || u === 'pacotes' || u === 'pct' || u === 'pcts') return 'pct';
  if (u === 'molho' || u === 'molhos' || u === 'mc' || u === 'mç') return 'mç';
  if (u === 'caixa' || u === 'caixas' || u === 'cx') return 'cx';
  if (u === 'pe' || u === 'pé' || u === 'pes' || u === 'pés') return 'pé';
  if (u === 'duzia' || u === 'dúzia' || u === 'duzias' || u === 'dúzias' || u === 'dz') return 'dz';
  if (u === 'g' || u === 'grama' || u === 'gramas') return 'g';
  return u;
}

/**
 * Returns a clean, capitalized, full canonical product name.
 * Expands all abbreviations like:
 * - "alf. amer.", "alf amer", "alface amer", "alf americana", "americana" -> "Alface Americana"
 * - "alf. cresp.", "alf cresp", "alface cresp", "alf crespa", "crespa" -> "Alface Crespa"
 * - "alf. rox.", "alf rox", "alface rox", "alf roxa", "roxa" -> "Alface Roxa"
 * - "alf. lis.", "alf lis", "alface lis", "alf lisa", "lisa" -> "Alface Lisa"
 * - "alf. fris.", "alf frisee", "alface frise" -> "Alface Frisée"
 * - "alf. rom.", "alf romana", "alface rom" -> "Alface Romana"
 * - "alf. mim.", "alf mimosa", "alface mimosa" -> "Alface Mimosa"
 * - "alf. salan.", "alf salanova" -> "Alface Salanova"
 * - "alf. hidro", "alface hidro" -> "Alface Hidropônica"
 * - "pct alface americana", "pct. alf. americana" -> "Alface Americana"
 * - "salsa", "salsinha", "molho de salsa", "sals." -> "Salsinha"
 * - "cebol.", "cebola verde" -> "Cebolinha"
 * - "ch. verde", "cheiro v." -> "Cheiro Verde"
 * - "couve mant.", "couve m." -> "Couve Manteiga"
 */
export function getCanonicalProductName(rawName?: string | null): string {
  if (!rawName) return '';
  const name = cleanRawProductName(rawName);
  const stripped = stripAccentsAndSpecial(name);

  // -------------------------------------------------------------
  // 1. RESOLUÇÃO COMPLETA DE ALFACES (Abreviadas e Nomes Completos)
  // -------------------------------------------------------------
  
  // Alface Americana (Ex: alf. amer., alf amer, alface amer, alf americana, alf americ, etc.)
  if (
    stripped === 'alfaceamericana' ||
    stripped === 'alfamericana' ||
    stripped === 'alfamer' ||
    stripped === 'alfaceamer' ||
    stripped === 'alfaceamerican' ||
    stripped === 'alfamerican' ||
    stripped === 'alfacamericana' ||
    stripped === 'alfaamericana' ||
    stripped === 'alfacamer' ||
    stripped === 'alfaamer' ||
    stripped === 'alfame' ||
    stripped === 'alfacea' ||
    stripped === 'alfca' ||
    stripped === 'alfameric' ||
    stripped === 'alfaceameric' ||
    stripped === 'alfaceamericanaorganica' ||
    stripped.startsWith('alfamer') ||
    stripped.startsWith('alfaceamer') ||
    stripped === 'americana'
  ) {
    return 'Alface Americana';
  }

  // Alface Crespa (Ex: alf. cresp., alf cresp, alface cresp, alf crespa, etc.)
  if (
    stripped === 'alfacecrespa' ||
    stripped === 'alfcrespa' ||
    stripped === 'alfcresp' ||
    stripped === 'alfacecresp' ||
    stripped === 'alfcre' ||
    stripped === 'alfacecre' ||
    stripped === 'alfaccrespa' ||
    stripped === 'alfacrespa' ||
    stripped === 'alfacec' ||
    stripped === 'alfc' ||
    stripped === 'alfac' ||
    stripped === 'alfacresp' ||
    stripped === 'alfacecres' ||
    stripped.startsWith('alfcresp') ||
    stripped.startsWith('alfacecresp') ||
    stripped.startsWith('alfacre') ||
    stripped === 'crespa'
  ) {
    return 'Alface Crespa';
  }

  // Alface Roxa (Ex: alf. rox., alf rox, alface rox, alf roxa, etc.)
  if (
    stripped === 'alfaceroxa' ||
    stripped === 'alfroxa' ||
    stripped === 'alfrox' ||
    stripped === 'alfacerox' ||
    stripped === 'alfacroxa' ||
    stripped === 'alfaroxa' ||
    stripped === 'alfacevermelha' ||
    stripped === 'alfvermelha' ||
    stripped.startsWith('alfrox') ||
    stripped.startsWith('alfacerox') ||
    stripped === 'roxa'
  ) {
    return 'Alface Roxa';
  }

  // Alface Lisa (Ex: alf. lis., alf lis, alface lis, alf lisa, etc.)
  if (
    stripped === 'alfacelisa' ||
    stripped === 'alflisa' ||
    stripped === 'alflis' ||
    stripped === 'alfacelis' ||
    stripped === 'alfaclisa' ||
    stripped === 'alfalisa' ||
    stripped.startsWith('alflis') ||
    stripped.startsWith('alfacelis') ||
    stripped === 'lisa'
  ) {
    return 'Alface Lisa';
  }

  // Alface Frisée / Frisada (Ex: alf. fris., alf frisee, alface frise, etc.)
  if (
    stripped === 'alfacefrisee' ||
    stripped === 'alfacefrise' ||
    stripped === 'alffrisee' ||
    stripped === 'alffris' ||
    stripped === 'alfacefrisada' ||
    stripped === 'alffrisada' ||
    stripped.startsWith('alffris') ||
    stripped.startsWith('alfacefris')
  ) {
    return 'Alface Frisée';
  }

  // Alface Romana (Ex: alf. rom., alf romana, alface rom, etc.)
  if (
    stripped === 'alfaceromana' ||
    stripped === 'alfromana' ||
    stripped === 'alfrom' ||
    stripped === 'alfacerom' ||
    stripped.startsWith('alfrom') ||
    stripped.startsWith('alfacerom') ||
    stripped === 'romana'
  ) {
    return 'Alface Romana';
  }

  // Alface Mimosa Roxa / Verde / Mimosa
  if (stripped === 'alfacemimosaroxa' || stripped === 'alfmimosaroxa' || stripped === 'mimosaroxa') {
    return 'Alface Mimosa Roxa';
  }
  if (stripped === 'alfacemimosaverde' || stripped === 'alfmimosaverde' || stripped === 'mimosaverde') {
    return 'Alface Mimosa Verde';
  }
  if (
    stripped === 'alfacemimosa' ||
    stripped === 'alfmimosa' ||
    stripped === 'alfmim' ||
    stripped === 'alfacemim' ||
    stripped.startsWith('alfmim') ||
    stripped.startsWith('alfacemim') ||
    stripped === 'mimosa'
  ) {
    return 'Alface Mimosa';
  }

  // Alface Salanova
  if (
    stripped === 'alfacesalanova' ||
    stripped === 'alfsalanova' ||
    stripped === 'alfsalan' ||
    stripped === 'alfacesalan' ||
    stripped.startsWith('alfsalan')
  ) {
    return 'Alface Salanova';
  }

  // Alface Hidropônica (caso não tenha variedade especificada)
  if (
    stripped === 'alfacehidroponica' ||
    stripped === 'alfhidroponica' ||
    stripped === 'alfacehidro' ||
    stripped === 'alfhidro' ||
    stripped === 'alfhidr'
  ) {
    return 'Alface Hidropônica';
  }

  // Alface Brunita
  if (stripped === 'alfacebrunita' || stripped === 'alfbrunita' || stripped === 'brunita') {
    return 'Alface Brunita';
  }

  // Alface Crocantela
  if (stripped === 'alfacecrocantela' || stripped === 'alfcrocantela' || stripped === 'crocantela') {
    return 'Alface Crocantela';
  }

  // Alface Lollo Rossa / Bionda
  if (stripped.includes('lollorossa') || stripped.includes('lolloroxa')) {
    return 'Alface Lollo Rossa';
  }
  if (stripped.includes('lollobionda') || stripped.includes('lolloverde')) {
    return 'Alface Lollo Bionda';
  }

  // Alface Genérica (apenas quando não tiver variedade identificada)
  if (
    stripped === 'alface' ||
    stripped === 'alfaces' ||
    stripped === 'alf'
  ) {
    return 'Alface';
  }

  // -------------------------------------------------------------
  // 2. RESOLUÇÃO DE OUTRAS FOLHOSAS, TEMPEROS E HORTALIÇAS
  // -------------------------------------------------------------
  if (stripped === 'salsa' || stripped === 'salsinha' || stripped === 'sals' || stripped === 'molhodesalsa') {
    return 'Salsinha';
  }
  if (stripped === 'cebolinha' || stripped === 'cebol' || stripped === 'cebolaverde' || stripped === 'cebolinhapalha') {
    return 'Cebolinha';
  }
  if (stripped === 'cheiroverde' || stripped === 'chverde' || stripped === 'cheirov' || stripped === 'cheiro' || stripped === 'molhodecheiroverde') {
    return 'Cheiro Verde';
  }
  if (stripped === 'rucula' || stripped === 'ruc' || stripped === 'ruculahidro' || stripped === 'ruculahidroponica') {
    return 'Rúcula';
  }
  if (stripped === 'couve' || stripped === 'couvemanteiga' || stripped === 'couvemant' || stripped === 'couvem') {
    return 'Couve Manteiga';
  }
  if (stripped === 'espinafre' || stripped === 'espin' || stripped === 'esp') {
    return 'Espinafre';
  }
  if (stripped === 'manjericao' || stripped === 'manj' || stripped === 'manjericaoitaliano') {
    return 'Manjericão';
  }
  if (stripped === 'agriao' || stripped === 'agri' || stripped === 'agriaohidro') {
    return 'Agrião';
  }
  if (stripped === 'alecrim' || stripped === 'alec') {
    return 'Alecrim';
  }
  if (stripped === 'hortela' || stripped === 'hort') {
    return 'Hortelã';
  }
  if (stripped === 'coentro' || stripped === 'coent') {
    return 'Coentro';
  }
  if (stripped === 'tomatecereja' || stripped === 'tomcereja' || stripped === 'tomatecer') {
    return 'Tomate Cereja';
  }
  if (stripped === 'tomateitaliano' || stripped === 'tomitaliano' || stripped === 'tomateital') {
    return 'Tomate Italiano';
  }
  if (stripped === 'tomatecarmem' || stripped === 'tomcarmem') {
    return 'Tomate Carmem';
  }
  if (stripped === 'tomate' || stripped === 'tom') {
    return 'Tomate';
  }
  if (stripped === 'batatainglesa' || stripped === 'batinglesa') {
    return 'Batata Inglesa';
  }
  if (stripped === 'batatadoce' || stripped === 'batdoce') {
    return 'Batata Doce';
  }
  if (stripped === 'cenoura' || stripped === 'cen' || stripped === 'cenouraespecial') {
    return 'Cenoura Especial';
  }
  if (stripped === 'beterraba' || stripped === 'beterr' || stripped === 'bet') {
    return 'Beterraba';
  }
  if (stripped === 'cebolaroxa' || stripped === 'cebroxa') {
    return 'Cebola Roxa';
  }
  if (stripped === 'cebolanacional' || stripped === 'cebnacional' || stripped === 'cebolabranca') {
    return 'Cebola Nacional';
  }
  if (stripped === 'pimentaoverde' || stripped === 'pimverde') {
    return 'Pimentão Verde';
  }
  if (stripped === 'pimentaovermelho' || stripped === 'pimvermelho') {
    return 'Pimentão Vermelho';
  }
  if (stripped === 'pimentaoamarelo' || stripped === 'pimamarelo') {
    return 'Pimentão Amarelo';
  }
  if (stripped === 'abobrinhaitaliana' || stripped === 'abobitaliana') {
    return 'Abobrinha Italiana';
  }
  if (stripped === 'abobrinhamenina' || stripped === 'abobmenina') {
    return 'Abobrinha Menina';
  }
  if (stripped === 'chuchu') {
    return 'Chuchu';
  }
  if (stripped === 'pepinojapones' || stripped === 'pepjapones') {
    return 'Pepino Japonês';
  }
  if (stripped === 'mandioca' || stripped === 'aipim' || stripped === 'macaxeira') {
    return 'Mandioca / Aipim';
  }
  if (stripped === 'alhoroxo' || stripped === 'alho') {
    return 'Alho Roxo';
  }
  if (stripped === 'brocolisninja' || stripped === 'brocolis' || stripped === 'brocol') {
    return 'Brócolis Ninja';
  }
  if (stripped === 'couveflor') {
    return 'Couve-Flor';
  }
  if (stripped === 'repolhoverde' || stripped === 'repverde' || stripped === 'repolho') {
    return 'Repolho Verde';
  }
  if (stripped === 'repolhoroxo' || stripped === 'reproxo') {
    return 'Repolho Roxo';
  }

  // -------------------------------------------------------------
  // 3. CAPITALIZAÇÃO PADRÃO CASO NÃO SEJA CASO CONHECIDO
  // -------------------------------------------------------------
  if (name.length > 0) {
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
 * Guarantees that "pct alface roxa", "alf. rox", and "alface roxa" produce the exact same key: "alfaceroxa".
 * "salsa" and "salsinha" produce the exact same key: "salsinha".
 */
export function normalizeProductName(name?: string | null): string {
  if (!name) return '';
  const cleaned = cleanRawProductName(name);
  const canonical = getCanonicalProductName(cleaned);
  const stripped = stripAccentsAndSpecial(canonical);
  // Residual cleanup for origin suffixes if any
  return stripped
    .replace(/(revenda|terceiros?|hortapropria|producaopropria|ceasa)$/g, '')
    .trim();
}

/**
 * Calculates dynamic real-time inventory for third-party purchased items.
 * Deducts all sales that consume third-party items across both KG sales and regular orders.
 */
export function calculateThirdPartyStock(
  purchases: ThirdPartyPurchase[] = [],
  sales: Sale[] = []
): ThirdPartyStockItem[] {
  const stockMap = new Map<string, ThirdPartyStockItem>();

  // 1. Somar todas as compras efetuadas
  (purchases || []).forEach(purchase => {
    const pDate = purchase.purchaseDate?.toDate
      ? purchase.purchaseDate.toDate()
      : (purchase.purchaseDate ? new Date(purchase.purchaseDate) : null);

    (purchase.items || []).forEach(item => {
      if (!item.name || !item.name.trim()) return;
      const canonical = getCanonicalProductName(item.name);
      const normName = normalizeProductName(canonical);
      const normUnit = normalizeUnit(item.unit);
      const key = `${normName}_${normUnit}`;

      const qty = Number(item.quantity) || 0;
      const unitCost = Number(item.unitCost) || 0;

      if (!stockMap.has(key)) {
        stockMap.set(key, {
          name: canonical,
          canonicalName: canonical,
          unit: normUnit,
          totalPurchased: 0,
          totalSold: 0,
          currentStock: 0,
          latestCost: unitCost,
          averageCost: unitCost,
          lastSupplier: purchase.supplierName,
          lastPurchaseDate: pDate,
          purchaseCount: 0
        });
      }

      const current = stockMap.get(key)!;
      const prevTotalQty = current.totalPurchased;
      const newTotalQty = prevTotalQty + qty;

      // Custo médio ponderado
      const prevTotalValue = prevTotalQty * current.averageCost;
      const newTotalValue = prevTotalValue + (qty * unitCost);
      const newAverageCost = newTotalQty > 0 ? (newTotalValue / newTotalQty) : unitCost;

      current.totalPurchased = Number(newTotalQty.toFixed(2));
      current.averageCost = Number(newAverageCost.toFixed(2));
      current.latestCost = unitCost > 0 ? unitCost : current.latestCost;
      current.purchaseCount += 1;

      if (purchase.supplierName) current.lastSupplier = purchase.supplierName;
      if (pDate && (!current.lastPurchaseDate || pDate > current.lastPurchaseDate)) {
        current.lastPurchaseDate = pDate;
      }
    });
  });

  // 2. Deduzir as vendas realizadas que consumiram itens de terceiros
  (sales || []).forEach(sale => {
    if (sale.status === 'cancelled') return; // Vendas canceladas não consomem estoque

    (sale.items || []).forEach(item => {
      if (!item.name || !item.name.trim()) return;

      const isThirdParty = item.source === 'third_party' || 
        (item.name && item.name.toLowerCase().includes('revenda')) || 
        (item.name && item.name.toLowerCase().includes('terceiro'));

      if (isThirdParty) {
        const canonical = getCanonicalProductName(item.name);
        const normName = normalizeProductName(canonical);
        const normUnit = normalizeUnit(item.unit);
        const key = `${normName}_${normUnit}`;

        // Tenta encontrar pela chave exata (produto + unidade)
        let targetKey = key;
        if (!stockMap.has(targetKey)) {
          // Fallback: busca produto compatível pelo nome normalizado
          for (const [existingKey, existingItem] of stockMap.entries()) {
            if (normalizeProductName(existingItem.canonicalName) === normName) {
              targetKey = existingKey;
              break;
            }
          }
        }

        const soldQty = (item.actualWeightedQty !== undefined && item.actualWeightedQty !== null)
          ? Number(item.actualWeightedQty)
          : (Number(item.quantity) || 0);

        if (soldQty <= 0) return;

        if (!stockMap.has(targetKey)) {
          // Caso tenha sido vendido sem registro prévio de compra
          stockMap.set(key, {
            name: canonical,
            canonicalName: canonical,
            unit: normUnit,
            totalPurchased: 0,
            totalSold: Number(soldQty.toFixed(2)),
            currentStock: Number((-soldQty).toFixed(2)),
            latestCost: Number(item.cost || item.estimatedCost || 0),
            averageCost: Number(item.cost || item.estimatedCost || 0),
            purchaseCount: 0
          });
        } else {
          const current = stockMap.get(targetKey)!;
          current.totalSold = Number((current.totalSold + soldQty).toFixed(2));
        }
      }
    });
  });

  // 3. Calcular saldo atual
  stockMap.forEach(item => {
    item.currentStock = Number((item.totalPurchased - item.totalSold).toFixed(2));
  });

  return Array.from(stockMap.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, 'pt-BR'));
}


