import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpEventType } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { TvService, ArquivoOutput } from '../../services/tv.service';
import {
  PropagandaService,
  PropagandaOutput,
  PropagandaPosicaoCode,
  PatchPropagandaPayload,
} from '../../services/propaganda.service';

/** Extensões aceitas para o vídeo da propaganda (a mesma lista do backend). */
const EXTENSOES_VIDEO = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.flv',
                         '.mpg', '.mpeg', '.m4v', '.wmv', '.rmvb'];

/** Um lado do espaço livre: bloco + posição dentro dele + capacidade em segundos. */
export interface PropagandaLado {
  lado: 'C' | 'B';
  blocoId: number;
  posicao: PropagandaPosicaoCode;
  capacidade: number;
}

/** Estado das duas metades de um intervalo com a propaganda centralizada. */
export interface ParcelasIntervalo {
  /** Sobra do lado de cima (metade de baixo do bloco de cima). */
  C: number;
  /** Sobra do lado de baixo (metade de topo do bloco de baixo). */
  B: number;
  /** Parcela da duração descontada do lado de cima. */
  usadoC: number;
  /** Parcela da duração descontada do lado de baixo. */
  usadoB: number;
}

/**
 * Uma propaganda no MEIO do intervalo: a duração é dividida por 2 e a metade
 * anterior desconta do lado de cima, a metade inferior do de baixo. Se um lado
 * não comportar a própria metade, o excedente sai do outro — a soma devolvida
 * é sempre a duração inteira, enquanto ela couber nos dois lados juntos.
 * Sempre em segundos inteiros (o formataador de tempo não aceita fração).
 */
export function parcelaCentralizada(C: number, B: number, seg: number): { c: number; b: number } {
  const total = Math.max(0, Math.round(seg));
  const capC = Math.max(0, Math.round(C));
  const capB = Math.max(0, Math.round(B));
  if (total === 0) return { c: 0, b: 0 };
  const meio = Math.floor(total / 2);
  let c = Math.min(meio, capC);
  let b = Math.min(total - meio, capB);
  let falta = total - c - b;
  if (falta > 0) {
    const d = Math.min(falta, capC - c);
    c += d;
    falta -= d;
  }
  if (falta > 0) {
    const d = Math.min(falta, capB - b);
    b += d;
    falta -= d;
  }
  return { c, b };
}

/**
 * Aplica `parcelaCentralizada` a cada peça na ordem da fila e devolve as sobras
 * dos dois lados junto com o quanto cada um descontou. É a mesma conta do card
 * de intervalo da grade e do modal — os dois números têm de bater.
 */
export function sobrasCentralizadas(capC: number, capB: number, duracoes: number[]): ParcelasIntervalo {
  let C = Math.max(0, Math.round(capC));
  let B = Math.max(0, Math.round(capB));
  let usadoC = 0;
  let usadoB = 0;
  for (const seg of duracoes) {
    const { c, b } = parcelaCentralizada(C, B, seg);
    C -= c;
    B -= b;
    usadoC += c;
    usadoB += b;
  }
  return { C, B, usadoC, usadoB };
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
  /** Página da grade (aba de episódios) em que o modal está aberto: as
   *  propagandas são por página, uma propaganda não vale em outra aba. */
  pagina: number;
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
export class PropagandaModal {

  readonly propagandaService = inject(PropagandaService);
  readonly tvService = inject(TvService);

  private readonly contexto = signal<PropagandaContexto | null>(null);
  readonly propLista = signal<PropagandaOutput[]>([]);
  readonly propCarregando = signal(false);
  readonly propSaving = signal(false);
  readonly propErro = signal('');
  readonly propNome = signal('');
  readonly propDuracao = signal('');
  /** Arquivo enviado nesta sessão (ainda não salvo na propaganda). */
  readonly propArquivoSel = signal<ArquivoOutput | null>(null);
  /** O vídeo já gravado na propaganda em edição foi marcado para sair. */
  readonly propArquivoRemovido = signal(false);
  readonly propEnviando = signal(false);
  readonly propUploadPct = signal<number | null>(null);
  readonly propDetectando = signal(false);
  readonly propDuracaoFalhou = signal(false);
  readonly propEditando = signal<PropagandaOutput | null>(null);

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
    this.propArquivoSel.set(null);
    this.propArquivoRemovido.set(false);
    this.propEnviando.set(false);
    this.propUploadPct.set(null);
    this.propEditando.set(null);
    this.propDetectando.set(false);
    this.propDuracaoFalhou.set(false);
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
   * Sobra de cada lado do intervalo com a propaganda no MEIO: a duração é
   * dividida por 2, metade para cima e metade para baixo (excedente de um lado
   * sai do outro). É o que permite uma propaganda maior que um único lado —
   * basta caber na soma dos dois (tempos livres "abaixo do bloco de cima" +
   * "acima do bloco de baixo"). O lado gravado não importa para a conta, só
   * para dizer em qual bloco a peça foi salva. O item em edição fica de fora
   * (o espaço dele volta para a soma).
   */
  private restosLados(): { C: number; B: number } {
    const ctx = this.contexto();
    if (!ctx) return { C: 0, B: 0 };
    const capacidade = (lado: 'C' | 'B') => ctx.lados.find(l => l.lado === lado)?.capacidade ?? 0;
    const editado = this.propEditando();
    const duracoes: number[] = [];
    for (const p of this.propLista()) {
      if (editado && p.aId === editado.aId) continue;
      duracoes.push(p.aDuracaoSeg ?? 0);
    }
    const { C, B } = sobrasCentralizadas(capacidade('C'), capacidade('B'), duracoes);
    return { C, B };
  }

  /** Sobra de um lado já com a parcela centralizada da propaganda descontada. */
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

  private carregarPropagandas(): void {
    const ctx = this.contexto();
    if (!ctx || !ctx.lados.length) return;
    // 1 ou 2 lados: as filas entram na mesma lista, na ordem dos lados
    // (primeiro o de cima, depois o de baixo), cada uma por `ordem`.
    this.propCarregando.set(true);
    forkJoin(ctx.lados.map(l => this.propagandaService.list(l.blocoId, l.posicao, ctx.pagina))).subscribe({
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

    const arquivoEnviado = this.propArquivoSel();
    const pagina = editado?.aPagina ?? this.contexto()?.pagina ?? null;
    let requisicao: Observable<any>;

    if (editado) {
      const patch: PatchPropagandaPayload = { aNome: nome, aDuracaoSeg: seg, aPagina: pagina ?? undefined };
      if (this.propArquivoRemovido()) {
        patch.aRemoverArquivo = true;
      } else if (arquivoEnviado) {
        patch.aArquivoId = arquivoEnviado.aId;
      }
      requisicao = this.propagandaService.patch(editado.aId, patch);
    } else {
      requisicao = this.propagandaService.create({
        aBlocoId: alvo!.blocoId,
        aPosicaoCode: alvo!.posicao,
        aNome: nome,
        aDuracaoSeg: seg,
        aArquivoId: arquivoEnviado?.aId ?? null,
        aPagina: this.contexto()?.pagina ?? 0,
      });
    }

    requisicao.subscribe({
      next: () => {
        this.propEditando.set(null);
        this.propNome.set('');
        this.propDuracao.set('');
        this.propArquivoSel.set(null);
        this.propArquivoRemovido.set(false);
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
    this.propArquivoSel.set(null);
    this.propArquivoRemovido.set(false);
    this.propErro.set('');
  }

  cancelarEdicaoProp(): void {
    this.propEditando.set(null);
    this.propNome.set('');
    this.propDuracao.set('');
    this.propArquivoSel.set(null);
    this.propArquivoRemovido.set(false);
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

  // ── Upload do vídeo ───────────────────────────────────────────────────

  /** Nome do vídeo já gravado que continua valendo (null se não houver,
   *  se foi marcado para sair ou se outro arquivo foi enviado). */
  propArquivoAtualNome(): string | null {
    if (this.propArquivoSel() || this.propArquivoRemovido()) return null;
    return this.propEditando()?.aArquivoNome ?? null;
  }

  /** Escolheu o arquivo: valida a extensão, lê a duração e envia. */
  onArquivoSelecionado(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const ext = this.extensaoDe(file.name);
    if (!EXTENSOES_VIDEO.includes(ext)) {
      this.propErro.set(`Formato não suportado${ext ? ` (${ext})` : ''}.`
        + ` Envie um vídeo: ${EXTENSOES_VIDEO.join(', ')}.`);
      return;
    }

    this.propErro.set('');
    this.propArquivoRemovido.set(false);
    this.propDuracaoFalhou.set(false);
    this.detectarDuracaoLocal(file);
    this.enviarArquivo(file);
  }

  private enviarArquivo(file: File): void {
    this.propEnviando.set(true);
    this.propUploadPct.set(0);

    this.tvService.uploadArquivo(file).subscribe({
      next: evento => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          this.propUploadPct.set(Math.round((evento.loaded / evento.total) * 100));
        } else if (evento.type === HttpEventType.Response && evento.body) {
          this.propEnviando.set(false);
          this.propUploadPct.set(null);
          this.propArquivoSel.set(evento.body);
          if (!this.propNome().trim()) {
            this.propNome.set(file.name.replace(/\.[^.]+$/, ''));
          }
        }
      },
      error: () => {
        this.propEnviando.set(false);
        this.propUploadPct.set(null);
        this.propErro.set('Não foi possível enviar o arquivo.');
      },
    });
  }

  /** Desassocia o vídeo: o enviado agora, ou (ao salvar) o que já está gravado. */
  limparArquivoProp(): void {
    if (this.propEnviando()) return;
    this.propArquivoSel.set(null);
    this.propArquivoRemovido.set(!!this.propEditando()?.aArquivoId);
    this.propDetectando.set(false);
    this.propDuracaoFalhou.set(false);
  }

  /** Preenche a duração lendo os metadados do arquivo escolhido (sem subir). */
  private detectarDuracaoLocal(file: File): void {
    const url = URL.createObjectURL(file);
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
      URL.revokeObjectURL(url);
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
    video.src = url;

    // alguns formatos (mkv/avi) não entregam metadados no navegador
    setTimeout(() => fim(this.propDetectando()), 6000);
  }

  /** "meu_video.MP4" → ".mp4". */
  private extensaoDe(nome: string): string {
    const ponto = nome.lastIndexOf('.');
    return ponto < 0 ? '' : nome.slice(ponto).toLowerCase();
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
