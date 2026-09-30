/**
 * Blocos multiepisódios.
 *
 * Quando os episódios sequenciais de um bloco somam menos de 30 min (ex.:
 * 2 episódios de 11 min = 22 min), o bloco exibe TODOS eles e o tempo livre
 * do bloco passa a ser 30 min − soma das durações (8 min no exemplo).
 *
 * Como o bloco agora consome mais de um episódio da sequência, o índice do
 * episódio de cada bloco também tem que avançar pelo total exibido — senão o
 * episódio do meio se repetiria no dia seguinte.
 *
 * Funções puras compartilhadas por grade, tempo-livre e player para que os
 * três calculcem o mesmo bloco, o mesmo índice e o mesmo tempo livre.
 */

export interface EpisodioLike {
  aId: number;
  aDuracao?: string | null;
}

export const SLOT_SEC = 30 * 60;

/** Duração em segundos (0 quando ausente ou em formato inválido). */
export function duracaoSec(duracao?: string | null): number {
  if (!duracao) return 0;
  const p = duracao.split(':');
  if (p.length !== 3) return 0;
  return (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
}

/**
 * Sufixo do código do episódio lido do título: segmento ("S1 E08C" → "C") ou
 * fração decimal ("S01E14.5" → ".5"). Evita que dois segmentos do mesmo número
 * (E19B/E19C) apareçam com código idêntico no card. Só letra MAIÚSCULA ou
 * fração decimal — "S01E01v2" continua sem sufixo.
 */
export function sufixoEpisodio(numero: number, titulo?: string | null): string {
  const m = (titulo ?? '').match(new RegExp(`E\\s*0*${numero}(\\.\\d+|[A-Z])(?![A-Za-z])`));
  return m ? m[1] : '';
}

const norm = (n: number, len: number): number => ((n % len) + len) % len;

/**
 * Quantos episódios sequenciais cabem no bloco que começa em `idx`.
 * Inclui enquanto a soma continuar abaixo de 30 min; nunca menos que 1.
 * Episódio sem duração válida encerra o empacotamento (o atual ainda entra).
 */
export function tamanhoBloco<T extends EpisodioLike>(eps: readonly T[], idx: number): number {
  const n = eps.length;
  if (n === 0) return 0;
  let total = 0;
  let k = 0;
  while (k < n) {
    const d = duracaoSec(eps[norm(idx + k, n)].aDuracao);
    if (d <= 0) break;
    if (k > 0 && total + d >= SLOT_SEC) break;
    total += d;
    k++;
    if (total >= SLOT_SEC) break;
  }
  return Math.max(1, k);
}

/** Os episódios do bloco: a fatia da sequência que começa em `idx`. */
export function pacoteBloco<T extends EpisodioLike>(eps: readonly T[], idx: number): T[] {
  const n = eps.length;
  if (n === 0) return [];
  const k = tamanhoBloco(eps, idx);
  const out: T[] = [];
  for (let i = 0; i < k; i++) out.push(eps[norm(idx + i, n)]);
  return out;
}

/** Soma das durações dos episódios do bloco (para no primeiro sem duração). */
export function duracaoPacote<T extends EpisodioLike>(eps: readonly T[]): number {
  let total = 0;
  for (const e of eps) {
    const d = duracaoSec(e.aDuracao);
    if (d <= 0) break;
    total += d;
  }
  return total;
}

/**
 * Posição ABSOLUTA (sem módulo) do início do bloco na sequência do programa:
 * soma dos episódios consumidos pelos blocos anteriores (páginas anteriores e
 * slots anteriores da mesma página). É ela que garante que o bloco seguinte
 * continue de onde o anterior parou.
 */
const offsetCache = new Map<string, number>();

/** Zera a memória dos offsets (chamar quando os episódios recarregam). */
export function limparCacheMultiEp(): void {
  offsetCache.clear();
}

export function offsetSlot(
  cacheKey: string,
  eps: readonly EpisodioLike[],
  pagina: number,
  slot: number,
  nSlots: number,
): number {
  const n = eps.length;
  if (n === 0) return 0;
  const passos = Math.max(1, nSlots);
  let base = 0;
  const pags = Math.max(0, pagina);
  for (let p = 1; p <= pags; p++) {
    const key = `${cacheKey}|${p}`;
    let v = offsetCache.get(key);
    if (v === undefined) {
      v = base;
      for (let s = 0; s < passos; s++) v += tamanhoBloco(eps, v);
      offsetCache.set(key, v);
    }
    base = v;
  }
  for (let s = 0; s < Math.max(0, slot); s++) base += tamanhoBloco(eps, base);
  return base;
}

/** Índice (com módulo) do episódio que abre o bloco. */
export function inicioSlot(
  cacheKey: string,
  eps: readonly EpisodioLike[],
  pagina: number,
  slot: number,
  nSlots: number,
): number {
  const n = eps.length;
  if (n === 0) return 0;
  return norm(offsetSlot(cacheKey, eps, pagina, slot, nSlots), n);
}
