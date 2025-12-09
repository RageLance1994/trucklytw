// /ws/stream.js
import { wsAuth } from "../middleware/wsAuth.js";
import { UserService } from "../services/UserService.js";
import { DeviceMonitoring } from "../services/DeviceMonitoringService.js";

export default function registerStream(app) {
  app.ws("/stream", { verifyClient: wsAuth }, async (ws, req) => {
    const user = req.user;

    console.log(`WS CONNECTED: ${user.email}`);

    // IMEI reali del user (owner)
    const allowedImeis = new Set(
      await UserService.getUserVehicleImeis(user._id)
    );

    ws.deviceImeis = new Set();
    DeviceMonitoring.addClient(ws);

    // Gestione messaggi WS
    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.action === "subscribe") {
          const requested = msg.deviceIds || [];

          // filtro IMEI permesse
          const finalImeis = requested.filter((id) =>
            allowedImeis.has(id)
          );

          ws.deviceImeis = new Set(finalImeis);

          console.log(`${user.email} subscribed`, [...ws.deviceImeis]);

          // snapshot + attiva watcher ad ogni imei
          await DeviceMonitoring.sendInitialState(ws, finalImeis);
        }

      } catch (e) {
        console.error("WS MESSAGE ERROR:", e);
      }
    });

    // Disconnessione
    ws.on("close", () => {
      console.log(`WS DISCONNECTED: ${user.email}`);
      DeviceMonitoring.removeClient(ws);
    });
  });
}
