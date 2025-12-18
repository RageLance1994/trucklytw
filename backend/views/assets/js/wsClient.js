export class WSClient {
  constructor(url, imeis,onConnect, onData) {
    this.url = url;
    this.imeis = imeis;
    this.onData = onData;
    this.onConnect = onConnect
    this.reconnectTimeout = null;
    this.ws = null;

    this.connect();
  }

  connect() {
    
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.onConnect()
      // console.log(`[${this.url}] => 🛰️ WS connesso`);
      clearTimeout(this.reconnectTimeout);

      // iscrizione ai dispositivi
      setTimeout(() => {
        this.send({
          action: "subscribe",
          deviceIds: this.imeis
        });
      }, 500)
    };

    this.ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);
        if (payload && payload.devices) {
          // per ogni device ricevuto → callback
          payload.devices.forEach(device => this.onData(device));
        }
      } catch (err) {
        

        console.error("❌ Errore parsing messaggio WS:", err);
      }
    };

    this.ws.onclose = (e) => {
      console.warn(`🔌 WS chiuso (${e.code}) - Riconnessione in 1500ms...`);
      this.reconnectTimeout = setTimeout(() => this.connect(), 1500);
    };

    this.ws.onerror = (err) => {
      console.error("❌ WS errore:", err);
      this.ws.close();
    };
  }

  send(obj) {
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  updateSubscriptions(newImeis) {
    this.imeis = newImeis;
    this.send({ action: "subscribe", deviceIds: this.imeis });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
