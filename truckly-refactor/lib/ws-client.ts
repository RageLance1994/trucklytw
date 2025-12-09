export class WSClient {
  url: string;
  imeis: string[];
  onData: (device: any) => void;
  onConnect?: () => void;
  reconnectTimeout: any = null;
  ws: WebSocket | null = null;

  constructor(url: string, imeis: string[], onConnect: () => void, onData: (device: any) => void) {
    this.url = url;
    this.imeis = imeis;
    this.onData = onData;
    this.onConnect = onConnect;

    this.connect();
  }

  connect() {
    console.log("[WS] opening", this.url);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] open", this.url);
      this.onConnect?.();
      clearTimeout(this.reconnectTimeout);

      setTimeout(() => {
        this.send({
          action: "subscribe",
          deviceIds: this.imeis,
        });
      }, 500);
    };

    this.ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);

        if (payload?.devices) {
          payload.devices.forEach((device: any) => this.onData(device));
          return;
        }

        if (payload?.type === "update" || payload?.type === "snapshot") {
          this.onData(payload);
          return;
        }
      } catch (err) {
        console.error("WS message parse error:", err);
      }
    };

    this.ws.onclose = (e) => {
      console.warn(`WS closed (${e.code}${e.reason ? `: ${e.reason}` : ""}) - reconnecting in 1500ms... url: ${this.url}`);
      this.reconnectTimeout = setTimeout(() => this.connect(), 1500);
    };

    this.ws.onerror = (err: any) => {
      console.error("WS error:", err?.message || err, "state:", this.ws?.readyState, "url:", this.url);
      this.ws?.close();
    };
  }

  send(obj: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  updateSubscriptions(newImeis: string[]) {
    this.imeis = newImeis;
    this.send({ action: "subscribe", deviceIds: this.imeis });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
    clearTimeout(this.reconnectTimeout);
  }
}
