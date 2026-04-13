import React, { useState, useEffect } from 'react';
import { Subscription, Currency, PaymentSource, PaymentMethod, BillingCycle, SubItem } from '../types';
import { X, Plus, Trash2, ChevronDown, ArrowDownRight, CheckCircle2, Users, Info, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
  { name: 'Google One', logo: 'https://www.google.com/s2/favicons?domain=one.google.com&sz=128' },
  { name: 'iCloud', logo: 'https://www.google.com/s2/favicons?domain=icloud.com&sz=128' },
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
  // Food Delivery
  { name: 'iFood', logo: 'https://www.google.com/s2/favicons?domain=ifood.com.br&sz=128' },
  { name: 'Uber Eats', logo: 'https://www.google.com/s2/favicons?domain=ubereats.com&sz=128' },
  { name: 'Deliveroo', logo: 'https://www.google.com/s2/favicons?domain=deliveroo.com&sz=128' },
  { name: 'Glovo', logo: 'https://www.google.com/s2/favicons?domain=glovoapp.com&sz=128' },
  { name: 'Rappi', logo: 'https://www.google.com/s2/favicons?domain=rappi.com.br&sz=128' },
  // Phone Operators
  { name: 'Vivo', logo: 'https://www.google.com/s2/favicons?domain=vivo.com.br&sz=128' },
  { name: 'Claro', logo: 'https://www.google.com/s2/favicons?domain=claro.com.br&sz=128' },
  { name: 'TIM', logo: 'https://www.google.com/s2/favicons?domain=tim.com.br&sz=128' },
  { name: 'Oi', logo: 'https://www.google.com/s2/favicons?domain=oi.com.br&sz=128' },
  { name: 'Vodafone', logo: 'https://www.google.com/s2/favicons?domain=vodafone.com&sz=128' },
  { name: 'T-Mobile', logo: 'https://www.google.com/s2/favicons?domain=t-mobile.com&sz=128' },
  { name: 'AT&T', logo: 'https://www.google.com/s2/favicons?domain=att.com&sz=128' },
  { name: 'Iliad', logo: 'https://www.google.com/s2/favicons?domain=iliad.it&sz=128' },
  { name: 'WindTre', logo: 'https://www.google.com/s2/favicons?domain=windtre.it&sz=128' },
  // Others
  { name: 'Uber', logo: 'https://www.google.com/s2/favicons?domain=uber.com&sz=128' },
  { name: 'Claude', logo: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=128' },
  { name: 'Gemini', logo: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=128' },
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
      
      if (subscription.sharedWith && subscription.sharedWith.length > 0) {
        setFormData(prev => ({ 
          ...prev, 
          sharedWith: subscription.sharedWith?.map(m => ({
            ...m,
            amount: m.amount || 0,
            currency: m.currency || subscription.costCurrency || 'BRL'
          }))
        }));
      }

      if (subscription.paymentSource && !PAYMENT_SOURCES.includes(subscription.paymentSource)) {
        setFormData(prev => ({ ...prev, paymentSource: 'Outro' }));
        setCustomPaymentSource(subscription.paymentSource);
      }
    }
  }, [subscription]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
      sharedWith: [...(prev.sharedWith || []), { 
        id: Date.now().toString(), 
        name: '', 
        amount: 0, 
        currency: prev.costCurrency || 'BRL',
        info: '',
        paymentDate: 1, 
        paidCurrentMonth: false 
      }]
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

  const inputClass = "w-full px-4 py-2 bg-[#121212] border border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none text-white transition-all";
  const labelClass = "text-sm font-medium text-gray-300";
  const sectionBg = "bg-[#121212] p-4 rounded-xl border border-gray-800";

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-[#1a1a1a] border-b border-gray-800/50 p-6 flex justify-between items-center z-10 rounded-t-2xl">
          <h2 className="text-2xl font-medium text-white">
            {subscription ? t('form.edit') : t('form.new')}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('form.basicInfo')}</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className={sectionBg}>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="isSingleExpense"
                    checked={formData.isSingleExpense}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-600 text-[#5A5A40] focus:ring-[#5A5A40] bg-[#222]"
                  />
                  <span className="text-sm font-medium text-gray-300">{t('form.singleExpense' as any)}</span>
                </label>
              </div>
              <div className={sectionBg}>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="isFlexibleDate"
                    checked={formData.isFlexibleDate}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-600 text-[#5A5A40] focus:ring-[#5A5A40] bg-[#222]"
                  />
                  <span className="text-sm font-medium text-gray-300">{t('form.flexibleDate' as any)}</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>{t('form.type') || 'Tipo'}</label>
                <select 
                  name="type"
                  value={formData.type || 'Subscription'}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="Subscription">{t('form.typeSubscription')}</option>
                  <option value="FixedExpense">{t('form.typeFixedExpense')}</option>
                </select>
              </div>
              <div className="space-y-1 relative">
                <label className={labelClass}>{t('form.popularApp')}</label>
                <div 
                  className="w-full px-4 py-2 bg-[#121212] border border-gray-700 rounded-xl cursor-pointer flex items-center justify-between text-white transition-all hover:bg-[#1a1a14]"
                  onClick={() => setIsAppDropdownOpen(!isAppDropdownOpen)}
                >
                  <span className="text-gray-300">{formData.name || t('form.selectApp')}</span>
                  <ChevronDown size={16} className={`text-gray-500 transition-transform ${isAppDropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {isAppDropdownOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2">
                      {POPULAR_APPS.map(app => (
                        <div key={app.name} className="flex items-center gap-3 px-3 py-2 hover:bg-[#2a2a2a] rounded-lg cursor-pointer transition-colors"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, name: app.name, logoUrl: app.logo, category: 'Streaming' }));
                            setIsAppDropdownOpen(false);
                          }}
                        >
                          <img src={app.logo} alt={app.name} className="w-6 h-6 rounded-full object-cover bg-white shrink-0" referrerPolicy="no-referrer" />
                          <span className="text-sm text-white truncate">{app.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>{t('form.name')}</label>
                <input type="text" name="name" required value={formData.name} onChange={handleChange} className={inputClass} placeholder="Ex: YouTube Premium" />
              </div>
              <div className="flex gap-4">
                <div className="space-y-1">
                  <label className={labelClass}>{t('form.emoji')}</label>
                  <div className="flex items-center gap-2">
                    {formData.logoUrl ? (
                      <img src={formData.logoUrl} alt="Logo" referrerPolicy="no-referrer" className="w-10 h-10 object-cover rounded-lg border border-gray-700 bg-white" />
                    ) : (
                      <input type="text" name="emoji" value={formData.emoji} onChange={handleChange} className="w-10 h-10 bg-[#121212] border border-gray-700 rounded-lg text-center text-xl text-white" />
                    )}
                  </div>
                </div>
                <div className="space-y-1 flex-1">
                  <label className={labelClass}>{t('form.category')}</label>
                  <select name="category" value={formData.category} onChange={handleChange} className={inputClass}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{t(`cat.${c}` as any) !== `cat.${c}` ? t(`cat.${c}` as any) : c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Costs */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('form.costs')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>{t('form.amount')}</label>
                <input type="number" step="0.01" value={costAmountStr} onFocus={handleFocus} onChange={e => setCostAmountStr(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>{t('form.currency')}</label>
                <select name="costCurrency" value={formData.costCurrency} onChange={handleChange} className={inputClass}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>{t('form.cycle')}</label>
                <select name="billingCycle" value={formData.billingCycle} onChange={handleChange} className={inputClass}>
                  <option value="Monthly">{t('form.monthly')}</option>
                  <option value="Yearly">{t('form.yearly')}</option>
                </select>
              </div>
              {!formData.isFlexibleDate && (
                <div className="space-y-1">
                  <label className={labelClass}>{t('form.dueDate')}</label>
                  <input type="number" min="1" max="31" value={dueDateStr} onFocus={handleFocus} onChange={e => setDueDateStr(e.target.value)} className={inputClass} />
                </div>
              )}
              {formData.billingCycle === 'Yearly' && (
                <div className="space-y-1">
                  <label className={labelClass}>{t('form.dueMonth')}</label>
                  <select
                    value={dueMonthStr}
                    onChange={e => setDueMonthStr(e.target.value)}
                    className={inputClass}
                  >
                    {(() => {
                      const monthNames: Record<string, string[]> = {
                        pt: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
                        en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
                        es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
                        it: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
                      };
                      const names = monthNames[language] || monthNames['en'];
                      return names.map((name, i) => (
                        <option key={i + 1} value={String(i + 1)}>{name}</option>
                      ));
                    })()}
                  </select>
                </div>
              )}
            </div>

            {/* Payment Method & Source */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>{t('form.paymentMethod')}</label>
                <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange} className={inputClass}>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`pay.${m}` as any) !== `pay.${m}` ? t(`pay.${m}` as any) : m}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelClass}>{t('form.paymentSource')}</label>
                <select name="paymentSource" value={formData.paymentSource} onChange={handleChange} className={inputClass}>
                  {PAYMENT_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {formData.paymentSource === 'Outro' && (
                  <input type="text" value={customPaymentSource} onChange={e => setCustomPaymentSource(e.target.value)} placeholder={t('form.customPaymentSource')} className={`${inputClass} mt-2`} />
                )}
              </div>
            </div>

            {/* Crypto Reference */}
            {(formData.costCurrency === 'BTC' || formData.costCurrency === 'SATS') && (
              <div className={`${sectionBg} space-y-3`}>
                <p className="text-xs text-amber-400">{t('form.cryptoWarning')}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className={labelClass}>{t('form.fiatReference')}</label>
                    <input type="number" step="0.01" value={fiatReferenceAmountStr} onFocus={handleFocus} onChange={e => setFiatReferenceAmountStr(e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>{t('form.fiatCurrency')}</label>
                    <select name="fiatReferenceCurrency" value={formData.fiatReferenceCurrency} onChange={handleChange} className={inputClass}>
                      {CURRENCIES.filter(c => c !== 'BTC' && c !== 'SATS').map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sub-items */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('form.subItems')}</h3>
            <p className="text-xs text-gray-500">{t('form.subItemsDesc')}</p>
            {(formData.subItems || []).map(item => (
              <div key={item.id} className="flex items-center gap-2">
                <input type="text" placeholder={t('form.name')} value={item.name} onChange={e => handleSubItemChange(item.id, 'name', e.target.value)} className={`${inputClass} flex-1`} />
                <input type="number" step="0.01" value={item.costAmount} onChange={e => handleSubItemChange(item.id, 'costAmount', parseFloat(e.target.value) || 0)} className={`${inputClass} w-28`} />
                <button type="button" onClick={() => handleRemoveSubItem(item.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={16}/></button>
              </div>
            ))}
            <button type="button" onClick={handleAddSubItem} className="flex items-center gap-1 text-xs font-medium text-[#d0d0a0] hover:text-[#e0e0b0]">
              <Plus size={14}/> {t('form.addSubItem')}
            </button>
          </div>

          {/* Discounts & Promos */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('form.discounts')}</h3>
            
            <div className={sectionBg}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="isPromotional" checked={formData.isPromotional} onChange={handleChange} className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-600 bg-[#222]" />
                <span className="text-sm font-medium text-gray-300">{t('form.isPromotional')}</span>
              </label>
              {formData.isPromotional && (
                <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-700">
                  <div className="space-y-1">
                    <label className={labelClass}>{t('form.originalCost')}</label>
                    <input type="number" step="0.01" value={originalCostStr} onFocus={handleFocus} onChange={e => setOriginalCostStr(e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>{t('form.promoEndDate')}</label>
                    <input type="date" name="promoEndDate" value={formData.promoEndDate} onChange={handleChange} className={inputClass} />
                    <p className="text-[10px] text-gray-500">{t('form.promoEndDateDesc')}</p>
                  </div>
                </div>
              )}
            </div>

            <div className={sectionBg}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="hasEarlyPayDiscount" checked={formData.hasEarlyPayDiscount} onChange={handleChange} className="w-4 h-4 rounded border-gray-600 text-emerald-600 focus:ring-emerald-600 bg-[#222]" />
                <span className="text-sm font-medium text-gray-300">{t('form.hasEarlyPayDiscount')}</span>
              </label>
              {formData.hasEarlyPayDiscount && (
                <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-700">
                  <div className="space-y-1">
                    <label className={labelClass}>{t('form.earlyPayDate')}</label>
                    <input type="number" min="1" max="31" value={earlyPayDateStr} onFocus={handleFocus} onChange={e => setEarlyPayDateStr(e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>{t('form.earlyPayCost')}</label>
                    <input type="number" step="0.01" value={earlyPayCostStr} onFocus={handleFocus} onChange={e => setEarlyPayCostStr(e.target.value)} className={inputClass} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cashback */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className={sectionBg}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="hasCashback" checked={formData.hasCashback} onChange={handleChange} className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-600 bg-[#222]" />
                <span className="text-sm font-medium text-gray-300">{t('form.hasCashback')}</span>
              </label>
              {formData.hasCashback && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <label className={labelClass}>{t('form.cashbackPercentage')}</label>
                  <input type="number" step="0.1" min="0" max="100" value={cashbackPercentageStr} onFocus={handleFocus} onChange={e => setCashbackPercentageStr(e.target.value)} className={`${inputClass} mt-1`} />
                </div>
              )}
            </div>
          </div>

          {/* Participants / Split */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <ArrowDownRight className="text-emerald-500" size={20} />
              <h3 className="text-lg font-medium text-white">{t('form.participants' as any)}</h3>
            </div>
            
            <div className={sectionBg}>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input type="checkbox" name="hasIncome" checked={formData.hasIncome} onChange={handleChange} className="w-4 h-4 rounded border-gray-600 text-emerald-600 focus:ring-emerald-600 bg-[#222]" />
                <span className="text-sm font-medium text-gray-300">{t('form.shareQuestion' as any)}</span>
              </label>

              {formData.hasIncome && (
                <div className="space-y-4 pt-4 border-t border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">{t('form.members' as any)}</span>
                    <button type="button" onClick={addSharedMember} className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"><Plus size={14}/> {t('form.add' as any)}</button>
                  </div>
                  
                  <div className="space-y-3">
                    <AnimatePresence>
                      {formData.sharedWith?.map(member => (
                        <motion.div 
                          key={member.id}
                          layout
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -100 }}
                          drag="x"
                          dragConstraints={{ left: -100, right: 0 }}
                          onDragEnd={(_, info) => {
                            if (info.offset.x < -60) {
                              removeSharedMember(member.id);
                            }
                          }}
                          className="relative"
                        >
                          {/* Background Delete Indicator - Revealed on swipe */}
                          <div className="absolute inset-0 bg-red-500 rounded-xl flex items-center justify-end pr-6 -z-10">
                            <div className="flex flex-col items-center gap-1">
                              <Trash2 size={24} className="text-white" />
                              <span className="text-[10px] text-white font-bold uppercase">{language === 'pt' ? 'Remover' : 'Remove'}</span>
                            </div>
                          </div>

                          <div className="bg-[#1a1a1a] p-3 rounded-xl border border-gray-800 shadow-sm space-y-3 touch-pan-y">
                            <div className="flex items-center gap-2">
                              <Users size={16} className="text-gray-400 shrink-0" />
                              <input 
                                type="text" 
                                placeholder={t('form.memberName' as any)} 
                                value={member.name} 
                                onChange={e => updateSharedMember(member.id, 'name', e.target.value)} 
                                className="flex-1 bg-transparent text-sm font-medium border-0 focus:ring-0 text-white placeholder:text-gray-600 min-w-0" 
                              />
                              <div className="flex items-center gap-1 bg-[#222] px-2 py-1 rounded-lg shrink-0">
                                <span className="text-[10px] text-gray-500 uppercase">Dia</span>
                                <input 
                                  type="number" 
                                  min="1" 
                                  max="31" 
                                  value={member.paymentDate} 
                                  onChange={e => updateSharedMember(member.id, 'paymentDate', parseInt(e.target.value) || 1)} 
                                  className="w-7 bg-transparent text-center text-xs text-white border-0 focus:ring-0 p-0" 
                                />
                              </div>
                              <button 
                                type="button" 
                                onClick={() => updateSharedMember(member.id, 'paidCurrentMonth', !member.paidCurrentMonth)} 
                                className={`p-1.5 rounded-lg transition-colors ${member.paidCurrentMonth ? 'text-emerald-500 bg-emerald-900/20' : 'text-gray-600 bg-gray-800/40 hover:bg-gray-800'}`}
                              >
                                <CheckCircle2 size={18} />
                              </button>
                              <button 
                                type="button" 
                                onClick={() => removeSharedMember(member.id)} 
                                className="p-1.5 text-gray-400 hover:text-red-500 sm:hidden"
                                title="Remover"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="flex items-center gap-2 bg-[#121212] px-3 py-2 rounded-lg border border-gray-800/50">
                                <DollarSign size={14} className="text-gray-500" />
                                <input 
                                  type="number" 
                                  placeholder="0.00"
                                  value={member.amount || ''} 
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    updateSharedMember(member.id, 'amount', val);
                                    // Optional: update total income
                                    const others = formData.sharedWith?.filter(m => m.id !== member.id) || [];
                                    const total = others.reduce((acc, m) => acc + (m.amount || 0), 0) + val;
                                    setIncomeAmountStr(total.toString());
                                  }} 
                                  className="w-full bg-transparent text-xs border-0 focus:ring-0 text-white p-0" 
                                />
                                <select 
                                  value={member.currency || formData.costCurrency} 
                                  onChange={e => updateSharedMember(member.id, 'currency', e.target.value)}
                                  className="bg-transparent text-[10px] border-0 focus:ring-0 text-gray-400 p-0 w-12"
                                >
                                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center gap-2 bg-[#121212] px-3 py-2 rounded-lg border border-gray-800 group-focus-within:border-[#5A5A40] transition-colors">
                                <Info size={14} className="text-gray-500" />
                                <input 
                                  type="text" 
                                  placeholder={language === 'pt' ? 'Descrição (ex: Telegram)' : 'Info (ex: Telegram)'} 
                                  value={member.info || ''} 
                                  onChange={e => updateSharedMember(member.id, 'info', e.target.value)} 
                                  className="w-full bg-transparent text-xs border-0 focus:ring-0 text-white p-0" 
                                />
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center px-1">
                              <span className="text-[9px] text-gray-600 italic">{language === 'pt' ? 'Arraste para remover' : 'Swipe to remove'}</span>
                              {member.amount > 0 && (
                                <span className="text-[10px] text-emerald-500 font-bold">
                                  {member.currency} {member.amount.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="space-y-1">
                      <label className={labelClass}>{t('form.incomeDesc')}</label>
                      <input type="text" name="incomeSourceDescription" value={formData.incomeSourceDescription} onChange={handleChange} className={inputClass} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-4 pt-4 border-t border-gray-800">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">{t('form.notes')}</h3>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
              placeholder={t('form.notesPlaceholder')}
              className="w-full px-4 py-3 bg-[#121212] border border-gray-700 rounded-xl focus:ring-2 focus:ring-[#5A5A40] outline-none text-white text-sm resize-none"
            />
          </div>

          <div className="sticky bottom-0 bg-[#1a1a1a] pt-4 pb-2 border-t border-gray-800 flex justify-end gap-3 z-10">
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-300 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors">{t('app.cancel')}</button>
            <button type="submit" className="px-8 py-2.5 text-sm font-medium text-white bg-[#7a7a5c] rounded-full hover:bg-[#8a8a6c] transition-colors shadow-lg">{t('form.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
