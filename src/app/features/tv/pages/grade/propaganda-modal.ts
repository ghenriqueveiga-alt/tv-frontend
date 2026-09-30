import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, Subscription, debounceTime, distinctUntilChanged, forkJoin } from 'rxjs';
import { TvService, ArquivoOutput } from '../../services/tv.service';
import { PropagandaService, PropagandaOutput, PropagandaPosicaoCode } from '../../services/propaganda.service';

/** Um lado do espaço livre: bloco + posição dentro dele + capacidade em segundos. */
export interface PropagandaLado {
  lado: 'C' | 'B';
  blocoId: number;
  posicao: PropagandaPosicaoCode;
  capacidade: number;
}

/**
 * Contexto de abertura do modal, montado pela grade:
 *  - `intervalo: true`  → 2 lados (metade de baixo do bloco de cima + metade de
 *    topo do bloco de baixo), com o total somado; nova propaganda entra primeiro
 *    no lado de cima e só vai para o de baixo quando o de cima não comporta;
 *  - `intervalo: false` → 1 lado (quadrado "Livre" topo/base).
 */
export interface PropagandaContexto {
  intervalo: boolean;
  titulo: string;
  subtitulo: string;
  lados: PropagandaLado[];
  /** Após criar/editar/remover/reordenar, a grade é avisada para recarregar os
   *  marcadores (📢 + tempo restante) desenhados nos quadrados "Livre" e nos
   *  cards de intervalo. */
  aoAlterar?: () => void;
}

/**
 * Modal de propaganda do tempo livre.
 *
 * Componente separado e `OnPush` de propósito: só ele lê o sinal do contexto e
 * o formulário, então digitar/salvar re-renderiza apenas o painel do modal — os
 * 280 cards da grade (que custam 200–700 ms por ciclo) ficam intactos.
 */
@Component({
  selector: 'app-propaganda-modal',
  imports: [FormsModule],
  templateUrl: './propaganda-modal.html',
  styleUrl: './propaganda-modal.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropagandaModal implements OnInit, OnDestroy {

  readonly propagandaService = inject(PropagandaService);
  readonly tvService = inject(TvService);

  private readonly contexto = signal<PropagandaContexto | null>(null);
  readonly propLista = signal<PropagandaOutput[]>([]);
  readonly propCarregando = signal(false);
  readonly propSaving = signal(false);
  readonly propErro = signal('');
  readonly propAba = signal<'manual' | 'catalogo'>('manual');
  readonly propNome = signal('');
  readonly propDuracao = signal('');
  readonly propBusca = signal('');
  readonly propArquivos = signal<ArquivoOutput[]>([]);
  readonly propArquivoSel = signal<ArquivoOutput | null>(null);
  readonly propDetectando = signal(false);
  readonly propDuracaoFalhou = signal(false);
  readonly propEditando = signal<PropagandaOutput | null>(null);

  private propBusca$ = new Subject<string>();
  private propBuscaSub?: Subscription;

  ngOnInit(): void {
    this.propBuscaSub = this.propBusca$
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe(term => this.executarBuscaArquivos(term));
  }

  ngOnDestroy(): void {
    if (this.propBuscaSub) this.propBuscaSub.unsubscribe();
  }

  // ── Abertura/fechamento ───────────────────────────────────────────────

  /** Chamado pela grade no clique (síncrono: o 1º render já vem carregando). */
  abrir(ctx: PropagandaContexto): void {
    this.contexto.set(ctx);
    this.preparar();
    this.carregarPropagandas();
  }

  fecharPropagandas(): void {
    this.contexto.set(null);
    this.propEditando.set(null);
    this.propErro.set('');
  }

  /** Avisa a grade que os dados mudaram (ela redesenha os marcadores do quadro). */
  private notificarGrade(): void {
    this.contexto()?.aoAlterar?.();
  }

  private preparar(): void {
    this.propLista.set([]);
    this.propErro.set('');
    this.propSaving.set(false);
    this.propCarregando.set(false);
    this.propNome.set('');
    this.propDuracao.set('');
    this.propBusca.set('');
    this.propArquivos.set([]);
    this.propArquivoSel.set(null);
    this.propEditando.set(null);
    this.propDetectando.set(false);
    this.propDuracaoFalhou.set(false);
    this.propAba.set('manual');
  }

  // ── Cabeçalho e totais ────────────────────────────────────────────────

  propAberto(): boolean {
    return this.contexto() !== null;
  }

  propTitulo(): string {
    return this.contexto()?.titulo ?? '';
  }

  propSubtitulo(): string {
    return this.contexto()?.subtitulo ?? '';
  }

  /** True quando o modal cobre os dois lados de um intervalo. */
  propGap(): boolean {
    return !!this.contexto()?.intervalo;
  }

  propDisponivelSeg(): number {
    const ctx = this.contexto();
    if (!ctx) return 0;
    return ctx.lados.reduce((total, l) => total + l.capacidade, 0);
  }

  /** Lado do intervalo de um item: 'C' = metade de baixo do bloco de cima,
   *  'B' = metade de topo do bloco de baixo (o item traz a própria posição). */
  propItemLado(p: PropagandaOutput): 'C' | 'B' {
    if (!this.propGap()) return 'C';
    return p.aPosicao === 'Base' ? 'C' : 'B';
  }

  propItemLadoTexto(p: PropagandaOutput): string {
    return this.propItemLado(p) === 'C' ? 'cima' : 'baixo';
  }

  propCapacidadeLadoSeg(lado: 'C' | 'B'): number {
    const ctx = this.contexto();
    if (!ctx) return 0;
    return ctx.lados.find(l => l.lado === lado)?.capacidade ?? 0;
  }

  /**
   * Sobra de cada lado do intervalo aplicando a MESMA regra de gravação: o lado
   * de cima é preenchido primeiro e o excedente transborda para o de baixo. É o
   * que permite uma propaganda maior que um único lado — basta caber na soma dos
   * dois (tempos livres "abaixo do bloco de cima" + "acima do bloco de baixo").
   * O item em edição fica de fora da conta (o espaço dele volta para a soma).
   */
  private restosLados(): { C: number; B: number } {
    const ctx = this.contexto();
    if (!ctx) return { C: 0, B: 0 };
    const capacidade = (lado: 'C' | 'B') => ctx.lados.find(l => l.lado === lado)?.capacidade ?? 0;
    let C = capacidade('C');
    let B = capacidade('B');
    const editado = this.propEditando();
    for (const p of this.propLista()) {
      if (editado && p.aId === editado.aId) continue;
      const seg = p.aDuracaoSeg ?? 0;
      if (this.propItemLado(p) === 'C') {
        if (seg <= C) {
          C -= seg;
        } else {
          const excedente = seg - C;
          C = 0;
          B = Math.max(0, B - excedente);
        }
      } else {
        B = Math.max(0, B - seg);
      }
    }
    return { C, B };
  }

  /** Sobra de um lado já descontando o transbordo do lado de cima. */
  propRestanteLadoSeg(lado: 'C' | 'B'): number {
    return this.restosLados()[lado];
  }

  propUsadoSeg(): number {
    return this.propLista().reduce((total, p) => total + (p.aDuracaoSeg ?? 0), 0);
  }

  /** Quanto ainda cabe no intervalo INTEIRO (soma dos dois lados). */
  propRestanteSeg(): number {
    const r = this.restosLados();
    return r.C + r.B;
  }

  // ── Validação e alocação ──────────────────────────────────────────────

  /** Onde uma propaganda de `seg` segundos será gravada: o intervalo é um pool
   *  só — enche o lado de cima, depois o de baixo; se não couber em nenhum dos
   *  dois mas couber na soma, gravamos no de cima e o excedente transborda
   *  para o de baixo. Retorna null quando nem a soma comporta. */
  private alvoNovoPropaganda(seg: number): { blocoId: number; posicao: PropagandaPosicaoCode } | null {
    const ctx = this.contexto();
    if (!ctx) return null;
    const r = this.restosLados();
    if (seg > r.C + r.B) return null;
    const lado: 'C' | 'B' = (r.C >= seg || (r.C > 0 && r.B < seg)) ? 'C' : 'B';
    const alvo = ctx.lados.find(l => l.lado === lado) ?? ctx.lados[0];
    return alvo ? { blocoId: alvo.blocoId, posicao: alvo.posicao } : null;
  }

  /** A duração tem espaço? No intervalo vale a SOMA dos dois lados (uma peça
   *  pode atravessar o intervalo inteiro); no quadrado único, o próprio espaço. */
  alocacaoPossivelPara(seg: number): boolean {
    return seg <= this.propRestanteSeg();
  }

  /** A duração digitada não cabe no espaço? */
  propDuracaoExcede(): boolean {
    const seg = this.parseDuracaoTexto(this.propDuracao());
    if (!seg || seg <= 0) return false;
    return !this.alocacaoPossivelPara(seg);
  }

  propDuracaoExcedeTexto(): string {
    const r = this.restosLados();
    const total = r.C + r.B;
    if (this.propGap()) {
      return `Não cabe no intervalo: a soma dos tempos livres é ${this.formatarDuracaoProp(total)}`
        + ` (${this.formatarDuracaoProp(r.C)} abaixo do bloco de cima`
        + ` + ${this.formatarDuracaoProp(r.B)} acima do bloco de baixo).`;
    }
    return `Maior que o tempo livre restante (${this.formatarDuracaoProp(total)}).`;
  }

  /** Dica: qual lado do intervalo vai receber a nova propaganda (e avisa quando
   *  ela é maior que um lado só e vai ocupar os dois). */
  propAlvoTexto(): string | null {
    if (!this.propGap() || this.propEditando()) return null;
    const seg = this.parseDuracaoTexto(this.propDuracao());
    if (!seg || seg <= 0) return null;
    const alvo = this.alvoNovoPropaganda(seg);
    if (!alvo) return null;
    const r = this.restosLados();
    const cima = alvo.posicao === 'BA';
    if (cima && seg > r.C) return 'de cima e do de baixo (atravessa o intervalo)';
    if (!cima && seg > r.B) return 'de baixo e do de cima (atravessa o intervalo)';
    return cima ? 'de cima' : 'de baixo';
  }

  propPodeSalvar(): boolean {
    const nome = this.propNome().trim();
    const seg = this.parseDuracaoTexto(this.propDuracao());
    if (!nome || !seg || seg <= 0) return false;
    return this.alocacaoPossivelPara(seg);
  }

  // ── Lista (CRUD) ──────────────────────────────────────────────────────

  abrirAbaProp(aba: 'manual' | 'catalogo'): void {
    this.propAba.set(aba);
    if (aba === 'catalogo' && this.propArquivos().length === 0 && !this.propBusca()) {
      this.executarBuscaArquivos('');
    }
  }

  private carregarPropagandas(): void {
    const ctx = this.contexto();
    if (!ctx || !ctx.lados.length) return;
    // 1 ou 2 lados: as filas entram na mesma lista, na ordem dos lados
    // (primeiro o de cima, depois o de baixo), cada uma por `ordem`.
    this.propCarregando.set(true);
    forkJoin(ctx.lados.map(l => this.propagandaService.list(l.blocoId, l.posicao))).subscribe({
      next: (respostas) => {
        const porOrdem = (lista: PropagandaOutput[]) =>
          [...(lista ?? [])].sort((a, b) => (a.aOrdem ?? 0) - (b.aOrdem ?? 0));
        this.propLista.set(respostas.flatMap(r => porOrdem(r.aPropagandas)));
        this.propCarregando.set(false);
        this.propSaving.set(false);
      },
      error: () => {
        this.propLista.set([]);
        this.propCarregando.set(false);
        this.propSaving.set(false);
      },
    });
  }

  salvarPropaganda(): void {
    const nome = this.propNome().trim();
    const seg = this.parseDuracaoTexto(this.propDuracao());

    if (!nome || !seg || seg <= 0) {
      this.propErro.set('Informe o nome e uma duração válida (ex.: 00:30).');
      return;
    }
    if (!this.alocacaoPossivelPara(seg)) {
      this.propErro.set(this.propDuracaoExcedeTexto());
      return;
    }

    const editado = this.propEditando();
    const alvo = editado ? null : this.alvoNovoPropaganda(seg);
    if (!editado && !alvo) {
      this.propErro.set(this.propDuracaoExcedeTexto());
      return;
    }

    this.propSaving.set(true);
    this.propErro.set('');

    const requisicao: Observable<any> = editado
      ? this.propagandaService.patch(editado.aId, { aNome: nome, aDuracaoSeg: seg })
      : this.propagandaService.create({
          aBlocoId: alvo!.blocoId,
          aPosicaoCode: alvo!.posicao,
          aNome: nome,
          aDuracaoSeg: seg,
          aArquivoId: this.propArquivoSel()?.aId ?? null,
        });

    requisicao.subscribe({
      next: () => {
        this.propEditando.set(null);
        this.propNome.set('');
        this.propDuracao.set('');
        this.propArquivoSel.set(null);
        this.carregarPropagandas();
        this.notificarGrade();
      },
      error: () => {
        this.propSaving.set(false);
        this.propErro.set('Não foi possível salvar a propaganda.');
      },
    });
  }

  editarPropaganda(p: PropagandaOutput): void {
    this.propEditando.set(p);
    this.propNome.set(p.aNome);
    this.propDuracao.set(this.formatarDuracaoProp(p.aDuracaoSeg));
    this.propErro.set('');
  }

  cancelarEdicaoProp(): void {
    this.propEditando.set(null);
    this.propNome.set('');
    this.propDuracao.set('');
    this.propErro.set('');
  }

  removerPropaganda(p: PropagandaOutput): void {
    this.propSaving.set(true);
    this.propErro.set('');
    this.propagandaService.remove(p.aId).subscribe({
      next: () => {
        if (this.propEditando()?.aId === p.aId) this.cancelarEdicaoProp();
        this.carregarPropagandas();
        this.notificarGrade();
      },
      error: () => {
        this.propSaving.set(false);
        this.propErro.set('Não foi possível remover a propaganda.');
      },
    });
  }

  /** A ordem é por bloco+posição: no intervalo só se reordena dentro do mesmo
   *  lado (não dá para arrastar um item do lado de cima para o de baixo). */
  propPodeMover(p: PropagandaOutput, direcao: -1 | 1): boolean {
    if (this.propSaving()) return false;
    const lista = this.propLista();
    const idx = lista.findIndex(x => x.aId === p.aId);
    const alvo = idx + direcao;
    if (idx < 0 || alvo < 0 || alvo >= lista.length) return false;
    if (!this.propGap()) return true;
    return this.propItemLado(p) === this.propItemLado(lista[alvo]);
  }

  moverPropaganda(p: PropagandaOutput, direcao: -1 | 1): void {
    if (!this.propPodeMover(p, direcao)) return;
    const lista = this.propLista();
    const idx = lista.findIndex(x => x.aId === p.aId);
    const alvo = idx + direcao;

    const outro = lista[alvo];
    this.propSaving.set(true);
    this.propErro.set('');
    forkJoin([
      this.propagandaService.patch(p.aId, { aOrdem: outro.aOrdem }),
      this.propagandaService.patch(outro.aId, { aOrdem: p.aOrdem }),
    ]).subscribe({
      next: () => this.carregarPropagandas(),
      error: () => {
        this.propSaving.set(false);
        this.propErro.set('Não foi possível reordenar.');
        this.carregarPropagandas();
      },
    });
  }

  // ── Catálogo de arquivos ──────────────────────────────────────────────

  buscarArquivosProp(term: string): void {
    this.propBusca.set(term ?? '');
    this.propBusca$.next(term ?? '');
  }

  private executarBuscaArquivos(term: string): void {
    this.tvService.listArquivos(0, 100, term).subscribe({
      next: (res) => this.propArquivos.set((res.aArquivos ?? []).filter(a => this.ehVideo(a))),
      error: () => this.propArquivos.set([]),
    });
  }

  /** Só vídeos entram no seletor de propaganda (o catálogo tem capas em .jpg). */
  private ehVideo(a: ArquivoOutput): boolean {
    const tipo = (a.aTipo ?? '').toLowerCase();
    return ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv', '.mpg', '.mpeg', '.m4v'].includes(tipo);
  }

  selecionarArquivoProp(a: ArquivoOutput): void {
    this.propArquivoSel.set(a);
    this.propArquivos.set([]);
    if (!this.propNome().trim()) this.propNome.set(a.aNome);
    this.propErro.set('');
    this.propBusca.set('');
    this.propDuracaoFalhou.set(false);
    this.detectarDuracaoArquivo(a);
  }

  limparArquivoProp(): void {
    this.propArquivoSel.set(null);
    this.propDetectando.set(false);
    this.propDuracaoFalhou.set(false);
  }

  /** Preenche a duração lendo os metadados do arquivo no player. */
  private detectarDuracaoArquivo(a: ArquivoOutput): void {
    const video = document.createElement('video');
    video.preload = 'metadata';
    this.propDetectando.set(true);
    this.propDuracaoFalhou.set(false);

    let concluido = false;
    const fim = (detectou: boolean) => {
      if (concluido) return;
      concluido = true;
      this.propDetectando.set(false);
      this.propDuracaoFalhou.set(!detectou);
      video.removeAttribute('src');
    };
    video.onloadedmetadata = () => {
      const dur = video.duration;
      if (isFinite(dur) && dur > 0) {
        this.propDuracao.set(this.formatarDuracaoProp(Math.round(dur)));
        fim(true);
      } else {
        fim(false);
      }
    };
    video.onerror = () => fim(false);
    video.src = this.tvService.streamUrl(a.aId);

    // alguns formatos (mkv/avi) não entregam metadados no navegador
    setTimeout(() => fim(this.propDuracao().length > 0), 6000);
  }

  // ── Conversão ─────────────────────────────────────────────────────────

  formatarDuracaoProp(seg: number): string {
    const total = Math.max(0, Math.round(seg ?? 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const mm = m.toString().padStart(2, '0');
    const ss = s.toString().padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  /** "mm:ss", "h:mm:ss" ou segundos puros ("45") → segundos (null se inválido). */
  parseDuracaoTexto(txt: string): number | null {
    const t = (txt ?? '').trim();
    if (!t) return null;
    if (t.includes(':')) {
      const partes = t.split(':').map(p => parseInt(p, 10));
      if (partes.some(p => isNaN(p) || p < 0)) return null;
      if (partes.length === 2) return partes[0] * 60 + partes[1];
      if (partes.length === 3) return partes[0] * 3600 + partes[1] * 60 + partes[2];
      return null;
    }
    const n = parseInt(t, 10);
    return isNaN(n) || n <= 0 ? null : n;
  }
}
