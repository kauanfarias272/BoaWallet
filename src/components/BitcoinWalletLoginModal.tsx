import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useAppContext } from '../AppContext';
import {
  BitcoinWalletLoginConfig,
  readBitcoinWalletLoginConfig,
} from '../lib/bitcoinWalletAuth';

interface BitcoinWalletLoginModalProps {
  loading?: boolean;
  onClose: () => void;
  onSubmit: (config: BitcoinWalletLoginConfig) => Promise<void> | void;
}

export function BitcoinWalletLoginModal({
  loading = false,
  onClose,
  onSubmit,
}: BitcoinWalletLoginModalProps) {
  const savedConfig = readBitcoinWalletLoginConfig();
  const { language } = useAppContext();
  const [base, setBase] = useState(savedConfig.base);
  const [invoiceKey, setInvoiceKey] = useState(savedConfig.invoiceKey);
  const [adminKey, setAdminKey] = useState(savedConfig.adminKey);

  const tx = (pt: string, en: string, es: string, it: string) =>
    ({ pt, en, es, it }[language as 'pt' | 'en' | 'es' | 'it'] ?? en);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({
      base,
      invoiceKey,
      adminKey,
    });
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-3xl border border-[#5A5A40]/50 bg-[#131313] shadow-2xl p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#d0d0a0] text-[#0a0a0a] flex items-center justify-center">
              <Wallet size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {tx(
                  'Entrar com carteira Bitcoin',
                  'Sign in with Bitcoin wallet',
                  'Entrar con cartera Bitcoin',
                  'Accedi con wallet Bitcoin'
                )}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {tx(
                  'Use a sua carteira Lightning/LNbits pessoal para criar uma conta alternativa no app.',
                  'Use your personal Lightning/LNbits wallet to create an alternative app account.',
                  'Usa tu cartera Lightning/LNbits personal para crear una cuenta alternativa en la app.',
                  'Usa il tuo wallet Lightning/LNbits personale per creare un account alternativo nell app.'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-white transition-colors text-xl leading-none disabled:opacity-50"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-[#0f0f0f] p-4 text-xs text-gray-400 leading-relaxed">
          {tx(
            'Recomendado: use uma wallet LNbits sua. O app valida a posse da carteira e gera uma credencial privada para login.',
            'Recommended: use your own LNbits wallet. The app validates wallet ownership and generates a private credential for login.',
            'Recomendado: usa una wallet LNbits propia. La app valida la posesion de la cartera y genera una credencial privada para iniciar sesion.',
            'Consigliato: usa un wallet LNbits tuo. L app valida il possesso del wallet e genera una credenziale privata per l accesso.'
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              Base URL
            </label>
            <input
              value={base}
              onChange={(event) => setBase(event.target.value)}
              placeholder="https://your-wallet.lnbits.com"
              className="w-full bg-[#1b1b1b] border border-gray-700 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#d0d0a0]/50"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              Invoice Key
            </label>
            <input
              value={invoiceKey}
              onChange={(event) => setInvoiceKey(event.target.value)}
              placeholder={tx('Chave de invoice da carteira', 'Wallet invoice key', 'Clave invoice de la cartera', 'Chiave invoice del wallet')}
              className="w-full bg-[#1b1b1b] border border-gray-700 rounded-2xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#d0d0a0]/50"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">
              Admin Key
            </label>
            <input
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
              placeholder={tx('Chave admin da carteira', 'Wallet admin key', 'Clave admin de la cartera', 'Chiave admin del wallet')}
              className="w-full bg-[#1b1b1b] border border-gray-700 rounded-2xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#d0d0a0]/50"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-2xl border border-gray-700 bg-[#1a1a1a] text-gray-300 py-3 font-semibold hover:bg-[#222] transition-colors disabled:opacity-50"
          >
            {tx('Cancelar', 'Cancel', 'Cancelar', 'Annulla')}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-2xl bg-[#d0d0a0] text-[#0a0a0a] py-3 font-bold hover:bg-[#e0e0b2] transition-colors disabled:opacity-60"
          >
            {loading
              ? tx('Validando carteira...', 'Validating wallet...', 'Validando cartera...', 'Validazione wallet...')
              : tx('Entrar com Bitcoin', 'Sign in with Bitcoin', 'Entrar con Bitcoin', 'Accedi con Bitcoin')}
          </button>
        </div>
      </form>
    </div>
  );
}
