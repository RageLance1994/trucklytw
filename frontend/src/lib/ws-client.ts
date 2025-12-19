type WSDataHandler = (payload: any) => void;

export class WSClient {
  private url: string;
  private imeis: string[];
  private ws: WebSocket | null = null;

  private reconnectTimeout: any = null;
  private pingInterval: any = null;

  private readonly RECONNECT_DELAY = 1500;
  private readonly PING_INTERVAL = 25_000;

  private shouldReconnect = true;
  private isConnected = false;

  private onData: WSDataHandler;
  private onConnect?: () => void;

  constructor(
    url: string,
    imeis: string[],
    onConnect: () => void,
    onData: WSDataHandler
  ) {
    this.url = url;
    this.imeis = imeis;
    this.onData = onData;
    this.onConnect = onConnect;

    this.connect();
  }

  // ========================
  // CONNECTION
  // ========================

  private connect() {
    if (this.ws) return;

    console.log("[WS] connecting →", this.url);
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] open");
      this.isConnected = true;

      this.onConnect?.();
      this.subscribe();

      this.startHeartbeat();
      clearTimeout(this.reconnectTimeout);
    };

    this.ws.onmessage = (msg) => {
      try {
        const payload = JSON.parse(msg.data);

        if (payload?.type === "pong") return;

        if (payload?.devices) {
          payload.devices.forEach((d: any) => this.onData(d));
          return;
        }

        this.onData(payload);
      } catch (err) {
        console.error("[WS] parse error:", err);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WS] error", err);
      // NON chiudere qui
    };

    this.ws.onclose = (e) => {
      console.warn("[WS] closed", e.code, e.reason);

      this.cleanupSocket();

      if (!this.shouldReconnect) return;

      // close pulito → niente reconnect
      if (e.code === 1000) return;

      this.reconnectTimeout = setTimeout(
        () => this.connect(),
        this.RECONNECT_DELAY
      );
    };
  }

  // ========================
  // SUBSCRIPTIONS
  // ========================

  private subscribe() {
    if (!this.isConnected) return;

    console.log("[WS] subscribe", this.imeis);

    this.send({
      action: "subscribe",
      deviceIds: this.imeis,
    });
  }

  updateSubscriptions(newImeis: string[]) {
    this.imeis = newImeis;
    this.subscribe();
  }

  // ========================
  // HEARTBEAT
  // ========================

  private startHeartbeat() {
    this.stopHeartbeat();

    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, this.PING_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ========================
  // SEND
  // ========================

  send(payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  // ========================
  // CLEANUP
  // ========================

  private cleanupSocket() {
    this.stopHeartbeat();
    this.isConnected = false;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null; 
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws = null;
    }
  }

  close() {
    console.log("[WS] closing manually");
    this.shouldReconnect = false;
    clearTimeout(this.reconnectTimeout);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close(1000, "client closed");
    }

    this.cleanupSocket();
  }
}
