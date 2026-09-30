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
}

export interface PatchPropagandaPayload {
  aNome?: string;
  aDuracaoSeg?: number;
  aOrdem?: number;
}

@Injectable({ providedIn: 'root' })
export class PropagandaService {

  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.API_URL + '/api/v1/propaganda';

  list(blocoId: number, posicao?: PropagandaPosicaoCode): Observable<ReadAllPropagandaOutput> {
    let params = new HttpParams().set('blocoId', blocoId.toString());
    if (posicao) params = params.set('posicao', posicao);
    return this.http.get<ReadAllPropagandaOutput>(this.baseUrl, { params });
  }

  /** Todas as propagandas ativas (a grade usa para marcar os quadrados "Livre"). */
  listAll(posicao?: PropagandaPosicaoCode): Observable<ReadAllPropagandaOutput> {
    const params = posicao ? new HttpParams().set('posicao', posicao) : undefined;
    return this.http.get<ReadAllPropagandaOutput>(this.baseUrl, { params });
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
}
