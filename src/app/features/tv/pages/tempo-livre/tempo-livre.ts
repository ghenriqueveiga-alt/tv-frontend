import { Component, signal, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TvService, BlocoOutput } from '../../services/tv.service';
import { duracaoPacote, inicioSlot, limparCacheMultiEp, pacoteBloco, sufixoEpisodio } from '../../utils/multi-episodio';

interface EpisodioInfo {
  aId: number;
  aNumero: number | null;
  aTemporada: number | null;
  aParte: number | null;
  aTitulo: string | null;
  aDuracao: string | null;
}

interface LinhaTempoLivre {
  blocoId: number;
  dia: string;
  diaIdx: number;
  horario: string;
  programa: string;
  episodio: EpisodioInfo | null;
  qtdEps: number;
  duracaoSec: number;
  slots: number;
  topoSec: number;
  baixoSec: number;
  totalSec: number;
  isMulti: boolean;
}

@Component({
  selector: 'app-tempo-livre',
  imports: [RouterLink],
  templateUrl: './tempo-livre.html',
  styleUrl: './tempo-livre.css',
})
export class TempoLivre implements OnInit {

  readonly tvService = inject(TvService);

  readonly loading = signal(true);
  readonly searchText = signal('');
  readonly selectedDay = signal('');
  readonly onlyMulti = signal(false);
  readonly currentPage = signal(0);
  readonly totalPages = signal(1);
  readonly pageLabels: string[] = [];
  @ViewChild('pagScroll') private pagScroll?: ElementRef<HTMLDivElement>;

  readonly dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  readonly EPISODES_PER_PAGE = 5;

  private allBlocos: BlocoOutput[] = [];
  private allEpisodiosMap = new Map<number, EpisodioInfo[]>();
  private diasProgramaMap = new Map<number, number[]>();
  private weekendOrder = new Map<number, BlocoOutput[]>();

  ngOnInit(): void {
    this.loadBlocos();
  }

  private normalizeDia(d: string): string {
    return d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private diaIdxOf(desc: string | null): number {
    if (!desc) return -1;
    const map = new Map(this.dias.map((d, i) => [d, i]));
    const norm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    return map.get(desc) ?? norm.get(this.normalizeDia(desc)) ?? -1;
  }

  private parseDuracaoSec(duracao: string | null): number {
    if (!duracao) return 0;
    const p = duracao.split(':');
    if (p.length !== 3) return 0;
    return (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
  }

  private isFimDeSemanaIdx(idx: number): boolean {
    return idx === 5 || idx === 6;
  }

  private loadBlocos(): void {
    this.loading.set(true);
    this.tvService.listBlocos(0, 1000).subscribe({
      next: (res) => {
        this.allBlocos = res.aBlocos.filter(b => b.aStatusCode === 'AT');
        this.loadEpisodios();
      },
      error: () => {
        this.allBlocos = [];
        this.loading.set(false);
      },
    });
  }

  private loadEpisodios(): void {
    const programIds = [...new Set(this.allBlocos.filter(b => b.aPrograma).map(b => b.aPrograma!.aId))];
    if (programIds.length === 0) {
      this.loading.set(false);
      return;
    }

    for (const pid of programIds) {
      const dias = [...new Set(
        this.allBlocos
          .filter(b => b.aPrograma?.aId === pid && b.aDiaSemanaDesc)
          .map(b => this.diaIdxOf(b.aDiaSemanaDesc))
      )].filter(d => d >= 0).sort((a, b) => a - b);
      this.diasProgramaMap.set(pid, dias);
    }

    const wk = new Map<number, BlocoOutput[]>();
    for (const b of this.allBlocos) {
      if (!b.aPrograma || !b.aDiaSemanaDesc) continue;
      const dIdx = this.diaIdxOf(b.aDiaSemanaDesc);
      if (dIdx !== 5 && dIdx !== 6) continue;
      const pid = b.aPrograma.aId;
      if (!wk.has(pid)) wk.set(pid, []);
      wk.get(pid)!.push(b);
    }
    for (const [pid, list] of wk) {
      list.sort((a, b) =>
        this.diaIdxOf(a.aDiaSemanaDesc) - this.diaIdxOf(b.aDiaSemanaDesc) ||
        (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
      this.weekendOrder.set(pid, list);
    }

    this.tvService.listPrimeirosEpisodiosPorPrograma(programIds, 10000).subscribe({
      next: (rows) => {
        this.allEpisodiosMap.clear();
        limparCacheMultiEp();
        const grouped = new Map<number, EpisodioInfo[]>();
        for (const row of rows) {
          const pid = row.aProgramaId;
          if (!grouped.has(pid)) grouped.set(pid, []);
          grouped.get(pid)!.push({
            aId: row.aId,
            aNumero: row.aNumero,
            aTemporada: row.aTemporada,
            aParte: row.aParte,
            aTitulo: row.aTitulo,
            aDuracao: (row as any).aDuracao ?? null,
          });
        }

        let maxPages = 1;
        for (const [pid, eps] of grouped) {
          // MESMA ordem da grade: sem isso o episódio escolhido (e o tempo
          // livre) divergia da grade mesmo com o mesmo cálculo de índice.
          const parteVal = (e: EpisodioInfo) => (e.aTitulo && e.aTitulo.toLowerCase().includes('parte')) ? 0 : (e.aParte ?? 0);
          const numeroVal = (e: EpisodioInfo) => e.aNumero ?? 9999;
          const isInterleaved = pid === 7 || pid === 47 || pid === 48 || pid === 74;
          if (isInterleaved) {
            eps.sort((a, b) => ((a.aTemporada ?? 0) - (b.aTemporada ?? 0)) || (numeroVal(a) - numeroVal(b)) || (parteVal(a) - parteVal(b)));
          } else {
            eps.sort((a, b) => ((a.aTemporada ?? 0) - (b.aTemporada ?? 0)) || (parteVal(a) - parteVal(b)) || (numeroVal(a) - numeroVal(b)));
          }
          this.allEpisodiosMap.set(pid, eps);
          const diasQuePassa = this.diasProgramaMap.get(pid) ?? [];
          const hasWeekend = diasQuePassa.some(d => d === 5 || d === 6);
          let pageSize = this.EPISODES_PER_PAGE;
          if (hasWeekend) {
            const wkTotal = (this.weekendOrder.get(pid) ?? []).length;
            if (wkTotal > 0) pageSize = wkTotal;
          }
          const progPages = Math.max(1, Math.ceil(eps.length / pageSize));
          if (progPages > maxPages) maxPages = progPages;
        }

        this.totalPages.set(maxPages);
        this.pageLabels.length = 0;
        for (let p = 0; p < maxPages; p++) {
          this.pageLabels.push(`Página ${p + 1}`);
        }
        this.loading.set(false);
        // A barra de páginas só passa a existir depois do @if: espera um tick
        // para o ViewChild resolver e então centraliza o botão da página atual.
        setTimeout(() => this.focarBotaoPagina(this.currentPage()), 0);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private episodioFor(bloco: BlocoOutput, diaIdx: number, page: number): EpisodioInfo | null {
    if (!bloco.aPrograma) return null;
    const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
    if (!eps || eps.length === 0) return null;
    if (this.isFimDeSemanaIdx(diaIdx)) {
      const list = this.weekendOrder.get(bloco.aPrograma.aId) ?? [];
      if (list.length === 0) return null;
      const pos = list.findIndex(b => b.aId === bloco.aId);
      if (pos < 0) return null;
      return eps[(page * list.length + pos) % eps.length];
    }
    const diasQuePassa = this.diasProgramaMap.get(bloco.aPrograma.aId);
    if (!diasQuePassa || diasQuePassa.length === 0) return null;
    const dayPosition = diasQuePassa.indexOf(diaIdx);
    if (dayPosition < 0) return null;
    // Mesma fórmula da grade: o bloco consome os episódios que exibe
    // (multiepisódio), então o índice avança pelo total mostrado.
    const idx = inicioSlot(`ep-${bloco.aPrograma.aId}`, eps, page, dayPosition, diasQuePassa.length);
    return eps[idx];
  }

  /** Episódios do bloco (mais de 1 quando somam menos de 30 min). */
  private pacoteFor(bloco: BlocoOutput, ep: EpisodioInfo | null): EpisodioInfo[] {
    if (!ep) return [];
    const eps = bloco.aPrograma ? this.allEpisodiosMap.get(bloco.aPrograma.aId) : null;
    if (!eps || eps.length === 0) return [ep];
    const idx = eps.indexOf(ep);
    if (idx < 0) return [ep];
    return pacoteBloco(eps, idx);
  }

  get rows(): LinhaTempoLivre[] {
    const page = this.currentPage();
    const search = this.normalizeDia(this.searchText().trim());
    const dayFilter = this.selectedDay();
    const out: LinhaTempoLivre[] = [];

    for (const b of this.allBlocos) {
      if (!b.aPrograma || !b.aDiaSemanaDesc || !b.aHorario) continue;
      const diaIdx = this.diaIdxOf(b.aDiaSemanaDesc);
      if (diaIdx < 0) continue;
      if (dayFilter !== '' && this.dias[diaIdx] !== dayFilter) continue;

      const progNome = b.aPrograma.aNome;
      const ep = this.episodioFor(b, diaIdx, page);
      const pacote = this.pacoteFor(b, ep);
      const hay = this.normalizeDia(
        `${progNome} ${pacote.map(e => `${e.aTitulo ?? ''} E${e.aNumero ?? ''}`).join(' ')}`,
      );
      if (search !== '' && !hay.includes(search)) continue;

      // Bloco multiepisódio: a duração é a soma de todos os episódios do
      // bloco (30 min − soma = tempo livre, igual à grade).
      const duracaoSec = pacote.length > 0 ? duracaoPacote(pacote) : 0;
      const isMulti = duracaoSec > 30 * 60 && b.aPrograma.aId !== 35;
      const slots = Math.max(1, Math.ceil(duracaoSec / (30 * 60)));
      const totalSlotSec = Math.max(0, slots * 30 * 60 - duracaoSec);
      if (this.onlyMulti() && !isMulti) continue;

      let topoSec = Math.floor(totalSlotSec / 2);
      let baixoSec = Math.ceil(totalSlotSec / 2);
      if (isMulti && this.isFimDeSemanaIdx(diaIdx)) {
        const wk = this.weekendOrder.get(b.aPrograma.aId) ?? [];
        const pos = wk.findIndex(x => x.aId === b.aId);
        if (pos >= 0 && wk.length > 0) {
          topoSec = pos === 0 ? Math.floor(totalSlotSec / 2) : 0;
          baixoSec = pos === wk.length - 1 ? Math.ceil(totalSlotSec / 2) : 0;
        }
      }

      out.push({
        blocoId: b.aId,
        dia: this.dias[diaIdx],
        diaIdx,
        horario: b.aHorario.substring(0, 5),
        programa: progNome,
        episodio: ep,
        qtdEps: pacote.length,
        duracaoSec,
        slots,
        topoSec,
        baixoSec,
        totalSec: topoSec + baixoSec,
        isMulti,
      });
    }

    return out.sort((a, b) => a.diaIdx - b.diaIdx || a.horario.localeCompare(b.horario));
  }

  get totalLivreSec(): number {
    return this.rows.reduce((acc, r) => acc + r.totalSec, 0);
  }

  get multiCount(): number {
    return this.rows.filter(r => r.isMulti).length;
  }

  onSearch(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  onDayChange(event: Event): void {
    this.selectedDay.set((event.target as HTMLSelectElement).value);
  }

  toggleMulti(event: Event): void {
    this.onlyMulti.set((event.target as HTMLInputElement).checked);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.focarBotaoPagina(page);
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  /** Rolagem garantida: em aba oculta o Chrome descarta a animação suave. */
  private rolarPara(el: HTMLElement, left: number): void {
    el.scrollTo({
      left: Math.max(0, Math.round(left)),
      behavior: document.visibilityState === 'visible' ? 'smooth' : 'instant',
    });
  }

  /** Centraliza o botão da página atual na barra, para a lista acompanhar a página. */
  private focarBotaoPagina(page: number): void {
    const el = this.pagScroll?.nativeElement;
    if (!el) return;
    const alvo = el.querySelector<HTMLElement>(`[data-pag="${page}"]`);
    if (!alvo) return;
    const barra = el.getBoundingClientRect();
    const botao = alvo.getBoundingClientRect();
    this.rolarPara(el, el.scrollLeft + (botao.left - barra.left) - (barra.width - botao.width) / 2);
  }

  formatSec(totalSec: number): string {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  formatDuracao(duracao: string | null): string {
    if (!duracao) return '--:--';
    const parts = duracao.split(':');
    if (parts.length !== 3) return duracao;
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    const s = parseInt(parts[2]) || 0;
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  epLabel(ep: EpisodioInfo | null): string {
    if (!ep) return '—';
    const parts: string[] = [];
    if (ep.aTemporada) parts.push(`T${ep.aTemporada}`);
    if (ep.aNumero) parts.push(`E${ep.aNumero}${sufixoEpisodio(ep.aNumero, ep.aTitulo)}`);
    return parts.length > 0 ? parts.join(' ') : '—';
  }
}
