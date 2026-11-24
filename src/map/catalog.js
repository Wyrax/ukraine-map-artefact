// Catalog of Ukraine's 27 first-level regions.
// Shared by the Node tools (map extraction, CSV import) and the browser library (region matching).
//
// id      ISO 3166-2:UA code (the id used everywhere: SVG, data.json, regions.json)
// code    2-digit KOATUU / KATOTTG prefix (UA05… in KATOTTG) — differs from ISO for 5 regions
// kind    oblast | city | ar (Autonomous Republic)
// short   label text on the map; full = official name
// city    administrative centre [lat, lon] (used to georeference the map)
// abbr    short name for the hex tile map
// hex     [col, row] on the hex tile map (odd rows shifted right by half a hex)
// alt     extra spellings accepted when importing data (lower-case, apostrophes removed)

export const REGIONS = [
  { id: 'UA-07', code: '07', kind: 'oblast', short: { uk: 'Волинська', en: 'Volyn' }, full: { uk: 'Волинська область', en: 'Volyn Oblast' }, city: [50.747, 25.325], abbr: { uk: 'Волинь', en: 'Volyn' }, hex: [1, 0], alt: ['волинь', 'volynska', 'volyn region', 'волынская'] },
  { id: 'UA-56', code: '56', kind: 'oblast', short: { uk: 'Рівненська', en: 'Rivne' }, full: { uk: 'Рівненська область', en: 'Rivne Oblast' }, city: [50.619, 26.251], abbr: { uk: 'Рівне', en: 'Rivne' }, hex: [2, 0], alt: ['рівненщина', 'rivnenska', 'rovno', 'ровенская'] },
  { id: 'UA-18', code: '18', kind: 'oblast', short: { uk: 'Житомирська', en: 'Zhytomyr' }, full: { uk: 'Житомирська область', en: 'Zhytomyr Oblast' }, city: [50.254, 28.658], abbr: { uk: 'Житомир', en: 'Zhytomyr' }, hex: [3, 0], alt: ['житомирщина', 'zhytomyrska', 'zhitomir', 'житомирская'] },
  { id: 'UA-32', code: '32', kind: 'oblast', short: { uk: 'Київська', en: 'Kyiv Oblast' }, full: { uk: 'Київська область', en: 'Kyiv Oblast' }, city: [50.45, 30.523], abbr: { uk: 'Київщина', en: 'Kyiv Obl.' }, hex: [4, 0], alt: ['київщина', 'kyivska', 'kiev oblast', 'kyiv region', 'киевская'] },
  { id: 'UA-74', code: '74', kind: 'oblast', short: { uk: 'Чернігівська', en: 'Chernihiv' }, full: { uk: 'Чернігівська область', en: 'Chernihiv Oblast' }, city: [51.498, 31.289], abbr: { uk: 'Чернігів', en: 'Chernihiv' }, hex: [5, 0], alt: ['чернігівщина', 'chernihivska', 'chernigov', 'черниговская'] },
  { id: 'UA-59', code: '59', kind: 'oblast', short: { uk: 'Сумська', en: 'Sumy' }, full: { uk: 'Сумська область', en: 'Sumy Oblast' }, city: [50.908, 34.798], abbr: { uk: 'Суми', en: 'Sumy' }, hex: [6, 0], alt: ['сумщина', 'sumska', 'сумская'] },

  { id: 'UA-46', code: '46', kind: 'oblast', short: { uk: 'Львівська', en: 'Lviv' }, full: { uk: 'Львівська область', en: 'Lviv Oblast' }, city: [49.839, 24.029], abbr: { uk: 'Львів', en: 'Lviv' }, hex: [0, 1], alt: ['львівщина', 'lvivska', 'lvov', 'львовская'] },
  { id: 'UA-61', code: '61', kind: 'oblast', short: { uk: 'Тернопільська', en: 'Ternopil' }, full: { uk: 'Тернопільська область', en: 'Ternopil Oblast' }, city: [49.553, 25.594], abbr: { uk: 'Тернопіль', en: 'Ternopil' }, hex: [1, 1], alt: ['тернопільщина', 'ternopilska', 'тернопольская'] },
  { id: 'UA-68', code: '68', kind: 'oblast', short: { uk: 'Хмельницька', en: 'Khmelnytskyi' }, full: { uk: 'Хмельницька область', en: 'Khmelnytskyi Oblast' }, city: [49.422, 26.987], abbr: { uk: 'Хмельн.', en: 'Khmeln.' }, hex: [2, 1], alt: ['хмельниччина', 'khmelnytska', 'khmelnitsky', 'khmelnytskyy', 'хмельницкая'] },
  { id: 'UA-30', code: '80', kind: 'city', short: { uk: 'Київ', en: 'Kyiv' }, full: { uk: 'м. Київ', en: 'Kyiv City' }, city: [50.45, 30.523], abbr: { uk: 'Київ', en: 'Kyiv' }, hex: [3, 1], alt: ['київ', 'місто київ', 'м київ', 'kyiv', 'kiev', 'city of kyiv', 'kyiv city', 'киев', 'г киев'] },
  { id: 'UA-71', code: '71', kind: 'oblast', short: { uk: 'Черкаська', en: 'Cherkasy' }, full: { uk: 'Черкаська область', en: 'Cherkasy Oblast' }, city: [49.444, 32.06], abbr: { uk: 'Черкаси', en: 'Cherkasy' }, hex: [4, 1], alt: ['черкащина', 'cherkaska', 'cherkassy', 'черкасская'] },
  { id: 'UA-53', code: '53', kind: 'oblast', short: { uk: 'Полтавська', en: 'Poltava' }, full: { uk: 'Полтавська область', en: 'Poltava Oblast' }, city: [49.589, 34.551], abbr: { uk: 'Полтава', en: 'Poltava' }, hex: [5, 1], alt: ['полтавщина', 'poltavska', 'полтавская'] },
  { id: 'UA-63', code: '63', kind: 'oblast', short: { uk: 'Харківська', en: 'Kharkiv' }, full: { uk: 'Харківська область', en: 'Kharkiv Oblast' }, city: [49.994, 36.23], abbr: { uk: 'Харків', en: 'Kharkiv' }, hex: [6, 1], alt: ['харківщина', 'kharkivska', 'kharkov', 'харьковская'] },

  { id: 'UA-21', code: '21', kind: 'oblast', short: { uk: 'Закарпатська', en: 'Zakarpattia' }, full: { uk: 'Закарпатська область', en: 'Zakarpattia Oblast' }, city: [48.621, 22.288], abbr: { uk: 'Закарп.', en: 'Zakarp.' }, hex: [0, 2], alt: ['закарпаття', 'zakarpatska', 'transcarpathia', 'transcarpathian', 'закарпатская'] },
  { id: 'UA-26', code: '26', kind: 'oblast', short: { uk: 'Івано-Франківська', en: 'Ivano-Frankivsk' }, full: { uk: 'Івано-Франківська область', en: 'Ivano-Frankivsk Oblast' }, city: [48.922, 24.711], abbr: { uk: 'Ів.-Фр.', en: 'Iv.-Fr.' }, hex: [1, 2], alt: ['прикарпаття', 'івано франківська', 'ivano frankivska', 'ivano frankivsk', 'ивано франковская'] },
  { id: 'UA-77', code: '73', kind: 'oblast', short: { uk: 'Чернівецька', en: 'Chernivtsi' }, full: { uk: 'Чернівецька область', en: 'Chernivtsi Oblast' }, city: [48.292, 25.936], abbr: { uk: 'Чернівці', en: 'Chernivtsi' }, hex: [2, 2], alt: ['буковина', 'chernivetska', 'chernovtsy', 'черновицкая'] },
  { id: 'UA-05', code: '05', kind: 'oblast', short: { uk: 'Вінницька', en: 'Vinnytsia' }, full: { uk: 'Вінницька область', en: 'Vinnytsia Oblast' }, city: [49.233, 28.468], abbr: { uk: 'Вінниця', en: 'Vinnytsia' }, hex: [3, 2], alt: ['вінниччина', 'vinnytska', 'vinnitsa', 'винницкая'] },
  { id: 'UA-35', code: '35', kind: 'oblast', short: { uk: 'Кіровоградська', en: 'Kirovohrad' }, full: { uk: 'Кіровоградська область', en: 'Kirovohrad Oblast' }, city: [48.508, 32.262], abbr: { uk: 'Кіровогр.', en: 'Kirovohr.' }, hex: [4, 2], alt: ['кіровоградщина', 'kirovohradska', 'kropyvnytskyi', 'кропивницька', 'kirovograd', 'кировоградская'] },
  { id: 'UA-12', code: '12', kind: 'oblast', short: { uk: 'Дніпропетровська', en: 'Dnipropetrovsk' }, full: { uk: 'Дніпропетровська область', en: 'Dnipropetrovsk Oblast' }, city: [48.464, 35.046], abbr: { uk: 'Дніпро', en: 'Dnipro' }, hex: [5, 2], alt: ['дніпропетровщина', 'дніпровська', 'січеславська', 'dnipropetrovska', 'dnipro', 'днепропетровская'] },
  { id: 'UA-14', code: '14', kind: 'oblast', short: { uk: 'Донецька', en: 'Donetsk' }, full: { uk: 'Донецька область', en: 'Donetsk Oblast' }, city: [48.016, 37.803], abbr: { uk: 'Донецьк', en: 'Donetsk' }, hex: [6, 2], alt: ['донеччина', 'donetska', 'донецкая'] },
  { id: 'UA-09', code: '44', kind: 'oblast', short: { uk: 'Луганська', en: 'Luhansk' }, full: { uk: 'Луганська область', en: 'Luhansk Oblast' }, city: [48.574, 39.308], abbr: { uk: 'Луганськ', en: 'Luhansk' }, hex: [7, 2], alt: ['луганщина', 'luhanska', 'lugansk', 'луганская'] },

  { id: 'UA-51', code: '51', kind: 'oblast', short: { uk: 'Одеська', en: 'Odesa' }, full: { uk: 'Одеська область', en: 'Odesa Oblast' }, city: [46.482, 30.723], abbr: { uk: 'Одеса', en: 'Odesa' }, hex: [3, 3], alt: ['одещина', 'odeska', 'odessa', 'одесская'] },
  { id: 'UA-48', code: '48', kind: 'oblast', short: { uk: 'Миколаївська', en: 'Mykolaiv' }, full: { uk: 'Миколаївська область', en: 'Mykolaiv Oblast' }, city: [46.975, 31.995], abbr: { uk: 'Миколаїв', en: 'Mykolaiv' }, hex: [4, 3], alt: ['миколаївщина', 'mykolaivska', 'nikolaev', 'николаевская'] },
  { id: 'UA-23', code: '23', kind: 'oblast', short: { uk: 'Запорізька', en: 'Zaporizhzhia' }, full: { uk: 'Запорізька область', en: 'Zaporizhzhia Oblast' }, city: [47.838, 35.139], abbr: { uk: 'Запоріжжя', en: 'Zaporizh.' }, hex: [5, 3], alt: ['запоріжжя', 'zaporizka', 'zaporizhia', 'zaporozhye', 'запорожская'] },

  { id: 'UA-65', code: '65', kind: 'oblast', short: { uk: 'Херсонська', en: 'Kherson' }, full: { uk: 'Херсонська область', en: 'Kherson Oblast' }, city: [46.636, 32.617], abbr: { uk: 'Херсон', en: 'Kherson' }, hex: [5, 4], alt: ['херсонщина', 'khersonska', 'херсонская'] },

  { id: 'UA-40', code: '85', kind: 'city', short: { uk: 'Севастополь', en: 'Sevastopol' }, full: { uk: 'м. Севастополь', en: 'Sevastopol City' }, city: [44.616, 33.525], abbr: { uk: 'Севастоп.', en: 'Sevastop.' }, hex: [4, 5], alt: ['севастополь', 'місто севастополь', 'м севастополь', 'sevastopol', 'city of sevastopol', 'г севастополь'] },
  { id: 'UA-43', code: '01', kind: 'ar', short: { uk: 'АР Крим', en: 'Crimea' }, full: { uk: 'Автономна Республіка Крим', en: 'Autonomous Republic of Crimea' }, city: [44.952, 34.102], abbr: { uk: 'Крим', en: 'Crimea' }, hex: [5, 5], alt: ['крим', 'ар крим', 'crimea', 'ar crimea', 'республіка крим', 'крым', 'республика крым'] },
];

export const REGION_IDS = REGIONS.map((r) => r.id);
export const BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

const OBLAST_WORDS = /\b(область|обл|oblast|obl|region|регіон|oblast’)\b/g;

/** Lower-cases, drops apostrophes/punctuation, collapses spaces. */
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[’'`ʼ"«»]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[.,;:()\/\\_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let INDEX = null;
function buildIndex() {
  INDEX = new Map();
  const add = (key, id) => {
    const k = normalizeName(key);
    if (k && !INDEX.has(k)) INDEX.set(k, id);
  };
  for (const r of REGIONS) {
    add(r.id, r.id);
    add(r.id.replace('-', ''), r.id);
    add(r.full.uk, r.id);
    add(r.full.en, r.id);
    for (const a of r.alt) add(a, r.id);
  }
  for (const r of REGIONS) {
    if (r.kind === 'oblast') {
      add(r.short.uk, r.id);
      add(r.short.uk + ' обл', r.id);
      add(r.short.en.replace(/ Oblast$/, '') + ' oblast', r.id);
      add(r.short.en.replace(/ Oblast$/, '') + ' region', r.id);
    }
  }
  // Bare English oblast names ("Vinnytsia") map to the oblast, except Kyiv/Sevastopol which are cities.
  for (const r of REGIONS) if (r.kind === 'oblast') add(r.short.en, r.id);
}

/**
 * Resolves a region given as ISO id, KOATUU/KATOTTG code or a name (uk/en, many spellings).
 * Returns the ISO id or null.
 */
export function matchRegion(input) {
  if (input == null) return null;
  if (!INDEX) buildIndex();
  const raw = String(input).trim();
  if (BY_ID[raw.toUpperCase()]) return raw.toUpperCase();
  // KATOTTG (UA05000000000010236) or KOATUU (0500000000) codes
  const code = raw.match(/^UA(\d{2})\d{15}$/i)?.[1] ?? raw.match(/^(\d{2})\d{8}$/)?.[1] ?? raw.match(/^(\d{2})$/)?.[1];
  if (code) {
    const r = REGIONS.find((x) => x.code === code);
    if (r) return r.id;
  }
  const n = normalizeName(raw);
  if (INDEX.has(n)) return INDEX.get(n);
  const hasOblastWord = OBLAST_WORDS.test(n);
  OBLAST_WORDS.lastIndex = 0;
  const stripped = n.replace(OBLAST_WORDS, ' ').replace(/\s+/g, ' ').trim();
  OBLAST_WORDS.lastIndex = 0;
  if (hasOblastWord) {
    const r = REGIONS.find((x) => x.kind === 'oblast' && [x.short.uk, x.short.en, ...x.alt].some((a) => normalizeName(a) === stripped));
    if (r) return r.id;
  }
  if (INDEX.has(stripped)) return INDEX.get(stripped);
  return null;
}
