import { describe, expect, it } from 'vitest';
import { pagarComCarteira, uriDePagamento } from './carteira';

const BTC = 'bc1qmp9z67g7w7w36e0q5swdqhmhzd9dka0p6jmah2';
const SOL = '8261Mjoa7aEPkhdg43HJryL1xHSwZWrL4mmqvnyYmPWH';

describe('uriDePagamento', () => {
  it('monta BIP-21 para Bitcoin com e sem valor', () => {
    expect(uriDePagamento(BTC, 'BTC', 0.001)).toBe(`bitcoin:${BTC}?amount=0.001`);
    expect(uriDePagamento(BTC, 'bitcoin')).toBe(`bitcoin:${BTC}`);
  });

  it('monta Solana Pay para Solana com e sem valor', () => {
    expect(uriDePagamento(SOL, 'solana', 0.01)).toBe(`solana:${SOL}?amount=0.01`);
    expect(uriDePagamento(SOL, 'sol')).toBe(`solana:${SOL}`);
  });

  it('devolve null para EVM, Tron, Lightning e endereço vazio', () => {
    expect(uriDePagamento(BTC, 'ethereum', 1)).toBeNull();
    expect(uriDePagamento(BTC, 'tron')).toBeNull();
    expect(uriDePagamento(BTC, 'ln')).toBeNull();
    expect(uriDePagamento('', 'btc')).toBeNull();
  });

  it('respeita as casas da moeda no amount', () => {
    expect(uriDePagamento(BTC, 'BTC', 0.000000012345)).toBe(`bitcoin:${BTC}?amount=0.00000001`);
    expect(uriDePagamento(SOL, 'SOL', 0.1234567891)).toBe(`solana:${SOL}?amount=0.123456789`);
  });
});

describe('pagarComCarteira', () => {
  it('recusa com endereço não configurado', async () => {
    const r = await pagarComCarteira('', 'BTC');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('configurada');
  });

  it('explica que o Phantom não suporta Tron', async () => {
    const r = await pagarComCarteira(BTC, 'TRX');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('Phantom');
    expect(r.motivo).toContain('Tron');
  });

  it('recusa Lightning com aviso de QR', async () => {
    const r = await pagarComCarteira(BTC, 'LN');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('QR');
  });

  it('no desktop, Bitcoin/Solana pedem QR em vez de deep link', async () => {
    const r = await pagarComCarteira(SOL, 'solana');
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('computador');
    expect(r.motivo).toContain('QR');
  });
});
