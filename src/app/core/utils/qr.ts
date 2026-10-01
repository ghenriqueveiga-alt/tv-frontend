import { signal } from '@angular/core';
import QRCode from 'qrcode';

/** Textos cujo QR já está sendo gerado (evita disparos repetidos por tick). */
const gerando = new Set<string>();

/** QR pronto por texto. Signal: o template que leu volta a avaliar quando chega. */
const prontos = signal<Record<string, string>>({});

const PREFIXO_SVG = 'data:image/svg+xml;charset=utf-8,';

/**
 * URL do QR para o texto (SVG vetorial, fundo branco, módulos pretos),
 * gerada localmente com `qrcode`. Devolve `undefined` enquanto gera ou quando
 * o texto é vazio — o chamador mostra o placeholder nesses casos.
 *
 * Vira data URL de propósito: `[innerHTML]` passaria pelo sanitizer do Angular,
 * que descarta elementos `svg`.
 */
export function qrDataUrl(texto: string): string | undefined {
  if (!texto) return undefined;
  const pronto = prontos()[texto];
  if (pronto) return pronto;
  if (gerando.has(texto)) return undefined;

  gerando.add(texto);
  QRCode.toString(texto, {
    type: 'svg',
    width: 512,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
    .then(svg => {
      prontos.update(atual => ({ ...atual, [texto]: PREFIXO_SVG + encodeURIComponent(svg) }));
      gerando.delete(texto);
    })
    .catch(() => {
      gerando.delete(texto);
    });

  return undefined;
}
