import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Anuncio {
  id: number;
  uuid: string;
  titulo: string;
  descricao: string;
  imageUrl: string;
  linkUrl: string;
  statusDesc: string;
  moeda: string;
  walletAddress: string;
  valorPago: number;
  txHash: string;
  posicao: number;
  largura: number;
  altura: number;
}

export interface CreateAnuncioPayload {
  titulo: string;
  descricao: string;
  imageUrl: string;
  linkUrl: string;
  moeda: string;
  walletAddress: string;
  txHash: string;
  posicao: number;
  largura: number;
  altura: number;
  valorPago: number;
}

export interface VerificacaoAnuncio {
  id: number;
  uuid: string;
  verificado: boolean;
  motivo: string;
  status: string;
}

@Injectable({ providedIn: 'root' })
export class AnuncioService {
  private http = inject(HttpClient);
  private baseUrl = environment.API_URL + '/api/v1/anuncio';

  /** Só anúncios ativos da posição (é o que o site exibe). */
  listByPosition(posicao: number): Observable<Anuncio[]> {
    return this.http.get<Anuncio[]>(this.baseUrl, { params: { posicao: posicao.toString() } });
  }

  /** Moderação: toda a carteira, opcionalmente filtrada por status (PE/PG/AT/RJ). */
  listAll(status?: string): Observable<Anuncio[]> {
    return this.http.get<Anuncio[]>(this.baseUrl, {
      params: status ? { status } : {},
    });
  }

  create(payload: CreateAnuncioPayload): Observable<{ uuid: string; message: string }> {
    return this.http.post<{ uuid: string; message: string }>(this.baseUrl, payload);
  }

  /** Atualiza campos e/ou o status ("PE" | "PG" | "AT" | "RJ"). */
  patch(id: number, payload: Partial<CreateAnuncioPayload> & { status?: string }): Observable<{ uuid: string; message: string }> {
    return this.http.patch<{ uuid: string; message: string }>(`${this.baseUrl}/id/${id}`, payload);
  }

  verificar(id: number): Observable<VerificacaoAnuncio> {
    return this.http.post<VerificacaoAnuncio>(`${this.baseUrl}/id/${id}/verificar`, null);
  }

  remove(id: number): Observable<{ uuid: string; message: string }> {
    return this.http.delete<{ uuid: string; message: string }>(`${this.baseUrl}/id/${id}`);
  }
}
