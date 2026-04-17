import React, { useState, useEffect, useRef } from 'react';
import { Subscription, Currency, PaymentSource, PaymentMethod, BillingCycle, SubItem, SharedMember, convertCurrency } from '../types';
import { X, Plus, Trash2, ChevronDown, ArrowDownRight, CheckCircle2, Users, Info, DollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../AppContext';
import { useTranslation } from '../i18n';
import { bestLogoUrl, clearbitFromDomain, normalizeLogoUrl } from '../lib/logos';
import { FoundBoaUser, searchBoaUsers, searchCachedBoaUsers } from '../lib/userSearch';

interface SubscriptionFormProps {
  subscription?: Subscription;
  onSave: (sub: Subscription) => void;
  onClose: () => void;
  baseCurrency: Currency;
  exchangeRates: Record<Currency, number>;
}

const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR', 'GBP', 'JPY', 'TRY', 'ARS', 'INR', 'IDR', 'CAD', 'AUD', 'CHF', 'CNY', 'MXN', 'BTC', 'SATS'];
const PAYMENT_METHODS: PaymentMethod[] = ['Cartão de Crédito', 'Cartão de Débito', 'Gift Card', 'Pix', 'Transferência', 'Bitcoin', 'Outro'];
const PAYMENT_SOURCES = ['Revolut', 'N26', 'Nubank', 'Wise', 'Inter', 'Intesa Sanpaolo', 'Chase', 'Bank of America', 'Wells Fargo', 'Santander', 'Itaú', 'Bradesco', 'Caixa', 'Banco do Brasil', 'C6 Bank', 'Neon', 'Next', 'PicPay', 'Mercado Pago', 'PayPal', 'Stripe', 'Izybank', 'BBVA', 'Buddybank', 'Monzo', 'Starling', 'Bitrefill', 'Outro'];
const CATEGORIES = ['Streaming', 'Software', 'Games', 'Assinaturas', 'Utilidades', 'Educação', 'Moradia', 'Saúde', 'Outros'];

const POPULAR_APPS = [
  { name: 'Netflix',               logo: 'https://logo.clearbit.com/netflix.com' },
  { name: 'YouTube',               logo: 'https://logo.clearbit.com/youtube.com' },
  { name: 'Spotify',               logo: 'https://logo.clearbit.com/spotify.com' },
  { name: 'Amazon Prime',          logo: 'https://logo.clearbit.com/primevideo.com' },
  { name: 'Disney+',               logo: 'https://logo.clearbit.com/disneyplus.com' },
  { name: 'Apple Music',           logo: 'https://logo.clearbit.com/apple.com' },
  { name: 'Apple TV+',             logo: 'https://logo.clearbit.com/apple.com' },
  { name: 'Xbox Game Pass',        logo: 'https://logo.clearbit.com/xbox.com' },
  { name: 'PlayStation Plus',      logo: 'https://logo.clearbit.com/playstation.com' },
  { name: 'Adobe Creative Cloud',  logo: 'https://logo.clearbit.com/adobe.com' },
  { name: 'Microsoft 365',         logo: 'https://logo.clearbit.com/microsoft.com' },
  { name: 'ChatGPT',               logo: 'https://logo.clearbit.com/openai.com' },
  { name: 'GitHub Copilot',        logo: 'https://logo.clearbit.com/github.com' },
  { name: 'HBO Max',               logo: 'https://logo.clearbit.com/max.com' },
  { name: 'Crunchyroll',           logo: 'https://logo.clearbit.com/crunchyroll.com' },
  { name: 'Google One',            logo: 'https://logo.clearbit.com/one.google.com' },
  { name: 'iCloud',                logo: 'https://logo.clearbit.com/icloud.com' },
  { name: 'Dropbox',               logo: 'https://logo.clearbit.com/dropbox.com' },
  { name: 'Notion',                logo: 'https://logo.clearbit.com/notion.so' },
  { name: 'Slack',                 logo: 'https://logo.clearbit.com/slack.com' },
  { name: 'Zoom',                  logo: 'https://logo.clearbit.com/zoom.us' },
  { name: 'Canva',                 logo: 'https://logo.clearbit.com/canva.com' },
  { name: 'Figma',                 logo: 'https://logo.clearbit.com/figma.com' },
  { name: 'Duolingo',              logo: 'https://logo.clearbit.com/duolingo.com' },
  { name: 'Tinder',                logo: 'https://logo.clearbit.com/tinder.com' },
  { name: 'Strava',                logo: 'https://logo.clearbit.com/strava.com' },
  { name: 'Gympass',               logo: 'https://logo.clearbit.com/gympass.com' },
  { name: 'Twitch',                logo: 'https://logo.clearbit.com/twitch.tv' },
  { name: 'Discord',               logo: 'https://logo.clearbit.com/discord.com' },
  { name: 'Patreon',               logo: 'https://logo.clearbit.com/patreon.com' },
  { name: 'Paramount+',            logo: 'https://logo.clearbit.com/paramountplus.com' },
  { name: 'Star+',                 logo: 'https://logo.clearbit.com/starplus.com' },
  { name: 'Globoplay',             logo: 'https://logo.clearbit.com/globoplay.globo.com' },
  { name: 'Deezer',                logo: 'https://logo.clearbit.com/deezer.com' },
  { name: 'Tidal',                 logo: 'https://logo.clearbit.com/tidal.com' },
  { name: 'Claude',                logo: 'https://logo.clearbit.com/claude.ai' },
  { name: 'Gemini',                logo: 'https://logo.clearbit.com/gemini.google.com' },
  { name: 'LinkedIn Premium',      logo: 'https://logo.clearbit.com/linkedin.com' },
  { name: 'Twitter / X',           logo: 'https://logo.clearbit.com/x.com' },
  // Food delivery
  { name: 'iFood',                 logo: 'https://logo.clearbit.com/ifood.com.br' },
  { name: 'Uber Eats',             logo: 'https://logo.clearbit.com/ubereats.com' },
  { name: 'Deliveroo',             logo: 'https://logo.clearbit.com/deliveroo.com' },
  { name: 'Glovo',                 logo: 'https://logo.clearbit.com/glovoapp.com' },
  { name: 'Rappi',                 logo: 'https://logo.clearbit.com/rappi.com.br' },
  // Phone operators
  { name: 'Vivo',                  logo: 'https://logo.clearbit.com/vivo.com.br' },
  { name: 'Claro',                 logo: 'https://logo.clearbit.com/claro.com.br' },
  { name: 'TIM',                   logo: 'https://logo.clearbit.com/tim.com.br' },
  { name: 'Oi',                    logo: 'https://logo.clearbit.com/oi.com.br' },
  { name: 'Vodafone',              logo: 'https://logo.clearbit.com/vodafone.com' },
  { name: 'T-Mobile',              logo: 'https://logo.clearbit.com/t-mobile.com' },
  { name: 'AT&T',                  logo: 'https://logo.clearbit.com/att.com' },
  { name: 'Iliad',                 logo: 'https://logo.clearbit.com/iliad.it' },
  { name: 'WindTre',               logo: 'https://logo.clearbit.com/windtre.it' },
  // Others
  { name: 'Uber',                  logo: 'https://logo.clearbit.com/uber.com' },
  { name: 'NordVPN',               logo: 'https://logo.clearbit.com/nordvpn.com' },
  { name: '1Password',             logo: 'https://logo.clearbit.com/1password.com' },
  { name: 'Audible',               logo: 'https://logo.clearbit.com/audible.com' },
];

const BANK_LOGOS: Record<string, string> = {
  'Revolut':         'https://logo.clearbit.com/revolut.com',
  'N26':             'https://logo.clearbit.com/n26.com',
  'Nubank':          'https://logo.clearbit.com/nubank.com.br',
  'Wise':            'https://logo.clearbit.com/wise.com',
  'Inter':           'https://logo.clearbit.com/bancointer.com.br',
  'Intesa Sanpaolo': 'https://logo.clearbit.com/intesasanpaolo.com',
  'Chase':           'https://logo.clearbit.com/chase.com',
  'Bank of America': 'https://logo.clearbit.com/bankofamerica.com',
  'Wells Fargo':     'https://logo.clearbit.com/wellsfargo.com',
  'Santander':       'https://logo.clearbit.com/santander.com.br',
  'Itaú':            'https://logo.clearbit.com/itau.com.br',
  'Bradesco':        'https://logo.clearbit.com/bradesco.com.br',
  'Caixa':           'https://logo.clearbit.com/caixa.gov.br',
  'Banco do Brasil': 'https://logo.clearbit.com/bb.com.br',
  'C6 Bank':         'https://logo.clearbit.com/c6bank.com.br',
  'Neon':            'https://logo.clearbit.com/neon.com.br',
  'Next':            'https://logo.clearbit.com/next.me',
  'PicPay':          'https://logo.clearbit.com/picpay.com',
  'Mercado Pago':    'https://logo.clearbit.com/mercadopago.com.br',
  'PayPal':          'https://logo.clearbit.com/paypal.com',
  'Stripe':          'https://logo.clearbit.com/stripe.com',
  'Izybank':         'https://logo.clearbit.com/izybank.com.br',
  'BBVA':            'https://logo.clearbit.com/bbva.com',
  'Buddybank':       'https://logo.clearbit.com/buddybank.com',
  'Monzo':           'https://logo.clearbit.com/monzo.com',
  'Starling':        'https://logo.clearbit.com/starlingbank.com',
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

export function SubscriptionForm({ subscription, onSave, onClose, baseCurrency, exchangeRates }: SubscriptionFormProps) {
  const { language, user } = useAppContext();
  const t = useTranslation(language);
  const tx = (pt: string, en: string, es: string, it: string) =>
    ({ pt, en, es, it }[language] ?? en);

  const [formData, setFormData] = useState<Partial<Subscription>>({
    name: '',
    type: 'Subscription',
    emoji: '📺',
    logoUrl: '',
    isPublic: false,
    allowPublicParticipants: false,
    publicSharePriceSats: 0,
    publicPaymentType: 'onetime',
    publicCredentialsEnabled: false,
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
    serviceUsername: '',
    servicePassword: '',
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
  const [publicSharePriceSatsStr, setPublicSharePriceSatsStr] = useState('0');
  const [originalCostStr, setOriginalCostStr] = useState('0');
  const [earlyPayCostStr, setEarlyPayCostStr] = useState('0');
  const [fiatReferenceAmountStr, setFiatReferenceAmountStr] = useState('0');
  const [dueDateStr, setDueDateStr] = useState('1');
  const [dueMonthStr, setDueMonthStr] = useState(String(new Date().getMonth() + 1));
  const [earlyPayDateStr, setEarlyPayDateStr] = useState('1');
  const [cashbackPercentageStr, setCashbackPercentageStr] = useState('0');
  const [incomeAmountStr, setIncomeAmountStr] = useState('0');
  const [subItemAmountInputs, setSubItemAmountInputs] = useState<Record<string, string>>({});
  const [memberPaymentDayInputs, setMemberPaymentDayInputs] = useState<Record<string, string>>({});
  const [memberSearchResults, setMemberSearchResults] = useState<Record<string, FoundBoaUser[]>>({});
  const [memberSearchLoading, setMemberSearchLoading] = useState<Record<string, boolean>>({});
  const [memberValidationErrors, setMemberValidationErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const memberSearchTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const sanitizeDayInput = (value: string) => value.replace(/\D/g, '').slice(0, 2);
  const sanitizeDecimalInput = (value: string) => value.replace(',', '.').replace(/[^0-9.]/g, '');
  const parseDecimalInput = (value: string) => {
    const parsed = parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const clampDayValue = (value: string, fallback = 1) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(31, Math.max(1, parsed));
  };

  const resolveMemberAmount = (member: Partial<SharedMember>) => {
    if (member.shareType === 'percentage') {
      const percentage = Number(member.percentage) || 0;
      const baseAmount = parseFloat(costAmountStr) || 0;
      return Number((baseAmount * percentage) / 100);
    }

    return Number(member.amount) || 0;
  };

  const recalculateMemberIncome = (members: Partial<SharedMember>[], incomeCurrency?: Currency) => {
    const targetCurrency = incomeCurrency || formData.incomeCurrency || 'BRL';
    const total = members.reduce((acc, member) => {
      const resolvedAmount = resolveMemberAmount(member);
      return acc + convertCurrency(
        resolvedAmount,
        member.currency || formData.costCurrency || 'BRL',
        targetCurrency,
        exchangeRates
      );
    }, 0);

    setIncomeAmountStr(total.toString());
    setFormData((prev) => ({
      ...prev,
      incomeAmount: total,
      incomeCurrency: targetCurrency,
    }));
  };

  useEffect(() => {
    if (formData.name && formData.name.length > 2 && !formData.logoUrl) {
      const cleanName = formData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      let domain = `${cleanName}.com`;
      if (cleanName === 'anhanguera') domain = 'anhanguera.com';
      else if (cleanName === 'usp') domain = 'usp.br';
      else if (cleanName === 'nubank') domain = 'nubank.com.br';
      setSuggestedLogo(normalizeLogoUrl(clearbitFromDomain(domain), formData.name || ''));
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
        isPublic: subscription.isPublic || false,
        allowPublicParticipants: subscription.allowPublicParticipants || false,
        publicSharePriceSats: subscription.publicSharePriceSats || 0,
        publicPaymentType: subscription.publicPaymentType || 'onetime',
        publicCredentialsEnabled: subscription.publicCredentialsEnabled || false,
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
      setPublicSharePriceSatsStr(subscription.publicSharePriceSats?.toString() || '0');
      setOriginalCostStr(subscription.originalCost?.toString() || '0');
      setEarlyPayCostStr(subscription.earlyPayCost?.toString() || '0');
      setFiatReferenceAmountStr(subscription.fiatReferenceAmount?.toString() || '0');
      setDueDateStr(subscription.dueDate?.toString() || '1');
      setDueMonthStr(subscription.dueMonth?.toString() || String(new Date().getMonth() + 1));
      setEarlyPayDateStr(subscription.earlyPayDate?.toString() || '1');
      setCashbackPercentageStr(subscription.cashbackPercentage?.toString() || '0');
      setIncomeAmountStr(subscription.incomeAmount?.toString() || '0');
      setSubItemAmountInputs(
        Object.fromEntries(
          (subscription.subItems || []).map((item) => [item.id, String(item.costAmount ?? '')])
        )
      );
      setMemberPaymentDayInputs(
        Object.fromEntries(
          (subscription.sharedWith || []).map((member) => [member.id, String(member.paymentDate || 1)])
        )
      );
      setMemberValidationErrors({});
      setFormError('');
      
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
    } else {
      setSubItemAmountInputs({});
      setMemberPaymentDayInputs({});
      setMemberSearchResults({});
      setMemberSearchLoading({});
      setMemberValidationErrors({});
      setFormError('');
    }
  }, [subscription]);

  useEffect(() => {
    return () => {
      Object.values(memberSearchTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId as ReturnType<typeof setTimeout>));
    };
  }, []);

  useEffect(() => {
    if ((formData.sharedWith || []).length === 0) return;
    recalculateMemberIncome(formData.sharedWith || [], formData.incomeCurrency || 'BRL');
  }, [costAmountStr, formData.costCurrency, formData.incomeCurrency, formData.sharedWith]);

  useEffect(() => {
    if (formData.isPublic) return;
    if (!formData.allowPublicParticipants && !formData.publicCredentialsEnabled && !formData.publicSharePriceSats) return;

    setFormData((prev) => ({
      ...prev,
      allowPublicParticipants: false,
      publicCredentialsEnabled: false,
      publicSharePriceSats: 0,
      publicPaymentType: 'onetime',
    }));
  }, [formData.isPublic, formData.allowPublicParticipants, formData.publicCredentialsEnabled, formData.publicSharePriceSats]);

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
    const nextId = Date.now().toString();
    setSubItemAmountInputs(prev => ({ ...prev, [nextId]: '' }));
    setFormData(prev => ({
      ...prev,
      subItems: [...(prev.subItems || []), { id: nextId, name: '', costAmount: 0 }]
    }));
  };

  const handleRemoveSubItem = (id: string) => {
    setSubItemAmountInputs(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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
    setFormError('');
    const finalPaymentSource = formData.paymentSource === 'Outro' && customPaymentSource.trim() !== '' 
      ? customPaymentSource.trim() 
      : formData.paymentSource;
    const normalizedSharedWith = (formData.sharedWith || []).map((member) => ({
      ...member,
      shareType: member.shareType === 'percentage' ? 'percentage' : 'amount',
      percentage: member.shareType === 'percentage' ? Math.min(100, Math.max(0, Number(member.percentage) || 0)) : 0,
      amount: resolveMemberAmount(member),
      currency: member.shareType === 'percentage' ? (formData.costCurrency || member.currency || 'BRL') : (member.currency || formData.costCurrency || 'BRL'),
      paymentDate: clampDayValue(memberPaymentDayInputs[member.id] || String(member.paymentDate || 1)),
    }));
    const invalidMentionMembers = normalizedSharedWith.filter((member) => member.name.trim().startsWith('@') && !member.userId);
    if (invalidMentionMembers.length > 0) {
      setMemberValidationErrors(
        Object.fromEntries(
          invalidMentionMembers.map((member) => [
            member.id,
            tx('Usuario inexistente', 'User does not exist', 'Usuario inexistente', 'Utente inesistente'),
          ])
        )
      );
      setFormError(
        tx(
          'Corrija os membros com @ antes de salvar.',
          'Fix the @ members before saving.',
          'Corrige los miembros con @ antes de guardar.',
          'Correggi i membri con @ prima di salvare.'
        )
      );
      return;
    }
    setMemberValidationErrors({});

    onSave({
      ...formData,
      logoUrl: normalizeLogoUrl(formData.logoUrl || suggestedLogo, formData.name || ''),
      costAmount: parseFloat(costAmountStr) || 0,
      publicSharePriceSats: parseInt(publicSharePriceSatsStr, 10) || 0,
      originalCost: parseFloat(originalCostStr) || 0,
      earlyPayCost: parseFloat(earlyPayCostStr) || 0,
      fiatReferenceAmount: parseFloat(fiatReferenceAmountStr) || 0,
      dueDate: clampDayValue(dueDateStr),
      dueMonth: parseInt(dueMonthStr) || 1,
      earlyPayDate: clampDayValue(earlyPayDateStr),
      cashbackPercentage: parseFloat(cashbackPercentageStr) || 0,
      incomeAmount: parseFloat(incomeAmountStr) || 0,
      paymentSource: finalPaymentSource,
      subItems: (formData.subItems || []).map((item) => ({
        ...item,
        costAmount: parseDecimalInput(subItemAmountInputs[item.id] ?? String(item.costAmount ?? '')),
      })),
      sharedWith: normalizedSharedWith,
      id: subscription?.id || Date.now().toString(),
    } as Subscription);
  };

  const addSharedMember = () => {
    const nextId = Date.now().toString();
    setMemberPaymentDayInputs((prev) => ({ ...prev, [nextId]: '1' }));
    setFormData(prev => ({
      ...prev,
      sharedWith: [...(prev.sharedWith || []), { 
        id: nextId,
        name: '', 
        amount: 0, 
        currency: prev.costCurrency || 'BRL',
        info: '',
        paymentDate: 1,
        paidCurrentMonth: false,
        shareType: 'amount',
        percentage: 0,
      }]
    }));
  };

  const patchSharedMember = (id: string, patch: Partial<SharedMember>) => {
    setMemberValidationErrors(prev => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (formError) setFormError('');
    setFormData(prev => ({
      ...prev,
      sharedWith: (prev.sharedWith || []).map(m => m.id === id ? { ...m, ...patch } : m)
    }));
  };

  const updateSharedMember = (id: string, field: string, value: any) => {
    patchSharedMember(id, { [field]: value } as Partial<SharedMember>);
  };

  const handleSharedMemberNameChange = (id: string, value: string) => {
    const cleanQuery = value.replace('@', '').trim();

    if (memberSearchTimeoutsRef.current[id]) {
      clearTimeout(memberSearchTimeoutsRef.current[id]);
    }

    if (value.trim().startsWith('@') && user?.id) {
      patchSharedMember(id, {
        name: value,
        userId: undefined,
        username: undefined,
        accepted: false,
      });

      const instantResults = searchCachedBoaUsers(cleanQuery, user.id, 6);
      setMemberSearchResults((prev) => ({ ...prev, [id]: instantResults }));

      if (!cleanQuery) {
        setMemberSearchLoading((prev) => ({ ...prev, [id]: false }));
        return;
      }

      setMemberSearchLoading((prev) => ({ ...prev, [id]: instantResults.length === 0 }));
      memberSearchTimeoutsRef.current[id] = setTimeout(async () => {
        try {
          const results = await searchBoaUsers(cleanQuery, user.id, 6);
          setMemberSearchResults((prev) => ({ ...prev, [id]: results }));
        } catch {
          setMemberSearchResults((prev) => ({ ...prev, [id]: [] }));
        } finally {
          setMemberSearchLoading((prev) => ({ ...prev, [id]: false }));
        }
      }, 120);
      return;
    }

    setMemberSearchResults((prev) => ({ ...prev, [id]: [] }));
    setMemberSearchLoading((prev) => ({ ...prev, [id]: false }));
    patchSharedMember(id, {
      name: value,
      userId: undefined,
      username: undefined,
      accepted: false,
    });
  };

  const selectSharedUser = (memberId: string, foundUser: FoundBoaUser) => {
    patchSharedMember(memberId, {
      name: foundUser.name || foundUser.username,
      userId: foundUser.id,
      username: foundUser.username.toLowerCase(),
      accepted: false,
    });
    setMemberSearchResults((prev) => ({ ...prev, [memberId]: [] }));
    setMemberSearchLoading((prev) => ({ ...prev, [memberId]: false }));
  };

  const handleSharedMemberPaymentDayChange = (id: string, rawValue: string) => {
    const sanitized = sanitizeDayInput(rawValue);
    setMemberPaymentDayInputs((prev) => ({ ...prev, [id]: sanitized }));
    patchSharedMember(id, {
      paymentDate: sanitized === '' ? 0 : clampDayValue(sanitized),
    });
  };

  const finalizeSharedMemberPaymentDay = (id: string) => {
    const normalized = String(clampDayValue(memberPaymentDayInputs[id] || '1'));
    setMemberPaymentDayInputs((prev) => ({ ...prev, [id]: normalized }));
    patchSharedMember(id, { paymentDate: clampDayValue(normalized) });
  };

  const removeSharedMember = (id: string) => {
    setFormData(prev => {
      const newSharedWith = (prev.sharedWith || []).filter(m => m.id !== id);
      const total = newSharedWith.reduce((acc, m) => acc + convertCurrency(resolveMemberAmount(m), m.currency || prev.costCurrency || 'BRL', prev.incomeCurrency || 'BRL', exchangeRates), 0);
      setIncomeAmountStr(total.toString());
      setMemberPaymentDayInputs((currentInputs) => {
        const nextInputs = { ...currentInputs };
        delete nextInputs[id];
        return nextInputs;
      });
      setMemberSearchResults((currentResults) => {
        const nextResults = { ...currentResults };
        delete nextResults[id];
        return nextResults;
      });
      setMemberSearchLoading((currentLoading) => {
        const nextLoading = { ...currentLoading };
        delete nextLoading[id];
        return nextLoading;
      });
      return {
        ...prev,
        sharedWith: newSharedWith,
        incomeAmount: total
      };
    });
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div className={sectionBg}>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="isPublic"
                    checked={!!formData.isPublic}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-600 text-[#5A5A40] focus:ring-[#5A5A40] bg-[#222]"
                  />
                  <span className="text-sm font-medium text-gray-300">{tx('Deixar publica', 'Leave public', 'Dejar publica', 'Rendi pubblica')}</span>
                </label>
              </div>
            </div>

            {formData.isPublic && (
              <div className={`${sectionBg} space-y-4`}>
                <div>
                  <p className="text-sm font-medium text-white">
                    {tx('Marketplace publico', 'Public marketplace', 'Marketplace publico', 'Marketplace pubblico')}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {tx(
                      'A assinatura pode aparecer na nova area publica do perfil. Se quiser aceitar novos participantes automaticamente, ative abaixo.',
                      'This subscription can appear in the new public profile area. Enable the option below if you want to accept new participants automatically.',
                      'La suscripcion puede aparecer en la nueva area publica del perfil. Activa la opcion abajo si quieres aceptar participantes automaticamente.',
                      'Questo abbonamento puo apparire nella nuova area pubblica del profilo. Attiva l opzione sotto se vuoi accettare nuovi partecipanti automaticamente.'
                    )}
                  </p>
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="allowPublicParticipants"
                    checked={!!formData.allowPublicParticipants}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-600 text-[#5A5A40] focus:ring-[#5A5A40] bg-[#222]"
                  />
                  <span className="text-sm font-medium text-gray-300">
                    {tx('Permitir participantes publicos', 'Allow public participants', 'Permitir participantes publicos', 'Consenti partecipanti pubblici')}
                  </span>
                </label>

                {formData.allowPublicParticipants && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-800">
                    <div className="space-y-1">
                      <label className={labelClass}>{tx('Cota publica (sats)', 'Public share price (sats)', 'Cuota publica (sats)', 'Quota pubblica (sats)')}</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={publicSharePriceSatsStr}
                        onFocus={handleFocus}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          const v = e.target.value.replace(/\D/g, '');
                          setPublicSharePriceSatsStr(v);
                          setFormData((prev: Partial<Subscription>) => ({ ...prev, publicSharePriceSats: parseInt(v, 10) || 0 }));
                        }}
                        onBlur={() => {
                          if (publicSharePriceSatsStr === '') setPublicSharePriceSatsStr('0');
                        }}
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className={labelClass}>{tx('Entrada publica', 'Public entry type', 'Tipo de entrada publica', 'Tipo di ingresso pubblico')}</label>
                      <select
                        name="publicPaymentType"
                        value={formData.publicPaymentType || 'onetime'}
                        onChange={handleChange}
                        className={inputClass}
                      >
                        <option value="onetime">{tx('Pagamento unico', 'One-time payment', 'Pago unico', 'Pagamento singolo')}</option>
                        <option value="monthly">{tx('Compromisso mensal', 'Monthly commitment', 'Compromiso mensual', 'Impegno mensile')}</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className={labelClass}>{tx('Senha para publicos', 'Password for public joins', 'Contrasena para publicos', 'Password per pubblici')}</label>
                      <label className="flex items-center gap-3 h-[42px] px-4 bg-[#121212] border border-gray-700 rounded-xl">
                        <input
                          type="checkbox"
                          name="publicCredentialsEnabled"
                          checked={!!formData.publicCredentialsEnabled}
                          onChange={handleChange}
                          className="w-4 h-4 rounded border-gray-600 text-[#5A5A40] focus:ring-[#5A5A40] bg-[#222]"
                        />
                        <span className="text-sm text-gray-300">
                          {tx('Liberar senha apos entrada', 'Release password after join', 'Liberar contrasena tras entrar', 'Rilascia password dopo l ingresso')}
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                            setFormData(prev => ({ ...prev, name: app.name, logoUrl: normalizeLogoUrl(app.logo, app.name), category: 'Streaming' }));
                            setIsAppDropdownOpen(false);
                          }}
                        >
                          <img src={bestLogoUrl(app.logo, app.name) || ''} alt={app.name} className="w-6 h-6 rounded-full object-contain bg-white shrink-0 p-0.5" referrerPolicy="no-referrer" />
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
                    {(formData.logoUrl || suggestedLogo) ? (
                      <img src={bestLogoUrl(formData.logoUrl || suggestedLogo, formData.name || '') || ''} alt="Logo" referrerPolicy="no-referrer" className="w-10 h-10 object-contain rounded-lg border border-gray-700 bg-white p-0.5" />
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
                  <input type="text" inputMode="numeric" maxLength={2} value={dueDateStr} onFocus={handleFocus} onChange={e => setDueDateStr(sanitizeDayInput(e.target.value))} onBlur={() => setDueDateStr(String(clampDayValue(dueDateStr)))} className={inputClass} />
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
                <input type="text" placeholder={t('form.name')} value={item.name} onChange={e => handleSubItemChange(item.id, 'name', e.target.value)} className={`${inputClass} flex-[1.8] min-w-0`} />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={subItemAmountInputs[item.id] ?? String(item.costAmount ?? '')}
                  onChange={e => {
                    const rawValue = sanitizeDecimalInput(e.target.value);
                    setSubItemAmountInputs(prev => ({ ...prev, [item.id]: rawValue }));
                    handleSubItemChange(item.id, 'costAmount', parseDecimalInput(rawValue));
                  }}
                  className={`${inputClass} w-24 shrink-0 text-right`}
                />
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
                    <input type="text" inputMode="numeric" maxLength={2} value={earlyPayDateStr} onFocus={handleFocus} onChange={e => setEarlyPayDateStr(sanitizeDayInput(e.target.value))} onBlur={() => setEarlyPayDateStr(String(clampDayValue(earlyPayDateStr)))} className={inputClass} />
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
                <span className="text-sm font-medium text-gray-300">{tx('Esta assinatura gera retorno financeiro (ex: dividir com amigos)', 'This subscription generates financial return (e.g. sharing with friends)', 'Esta suscripcion genera retorno financiero (ej: compartir con amigos)', 'Questo abbonamento genera un ritorno economico (es. condivisione con amici)')}</span>
              </label>

              {formData.hasIncome && (
                <div className="space-y-4 pt-4 border-t border-gray-700">
                  {(!formData.sharedWith || formData.sharedWith.length === 0) && (
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="space-y-1">
                        <label className={labelClass}>{tx('Valor do Retorno Mensal', 'Monthly Return Amount', 'Valor del retorno mensual', 'Valore del ritorno mensile')}</label>
                        <input type="number" step="0.01" value={incomeAmountStr} onFocus={handleFocus} onChange={e => { setIncomeAmountStr(e.target.value); setFormData(prev => ({...prev, incomeAmount: parseFloat(e.target.value) || 0})); }} className={inputClass} />
                      </div>
                      <div className="space-y-1">
                        <label className={labelClass}>{t('form.currency')}</label>
                        <select name="incomeCurrency" value={formData.incomeCurrency} onChange={handleChange} className={inputClass}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-500 uppercase tracking-widest font-bold">
                      {(!formData.sharedWith || formData.sharedWith.length === 0) ? tx('Ou adicione participantes', 'Or add participants', 'O agrega participantes', 'Oppure aggiungi partecipanti') : t('form.members' as any)}
                    </span>
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
                              <Users size={16} className="text-indigo-400 shrink-0" />
                              <div className={`flex-1 bg-[#121212] border rounded-lg px-3 py-1.5 focus-within:border-indigo-500/50 transition-colors ${member.userId ? 'border-[#5A5A40] bg-[#191910]' : 'border-gray-700'}`}>
                                <input 
                                  type="text" 
                                  placeholder={tx('Nome ou @username', 'Name or @username', 'Nombre o @username', 'Nome o @username')} 
                                  value={member.name} 
                                  onChange={e => handleSharedMemberNameChange(member.id, e.target.value)} 
                                  className={`w-full bg-transparent text-sm font-medium border-0 focus:ring-0 placeholder:text-gray-600 p-0 ${member.userId ? 'text-[#d0d0a0]' : 'text-white'}`} 
                                />
                                {member.userId && (
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2a2a1a] text-[#d0d0a0] uppercase font-bold tracking-wider">
                                      {member.username ? `@${member.username}` : tx('usuario', 'user', 'usuario', 'utente')}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                      {member.accepted ? tx('aceitou', 'accepted', 'aceptado', 'accettato') : tx('aguardando aceite', 'waiting for acceptance', 'esperando aceptacion', 'in attesa di conferma')}
                                    </span>
                                  </div>
                                )}
                                {!member.userId && memberValidationErrors[member.id] && (
                                  <div className="mt-1 text-[10px] text-red-400">{memberValidationErrors[member.id]}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 bg-[#121212] border border-gray-700 px-2 py-1.5 rounded-lg shrink-0">
                                <span className="text-[10px] text-gray-500 uppercase">{tx('Dia', 'Day', 'Dia', 'Giorno')}</span>
                                <input 
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={2}
                                  value={memberPaymentDayInputs[member.id] ?? String(member.paymentDate || '')}
                                  onChange={e => handleSharedMemberPaymentDayChange(member.id, e.target.value)}
                                  onBlur={() => finalizeSharedMemberPaymentDay(member.id)}
                                  className="w-7 bg-transparent text-center text-xs text-white border-0 focus:ring-0 p-0" 
                                />
                              </div>
                              <button 
                                type="button" 
                                onClick={() => removeSharedMember(member.id)} 
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-900/20 rounded-lg transition-colors sm:hidden"
                                title="Remover"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>

                            {member.name.trim().startsWith('@') && (
                              <div className="bg-[#121212] border border-gray-700 rounded-xl overflow-hidden">
                                {memberSearchLoading[member.id] ? (
                                  <div className="px-3 py-2 text-xs text-gray-500">{tx('Buscando usuarios...', 'Searching users...', 'Buscando usuarios...', 'Ricerca utenti...')}</div>
                                ) : (memberSearchResults[member.id] || []).length > 0 ? (
                                  (memberSearchResults[member.id] || []).map((foundUser) => (
                                    <button
                                      key={foundUser.id}
                                      type="button"
                                      onClick={() => selectSharedUser(member.id, foundUser)}
                                      className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#1d1d1d] transition-colors"
                                    >
                                      <div>
                                        <p className="text-sm text-white font-medium">{foundUser.name || foundUser.username}</p>
                                        <p className="text-[11px] text-[#d0d0a0]">@{foundUser.username}</p>
                                      </div>
                                      <span className="text-[10px] text-gray-500 uppercase">{tx('usuario', 'user', 'usuario', 'utente')}</span>
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-3 py-2 text-xs text-red-400">{tx('Usuario inexistente', 'User does not exist', 'Usuario inexistente', 'Utente inesistente')}</div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-2 bg-[#121212] px-3 py-2 rounded-lg border border-gray-800/50 group-focus-within:border-emerald-500/50 transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <DollarSign size={14} className="text-emerald-500" />
                                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">{tx('Quanto paga', 'How much they pay', 'Cuanto paga', 'Quanto paga')}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        patchSharedMember(member.id, {
                                          shareType: 'amount',
                                          currency: member.currency || formData.costCurrency || 'BRL',
                                        });
                                      }}
                                      className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${member.shareType === 'percentage' ? 'bg-[#1a1a1a] text-gray-500' : 'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50'}`}
                                    >
                                      {tx('Valor', 'Amount', 'Valor', 'Valore')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        patchSharedMember(member.id, {
                                          shareType: 'percentage',
                                          currency: formData.costCurrency || member.currency || 'BRL',
                                        });
                                      }}
                                      className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${member.shareType === 'percentage' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50' : 'bg-[#1a1a1a] text-gray-500'}`}
                                    >
                                      %
                                    </button>
                                  </div>
                                </div>

                                {member.shareType === 'percentage' ? (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      placeholder="0"
                                      value={member.percentage || ''}
                                      onChange={e => {
                                        patchSharedMember(member.id, {
                                          percentage: Number(e.target.value) || 0,
                                          currency: formData.costCurrency || member.currency || 'BRL',
                                        });
                                      }}
                                      className="w-full bg-transparent text-xs border-0 focus:ring-0 text-white p-0"
                                    />
                                    <span className="text-xs text-gray-400">%</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <input 
                                      type="number" 
                                      placeholder="0.00"
                                      value={member.amount || ''} 
                                      onChange={e => {
                                        patchSharedMember(member.id, { amount: parseFloat(e.target.value) || 0 });
                                      }} 
                                      className="w-full bg-transparent text-xs border-0 focus:ring-0 text-white p-0" 
                                    />
                                    <select 
                                      value={member.currency || formData.costCurrency} 
                                      onChange={e => {
                                        patchSharedMember(member.id, { currency: e.target.value as Currency });
                                      }}
                                      className="bg-transparent text-[10px] border-0 focus:ring-0 text-gray-400 p-0 w-12"
                                    >
                                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 bg-[#121212] px-3 py-2 rounded-lg border border-gray-800 group-focus-within:border-[#5A5A40] transition-colors">
                                <Info size={14} className="text-gray-500" />
                                <input 
                                  type="text" 
                                  placeholder={tx('Descricao (ex: Telegram)', 'Info (e.g. Telegram)', 'Descripcion (ej: Telegram)', 'Descrizione (es: Telegram)')} 
                                  value={member.info || ''} 
                                  onChange={e => updateSharedMember(member.id, 'info', e.target.value)} 
                                  className="w-full bg-transparent text-xs border-0 focus:ring-0 text-white p-0" 
                                />
                              </div>
                            </div>
                            
                            <div className="flex justify-between items-center px-1">
                              <span className="text-[9px] text-gray-600 italic">{tx('Arraste para remover', 'Swipe to remove', 'Desliza para eliminar', 'Scorri per rimuovere')}</span>
                              {resolveMemberAmount(member) > 0 && (
                                <span className="text-[10px] text-emerald-500 font-bold">
                                  {member.shareType === 'percentage'
                                    ? `${Number(member.percentage || 0).toFixed(1)}% · ${member.currency || formData.costCurrency} ${resolveMemberAmount(member).toFixed(2)}`
                                    : `${member.currency} ${resolveMemberAmount(member).toFixed(2)}`}
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
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              {tx('Acesso do servico', 'Service access', 'Acceso del servicio', 'Accesso al servizio')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className={labelClass}>{tx('Login do servico', 'Service login', 'Login del servicio', 'Login del servizio')}</label>
                <input
                  type="text"
                  name="serviceUsername"
                  value={formData.serviceUsername || ''}
                  onChange={handleChange}
                  placeholder={tx('Email, usuario ou login', 'Email, username or login', 'Email, usuario o login', 'Email, utente o login')}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label className={labelClass}>{tx('Senha do servico', 'Service password', 'Contrasena del servicio', 'Password del servizio')}</label>
                <input
                  type="text"
                  name="servicePassword"
                  value={formData.servicePassword || ''}
                  onChange={handleChange}
                  placeholder={tx('Senha para compartilhar quando quiser', 'Password to share when needed', 'Contrasena para compartir cuando quieras', 'Password da condividere quando serve')}
                  className={inputClass}
                />
              </div>
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
            {formError && <div className="flex-1 self-center text-sm text-red-400">{formError}</div>}
            <button type="button" onClick={onClose} className="px-6 py-2.5 text-sm font-medium text-gray-300 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors">{t('app.cancel')}</button>
            <button type="submit" className="px-8 py-2.5 text-sm font-medium text-white bg-[#7a7a5c] rounded-full hover:bg-[#8a8a6c] transition-colors shadow-lg">{t('form.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
