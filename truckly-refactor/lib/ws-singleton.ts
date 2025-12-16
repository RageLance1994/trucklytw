import { WebSocketServer } from "ws";

declare global {
  // eslint-disable-next-line no-var
  var _wss: WebSocketServer | undefined;
}

export function getWSS(server: any) {
  if (!global._wss) {
    console.log("[WS] creating singleton WebSocketServer");

    global._wss = new WebSocketServer({
      noServer: true,
    });

    global._wss.on("connection", (ws, req) => {
      console.log("[WS] CONNECTED");

      ws.on("message", (msg) => {
        if (msg.toString().includes("ping")) {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      });

      ws.on("close", () => {
        console.log("[WS] DISCONNECTED");
      });
    });
  }

  return global._wss;
}
