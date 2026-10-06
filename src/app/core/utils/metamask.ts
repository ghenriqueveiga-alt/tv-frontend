/**
 * Abre a carteira EVM (MetaMask, ou Phantom quando é a única instalada) já na
 * tela de pagamento: troca para a rede da moeda, pede a conta e dispara
 * `eth_sendTransaction` com destinatário (e valor, quando informado) preenchidos.
 *
 * Só redes EVM (Ethereum, BNB Chain, Polygon) rodam por aqui — para as demais
 * use `pagarComCarteira` em `core/utils/carteira.ts`, que roteia Bitcoin/Solana
 * pelo deep link da carteira (Phantom) e recusa Tron/Lightning com aviso.
 */

export interface ResultadoMetaMask {
  ok: boolean;
  motivo: string;
}

interface RedeEvm {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
}

const REDES: Record<string, RedeEvm> = {
  ethereum: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://ethereum.publicnode.com'],
    blockExplorerUrls: ['https://etherscan.io'],
  },
  binance: {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  polygon: {
    chainId: '0x89',
    chainName: 'Polygon Mainnet',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
  },
};

/** Rede EVM da moeda (sinônimos aceitos) ou `null` quando não é EVM. */
export function redeDe(moeda: string): RedeEvm | null {
  const m = (moeda ?? '').trim().toLowerCase();

  switch (m) {
    case 'ethereum':
    case 'eth':
      return REDES['ethereum'];
    case 'binance':
    case 'bnb':
    case 'bnb chain':
    case 'bsc':
      return REDES['binance'];
    case 'polygon':
    case 'pol':
    case 'matic':
      return REDES['polygon'];
    default:
      return null;
  }
}

/** Nome legível da moeda para as mensagens de recusa. */
export function nomeDaMoeda(moeda: string): string {
  const m = (moeda ?? '').trim().toLowerCase();
  const nomes: Record<string, string> = {
    bitcoin: 'Bitcoin',
    btc: 'Bitcoin',
    solana: 'Solana',
    sol: 'Solana',
    tron: 'Tron',
    trx: 'Tron',
    lightning: 'Lightning Network',
    ln: 'Lightning Network',
  };
  return nomes[m] ?? (moeda?.trim() || 'essa moeda');
}

/** Valor decimal → `0x` + wei (hex), sem ponto flutuante perdendo casas. */
export function valorEmWeiHex(valor: number): string {
  const texto = valor.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 18,
  });
  const [inteiro, fracionario = ''] = texto.split('.');
  const CEM = BigInt('1000000000000000000');
  const casas = BigInt((fracionario + '0'.repeat(18)).slice(0, 18) || '0');
  return '0x' + ((BigInt(inteiro || '0') * CEM) + casas).toString(16);
}

/** Link universal: abre o app da MetaMask no envio (usado sem extensão). */
function linkUniversal(endereco: string, rede: RedeEvm, valor?: number): string {
  const valorParam = valor && valor > 0 ? `?value=${valorEmWeiHex(valor)}` : '';
  return `https://metamask.app.link/send/${endereco}@${rede.chainId}${valorParam}`;
}

interface Eip1193 {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193[];
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

/**
 * Provedor EVM injetado, na ordem: MetaMask de verdade (inclusive quando há
 * vários provedores na lista `window.ethereum.providers`), depois a Phantom
 * (que também injeta `window.ethereum`/`window.phantom.ethereum`), depois
 * qualquer outro EIP-1193. Devolve o nome legível para as mensagens.
 */
function provedorEvm(): { provedor: Eip1193; nome: string } | null {
  const w = window as unknown as { ethereum?: Eip1193; phantom?: { ethereum?: Eip1193 } };
  const eth = w.ethereum;

  const metaMask = Array.isArray(eth?.providers)
    ? eth.providers.find((p) => p.isMetaMask && !p.isPhantom)
    : eth && eth.isMetaMask && !eth.isPhantom
      ? eth
      : null;

  if (metaMask) return { provedor: metaMask, nome: 'MetaMask' };

  const phantom = eth && eth.isPhantom ? eth : w.phantom?.ethereum ?? null;

  if (phantom) return { provedor: phantom, nome: 'Phantom' };

  if (eth) return { provedor: eth, nome: eth.isMetaMask ? 'MetaMask' : 'carteira' };

  return null;
}

/**
 * Garante que o provedor está na rede da moeda. Se já está, não pede troca
 * (evita o erro de provedores que não implementam `wallet_switchEthereumChain`).
 * Devolve `null` quando pode seguir, ou o resultado de recusa com o motivo.
 */
async function garantirRede(
  provedor: Eip1193,
  nome: string,
  rede: RedeEvm,
): Promise<ResultadoMetaMask | null> {
  let atual: string | null = null;

  try {
    atual = ((await provedor.request({ method: 'eth_chainId' })) as string) ?? null;
  } catch {
    // Provedor não respondeu: tenta a troca mesmo assim.
  }

  if (atual === rede.chainId) return null;

  try {
    await provedor.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: rede.chainId }],
    });
    return null;
  } catch (erro: unknown) {
    const codigo = (erro as { code?: number } | null)?.code;
    const mensagem = (erro as { message?: string } | null)?.message ?? '';

    if (codigo === 4902) {
      // Rede ainda não cadastrada na carteira do usuário.
      try {
        await provedor.request({
          method: 'wallet_addEthereumChain',
          params: [{ ...rede }],
        });
        return null;
      } catch {
        return {
          ok: false,
          motivo: `A ${nome} não tem a rede ${rede.chainName} — abra a carteira, troque para essa rede e tente de novo.`,
        };
      }
    }

    if (codigo === 4001) {
      return { ok: false, motivo: `Troca de rede cancelada na ${nome}.` };
    }

    if (codigo === -32601 || /unrecognized method|not (yet )?supported|not implemented/i.test(mensagem)) {
      return {
        ok: false,
        motivo: `A ${nome} não troca de rede sozinha — abra a carteira, selecione ${rede.chainName} e tente de novo.`,
      };
    }

    return {
      ok: false,
      motivo: `Não foi possível trocar para ${rede.chainName} na ${nome}${mensagem ? `: ${mensagem}` : '.'}`,
    };
  }
}

/**
 * Tenta abrir a carteira EVM já na tela de pagamento. Nunca lança: devolve
 * sempre um resultado com `ok` + mensagem pronta para exibir ao usuário.
 */
export async function pagarComMetaMask(
  endereco: string,
  moeda: string,
  valor?: number,
): Promise<ResultadoMetaMask> {
  if (!endereco) {
    return { ok: false, motivo: 'Carteira ainda não configurada (environment.donations).' };
  }

  const rede = redeDe(moeda);

  if (!rede) {
    return {
      ok: false,
      motivo: `A MetaMask não faz pagamentos em ${nomeDaMoeda(moeda)} — escaneie o QR code ou copie o endereço.`,
    };
  }

  const info = provedorEvm();

  if (!info) {
    // Sem extensão (desktop) ou fora dela: tenta o app pelo link universal.
    window.open(linkUniversal(endereco, rede, valor), '_blank', 'noopener');
    return {
      ok: true,
      motivo: 'Abrindo a MetaMask. Se ela não abrir, instale a extensão/app e escaneie o QR.',
    };
  }

  const { provedor, nome } = info;

  // A Phantom não tem a BNB Chain: avisar antes de pedir uma troca impossível.
  if (nome === 'Phantom' && rede.chainId === '0x38') {
    return {
      ok: false,
      motivo: 'A Phantom não suporta a BNB Chain — pague com a MetaMask ou escaneie o QR code.',
    };
  }

  const recusa = await garantirRede(provedor, nome, rede);

  if (recusa) return recusa;

  try {
    const contas = (await provedor.request({ method: 'eth_requestAccounts' })) as string[];

    if (!contas || contas.length === 0) {
      return { ok: false, motivo: `Nenhuma conta liberada na ${nome}.` };
    }

    const transacao: Record<string, string> = { from: contas[0], to: endereco };
    if (valor && valor > 0) {
      transacao['value'] = valorEmWeiHex(valor);
    }

    await provedor.request({
      method: 'eth_sendTransaction',
      params: [transacao],
    });

    return { ok: true, motivo: `Confirme o pagamento na ${nome}.` };
  } catch (erro: unknown) {
    const codigo = (erro as { code?: number } | null)?.code;

    if (codigo === 4001) {
      return { ok: false, motivo: `Pagamento cancelado na ${nome}.` };
    }

    const mensagem = (erro as { message?: string } | null)?.message;
    return { ok: false, motivo: mensagem ? `${nome}: ${mensagem}` : `Falha ao abrir o pagamento na ${nome}.` };
  }
}
