import { describe, expect, it } from 'vitest';
import { lamportsDe, pagarComPhantom, temProvedorSolana } from './solana';

const SOL = '8261Mjoa7aEPkhdg43HJryL1xHSwZWrL4mmqvnyYmPWH';

describe('lamportsDe', () => {
  it('converte SOL em lamports com 9 casas', () => {
    expect(lamportsDe(1)).toBe(1_000_000_000);
    expect(lamportsDe(0.01)).toBe(10_000_000);
    expect(lamportsDe(0.000000001)).toBe(1);
  });

  it('recusa valor não positivo ou inválido', () => {
    expect(lamportsDe(0)).toBeNull();
    expect(lamportsDe(-1)).toBeNull();
    expect(lamportsDe(NaN)).toBeNull();
    expect(lamportsDe(Infinity)).toBeNull();
  });
});

describe('temProvedorSolana', () => {
  it('falso no jsdom (sem extensão injetada)', () => {
    expect(temProvedorSolana()).toBe(false);
  });
});

describe('pagarComPhantom', () => {
  it('valida o valor antes de qualquer coisa', async () => {
    const r = await pagarComPhantom(SOL, 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('valor');
  });

  it('sem extensão injetada devolve aviso de Phantom', async () => {
    const r = await pagarComPhantom(SOL, 0.01);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('Phantom');
  });
});
