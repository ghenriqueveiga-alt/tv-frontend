/**
 * Roteador de pagamento por carteira.
 *
 * - EVM (Ethereum, BNB Chain, Polygon) → MetaMask/Phantom EVM (metamask.ts).
 * - Solana → extensão Phantom (monta a transferência e abre a confirmação);
 *   sem extensão, deep link Solana Pay no celular; no desktop, QR/aviso.
 * - Bitcoin → deep link BIP-21 no celular; no desktop, QR/aviso.
 * - Tron → o Phantom não suporta a rede; Lightning é manual: recusa com aviso.
 */

import { nomeDaMoeda, pagarComMetaMask, redeDe, type ResultadoMetaMask } from './metamask';
import { pagarComPhantom, temProvedorSolana } from './solana';

export interface ResultadoCarteira extends ResultadoMetaMask {
  /** `true` → chamar de novo informando o valor (Phantom em SOL sem valor). */
  precisaValor?: boolean;
}

function chave(moeda: string): string {
  return (moeda ?? '').trim().toLowerCase();
}

function ehBitcoin(moeda: string): boolean {
  const m = chave(moeda);
  return m === 'bitcoin' || m === 'btc';
}

function ehSolana(moeda: string): boolean {
  const m = chave(moeda);
  return m === 'solana' || m === 'sol';
}

/**
 * URI de pagamento no padrão da moeda: `bitcoin:<addr>?amount=` (BIP-21) e
 * `solana:<addr>?amount=` (Solana Pay). Escanear/clicar já abre a carteira
 * com destinatário (e valor, quando informado) preenchidos.
 * Devolve `null` para moedas sem deep link.
 */
export function uriDePagamento(endereco: string, moeda: string, valor?: number): string | null {
  if (!endereco) return null;

  const temValor = typeof valor === 'number' && valor > 0;
  const casas = ehSolana(moeda) ? 9 : 8;
  const texto = temValor
    ? `?amount=${valor.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: casas })}`
    : '';

  if (ehBitcoin(moeda)) return `bitcoin:${endereco}${texto}`;
  if (ehSolana(moeda)) return `solana:${endereco}${texto}`;
  return null;
}

/** Celular/tablet: deep link de esquema (`bitcoin:`, `solana:`) só existe neles. */
function ehCelular(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Tenta abrir a carteira da moeda para o endereço informado. Nunca lança:
 * devolve sempre `ok` + mensagem pronta para exibir (toast/aviso do modal).
 */
export async function pagarComCarteira(
  endereco: string,
  moeda: string,
  valor?: number,
): Promise<ResultadoCarteira> {
  if (!endereco) {
    return { ok: false, motivo: 'Carteira ainda não configurada (environment.donations).' };
  }

  if (redeDe(moeda)) {
    return pagarComMetaMask(endereco, moeda, valor);
  }

  const nome = nomeDaMoeda(moeda);
  const m = chave(moeda);

  if (m === 'tron' || m === 'trx') {
    return {
      ok: false,
      motivo: `O Phantom não suporta Tron — escaneie o QR code ou copie o endereço.`,
    };
  }

  if (m === 'lightning' || m === 'ln') {
    return { ok: false, motivo: 'Lightning Network é manual — escaneie o QR code ou copie o endereço.' };
  }

  if (ehSolana(moeda) || ehBitcoin(moeda)) {
    const uri = uriDePagamento(endereco, moeda, valor);

    if (!uri) {
      return { ok: false, motivo: `Não há pagamento automático para ${nome} — escaneie o QR code.` };
    }

    // Extensão/app da Phantom: monta a transferência e abre a confirmação.
    if (ehSolana(moeda) && temProvedorSolana()) {
      if (valor && valor > 0) {
        return pagarComPhantom(endereco, valor);
      }

      return {
        ok: false,
        precisaValor: true,
        motivo: 'Escolha o valor para pagar com a Phantom.',
      };
    }

    // Celular sem extensão: deep link (BIP-21 / Solana Pay) abre a carteira.
    if (ehCelular()) {
      window.location.href = uri;
      return { ok: true, motivo: `Abrindo a carteira de ${nome}. Se não abrir, escaneie o QR code.` };
    }

    return {
      ok: false,
      motivo: `No computador não dá para abrir a carteira de ${nome} — escaneie o QR code com o celular.`,
    };
  }

  return {
    ok: false,
    motivo: `Não há pagamento automático para ${nome} — escaneie o QR code ou copie o endereço.`,
  };
}
