import { Component, signal, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TvService, ProgramaOutput, EpisodioOutput } from '../../services/tv.service';
import { sufixoEpisodio } from '../../utils/multi-episodio';

interface SeasonGroup {
  season: number;
  part: number;
  episodes: EpisodioOutput[];
}

@Component({
  selector: 'app-programas',
  imports: [RouterLink],
  templateUrl: './programas.html',
  styleUrl: './programas.css',
})
export class Programas implements OnInit {

  readonly tvService = inject(TvService);
  private readonly route = inject(ActivatedRoute);

  readonly programas = signal<ProgramaOutput[]>([]);
  readonly loadingProgramas = signal(false);
  readonly searchText = signal('');
  readonly programasPage = signal(0);
  readonly programasTotal = signal(0);
  readonly programasPerPage = 50;

  readonly selectedPrograma = signal<ProgramaOutput | null>(null);
  readonly episodios = signal<EpisodioOutput[]>([]);
  readonly loadingEpisodios = signal(false);

  ngOnInit(): void {
    const programaId = this.route.snapshot.queryParamMap.get('programa');
    this.loadProgramas(programaId ? +programaId : null);
  }

  loadProgramas(autoSelectId: number | null = null): void {
    this.loadingProgramas.set(true);
    this.tvService.listProgramas(this.programasPage(), this.programasPerPage, this.searchText()).subscribe({
      next: (res) => {
        this.programas.set(res.aProgramas);
        this.programasTotal.set(res.aTotal);
        this.loadingProgramas.set(false);

        if (autoSelectId !== null) {
          const found = res.aProgramas.find(p => p.aId === autoSelectId);
          if (found) {
            this.selectPrograma(found);
          }
        }
      },
      error: () => {
        this.programas.set([]);
        this.loadingProgramas.set(false);
      },
    });
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchText.set(value);
    this.programasPage.set(0);
    this.loadProgramas();
  }

  selectPrograma(prog: ProgramaOutput): void {
    this.selectedPrograma.set(prog);
    this.loadingEpisodios.set(true);
    this.episodios.set([]);

    this.tvService.listEpisodios(0, 1000, prog.aId).subscribe({
      next: (res) => {
        this.episodios.set(res.aEpisodios);
        this.loadingEpisodios.set(false);
      },
      error: () => {
        this.episodios.set([]);
        this.loadingEpisodios.set(false);
      },
    });
  }

  backToList(): void {
    this.selectedPrograma.set(null);
    this.episodios.set([]);
  }

  get seasonGroups(): SeasonGroup[] {
    const map = new Map<string, EpisodioOutput[]>();
    const keyOrder: string[] = [];
    for (const ep of this.episodios()) {
      const season = ep.aTemporada ?? 0;
      const part = ep.aParte ?? 0;
      const key = `${season}-${part}`;
      if (!map.has(key)) {
        map.set(key, []);
        keyOrder.push(key);
      }
      map.get(key)!.push(ep);
    }
    return keyOrder
      .sort((a, b) => {
        const [sA, pA] = a.split('-').map(Number);
        const [sB, pB] = b.split('-').map(Number);
        return sA - sB || pA - pB;
      })
      .map(key => {
        const [season, part] = key.split('-').map(Number);
        const episodes = map.get(key)!;
        return {
          season,
          part,
          episodes: episodes.sort((a, b) => (a.aNumero ?? 0) - (b.aNumero ?? 0)),
        };
      });
  }

  get episodiosTotalPages(): number {
    return Math.ceil(this.programasTotal() / this.programasPerPage);
  }

  prevPage(): void {
    if (this.programasPage() > 0) {
      this.programasPage.update(p => p - 1);
      this.loadProgramas();
    }
  }

  nextPage(): void {
    if (this.programasPage() < this.episodiosTotalPages - 1) {
      this.programasPage.update(p => p + 1);
      this.loadProgramas();
    }
  }

  hasFile(ep: EpisodioOutput): boolean {
    return ep.aArquivo != null;
  }

  /** Número do episódio com o sufixo de segmento lido do título (8C, 14.5). */
  epNumero(ep: EpisodioOutput): string {
    if (ep.aNumero == null) return '';
    return `${ep.aNumero}${sufixoEpisodio(ep.aNumero, ep.aTitulo)}`;
  }
}
