

import { initTooltipCounters } from "/assets/js/tooltipCounters.js";


window._post = async (url, body = {}, timeout = 10000, raw = false) => {
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (timer) clearTimeout(timer);

    // gestisci errori HTTP
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} - ${res.statusText}: ${text}`);
    }

    if (raw) return (res);

    // prova a decodificare JSON, fallback a text
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    } else {
      return await res.text();
    }

  } catch (err) {
    clearTimeout(timer);

    // differenzia tipi di errore
    if (err.name === 'AbortError') {
      console.error(`⏱️ _post timeout su ${url}`);
      throw new Error(`Richiesta scaduta (${timeout / 1000}s)`);
    }

    console.error(`❌ Errore in _post(${url}):`, err);
    throw new Error(`Errore nella richiesta: ${err.message}`);
  }
};



if(location.href =="http://localhost:8080/dashboard/test/tooltip"){
  initTooltipCounters(document.querySelector('#test_tooltip_0525'),{driverId:'I100000569493003',imei:'864275071761426'}); 
}


