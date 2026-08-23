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
  let name = rawName.trim();

  // Strip prefixes like "pct ", "pct. ", "pacote ", "pacotes ", "pcts ", "pct de ", "pacote de ", "pc ", "molho de ", "unidade de ", "pé de ", "pes de ", "pés de ", "pe de "
  name = name
    .replace(/^(pct\.?|pacotes?|pcts?|pc\.?)\s+(de\s+)?/i, '')
    .replace(/^(p[eé]s?)\s+(de\s+)?/i, '')
    .replace(/^molho\s+(de\s+)?/i, '')
    .replace(/^unidade\s+(de\s+)?/i, '')
    .trim();

  // Strip trailing unit tags like " (pct)", " - pct", " (un)", " (kg)", " (mç)", " (pé)", " (pés)"
  name = name
    .replace(/\s*\((pct|un|kg|mc|mç|pacote|pe|pé|pés)\)$/i, '')
    .replace(/\s*-\s*(pct|un|kg|mc|mç|pacote|pe|pé|pés)$/i, '')
    .trim();

  // Remove leading non-alphanumeric punctuation
  name = name.replace(/^[-–—:.]\s*/, '').trim();

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
  const canonical = getCanonicalProductName(name);
  return stripAccentsAndSpecial(canonical);
}

