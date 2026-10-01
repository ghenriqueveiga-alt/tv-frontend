import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnuncioService, CreateAnuncioPayload } from '../../../../core/services/anuncio.service';
import { qrDataUrl as gerarQrDataUrl } from '../../../../core/utils/qr';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-advertise',
  imports: [FormsModule],
  templateUrl: './advertise.html',
  styleUrl: './advertise.css',
})
export class Advertise {
  private adService = inject(AnuncioService);

  readonly submitted = signal(false);
  readonly submitting = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  form: CreateAnuncioPayload = {
    titulo: '',
    descricao: '',
    imageUrl: '',
    linkUrl: '',
    moeda: 'BTC',
    walletAddress: '',
    txHash: '',
    posicao: 0,
    largura: 728,
    altura: 90,
    valorPago: 0,
  };

  readonly wallets = [
    { coin: 'Bitcoin', symbol: 'BTC', address: environment.donations.bitcoin, color: '#f7931a', icon: '₿', priceRef: '~$60,000' },
    { coin: 'Ethereum', symbol: 'ETH', address: environment.donations.ethereum, color: '#627eea', icon: 'Ξ', priceRef: '~$3,000' },
    { coin: 'Lightning', symbol: 'LN', address: environment.donations.lightning, color: '#7b61ff', icon: '⚡', priceRef: 'Instant' },
  ];

  /** QR gerado localmente (mesmo cache do player). */
  readonly qrDataUrl = gerarQrDataUrl;

  readonly plans = [
    { name: 'Basico', posicao: 1, largura: 300, altura: 250, price: 0.001, desc: 'Sidebar banner (300x250)' },
    { name: 'Premium', posicao: 0, largura: 728, altura: 90, price: 0.005, desc: 'Header banner (728x90)' },
    { name: 'Destaque', posicao: 2, largura: 970, altura: 250, price: 0.01, desc: 'Footer banner (970x250)' },
  ];

  selectedPlan = this.plans[0];

  selectPlan(plan: typeof this.plans[0]) {
    this.selectedPlan = plan;
    this.form.posicao = plan.posicao;
    this.form.largura = plan.largura;
    this.form.altura = plan.altura;
    this.form.valorPago = plan.price;
  }

  async onSubmit() {
    if (!this.form.titulo || !this.form.linkUrl || !this.form.txHash) {
      this.errorMsg.set('Preencha todos os campos obrigatorios.');
      return;
    }

    this.submitting.set(true);
    this.errorMsg.set(null);

    this.adService.create(this.form).subscribe({
      next: (res) => {
        this.submitted.set(true);
        this.successMsg.set(res.message);
        this.submitting.set(false);
      },
      error: (err) => {
        this.errorMsg.set(err.error?.error || 'Erro ao enviar anuncio.');
        this.submitting.set(false);
      },
    });
  }
}
