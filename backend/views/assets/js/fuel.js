var _vehicles = window.vehicles || vehicles; 
console.log(_vehicles);


window.fuelMap = new Map();

async function requestEstremi() {
  const imeis = Array.isArray(_vehicles) ? _vehicles.map(v => v.imei).filter(Boolean) : [];
  if (!imeis.length) return { ok: false, error: 'no-imei' };

  const url = '/dashboard/calibrate/fuel';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ imeis }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (res.status === 403) {
      // non autorizzato -> login
      location.href = '/login';
      return { ok: false, error: 'forbidden' };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, statusText: res.statusText, body: text };
    }

    const json = await res.json().catch(() => null);
    return { ok: true, data: json };

  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') return { ok: false, error: 'timeout' };
    return { ok: false, error: err.message || String(err) };
  }
}


requestEstremi().then((data,err) => {
    var {data} = data; 
    if(data.length){
        data.map((d) => {
            var {imei,hasSensor,max,min} = d; 

            window.fuelMap.set(imei,{hasSensor,max,min})

        })
        console.log(window.fuelMap)
    }

    
})







