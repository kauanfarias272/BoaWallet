import { useMemo, useState, type SyntheticEvent } from 'react';
import {
  ChevronDown,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Truck,
  User,
  X,
} from 'lucide-react';

type Product = {
  id: string;
  title: string;
  price: string;
  oldPrice?: string;
  image: string;
  badge?: string;
};

type ProductSection = {
  id: string;
  title: string;
  align?: 'left' | 'center';
  products: Product[];
};

type CartItem = {
  product: Product;
  quantity: number;
};

const shopifyFilesBase = 'https://cdn.shopify.com/s/files/1/0973/6732/7067/files/';

const img = (path: string, width = 900) => {
  const source = path.startsWith('//') ? `https:${path}` : path.startsWith('http') ? path : `${shopifyFilesBase}${path}`;
  const fullSize = source.replace(/_1x1(?=\.(jpg|jpeg|png|webp))/i, '');
  return fullSize.includes('width=') ? fullSize : `${fullSize}${fullSize.includes('?') ? '&' : '?'}width=${width}`;
};

const logo = '/mannique-logo.svg';
const markLogo = '/mannique-mark.svg';
const heroImage = img('black-and-white-portrait-mens-fashion.jpg?v=1763503032', 2200);
const fallbackProductImage = img('8601e2ef-b30d-4644-9913-7ec84abcc394_1x1.jpg?v=1763903687', 900);

function useFallbackImage(event: SyntheticEvent<HTMLImageElement>) {
  const image = event.currentTarget;
  if (image.src !== fallbackProductImage) {
    image.src = fallbackProductImage;
  }
}

const sections: ProductSection[] = [
  {
    id: 'produtos-teste',
    title: 'PRODOTTI TEST',
    products: [
      {
        id: 'test-overshirt',
        title: 'Prodotto Test - Overshirt Milano in cotone premium',
        price: '€39,90',
        oldPrice: '€69,90',
        badge: 'Test prodotto',
        image: 'BO25A101301_1.jpg?v=1763479439',
      },
      {
        id: 'test-knit',
        title: 'Prodotto Test - Maglia Roma texture morbida',
        price: '€32,50',
        oldPrice: '€58,00',
        badge: 'Test prodotto',
        image: '3cb3f4e9849a7ae3c300ecba8589eb70_05d052d713f7.jpg?v=1763903350',
      },
      {
        id: 'test-loafer',
        title: 'Prodotto Test - Mocassino Firenze casual',
        price: '€44,00',
        oldPrice: '€79,00',
        badge: 'Test prodotto',
        image: 'driver_loafers_0066.png?v=1763481376',
      },
      {
        id: 'test-jacket',
        title: 'Prodotto Test - Giacca Torino urban fit',
        price: '€74,90',
        oldPrice: '€119,90',
        badge: 'Test prodotto',
        image: '9767441b624ace0e493301e75e4c5923_c0eebb4f45c4.jpg?v=1763904358',
      },
    ],
  },
  {
    id: 'best-sellers',
    title: 'Best Sellers',
    align: 'left',
    products: [
      {
        id: 'siracusa',
        title: 'Maglione Siracusa - Pullover Casual Taglio Regolare',
        price: '€21,50',
        oldPrice: '€54,70',
        badge: 'Risparmia fino a 60%',
        image: '8601e2ef-b30d-4644-9913-7ec84abcc394_1x1.jpg?v=1763903687',
      },
      {
        id: 'pescara',
        title: '3 maglioni Pescara da uomo a collo alto - Maglioni invernali morbidi e caldi, top minimalisti',
        price: '€48,90',
        oldPrice: '€102,90',
        badge: 'Risparmia fino a 52%',
        image: '4e895d3a-e96e-4397-8762-d7e806001dbf_1x1.jpg?v=1763903350',
      },
      {
        id: 'como',
        title: 'Maglione Dolcevita Como - Tessuto Soft',
        price: '€29,90',
        oldPrice: '€67,90',
        badge: 'Risparmia fino a 55%',
        image: '7a0dbabd4d184359aee5ed135280519d-goods_1x1.jpg?v=1763902665',
      },
      {
        id: 'naperville',
        title: 'NAPERVILLE - Giacca trapuntata con imbottitura tatto piuma',
        price: '€35,48',
        image: 'RO5094_231_1_1_1x1.jpg?v=1763479542',
      },
      {
        id: 'set-sportivo',
        title: 'Set Sportivo Casual da Uomo Transfrontaliero con Maglia e Pantaloncini',
        price: '€35,65',
        oldPrice: '€56,99',
        badge: 'Risparmia fino a 37%',
        image: '19d949a6-d06d-4738-912b-e739149372df_1x1.jpg?v=1766004073',
      },
      {
        id: 'prestige',
        title: 'Pullover Prestige',
        price: '€43,00',
        oldPrice: '€71,00',
        badge: 'Risparmia fino a 39%',
        image: 'rn-image_picker_lib_temp_dcb02b07-3df8-40dc-8862-50535caefe00_1x1.jpg?v=1763849718',
      },
      {
        id: 'minimalista',
        title: 'Nuovo Arrivo Autunno-Inverno Maglione Uomo Colore Unico Minimalista Collo Alto in Maglia',
        price: '€40,00',
        oldPrice: '€59,99',
        badge: 'Risparmia fino a 33%',
        image: '1d416526-b604-4999-86c3-6d65a63dfac4_1x1.jpg?v=1765730532',
      },
      {
        id: 'norvegia',
        title: "Nuova Giacca Norvegia Vento Casual da Uomo per Sport all'Aperto in Primavera",
        price: '€35,60',
        oldPrice: '€87,90',
        badge: 'Risparmia fino a 59%',
        image: '39cc9ca1-66b6-445c-ab4b-6c11fca38773_1x1.jpg?v=1765730822',
      },
    ],
  },
  {
    id: 'winter-clothes',
    title: 'Winter clothes',
    products: [
      {
        id: 'venezia',
        title: 'Venezia Tattico Lusso',
        price: '€84,95',
        oldPrice: '€199,90',
        badge: 'Risparmia fino a 57%',
        image: 'rn-image_picker_lib_temp_3e876299-8d71-4af9-99a6-8e4bb8504125_1x1.png?v=1763927565',
      },
      {
        id: 'parka',
        title: 'Parka Artico Dolomiti - Black Edition',
        price: '€99,95',
        oldPrice: '€199,90',
        badge: 'Risparmia fino a 50%',
        image: 'rn-image_picker_lib_temp_3533426e-8e57-4fe0-b001-de674518873e_1x1.png?v=1763930711',
      },
      {
        id: 'lucca-gloves',
        title: 'Vintage Lucca Gloves',
        price: '€39,95',
        oldPrice: '€99,90',
        badge: 'Risparmia fino a 60%',
        image: '39e6ee31209a291e1d5aa84ee9b02813_1x1.jpg?v=1763822237',
      },
      {
        id: 'verona',
        title: 'Verona Lusso Jacket',
        price: '€99,95',
        oldPrice: '€199,90',
        badge: 'Risparmia fino a 50%',
        image: 'rn-image_picker_lib_temp_70c0ab50-7c8e-49d9-b3d4-e84fca6aa5ac_1x1.png?v=1763930330',
      },
    ],
  },
  {
    id: 'scarpe',
    title: 'SCARPE',
    products: [
      {
        id: 'city-shoes',
        title: 'Scarpe da città in pelle scamosciata di prima qualità',
        price: '€55,00',
        oldPrice: '€80,00',
        badge: 'Risparmia fino a 31%',
        image: '1H4A9965_1x1.jpg?v=1763481367',
      },
      {
        id: 'germania-shoes',
        title: 'Scarpe Germania da ginnastica casual da uomo',
        price: '€39,90',
        oldPrice: '€59,90',
        badge: 'Risparmia fino a 33%',
        image: '308d3c2c-bef5-4f0b-b206-14fb0c4b3353_1x1.jpg?v=1765730065',
      },
      {
        id: 'old-money-loafers',
        title: 'Mocassini in pelle scamosciata',
        price: '€51,00',
        oldPrice: '€97,00',
        badge: 'Risparmia fino a 47%',
        image: 'Loafer-orange_9_1x1.jpg?v=1763481376',
      },
      {
        id: 'suede-strap',
        title: 'Mocassini in pelle scamosciata',
        price: '€50,00',
        oldPrice: '€62,00',
        badge: 'Risparmia fino a 19%',
        image: '1_72dd0929-2857-4e09-8d52-5f2d3a0b59cd_1x1.jpg?v=1763481377',
      },
    ],
  },
  {
    id: 'orologi',
    title: 'OROLOGI',
    products: [
      {
        id: 'steel-watch',
        title: 'Orologio in acciaio inossidabile (impermeabile)',
        price: '€70,00',
        image: '8_77bd6125-bf08-4aa0-bffc-bde3b5d572f0_1x1.png?v=1763481377',
      },
      {
        id: 'santorini',
        title: 'Orologio Santorini Elite',
        price: '€36,00',
        oldPrice: '€53,00',
        badge: 'Risparmia fino a 32%',
        image: 'ImageEdit-OldMoney_5_61a3104a-363c-407e-8318-39816dc83ddc_1x1.jpg?v=1763481377',
      },
      {
        id: 'quarzo-marino',
        title: 'Orologio al quarzo marino',
        price: '€34,00',
        oldPrice: '€67,00',
        badge: 'Risparmia fino a 49%',
        image: '2_670cff43-170a-4b4c-8c4d-16ddc3196346_1x1.png?v=1763481378',
      },
      {
        id: 'lugano',
        title: 'Orologio Lugano Classic (impermeabile)',
        price: '€36,00',
        oldPrice: '€62,00',
        badge: 'Risparmia fino a 41%',
        image: '2_816cd4f0-1f29-4973-9aa0-5232b2827756_1x1.png?v=1763481378',
      },
    ],
  },
  {
    id: 'pantaloni',
    title: 'PANTALONI',
    products: [
      {
        id: 'set-sportivo-pantaloni',
        title: 'Set Sportivo Casual da Uomo Transfrontaliero con Maglia e Pantaloncini',
        price: '€35,65',
        oldPrice: '€56,99',
        badge: 'Risparmia fino a 37%',
        image: '19d949a6-d06d-4738-912b-e739149372df_1x1.jpg?v=1766004073',
      },
      {
        id: 'cargo-lino',
        title: 'Pantaloni cargo estivi in lino traspirante per uomo - Colore solido Casual Streetwear, vestibilità regolare con lunghezza fino al ginocchio e tasche',
        price: '€35,50',
        oldPrice: '€58,79',
        badge: 'Risparmia fino a 39%',
        image: 'b28eec05-d7a3-4960-bf8e-e8db046a23a6_1x1.jpg?v=1766004170',
      },
      {
        id: 'gurkha-alpha',
        title: 'Pantalone Gurkha Uomo Alpha',
        price: '€42,60',
        oldPrice: '€84,90',
        badge: 'Risparmia fino a 49%',
        image: 'Work_79_1x1.png?v=1763932795',
      },
      {
        id: 'gurkha-germania',
        title: 'Pantalone Germania - Gurkha',
        price: '€39,90',
        oldPrice: '€75,89',
        badge: 'Risparmia fino a 47%',
        image: '1763767211447_1x1.png?v=1763931779',
      },
    ],
  },
];

const featuredImages = [
  'S87a737d4561d495c94f1f47329b9d518t.webp?v=1763899488',
  'Se2258de044b54686a4d461b2804e6ad4L.webp?v=1763899489',
  'Sfc62e6c3fc0c40ffa6943f0ba4dd3bd34.webp?v=1763899489',
  'S66596c63a5d54313adb5ab40fb9919acl.webp?v=1763899488',
  'S514f5f832dd34611b7d6cbf5894b9114O.webp?v=1763899489',
  'Sd60299d23c184c389843694aa01ecd8cQ.webp?v=1763899488',
  'S9a3c2471e874483a9625eb0ba17cce2aI.webp?v=1763899488',
];

const topImages = [
  'photo_4979084062622419826_y.jpg?v=1763933664&width=300',
  'photo_4979084062622419829_y.jpg?v=1763933704&width=300',
  'Gemini_Generated_Image_xqzocmxqzocmxqzo.png?v=1763933819&width=300',
  'photo_4979084062622419825_y.jpg?v=1763933738&width=300',
  'BO25A101301_1.jpg?v=1763479439&width=300',
  'RO5094_231_1_1.jpg?v=1763479542&width=300',
  '3cb3f4e9849a7ae3c300ecba8589eb70_05d052d713f7.jpg?v=1763903350&width=300',
  'photo_4979084062622419827_y.jpg?v=1763933855&width=300',
  'driver_loafers_0066.png?v=1763481376&width=300',
  '4c54d276-c58b-416f-867b-ca598e983bec.jpg?v=1763903687&width=300',
  '9767441b624ace0e493301e75e4c5923_c0eebb4f45c4.jpg?v=1763904358&width=300',
];

const faqs = [
  {
    question: 'Qual è la qualità dei prodotti Mannique?',
    answer:
      'I nostri prodotti sono realizzati con materiali di alta qualità e con una grande attenzione ai dettagli. Selezioniamo accuratamente i nostri fornitori per garantire che ogni articolo offra stile, durata e comfort eccellenti, ispirandosi alle ultime tendenze della moda.',
  },
  {
    question: 'Spedite nel mio paese?',
    answer:
      'Sì, spediamo in quasi tutto il mondo! Durante il checkout, potrai selezionare il tuo paese per confermare la disponibilità della spedizione verso la tua zona.',
  },
  {
    question: 'Devo pagare costi aggiuntivi alla consegna?',
    answer:
      "Le tasse doganali e i dazi d'importazione dipendono dalle normative del tuo paese e non sono inclusi nel prezzo del prodotto. Ti consigliamo di verificare con l'ufficio doganale locale se sono previsti costi extra al momento della ricezione del pacco.",
  },
  {
    question: 'E se la taglia non è giusta?',
    answer:
      "Vogliamo che tu sia soddisfatto del tuo acquisto. Ti consigliamo di consultare sempre la nostra guida alle taglie prima di ordinare. Se l'articolo non va bene, contattaci e ti guideremo attraverso il processo di soluzione più adatto.",
  },
  {
    question: 'Cosa devo fare se voglio cambiare o restituire un articolo?',
    answer:
      "Se desideri effettuare un cambio o un reso, contatta il nostro servizio clienti entro 7 giorni dalla ricezione dell'ordine. Ti forniremo tutte le istruzioni necessarie per procedere.",
  },
  {
    question: 'Quali metodi di spedizione offrite?',
    answer:
      'Offriamo diverse opzioni di spedizione per soddisfare le tue esigenze, tra cui la spedizione standard tracciabile. Puoi visualizzare i metodi disponibili e i tempi di consegna stimati al momento del pagamento.',
  },
];

const suggestedSearches = ['Maglione', 'Scarpe', 'Orologio', 'Pantaloni'];

function toNumber(price: string) {
  return Number(price.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

function formatEuro(value: number) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}

function ProductCard({ product, onAdd }: { product: Product; onAdd: (product: Product) => void }) {
  return (
    <article className="product-card">
      <button className="product-card__media" type="button" onClick={() => onAdd(product)} aria-label={`Acquisto rapido ${product.title}`}>
        <img src={img(product.image, 1000)} alt={product.title} loading="lazy" onError={useFallbackImage} />
        {product.badge && <span className="product-card__badge">{product.badge}</span>}
        <span className="quick-buy">
          <ShoppingBag size={17} aria-hidden="true" />
          <span>Acquisto rapido</span>
        </span>
      </button>
      <div className="product-card__info">
        <button className="product-card__title" type="button" onClick={() => onAdd(product)}>
          {product.title}
        </button>
        <button className="product-card__price" type="button" onClick={() => onAdd(product)} aria-label={`Comprar ${product.title}`}>
          <span>{product.price}</span>
          {product.oldPrice && <s>{product.oldPrice}</s>}
        </button>
      </div>
    </article>
  );
}

function CollectionSection({ section, onAdd }: { section: ProductSection; onAdd: (product: Product) => void }) {
  return (
    <section className="collection-section" id={section.id}>
      <div className={`section-heading section-heading--${section.align ?? 'center'}`}>
        <a href={`#${section.id}`}>{section.title}</a>
      </div>
      <div className="product-grid">
        {section.products.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={onAdd} />
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState('Black');
  const [openFaq, setOpenFaq] = useState(0);

  const allProducts = useMemo(() => sections.flatMap((section) => section.products), []);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + toNumber(item.product.price) * item.quantity, 0);
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allProducts.slice(0, 6);
    return allProducts.filter((product) => product.title.toLowerCase().includes(normalized)).slice(0, 8);
  }, [allProducts, query]);

  const addToCart = (product: Product) => {
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (existing) {
        return items.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [...items, { product, quantity: 1 }];
    });
    setCartOpen(true);
  };

  const addFeaturedToCart = () => {
    addToCart({
      id: `borsone-${selectedColor.toLowerCase().replace(/\s+/g, '-')}`,
      title: `Borsone Weekender Milano - Coccodrillo Luxury - ${selectedColor}`,
      price: '€25,70',
      image: featuredImages[activeImage],
    });
  };

  const changeQuantity = (id: string, amount: number) => {
    setCart((items) =>
      items
        .map((item) => (item.product.id === id ? { ...item, quantity: Math.max(0, item.quantity + amount) } : item))
        .filter((item) => item.quantity > 0),
    );
  };

  return (
    <div className="mannique">
      <div className="browser-note">Questo sito ha un supporto limitato per il tuo browser. Consigliamo di passare a Edge, Chrome, Safari o Firefox.</div>
      <div className="announcement">
        <img src={markLogo} alt="Mannique" />
        <span>consegna gratuita in Italia.– PERIODO LIMITATO!</span>
      </div>

      <header className="site-header">
        <button className="icon-button mobile-only" type="button" onClick={() => setMenuOpen(true)} aria-label="Apri menu" title="Apri menu">
          <Menu size={21} />
        </button>
        <nav className="desktop-nav" aria-label="Navigazione principale">
          <a href="#top">Casa</a>
          <a href="#best-sellers">Catalogare</a>
          <a href="#contatto">Contatto</a>
          <a href="#track">Track Your Order</a>
        </nav>
        <a className="brand" href="#top" aria-label="Mannique home">
          <img src={logo} alt="" />
        </a>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={() => setSearchOpen(true)} aria-label="Cerca" title="Cerca">
            <Search size={20} />
          </button>
          <button className="icon-button desktop-only" type="button" aria-label="Il mio account" title="Il mio account">
            <User size={20} />
          </button>
          <button className="icon-button cart-trigger" type="button" onClick={() => setCartOpen(true)} aria-label="Apri carrello" title="Apri carrello">
            <ShoppingBag size={20} />
            <span>{cartCount}</span>
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-label="Mannique">
          <img src={heroImage} alt="Mannique mens fashion" onError={useFallbackImage} />
          <div className="hero__shade" />
          <a className="hero__button" href="#best-sellers">SHOP NOW</a>
        </section>

        {sections.slice(0, 4).map((section) => (
          <CollectionSection key={section.id} section={section} onAdd={addToCart} />
        ))}

        <section className="featured-product" id="borsone">
          <div className="featured-product__gallery">
            <div className="featured-product__image">
              <img src={img(featuredImages[activeImage], 1400)} alt="Borsone Weekender Milano - Coccodrillo Luxury" onError={useFallbackImage} />
            </div>
            <div className="featured-product__thumbs" aria-label="Immagini prodotto">
              {featuredImages.map((image, index) => (
                <button
                  className={index === activeImage ? 'is-active' : ''}
                  key={image}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`Apri immagine ${index + 1}`}
                >
                  <img src={img(image, 220)} alt="" onError={useFallbackImage} />
                </button>
              ))}
            </div>
          </div>
          <div className="featured-product__details">
            <h1>Borsone Weekender Milano - Coccodrillo Luxury</h1>
            <p className="featured-product__price">€25,70<span>Vendita • Salva</span></p>
            <div className="option-group">
              <span>Color</span>
              <div className="swatches">
                {['Black', 'deep brown'].map((color) => (
                  <button
                    key={color}
                    className={selectedColor === color ? 'is-selected' : ''}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    aria-label={color}
                  >
                    <span className={color === 'Black' ? 'swatch swatch--black' : 'swatch swatch--brown'} />
                    {color}
                  </button>
                ))}
              </div>
            </div>
            <button className="add-to-cart" type="button" onClick={addFeaturedToCart}>
              Aggiungi al carrello
            </button>
            <button className="sticky-atc" type="button" onClick={addFeaturedToCart}>
              ADD TO CART
            </button>
          </div>
        </section>

        {sections.slice(4).map((section) => (
          <CollectionSection key={section.id} section={section} onAdd={addToCart} />
        ))}

        <section className="tops" aria-label="I Top di Mannique">
          <h2>I Top di Mannique</h2>
          <div className="tops__marquee">
            {[...topImages, ...topImages, ...topImages].map((image, index) => (
              <img key={`${image}-${index}`} src={img(image, 360)} alt="I Top di Mannique" loading="lazy" onError={useFallbackImage} />
            ))}
          </div>
        </section>

        <section className="faq" id="track">
          <h2>Domande Frequenti (FAQ)</h2>
          <div className="faq__grid">
            {faqs.map((item, index) => (
              <div className="faq__item" key={item.question}>
                <button type="button" onClick={() => setOpenFaq(openFaq === index ? -1 : index)} aria-expanded={openFaq === index}>
                  <span>{item.question}</span>
                  {openFaq === index ? <Minus size={18} /> : <Plus size={18} />}
                </button>
                <div className={openFaq === index ? 'faq__answer is-open' : 'faq__answer'}>
                  <p>{item.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="site-footer" id="contatto">
        <div className="footer-shipping">
          <Truck size={22} aria-hidden="true" />
          <div>
            <strong>Spedizione Gratuita</strong>
            <span>Italia</span>
          </div>
        </div>
        <div className="footer-grid">
          <div>
            <h3>Il Nostro Impegno: 10% per il Futuro</h3>
            <p>Investiamo nella natura e nella tecnologia per un mondo migliore.</p>
          </div>
          <div>
            <h3>Info</h3>
            <a href="#top">Casa</a>
            <a href="#best-sellers">Catalogare</a>
            <a href="#contatto">Contatto</a>
            <a href="#track">Track Your Order</a>
          </div>
          <div>
            <h3>La Filosofia Mannique</h3>
            <p>In Mannique, la nostra missione è elevare l'uomo moderno, permettendogli di esprimere la propria identità con un'eleganza senza tempo.</p>
          </div>
          <div>
            <h3>Newsletter</h3>
            <p>Dont miss out on new collections, scents, and exclusive offers.</p>
            <form className="newsletter">
              <input aria-label="Iscriviti alla newsletter" placeholder="Indirizzo e-mail" type="email" />
              <button type="submit">Iscriviti</button>
            </form>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026, Mannique. Fornito da Shopify.</span>
          <span>American Express • Apple Pay • Klarna • Mastercard • PayPal • Visa</span>
        </div>
      </footer>

      {menuOpen && (
        <div className="drawer-overlay" onClick={() => setMenuOpen(false)}>
          <aside className="mobile-menu" onClick={(event) => event.stopPropagation()} aria-label="Menu">
            <button className="icon-button" type="button" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu" title="Chiudi">
              <X size={22} />
            </button>
            <img src={logo} alt="Mannique" />
            <a href="#top" onClick={() => setMenuOpen(false)}>Casa</a>
            <a href="#best-sellers" onClick={() => setMenuOpen(false)}>Catalogare</a>
            <a href="#contatto" onClick={() => setMenuOpen(false)}>Contatto</a>
            <a href="#track" onClick={() => setMenuOpen(false)}>Track Your Order</a>
          </aside>
        </div>
      )}

      {searchOpen && (
        <div className="modal-overlay" onClick={() => setSearchOpen(false)}>
          <section className="search-modal" onClick={(event) => event.stopPropagation()} aria-label="Cerca prodotti">
            <button className="icon-button modal-close" type="button" onClick={() => setSearchOpen(false)} aria-label="Chiudi ricerca" title="Chiudi">
              <X size={22} />
            </button>
            <h2>Cerca prodotti sul nostro sito</h2>
            <div className="search-field">
              <Search size={20} aria-hidden="true" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ricerca" />
            </div>
            <div className="suggestions">
              <span>Termini di ricerca suggeriti</span>
              {suggestedSearches.map((term) => (
                <button type="button" key={term} onClick={() => setQuery(term)}>
                  {term}
                </button>
              ))}
            </div>
            <div className="search-results">
              {searchResults.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    addToCart(product);
                    setSearchOpen(false);
                  }}
                >
                  <img src={img(product.image, 220)} alt="" onError={useFallbackImage} />
                  <span>{product.title}</span>
                  <strong>{product.price}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {cartOpen && (
        <div className="drawer-overlay" onClick={() => setCartOpen(false)}>
          <aside className="cart-drawer" onClick={(event) => event.stopPropagation()} aria-label="Carrello">
            <div className="cart-drawer__header">
              <div>
                <h2>Carrello</h2>
                <span>{cartCount} articoli</span>
              </div>
              <button className="icon-button" type="button" onClick={() => setCartOpen(false)} aria-label="Chiudi carrello" title="Chiudi">
                <X size={22} />
              </button>
            </div>
            <div className="cart-progress">
              <span>Spend €1 more for FREE shipping.</span>
              <strong>Congratulazioni! Il tuo ordine è idoneo alla spedizione gratuita</strong>
            </div>
            {cart.length === 0 ? (
              <p className="empty-cart">Il tuo carrello è attualmente vuoto.</p>
            ) : (
              <div className="cart-items">
                {cart.map((item) => (
                  <div className="cart-item" key={item.product.id}>
                    <img src={img(item.product.image, 180)} alt="" onError={useFallbackImage} />
                    <div>
                      <strong>{item.product.title}</strong>
                      <span>{item.product.price}</span>
                      <div className="quantity-control">
                        <button type="button" onClick={() => changeQuantity(item.product.id, -1)} aria-label="Diminuisci quantità">
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(item.product.id, 1)} aria-label="Aumenta quantità">
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="cart-drawer__footer">
              <div className="cart-total">
                <span>Totale</span>
                <strong>{formatEuro(subtotal)}</strong>
              </div>
              <button type="button">Pagamento Gratis</button>
              <small>Spedizione e tasse calcolate al pagamento</small>
            </div>
          </aside>
        </div>
      )}

      <button className="floating-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Torna su" title="Torna su">
        <ChevronDown size={19} />
      </button>
    </div>
  );
}
