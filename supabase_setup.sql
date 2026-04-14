-- Script Oficial de Configuração do Supabase para Boa Wallet
-- Copie este código inteiro, vá no seu painel do Supabase -> SQL Editor -> New Query
-- Cole o código e clique em "Run" (Executar)

-- 1. Cria ou recria a tabela 'subscriptions'
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    "userId" TEXT,
    name TEXT,
    type TEXT,
    emoji TEXT,
    "logoUrl" TEXT,
    "bankLogoUrl" TEXT,
    category TEXT,
    notes TEXT,
    status TEXT,

    "costAmount" NUMERIC,
    "costCurrency" TEXT,
    "billingCycle" TEXT,
    "dueDate" NUMERIC,
    "dueMonth" NUMERIC,
    "originalCost" NUMERIC,

    "paymentMethod" TEXT,
    "paymentSource" TEXT,

    "isPromotional" BOOLEAN,
    "promoEndDate" TEXT,
    "promoEndCycle" NUMERIC,

    "hasCashback" BOOLEAN,
    "cashbackPercentage" NUMERIC,

    "autoRenewDate" NUMERIC,
    "cancellationDate" NUMERIC,
    "reminderDisabled" BOOLEAN,
    "paymentHistory" JSONB,

    "hasEarlyPayDiscount" BOOLEAN,
    "earlyPayDate" NUMERIC,
    "earlyPayCost" NUMERIC,

    "hasIncome" BOOLEAN,
    "incomeAmount" NUMERIC,
    "incomeCurrency" TEXT,
    "incomeFrequency" TEXT,
    "incomeSourceDescription" TEXT,

    "sharedWith" JSONB,
    "subItems" JSONB,

    "isSingleExpense" BOOLEAN,
    "isFlexibleDate" BOOLEAN,

    "fiatReferenceAmount" NUMERIC,
    "fiatReferenceCurrency" TEXT,
    "baseCurrencyConversionRate" NUMERIC,

    "createdAt" TEXT,
    "updatedAt" TEXT
);

-- 1b. Adiciona colunas que podem estar faltando em tabelas já existentes
--     (rode também se já tinha a tabela criada antes)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "bankLogoUrl" TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "dueMonth" NUMERIC;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "originalCost" NUMERIC;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "paymentSource" TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "isSingleExpense" BOOLEAN;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "isFlexibleDate" BOOLEAN;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "promoEndCycle" NUMERIC;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS "baseCurrencyConversionRate" NUMERIC;

-- 2. Cria a tabela de Adjustments
CREATE TABLE IF NOT EXISTS public.adjustments (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    subscription_id TEXT,
    type TEXT,
    amount NUMERIC,
    date TEXT,
    description TEXT
);

-- 3. Cria a tabela de Users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    email TEXT,
    name TEXT,
    language TEXT,
    base_currency TEXT,
    updated_at TEXT
);

-- 4. Habilita Row Level Security
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de segurança (drop e recria para evitar conflito)
DROP POLICY IF EXISTS "Users can fully manage their own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can fully manage their own adjustments" ON public.adjustments;
DROP POLICY IF EXISTS "Users can manage their profile" ON public.users;

CREATE POLICY "Users can fully manage their own subscriptions" ON public.subscriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can fully manage their own adjustments" ON public.adjustments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their profile" ON public.users FOR ALL USING (auth.uid() = id);
