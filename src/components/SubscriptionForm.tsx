import React, { useState, useEffect } from 'react';
import { Subscription, Currency, PaymentSource, PaymentMethod, BillingCycle, SubItem } from '../types';
import { X, Plus, Trash2, ChevronDown } from 'lucide-react';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';

interface SubscriptionFormProps {
  subscription?: Subscription;
  onSave: (sub: Subscription) => void;
  onClose: () => void;
}

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'TRY', 'ARS', 'INR', 'IDR', 'CAD', 'AUD', 'CHF', 'CNY', 'MXN', 'BTC', 'SATS'];
const PAYMENT_METHODS: PaymentMethod[] = ['Cartão de Crédito', 'Cartão de Débito', 'Gift Card', 'Pix', 'Transferência', 'Bitcoin', 'Outro'];
const PAYMENT_SOURCES = ['Revolut', 'N26', 'Nubank', 'Wise', 'Inter', 'Intesa Sanpaolo', 'Chase', 'Bank of America', 'Wells Fargo', 'Santander', 'Itaú', 'Bradesco', 'Caixa', 'Banco do Brasil', 'C6 Bank', 'Neon', 'Next', 'PicPay', 'Mercado Pago', 'PayPal', 'Stripe', 'Izybank', 'BBVA', 'Buddybank', 'Monzo', 'Starling', 'Bitrefill', 'Outro'];
const CATEGORIES = ['Streaming', 'Software', 'Games', 'Assinaturas', 'Utilidades', 'Educação', 'Moradia', 'Saúde', 'Outros'];

const POPULAR_APPS = [
  { name: 'Netflix', logo: 'https://www.google.com/s2/favicons?domain=netflix.com&sz=128' },
  { name: 'YouTube', logo: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128' },
  { name: 'Spotify', logo: 'https://www.google.com/s2/favicons?domain=spotify.com&sz=128' },
  { name: 'Amazon Prime', logo: 'https://www.google.com/s2/favicons?domain=amazon.com&sz=128' },
  { name: 'Disney+', logo: 'https://www.google.com/s2/favicons?domain=disneyplus.com&sz=128' },
  { name: 'Apple Music', logo: 'https://www.google.com/s2/favicons?domain=apple.com&sz=128' },
  { name: 'Xbox Game Pass', logo: 'https://www.google.com/s2/favicons?domain=xbox.com&sz=128' },
  { name: 'PlayStation Plus', logo: 'https://www.google.com/s2/favicons?domain=playstation.com&sz=128' },
  { name: 'Adobe Creative Cloud', logo: 'https://www.google.com/s2/favicons?domain=adobe.com&sz=128' },
  { name: 'Microsoft 365', logo: 'https://www.google.com/s2/favicons?domain=microsoft.com&sz=128' },
  { name: 'ChatGPT', logo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=128' },
  { name: 'GitHub Copilot', logo: 'https://www.google.com/s2/favicons?domain=github.com&sz=128' },
  { name: 'HBO Max', logo: 'https://www.google.com/s2/favicons?domain=hbomax.com&sz=128' },
  { name: 'Crunchyroll', logo: 'https://www.google.com/s2/favicons?domain=crunchyroll.com&sz=128' },
  { name: 'Google One', logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=128' },
  { name: 'iCloud', logo: 'https://www.google.com/s2/favicons?domain=apple.com&sz=128' },
  { name: 'Dropbox', logo: 'https://www.google.com/s2/favicons?domain=dropbox.com&sz=128' },
  { name: 'Notion', logo: 'https://www.google.com/s2/favicons?domain=notion.so&sz=128' },
  { name: 'Slack', logo: 'https://www.google.com/s2/favicons?domain=slack.com&sz=128' },
  { name: 'Zoom', logo: 'https://www.google.com/s2/favicons?domain=zoom.us&sz=128' },
  { name: 'Canva', logo: 'https://www.google.com/s2/favicons?domain=canva.com&sz=128' },
  { name: 'Figma', logo: 'https://www.google.com/s2/favicons?domain=figma.com&sz=128' },
  { name: 'Duolingo', logo: 'https://www.google.com/s2/favicons?domain=duolingo.com&sz=128' },
  { name: 'Tinder', logo: 'https://www.google.com/s2/favicons?domain=tinder.com&sz=128' },
  { name: 'Strava', logo: 'https://www.google.com/s2/favicons?domain=strava.com&sz=128' },
  { name: 'Gympass', logo: 'https://www.google.com/s2/favicons?domain=gympass.com&sz=128' },
  { name: 'Twitch', logo: 'https://www.google.com/s2/favicons?domain=twitch.tv&sz=128' },
  { name: 'Discord', logo: 'https://www.google.com/s2/favicons?domain=discord.com&sz=128' },
  { name: 'Patreon', logo: 'https://www.google.com/s2/favicons?domain=patreon.com&sz=128' },
];

const BANK_LOGOS: Record<string, string> = {
  'Revolut': 'https://www.google.com/s2/favicons?domain=revolut.com&sz=128',
  'N26': 'https://www.google.com/s2/favicons?domain=n26.com&sz=128',
  'Nubank': 'https://www.google.com/s2/favicons?domain=nubank.com.br&sz=128',
  'Wise': 'https://www.google.com/s2/favicons?domain=wise.com&sz=128',
  'Inter': 'https://www.google.com/s2/favicons?domain=bancointer.com.br&sz=128',
  'Intesa Sanpaolo': 'https://www.google.com/s2/favicons?domain=intesasanpaolo.com&sz=128',
  'Chase': 'https://www.google.com/s2/favicons?domain=chase.com&sz=128',
  'Bank of America': 'https://www.google.com/s2/favicons?domain=bankofamerica.com&sz=128',
  'Wells Fargo': 'https://www.google.com/s2/favicons?domain=wellsfargo.com&sz=128',
  'Santander': 'https://www.google.com/s2/favicons?domain=santander.com.br&sz=128',
  'Itaú': 'https://www.google.com/s2/favicons?domain=itau.com.br&sz=128',
  'Bradesco': 'https://www.google.com/s2/favicons?domain=bradesco.com.br&sz=128',
  'Caixa': 'https://www.google.com/s2/favicons?domain=caixa.gov.br&sz=128',
  'Banco do Brasil': 'https://www.google.com/s2/favicons?domain=bb.com.br&sz=128',
  'C6 Bank': 'https://www.google.com/s2/favicons?domain=c6bank.com.br&sz=128',
  'Neon': 'https://www.google.com/s2/favicons?domain=neon.com.br&sz=128',
  'Next': 'https://www.google.com/s2/favicons?domain=next.me&sz=128',
  'PicPay': 'https://www.google.com/s2/favicons?domain=picpay.com&sz=128',
  'Mercado Pago': 'https://www.google.com/s2/favicons?domain=mercadopago.com.br&sz=128',
  'PayPal': 'https://www.google.com/s2/favicons?domain=paypal.com&sz=128',
  'Stripe': 'https://www.google.com/s2/favicons?domain=stripe.com&sz=128',
  'Izybank': 'https://www.google.com/s2/favicons?domain=izybank.com.br&sz=128',
  'BBVA': 'https://www.google.com/s2/favicons?domain=bbva.com&sz=128',
  'Buddybank': 'https://www.google.com/s2/favicons?domain=buddybank.com&sz=128',
  'Monzo': 'https://www.google.com/s2/favicons?domain=monzo.com&sz=128',
  'Starling': 'https://www.google.com/s2/favicons?domain=starlingbank.com&sz=128',
};

export function SubscriptionForm({ subscription, onSave, onClose }: SubscriptionFormProps) {
  const { language } = useAppContext();
  const t = useTranslation(language);

  const [formData, setFormData] = useState<Partial<Subscription>>({
    name: '',
    type: 'Subscription',
    emoji: '📺',
    logoUrl: '',
    category: 'Streaming',
    costAmount: 0,
    costCurrency: 'BRL',
    billingCycle: 'Monthly',
    dueDate: 1,
    notes: '',
    isPromotional: false,
    originalCost: 0,
    promoEndDate: '',
    hasEarlyPayDiscount: false,
    earlyPayDate: 1,
    earlyPayCost: 0,
    fiatReferenceAmount: 0,
    fiatReferenceCurrency: 'USD',
    subItems: [],
    paymentMethod: 'Cartão de Crédito',
    paymentSource: 'Nubank',
    bankLogoUrl: BANK_LOGOS['Nubank'],
    hasCashback: false,
    cashbackPercentage: 0,
    hasIncome: false,
    incomeAmount: 0,
    incomeCurrency: 'BRL',
    incomeFrequency: 'Monthly',
    incomeSourceDescription: ''
  });

  const [customPaymentSource, setCustomPaymentSource] = useState('');
  const [isAppDropdownOpen, setIsAppDropdownOpen] = useState(false);
  const [suggestedLogo, setSuggestedLogo] = useState('');
  
  // Use string state for number inputs to allow empty values while typing
  const [costAmountStr, setCostAmountStr] = useState('0');
  const [originalCostStr, setOriginalCostStr] = useState('0');
  const [earlyPayCostStr, setEarlyPayCostStr] = useState('0');
  const [fiatReferenceAmountStr, setFiatReferenceAmountStr] = useState('0');

  useEffect(() => {
    if (formData.name && formData.name.length > 2 && !formData.logoUrl) {
      const cleanName = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      let domain = `${cleanName}.com`;
      if (cleanName === 'anhanguera') domain = 'anhanguera.com';
      else if (cleanName === 'usp') domain = 'usp.br';
      else if (cleanName === 'nubank') domain = 'nubank.com.br';
      
      setSuggestedLogo(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
    } else {
      setSuggestedLogo('');
    }
  }, [formData.name, formData.logoUrl]);

  useEffect(() => {
    if (subscription) {
      setFormData({
        ...subscription,
        subItems: subscription.subItems || [],
        notes: subscription.notes || '',
        isPromotional: subscription.isPromotional || false,
        promoEndDate: subscription.promoEndDate || '',
        hasEarlyPayDiscount: subscription.hasEarlyPayDiscount || false,
        earlyPayDate: subscription.earlyPayDate || 1,
      });
      setCostAmountStr(subscription.costAmount?.toString() || '0');
      setOriginalCostStr(subscription.originalCost?.toString() || '0');
      setEarlyPayCostStr(subscription.earlyPayCost?.toString() || '0');
      setFiatReferenceAmountStr(subscription.fiatReferenceAmount?.toString() || '0');
      
      if (subscription.paymentSource && !PAYMENT_SOURCES.includes(subscription.paymentSource)) {
        setFormData(prev => ({ ...prev, paymentSource: 'Outro' }));
        setCustomPaymentSource(subscription.paymentSource);
      }
    }
  }, [subscription]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (type === 'number') {
      setFormData(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData(prev => {
        const newData = { ...prev, [name]: value };
        if (name === 'paymentSource') {
          newData.bankLogoUrl = BANK_LOGOS[value] || '';
        }
        return newData;
      });
    }
  };

  const handleAddSubItem = () => {
    setFormData(prev => ({
      ...prev,
      subItems: [...(prev.subItems || []), { id: Date.now().toString(), name: '', costAmount: 0 }]
    }));
  };

  const handleRemoveSubItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      subItems: (prev.subItems || []).filter(item => item.id !== id)
    }));
  };

  const handleSubItemChange = (id: string, field: keyof SubItem, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      subItems: (prev.subItems || []).map(item => 
        item.id === id ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const finalPaymentSource = formData.paymentSource === 'Outro' && customPaymentSource.trim() !== '' 
      ? customPaymentSource.trim() 
      : formData.paymentSource;

    onSave({
      ...formData,
      costAmount: parseFloat(costAmountStr) || 0,
      originalCost: parseFloat(originalCostStr) || 0,
      earlyPayCost: parseFloat(earlyPayCostStr) || 0,
      fiatReferenceAmount: parseFloat(fiatReferenceAmountStr) || 0,
      paymentSource: finalPaymentSource,
      id: subscription?.id || Date.now().toString(),
    } as Subscription);
  };

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-colors">
        <div className="sticky top-0 bg-white dark:bg-[#1a1a1a] border-b border-gray-100/50 dark:border-gray-800/50 p-6 flex justify-between items-center z-10 rounded-t-2xl transition-colors">
          <h2 className="text-2xl font-serif font-medium text-gray-900 dark:text-white">
            {subscription ? t('form.edit') : t('form.new')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* Informações Básicas */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('form.basicInfo')}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.type') || 'Tipo'}</label>
                <select 
                  name="type"
                  value={formData.type || 'Subscription'}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                >
                  <option value="Subscription">{t('form.typeSubscription') || 'Assinatura'}</option>
                  <option value="FixedExpense">{t('form.typeFixedExpense') || 'Despesa Fixa (ex: Faculdade)'}</option>
                </select>
              </div>
              <div className="space-y-1 relative">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.popularApp')}</label>
                <div 
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer flex items-center justify-between dark:text-white transition-all hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setIsAppDropdownOpen(!isAppDropdownOpen)}
                >
                  <span className="text-gray-600 dark:text-gray-300">{t('form.selectApp')}</span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${isAppDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isAppDropdownOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                      {POPULAR_APPS.map(app => (
                        <div 
                          key={app.name}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-[#fdfbf7] dark:hover:bg-[#2a2a2a] rounded-lg cursor-pointer transition-colors"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, name: app.name, logoUrl: app.logo }));
                            setIsAppDropdownOpen(false);
                          }}
                        >
                          <img src={app.logo} alt={app.name} className="w-6 h-6 rounded-full object-cover bg-white shrink-0" referrerPolicy="no-referrer" />
                          <span className="text-sm text-gray-900 dark:text-white truncate">{app.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.name')}</label>
                <input 
                  type="text" 
                  name="name" 
                  required
                  value={formData.name} 
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  placeholder="Ex: YouTube Premium"
                />
              </div>
              <div className="flex gap-4">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.emoji')}</label>
                  <div className="flex items-center gap-3">
                    {formData.logoUrl ? (
                      <div className="relative group">
                        <img src={formData.logoUrl} alt="Logo" referrerPolicy="no-referrer" className="w-12 h-12 object-cover rounded-xl border border-gray-200 dark:border-gray-700 bg-white" />
                        <button type="button" onClick={() => setFormData(prev => ({...prev, logoUrl: ''}))} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X size={12}/></button>
                      </div>
                    ) : (
                      <input 
                        type="text" 
                        name="emoji" 
                        value={formData.emoji} 
                        onChange={handleChange}
                        className="w-12 h-12 px-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all text-center text-xl dark:text-white"
                      />
                    )}
                    
                    {suggestedLogo && !formData.logoUrl && (
                      <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-800">
                        <span className="text-xs text-blue-600 dark:text-blue-400">Sugestão:</span>
                        <button type="button" onClick={() => setFormData(prev => ({...prev, logoUrl: suggestedLogo}))} className="hover:opacity-80 transition-opacity">
                          <img src={suggestedLogo} alt="Suggested" className="w-8 h-8 rounded-full bg-white object-cover" referrerPolicy="no-referrer" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.category')}</label>
                  <select 
                    name="category" 
                    value={formData.category} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Custos */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('form.costs')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.amount')}</label>
                <input 
                  type="number" 
                  name="costAmount" 
                  step="0.01"
                  required
                  value={costAmountStr} 
                  onChange={(e) => setCostAmountStr(e.target.value)}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.currency')}</label>
                <select 
                  name="costCurrency" 
                  value={formData.costCurrency} 
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                >
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.cycle')}</label>
                <select 
                  name="billingCycle" 
                  value={formData.billingCycle} 
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                >
                  <option value="Monthly">{t('form.monthly')}</option>
                  <option value="Yearly">{t('form.yearly')}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.dueDate')}</label>
                <input 
                  type="number" 
                  name="dueDate" 
                  min="1" max="31"
                  required
                  value={formData.dueDate} 
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.paymentMethod')}</label>
                <select 
                  name="paymentMethod" 
                  value={formData.paymentMethod} 
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                >
                  {PAYMENT_METHODS.map(c => <option key={c} value={c}>{t(`pay.${c}` as any) === `pay.${c}` ? c : t(`pay.${c}` as any)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.paymentSource')}</label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {formData.bankLogoUrl && formData.paymentSource !== 'Outro' && (
                      <img src={formData.bankLogoUrl} alt="Bank" referrerPolicy="no-referrer" className="w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-700 object-cover bg-white" />
                    )}
                    <select 
                      name="paymentSource" 
                      value={formData.paymentSource} 
                      onChange={handleChange}
                      className="flex-1 px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                    >
                      {PAYMENT_SOURCES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {formData.paymentSource === 'Outro' && (
                    <input 
                      type="text" 
                      placeholder={t('form.customPaymentSource') || 'Digite o nome do banco/fonte...'}
                      value={customPaymentSource}
                      onChange={(e) => setCustomPaymentSource(e.target.value)}
                      className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white mt-2"
                    />
                  )}
                </div>
              </div>
            </div>

            {(formData.costCurrency === 'BTC' || formData.costCurrency === 'SATS') && (
              <div className="p-4 mt-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/50 rounded-2xl space-y-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                  ⚠️ {t('form.cryptoWarning')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-yellow-900 dark:text-yellow-100">{t('form.fiatReference')}</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required
                      value={fiatReferenceAmountStr} 
                      onChange={(e) => setFiatReferenceAmountStr(e.target.value)}
                      className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-yellow-200 dark:border-yellow-800/50 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-yellow-900 dark:text-yellow-100">{t('form.fiatCurrency')}</label>
                    <select 
                      name="fiatReferenceCurrency" 
                      value={formData.fiatReferenceCurrency} 
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-yellow-200 dark:border-yellow-800/50 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none transition-all dark:text-white"
                    >
                      {CURRENCIES.filter(c => c !== 'BTC' && c !== 'SATS').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Descontos e Promoções */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('form.discounts')}</h3>
            
            <div className="space-y-4">
              {/* Promotional Value Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="isPromotional"
                  checked={formData.isPromotional}
                  onChange={handleChange}
                  className="w-5 h-5 text-[#5A5A40] rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-[#5A5A40]"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{t('form.isPromotional')}</span>
              </label>

              {formData.isPromotional && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[#fdfbf7] dark:bg-[#121212] rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.originalCost')}</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={originalCostStr} 
                      onChange={(e) => setOriginalCostStr(e.target.value)}
                      className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.promoEndDate')}</label>
                    <input 
                      type="date" 
                      name="promoEndDate"
                      value={formData.promoEndDate || ''} 
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                    />
                    <p className="text-xs text-gray-500">{t('form.promoEndDateDesc')}</p>
                  </div>
                </div>
              )}

              {/* Early Pay Discount Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="hasEarlyPayDiscount"
                  checked={formData.hasEarlyPayDiscount}
                  onChange={handleChange}
                  className="w-5 h-5 text-[#5A5A40] rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-[#5A5A40]"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{t('form.hasEarlyPayDiscount')}</span>
              </label>

              {formData.hasEarlyPayDiscount && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-[#fdfbf7] dark:bg-[#121212] rounded-2xl border border-gray-200 dark:border-gray-700">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.earlyPayDate')}</label>
                    <input 
                      type="number" 
                      name="earlyPayDate"
                      min="1" max="31"
                      value={formData.earlyPayDate} 
                      onChange={handleChange}
                      className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.earlyPayCost')}</label>
                    <input 
                      type="number" 
                      step="0.01"
                      value={earlyPayCostStr} 
                      onChange={(e) => setEarlyPayCostStr(e.target.value)}
                      className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.notes')}</label>
              <textarea 
                name="notes" 
                value={formData.notes || ''} 
                onChange={handleChange as any}
                rows={3}
                placeholder={t('form.notesPlaceholder')}
                className="w-full px-4 py-3 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white resize-none"
              />
            </div>
          </div>

          {/* Sub-itens */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('form.subItems')}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('form.subItemsDesc')}</p>
              </div>
              <button 
                type="button" 
                onClick={handleAddSubItem}
                className="flex items-center gap-1 text-sm text-[#5A5A40] dark:text-[#d0d0a0] hover:text-[#4a4a34] dark:hover:text-[#e0e0b0] font-medium"
              >
                <Plus size={16} /> {t('form.addSubItem')}
              </button>
            </div>
            
            {formData.subItems && formData.subItems.length > 0 && (
              <div className="space-y-3">
                {formData.subItems.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 bg-[#fdfbf7] dark:bg-[#121212] p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                    <input 
                      type="text" 
                      placeholder="Nome do sub-item"
                      value={item.name}
                      onChange={(e) => handleSubItemChange(item.id, 'name', e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#5A5A40] dark:text-white"
                    />
                    <div className="relative w-32">
                      <input 
                        type="number" 
                        step="0.01"
                        placeholder="Valor"
                        value={item.costAmount}
                        onChange={(e) => handleSubItemChange(item.id, 'costAmount', parseFloat(e.target.value) || 0)}
                        className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#5A5A40] dark:text-white"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-xs font-medium">
                        {formData.costCurrency}
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => handleRemoveSubItem(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cashback */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                name="hasCashback"
                checked={formData.hasCashback}
                onChange={handleChange}
                className="w-5 h-5 text-[#5A5A40] rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-[#5A5A40]"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{t('form.hasCashback')}</span>
            </label>

            {formData.hasCashback && (
              <div className="p-4 bg-[#fdfbf7] dark:bg-[#121212] rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="space-y-1 max-w-xs">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.cashbackPercentage')}</label>
                  <input 
                    type="number" 
                    name="cashbackPercentage" 
                    step="0.1"
                    value={formData.cashbackPercentage} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Retorno Financeiro */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <label className="flex items-center gap-3 cursor-pointer">
              <input 
                type="checkbox" 
                name="hasIncome"
                checked={formData.hasIncome}
                onChange={handleChange}
                className="w-5 h-5 text-[#5A5A40] rounded border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-[#5A5A40]"
              />
              <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{t('form.hasIncome')}</span>
            </label>

            {formData.hasIncome && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#fdfbf7] dark:bg-[#121212] rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.incomeAmount')}</label>
                  <input 
                    type="number" 
                    name="incomeAmount" 
                    step="0.01"
                    value={formData.incomeAmount} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.currency')}</label>
                  <select 
                    name="incomeCurrency" 
                    value={formData.incomeCurrency} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.cycle')}</label>
                  <select 
                    name="incomeFrequency" 
                    value={formData.incomeFrequency} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  >
                    <option value="Monthly">{t('form.monthly')}</option>
                    <option value="Yearly">{t('form.yearly')}</option>
                  </select>
                </div>
                <div className="space-y-1 md:col-span-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.incomeDesc')}</label>
                  <input 
                    type="text" 
                    name="incomeSourceDescription" 
                    value={formData.incomeSourceDescription} 
                    onChange={handleChange}
                    placeholder="Ex: 5 amigos pagam 10 euros cada"
                    className="w-full px-4 py-2 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-[#fdfbf7] dark:bg-[#121212] hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors"
            >
              {t('form.cancel')}
            </button>
            <button 
              type="submit"
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#5A5A40] hover:bg-[#4a4a34] rounded-full transition-colors shadow-sm dark:bg-[#7a7a5c] dark:hover:bg-[#8a8a6c]"
            >
              {t('form.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
