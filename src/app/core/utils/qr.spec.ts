import { qrDataUrl } from './qr';

describe('qrDataUrl', () => {
  it('não gera nada para texto vazio', () => {
    expect(qrDataUrl('')).toBeUndefined();
  });

  it('gera a data URL SVG do QR e a deixa em cache', async () => {
    const endereco = 'bc1qexemplo00000000000000000000000000';

    expect(qrDataUrl(endereco)).toBeUndefined();

    await vi.waitFor(() => expect(qrDataUrl(endereco)).toBeTruthy());

    const url = qrDataUrl(endereco);
    expect(url).toContain('data:image/svg+xml');
    expect(decodeURIComponent(url!.split(',')[1])).toContain('<svg');
    expect(qrDataUrl(endereco)).toBe(url);
  });
});
