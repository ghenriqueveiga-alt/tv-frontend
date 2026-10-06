/**
 * Pagamento em SOL pela carteira Phantom (extensão no desktop ou browser
 * embutido do app).
 *
 * A extensão não tem deep link de "abrir a tela de envio": para abrir a
 * confirmação com destinatário e valor é preciso montar a transferência e
 * chamar `signAndSendTransaction` do provider injetado (`window.phantom.solana`).
 * O `@solana/web3.js` é carregado só no clique (import dinâmico), então não
 * pesa no bundle inicial.
 */

const RPCS_SOLANA = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet-beta.solana.com',
];
const LAMPORTS_POR_SOL = 1_000_000_000;

type Web3 = typeof import('@solana/web3.js');

export interface ResultadoPhantom {
  ok: boolean;
  motivo: string;
}

interface ProvedorSolana {
  isPhantom?: boolean;
  publicKey?: unknown;
  connect(): Promise<{ publicKey: unknown }>;
  signAndSendTransaction(transacao: unknown): Promise<{ signature?: string }>;
}

function provedorSolana(): ProvedorSolana | null {
  const w = window as unknown as { phantom?: { solana?: ProvedorSolana }; solana?: ProvedorSolana };

  if (w.phantom?.solana) return w.phantom.solana;

  const solana = w.solana;
  return solana && typeof solana.signAndSendTransaction === 'function' ? solana : null;
}

/** Há uma carteira Solana injetada (extensão Phantom ou app embutido)? */
export function temProvedorSolana(): boolean {
  return provedorSolana() !== null;
}

/** Valor em SOL → lamports (9 casas); `null` quando inválido. */
export function lamportsDe(valor: number): number | null {
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return Math.round(valor * LAMPORTS_POR_SOL);
}

/**
 * Blockhash recente tentando os RPCs públicos em ordem — o oficial da Solana
 * costuma devolver 403/rate limit, então há um reserva. Nunca lança sem motivo.
 */
async function blockhashRecente(web3: Web3): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  let ultimo: unknown;

  for (const url of RPCS_SOLANA) {
    try {
      const conexao = new web3.Connection(url, 'confirmed');
      const r = await conexao.getLatestBlockhash('confirmed');

      if (r.blockhash) return r;
    } catch (erro) {
      ultimo = erro;
    }
  }

  throw ultimo instanceof Error ? ultimo : new Error('RPC da Solana indisponível.');
}

/**
 * Monta a transferência de SOL e pede para a Phantom assinar e enviar — é a
 * carteira que abre a tela de confirmação. Nunca lança: devolve `ok` + motivo.
 */
export async function pagarComPhantom(endereco: string, valor: number): Promise<ResultadoPhantom> {
  if (!endereco) {
    return { ok: false, motivo: 'Carteira ainda não configurada (environment.donations).' };
  }

  const lamports = lamportsDe(valor);

  if (lamports === null) {
    return { ok: false, motivo: 'Informe um valor maior que zero em SOL.' };
  }

  const provedor = provedorSolana();

  if (!provedor) {
    return { ok: false, motivo: 'Phantom não encontrada — instale a extensão ou escaneie o QR code.' };
  }

  let passo = 'conectar na Phantom';

  try {
    let pagador = provedor.publicKey;

    if (!pagador) {
      const sessao = await provedor.connect();
      pagador = sessao.publicKey;
    }

    passo = 'montar a transação';
    const web3 = await import('@solana/web3.js');

    let destino: InstanceType<typeof web3.PublicKey>;

    try {
      destino = new web3.PublicKey(endereco);
    } catch {
      return { ok: false, motivo: 'Endereço Solana inválido.' };
    }

    passo = 'buscar o blockhash na rede';
    const { blockhash, lastValidBlockHeight } = await blockhashRecente(web3);
    const carteiro = pagador as InstanceType<typeof web3.PublicKey>;

    const transacao = new web3.Transaction({
      feePayer: carteiro,
      recentBlockhash: blockhash,
    }).add(
      web3.SystemProgram.transfer({
        fromPubkey: carteiro,
        toPubkey: destino,
        lamports,
      }),
    );

    transacao.lastValidBlockHeight = lastValidBlockHeight;

    passo = 'abrir a confirmação de pagamento';
    await provedor.signAndSendTransaction(transacao);

    return { ok: true, motivo: 'Confirme o pagamento na Phantom.' };
  } catch (erro: unknown) {
    const codigo = (erro as { code?: number } | null)?.code;
    const mensagem = (erro as { message?: string } | null)?.message ?? '';

    if (codigo === 4001 || /reject|denied|cancel/i.test(mensagem)) {
      return { ok: false, motivo: 'Pagamento cancelado na Phantom.' };
    }

    if (/403|429|forbidden|too many|rate/i.test(mensagem)) {
      return {
        ok: false,
        motivo: 'A rede Solana está limitando as requisições — tente de novo em instantes.',
      };
    }

    return {
      ok: false,
      motivo: mensagem ? `Falha ao ${passo}: ${mensagem}` : `Falha ao ${passo}.`,
    };
  }
}
