import { Component, signal, computed, inject, OnInit, OnDestroy, ViewChild, viewChild, ElementRef, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GoogleAd } from '../../../../core/components/google-ad/google-ad';
import { TvService, BlocoOutput, ProgramaDetalhe } from '../../services/tv.service';
import { LinhaVermelhaService } from '../../services/linha-vermelha.service';
import { PlayerService } from '../../../player/services/player.service';
import { ServerTimeService } from '../../../../core/services/server-time.service';
import { Subscription } from 'rxjs';

interface EpisodioInfo {
  aId: number;
  aNumero: number | null;
  aTemporada: number | null;
  aParte: number | null;
  aTitulo: string | null;
  aDuracao?: string | null;
}

@Component({
  selector: 'app-player-ao-vivo',
  imports: [],
  templateUrl: './player-ao-vivo.html',
  styleUrl: './player-ao-vivo.css',
})
export class PlayerAoVivo implements OnInit, OnDestroy {

  readonly tvService = inject(TvService);
  readonly linhaService = inject(LinhaVermelhaService);
  readonly playerService = inject(PlayerService);
  readonly serverTime = inject(ServerTimeService);
  private readonly route = inject(ActivatedRoute);
  private _linhaSub?: Subscription;
  /** Última página usada no cascata de deslocamentos (recalcula se mudar). */
  private _lastPagina = -1;

  private nowDate(): Date {
    return this.serverTime.ready() ? this.serverTime.now() : new Date();
  }

  /**
   * Página vigente da grade. A grade grava aqui (acompanharPagina) e o player
   * obedece — com ou sem linha manual posicionada. Antes só obedecia quando
   * havia um slot manual, e aí o "ao vivo" ficava preso na página 0.
   */
  private paginaAlvo(): number {
    return this.linhaService.pagina();
  }

  @ViewChild('videoPlayer') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('playerWrap') wrapRef!: ElementRef<HTMLDivElement>;

  /** Quantidade de linhas que cabem na lista "Próximos", medida no DOM. */
  readonly listCapacity = signal(12);
  private readonly fillListRef = viewChild<ElementRef<HTMLDivElement>>('fillList');
  private readonly infoSectionRef = viewChild<ElementRef<HTMLElement>>('infoSection');
  private readonly _fillListObserver = effect((onCleanup) => {
    const lista = this.fillListRef()?.nativeElement;
    const secao = this.infoSectionRef()?.nativeElement;
    const aside = lista?.closest('aside') as HTMLElement | null;
    if (!lista || !secao || !aside) return;

    let ro: ResizeObserver | null = null;
    const medir = () => {
      // Observa também os filhos da seção: a altura natural dela muda quando
      // o conteúdo renderiza (imagem, grade), nem sempre alterando o box dela.
      if (ro) for (const filho of Array.from(secao.children)) ro.observe(filho);

      const ultimo = secao.lastElementChild as HTMLElement | null;
      if (!ultimo) return;
      const cs = getComputedStyle(secao);
      // Altura NATURAL da seção. O grid estica a seção até a altura da linha, e
      // a linha pode ser puxada pelo próprio aside que contém a lista — medir o
      // box da seção (ou da lista) criaria realimentação e só cresceria.
      // "ultimo.bottom - topo" já inclui borda superior + padding superior;
      // falta somar borda e padding inferiores para ter a border-box natural.
      const alturaSecao =
        ultimo.getBoundingClientRect().bottom -
        secao.getBoundingClientRect().top +
        (parseFloat(cs.paddingBottom) || 0) +
        (parseFloat(cs.borderBottomWidth) || 0) +
        (parseFloat(getComputedStyle(ultimo).marginBottom) || 0);

      // Coluna única (abaixo de 1024px) os cards ficam empilhados: não existe
      // irmão para igualar, então a altura viria do próprio conteúdo e a lista
      // nunca diminuiria (chegando a 35 itens em ~500px). Aí o teto passa a ser
      // a tela. Em duas colunas nada muda: a linha é dirigida pela seção.
      const grid = secao.parentElement;
      const trilhas = grid
        ? getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length
        : 1;
      const alturaUtil =
        trilhas > 1 ? alturaSecao : Math.min(alturaSecao, window.innerHeight * 0.8);

      // Parte do aside que não é a lista (transmissão + gaps + título/paddings).
      // É constante: não depende nem da linha do grid nem da altura da lista.
      const rAside = aside.getBoundingClientRect();
      const rLista = lista.getBoundingClientRect();
      const overhead = rAside.height - rLista.height;

      const itens = Array.from(lista.children) as HTMLElement[];
      if (itens.length === 0) return;
      const r0 = itens[0].getBoundingClientRect();
      const alt = r0.height;
      if (!alt) return;
      // Passo = altura da linha + o margin-top de 0.25rem do space-y-1.
      const passo = itens.length > 1 ? itens[1].getBoundingClientRect().top - r0.top : alt + 4;
      if (!passo) return;

      // Tudo em medidas fracionárias (offsetHeight arredonda para inteiro e
      // faria o cálculo perder ~1px, deixando uma linha a menos). O epsilon
      // cobre apenas o ruído de ponto flutuante da subtração.
      const disponivel = Math.max(0, alturaUtil - overhead + 0.01);
      this.listCapacity.set(Math.max(1, Math.floor((disponivel - alt) / passo) + 1));
    };

    ro = new ResizeObserver(medir);
    ro.observe(lista);
    ro.observe(aside);
    medir();
    // O teto de altura usa a viewport, que não redimensiona nenhum dos elementos
    // observados (a página rola) — sem isto, mudar a ALTURA da janela não
    // recalcularia a lista.
    window.addEventListener('resize', medir);
    onCleanup(() => {
      window.removeEventListener('resize', medir);
      ro?.disconnect();
    });
  });

  readonly isPlaying = signal(true);
  readonly isMuted = signal(false);
  readonly volume = signal(1);
  readonly videoEnded = signal(false);

  private tuneInAt = 0;
  private liveBase = 0;
  private suppressSeekGuard = false;

  readonly loading = signal(true);
  readonly currentTime = signal(this.nowDate());
  readonly currentBloco = signal<BlocoOutput | null>(null);
  readonly currentEpisodio = signal<EpisodioInfo | null>(null);
  readonly videoUrl = signal<string | null>(null);
  readonly seekSeconds = signal(0);
  readonly isReprise = signal(false);
  readonly waitSeconds = signal(0);
  readonly waitingForNext = signal(false);
  readonly programaDetalhe = signal<ProgramaDetalhe | null>(null);
  readonly programaErro = signal(false);
  readonly isFullscreen = signal(false);
  private initialSeekOffset = 0;
  readonly showFsUi = signal(true);
  readonly dismissed = signal(false);
  readonly uiHidden = computed(
    () => (this.isFullscreen() && !this.showFsUi()) || (!this.isFullscreen() && this.dismissed()),
  );

  private fsIdleTimer: any;
  private lastMouseX = -1;
  private lastMouseY = -1;
  private readonly docClickHandler = (ev: MouseEvent) => {
    if (this.isFullscreen()) return;
    const t = ev.target as HTMLElement | null;
    if (t && t.closest && t.closest('.tv-screen')) return;
    this.dismissed.set(true);
  };

  private readonly fsChangeHandler = () => {
    const fs = !!document.fullscreenElement;
    this.isFullscreen.set(fs);
    this.lastMouseX = -1;
    this.lastMouseY = -1;
    if (fs) {
      this.showFsUi.set(false);
      this.scheduleFsHide();
    } else {
      this.showFsUi.set(true);
      this.dismissed.set(false);
      if (this.fsIdleTimer) clearTimeout(this.fsIdleTimer);
    }
  };

  private programaCache = new Map<number, ProgramaDetalhe>();
  private lastDetalheProgramaId = 0;
  private _lastOverrideSlot: string | null = null;
  private _suppressAutoPlay = false;
  private _endedProgramId: number | null = null;
  /** Episódio do qual o vídeo carregado veio (detecta troca de página na grade). */
  private _videoEpId: number | null = null;

  readonly qrModalOpen = signal(false);
  readonly selectedQr = signal<{ name: string; color: string } | null>(null);

  openQrModal(name: string, color: string): void {
    this.selectedQr.set({ name, color });
    this.qrModalOpen.set(true);
  }

  closeQrModal(): void {
    this.qrModalOpen.set(false);
  }

  private _timerInterval: any;

  readonly dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  readonly diasAbrev = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

  private diaAlvo(): { dia: string; diaIdx: number } {
    const now = this.currentTime();
    const dayNum = this.serverTime.ready() ? this.serverTime.getDayOfWeek() : now.getDay();
    const nowIdx = dayNum === 0 ? 6 : dayNum - 1;
    const ovDia = this.linhaService.slot() !== null ? this.linhaService.diaIdx() : null;
    const idx = ovDia ?? nowIdx;
    return { dia: this.dias[idx], diaIdx: idx };
  }

  get linhaDiaAbrev(): string {
    const ov = this.linhaService.slot() !== null ? this.linhaService.diaIdx() : null;
    if (ov === null || ov === undefined) return '';
    return this.diasAbrev[ov] ?? '';
  }

  private allEpisodiosMap = new Map<number, EpisodioInfo[]>();
  private diasProgramaMap = new Map<number, number[]>();
  private deslocamentos: { programaId: number; pagina: number; dia: number }[] = [];
  private blocos: BlocoOutput[] = [];
  private readonly EPISODES_PER_PAGE = 5;

  private readonly cavaleirosOrder = [58, 56, 57, 55, 63, 61, 60, 59];
  private readonly dragonBallOrder = [30, 34, 32, 33, 82, 31];
  private readonly avatarOrder = [7, 8];
  private readonly bakiOrder = [10, 9];
  private readonly digimonOrder = [22, 26, 23, 25, 28, 27, 24];
  private readonly medabotsOrder = [47, 48];
  private readonly bokuOrder = [13, 14];

  private isCavaleiros19Horario(b: BlocoOutput): boolean { return b.aHorario?.substring(0,5)==='19:00' && this.cavaleirosOrder.includes(b.aPrograma?.aId ?? -1); }
  private isDragonBall18Horario(b: BlocoOutput): boolean { return b.aHorario?.substring(0,5)==='18:00' && this.dragonBallOrder.includes(b.aPrograma?.aId ?? -1); }
  private isAvatar11Horario(b: BlocoOutput): boolean { return b.aHorario?.substring(0,5)==='11:00' && this.avatarOrder.includes(b.aPrograma?.aId ?? -1); }
  private isBaki21Horario(b: BlocoOutput): boolean { return b.aHorario?.substring(0,5)==='21:00' && this.bakiOrder.includes(b.aPrograma?.aId ?? -1); }
  private isDigimon1230Horario(b: BlocoOutput): boolean { return b.aHorario?.substring(0,5)==='12:30' && this.digimonOrder.includes(b.aPrograma?.aId ?? -1); }
  private isMedabots1130Horario(b: BlocoOutput): boolean { return b.aHorario?.substring(0,5)==='11:30' && this.medabotsOrder.includes(b.aPrograma?.aId ?? -1); }
  private isBokuWeekend18Horario(b: BlocoOutput): boolean { const h=b.aHorario?.substring(0,5); return (h==='18:00'||h==='18:30') && this.bokuOrder.includes(b.aPrograma?.aId ?? -1) && this.isFimDeSemana(b.aDiaSemanaDesc ?? ''); }
  private getFlatEpisodes(order: number[]): EpisodioInfo[] { const flat: EpisodioInfo[]=[]; for(const pid of order){ const eps=this.allEpisodiosMap.get(pid); if(eps) flat.push(...eps);} return flat; }
  private getDisplayProgramaForLive(bloco: BlocoOutput, diaIdx: number): { aId: number; aNome: string } | null {
    const tryFlat = (order: number[], progNames: Record<number,string>) => {
      const flat = this.getFlatEpisodes(order);
      if(flat.length===0) return null;
      const diasQ = this.diasProgramaMap.get(order[0]) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if(dayPos<0) return null;
      const idx = ((dayPos + this.paginaAlvo()*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length;
      const ep=flat[idx];
      for(const pid of order){ const eps=this.allEpisodiosMap.get(pid); if(eps && eps.includes(ep)){ const prog=this.blocos.find(b=>b.aPrograma?.aId===pid)?.aPrograma; if(prog) return prog as any; return {aId: pid, aNome: progNames[pid]??bloco.aPrograma!.aNome} as any; } }
      return null;
    };
    if(this.isBokuWeekend18Horario(bloco)){
      const wk=this.blocos.filter(b=>b.aPrograma?.aId===bloco.aPrograma!.aId && this.normalizeDia(b.aDiaSemanaDesc??'')===this.normalizeDia(this.dias[diaIdx])) .sort((a,b)=>(a.aHorario??'').localeCompare(b.aHorario??'')); const numSlots=wk.length||4; const slotOffset=wk.findIndex(b=>b.aId===bloco.aId); const flat=this.getFlatEpisodes(this.bokuOrder); if(flat.length===0) return bloco.aPrograma as any; const idx=((this.paginaAlvo()*numSlots+slotOffset)%flat.length+flat.length)%flat.length; const ep=flat[idx]; for(const pid of this.bokuOrder){ const eps=this.allEpisodiosMap.get(pid); if(eps && eps.includes(ep)){ const prog=this.blocos.find(b=>b.aPrograma?.aId===pid)?.aPrograma; if(prog) return prog as any; const names: Record<number,string>={13:'Buko no Hero',14:'Buko no Hero - Illegals - Legendado'}; return {aId:pid,aNome:names[pid]??bloco.aPrograma!.aNome} as any; } } return bloco.aPrograma as any;
    }
    if(this.isMedabots1130Horario(bloco)){ const r=tryFlat(this.medabotsOrder,{47:'Medabots',48:'Medabots - Spirits'}); if(r) return r; }
    if(this.isDigimon1230Horario(bloco)){ const r=tryFlat(this.digimonOrder,{22:'Digimon - Adventure',26:'Digimon - Tamers',23:'Digimon - Frontier',25:'Digimon - Savers',28:'Digimon - Xros Wars - Legendado',27:'Digimon - Universe - Appli Monsters - Legendado',24:'Digimon - Ghost Game - Legendado'}); if(r) return r; }
    if(this.isBaki21Horario(bloco)){ const diasQ=this.diasProgramaMap.get(9)??this.diasProgramaMap.get(10)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos>=0){ const flat=this.getFlatEpisodes(this.bakiOrder); const idx=((dayPos+this.paginaAlvo()*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length; const ep=flat[idx]; for(const pid of this.bakiOrder){ const eps=this.allEpisodiosMap.get(pid); if(eps&&eps.includes(ep)){ const prog=this.blocos.find(b=>b.aPrograma?.aId===pid)?.aPrograma; if(prog) return prog as any; const names: Record<number,string>={10:'Baki - O Campeão',9:'Baki - Hanma'}; return {aId:pid,aNome:names[pid]??bloco.aPrograma!.aNome} as any; } } } }
    if(this.isAvatar11Horario(bloco)){ const r=tryFlat(this.avatarOrder,{7:'Avatar - Aang',8:'Avatar - Korra'}); if(r) return r; }
    if(this.isCavaleiros19Horario(bloco)){ const r=tryFlat(this.cavaleirosOrder,{58:'Os Cavaleiros do Zodíaco - Guerra Galática',56:'Os Cavaleiros do Zodíaco - Cavaleiros de Prata',57:'Os Cavaleiros do Zodíaco - Doze Casas',55:'Os Cavaleiros do Zodíaco - Asgard',63:'Os Cavaleiros do Zodíaco - Poseidon',61:'Os Cavaleiros do Zodíaco - Hades - Santuário',60:'Os Cavaleiros do Zodíaco - Hades - Inferno',59:'Os Cavaleiros do Zodíaco - Hades - Elísio'}); if(r) return r; }
    if(this.isDragonBall18Horario(bloco)){ const r=tryFlat(this.dragonBallOrder,{30:'Dragon Ball',34:'Dragon Ball Z',32:'Dragon Ball GT',33:'Dragon Ball Super',82:'Super Dragon Ball Heroes - Legendado',31:'Dragon Ball Daima - Legandado'}); if(r) return r; }
    return bloco.aPrograma as any;
  }

  private normalizeDia(d: string): string {
    return d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  private isFimDeSemana(dia: string): boolean {
    const idx = this.dias.indexOf(dia);
    return idx === 5 || idx === 6;
  }

  private addTime(time: string, addMin: number): string {
    const [h, m] = time.split(':').map(Number);
    let total = h * 60 + m + addMin;
    total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    const nh = Math.floor(total / 60).toString().padStart(2, '0');
    const nm = (total % 60).toString().padStart(2, '0');
    return `${nh}:${nm}`;
  }

  private contarDeslocamentosAntes(programaId: number, pagina: number, diaIdx: number): number {
    let n = 0;
    for (const e of this.deslocamentos) {
      if (e.programaId !== programaId) continue;
      if (e.pagina < pagina || (e.pagina === pagina && e.dia < diaIdx)) n++;
    }
    return n;
  }

  private computeSlipCascade(paginaAlvo: number): void {
    this.deslocamentos = [];
    const dbByDayTime = new Map<string, BlocoOutput[]>();
    for (const b of this.blocos) {
      if (b.aStatusCode !== 'AT' || !b.aDiaSemanaDesc || !b.aHorario) continue;
      const key = `${this.normalizeDia(b.aDiaSemanaDesc)}|${b.aHorario.substring(0, 5)}`;
      if (!dbByDayTime.has(key)) dbByDayTime.set(key, []);
      dbByDayTime.get(key)!.push(b);
    }
    const horarios = [...new Set(
      this.blocos.filter(b => b.aHorario).map(b => b.aHorario!.substring(0, 5))
    )].sort((a, b) => a.localeCompare(b));
    const slipRun = new Map<number, number>();
    const contados = new Set<string>();
    for (let p = 0; p <= paginaAlvo; p++) {
    for (const dia of this.dias) {
      const dIdx = this.dias.indexOf(dia);
      for (const t of horarios) {
        const cellBlocos = dbByDayTime.get(`${this.normalizeDia(dia)}|${t}`);
        if (!cellBlocos) continue;
        for (const bloco of cellBlocos) {
          if (!bloco.aPrograma || bloco.aHorario?.substring(0, 5) !== t) continue;
          const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
          const diasQ = this.diasProgramaMap.get(bloco.aPrograma.aId);
          if (!eps || eps.length === 0 || !diasQ || diasQ.length === 0) continue;
          const dayPos = diasQ.indexOf(dIdx);
          if (dayPos < 0) continue;
          const slip = slipRun.get(bloco.aPrograma.aId) ?? 0;
          const idx = (((dayPos + p * this.EPISODES_PER_PAGE - slip) % eps.length) + eps.length) % eps.length;
          const ep = eps[idx];
          if (!ep || !ep.aDuracao || this.parseDurationSec(ep.aDuracao) <= 30 * 60) continue;
          const need = Math.ceil(this.parseDurationSec(ep.aDuracao) / (30 * 60));
          for (let s = 1; s < need; s++) {
            const ct = this.addTime(t, s * 30);
            if (ct <= t) continue;
            const atSlot = dbByDayTime.get(`${this.normalizeDia(dia)}|${ct}`);
            if (!atSlot) continue;
            for (const disp of atSlot) {
              if (!disp.aPrograma || disp.aId === bloco.aId) continue;
              const ck = `${p}|${dIdx}|${disp.aId}`;
              if (contados.has(ck)) continue;
              contados.add(ck);
              this.deslocamentos.push({ programaId: disp.aPrograma.aId, pagina: p, dia: dIdx });
              slipRun.set(disp.aPrograma.aId, (slipRun.get(disp.aPrograma.aId) ?? 0) + 1);
            }
          }
        }
      }
    }
    }
  }

  private parseDurationSec(duracao: string | null): number {
    if (!duracao) return 0;
    const p = duracao.split(':');
    if (p.length !== 3) return 0;
    return (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
  }

  private isMultiBloco(ep: EpisodioInfo | null): boolean {
    if (!ep) return false;
    const sec = this.parseDurationSec(ep.aDuracao ?? null);
    return sec > 30 * 60;
  }

  private effectiveDayIdx(): number {
    const ovDia = this.linhaService.slot() !== null ? this.linhaService.diaIdx() : null;
    if (ovDia !== null && ovDia !== undefined) return ovDia;
    const now = this.currentTime();
    return now.getDay() === 0 ? 6 : now.getDay() - 1;
  }

  private slotsForEpisode(ep: EpisodioInfo): number {
    const sec = this.parseDurationSec(ep.aDuracao ?? null);
    return Math.max(1, Math.ceil(sec / (30 * 60)));
  }

  private slotIndex(): number {
    if (!this.isMultiBloco(this.currentEpisodio())) return 0;
    const bloco = this.currentBloco();
    if (!bloco?.aPrograma) return 0;
    const dayIdx = this.effectiveDayIdx();
    const dia = this.dias[dayIdx];
    const sameDay = this.blocos
      .filter(b => b.aDiaSemanaDesc === dia && b.aPrograma?.aId === bloco.aPrograma!.aId && b.aHorario)
      .sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
    const idx = sameDay.findIndex(b => b.aId === bloco.aId);
    if (idx < 0) return 0;
    let pos = 0;
    for (let j = idx - 1; j >= 0; j--) {
      if (sameDay[j].aPrograma?.aId === bloco.aPrograma!.aId) pos++;
      else break;
    }
    return pos;
  }

  private getTopFreeSeconds(): number {
    const ep = this.currentEpisodio();
    if (!ep) return 0;
    if (this.isMultiBloco(ep)) {
      if (this.slotIndex() !== 0) return 0;
      const totalSec = this.parseDurationSec(ep.aDuracao ?? null);
      const slots = this.slotsForEpisode(ep);
      const totalSlotSec = slots * 30 * 60;
      const livre = Math.max(0, totalSlotSec - totalSec);
      return Math.floor(livre / 2);
    }
    const sec = this.parseDurationSec(ep.aDuracao ?? null);
    const livre = 30 * 60 - sec;
    if (livre <= 0) return 0;
    return Math.floor(livre / 2);
  }

  private getBottomFreeSeconds(): number {
    const ep = this.currentEpisodio();
    if (!ep) return 0;
    if (this.isMultiBloco(ep)) {
      if (this.slotIndex() !== this.slotsForEpisode(ep) - 1) return 0;
      const totalSec = this.parseDurationSec(ep.aDuracao ?? null);
      const slots = this.slotsForEpisode(ep);
      const totalSlotSec = slots * 30 * 60;
      const livre = Math.max(0, totalSlotSec - totalSec);
      return Math.ceil(livre / 2);
    }
    const sec = this.parseDurationSec(ep.aDuracao ?? null);
    const livre = 30 * 60 - sec;
    if (livre <= 0) return 0;
    return Math.ceil(livre / 2);
  }

  ngOnInit(): void {
    const seekParam = this.route.snapshot.queryParamMap.get('seek');
    if (seekParam) {
      this.initialSeekOffset = parseInt(seekParam, 10);
    }
    this._timerInterval = setInterval(() => {
      this.currentTime.set(this.nowDate());
      this.updateCurrentBloco();
    }, 1000);

    this._linhaSub = this.linhaService.mudanca$.subscribe(() => {
      // Página pode mudar por navegação na grade (outra aba/dispositivo):
      // o cascata de deslocamentos precisa ser recalculado para a nova página.
      const pag = this.paginaAlvo();
      if (pag !== this._lastPagina) {
        this._lastPagina = pag;
        if (this.allEpisodiosMap.size > 0) this.computeSlipCascade(pag);
      }
      this.updateCurrentBloco();
    });

    document.addEventListener('fullscreenchange', this.fsChangeHandler);
    document.addEventListener('click', this.docClickHandler);
    this.loadBlocos();
  }

  ngOnDestroy(): void {
    if (this._timerInterval) clearInterval(this._timerInterval);
    this._linhaSub?.unsubscribe();
    document.removeEventListener('fullscreenchange', this.fsChangeHandler);
    document.removeEventListener('click', this.docClickHandler);
    if (this.fsIdleTimer) clearTimeout(this.fsIdleTimer);
  }

  onFsMouseMove(event: MouseEvent): void {
    if (this.isFullscreen()) {
      if (event.clientX === this.lastMouseX && event.clientY === this.lastMouseY) return;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
      this.showFsUi.set(true);
      this.scheduleFsHide();
      return;
    }
    this.dismissed.set(false);
  }

  onScreenClick(): void {
    if (!this.isFullscreen()) this.dismissed.set(false);
  }

  onFsMouseLeave(): void {
    if (this.fsIdleTimer) clearTimeout(this.fsIdleTimer);
    if (this.isFullscreen()) {
      this.showFsUi.set(false);
    } else {
      this.dismissed.set(true);
    }
  }

  private scheduleFsHide(): void {
    if (this.fsIdleTimer) clearTimeout(this.fsIdleTimer);
    this.fsIdleTimer = setTimeout(() => {
      if (this.isFullscreen()) this.showFsUi.set(false);
    }, 2500);
  }

  private loadBlocos(): void {
    this.loading.set(true);
    this.tvService.listBlocos(0, 10000).subscribe({
      next: (res) => {
        this.blocos = res.aBlocos;
        const baseIds = [...new Set(res.aBlocos.filter(b => b.aPrograma).map(b => b.aPrograma!.aId))];
        for(const pid of this.cavaleirosOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        for(const pid of this.dragonBallOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        for(const pid of this.avatarOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        for(const pid of this.bakiOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        for(const pid of this.digimonOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        for(const pid of this.medabotsOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        for(const pid of this.bokuOrder) if(!baseIds.includes(pid)) baseIds.push(pid);
        const programIds = baseIds;

        if (programIds.length === 0) {
          this.loading.set(false);
          return;
        }

        this.diasProgramaMap.clear();
        for (const pid of programIds) {
          const diasQuePassa = [...new Set(
            res.aBlocos
              .filter(b => b.aPrograma?.aId === pid && b.aStatusCode === 'AT' && b.aDiaSemanaDesc)
              .map(b => this.dias.indexOf(b.aDiaSemanaDesc!))
          )].filter(d => d >= 0).sort((a, b) => a - b);
          this.diasProgramaMap.set(pid, diasQuePassa);
        }

        this.tvService.listPrimeirosEpisodiosPorPrograma(programIds, 10000).subscribe({
          next: (rows) => {
            this.allEpisodiosMap.clear();
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
            for (const [pid, eps] of grouped) {
              const isInterleaved = pid===7 || pid===47 || pid===48 || pid===74;
              const parteVal = (e: EpisodioInfo) => (e.aTitulo && e.aTitulo.toLowerCase().includes('parte')) ? 0 : (e.aParte ?? 0);
              const numeroVal = (e: EpisodioInfo) => e.aNumero ?? 9999;
              if(isInterleaved){
                eps.sort((a,b)=> ((a.aTemporada??0)-(b.aTemporada??0)) || (numeroVal(a)-numeroVal(b)) || (parteVal(a)-parteVal(b)));
              } else {
                eps.sort((a,b)=> ((a.aTemporada??0)-(b.aTemporada??0)) || (parteVal(a)-parteVal(b)) || (numeroVal(a)-numeroVal(b)));
              }
              this.allEpisodiosMap.set(pid, eps);
            }

            this.computeSlipCascade(this.paginaAlvo());
            this._lastPagina = this.paginaAlvo();
            this.loading.set(false);
            this.updateCurrentBloco();
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.blocos = [];
        this.loading.set(false);
      },
    });
  }

  private updateCurrentBloco(): void {
    const now = this.currentTime();
    const alvo = this.diaAlvo();
    const dayIdx = alvo.diaIdx;
    const dia = alvo.dia;
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const currentTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    const overrideSlot = this.linhaService.slot();
    let bloco: BlocoOutput | null = null;

    if (overrideSlot) {
      // Em horário pinado, respeita episódios multi-bloco que ocupam o slot
      // (ex.: Re:Zero 00:00 com 50:01 cobre 00:30 — clicar em 00:30 deve
      // continuar o mesmo episódio a partir do minuto 30, não o Parasyte
      // deslocado). Usa a mesma expansão de grade que o modo ao vivo.
      bloco = this.blocoEfetivoAgora(dia, overrideSlot);
      if (!bloco) {
        this.currentBloco.set(null);
        this.currentEpisodio.set(null);
        this.videoUrl.set(null);
        this.videoEnded.set(false);
        this.lastDetalheProgramaId = 0;
        this.programaDetalhe.set(null);
        return;
      }
    }

    if (!bloco) {
      if (overrideSlot) {
        this.currentBloco.set(null);
        this.currentEpisodio.set(null);
        this.videoUrl.set(null);
        this.videoEnded.set(false);
        this.lastDetalheProgramaId = 0;
        this.programaDetalhe.set(null);
        return;
      }
      const matching = this.blocos.filter(b =>
        b.aDiaSemanaDesc === dia && b.aHorario && b.aHorario.substring(0, 5) <= currentTime.substring(0, 5)
      );

      if (matching.length === 0) {
        this.currentBloco.set(null);
        this.currentEpisodio.set(null);
        this.videoUrl.set(null);
        this.videoEnded.set(false);
        this.lastDetalheProgramaId = 0;
        this.programaDetalhe.set(null);
        return;
      }

      matching.sort((a, b) => (b.aHorario ?? '').localeCompare(a.aHorario ?? ''));
      const efetivo = this.blocoEfetivoAgora(dia, currentTime.substring(0, 5));
      if (efetivo) bloco = efetivo;
      else bloco = matching[0];
    }

    const prevSlot = this._lastOverrideSlot;
    this._lastOverrideSlot = overrideSlot ?? null;

    const sameBloco = this.currentBloco()?.aId === bloco.aId && this.currentBloco()?.aHorario === bloco.aHorario;

    // Mudou a página na grade? O episódio-alvo deste bloco muda e o vídeo que
    // está tocando tem que ser trocado. Sem isso, todos os guards abaixo
    // segurariam o episódio antigo até o bloco virar.
    const epAlvo = sameBloco ? this.episodioAlvo(bloco, dia) : null;
    const epMudou = !!epAlvo && this._videoEpId !== null && epAlvo.aId !== this._videoEpId;

    if (sameBloco && this.videoUrl() && prevSlot === overrideSlot && !epMudou) {
      if (this.initialSeekOffset > 0) {
        const video = this.videoRef?.nativeElement;
        if (video) {
          video.currentTime = this.initialSeekOffset;
          this.liveBase = this.initialSeekOffset;
          this.tuneInAt = Date.now();
          this.initialSeekOffset = 0;
        }
      }
      return;
    }

    this.currentBloco.set(bloco);

    const diaIdxForLive = this.dias.indexOf(dia);
    const displayProg = this.getDisplayProgramaForLive(bloco, diaIdxForLive);
    if (displayProg) {
      this.loadProgramaDetalhe(displayProg.aId);
    } else if (bloco.aPrograma) {
      this.loadProgramaDetalhe(bloco.aPrograma.aId);
    }

    const blocoStart = bloco.aHorario!.substring(0, 5);
    const [bh, bm] = blocoStart.split(':').map(Number);
    const blocoTotalSeconds = bh * 3600 + bm * 60;
    const currentTotalSeconds = h * 3600 + m * 60 + s;
    const segundosNoBloco = this.linhaService.segundosDentroBloco();
    const epLive = this.episodioAlvo(bloco, dia);
    this.currentEpisodio.set(epLive);
    const topFree = this.getTopFreeSeconds();

    const ep = this.currentEpisodio();
    const slotIdx = ep ? this.slotIndex() : 0;
    const multiSlotOffset = slotIdx > 0 ? slotIdx * 30 * 60 : 0;
    const elapsedFromFirst = currentTotalSeconds - (blocoTotalSeconds - multiSlotOffset);
    let seekBase: number;
    if (overrideSlot && overrideSlot !== blocoStart) {
      const [oh, om] = overrideSlot.split(':').map(Number);
      const overrideSeconds = oh * 3600 + om * 60;
      const slotMinutes = (om < 30) ? 0 : 30;
      const slotIdx2 = (oh * 60 + slotMinutes) / 30 - (bh * 60 + bm) / 30;
      seekBase = slotIdx2 * 30 * 60 + (om % 30) * 60 + multiSlotOffset;
    } else if (this.linhaService.slot()) {
      seekBase = segundosNoBloco + multiSlotOffset;
    } else if (overrideSlot) {
      seekBase = multiSlotOffset;
    } else {
      seekBase = elapsedFromFirst;
    }
    const adjustedSeek = seekBase - topFree;
    this.seekSeconds.set(adjustedSeek > 0 ? adjustedSeek : 0);

    if (adjustedSeek < 0) {
      const desde = this.linhaService.desde();
      const elapsed = desde > 0 ? (Date.now() - desde) / 1000 : 0;
      const waitRemaining = Math.max(0, Math.abs(adjustedSeek) - elapsed);
      if (waitRemaining > 0) {
        this.waitSeconds.set(waitRemaining);
        this.videoUrl.set(null);
        this.videoEnded.set(false);
        return;
      }
    }

    const epDuracao = this.currentEpisodio()?.aDuracao;
    const episodeSec = epDuracao ? this.parseDurationSec(epDuracao) : 0;
    const bottomFree = this.getBottomFreeSeconds();
    if (bottomFree > 0 && adjustedSeek >= episodeSec) {
      this.waitSeconds.set(0);
      this.waitingForNext.set(true);
      const video = this.videoRef?.nativeElement;
      if (video && !video.paused) video.pause();
      this.videoUrl.set(null);
      this.videoEnded.set(false);
      return;
    }

    this.waitSeconds.set(0);
    this.waitingForNext.set(false);

    this.isReprise.set(!!bloco.aTipoBlocoDesc?.includes('Rep'));

    if (sameBloco && this.videoUrl() && !epMudou) {
      if (this.videoEnded()) return;
      const video = this.videoRef?.nativeElement;
      if (video) {
        video.currentTime = this.seekSeconds();
        this.liveBase = this.seekSeconds();
        this.tuneInAt = Date.now();
      }
      return;
    }

    const sameProgram = this.currentBloco()?.aPrograma?.aId === bloco.aPrograma?.aId;
    if (sameProgram && this.videoUrl() && slotIdx > 0 && !epMudou) {
      const video = this.videoRef?.nativeElement;
      if (video) {
        video.currentTime = this.seekSeconds();
        this.liveBase = this.seekSeconds();
        this.tuneInAt = Date.now();
      }
      return;
    }

    if (bloco.aPrograma) {
      if (this._endedProgramId === bloco.aPrograma.aId && !epMudou) return;
      this.loadVideo(bloco.aPrograma.aId, dia);
    }
  }

  /**
   * Episódio que este bloco deve exibir na página vigente: o da grade
   * (episodioPagina0) com o fallback do índice por dia, igual ao cálculo
   * que alimenta o texto na tela.
   */
  private episodioAlvo(bloco: BlocoOutput, dia: string): EpisodioInfo | null {
    const ep = this.episodioPagina0(bloco, this.dias.indexOf(dia));
    if (ep) return ep;
    const eps = bloco.aPrograma ? this.allEpisodiosMap.get(bloco.aPrograma.aId) : null;
    if (eps && eps.length > 0) return eps[this.getEpisodeIndex(bloco, dia) % eps.length];
    return null;
  }

  private loadProgramaDetalhe(programaId: number): void {
    if (programaId === this.lastDetalheProgramaId) return;
    this.lastDetalheProgramaId = programaId;
    const cached = this.programaCache.get(programaId);
    if (cached) {
      this.programaDetalhe.set(cached);
      return;
    }
    this.programaDetalhe.set(null);
    this.programaErro.set(false);
    this.tvService.getPrograma(programaId).subscribe({
      next: (d) => {
        this.programaCache.set(programaId, d);
        if (this.lastDetalheProgramaId === programaId) this.programaDetalhe.set(d);
      },
      error: () => {
        if (this.lastDetalheProgramaId === programaId) {
          this.programaDetalhe.set(null);
          this.programaErro.set(true);
        }
      },
    });
  }

  private loadVideo(programaId: number, dia: string): void {
    const bloco = this.currentBloco();
    if (!bloco) return;
    const diaIdx = this.dias.indexOf(dia);
    const flatEp = this.episodioPagina0(bloco, diaIdx);
    let ep: EpisodioInfo | null = flatEp;
    if (!ep) {
      const eps = this.allEpisodiosMap.get(programaId);
      if (!eps || eps.length === 0) return;
      const epIdx = this.getEpisodeIndex(bloco, dia);
      ep = eps[epIdx % eps.length];
    }
    if (!ep) return;

    this._videoEpId = ep.aId;
    this.videoUrl.set(null);

    this.playerService.getEpisodio(ep.aId).subscribe({
      next: (fullEp) => {
        if (fullEp.aArquivo) {
          this._suppressAutoPlay = false;
          this._endedProgramId = null;
          // Trocou de episódio/página: o novo vídeo tem que tocar mesmo que o
          // anterior tivesse terminado (onVideoLoaded pausa se videoEnded).
          this.videoEnded.set(false);
          this.videoUrl.set(this.playerService.streamUrl(fullEp.aArquivo.aId));
        }
      },
      error: () => {
        setTimeout(() => this.loadVideo(programaId, dia), 3000);
      },
    });
  }

  private episodioPagina0(bloco: BlocoOutput, diaIdx: number, pagina?: number): EpisodioInfo | null {
    const programmaId = bloco.aPrograma?.aId;
    if (!programmaId) return null;
    const eps = this.allEpisodiosMap.get(programmaId);
    if (!eps || eps.length === 0) return null;
    const diaName = this.dias[diaIdx];
    const pag = pagina ?? this.paginaAlvo();

    if (this.isBokuWeekend18Horario(bloco)) {
      const flat = this.getFlatEpisodes(this.bokuOrder);
      if (flat.length===0) return null;
      const wk = this.blocos.filter(b=> b.aStatusCode==='AT' && this.bokuOrder.includes(b.aPrograma?.aId ?? -1) && this.normalizeDia(b.aDiaSemanaDesc??'')===this.normalizeDia(diaName)).sort((a,b)=>(a.aHorario??'').localeCompare(b.aHorario??''));
      const numSlots = wk.length || 4;
      const slotOffset = wk.findIndex(b=>b.aId===bloco.aId);
      if(slotOffset<0) return null;
      return flat[((pag*numSlots+slotOffset)%flat.length+flat.length)%flat.length];
    }
    if (this.isMedabots1130Horario(bloco)) {
      const flat=this.getFlatEpisodes(this.medabotsOrder); if(flat.length===0) return null; const diasQ=this.diasProgramaMap.get(47)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos<0) return null; return flat[((dayPos+pag*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length];
    }
    if (this.isDigimon1230Horario(bloco)) {
      const flat=this.getFlatEpisodes(this.digimonOrder); if(flat.length===0) return null; const diasQ=this.diasProgramaMap.get(22)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos<0) return null; return flat[((dayPos+pag*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length];
    }
    if (this.isBaki21Horario(bloco)) {
      const flat=this.getFlatEpisodes(this.bakiOrder); if(flat.length===0) return null; const diasQ=this.diasProgramaMap.get(9)??this.diasProgramaMap.get(10)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos<0) return null; return flat[((dayPos+pag*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length];
    }
    if (this.isAvatar11Horario(bloco)) {
      const flat=this.getFlatEpisodes(this.avatarOrder); if(flat.length===0) return null; const diasQ=this.diasProgramaMap.get(7)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos<0) return null; return flat[((dayPos+pag*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length];
    }
    if (this.isCavaleiros19Horario(bloco)) {
      const flat=this.getFlatEpisodes(this.cavaleirosOrder); if(flat.length===0) return null; const diasQ=this.diasProgramaMap.get(58)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos<0) return null; return flat[((dayPos+pag*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length];
    }
    if (this.isDragonBall18Horario(bloco)) {
      const flat=this.getFlatEpisodes(this.dragonBallOrder); if(flat.length===0) return null; const diasQ=this.diasProgramaMap.get(30)??[]; const dayPos=diasQ.indexOf(diaIdx); if(dayPos<0) return null; return flat[((dayPos+pag*this.EPISODES_PER_PAGE)%flat.length+flat.length)%flat.length];
    }

    if (this.isFimDeSemana(diaName)) {
      const weekendBlocos = this.blocos.filter(b =>
        b.aStatusCode === 'AT' && b.aPrograma?.aId === programmaId &&
        this.normalizeDia(b.aDiaSemanaDesc ?? '') === this.normalizeDia(diaName)
      ).sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
      const numSlots = weekendBlocos.length;
      if (numSlots === 0) return null;
      const slotOffset = weekendBlocos.findIndex(b => b.aId === bloco.aId);
      if (slotOffset < 0) return null;
      const pageOffset = pag * numSlots;
      const finalIdx = ((pageOffset + slotOffset) % eps.length + eps.length) % eps.length;
      return eps[finalIdx];
    }

    const diasQ = this.diasProgramaMap.get(programmaId) ?? [];
    const dayPos = diasQ.indexOf(diaIdx);
    if (dayPos < 0) return null;
    const slip = this.contarDeslocamentosAntes(programmaId, pag, diaIdx);
    return eps[(((dayPos + pag * this.EPISODES_PER_PAGE - slip) % eps.length) + eps.length) % eps.length];
  }

  private getEpisodeIndex(bloco: BlocoOutput, dia: string): number {
    const programaId = bloco.aPrograma?.aId;
    if (!programaId) return 0;
    const eps = this.allEpisodiosMap.get(programaId);
    if (!eps || eps.length === 0) return 0;
    const ep = this.episodioPagina0(bloco, this.dias.indexOf(dia));
    if (!ep) return 0;
    const idx = eps.indexOf(ep);
    return idx >= 0 ? idx : 0;
  }

  private blocoEfetivoAgora(dia: string, agoraHHMM: string): BlocoOutput | null {
    const diaIdx = this.dias.indexOf(dia);
    const occ = new Map<string, BlocoOutput[]>();
    for (const b of this.blocos) {
      if (b.aStatusCode !== 'AT' || !b.aDiaSemanaDesc || !b.aHorario) continue;
      if (this.normalizeDia(b.aDiaSemanaDesc) !== this.normalizeDia(dia)) continue;
      const t = b.aHorario.substring(0, 5);
      if (!occ.has(t)) occ.set(t, []);
      occ.get(t)!.push(b);
    }
    for (const t of [...occ.keys()].sort((a, b) => a.localeCompare(b))) {
      for (const bloco of [...(occ.get(t) ?? [])]) {
        if (!bloco.aPrograma || bloco.aHorario?.substring(0, 5) !== t) continue;
        const ep = this.episodioPagina0(bloco, diaIdx);
        if (!ep || !ep.aDuracao || this.parseDurationSec(ep.aDuracao) <= 30 * 60) continue;
        const need = Math.ceil(this.parseDurationSec(ep.aDuracao) / (30 * 60));
        for (let s = 1; s < need; s++) {
          const ct = this.addTime(t, s * 30);
          if (ct <= t) continue;
          if (!occ.has(ct)) occ.set(ct, []);
          occ.set(ct, (occ.get(ct) ?? []).filter(x => x.aHorario?.substring(0, 5) !== ct));
          if (!occ.get(ct)!.some(x => x.aId === bloco.aId)) occ.get(ct)!.push(bloco);
        }
      }
    }
    const slot = [...occ.keys()].filter(t => t <= agoraHHMM).sort((a, b) => a.localeCompare(b)).pop();
    if (!slot) return null;
    const list = occ.get(slot) ?? [];
    return list.length > 0 ? list[0] : null;
  }

  private getExpandedSlotsForBloco(bloco: BlocoOutput, diaIdx: number): string[] {
    const slots: string[] = [];
    if (!bloco.aHorario) return slots;
    slots.push(bloco.aHorario.substring(0, 5));
    const ep = this.episodioPagina0(bloco, diaIdx);
    if (!ep || !ep.aDuracao) return slots;
    const sec = this.parseDurationSec(ep.aDuracao);
    if (sec <= 30 * 60) return slots;
    const need = Math.ceil(sec / (30 * 60));
    const t = bloco.aHorario.substring(0, 5);
    for (let s = 1; s < need; s++) {
      slots.push(this.addTime(t, s * 30));
    }
    return slots;
  }

  onVideoLoaded(): void {
    const video = this.videoRef?.nativeElement;
    if (video) {
      if (this._suppressAutoPlay || this.videoEnded()) {
        video.pause();
        return;
      }
      this.videoEnded.set(false);
      this.suppressSeekGuard = true;
      const offset = this.initialSeekOffset;
      this.initialSeekOffset = 0;
      const seekPos = offset > 0 ? offset : this.seekSeconds();
      this.liveBase = seekPos;
      this.tuneInAt = Date.now();
      video.currentTime = seekPos;
      video.muted = this.isMuted();
      video.volume = this.volume();
      const playPromise = video.play();
      if (playPromise) {
        playPromise.catch(() => {
          video.muted = true;
          this.isMuted.set(true);
          video.play().catch(() => {});
        });
      }
      setTimeout(() => (this.suppressSeekGuard = false), 500);
    }
  }

  private liveEdge(): number {
    const video = this.videoRef?.nativeElement;
    const elapsed = (Date.now() - this.tuneInAt) / 1000;
    let edge = this.liveBase + Math.max(0, elapsed);
    if (video && isFinite(video.duration) && video.duration > 0) {
      edge = Math.min(edge, video.duration);
    }
    return Math.max(0, edge);
  }

  onSeeking(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || this.suppressSeekGuard || !this.tuneInAt) return;
    const edge = this.liveEdge();
    if (Math.abs(video.currentTime - edge) > 2) {
      this.suppressSeekGuard = true;
      try {
        video.currentTime = edge;
      } catch {}
      setTimeout(() => (this.suppressSeekGuard = false), 400);
    }
  }

  onPlayState(playing: boolean): void {
    this.isPlaying.set(playing);
    if (playing) {
      const video = this.videoRef?.nativeElement;
      if (video && this.tuneInAt && !this.suppressSeekGuard) {
        const edge = this.liveEdge();
        if (edge - video.currentTime > 2) {
          this.suppressSeekGuard = true;
          try {
            video.currentTime = edge;
          } catch {}
          setTimeout(() => (this.suppressSeekGuard = false), 400);
        }
      }
    }
  }

  onPauseBlocked(): void {
    if (this.videoEnded() || this._suppressAutoPlay) return;
    this.isPlaying.set(true);
    const video = this.videoRef?.nativeElement;
    if (video && video.paused) {
      video.play().catch(() => {});
    }
  }

  onVideoEnded(): void {
    this.videoEnded.set(true);
    this.isPlaying.set(false);
    this._suppressAutoPlay = true;
    this._endedProgramId = this.currentBloco()?.aPrograma?.aId ?? null;
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
    }
  }

  get freeCountdownSec(): number {
    const now = this.currentTime();
    const intoSlot = (now.getMinutes() % 30) * 60 + now.getSeconds();
    return Math.max(0, 30 * 60 - intoSlot);
  }

  togglePlay(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || video.ended) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  toggleMute(): void {
    const video = this.videoRef?.nativeElement;
    const muted = !this.isMuted();
    this.isMuted.set(muted);
    if (video) video.muted = muted;
  }

  onVolumeInput(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.volume.set(value);
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.volume = value;
      if (value > 0 && this.isMuted()) {
        this.isMuted.set(false);
        video.muted = false;
      }
    }
  }

  toggleFullscreen(): void {
    const el = this.wrapRef?.nativeElement;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  }

  get liveElapsed(): number {
    const bloco = this.currentBloco();
    if (!bloco?.aHorario) return 0;
    const now = this.currentTime();
    const [bh, bm] = bloco.aHorario.substring(0, 5).split(':').map(Number);
    return Math.max(0, now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() - (bh * 3600 + bm * 60));
  }

  get nowTimeFormatted(): string {
    const now = this.currentTime();
    return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
  }

  get currentGradeName(): string {
    return this.currentBloco()?.aGrade?.aNome ?? '';
  }

  get liveDisplayPrograma(): { aId: number; aNome: string } | null {
    const bloco = this.currentBloco();
    if (!bloco) return null;
    return this.getDisplayProgramaForLive(bloco, this.effectiveDayIdx());
  }
  get liveDisplayNome(): string {
    return this.liveDisplayPrograma?.aNome ?? this.currentBloco()?.aPrograma?.aNome ?? '';
  }
  get capaUrl(): string | null {
    const displayId = this.liveDisplayPrograma?.aId ?? this.programaDetalhe()?.aId;
    if (displayId) return this.tvService.getProgramaCapaUrl(displayId);
    if (this.programaDetalhe()?.aId) return this.tvService.getProgramaCapaUrl(this.programaDetalhe()!.aId);
    return this.tvService.getProgramaCapaUrl(this.currentBloco()?.aPrograma?.aId);
  }

  get channelNumber(): string {
    const bloco = this.currentBloco();
    if (!bloco?.aHorario) return '--';
    const dia = this.diaAlvo().dia;
    const list = this.blocos
      .filter(b => b.aDiaSemanaDesc === dia && b.aHorario)
      .sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
    const idx = list.findIndex(b => b.aId === bloco.aId);
    return (idx >= 0 ? idx + 1 : 1).toString().padStart(2, '0');
  }

  get currentFaixa(): string {
    const h = this.currentTime().getHours();
    if (h < 6) return 'Madrugada';
    if (h < 12) return 'Manhã';
    if (h < 18) return 'Tarde';
    if (h < 22) return 'Noite';
    return 'Prime Time';
  }

  classificacaoBadgeClass(desc: string | null | undefined): string {
    if (!desc) return 'bg-gray-600 text-white';
    if (desc.includes('18') || desc.includes('MA')) return 'bg-black text-white border border-red-600';
    if (desc.includes('16')) return 'bg-red-600 text-white';
    if (desc.includes('14')) return 'bg-orange-500 text-white';
    if (desc.includes('12')) return 'bg-yellow-400 text-black';
    if (desc.includes('10') || desc.includes('Y7')) return 'bg-blue-500 text-white';
    return 'bg-green-600 text-white';
  }

  formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  get upcomingBlocos(): BlocoOutput[] {
    const limite = this.listCapacity();
    const alvo = this.diaAlvo();
    const dayIdx = alvo.diaIdx;
    const relogio = this.nowTimeFormatted.substring(0, 5);
    const currentTime = this.linhaService.slot() ?? relogio;
    const gradeId = this.currentBloco()?.aGrade?.aId;

    // Percorre os dias em ordem cronológica (hoje → amanhã → …), sempre de
    // dentro do dia para fora. Assim 20:30, 21:00 … 23:30 vêm antes de 00:00
    // do dia seguinte — um sort() por string os jogaria para o fim e o slice
    // os descartaria, mostrando 00:00…05:00 no lugar do restante de hoje.
    const result: BlocoOutput[] = [];
    for (let offset = 0; offset < 7 && result.length < limite; offset++) {
      const dia = this.dias[(dayIdx + offset) % 7];
      const doDia = this.blocos
        .filter(b =>
          b.aDiaSemanaDesc === dia &&
          b.aHorario &&
          (offset > 0 || b.aHorario.substring(0, 5) >= currentTime) &&
          (!gradeId || b.aGrade?.aId === gradeId)
        )
        .sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
      for (const b of doDia) {
        if (result.length >= limite) break;
        result.push(b);
      }
    }
    return result;
  }

  get nextBloco(): BlocoOutput | null {
    const cur = this.currentBloco();
    if (!cur) return null;

    const curHorario = cur.aHorario?.substring(0, 5);
    if (!curHorario) return null;

    const dia = cur.aDiaSemanaDesc;
    if (!dia) return null;
    const diaIdx = this.dias.indexOf(dia);
    const ep = this.episodioPagina0(cur, diaIdx);

    let endHorario = curHorario;
    if (ep && ep.aDuracao) {
      const epSec = this.parseDurationSec(ep.aDuracao);
      const slotsNeeded = Math.ceil(epSec / (30 * 60));
      endHorario = this.addTime(curHorario, slotsNeeded * 30);
    }

    const gradeId = cur.aGrade?.aId;

    const candidates = this.blocos.filter(b =>
      b.aDiaSemanaDesc === dia &&
      b.aHorario &&
      b.aHorario.substring(0, 5) >= endHorario &&
      (!gradeId || b.aGrade?.aId === gradeId)
    );

    return candidates.sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''))[0] ?? null;
  }
}
