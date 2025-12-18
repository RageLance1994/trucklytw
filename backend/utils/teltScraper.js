// scripts/scrapeTeltonikaIoMap.js
// node scripts/scrapeTeltonikaIoMap.js
// Requires: npm i axios cheerio

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

const pages = [
  { url: 'https://wiki.teltonika-gps.com/view/FMC920_Teltonika_Data_Sending_Parameters_ID', model: 'FMC920' },
  { url: 'https://wiki.teltonika-gps.com/view/FMC150_Teltonika_Data_Sending_Parameters_ID', model: 'FMC150' },
  { url: 'https://wiki.teltonika-gps.com/view/FMC650_Teltonika_Data_Sending_Parameters_ID', model: 'FMC650' },
  { url: 'https://wiki.teltonika-gps.com/view/FMB641_Teltonika_Data_Sending_Parameters_ID', model: 'FMB641' },
];

function toCamelCase(name) {
  // pulisce il nome e lo converte in camelCase
  const cleaned = name
    .replace(/\(.*?\)/g, '')          // rimuovi parentesi e contenuto
    .replace(/[^a-zA-Z0-9]+/g, ' ')   // non-alphanumerici -> spazi
    .trim()
    .toLowerCase();

  if (!cleaned) return name.replace(/\s+/g, '_').toLowerCase();

  const parts = cleaned.split(/\s+/);
  return parts.map((p, i) => i === 0 ? p : p[0].toUpperCase() + p.slice(1)).join('');
}

(async () => {
  const mapAll = {};

  for (const page of pages) {
    console.log(`\n[START] Fetching ${page.model} from ${page.url}`);
    mapAll[page.model] = {};
    try {
      const resp = await axios.get(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Node.js) teltonika-scraper/1.0',
          'Accept': 'text/html'
        },
        timeout: 15000
      });
      const $ = cheerio.load(resp.data);

      // Cerca tutte le tabelle (wikitable o generiche) e scansiona le righe
      const tables = $('table.wikitable, table');
      let found = 0;
      tables.each((ti, table) => {
        $(table).find('tr').each((ri, tr) => {
          const tds = $(tr).find('td');
          if (tds.length >= 2) {
            const idText = $(tds[0]).text().trim();
            const nameText = $(tds[1]).text().trim();
            const idMatch = idText.match(/(\d+)/); // prende il primo numero
            if (idMatch) {
              const id = idMatch[1];
              const key = toCamelCase(nameText) || nameText;
              // evita sovrascritture silenziose: se esiste, mantieni il primo o aggiungi suffix
              if (mapAll[page.model][id] && mapAll[page.model][id] !== key) {
                // se collisione, annota la seconda variante
                mapAll[page.model][`${id}`] = mapAll[page.model][id]; // mantiene esistente
                // crea anche la variante con suffix per indagare
                mapAll[page.model][`${id}_alt`] = key;
              } else {
                mapAll[page.model][id] = key;
              }
              found++;
            }
          }
        });
      });

      console.log(`[OK] Parsed ${found} ids for ${page.model}`);

      // salva file specifico per modello (leggibile, pretty)
      const modelFile = `${page.model}IoMap.json`;
      await fs.writeFile(modelFile, JSON.stringify(mapAll[page.model], null, 2), 'utf8');
      console.log(`[WRITE] ${modelFile}`);

    } catch (err) {
      console.error(`[ERROR] Failed to fetch ${page.model}:`, err.message);
      // continua con il prossimo modello
    }
  }

  // salva mappa combinata
  await fs.writeFile('teltonika_io_map.json', JSON.stringify(mapAll, null, 2), 'utf8');
  console.log('\n[WRITE] teltonika_io_map.json (combined)');
  console.log('[DONE] Scrape finished.');

})();
