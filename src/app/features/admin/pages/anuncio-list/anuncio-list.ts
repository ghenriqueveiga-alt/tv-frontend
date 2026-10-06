import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnuncioService, Anuncio } from '../../../../core/services/anuncio.service';

@Component({
  selector: 'app-anuncio-list',
  imports: [RouterLink],
  templateUrl: './anuncio-list.html',
  styleUrl: './anuncio-list.css',
})
export class AnuncioList implements OnInit {
  private anuncioService = inject(AnuncioService);

  readonly anuncios = signal<Anuncio[]>([]);
  readonly carregando = signal(false);
  /** null = todos os status. */
  readonly filtro = signal<string | null>(null);
  readonly mensagem = signal<string | null>(null);
  readonly erro = signal<string | null>(null);
  readonly confirmandoRemocao = signal<number | null>(null);
  readonly aguardando = signal<number | null>(null);
  /** Último motivo devolvido pela verificação em blockchain, por anúncio. */
  readonly motivos = signal<Record<number, string>>({});

  readonly posicoes = ['Header (728x90)', 'Sidebar (300x250)', 'Rodapé (970x250)'];
  readonly filtros = [
    { label: 'Todos', valor: null as string | null },
    { label: 'Pendentes', valor: 'PE' },
    { label: 'Pagos', valor: 'PG' },
    { label: 'Ativos', valor: 'AT' },
    { label: 'Reprovados', valor: 'RJ' },
  ];

  readonly contagem = computed(() => ({
    todos: this.anuncios().length,
    pendentes: this.anuncios().filter(a => a.statusDesc === 'Pending').length,
    pagos: this.anuncios().filter(a => a.statusDesc === 'Paid').length,
    ativos: this.anuncios().filter(a => a.statusDesc === 'Active').length,
  }));

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);

    this.anuncioService.listAll(this.filtro() ?? undefined).subscribe({
      next: lista => {
        this.anuncios.set(lista);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set('Erro ao carregar os anúncios.');
        this.carregando.set(false);
      },
    });
  }

  filtrar(valor: string | null): void {
    this.filtro.set(valor);
    this.carregar();
  }

  rotuloStatus(anuncio: Anuncio): string {
    switch (anuncio.statusDesc) {
      case 'Pending': return 'Pendente';
      case 'Paid': return 'Pago';
      case 'Active': return 'Ativo';
      case 'Rejected': return 'Reprovado';
      default: return anuncio.statusDesc ?? '-';
    }
  }

  classeStatus(anuncio: Anuncio): string {
    switch (anuncio.statusDesc) {
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Paid': return 'bg-blue-100 text-blue-800';
      case 'Active': return 'bg-green-100 text-green-800';
      case 'Rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  verificar(anuncio: Anuncio): void {
    this.limparAvisos();
    this.aguardando.set(anuncio.id);

    this.anuncioService.verificar(anuncio.id).subscribe({
      next: resultado => {
        this.motivos.update(m => ({ ...m, [anuncio.id]: resultado.motivo }));
        this.mensagem.set(resultado.verificado
          ? 'Pagamento confirmado na blockchain.'
          : 'Verificação não aprovou: ' + resultado.motivo);
        this.aguardando.set(null);
        this.carregar();
      },
      error: err => {
        this.erro.set(err.error?.errors?.[0]?.message ?? 'Falha ao consultar a blockchain.');
        this.aguardando.set(null);
      },
    });
  }

  mudarStatus(anuncio: Anuncio, status: 'AT' | 'RJ'): void {
    this.limparAvisos();
    this.aguardando.set(anuncio.id);

    this.anuncioService.patch(anuncio.id, { status }).subscribe({
      next: () => {
        this.mensagem.set(status === 'AT'
          ? 'Anúncio publicado (ativo no site).'
          : 'Anúncio reprovado.');
        this.aguardando.set(null);
        this.carregar();
      },
      error: err => {
        this.erro.set(err.error?.errors?.[0]?.message ?? 'Erro ao atualizar o anúncio.');
        this.aguardando.set(null);
      },
    });
  }

  pedirRemocao(anuncio: Anuncio): void {
    this.confirmandoRemocao.set(anuncio.id);
  }

  cancelarRemocao(): void {
    this.confirmandoRemocao.set(null);
  }

  remover(anuncio: Anuncio): void {
    this.limparAvisos();
    this.confirmandoRemocao.set(null);
    this.aguardando.set(anuncio.id);

    this.anuncioService.remove(anuncio.id).subscribe({
      next: () => {
        this.mensagem.set('Anúncio removido.');
        this.aguardando.set(null);
        this.carregar();
      },
      error: () => {
        this.erro.set('Erro ao remover o anúncio.');
        this.aguardando.set(null);
      },
    });
  }

  private limparAvisos(): void {
    this.mensagem.set(null);
    this.erro.set(null);
  }

  fmtValor(anuncio: Anuncio): string {
    return `${anuncio.valorPago} ${anuncio.moeda}`;
  }
}
