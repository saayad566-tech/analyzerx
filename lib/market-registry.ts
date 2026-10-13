/**
 * Global market identity registry.
 *
 * Source: the GME (Global Market Engine) `countries.csv` dataset supplied for
 * evaluation — 199 countries with their exchanges and ISO 10383 MIC codes. The
 * table below is that dataset transcribed verbatim; it is not invented.
 *
 * WHY THIS EXISTS: earlier audits found AnalyzerX could not answer "which market
 * does this exchange or MIC belong to?" — it had ten hand-written market profiles
 * and no exchange identity. This registry supplies that, and it draws a hard line
 * between a country being KNOWN and a market being SUPPORTED, so the app can never
 * imply coverage it does not have.
 *
 * Deliberately NOT adopted from GME: its proxy-rotation and User-Agent-rotation
 * fetcher. Those exist to evade rate limits and access controls, which the
 * project's mandates forbid. Only the reference data and the identity model are used.
 */

export type CountryRecord = {
  /** ISO 3166-1 alpha-2. */
  iso2: string;
  name: string;
  region: string;
  /** Exchange names, as supplied by the dataset. */
  exchanges: string[];
  /** ISO 10383 MIC codes, where the dataset provides them. */
  mics: string[];
};

/** The markets AnalyzerX actually has adapters and profiles for. */
export const SUPPORTED_MARKET_IDS = ["IN", "US", "GB", "CA", "AU", "JP", "SG", "HK", "DE", "FR"] as const;
export type SupportedMarketId = (typeof SUPPORTED_MARKET_IDS)[number];

/** Headline index symbols per supported market (Yahoo Finance tickers). */
export const MARKET_INDEX_SYMBOLS: Record<string, string[]> = {
  US: ["^GSPC", "^DJI", "^IXIC", "^RUT"],
  GB: ["^FTSE"],
  DE: ["^GDAXI"],
  FR: ["^FCHI"],
  JP: ["^N225"],
  IN: ["^NSEI", "^BSESN"],
  HK: ["^HSI"],
  AU: ["^AXJO"],
  CA: ["^GSPTSE"],
  SG: ["^STI"],
};

/** 199 countries with exchange and MIC identity. */
export const COUNTRY_REGISTRY: CountryRecord[] = [
  { iso2: "AF", name: "Afghanistan", region: "Asia", exchanges: [], mics: [] },
  { iso2: "AL", name: "Albania", region: "Europe", exchanges: ["Tirana Stock Exchange"], mics: [] },
  { iso2: "DZ", name: "Algeria", region: "Africa", exchanges: ["Bourse d'Alger"], mics: [] },
  { iso2: "AD", name: "Andorra", region: "Europe", exchanges: [], mics: [] },
  { iso2: "AO", name: "Angola", region: "Africa", exchanges: ["BODIVA"], mics: [] },
  { iso2: "AG", name: "Antigua and Barbuda", region: "Americas", exchanges: ["Eastern Caribbean Securities Exchange"], mics: [] },
  { iso2: "AR", name: "Argentina", region: "Americas", exchanges: ["BYMA", "MAE"], mics: ["XBUE"] },
  { iso2: "AM", name: "Armenia", region: "Asia", exchanges: ["Armenia Securities Exchange"], mics: [] },
  { iso2: "AU", name: "Australia", region: "Oceania", exchanges: ["ASX", "Cboe Australia"], mics: ["XASX", "CHIA"] },
  { iso2: "AT", name: "Austria", region: "Europe", exchanges: ["Wiener Boerse"], mics: ["XWBO"] },
  { iso2: "AZ", name: "Azerbaijan", region: "Asia", exchanges: ["Baku Stock Exchange"], mics: [] },
  { iso2: "BS", name: "Bahamas", region: "Americas", exchanges: ["BISX"], mics: [] },
  { iso2: "BH", name: "Bahrain", region: "Asia", exchanges: ["Bahrain Bourse"], mics: ["XBAH"] },
  { iso2: "BD", name: "Bangladesh", region: "Asia", exchanges: ["Dhaka SE", "Chittagong SE"], mics: ["XDHA", "XCHG"] },
  { iso2: "BB", name: "Barbados", region: "Americas", exchanges: ["Barbados Stock Exchange"], mics: [] },
  { iso2: "BY", name: "Belarus", region: "Europe", exchanges: ["Belarusian Currency and Stock Exchange"], mics: [] },
  { iso2: "BE", name: "Belgium", region: "Europe", exchanges: ["Euronext Brussels"], mics: ["XBRU"] },
  { iso2: "BZ", name: "Belize", region: "Americas", exchanges: [], mics: [] },
  { iso2: "BJ", name: "Benin", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "BT", name: "Bhutan", region: "Asia", exchanges: ["Royal Securities Exchange of Bhutan"], mics: [] },
  { iso2: "BO", name: "Bolivia", region: "Americas", exchanges: ["Bolsa Boliviana de Valores"], mics: [] },
  { iso2: "BA", name: "Bosnia and Herzegovina", region: "Europe", exchanges: ["Sarajevo SE", "Banja Luka SE"], mics: ["XSSE", "XBLB"] },
  { iso2: "BW", name: "Botswana", region: "Africa", exchanges: ["Botswana Stock Exchange"], mics: ["XBOT"] },
  { iso2: "BR", name: "Brazil", region: "Americas", exchanges: ["B3"], mics: ["BVMF"] },
  { iso2: "BN", name: "Brunei", region: "Asia", exchanges: [], mics: [] },
  { iso2: "BG", name: "Bulgaria", region: "Europe", exchanges: ["Bulgarian Stock Exchange"], mics: ["XBUL"] },
  { iso2: "BF", name: "Burkina Faso", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "BI", name: "Burundi", region: "Africa", exchanges: [], mics: [] },
  { iso2: "CV", name: "Cabo Verde", region: "Africa", exchanges: ["Bolsa de Valores de Cabo Verde"], mics: [] },
  { iso2: "KH", name: "Cambodia", region: "Asia", exchanges: ["Cambodia Securities Exchange"], mics: [] },
  { iso2: "CM", name: "Cameroon", region: "Africa", exchanges: ["Douala Stock Exchange", "BVMAC"], mics: [] },
  { iso2: "CA", name: "Canada", region: "Americas", exchanges: ["TSX", "TSX Venture", "CSE"], mics: ["XTSE", "XTSX", "XCNQ"] },
  { iso2: "CF", name: "Central African Republic", region: "Africa", exchanges: ["BVMAC (regional)"], mics: [] },
  { iso2: "TD", name: "Chad", region: "Africa", exchanges: ["BVMAC (regional)"], mics: [] },
  { iso2: "CL", name: "Chile", region: "Americas", exchanges: ["Bolsa de Santiago"], mics: ["XSGO"] },
  { iso2: "CN", name: "China", region: "Asia", exchanges: ["Shanghai SE", "Shenzhen SE", "Beijing SE"], mics: ["XSHG", "XSHE", "XBSE"] },
  { iso2: "CO", name: "Colombia", region: "Americas", exchanges: ["Bolsa de Valores de Colombia"], mics: ["XBOG"] },
  { iso2: "KM", name: "Comoros", region: "Africa", exchanges: [], mics: [] },
  { iso2: "CD", name: "Congo (Democratic Republic)", region: "Africa", exchanges: [], mics: [] },
  { iso2: "CG", name: "Congo (Republic)", region: "Africa", exchanges: ["BVMAC (regional)"], mics: [] },
  { iso2: "CR", name: "Costa Rica", region: "Americas", exchanges: ["Bolsa Nacional de Valores"], mics: [] },
  { iso2: "CI", name: "Cote d'Ivoire", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "HR", name: "Croatia", region: "Europe", exchanges: ["Zagreb Stock Exchange"], mics: ["XZAG"] },
  { iso2: "CU", name: "Cuba", region: "Americas", exchanges: [], mics: [] },
  { iso2: "CY", name: "Cyprus", region: "Europe", exchanges: ["Cyprus Stock Exchange"], mics: ["XCYS"] },
  { iso2: "CZ", name: "Czechia", region: "Europe", exchanges: ["Prague Stock Exchange"], mics: ["XPRA"] },
  { iso2: "DK", name: "Denmark", region: "Europe", exchanges: ["Nasdaq Copenhagen"], mics: ["XCSE"] },
  { iso2: "DJ", name: "Djibouti", region: "Africa", exchanges: [], mics: [] },
  { iso2: "DM", name: "Dominica", region: "Americas", exchanges: ["Eastern Caribbean Securities Exchange"], mics: [] },
  { iso2: "DO", name: "Dominican Republic", region: "Americas", exchanges: ["Bolsa de Valores de la Rep. Dominicana"], mics: [] },
  { iso2: "EC", name: "Ecuador", region: "Americas", exchanges: ["Bolsa de Quito", "Bolsa de Guayaquil"], mics: [] },
  { iso2: "EG", name: "Egypt", region: "Africa", exchanges: ["Egyptian Exchange"], mics: ["XCAI"] },
  { iso2: "SV", name: "El Salvador", region: "Americas", exchanges: ["Bolsa de Valores de El Salvador"], mics: [] },
  { iso2: "GQ", name: "Equatorial Guinea", region: "Africa", exchanges: ["BVMAC (regional)"], mics: [] },
  { iso2: "ER", name: "Eritrea", region: "Africa", exchanges: [], mics: [] },
  { iso2: "EE", name: "Estonia", region: "Europe", exchanges: ["Nasdaq Tallinn"], mics: ["XTAL"] },
  { iso2: "SZ", name: "Eswatini", region: "Africa", exchanges: ["Eswatini Stock Exchange"], mics: [] },
  { iso2: "ET", name: "Ethiopia", region: "Africa", exchanges: ["Ethiopian Securities Exchange"], mics: [] },
  { iso2: "FJ", name: "Fiji", region: "Oceania", exchanges: ["South Pacific Stock Exchange"], mics: [] },
  { iso2: "FI", name: "Finland", region: "Europe", exchanges: ["Nasdaq Helsinki"], mics: ["XHEL"] },
  { iso2: "FR", name: "France", region: "Europe", exchanges: ["Euronext Paris"], mics: ["XPAR"] },
  { iso2: "GA", name: "Gabon", region: "Africa", exchanges: ["BVMAC (regional)"], mics: [] },
  { iso2: "GM", name: "Gambia", region: "Africa", exchanges: [], mics: [] },
  { iso2: "GE", name: "Georgia", region: "Asia", exchanges: ["Georgian Stock Exchange"], mics: [] },
  { iso2: "DE", name: "Germany", region: "Europe", exchanges: ["Frankfurt SE", "Xetra", "Stuttgart", "Munich", "Berlin", "Hamburg", "Duesseldorf"], mics: ["XFRA", "XETR", "XSTU", "XMUN", "XBER", "XHAM", "XDUS"] },
  { iso2: "GH", name: "Ghana", region: "Africa", exchanges: ["Ghana Stock Exchange"], mics: ["XGHA"] },
  { iso2: "GR", name: "Greece", region: "Europe", exchanges: ["Athens Exchange"], mics: ["XATH"] },
  { iso2: "GD", name: "Grenada", region: "Americas", exchanges: ["Eastern Caribbean Securities Exchange"], mics: [] },
  { iso2: "GT", name: "Guatemala", region: "Americas", exchanges: ["Bolsa Nacional de Valores Guatemala"], mics: [] },
  { iso2: "GN", name: "Guinea", region: "Africa", exchanges: [], mics: [] },
  { iso2: "GW", name: "Guinea-Bissau", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "GY", name: "Guyana", region: "Americas", exchanges: ["Guyana Association of Securities Companies"], mics: [] },
  { iso2: "HT", name: "Haiti", region: "Americas", exchanges: [], mics: [] },
  { iso2: "HN", name: "Honduras", region: "Americas", exchanges: ["Bolsa Centroamericana de Valores"], mics: [] },
  { iso2: "HK", name: "Hong Kong", region: "Asia", exchanges: ["HKEX"], mics: ["XHKG"] },
  { iso2: "HU", name: "Hungary", region: "Europe", exchanges: ["Budapest Stock Exchange"], mics: ["XBUD"] },
  { iso2: "IS", name: "Iceland", region: "Europe", exchanges: ["Nasdaq Iceland"], mics: ["XICE"] },
  { iso2: "IN", name: "India", region: "Asia", exchanges: ["NSE", "BSE", "MCX"], mics: ["XNSE", "XBOM", "XMCX"] },
  { iso2: "ID", name: "Indonesia", region: "Asia", exchanges: ["Indonesia Stock Exchange"], mics: ["XIDX"] },
  { iso2: "IR", name: "Iran", region: "Asia", exchanges: ["Tehran Stock Exchange", "Iran Fara Bourse"], mics: [] },
  { iso2: "IQ", name: "Iraq", region: "Asia", exchanges: ["Iraq Stock Exchange"], mics: [] },
  { iso2: "IE", name: "Ireland", region: "Europe", exchanges: ["Euronext Dublin"], mics: ["XDUB"] },
  { iso2: "IL", name: "Israel", region: "Asia", exchanges: ["Tel Aviv Stock Exchange"], mics: ["XTAE"] },
  { iso2: "IT", name: "Italy", region: "Europe", exchanges: ["Borsa Italiana"], mics: ["XMIL"] },
  { iso2: "JM", name: "Jamaica", region: "Americas", exchanges: ["Jamaica Stock Exchange"], mics: ["XJAM"] },
  { iso2: "JP", name: "Japan", region: "Asia", exchanges: ["JPX Tokyo", "Nagoya", "Fukuoka", "Sapporo"], mics: ["XTKS", "XNGO", "XFKA", "XSAP"] },
  { iso2: "JO", name: "Jordan", region: "Asia", exchanges: ["Amman Stock Exchange"], mics: ["XAMM"] },
  { iso2: "KZ", name: "Kazakhstan", region: "Asia", exchanges: ["KASE", "AIX"], mics: ["XKAZ"] },
  { iso2: "KE", name: "Kenya", region: "Africa", exchanges: ["Nairobi Securities Exchange"], mics: ["XNAI"] },
  { iso2: "KI", name: "Kiribati", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "XK", name: "Kosovo", region: "Europe", exchanges: [], mics: [] },
  { iso2: "KW", name: "Kuwait", region: "Asia", exchanges: ["Boursa Kuwait"], mics: ["XKUW"] },
  { iso2: "KG", name: "Kyrgyzstan", region: "Asia", exchanges: ["Kyrgyz Stock Exchange"], mics: [] },
  { iso2: "LA", name: "Laos", region: "Asia", exchanges: ["Lao Securities Exchange"], mics: [] },
  { iso2: "LV", name: "Latvia", region: "Europe", exchanges: ["Nasdaq Riga"], mics: ["XRIS"] },
  { iso2: "LB", name: "Lebanon", region: "Asia", exchanges: ["Beirut Stock Exchange"], mics: ["XBEY"] },
  { iso2: "LS", name: "Lesotho", region: "Africa", exchanges: [], mics: [] },
  { iso2: "LR", name: "Liberia", region: "Africa", exchanges: [], mics: [] },
  { iso2: "LY", name: "Libya", region: "Africa", exchanges: ["Libyan Stock Market"], mics: [] },
  { iso2: "LI", name: "Liechtenstein", region: "Europe", exchanges: [], mics: [] },
  { iso2: "LT", name: "Lithuania", region: "Europe", exchanges: ["Nasdaq Vilnius"], mics: ["XLIT"] },
  { iso2: "LU", name: "Luxembourg", region: "Europe", exchanges: ["Luxembourg Stock Exchange"], mics: ["XLUX"] },
  { iso2: "MO", name: "Macao", region: "Asia", exchanges: [], mics: [] },
  { iso2: "MG", name: "Madagascar", region: "Africa", exchanges: [], mics: [] },
  { iso2: "MW", name: "Malawi", region: "Africa", exchanges: ["Malawi Stock Exchange"], mics: [] },
  { iso2: "MY", name: "Malaysia", region: "Asia", exchanges: ["Bursa Malaysia"], mics: ["XKLS"] },
  { iso2: "MV", name: "Maldives", region: "Asia", exchanges: ["Maldives Stock Exchange"], mics: [] },
  { iso2: "ML", name: "Mali", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "MT", name: "Malta", region: "Europe", exchanges: ["Malta Stock Exchange"], mics: ["XMAL"] },
  { iso2: "MH", name: "Marshall Islands", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "MR", name: "Mauritania", region: "Africa", exchanges: [], mics: [] },
  { iso2: "MU", name: "Mauritius", region: "Africa", exchanges: ["Stock Exchange of Mauritius"], mics: ["XMAU"] },
  { iso2: "MX", name: "Mexico", region: "Americas", exchanges: ["BMV", "BIVA"], mics: ["XMEX", "BIVA"] },
  { iso2: "FM", name: "Micronesia", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "MD", name: "Moldova", region: "Europe", exchanges: ["Moldova Stock Exchange"], mics: [] },
  { iso2: "MC", name: "Monaco", region: "Europe", exchanges: [], mics: [] },
  { iso2: "MN", name: "Mongolia", region: "Asia", exchanges: ["Mongolian Stock Exchange"], mics: [] },
  { iso2: "ME", name: "Montenegro", region: "Europe", exchanges: ["Montenegro Stock Exchange"], mics: ["XMNX"] },
  { iso2: "MA", name: "Morocco", region: "Africa", exchanges: ["Casablanca Stock Exchange"], mics: ["XCAS"] },
  { iso2: "MZ", name: "Mozambique", region: "Africa", exchanges: ["Bolsa de Valores de Mocambique"], mics: [] },
  { iso2: "MM", name: "Myanmar", region: "Asia", exchanges: ["Yangon Stock Exchange"], mics: [] },
  { iso2: "NA", name: "Namibia", region: "Africa", exchanges: ["Namibian Stock Exchange"], mics: ["XNAM"] },
  { iso2: "NR", name: "Nauru", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "NP", name: "Nepal", region: "Asia", exchanges: ["Nepal Stock Exchange"], mics: [] },
  { iso2: "NL", name: "Netherlands", region: "Europe", exchanges: ["Euronext Amsterdam"], mics: ["XAMS"] },
  { iso2: "NZ", name: "New Zealand", region: "Oceania", exchanges: ["NZX"], mics: ["XNZE"] },
  { iso2: "NI", name: "Nicaragua", region: "Americas", exchanges: ["Bolsa de Valores de Nicaragua"], mics: [] },
  { iso2: "NE", name: "Niger", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "NG", name: "Nigeria", region: "Africa", exchanges: ["Nigerian Exchange"], mics: ["XNSA"] },
  { iso2: "KP", name: "North Korea", region: "Asia", exchanges: [], mics: [] },
  { iso2: "MK", name: "North Macedonia", region: "Europe", exchanges: ["Macedonian Stock Exchange"], mics: ["XMAE"] },
  { iso2: "NO", name: "Norway", region: "Europe", exchanges: ["Oslo Bors"], mics: ["XOSL"] },
  { iso2: "OM", name: "Oman", region: "Asia", exchanges: ["Muscat Stock Exchange"], mics: ["XMSM"] },
  { iso2: "PK", name: "Pakistan", region: "Asia", exchanges: ["Pakistan Stock Exchange"], mics: ["XKAR"] },
  { iso2: "PW", name: "Palau", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "PS", name: "Palestine", region: "Asia", exchanges: ["Palestine Exchange"], mics: ["XPAL"] },
  { iso2: "PA", name: "Panama", region: "Americas", exchanges: ["Latinex"], mics: [] },
  { iso2: "PG", name: "Papua New Guinea", region: "Oceania", exchanges: ["PNGX"], mics: [] },
  { iso2: "PY", name: "Paraguay", region: "Americas", exchanges: ["Bolsa de Valores y Productos de Asuncion"], mics: [] },
  { iso2: "PE", name: "Peru", region: "Americas", exchanges: ["Bolsa de Valores de Lima"], mics: ["XLIM"] },
  { iso2: "PH", name: "Philippines", region: "Asia", exchanges: ["Philippine Stock Exchange"], mics: ["XPHS"] },
  { iso2: "PL", name: "Poland", region: "Europe", exchanges: ["Warsaw Stock Exchange"], mics: ["XWAR"] },
  { iso2: "PT", name: "Portugal", region: "Europe", exchanges: ["Euronext Lisbon"], mics: ["XLIS"] },
  { iso2: "QA", name: "Qatar", region: "Asia", exchanges: ["Qatar Stock Exchange"], mics: ["XDSM"] },
  { iso2: "RO", name: "Romania", region: "Europe", exchanges: ["Bucharest Stock Exchange"], mics: ["XBSE"] },
  { iso2: "RU", name: "Russia", region: "Europe", exchanges: ["Moscow Exchange", "SPB Exchange"], mics: ["XMOS"] },
  { iso2: "RW", name: "Rwanda", region: "Africa", exchanges: ["Rwanda Stock Exchange"], mics: [] },
  { iso2: "KN", name: "Saint Kitts and Nevis", region: "Americas", exchanges: ["Eastern Caribbean Securities Exchange"], mics: [] },
  { iso2: "LC", name: "Saint Lucia", region: "Americas", exchanges: ["Eastern Caribbean Securities Exchange"], mics: [] },
  { iso2: "VC", name: "Saint Vincent and the Grenadines", region: "Americas", exchanges: ["Eastern Caribbean Securities Exchange"], mics: [] },
  { iso2: "WS", name: "Samoa", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "SM", name: "San Marino", region: "Europe", exchanges: [], mics: [] },
  { iso2: "ST", name: "Sao Tome and Principe", region: "Africa", exchanges: [], mics: [] },
  { iso2: "SA", name: "Saudi Arabia", region: "Asia", exchanges: ["Saudi Exchange (Tadawul)"], mics: ["XSAU"] },
  { iso2: "SN", name: "Senegal", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "RS", name: "Serbia", region: "Europe", exchanges: ["Belgrade Stock Exchange"], mics: ["XBEL"] },
  { iso2: "SC", name: "Seychelles", region: "Africa", exchanges: ["MERJ Exchange"], mics: [] },
  { iso2: "SL", name: "Sierra Leone", region: "Africa", exchanges: ["Sierra Leone Stock Exchange"], mics: [] },
  { iso2: "SG", name: "Singapore", region: "Asia", exchanges: ["SGX"], mics: ["XSES"] },
  { iso2: "SK", name: "Slovakia", region: "Europe", exchanges: ["Bratislava Stock Exchange"], mics: ["XBRA"] },
  { iso2: "SI", name: "Slovenia", region: "Europe", exchanges: ["Ljubljana Stock Exchange"], mics: ["XLJU"] },
  { iso2: "SB", name: "Solomon Islands", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "SO", name: "Somalia", region: "Africa", exchanges: [], mics: [] },
  { iso2: "ZA", name: "South Africa", region: "Africa", exchanges: ["JSE"], mics: ["XJSE"] },
  { iso2: "KR", name: "South Korea", region: "Asia", exchanges: ["Korea Exchange"], mics: ["XKRX"] },
  { iso2: "SS", name: "South Sudan", region: "Africa", exchanges: [], mics: [] },
  { iso2: "ES", name: "Spain", region: "Europe", exchanges: ["BME"], mics: ["XMAD"] },
  { iso2: "LK", name: "Sri Lanka", region: "Asia", exchanges: ["Colombo Stock Exchange"], mics: ["XCOL"] },
  { iso2: "SD", name: "Sudan", region: "Africa", exchanges: ["Khartoum Stock Exchange"], mics: [] },
  { iso2: "SR", name: "Suriname", region: "Americas", exchanges: ["Suriname Stock Exchange"], mics: [] },
  { iso2: "SE", name: "Sweden", region: "Europe", exchanges: ["Nasdaq Stockholm"], mics: ["XSTO"] },
  { iso2: "CH", name: "Switzerland", region: "Europe", exchanges: ["SIX Swiss Exchange"], mics: ["XSWX"] },
  { iso2: "SY", name: "Syria", region: "Asia", exchanges: ["Damascus Securities Exchange"], mics: [] },
  { iso2: "TW", name: "Taiwan", region: "Asia", exchanges: ["TWSE", "TPEx"], mics: ["XTAI", "ROCO"] },
  { iso2: "TJ", name: "Tajikistan", region: "Asia", exchanges: ["Central Asian Stock Exchange"], mics: [] },
  { iso2: "TZ", name: "Tanzania", region: "Africa", exchanges: ["Dar es Salaam Stock Exchange"], mics: ["XDAR"] },
  { iso2: "TH", name: "Thailand", region: "Asia", exchanges: ["Stock Exchange of Thailand"], mics: ["XBKK"] },
  { iso2: "TL", name: "Timor-Leste", region: "Asia", exchanges: [], mics: [] },
  { iso2: "TG", name: "Togo", region: "Africa", exchanges: ["BRVM (regional)"], mics: ["XBRV"] },
  { iso2: "TO", name: "Tonga", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "TT", name: "Trinidad and Tobago", region: "Americas", exchanges: ["Trinidad and Tobago Stock Exchange"], mics: ["XTRN"] },
  { iso2: "TN", name: "Tunisia", region: "Africa", exchanges: ["Bourse de Tunis"], mics: ["XTUN"] },
  { iso2: "TR", name: "Turkey", region: "Asia", exchanges: ["Borsa Istanbul"], mics: ["XIST"] },
  { iso2: "TM", name: "Turkmenistan", region: "Asia", exchanges: [], mics: [] },
  { iso2: "TV", name: "Tuvalu", region: "Oceania", exchanges: [], mics: [] },
  { iso2: "UG", name: "Uganda", region: "Africa", exchanges: ["Uganda Securities Exchange"], mics: ["XUGA"] },
  { iso2: "UA", name: "Ukraine", region: "Europe", exchanges: ["Ukrainian Exchange", "PFTS"], mics: [] },
  { iso2: "AE", name: "United Arab Emirates", region: "Asia", exchanges: ["ADX", "DFM", "Nasdaq Dubai"], mics: ["XADS", "XDFM", "DIFX"] },
  { iso2: "GB", name: "United Kingdom", region: "Europe", exchanges: ["London Stock Exchange", "AIM"], mics: ["XLON", "AIMX"] },
  { iso2: "US", name: "United States", region: "Americas", exchanges: ["NYSE", "Nasdaq", "Cboe", "NYSE American", "IEX"], mics: ["XNYS", "XNAS", "BATS", "XASE", "IEXG"] },
  { iso2: "UY", name: "Uruguay", region: "Americas", exchanges: ["Bolsa de Valores de Montevideo"], mics: [] },
  { iso2: "UZ", name: "Uzbekistan", region: "Asia", exchanges: ["Tashkent Stock Exchange"], mics: [] },
  { iso2: "VU", name: "Vanuatu", region: "Oceania", exchanges: ["Vanuatu Financial Services (VFX)"], mics: [] },
  { iso2: "VA", name: "Vatican City", region: "Europe", exchanges: [], mics: [] },
  { iso2: "VE", name: "Venezuela", region: "Americas", exchanges: ["Bolsa de Valores de Caracas"], mics: [] },
  { iso2: "VN", name: "Vietnam", region: "Asia", exchanges: ["HOSE", "HNX"], mics: ["XSTC", "HSTC"] },
  { iso2: "YE", name: "Yemen", region: "Asia", exchanges: [], mics: [] },
  { iso2: "ZM", name: "Zambia", region: "Africa", exchanges: ["Lusaka Securities Exchange"], mics: ["XLUS"] },
  { iso2: "ZW", name: "Zimbabwe", region: "Africa", exchanges: ["Zimbabwe Stock Exchange"], mics: ["XZIM"] },
];

const BY_ISO2 = new Map(COUNTRY_REGISTRY.map((country) => [country.iso2, country]));
const BY_MIC = new Map<string, string>();
for (const country of COUNTRY_REGISTRY) {
  for (const mic of country.mics) {
    const key = mic.toUpperCase();
    if (!BY_MIC.has(key)) BY_MIC.set(key, country.iso2);
  }
}

/** Look up a country record by ISO2, case-insensitively. */
export function countryFor(iso2: string | null | undefined): CountryRecord | null {
  const key = (iso2 ?? "").trim().toUpperCase();
  return key ? BY_ISO2.get(key) ?? null : null;
}

/** True only for the ten markets with real adapters. A known country is not enough. */
export function isSupportedMarket(iso2: string | null | undefined): boolean {
  return (SUPPORTED_MARKET_IDS as readonly string[]).includes((iso2 ?? "").trim().toUpperCase());
}

/** Resolve an ISO 10383 MIC code to its country's ISO2, or null when unknown. */
export function countryForMic(mic: string | null | undefined): string | null {
  const key = (mic ?? "").trim().toUpperCase();
  return key ? BY_MIC.get(key) ?? null : null;
}

/** MIC codes recorded for a country. */
export function micsForCountry(iso2: string | null | undefined): string[] {
  return countryFor(iso2)?.mics ?? [];
}

/** Exchange names recorded for a country. */
export function exchangesForCountry(iso2: string | null | undefined): string[] {
  return countryFor(iso2)?.exchanges ?? [];
}

export type MarketCoverage = {
  iso2: string;
  /** Present in the registry at all. */
  known: boolean;
  /** Has adapters in AnalyzerX. */
  supported: boolean;
  name: string | null;
  region: string | null;
  exchanges: string[];
  mics: string[];
  status: "Operational" | "Not Implemented";
  reason: string;
};

/**
 * Describe a market's coverage honestly. A country that exists in the registry but
 * has no adapter is reported as `Not Implemented` with the reason — never as
 * supported merely because its name is known.
 */
export function describeMarketCoverage(iso2: string | null | undefined): MarketCoverage {
  const key = (iso2 ?? "").trim().toUpperCase();
  const country = countryFor(key);
  const supported = isSupportedMarket(key);
  return {
    iso2: key,
    known: country !== null,
    supported,
    name: country?.name ?? null,
    region: country?.region ?? null,
    exchanges: country?.exchanges ?? [],
    mics: country?.mics ?? [],
    status: supported ? "Operational" : "Not Implemented",
    reason: supported
      ? `AnalyzerX has a market profile and adapters for ${country?.name ?? key}.`
      : country
        ? `${country.name} is a known market, but AnalyzerX has no data adapter for it yet, so it is not offered as supported.`
        : "This market identifier is not in the reference registry.",
  };
}

/** Headline index symbols for a supported market, or an empty list. */
export function indexSymbolsForMarket(iso2: string | null | undefined): string[] {
  const key = (iso2 ?? "").trim().toUpperCase();
  return isSupportedMarket(key) ? MARKET_INDEX_SYMBOLS[key] ?? [] : [];
}

/**
 * Search countries by ISO2 or name, ranked so an exact code wins.
 *
 * Ranking matters: a plain substring match returned Australia for the query "US"
 * (it contains "us") ahead of the United States. Order is: exact ISO2, ISO2 prefix,
 * name prefix, then name substring.
 */
export function searchCountries(query: string, limit = 8): CountryRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const rank = (country: CountryRecord): number => {
    const iso2 = country.iso2.toLowerCase();
    const name = country.name.toLowerCase();
    if (iso2 === needle) return 0;
    if (iso2.startsWith(needle)) return 1;
    if (name.startsWith(needle)) return 2;
    if (name.includes(needle)) return 3;
    return -1;
  };
  return COUNTRY_REGISTRY
    .map((country) => ({ country, score: rank(country) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.country);
}
