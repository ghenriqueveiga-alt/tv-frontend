import { describe, expect, it } from 'vitest';
import { valorEmWeiHex } from './metamask';

describe('valorEmWeiHex', () => {
  it('converte decimais comuns de plano sem perder casas', () => {
    expect(valorEmWeiHex(1)).toBe('0x' + BigInt('1000000000000000000').toString(16));
    expect(valorEmWeiHex(0.001)).toBe('0x' + BigInt('1000000000000000').toString(16));
    expect(valorEmWeiHex(0.005)).toBe('0x' + BigInt('5000000000000000').toString(16));
    expect(valorEmWeiHex(0.01)).toBe('0x' + BigInt('10000000000000000').toString(16));
  });

  it('cobre valor zero e número inteiro grande', () => {
    expect(valorEmWeiHex(0)).toBe('0x0');
    expect(valorEmWeiHex(2)).toBe('0x' + BigInt('2000000000000000000').toString(16));
  });
});
