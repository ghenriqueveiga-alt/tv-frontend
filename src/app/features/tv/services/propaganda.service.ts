import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** Código da metade do tempo livre: TO = topo, BA = base. */
export type PropagandaPosicaoCode = 'TO' | 'BA';

export interface PropagandaOutput {
  aId: number;
  aUuid: string;
  aStatusCode: string;
  aBlocoId: number | null;
  aPosicao: 'Topo' | 'Base';
  aNome: string;
  aDuracaoSeg: number;
  aArquivoId: number | null;
  aArquivoNome: string | null;
  aOrdem: number;
  /** Página da grade (aba de episódios) dona da propaganda. */
  aPagina: number | null;
}

export interface ReadAllPropagandaOutput {
  aPropagandas: PropagandaOutput[];
}

export interface CreatePropagandaPayload {
  aBlocoId: number;
  aPosicaoCode: PropagandaPosicaoCode;
  aNome: string;
  aDuracaoSeg: number;
  aArquivoId?: number | null;
  aOrdem?: number | null;
  /** Página da grade em que a propaganda vale. */
  aPagina: number;
}

export interface PatchPropagandaPayload {
  aNome?: string;
  aDuracaoSeg?: number;
  aOrdem?: number;
  /** Troca o vídeo da propaganda (id do arquivo recém-enviado). */
  aArquivoId?: number;
  /** Desassocia o vídeo atual. */
  aRemoverArquivo?: boolean;
  /** Página da grade dona da propaganda (mover para outra página). */
  aPagina?: number;
}

/** Estado do canal SSE de propaganda: conectou, caiu ou avisou mudança. */
export interface PropagandaSseEvento {
  conectado: boolean;
  mudou: boolean;
}

@Injectable({ providedIn: 'root' })
export class PropagandaService {

  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.API_URL + '/api/v1/propaganda';

  list(blocoId: number, posicao?: PropagandaPosicaoCode, pagina?: number): Observable<ReadAllPropagandaOutput> {
    let params = new HttpParams().set('blocoId', blocoId.toString());
    if (posicao) params = params.set('posicao', posicao);
    if (pagina != null) params = params.set('pagina', pagina.toString());
    return this.http.get<ReadAllPropagandaOutput>(this.baseUrl, { params });
  }

  /** Propagandas ativas (a grade usa para marcar os quadrados "Livre").
   *  Com `pagina`, só as daquela página da grade. */
  listAll(posicao?: PropagandaPosicaoCode, pagina?: number): Observable<ReadAllPropagandaOutput> {
    let params = new HttpParams();
    if (posicao) params = params.set('posicao', posicao);
    if (pagina != null) params = params.set('pagina', pagina.toString());
    return this.http.get<ReadAllPropagandaOutput>(this.baseUrl, { params: params.keys().length ? params : undefined });
  }

  create(payload: CreatePropagandaPayload): Observable<{ aId: number; aUuid: string; aMessage: string }> {
    return this.http.post<{ aId: number; aUuid: string; aMessage: string }>(this.baseUrl, payload);
  }

  patch(id: number, payload: PatchPropagandaPayload): Observable<{ aId: number; aUuid: string }> {
    return this.http.patch<{ aId: number; aUuid: string }>(`${this.baseUrl}/id/${id}`, payload);
  }

  remove(id: number): Observable<{ aId: number; aUuid: string }> {
    return this.http.delete<{ aId: number; aUuid: string }>(`${this.baseUrl}/id/${id}`);
  }

  /**
   * Pub/sub (SSE): emite quando a grade criar/editar/remover propaganda.
   * `conectado` segue o estado do canal (o EventSource reconecta sozinho);
   * nunca completa nem erra — quem assina decide o que fazer com a queda.
   */
  atualizacoes(): Observable<PropagandaSseEvento> {
    return new Observable<PropagandaSseEvento>(observer => {
      let es: EventSource | null = null;
      try {
        es = new EventSource(`${this.baseUrl}/events`);
        es.onopen = () => observer.next({ conectado: true, mudou: false });
        es.addEventListener('atualizado', () => observer.next({ conectado: true, mudou: true }));
        es.onerror = () => observer.next({ conectado: false, mudou: false });
      } catch {
        observer.next({ conectado: false, mudou: false });
      }
      return () => es?.close();
    });
  }
}
