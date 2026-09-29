import { Injectable, signal, effect, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface LinhaChangeEvent {
  slot: string | null;
  pagina: number;
  diaIdx: number | null;
}

interface LinhaState {
  slot: string | null;
  pagina: number;
  diaIdx: number | null;
  desde: number;
}

@Injectable({ providedIn: 'root' })
export class LinhaVermelhaService implements OnDestroy {

  private readonly apiUrl = environment.API_URL + '/api/v1/linha-vermelha';

  readonly slot = signal<string | null>(null);
  readonly pagina = signal(0);
  readonly diaIdx = signal<number | null>(null);
  readonly desde = signal(0);

  readonly mudanca$ = new BehaviorSubject<LinhaChangeEvent | null>(null);

  private _pollTimer: any;
  private _lastServerState: string = '';
  private _http: HttpClient | null = null;

  private _storageHandler = (e: StorageEvent) => {
    if (e.key !== this._chave()) return;
    this._recuperar();
    this.mudanca$.next({
      slot: this.slot(),
      pagina: this.pagina(),
      diaIdx: this.diaIdx(),
    });
  };

  constructor(http: HttpClient) {
    this._http = http;
    effect(() => this._persistirLocal(), { allowSignalWrites: false });
    this._recuperar();
    window.addEventListener('storage', this._storageHandler);
    this._startPolling();
  }

  ngOnDestroy(): void {
    window.removeEventListener('storage', this._storageHandler);
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  private _chave(): string {
    return `linha-vermelha`;
  }

  private _persistirLocal(): void {
    try {
      const data: LinhaState = {
        slot: this.slot(),
        pagina: this.pagina(),
        diaIdx: this.diaIdx(),
        desde: this.desde(),
      };
      localStorage.setItem(this._chave(), JSON.stringify(data));
    } catch { }
  }

  private _recuperar(): void {
    try {
      const data = localStorage.getItem(this._chave());
      if (!data) return;
      const parsed = JSON.parse(data);
      this.slot.set(parsed.slot ?? null);
      this.pagina.set(parsed.pagina ?? 0);
      this.diaIdx.set(parsed.diaIdx ?? null);
      this.desde.set(parsed.desde ?? 0);
    } catch { }
  }

  private _startPolling(): void {
    this._pollTimer = setInterval(() => this._fetchServerState(), 1500);
    this._fetchServerState();
  }

  private _fetchServerState(): void {
    if (!this._http) return;
    this._http.get<LinhaState>(this.apiUrl).subscribe({
      next: (state) => {
        const key = JSON.stringify(state);
        if (key === this._lastServerState) return;
        this._lastServerState = key;

        const localChanged = this.slot() !== state.slot ||
          this.pagina() !== state.pagina ||
          this.diaIdx() !== state.diaIdx;

        this.slot.set(state.slot ?? null);
        this.pagina.set(state.pagina ?? 0);
        this.diaIdx.set(state.diaIdx ?? null);
        this.desde.set(state.desde ?? 0);

        if (localChanged) {
          this.mudanca$.next({
            slot: this.slot(),
            pagina: this.pagina(),
            diaIdx: this.diaIdx(),
          });
        }
      },
      error: () => { },
    });
  }

  private _pushServerState(): void {
    if (!this._http) return;
    const state: LinhaState = {
      slot: this.slot(),
      pagina: this.pagina(),
      diaIdx: this.diaIdx(),
      desde: this.desde(),
    };
    this._lastServerState = JSON.stringify(state);
    this._http.post(this.apiUrl, state).subscribe({ next: () => { }, error: () => { } });
  }

  definir(slot: string, pagina: number, diaIdx: number): void {
    this.slot.set(slot);
    this.pagina.set(pagina);
    this.diaIdx.set(diaIdx);
    this.desde.set(Date.now());
    this.mudanca$.next({ slot, pagina, diaIdx });
    this._pushServerState();
  }

  /** A grade registra a página exibida; o player (e outras abas/dispositivos) seguem. */
  acompanharPagina(pagina: number): void {
    if (this.pagina() === pagina) return;
    this.pagina.set(pagina);
    this._pushServerState();
  }

  limpar(): void {
    // Limpa a posição manual da linha, mas MANTÉM a página: a página é a da
    // grade e não tem a ver com a linha manual (zerá-la deixava o player na 0).
    const pagina = this.pagina();
    this.slot.set(null);
    this.pagina.set(pagina);
    this.diaIdx.set(null);
    this.desde.set(0);
    this.mudanca$.next({ slot: null, pagina, diaIdx: null });
    // Sem remover a chave do localStorage: o effect persiste o estado já limpo,
    // e apagá-la aqui perdia a página quando nenhum sinal mudava.
    this._pushServerState();
  }

  resetarSeNecessario(): void {
    if (this.slot() && Date.now() - this.desde() > 5 * 60 * 1000) {
      this.limpar();
    }
  }

  fracaoBloco(): number {
    if (this.slot()) return 0;
    const now = new Date();
    const minutos = now.getMinutes();
    return (minutos % 30) / 30;
  }

  segundosDentroBloco(): number {
    if (this.slot()) return 0;
    const now = new Date();
    return (now.getMinutes() % 30) * 60;
  }
}
