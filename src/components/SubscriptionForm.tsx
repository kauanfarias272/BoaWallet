import React, { useState, useEffect } from 'react';
import { Subscription, Currency, PaymentSource, PaymentMethod, BillingCycle, SubItem } from '../types';
import { X, Plus, Trash2, ChevronDown, ArrowDownRight, CheckCircle2, Users } from 'lucide-react';
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

const CATEGORY_DEFAULT_EMOJIS: Record<string, string> = {
  'Streaming': '📺',
  'Software': '💻',
  'Games': '🎮',
  'Assinaturas': '📜',
  'Utilidades': '💡',
  'Educação': '📚',
  'Moradia': '🏠',
  'Saúde': '🏥',
  'Outros': '📦'
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
    dueMonth: new Date().getMonth() + 1,
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
    incomeSourceDescription: '',
    isSingleExpense: false,
    isFlexibleDate: false,
    sharedWith: []
  });

  const [customPaymentSource, setCustomPaymentSource] = useState('');
  const [isAppDropdownOpen, setIsAppDropdownOpen] = useState(false);
  const [suggestedLogo, setSuggestedLogo] = useState('');
  
  const [costAmountStr, setCostAmountStr] = useState('0');
  const [originalCostStr, setOriginalCostStr] = useState('0');
  const [earlyPayCostStr, setEarlyPayCostStr] = useState('0');
  const [fiatReferenceAmountStr, setFiatReferenceAmountStr] = useState('0');
  const [dueDateStr, setDueDateStr] = useState('1');
  const [dueMonthStr, setDueMonthStr] = useState(String(new Date().getMonth() + 1));
  const [earlyPayDateStr, setEarlyPayDateStr] = useState('1');
  const [cashbackPercentageStr, setCashbackPercentageStr] = useState('0');
  const [incomeAmountStr, setIncomeAmountStr] = useState('0');

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

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
        dueMonth: subscription.dueMonth || (new Date().getMonth() + 1),
        sharedWith: subscription.sharedWith || [],
        isSingleExpense: subscription.isSingleExpense || false,
        isFlexibleDate: subscription.isFlexibleDate || false
      });
      setCostAmountStr(subscription.costAmount?.toString() || '0');
      setOriginalCostStr(subscription.originalCost?.toString() || '0');
      setEarlyPayCostStr(subscription.earlyPayCost?.toString() || '0');
      setFiatReferenceAmountStr(subscription.fiatReferenceAmount?.toString() || '0');
      setDueDateStr(subscription.dueDate?.toString() || '1');
      setDueMonthStr(subscription.dueMonth?.toString() || String(new Date().getMonth() + 1));
      setEarlyPayDateStr(subscription.earlyPayDate?.toString() || '1');
      setCashbackPercentageStr(subscription.cashbackPercentage?.toString() || '0');
      setIncomeAmountStr(subscription.incomeAmount?.toString() || '0');
      
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
        if (name === 'category' && !prev.logoUrl) {
          newData.emoji = CATEGORY_DEFAULT_EMOJIS[value] || '📦';
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
      dueDate: parseInt(dueDateStr) || 1,
      dueMonth: parseInt(dueMonthStr) || 1,
      earlyPayDate: parseInt(earlyPayDateStr) || 1,
      cashbackPercentage: parseFloat(cashbackPercentageStr) || 0,
      incomeAmount: parseFloat(incomeAmountStr) || 0,
      paymentSource: finalPaymentSource,
      id: subscription?.id || Date.now().toString(),
    } as Subscription);
  };

  const addSharedMember = () => {
    setFormData(prev => ({
      ...prev,
      sharedWith: [...(prev.sharedWith || []), { id: Date.now().toString(), name: '', paymentDate: 1, paidCurrentMonth: false }]
    }));
  };

  const updateSharedMember = (id: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      sharedWith: (prev.sharedWith || []).map(m => m.id === id ? { ...m, [field]: value } : m)
    }));
  };

  const removeSharedMember = (id: string) => {
    setFormData(prev => ({
      ...prev,
      sharedWith: (prev.sharedWith || []).filter(m => m.id !== id)
    }));
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
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('form.basicInfo')}</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#fdfbf7] dark:bg-[#121212] p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="isSingleExpense"
                    checked={formData.isSingleExpense}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-300 text-[#5A5A40] focus:ring-[#5A5A40]"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Gasto Único (Ex: iFood)</span>
                </label>
              </div>
              <div className="bg-[#fdfbf7] dark:bg-[#121212] p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="isFlexibleDate"
                    checked={formData.isFlexibleDate}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-300 text-[#5A5A40] focus:ring-[#5A5A40]"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Flexível</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.type') || 'Tipo'}</label>
                <select 
                  name="type"
                  value={formData.type || 'Subscription'}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] focus:border-transparent outline-none transition-all dark:text-white"
                >
                  <option value="Subscription">{t('form.typeSubscription') || 'Assinatura'}</option>
                  <option value="FixedExpense">{t('form.typeFixedExpense') || 'Despesa Fixa'}</option>
                </select>
              </div>
              <div className="space-y-1 relative">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.popularApp')}</label>
                <div 
                  className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer flex items-center justify-between dark:text-white transition-all hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => setIsAppDropdownOpen(!isAppDropdownOpen)}
                >
                  <span className="text-gray-600 dark:text-gray-300">{formData.name || t('form.selectApp')}</span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${isAppDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isAppDropdownOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                      {POPULAR_APPS.map(app => (
                        <div key={app.name} className="flex items-center gap-3 px-3 py-2 hover:bg-[#fdfbf7] dark:hover:bg-[#2a2a2a] rounded-lg cursor-pointer transition-colors"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, name: app.name, logoUrl: app.logo, category: 'Streaming' }));
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
                <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none dark:text-white" placeholder="Ex: YouTube Premium" />
              </div>
              <div className="flex gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.emoji')}</label>
                  <div className="flex items-center gap-2">
                    {formData.logoUrl ? (
                      <img src={formData.logoUrl} alt="Logo" referrerPolicy="no-referrer" className="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-gray-700 bg-white" />
                    ) : (
                      <input type="text" name="emoji" value={formData.emoji} onChange={handleChange} className="w-10 h-10 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-lg text-center text-xl dark:text-white" />
                    )}
                  </div>
                </div>
                <div className="space-y-1 flex-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.category')}</label>
                  <select name="category" value={formData.category} onChange={handleChange} className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl outline-none dark:text-white">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('form.costs')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.amount')}</label>
                <input type="number" step="0.01" value={costAmountStr} onFocus={handleFocus} onChange={e => setCostAmountStr(e.target.value)} className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl outline-none dark:text-white" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.currency')}</label>
                <select name="costCurrency" value={formData.costCurrency} onChange={handleChange} className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl dark:text-white">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.cycle')}</label>
                <select name="billingCycle" value={formData.billingCycle} onChange={handleChange} className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl dark:text-white">
                  <option value="Monthly">{t('form.monthly')}</option>
                  <option value="Yearly">{t('form.yearly')}</option>
                </select>
              </div>
              {!formData.isFlexibleDate && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('form.dueDate')}</label>
                  <input type="number" min="1" max="31" value={dueDateStr} onFocus={handleFocus} onChange={e => setDueDateStr(e.target.value)} className="w-full px-4 py-2 bg-[#fdfbf7] dark:bg-[#121212] border border-gray-200 dark:border-gray-700 rounded-xl dark:text-white" />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="text-emerald-500" size={20} />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Participantes / Rateio</h3>
            </div>
            
            <div className="bg-[#fdfbf7] dark:bg-[#121212] p-4 rounded-xl border border-gray-100 dark:border-gray-800">
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input type="checkbox" name="hasIncome" checked={formData.hasIncome} onChange={handleChange} className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Dividir com outras pessoas ou clientes?</span>
              </label>

              {formData.hasIncome && (
                <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">Membros</span>
                    <button type="button" onClick={addSharedMember} className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"><Plus size={14}/> Adicionar</button>
                  </div>
                  <div className="space-y-2">
                    {formData.sharedWith?.map(member => (
                      <div key={member.id} className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] p-2 rounded-lg border border-gray-100 dark:border-gray-800">
                        <Users size={16} className="text-gray-400 shrink-0" />
                        <input type="text" placeholder="Nome" value={member.name} onChange={e => updateSharedMember(member.id, 'name', e.target.value)} className="flex-1 bg-transparent text-sm border-0 focus:ring-0 dark:text-white" />
                        <input type="number" min="1" max="31" value={member.paymentDate} onChange={e => updateSharedMember(member.id, 'paymentDate', parseInt(e.target.value) || 1)} className="w-12 bg-gray-50 dark:bg-gray-800 rounded p-1 text-center text-xs dark:text-white" />
                        <button type="button" onClick={() => updateSharedMember(member.id, 'paidCurrentMonth', !member.paidCurrentMonth)} className={`p-1 rounded-full transition-colors ${member.paidCurrentMonth ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'text-gray-300'}`}>
                          <CheckCircle2 size={18} />
                        </button>
                        <button type="button" onClick={() => removeSharedMember(member.id)} className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={16}/></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-[#1a1a1a] pt-4 pb-2 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 z-10">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">{t('app.cancel')}</button>
            <button type="submit" className="px-8 py-2.5 text-sm font-medium text-white bg-[#5A5A40] dark:bg-[#7a7a5c] rounded-full hover:bg-[#4a4a34] dark:hover:bg-[#8a8a6c] transition-colors shadow-lg">{t('app.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
