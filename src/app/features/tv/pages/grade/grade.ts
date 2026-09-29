import { Component, signal, computed, inject, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TvService, GradeOutput, BlocoOutput, ProgramaOutput } from '../../services/tv.service';
import { LinhaVermelhaService } from '../../services/linha-vermelha.service';
import { ServerTimeService } from '../../../../core/services/server-time.service';
import { environment } from '../../../../../environments/environment';

interface EpisodioInfo {
  aId: number;
  aNumero: number | null;
  aTemporada: number | null;
  aParte: number | null;
  aTitulo: string | null;
  aDuracao: string | null;
  aCapaUrl: string | null;
}

@Component({
  selector: 'app-grade',
  imports: [RouterLink, FormsModule],
  templateUrl: './grade.html',
  styleUrl: './grade.css',
})
export class Grade implements OnInit, OnDestroy {

  readonly tvService = inject(TvService);
  readonly linhaService = inject(LinhaVermelhaService);
  readonly serverTime = inject(ServerTimeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private pendingPage = 0;
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);
  private _linhaSub: any;

  private nowDate(): Date {
    return this.serverTime.ready() ? this.serverTime.now() : new Date();
  }

  readonly grades = signal<GradeOutput[]>([]);
  readonly blocos = signal<BlocoOutput[]>([]);
  readonly loading = signal(true);
  readonly selectedGradeId = signal<number | null>(null);

  private _timerInterval: any;
  readonly currentTime = signal(this.nowDate());

  readonly dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
  readonly diasAbrev = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];

  private readonly cavaleirosOrder = [58, 56, 57, 55, 63, 61, 60, 59];
  private isCavaleiros19Horario(bloco: BlocoOutput): boolean {
    return bloco.aHorario?.substring(0, 5) === '19:00' && this.cavaleirosOrder.includes(bloco.aPrograma?.aId ?? -1);
  }
  private getCavaleirosFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.cavaleirosOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private readonly dragonBallOrder = [30, 34, 32, 33, 82, 31];
  private isDragonBall18Horario(bloco: BlocoOutput): boolean {
    return bloco.aHorario?.substring(0, 5) === '18:00' && this.dragonBallOrder.includes(bloco.aPrograma?.aId ?? -1);
  }
  private getDragonBallFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.dragonBallOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private readonly avatarOrder = [7, 8];
  private isAvatar11Horario(bloco: BlocoOutput): boolean {
    return bloco.aHorario?.substring(0, 5) === '11:00' && this.avatarOrder.includes(bloco.aPrograma?.aId ?? -1);
  }
  private getAvatarFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.avatarOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private readonly bakiOrder = [10, 9];
  private isBaki21Horario(bloco: BlocoOutput): boolean {
    return bloco.aHorario?.substring(0, 5) === '21:00' && this.bakiOrder.includes(bloco.aPrograma?.aId ?? -1);
  }
  private getBakiFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.bakiOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private readonly digimonOrder = [22, 26, 23, 25, 28, 27, 24];
  private isDigimon1230Horario(bloco: BlocoOutput): boolean {
    return bloco.aHorario?.substring(0, 5) === '12:30' && this.digimonOrder.includes(bloco.aPrograma?.aId ?? -1);
  }
  private getDigimonFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.digimonOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private readonly medabotsOrder = [47, 48];
  private isMedabots1130Horario(bloco: BlocoOutput): boolean {
    return bloco.aHorario?.substring(0, 5) === '11:30' && this.medabotsOrder.includes(bloco.aPrograma?.aId ?? -1);
  }
  private getMedabotsFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.medabotsOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private readonly bokuOrder = [13, 14];
  private isBokuWeekend18Horario(bloco: BlocoOutput): boolean {
    const h = bloco.aHorario?.substring(0, 5);
    return (h === '18:00' || h === '18:30') && this.bokuOrder.includes(bloco.aPrograma?.aId ?? -1) && this.isFimDeSemana(bloco.aDiaSemanaDesc ?? '');
  }
  private getBokuFlatEpisodes(): EpisodioInfo[] {
    const flat: EpisodioInfo[] = [];
    for (const pid of this.bokuOrder) {
      const eps = this.allEpisodiosMap.get(pid);
      if (eps) flat.push(...eps);
    }
    return flat;
  }
  private isWeekendBloco(bloco: BlocoOutput): boolean {
    return this.isFimDeSemana(bloco.aDiaSemanaDesc ?? '');
  }
  private isAnyFlatHorario(bloco: BlocoOutput): boolean {
    return this.isCavaleiros19Horario(bloco) || this.isDragonBall18Horario(bloco) || this.isAvatar11Horario(bloco) || this.isBaki21Horario(bloco) || this.isDigimon1230Horario(bloco) || this.isMedabots1130Horario(bloco) || this.isBokuWeekend18Horario(bloco) || this.isWeekendBloco(bloco);
  }
  getDisplayPrograma(bloco: BlocoOutput, dia: string): { aId: number; aNome: string } | null {
    if (this.isBokuWeekend18Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getBokuFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const wk = this.weekendBlocosFor(bloco.aPrograma!.aId, diaIdx);
      const numSlots = wk.length || 4;
      const slotOffset = wk.findIndex(b => b.aId === bloco.aId);
      if (slotOffset < 0) return bloco.aPrograma as any;
      const idx = ((this.currentPage() * numSlots + slotOffset) % flat.length + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.bokuOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 13: 'Buko no Hero', 14: 'Buko no Hero - Illegals - Legendado' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    if (this.isMedabots1130Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getMedabotsFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const diasQ = this.diasProgramaMap.get(47) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return bloco.aPrograma as any;
      const pag = this.currentPage();
      const idx = (((dayPos + pag * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.medabotsOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 47: 'Medabots', 48: 'Medabots - Spirits' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    if (this.isDigimon1230Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getDigimonFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const diasQ = this.diasProgramaMap.get(22) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return bloco.aPrograma as any;
      const pag = this.currentPage();
      const idx = (((dayPos + pag * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.digimonOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 22: 'Digimon - Adventure', 26: 'Digimon - Tamers', 23: 'Digimon - Frontier', 25: 'Digimon - Savers', 28: 'Digimon - Xros Wars - Legendado', 27: 'Digimon - Universe - Appli Monsters - Legendado', 24: 'Digimon - Ghost Game - Legendado' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    if (this.isBaki21Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getBakiFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const diasQ = this.diasProgramaMap.get(9) ?? this.diasProgramaMap.get(10) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return bloco.aPrograma as any;
      const pag = this.currentPage();
      const idx = (((dayPos + pag * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.bakiOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 10: 'Baki - O Campeão', 9: 'Baki - Hanma' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    if (this.isAvatar11Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getAvatarFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const diasQ = this.diasProgramaMap.get(7) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return bloco.aPrograma as any;
      const pag = this.currentPage();
      const idx = (((dayPos + pag * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.avatarOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 7: 'Avatar - Aang', 8: 'Avatar - Korra' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    if (this.isCavaleiros19Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getCavaleirosFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const diasQ = this.diasProgramaMap.get(58) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return bloco.aPrograma as any;
      const pag = this.currentPage();
      const idx = (((dayPos + pag * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.cavaleirosOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 58: 'Os Cavaleiros do Zodíaco - Guerra Galática', 56: 'Os Cavaleiros do Zodíaco - Cavaleiros de Prata', 57: 'Os Cavaleiros do Zodíaco - Doze Casas', 55: 'Os Cavaleiros do Zodíaco - Asgard', 63: 'Os Cavaleiros do Zodíaco - Poseidon', 61: 'Os Cavaleiros do Zodíaco - Hades - Santuário', 60: 'Os Cavaleiros do Zodíaco - Hades - Inferno', 59: 'Os Cavaleiros do Zodíaco - Hades - Elísio' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    if (this.isDragonBall18Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      const flat = this.getDragonBallFlatEpisodes();
      if (flat.length === 0) return bloco.aPrograma as any;
      const diasQ = this.diasProgramaMap.get(30) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return bloco.aPrograma as any;
      const pag = this.currentPage();
      const idx = (((dayPos + pag * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      const ep = flat[idx];
      for (const pid of this.dragonBallOrder) {
        const eps = this.allEpisodiosMap.get(pid);
        if (eps && eps.includes(ep)) {
          const prog = this.blocos().find((b: BlocoOutput) => b.aPrograma?.aId === pid)?.aPrograma;
          if (prog) return prog as any;
          const names: Record<number, string> = { 30: 'Dragon Ball', 34: 'Dragon Ball Z', 32: 'Dragon Ball GT', 33: 'Dragon Ball Super', 82: 'Super Dragon Ball Heroes - Legendado', 31: 'Dragon Ball Daima - Legandado' };
          return { aId: pid, aNome: names[pid] ?? bloco.aPrograma!.aNome } as any;
        }
      }
      return bloco.aPrograma as any;
    }
    return bloco.aPrograma as any;
  }

  readonly faixaRanges: { nome: string; inicio: string; icon: string }[] = [
    { nome: 'Madrugada', inicio: '00:00', icon: '🌙' },
    { nome: 'Manhã', inicio: '06:00', icon: '☀️' },
    { nome: 'Tarde', inicio: '12:00', icon: '🌤' },
    { nome: 'Noite', inicio: '18:00', icon: '🌃' },
    { nome: 'Prime Time', inicio: '22:00', icon: '⭐' },
  ];

  horarios: string[] = [];

  private allEpisodiosMap = new Map<number, EpisodioInfo[]>();
  private diasProgramaMap = new Map<number, number[]>();
  private effectiveSchedule = new Map<string, BlocoOutput[]>();
  private consumedSlots = new Set<string>();
  private displacedOriginalDay = new Map<number, number>();
  private programaRemovedDias = new Map<number, number[]>();
  private slotPositionMap = new Map<string, number>();
  private episodioCache = new Map<number, EpisodioInfo | null>();
  private sameDayBlocosCache = new Map<string, BlocoOutput[]>();
  private weekendBlocosCache = new Map<number, BlocoOutput[]>();
  private displacedEpisodeShift = new Map<number, number>();
  private deslocamentos: { programaId: number; pagina: number; dia: number }[] = [];

  readonly modalOpen = signal(false);
  readonly modalDia = signal('');
  readonly modalHorario = signal('');
  readonly modalGradeId = signal<number | null>(null);
  readonly modalTipoCode = signal('IN');
  readonly modalProgramaSearch = signal('');
  readonly modalProgramas = signal<ProgramaOutput[]>([]);
  readonly modalSelectedPrograma = signal<ProgramaOutput | null>(null);
  readonly modalSaving = signal(false);
  readonly modalEpisodios = signal<{ aId: number; aNumero: number | null; aTemporada: number | null; aParte: number | null; aTitulo: string | null }[]>([]);
  readonly modalSelectedEpisodio = signal<{ aId: number; aNumero: number | null; aTemporada: number | null; aParte: number | null; aTitulo: string | null } | null>(null);

  readonly detailOpen = signal(false);
  readonly detailBloco = signal<BlocoOutput | null>(null);
  readonly detailEpisodio = signal<EpisodioInfo | null>(null);
  readonly detailDia = signal('');
  readonly detailHorario = signal('');
  readonly detailDeleting = signal(false);

  readonly currentPage = signal(0);
  readonly EPISODES_PER_PAGE = 5;

  /** Avanço de episódios por página no caminho genérico: um ciclo semanal
   *  completo do programa (nº de dias em que ele passa). O valor fixo 5 só
   *  vale para programas de seg–sex; programas diários (7 dias) ou com
   *  menos dias repetiam/pulavam episódios e ganhavam badge de Reprise
   *  falso a partir da página 2. */
  private pageStep(programaId: number): number {
    const dq = this.diasProgramaMap.get(programaId);
    return dq && dq.length > 0 ? dq.length : this.EPISODES_PER_PAGE;
  }
  readonly totalPages = signal(1);
  readonly pageLabels: string[] = [];
  @ViewChild('pagScroll') private pagScroll?: ElementRef<HTMLDivElement>;
  private static readonly ROLLOVER_KEY = 'grade-last-rollover';

  readonly diasCodigo: Record<string, string> = {
    'Segunda-feira': 'SE', 'Terça-feira': 'TE', 'Quarta-feira': 'QA',
    'Quinta-feira': 'QI', 'Sexta-feira': 'SX', 'Sábado': 'SA', 'Domingo': 'DO',
  };

  readonly tiposBloco = [
    { code: 'IN', desc: 'Inédito' },
    { code: 'RE', desc: 'Reprise' },
    { code: 'MA', desc: 'Maratona' },
    { code: 'ES', desc: 'Especial' },
  ];

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap.get('page');
    const parsed = qp !== null ? parseInt(qp, 10) : NaN;
    // Sem ?page explícito, a grade abre na página da linha vermelha (a mesma
    // que o "ao vivo" está exibindo) para os dois nunca divergirem.
    this.pendingPage = !isNaN(parsed) && parsed > 0 ? parsed : this.linhaService.pagina();
    this._timerInterval = setInterval(() => {
      this.currentTime.set(this.nowDate());
      this.maybeRolloverPage();
    }, 1000);
    this._linhaSub = this.linhaService.mudanca$.subscribe(() => {
      const serviceSlot = this.linhaService.slot();
      if (this.nowLineOverride() !== null && this.nowLineOverride() !== serviceSlot) {
        this.nowLineOverride.set(null);
      }
      // Mudança vinda de fora (outra aba/dispositivo): a grade acompanha a
      // página da linha para não divergir do "ao vivo". As trocas feitas por
      // esta própria grade não emitem mudanca$, então não há ciclo.
      const pag = this.linhaService.pagina();
      if (this.totalPages() > 0 && pag >= 0 && pag < this.totalPages() && pag !== this.currentPage()) {
        this.goToPage(pag);
      }
      setTimeout(() => this.cdr.detectChanges());
    });
    this.tvService.listGrades(0, 100).subscribe({
      next: (res) => {
        this.grades.set(res.aGrades);
        this.loadBlocos();
      },
      error: () => {
        this.grades.set([]);
        this.loadBlocos();
      },
    });
  }

  ngOnDestroy(): void {
    if (this._timerInterval) clearInterval(this._timerInterval);
    if (this._linhaSub) this._linhaSub.unsubscribe();
  }

  loadBlocos(): void {
    this.loading.set(true);
    this.tvService.listBlocos(0, 400).subscribe({
      next: (res) => {
        this.blocos.set(res.aBlocos);
        this.computeHorarios(res.aBlocos);
        this.loadEpisodios(res.aBlocos);
      },
      error: () => {
        this.blocos.set([]);
        this.loading.set(false);
      },
    });
  }

  private computeHorarios(blocos: BlocoOutput[]): void {
    const times = new Set<string>();
    for (const b of blocos) {
      if (b.aHorario) {
        const h = b.aHorario.substring(0, 5);
        times.add(h);
      }
    }
    this.horarios = [...times].sort((a, b) => a.localeCompare(b));
  }

  private parseDuracaoSec(duracao: string | null): number {
    if (!duracao) return 0;
    const p = duracao.split(':');
    if (p.length !== 3) return 0;
    return (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
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

  /** Episódio exibido numa célula de horário "flat" (Cavaleiros 19:00,
   *  DB 18:00, Avatar 11:00, Baki 21:00, Digimon 12:30, Medabots 11:30)
   *  calculado para uma PÁGINA EXPLícITA. Espelha as fórmulas do
   *  getEpisodioRaw (que usa this.currentPage()), porque o cascata de
   *  deslocamentos precisa simular todas as páginas 0..currentPage. */
  private episodioFlatParaPagina(bloco: BlocoOutput, diaIdx: number, pagina: number): EpisodioInfo | null {
    if (this.isWeekendBloco(bloco)) return null;
    let flat: EpisodioInfo[] = [];
    let pidRef = -1;
    if (this.isDigimon1230Horario(bloco)) { flat = this.getDigimonFlatEpisodes(); pidRef = 22; }
    else if (this.isCavaleiros19Horario(bloco)) { flat = this.getCavaleirosFlatEpisodes(); pidRef = 58; }
    else if (this.isDragonBall18Horario(bloco)) { flat = this.getDragonBallFlatEpisodes(); pidRef = 30; }
    else if (this.isAvatar11Horario(bloco)) { flat = this.getAvatarFlatEpisodes(); pidRef = 7; }
    else if (this.isBaki21Horario(bloco)) { flat = this.getBakiFlatEpisodes(); pidRef = 9; }
    else if (this.isMedabots1130Horario(bloco)) { flat = this.getMedabotsFlatEpisodes(); pidRef = 47; }
    else return null;
    if (flat.length === 0) return null;
    const diasQ = pidRef === 9
      ? (this.diasProgramaMap.get(9) ?? this.diasProgramaMap.get(10) ?? [])
      : (this.diasProgramaMap.get(pidRef) ?? []);
    const dayPos = diasQ.indexOf(diaIdx);
    if (dayPos < 0) return null;
    const idx = (((dayPos + pagina * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
    return flat[idx];
  }

  private computeSlipCascade(): void {
    this.deslocamentos = [];
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const dbSchedule = new Map<string, BlocoOutput[]>();
    for (const b of this.filteredBlocos) {
      const dIdx = diasIndice.get(b.aDiaSemanaDesc ?? '') ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc ?? '')) ?? -1;
      if (dIdx < 0 || !b.aHorario) continue;
      const key = `${dIdx}|${b.aHorario.substring(0, 5)}`;
      if (!dbSchedule.has(key)) dbSchedule.set(key, []);
      dbSchedule.get(key)!.push(b);
    }
    const sortedHorarios = [...this.horarios].sort((a, b) => a.localeCompare(b));
    const slipRun = new Map<number, number>();
    const contados = new Set<string>();
    for (let p = 0; p <= this.currentPage(); p++) {
      // Reset slipRun a cada página para evitar acúmulo acumulado
      slipRun.clear();
      for (let d = 0; d < 7; d++) {
        for (const t of sortedHorarios) {
          const cellBlocos = dbSchedule.get(`${d}|${t}`);
          if (!cellBlocos) continue;
          for (const bloco of cellBlocos) {
            if (!bloco.aPrograma || bloco.aPrograma.aId === 35) continue;
            // Fim de semana nunca espalha. Horários flat de segunda a sexta
            // espalham sim: o episódio deles vem da lista flat, já para a
            // página p que está sendo simulada (senão o deslocamento dos
            // programas ocupados por ele nunca seria registrado).
            if (this.isWeekendBloco(bloco)) continue;
            let ep: EpisodioInfo | null;
            if (this.isAnyFlatHorario(bloco)) {
              ep = this.episodioFlatParaPagina(bloco, d, p);
            } else {
              const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
              const diasQ = this.diasProgramaMap.get(bloco.aPrograma.aId);
              if (!eps || eps.length === 0 || !diasQ || diasQ.length === 0) continue;
              const dayPos = diasQ.indexOf(d);
              if (dayPos < 0) continue;
              const slip = slipRun.get(bloco.aPrograma.aId) ?? 0;
              const step = diasQ.length || this.EPISODES_PER_PAGE;
              const idx = (((dayPos + p * step - slip) % eps.length) + eps.length) % eps.length;
              ep = eps[idx];
            }
            if (!ep || !ep.aDuracao || this.parseDuracaoSec(ep.aDuracao) <= 30 * 60) continue;
            const need = Math.ceil(this.parseDuracaoSec(ep.aDuracao) / (30 * 60));
            for (let s = 1; s < need; s++) {
              const ct = this.addTime(t, s * 30);
              if (ct <= t) continue;
              const atSlot = dbSchedule.get(`${d}|${ct}`);
              if (!atSlot) continue;
              for (const disp of atSlot) {
                if (!disp.aPrograma || disp.aId === bloco.aId || disp.aPrograma.aId === 35) continue;
                const ck = `${p}|${d}|${disp.aId}`;
                if (contados.has(ck)) continue;
                contados.add(ck);
                this.deslocamentos.push({ programaId: disp.aPrograma.aId, pagina: p, dia: d });
                slipRun.set(disp.aPrograma.aId, (slipRun.get(disp.aPrograma.aId) ?? 0) + 1);
              }
            }
          }
        }
      }
    }
  }

  private computeBaseRemovedDias(): void {
    this.programaRemovedDias.clear();
    this.displacedOriginalDay.clear();
    this.computeSlipCascade();
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const dbSchedule = new Map<string, BlocoOutput[]>();
    for (const b of this.filteredBlocos) {
      const dIdx = diasIndice.get(b.aDiaSemanaDesc ?? '') ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc ?? '')) ?? -1;
      if (dIdx < 0 || !b.aHorario) continue;
      const key = `${dIdx}|${b.aHorario.substring(0, 5)}`;
      if (!dbSchedule.has(key)) dbSchedule.set(key, []);
      dbSchedule.get(key)!.push(b);
    }
    const sortedHorarios = [...this.horarios].sort((a, b) => a.localeCompare(b));
    for (let d = 0; d < 7; d++) {
      for (const t of sortedHorarios) {
        const key = `${d}|${t}`;
        const cellBlocos = dbSchedule.get(key);
        if (!cellBlocos) continue;
        for (const bloco of cellBlocos) {
          if (bloco.aPrograma?.aId === 35) continue;
          if (this.isWeekendBloco(bloco)) continue;
          const ep = this.isAnyFlatHorario(bloco)
            ? this.episodioFlatParaPagina(bloco, d, this.currentPage())
            : this.getEpisodioUncached(bloco);
          if (!ep || !ep.aDuracao) continue;
          if (this.parseDuracaoSec(ep.aDuracao) <= 30*60) continue;
          const slotsNeeded = Math.ceil(this.parseDuracaoSec(ep.aDuracao) / (30*60));
          for (let s=1; s<slotsNeeded; s++) {
            const consumedTime = this.addTime(t, s*30);
            const consumedKey = `${d}|${consumedTime}`;
            const dbAtSlot = dbSchedule.get(consumedKey);
            if (!dbAtSlot) continue;
            for (const displaced of dbAtSlot) {
              if (displaced.aId===bloco.aId) continue;
              if (displaced.aPrograma?.aId===35) continue;
              if (this.displacedOriginalDay.has(displaced.aId)) continue;
              this.displacedOriginalDay.set(displaced.aId, d);
              const pid = displaced.aPrograma!.aId;
              if (!this.programaRemovedDias.has(pid)) this.programaRemovedDias.set(pid, []);
              if (!this.programaRemovedDias.get(pid)!.includes(d)) this.programaRemovedDias.get(pid)!.push(d);
            }
          }
        }
      }
    }
  }

  private computeEffectiveSchedule(): void {
    this.effectiveSchedule.clear();
    this.consumedSlots.clear();
    this.slotPositionMap.clear();
    this.displacedEpisodeShift.clear();

    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));

    const dbSchedule = new Map<string, BlocoOutput[]>();
    for (const b of this.filteredBlocos) {
      const dIdx = diasIndice.get(b.aDiaSemanaDesc ?? '') ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc ?? '')) ?? -1;
      if (dIdx < 0 || !b.aHorario) continue;
      const key = `${dIdx}|${b.aHorario.substring(0, 5)}`;
      if (!dbSchedule.has(key)) dbSchedule.set(key, []);
      dbSchedule.get(key)!.push(b);
    }

    for (const [k, v] of dbSchedule) {
      this.effectiveSchedule.set(k, [...v]);
      this.slotPositionMap.set(k, 0);
    }

    const sortedHorarios = [...this.horarios].sort((a, b) => a.localeCompare(b));

    for (let d = 0; d < 7; d++) {
      for (const t of sortedHorarios) {
        const key = `${d}|${t}`;
        const cellBlocos = this.effectiveSchedule.get(key);
        if (!cellBlocos || cellBlocos.length === 0) continue;

        for (const bloco of [...cellBlocos]) {
          if (bloco.aPrograma?.aId === 35) continue;
          // Fim de semana nunca espalha (layout de 1 card por célula). Os
          // horários "flat" de segunda a sexta (Cavaleiros 19:00, DB 18:00,
          // Avatar 11:00, Baki 21:00, Digimon 12:30, Medabots 11:30) espalham
          // sim: o episódio exibido ali vem da lista flat (getEpisodioRaw),
          // então é ele que define a duração/quantidade de slots.
          if (this.isWeekendBloco(bloco)) continue;
          if (bloco.aHorario?.substring(0, 5) !== t) continue;
          const ep = this.isAnyFlatHorario(bloco)
            ? this.getEpisodioRaw(bloco, d)
            : this.getEpisodioUncached(bloco);
          if (!ep || !ep.aDuracao) continue;
          const epSec = this.parseDuracaoSec(ep.aDuracao);
          if (epSec <= 30 * 60) continue;

          const slotsNeeded = Math.ceil(epSec / (30 * 60));
          for (let s = 1; s < slotsNeeded; s++) {
            const consumedTime = this.addTime(t, s * 30);
            if (consumedTime <= t) continue;
            const consumedKey = `${d}|${consumedTime}`;
            this.consumedSlots.add(consumedKey);
            this.slotPositionMap.set(consumedKey, s);

            if (!this.effectiveSchedule.has(consumedKey)) {
              this.effectiveSchedule.set(consumedKey, []);
            }
            if (!this.effectiveSchedule.get(consumedKey)!.some(b => b.aId === bloco.aId)) {
              this.effectiveSchedule.get(consumedKey)!.push(bloco);
            }

            const dbAtSlot = dbSchedule.get(consumedKey);
            if (dbAtSlot) {
              for (const displaced of dbAtSlot) {
                if (displaced.aId === bloco.aId) continue;
                if (displaced.aPrograma?.aId === 35) continue;
                const curList = this.effectiveSchedule.get(consumedKey)!;
                const idx = curList.findIndex(b => b.aId === displaced.aId);
                if (idx >= 0) curList.splice(idx, 1);
              }
            }
          }
        }
      }
    }

    const consumedTimes = new Set<string>();
    for (const k of this.consumedSlots) {
      const time = k.split('|')[1];
      if (time) consumedTimes.add(time);
    }
    for (const ct of consumedTimes) {
      if (!this.horarios.includes(ct)) this.horarios.push(ct);
    }
    this.horarios.sort((a, b) => a.localeCompare(b));
  }

  private loadEpisodios(blocos: BlocoOutput[]): void {
    const baseIds = [...new Set(blocos.filter(b => b.aPrograma).map(b => b.aPrograma!.aId))];
    for (const pid of this.cavaleirosOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    for (const pid of this.dragonBallOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    for (const pid of this.avatarOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    for (const pid of this.bakiOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    for (const pid of this.digimonOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    for (const pid of this.medabotsOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    for (const pid of this.bokuOrder) if (!baseIds.includes(pid)) baseIds.push(pid);
    const programIds = baseIds;
    if (programIds.length === 0) {
      this.loading.set(false);
      return;
    }

    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));

    for (const pid of programIds) {
      const diasQuePassa = [...new Set(
        blocos
          .filter(b => b.aPrograma?.aId === pid && b.aDiaSemanaDesc)
          .map(b => diasIndice.get(b.aDiaSemanaDesc!) ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc!)) ?? -1)
      )      ].filter(d => d >= 0).sort((a, b) => a - b);
      this.diasProgramaMap.set(pid, diasQuePassa);
    }

    const maxEpisodesNeeded = 10000;
    this.tvService.listPrimeirosEpisodiosPorPrograma(programIds, maxEpisodesNeeded).subscribe({
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
            aDuracao: row.aDuracao ?? null,
            aCapaUrl: (row as any).aCapaUrl ?? null,
          });
        }

        let maxPages = 1;
        for (const [pid, eps] of grouped) {
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
          const weekendDias = diasQuePassa.filter(d => d === 5 || d === 6);
          let pageSize = this.EPISODES_PER_PAGE;
          if (weekendDias.length > 0) {
            const wkTotal = blocos.filter(b => {
              if (b.aPrograma?.aId !== pid) return false;
              const dn = this.normalizeDia(b.aDiaSemanaDesc ?? '');
              return dn === this.normalizeDia(this.dias[5]) || dn === this.normalizeDia(this.dias[6]);
            }).length;
            if (wkTotal > 0) pageSize = wkTotal;
          }
          const progPages = Math.max(1, Math.ceil(eps.length / pageSize));
          if (progPages > maxPages) maxPages = progPages;
        }
        // Sequências flat (Cavaleiros 19:00, Dragon Ball 18:00 e Avatar 11:00)
        const cavFlatLen = this.cavaleirosOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (cavFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(cavFlatLen / this.EPISODES_PER_PAGE));
        const dbFlatLen = this.dragonBallOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (dbFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(dbFlatLen / this.EPISODES_PER_PAGE));
        const avatarFlatLen = this.avatarOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (avatarFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(avatarFlatLen / this.EPISODES_PER_PAGE));
        const bakiFlatLen = this.bakiOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (bakiFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(bakiFlatLen / this.EPISODES_PER_PAGE));
        const digimonFlatLen = this.digimonOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (digimonFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(digimonFlatLen / this.EPISODES_PER_PAGE));
        const medabotsFlatLen = this.medabotsOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (medabotsFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(medabotsFlatLen / this.EPISODES_PER_PAGE));
        const bokuFlatLen = this.bokuOrder.reduce((acc, pid) => acc + (this.allEpisodiosMap.get(pid)?.length ?? 0), 0);
        if (bokuFlatLen > 0) maxPages = Math.max(maxPages, Math.ceil(bokuFlatLen / 4));

        this.totalPages.set(maxPages);
        const restored = Math.max(0, Math.min(this.pendingPage, maxPages - 1));
        if (restored > 0) this.currentPage.set(restored);
        this.linhaService.acompanharPagina(this.currentPage());
        this.pendingPage = 0;
        this.pageLabels.length = 0;
        for (let p = 0; p < maxPages; p++) {
          this.pageLabels.push(`Página ${p + 1}`);
        }

        this.computeBaseRemovedDias();
        this.buildSameDayBlocosCache();
        this.computeEffectiveSchedule();
        this.rebuildEpisodioCache();
        this.loading.set(false);
        this.maybeRolloverPage();
        // A barra de páginas só passa a existir depois do @if: espera um tick
        // para o ViewChild resolver e então centraliza o botão da página atual.
        setTimeout(() => this.focarBotaoPagina(this.currentPage()), 0);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.focarBotaoPagina(page);
    this.linhaService.acompanharPagina(page);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: page > 0 ? { page } : { page: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (this.allEpisodiosMap.size > 0) {
      this.computeBaseRemovedDias();
      this.computeEffectiveSchedule();
      this.rebuildEpisodioCache();
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  /** Rolagem garantida: em aba oculta o Chrome descarta a animação suave
   *  e o scrollLeft ficaria onde estava (a lista "não obedecia"). */
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

  private maybeRolloverPage(): void {
    if (this.loading() || this.totalPages() <= 1) return;
    const now = this.currentTime();
    const dayNum = this.serverTime.ready() ? this.serverTime.getDayOfWeek() : now.getDay();
    const dayIdx = dayNum === 0 ? 6 : dayNum - 1;
    if (dayIdx !== 0) return;
    if (now.getHours() !== 0 || now.getMinutes() >= 30) return;
    const weekKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    try {
      if (localStorage.getItem(Grade.ROLLOVER_KEY) === weekKey) return;
      localStorage.setItem(Grade.ROLLOVER_KEY, weekKey);
    } catch {
      /* sem persistência: segue mesmo assim */
    }
    this.goToPage((this.currentPage() + 1) % this.totalPages());
  }

  get filteredBlocos(): BlocoOutput[] {
    const gid = this.selectedGradeId();
    let list = this.blocos().filter(b => b.aStatusCode === 'AT');
    if (gid !== null) list = list.filter(b => b.aGrade?.aId === gid);
    return list;
  }

  selectBloco(bloco: BlocoOutput, dia: string, horario: string): void {
    this.detailBloco.set(bloco);
    this.detailEpisodio.set(this.getEpisodio(bloco, dia));
    this.detailDia.set(dia);
    this.detailHorario.set(horario);
    this.detailDeleting.set(false);
    this.detailOpen.set(true);
  }

  closeDetail(): void {
    this.detailOpen.set(false);
  }

  watchBloco(): void {
    const ep = this.detailEpisodio();
    const bloco = this.detailBloco();
    const clickedHorario = this.detailHorario();
    if (ep) {
      this.closeDetail();
      let seek: number | null = null;
      if (bloco?.aHorario && clickedHorario) {
        const [bh, bm] = bloco.aHorario.substring(0, 5).split(':').map(Number);
        const [ch, cm] = clickedHorario.substring(0, 5).split(':').map(Number);
        const blocoStartSec = bh * 3600 + bm * 60;
        const clickedSec = ch * 3600 + cm * 60;
        const elapsed = clickedSec - blocoStartSec;
        if (elapsed > 0) {
          seek = elapsed;
        }
      }
      const params: any = { episodio: ep.aId };
      if (seek !== null) params.seek = seek;
      this.router.navigate(['/player'], { queryParams: params });
    }
  }

  deleteBloco(): void {
    const bloco = this.detailBloco();
    if (!bloco) return;
    this.detailDeleting.set(true);
    this.tvService.deleteBloco(bloco.aId).subscribe({
      next: () => {
        this.closeDetail();
        this.loadBlocos();
      },
      error: () => {
        this.detailDeleting.set(false);
      },
    });
  }

  private buildSameDayBlocosCache(): void {
    this.sameDayBlocosCache.clear();
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const grouped = new Map<string, BlocoOutput[]>();
    for (const b of this.filteredBlocos) {
      if (!b.aPrograma || !b.aDiaSemanaDesc) continue;
      const dIdx = diasIndice.get(b.aDiaSemanaDesc) ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc)) ?? -1;
      if (dIdx < 0) continue;
      const key = `${b.aPrograma.aId}|${dIdx}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(b);
    }
    for (const [key, list] of grouped) {
      this.sameDayBlocosCache.set(key, list.sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? '')));
    }
    this.weekendBlocosCache.clear();
    const wkGrouped = new Map<number, BlocoOutput[]>();
    for (const b of this.filteredBlocos) {
      if (!b.aPrograma || !b.aDiaSemanaDesc) continue;
      const dIdx = diasIndice.get(b.aDiaSemanaDesc) ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc)) ?? -1;
      if (dIdx !== 5 && dIdx !== 6) continue;
      const pid = b.aPrograma.aId;
      if (!wkGrouped.has(pid)) wkGrouped.set(pid, []);
      wkGrouped.get(pid)!.push(b);
    }
    const dayOf = (b: BlocoOutput): number =>
      diasIndice.get(b.aDiaSemanaDesc ?? '') ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc ?? '')) ?? -1;
    for (const [pid, list] of wkGrouped) {
      list.sort((a, b) => dayOf(a) - dayOf(b) || (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
      this.weekendBlocosCache.set(pid, list);
    }
  }

  private areConsecutiveSlots(a: BlocoOutput, b: BlocoOutput): boolean {
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const aDay = diasIndice.get(a.aDiaSemanaDesc ?? '') ?? diasIndiceNorm.get(this.normalizeDia(a.aDiaSemanaDesc ?? '')) ?? -1;
    const bDay = diasIndice.get(b.aDiaSemanaDesc ?? '') ?? diasIndiceNorm.get(this.normalizeDia(b.aDiaSemanaDesc ?? '')) ?? -1;
    const aTime = a.aHorario?.substring(0, 5) ?? '';
    const bTime = b.aHorario?.substring(0, 5) ?? '';
    if (aDay === bDay) {
      const [ah, am] = aTime.split(':').map(Number);
      const [bh, bm] = bTime.split(':').map(Number);
      return (bh * 60 + bm) - (ah * 60 + am) === 30;
    }
    return aDay + 1 === bDay && aTime === '23:30' && bTime === '00:00';
  }

  private weekendBlocosFor(programaId: number, diaIdx: number): BlocoOutput[] {
    const wk = this.weekendBlocosCache.get(programaId);
    if (wk && wk.length > 0) return wk;
    const cacheKey = `${programaId}|${diaIdx}`;
    return this.sameDayBlocosCache.get(cacheKey) ?? [];
  }

  private rebuildEpisodioCache(): void {
    this.episodioCache.clear();
    for (const b of this.filteredBlocos) {
      this.episodioCache.set(b.aId, this.getEpisodioUncached(b));
    }
  }

  private getEpisodioUncached(bloco: BlocoOutput): EpisodioInfo | null {
    if (!bloco.aPrograma) return null;
    const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
    if (!eps || eps.length === 0) return null;
    const diasQuePassa = this.diasProgramaMap.get(bloco.aPrograma.aId);
    if (!diasQuePassa || diasQuePassa.length === 0) return null;

    const diaSemana = bloco.aDiaSemanaDesc ?? '';
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const diaIdx = diasIndice.get(diaSemana) ?? diasIndiceNorm.get(this.normalizeDia(diaSemana)) ?? -1;
    if (diaIdx < 0) return null;

    const dayPosition = diasQuePassa.indexOf(diaIdx);
    if (dayPosition < 0) return null;

    if (this.isFimDeSemana(this.dias[diaIdx])) {
      const programaId = bloco.aPrograma.aId;
      const sameDayBlocos = this.weekendBlocosFor(programaId, diaIdx);
      const numSlots = sameDayBlocos.length;
      if (numSlots === 0) return null;
      const slotOffset = sameDayBlocos.findIndex(b => b.aId === bloco.aId);
      if (slotOffset < 0) return null;
      const pageOffset = this.currentPage() * numSlots;
      const shift = bloco.aPrograma.aId === 13 ? 0 : (this.displacedEpisodeShift.get(bloco.aId) ?? 0);
      const finalIdx = (((pageOffset + slotOffset) - shift) % eps.length + eps.length) % eps.length;
      return eps[finalIdx];
    }

    const pageOffset = this.currentPage() * this.pageStep(bloco.aPrograma.aId);
    const globalIdx = dayPosition + pageOffset;
    if (this.displacedEpisodeShift.has(bloco.aId)) {
      const naturalIdx = ((globalIdx % eps.length) + eps.length) % eps.length;
      return eps[naturalIdx];
    }
    const slip = this.contarDeslocamentosAntes(bloco.aPrograma.aId, this.currentPage(), diaIdx);
    const finalIdx = (((globalIdx - slip) % eps.length) + eps.length) % eps.length;
    return eps[finalIdx];
  }

  private getEpisodioRaw(bloco: BlocoOutput, diaIdx: number): EpisodioInfo | null {
    if (this.isBokuWeekend18Horario(bloco)) {
      const flat = this.getBokuFlatEpisodes();
      if (flat.length === 0) return null;
      const wk = this.weekendBlocosFor(bloco.aPrograma!.aId, diaIdx);
      const numSlots = wk.length || 4;
      const slotOffset = wk.findIndex(b => b.aId === bloco.aId);
      if (slotOffset < 0) return null;
      const idx = ((this.currentPage() * numSlots + slotOffset) % flat.length + flat.length) % flat.length;
      return flat[idx];
    }
    if (this.isMedabots1130Horario(bloco)) {
      const flat = this.getMedabotsFlatEpisodes();
      if (flat.length === 0) return null;
      const diasQ = this.diasProgramaMap.get(47) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return null;
      const idx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      return flat[idx];
    }
    if (this.isDigimon1230Horario(bloco)) {
      const flat = this.getDigimonFlatEpisodes();
      if (flat.length === 0) return null;
      const diasQ = this.diasProgramaMap.get(22) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return null;
      const idx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      return flat[idx];
    }
    if (this.isBaki21Horario(bloco)) {
      const flat = this.getBakiFlatEpisodes();
      if (flat.length === 0) return null;
      const diasQ = this.diasProgramaMap.get(9) ?? this.diasProgramaMap.get(10) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return null;
      const idx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      return flat[idx];
    }
    if (this.isAvatar11Horario(bloco)) {
      const flat = this.getAvatarFlatEpisodes();
      if (flat.length === 0) return null;
      const diasQ = this.diasProgramaMap.get(7) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return null;
      const idx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      return flat[idx];
    }
    if (this.isCavaleiros19Horario(bloco)) {
      const flat = this.getCavaleirosFlatEpisodes();
      if (flat.length === 0) return null;
      const diasQ = this.diasProgramaMap.get(58) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return null;
      const idx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      return flat[idx];
    }
    if (this.isDragonBall18Horario(bloco)) {
      const flat = this.getDragonBallFlatEpisodes();
      if (flat.length === 0) return null;
      const diasQ = this.diasProgramaMap.get(30) ?? [];
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return null;
      const idx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      return flat[idx];
    }
    if (!bloco.aPrograma) return null;
    const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
    if (!eps || eps.length === 0) return null;
    const diasQuePassa = this.diasProgramaMap.get(bloco.aPrograma.aId);
    if (!diasQuePassa || diasQuePassa.length === 0) return null;
    const dayPosition = diasQuePassa.indexOf(diaIdx);
    if (dayPosition < 0) return null;
    const diaName = this.dias[diaIdx];
    if (this.isFimDeSemana(diaName)) {
      const programaId = bloco.aPrograma.aId;
      const sameDayBlocos = this.weekendBlocosFor(programaId, diaIdx);
      const numSlots = sameDayBlocos.length;
      const slotOffset = sameDayBlocos.findIndex(b => b.aId === bloco.aId);
      const pageOffset = this.currentPage() * numSlots;
      const finalIdx = (pageOffset + slotOffset) % eps.length;
      return eps[finalIdx];
    }
    const pageOffset = this.currentPage() * this.pageStep(bloco.aPrograma.aId);
    const idx = (dayPosition + pageOffset) % eps.length;
    return eps[idx];
  }

  private getEpisodioBase(bloco: BlocoOutput, diaIdx: number): EpisodioInfo | null {
    if (!bloco.aPrograma) return null;
    const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
    if (!eps || eps.length === 0) return null;
    const diasQuePassa = this.diasProgramaMap.get(bloco.aPrograma.aId);
    if (!diasQuePassa || diasQuePassa.length === 0) return null;
    const dayPosition = diasQuePassa.indexOf(diaIdx);
    if (dayPosition < 0) return null;
    const idx = dayPosition % eps.length;
    return eps[idx];
  }

  getEpisodio(bloco: BlocoOutput, dia: string): EpisodioInfo | null {
    if (this.isCavaleiros19Horario(bloco) || this.isDragonBall18Horario(bloco) || this.isAvatar11Horario(bloco) || this.isBaki21Horario(bloco) || this.isDigimon1230Horario(bloco) || this.isMedabots1130Horario(bloco) || this.isBokuWeekend18Horario(bloco)) {
      const diaIdx = this.dias.indexOf(dia);
      if (diaIdx < 0) return null;
      return this.getEpisodioRaw(bloco, diaIdx);
    }
    return this.episodioCache.get(bloco.aId) ?? null;
  }

  getEpisodio2(bloco: BlocoOutput, dia: string): EpisodioInfo | null {
    if (!bloco.aPrograma || !this.isFimDeSemana(dia)) return null;
    const eps = this.allEpisodiosMap.get(bloco.aPrograma.aId);
    if (!eps || eps.length < 2) return null;
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const diaIdx = diasIndice.get(dia) ?? diasIndiceNorm.get(this.normalizeDia(dia)) ?? -1;
    if (diaIdx < 0) return null;
    const programaId = bloco.aPrograma.aId;
    const sameDayBlocos = this.weekendBlocosFor(programaId, diaIdx);
    const numSlots = sameDayBlocos.length;
    if (numSlots === 0) return null;
    const slotOffset = sameDayBlocos.findIndex(b => b.aId === bloco.aId);
    if (slotOffset < 0) return null;
    const pageOffset = this.currentPage() * numSlots;
    const shift = programaId === 13 ? 0 : (this.displacedEpisodeShift.get(bloco.aId) ?? 0);
    const finalIdx = (((pageOffset + slotOffset + 1) - shift) % eps.length + eps.length) % eps.length;
    return eps[finalIdx];
  }

  blocosFor(dia: string, horario: string): BlocoOutput[] {
    if (this.effectiveSchedule.size > 0) {
      const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
      const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
      const dIdx = diasIndice.get(dia) ?? diasIndiceNorm.get(this.normalizeDia(dia)) ?? -1;
      if (dIdx >= 0) {
        const key = `${dIdx}|${horario}`;
        if (this.effectiveSchedule.has(key)) {
          const cellBlocos = [...(this.effectiveSchedule.get(key) ?? [])];
          if (this.consumedSlots.has(key)) {
            const expandingReZero = cellBlocos.find(
              b => b.aPrograma?.aId === 66 && (b.aHorario?.substring(0, 5) ?? '') !== horario
            );
            if (expandingReZero) {
              const ep = this.getEpisodioUncached(expandingReZero);
              if (!ep || !ep.aDuracao || this.parseDuracaoSec(ep.aDuracao) <= 30 * 60) {
                return this.filteredBlocos
                  .filter(b => this.normalizeDia(b.aDiaSemanaDesc ?? '') === this.normalizeDia(dia) && b.aHorario?.substring(0, 5) === horario)
                  .sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
              }
            }
          }
          return cellBlocos.sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
        }
        return [];
      }
    }
    return this.filteredBlocos
      .filter(b => this.normalizeDia(b.aDiaSemanaDesc ?? '') === this.normalizeDia(dia) && b.aHorario?.substring(0, 5) === horario)
      .sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
  }

  private getAllBlocosForDia(dia: string): BlocoOutput[] {
    return this.filteredBlocos
      .filter(b => this.normalizeDia(b.aDiaSemanaDesc ?? '') === this.normalizeDia(dia))
      .sort((a, b) => (a.aHorario ?? '').localeCompare(b.aHorario ?? ''));
  }

  private countConsecutiveBlocos(bloco: BlocoOutput, dia: string): number {
    const allDay = this.getAllBlocosForDia(dia);
    const pid = bloco.aPrograma?.aId;
    if (!pid) return 1;
    const pIdx = allDay.findIndex(b => b.aId === bloco.aId);
    if (pIdx < 0) return 1;
    let count = 1;
    for (let j = pIdx + 1; j < allDay.length; j++) {
      if (allDay[j].aPrograma?.aId === pid) count++;
      else break;
    }
    for (let j = pIdx - 1; j >= 0; j--) {
      if (allDay[j].aPrograma?.aId === pid) count++;
      else break;
    }
    return count;
  }

  isMultiBloco(bloco: BlocoOutput, dia: string): boolean {
    if (bloco.aPrograma?.aId === 35) return false;
    const ep = this.getEpisodio(bloco, dia);
    if (!ep || !ep.aDuracao) return false;
    const totalSec = this.parseDuracaoSec(ep.aDuracao);
    return totalSec > 30 * 60;
  }

  private isFimDeSemana(dia: string): boolean {
    const idx = this.dias.indexOf(dia);
    return idx === 5 || idx === 6;
  }

  private tempoLivreSec(ep: EpisodioInfo): number {
    if (!ep.aDuracao) return 0;
    const p = ep.aDuracao.split(':');
    if (p.length !== 3) return 0;
    const totalSec = (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
    return Math.max(0, 30 * 60 - totalSec);
  }

  private formatSec(mm: number): string {
    const m = Math.floor(mm / 60);
    const s = mm % 60;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  private slotsForEpisode(ep: EpisodioInfo): number {
    if (!ep.aDuracao) return 1;
    const p = ep.aDuracao.split(':');
    if (p.length !== 3) return 1;
    const totalSec = (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
    return Math.max(1, Math.ceil(totalSec / (30 * 60)));
  }

  private slotIndex(dia: string, horario: string): number {
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const diasIndiceNorm = new Map(this.dias.map((d, i) => [this.normalizeDia(d), i]));
    const dIdx = diasIndice.get(dia) ?? diasIndiceNorm.get(this.normalizeDia(dia)) ?? -1;
    if (dIdx < 0) return 0;
    return this.slotPositionMap.get(`${dIdx}|${horario}`) ?? 0;
  }

  private multiBlocoFreeTime(ep: EpisodioInfo): number {
    if (!ep.aDuracao) return 0;
    const p = ep.aDuracao.split(':');
    if (p.length !== 3) return 0;
    const totalSec = (parseInt(p[0]) || 0) * 3600 + (parseInt(p[1]) || 0) * 60 + (parseInt(p[2]) || 0);
    const slots = this.slotsForEpisode(ep);
    const totalSlotSec = slots * 30 * 60;
    return Math.max(0, totalSlotSec - totalSec);
  }

  getTempoLivreTopo(bloco: BlocoOutput, dia: string, horario?: string): string {
    if (this.isMultiBloco(bloco, dia)) {
      const h = horario ?? bloco.aHorario?.substring(0, 5) ?? '';
      const idx = this.slotIndex(dia, h);
      if (idx !== 0) return '00:00';
      const ep = this.getEpisodio(bloco, dia);
      if (!ep) return '00:00';
      const livre = this.multiBlocoFreeTime(ep);
      if (livre <= 0) return '00:00';
      return this.formatSec(Math.floor(livre / 2));
    }
    const ep = this.getEpisodio(bloco, dia);
    if (!ep) return '00:00';
    const livre = this.tempoLivreSec(ep);
    if (livre <= 0) return '00:00';
    return this.formatSec(Math.floor(livre / 2));
  }

  getTempoLivreBaixo(bloco: BlocoOutput, dia: string, horario?: string): string {
    const ep = this.getEpisodio(bloco, dia);
    if (!ep || !ep.aDuracao) return '00:00';

    if (!this.isMultiBloco(bloco, dia)) {
      const livre = this.tempoLivreSec(ep);
      if (livre <= 0) return '00:00';
      return this.formatSec(Math.ceil(livre / 2));
    }

    const h = horario ?? bloco.aHorario?.substring(0, 5) ?? '';
    const slots = this.slotsForEpisode(ep);
    const idx = this.slotIndex(dia, h);
    if (idx !== slots - 1) return '00:00';

    const livre = this.multiBlocoFreeTime(ep);
    if (livre <= 0) return '00:00';
    return this.formatSec(Math.ceil(livre / 2));
  }

  formatDuracao(duracao: string | null): string {
    if (!duracao) return '--:--';
    const parts = duracao.split(':');
    if (parts.length === 3) {
      const h = parseInt(parts[0]) || 0;
      const m = parseInt(parts[1]) || 0;
      const s = parseInt(parts[2]) || 0;
      if (h > 0) {
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
      }
      return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }
    const sec = parseFloat(duracao);
    if (isNaN(sec)) return duracao;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec) % 60;
    return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  getCapaUrl(ep: EpisodioInfo): string | null {
    if (!ep.aCapaUrl) return null;
    return `${environment.API_URL}/api/v1/episodio/${ep.aId}/capa`;
  }

  getTempoLivre(ep: EpisodioInfo): string | null {
    if (!ep.aDuracao) return null;
    const parts = ep.aDuracao.split(':');
    if (parts.length !== 3) return null;
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    const s = parseInt(parts[2]) || 0;
    const totalSec = h * 3600 + m * 60 + s;
    const livre = 30 * 60 - totalSec;
    if (livre <= 0) return '00:00';
    const lm = Math.floor(livre / 60);
    const ls = livre % 60;
    return `${lm.toString().padStart(2,'0')}:${ls.toString().padStart(2,'0')}`;
  }


  formatTxExPx(ep: { aTemporada: number | null; aNumero: number | null; aParte: number | null; aTitulo?: string | null }): SafeHtml {
    const parts: string[] = [];
    if (ep.aTemporada) parts.push(`<span style="color:#f472b6;font-weight:bold;">T${ep.aTemporada}</span>`);
    const hasParteNoTitulo = !!(ep as any).aTitulo && (ep as any).aTitulo.toLowerCase().includes('parte');
    if (ep.aParte != null && !hasParteNoTitulo) parts.push(`<span style="color:#facc15;font-weight:bold;">P${ep.aParte === 0 ? 1 : ep.aParte}</span>`);
    if (ep.aNumero) parts.push(`<span style="color:#60a5fa;font-weight:bold;">E${ep.aNumero}</span>`);
    return this.sanitizer.bypassSecurityTrustHtml(parts.join(' '));
  }

  private normalizeDia(d: string): string {
    return d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  faixaNome(horario: string): string {
    for (let i = this.faixaRanges.length - 1; i >= 0; i--) {
      if (horario >= this.faixaRanges[i].inicio) return this.faixaRanges[i].nome;
    }
    return '';
  }

  faixaIcon(horario: string): string {
    for (let i = this.faixaRanges.length - 1; i >= 0; i--) {
      if (horario >= this.faixaRanges[i].inicio) return this.faixaRanges[i].icon;
    }
    return '📺';
  }

  showFaixaHeader(horario: string, index: number): boolean {
    if (index === 0) return true;
    return this.faixaNome(horario) !== this.faixaNome(this.horarios[index - 1]);
  }

  openCellModal(dia: string, horario: string): void {
    const gradeId = this.selectedGradeId() ?? (this.grades().length > 0 ? this.grades()[0].aId : null);
    this.modalDia.set(dia);
    this.modalHorario.set(horario);
    this.modalGradeId.set(gradeId);
    this.modalTipoCode.set('IN');
    this.modalProgramaSearch.set('');
    this.modalProgramas.set([]);
    this.modalSelectedPrograma.set(null);
    this.modalOpen.set(true);
    this.searchProgramas('');
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  searchProgramas(term: string): void {
    this.modalProgramaSearch.set(term);
    this.tvService.listProgramas(0, 1000, term).subscribe({
      next: (res) => this.modalProgramas.set(res.aProgramas),
      error: () => this.modalProgramas.set([]),
    });
  }

  selectProgramaModal(p: ProgramaOutput): void {
    this.modalSelectedPrograma.set(p);
    this.modalProgramaSearch.set(p.aNome);
    this.modalEpisodios.set([]);
    this.modalSelectedEpisodio.set(null);
    this.tvService.listEpisodios(0, 10000, p.aId).subscribe({
      next: (res) => {
        const eps = res.aEpisodios.map(e => ({ aId: e.aId, aNumero: e.aNumero, aTemporada: e.aTemporada, aParte: e.aParte, aTitulo: e.aTitulo }));
        eps.sort((a, b) => ((a.aTemporada ?? 0) - (b.aTemporada ?? 0)) || ((a.aParte ?? 0) - (b.aParte ?? 0)) || ((a.aNumero ?? 0) - (b.aNumero ?? 0)));
        this.modalEpisodios.set(eps);
      },
      error: () => this.modalEpisodios.set([]),
    });
  }

  faixaCode(horario: string): string {
    const nome = this.faixaNome(horario);
    const map: Record<string, string> = { 'Madrugada': 'MA', 'Manhã': 'MN', 'Tarde': 'TA', 'Noite': 'NO', 'Prime Time': 'PT' };
    return map[nome] ?? 'MA';
  }

  submitBloco(): void {
    const programa = this.modalSelectedPrograma();
    const gradeId = this.modalGradeId();
    if (!programa || !gradeId) return;

    this.modalSaving.set(true);
    this.tvService.createBloco({
      aProgramaId: programa.aId,
      aHorario: this.modalHorario(),
      aGradeId: gradeId,
      aDiaSemanaCode: this.diasCodigo[this.modalDia()] ?? 'SE',
      aFaixaHorarioCode: this.faixaCode(this.modalHorario()),
      aTipoBlocoCode: this.modalTipoCode(),
    }).subscribe({
      next: () => {
        this.closeModal();
        this.loadBlocos();
      },
      error: () => {
        this.modalSaving.set(false);
      },
    });
  }

  tipoColor(tipo: string | null): string {
    if (!tipo) return 'border-gray-600 bg-gray-800/80';
    if (tipo.includes('Inédito')) return 'border-blue-600 bg-blue-950/60';
    if (tipo.includes('Rep')) return 'border-yellow-600 bg-yellow-950/60';
    if (tipo.includes('Maratona')) return 'border-purple-600 bg-purple-950/60';
    if (tipo.includes('Especial')) return 'border-red-600 bg-red-950/60';
    return 'border-gray-600 bg-gray-800/80';
  }

  accentColor(tipo: string | null): string {
    if (!tipo) return '#6b7280';
    if (tipo.includes('Inédito')) return '#3b82f6';
    if (tipo.includes('Rep')) return '#eab308';
    if (tipo.includes('Maratona')) return '#a855f7';
    if (tipo.includes('Especial')) return '#ef4444';
    return '#6b7280';
  }

  tipoCardBg(tipo: string | null): string {
    if (!tipo) return 'bg-gray-800/70';
    if (tipo.includes('Inédito')) return 'bg-blue-950/40';
    if (tipo.includes('Rep')) return 'bg-yellow-950/40';
    if (tipo.includes('Maratona')) return 'bg-purple-950/40';
    if (tipo.includes('Especial')) return 'bg-red-950/40';
    return 'bg-gray-800/70';
  }

  tipoBadgeColor(tipo: string | null): string {
    if (!tipo) return 'bg-gray-700 text-gray-400';
    if (tipo.includes('Inédito')) return 'bg-blue-900 text-blue-300';
    if (tipo.includes('Rep')) return 'bg-yellow-900 text-yellow-300';
    if (tipo.includes('Maratona')) return 'bg-purple-900 text-purple-300';
    if (tipo.includes('Especial')) return 'bg-red-900 text-red-300';
    return 'bg-gray-700 text-gray-400';
  }

  get nowDayIndex(): number {
    const d = this.serverTime.ready() ? this.serverTime.getDayOfWeek() : this.currentTime().getDay();
    return d === 0 ? 6 : d - 1;
  }

  isToday(dia: string): boolean {
    return dia === this.dias[this.nowDayIndex];
  }

  readonly nowLineOverride = signal<string | null>(null);

  linhaParaInicio(): void {
    this.nowLineOverride.set('00:00');
    this.linhaService.definir('00:00', this.currentPage(), 0);
    this.scrollParaSlot('00:00');
  }

  linhaParaSlot(horario: string): void {
    const diaAtual = this.linhaService.diaIdx() ?? this.nowDayIndex;
    this.nowLineOverride.set(horario);
    this.linhaService.definir(horario, this.currentPage(), diaAtual);
    this.scrollParaSlot(horario);
  }

  linhaParaDia(idx: number): void {
    const slot = this.nowLineOverride() ?? this.nowTimeSlot();
    this.nowLineOverride.set(slot);
    this.linhaService.definir(slot, this.currentPage(), idx);
  }

  linhaParaAgora(): void {
    this.nowLineOverride.set(null);
    this.linhaService.limpar();
    const now = this.currentTime();
    const slot = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`;
    this.scrollParaSlot(slot);
  }

  private scrollParaSlot(slot: string): void {
    const labels = document.querySelectorAll('.time-label');
    for (const el of Array.from(labels)) {
      if ((el.textContent ?? '').trim().startsWith(slot)) {
        const htmlEl = el as HTMLElement;
        // Rola só o contêiner da grade: scrollIntoView rolaria a janela
        // junto e tiraria o header de vista.
        const container = htmlEl.closest('.grade-scroll') as HTMLElement | null;
        if (container) {
          const cRect = container.getBoundingClientRect();
          const eRect = htmlEl.getBoundingClientRect();
          const delta = eRect.top - cRect.top - cRect.height / 2 + eRect.height / 2;
          container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' });
        } else {
          htmlEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        break;
      }
    }
  }

  readonly nowTimeSlot = computed(() => {
    const override = this.nowLineOverride();
    if (override) return override;
    const serviceSlot = this.linhaService.slot();
    if (serviceSlot) return serviceSlot;
    const now = this.currentTime();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes() < 30 ? '00' : '30';
    return `${h}:${m}`;
  });

  readonly nowDaySlot = computed(() => this.linhaService.diaIdx() ?? this.nowDayIndex);

  readonly nowMinuteFraction = computed(() => {
    if (this.nowLineOverride() || this.linhaService.slot()) return 0;
    const now = this.currentTime();
    const linear = (now.getMinutes() % 30 + now.getSeconds() / 60) / 30;
    const bloco = this.getBlocoAtual();
    if (!bloco) return linear;

    const { diaIdx } = this.agoraEMSlot();
    const diaNome = this.dias[diaIdx];
    const ep = this.getEpisodio(bloco, diaNome);
    if (!ep || !ep.aDuracao) return linear;

    const epSec = this.parseDuracaoSec(ep.aDuracao);
    if (epSec <= 0) return linear;

    // Linha percorre as três faixas visuais da fileira ATUAL (slot de 30 min):
    // [LIVRE topo] -> [episódio] -> [LIVRE base]. Cada faixa tem altura fixa
    // no layout e a velocidade é tempo/altura, logo livre curto = mais rápido.
    const slotStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`;
    const slotStartMin = (now.getHours() * 60 + (now.getMinutes() < 30 ? 0 : 30));
    const elapsedSlotMin = now.getMinutes() % 30 + now.getSeconds() / 60;

    const isMulti = this.isMultiBloco(bloco, diaNome);
    let topFreeMin = 0, episodeSliceMin = 0, bottomFreeMin = 0;
    if (isMulti) {
      const totalLivreSec = this.multiBlocoFreeTime(ep);
      const topSec = Math.floor(totalLivreSec / 2);
      const bottomSec = Math.ceil(totalLivreSec / 2);
      const slotIdx = this.slotIndex(diaNome, slotStr);
      const slots = this.slotsForEpisode(ep);
      if (slotIdx === 0) {
        topFreeMin = topSec / 60;
        episodeSliceMin = 30 - topFreeMin;
      } else if (slotIdx === slots - 1) {
        bottomFreeMin = bottomSec / 60;
        episodeSliceMin = 30 - bottomFreeMin;
      } else {
        episodeSliceMin = 30;
      }
    } else {
      const livreSec = Math.max(0, 30 * 60 - epSec);
      topFreeMin = Math.floor(livreSec / 2) / 60;
      bottomFreeMin = Math.ceil(livreSec / 2) / 60;
      episodeSliceMin = epSec / 60;
    }

    // Alturas medidas no layout (grid row 136px): top livre 0.052-0.162,
    // episódio 0.206-0.794, livre base 0.838-0.949. Mantém fator visual fixo
    // (as faixas vão das bordas do card, sem salto entre episódio e livre base).
    const TOP_T = 0.052, TOP_H = 0.154;
    const EP_T = 0.206, EP_H = 0.588;
    const BOT_T = 0.794, BOT_H = 0.155;

    if (topFreeMin > 0 && elapsedSlotMin < topFreeMin) {
      return TOP_T + (elapsedSlotMin / topFreeMin) * TOP_H;
    }
    if (episodeSliceMin > 0) {
      const epStart = topFreeMin;
      const epEnd = topFreeMin + episodeSliceMin;
      if (elapsedSlotMin < epEnd) {
        const inside = Math.max(0, elapsedSlotMin - epStart);
        return EP_T + (inside / episodeSliceMin) * EP_H;
      }
    }
    if (bottomFreeMin > 0) {
      const botStart = topFreeMin + episodeSliceMin;
      if (elapsedSlotMin >= botStart) {
        const inside = Math.min(elapsedSlotMin - botStart, bottomFreeMin);
        return BOT_T + (inside / bottomFreeMin) * BOT_H;
      }
    }
    // Fora das faixas (ex.: livre 0) cai no fim do episódio.
    return Math.min(EP_T + EP_H, 0.99);
  });

  private agoraEMSlot(): { diaIdx: number; horarioIdx: number; slotIdx: number } {
    const now = this.currentTime();
    const diaIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const hora = now.getHours().toString().padStart(2, '0');
    const minuto = now.getMinutes();
    const minIdx = Math.floor(minuto / 30);
    const horarioIdx = this.horarios.findIndex(h => h === `${hora}:${minIdx === 0 ? '00' : '30'}`);
    return { diaIdx, horarioIdx: horarioIdx >= 0 ? horarioIdx : 0, slotIdx: horarioIdx >= 0 ? horarioIdx : 0 };
  }

  private tempoLivreAtualSec(): number {
    const { slotIdx, diaIdx } = this.agoraEMSlot();
    const horario = this.horarios[slotIdx];
    const diaNome = this.dias[diaIdx];
    const blocos = this.blocosFor(diaNome, horario);
    if (blocos.length === 0) return 0;
    const bloco = blocos[0];
    const ep = this.getEpisodio(bloco, diaNome);
    if (!ep || !ep.aDuracao) return 0;
    return this.tempoLivreSec(ep);
  }

  private fatorVelocidadeAcima(livreSec: number): number {
    const maxPossible = 30 * 60;
    const ratio = Math.min(livreSec / maxPossible, 1);
    return 0.5 + (1 - ratio) * 1.5;
  }

  private fatorVelocidadeAbaixo(livreSec: number): number {
    const maxPossible = 30 * 60;
    const ratio = Math.min(livreSec / maxPossible, 1);
    return 0.5 + (1 - ratio) * 1.5;
  }

  private getBlocoAtual(): BlocoOutput | null {
    const now = this.currentTime();
    const slotAtual = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`;
    const { diaIdx, horarioIdx } = this.agoraEMSlot();
    // Sem o slot atual na grade (ou fallback para a fileira errada),
    // não há bloco de referência: fração linear.
    if (horarioIdx < 0 || this.horarios[horarioIdx] !== slotAtual) return null;
    const diaNome = this.dias[diaIdx];
    const blocos = this.blocosFor(diaNome, slotAtual);
    return blocos.length > 0 ? blocos[0] : null;
  }

  private getElapsedMinFromBlocoStart(now: Date, bloco: BlocoOutput): number {
    const [bh, bm] = (bloco.aHorario || '00:00').split(':').map(Number);
    const blocoStartMin = bh * 60 + bm;
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    return Math.max(0, nowMin - blocoStartMin);
  }

  private getFatorVelocidade(epSec: number): number {
    const livreSec = Math.max(0, 30 * 60 - epSec);
    return this.fatorVelocidadeAcima(livreSec);
  }

  private getFracaoLivre(elapsedMin: number, epMin: number, livreMin: number, fator: number): number {
    if (livreMin <= 0) return 1;
    const livreElapsed = Math.max(0, elapsedMin - epMin);
    return Math.min(livreElapsed * fator / livreMin, 1);
  }

  private ehSobreEpisodioAtualSlot(): boolean {
    const { slotIdx, diaIdx } = this.agoraEMSlot();
    const horario = this.horarios[slotIdx];
    const diaNome = this.dias[diaIdx];
    const diasIndice = new Map(this.dias.map((d, i) => [d, i]));
    const dIdx = diasIndice.get(diaNome) ?? -1;
    if (dIdx < 0) return false;
    const blocos = this.blocosFor(diaNome, horario);
    if (blocos.length === 0) return false;
    for (const bloco of blocos) {
      const ep = this.getEpisodio(bloco, diaNome);
      if (!ep || !ep.aDuracao) continue;
      const epSec = this.parseDuracaoSec(ep.aDuracao);
      const slotsNecessarios = Math.ceil(epSec / (30 * 60));
      if (slotIdx >= slotsNecessarios - 1 && slotIdx < slotsNecessarios) return true;
      if (slotIdx === slotsNecessarios) return true;
    }
    return false;
  }

  get fatorVelocidadeLivreAcima(): number {
    try {
      const livre = this.tempoLivreAtualSec();
      if (livre === undefined || livre === null || isNaN(livre)) return 1;
      return this.fatorVelocidadeAcima(livre);
    } catch {
      return 1;
    }
  }

  get fatorVelocidadeLivreAbaixo(): number {
    try {
      const livre = this.tempoLivreAtualSec();
      if (livre === undefined || livre === null || isNaN(livre)) return 1;
      return this.fatorVelocidadeAbaixo(livre);
    } catch {
      return 1;
    }
  }

  get ehSobreEpisodioAtual(): boolean {
    return this.ehSobreEpisodioAtualSlot();
  }

  getTipoDinamico(bloco: any, dia: string): string {
    const original = bloco.aTipoBlocoDesc ?? '';
    if (original.includes('Maratona') || original.includes('Especial')) return original;

    if (this.isBokuWeekend18Horario(bloco)) {
      const flat = this.getBokuFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const diaIdx = this.dias.indexOf(dia);
      const wk = this.weekendBlocosFor(bloco.aPrograma!.aId, diaIdx);
      const numSlots = wk.length || 4;
      const slotOffset = wk.findIndex(b => b.aId === bloco.aId);
      if (slotOffset < 0) return 'Inédito';
      const curIdx = ((this.currentPage() * numSlots + slotOffset) % flat.length + flat.length) % flat.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (let s = 0; s < numSlots; s++) {
          if (((p * numSlots + s) % flat.length + flat.length) % flat.length === curIdx) return 'Reprise';
        }
      }
      for (let s = 0; s < slotOffset; s++) {
        if (((this.currentPage() * numSlots + s) % flat.length + flat.length) % flat.length === curIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isMedabots1130Horario(bloco)) {
      const flat = this.getMedabotsFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const flatIdx = flat.findIndex(e => e.aId === epThis.aId);
      if (flatIdx < 0) return 'Inédito';
      const diasQ = this.diasProgramaMap.get(47) ?? [];
      const diaIdx = this.dias.indexOf(dia);
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return 'Inédito';
      const curFlatIdx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (const dp of diasQ) {
          if (((dp + p * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
        }
      }
      for (const dp of diasQ) {
        if (dp >= dayPos) break;
        if (((dp + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isDigimon1230Horario(bloco)) {
      const flat = this.getDigimonFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const flatIdx = flat.findIndex(e => e.aId === epThis.aId);
      if (flatIdx < 0) return 'Inédito';
      const diasQ = this.diasProgramaMap.get(22) ?? [];
      const diaIdx = this.dias.indexOf(dia);
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return 'Inédito';
      const curFlatIdx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (const dp of diasQ) {
          if (((dp + p * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
        }
      }
      for (const dp of diasQ) {
        if (dp >= dayPos) break;
        if (((dp + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isBaki21Horario(bloco)) {
      const flat = this.getBakiFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const flatIdx = flat.findIndex(e => e.aId === epThis.aId);
      if (flatIdx < 0) return 'Inédito';
      const diasQ = this.diasProgramaMap.get(9) ?? this.diasProgramaMap.get(10) ?? [];
      const diaIdx = this.dias.indexOf(dia);
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return 'Inédito';
      const curFlatIdx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (const dp of diasQ) {
          if (((dp + p * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
        }
      }
      for (const dp of diasQ) {
        if (dp >= dayPos) break;
        if (((dp + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isAvatar11Horario(bloco)) {
      const flat = this.getAvatarFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const flatIdx = flat.findIndex(e => e.aId === epThis.aId);
      if (flatIdx < 0) return 'Inédito';
      const diasQ = this.diasProgramaMap.get(7) ?? [];
      const diaIdx = this.dias.indexOf(dia);
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return 'Inédito';
      const curFlatIdx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (const dp of diasQ) {
          if (((dp + p * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
        }
      }
      for (const dp of diasQ) {
        if (dp >= dayPos) break;
        if (((dp + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isDragonBall18Horario(bloco)) {
      const flat = this.getDragonBallFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const flatIdx = flat.findIndex(e => e.aId === epThis.aId);
      if (flatIdx < 0) return 'Inédito';
      const diasQ = this.diasProgramaMap.get(30) ?? [];
      const diaIdx = this.dias.indexOf(dia);
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return 'Inédito';
      const curFlatIdx = (((dayPos + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length) + flat.length) % flat.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (const dp of diasQ) {
          if (((dp + p * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
        }
      }
      for (const dp of diasQ) {
        if (dp >= dayPos) break;
        if (((dp + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isCavaleiros19Horario(bloco)) {
      const flat = this.getCavaleirosFlatEpisodes();
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis || flat.length === 0) return 'Inédito';
      const flatIdx = flat.findIndex(e => e.aId === epThis.aId);
      if (flatIdx < 0) return 'Inédito';
      const diasQ = this.diasProgramaMap.get(58) ?? [];
      const diaIdx = this.dias.indexOf(dia);
      const dayPos = diasQ.indexOf(diaIdx);
      if (dayPos < 0) return 'Inédito';
      const curGlobal = dayPos + this.currentPage() * this.EPISODES_PER_PAGE;
      const curFlatIdx = ((curGlobal % flat.length) + flat.length) % flat.length;
      // Se o mesmo flat já apareceu em página/dia anterior, é reprise
      for (let p = 0; p < this.currentPage(); p++) {
        for (const dp of diasQ) {
          if (((dp + p * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
        }
      }
      for (const dp of diasQ) {
        if (dp >= dayPos) break;
        if (((dp + this.currentPage() * this.EPISODES_PER_PAGE) % flat.length + flat.length) % flat.length === curFlatIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (this.isFimDeSemana(dia)) {
      const programaId = bloco.aPrograma.aId!;
      const eps = this.allEpisodiosMap.get(programaId);
      if (!eps || eps.length === 0) return original || 'Inédito';
      const diaIdx = this.dias.indexOf(dia);
      const wk = this.weekendBlocosFor(programaId, diaIdx);
      const numSlots = wk.length || 4;
      const slotOffset = wk.findIndex(b => b.aId === bloco.aId);
      if (slotOffset < 0) return original || 'Inédito';
      const epThis = this.getEpisodio(bloco, dia);
      if (!epThis) return original || 'Inédito';
      const curIdx = ((this.currentPage() * numSlots + slotOffset) % eps.length + eps.length) % eps.length;
      for (let p = 0; p < this.currentPage(); p++) {
        for (let s = 0; s < numSlots; s++) {
          if (((p * numSlots + s) % eps.length + eps.length) % eps.length === curIdx) return 'Reprise';
        }
      }
      for (let s = 0; s < slotOffset; s++) {
        if (((this.currentPage() * numSlots + s) % eps.length + eps.length) % eps.length === curIdx) return 'Reprise';
      }
      return 'Inédito';
    }

    if (!bloco.aPrograma) return original || 'Inédito';

    const programaId = bloco.aPrograma.aId;
    const eps = this.allEpisodiosMap.get(programaId);
    if (!eps || eps.length === 0) return original || 'Inédito';

    const diasQuePassa = this.diasProgramaMap.get(programaId);
    if (!diasQuePassa || diasQuePassa.length === 0) return original || 'Inédito';

    const diaIdx = this.dias.indexOf(dia);
    const dayPosition = diasQuePassa.indexOf(diaIdx);
    if (dayPosition < 0) return original || 'Inédito';

    const epThis = this.getEpisodio(bloco, dia);

    const currentTime = bloco.aHorario?.substring(0, 5) ?? '';
    const mesmoDiaSameEp = this.filteredBlocos.some(b => {
      if (b.aId === bloco.aId) return false;
      if (b.aPrograma?.aId !== programaId) return false;
      if (b.aDiaSemanaDesc !== dia) return false;
      if ((b.aHorario?.substring(0, 5) ?? '') >= currentTime) return false;
      const epB = this.getEpisodio(b, dia);
      return epB && epThis && epB.aId === epThis.aId;
    });
    if (mesmoDiaSameEp) return 'Reprise';

    const step = this.pageStep(programaId);
    const pageOffset = this.currentPage() * step;
    const currentIdx = (dayPosition + pageOffset) % eps.length;

    for (let p = 0; p < this.currentPage(); p++) {
      const pOffset = p * step;
      for (const dp of diasQuePassa) {
        if ((dp + pOffset) % eps.length === currentIdx) return 'Reprise';
      }
    }

    return original || 'Inédito';
  }

}
