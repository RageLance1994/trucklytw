import type { NextApiRequest, NextApiResponse } from "next";
import type { IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { Socket } from "net";

import { connectMongo } from "@/lib/server/mongo";
import { verifyAccess } from "@/lib/server/jwt";
import { UserService } from "@/lib/server/services/UserService";
import { getStreamHub } from "@/lib/server/ws/streamHub";

/* =======================
   GLOBAL SINGLETON
======================= */

declare global {
  // eslint-disable-next-line no-var
  var _trucklyWSS: WebSocketServer | undefined;
  // eslint-disable-next-line no-var
  var _trucklyUpgradeBound: boolean | undefined;
}

function logWs(...args: any[]) {
  console.log("[WS]", new Date().toISOString(), ...args);
}

type TrucklyWS = WebSocket & {
  deviceImeis?: Set<string>;
  isAlive?: boolean;
  heartbeatInterval?: NodeJS.Timeout | null;
};

type LeanUser = NonNullable<
  Awaited<ReturnType<typeof UserService.getUserById>>
>;

/* =======================
   AUTH
======================= */

function extractToken(request: IncomingMessage) {
  const url = new URL(
    request.url || "",
    `http://${request.headers.host || "localhost"}`
  );

  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const cookie = request.headers.cookie;
  if (cookie) {
    const t = cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("accessToken="));
    if (t) return decodeURIComponent(t.split("=")[1]);
  }

  const auth = request.headers.authorization;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7);
  }

  return null;
}

async function authenticate(req: IncomingMessage): Promise<LeanUser> {
  const token = extractToken(req);
  if (!token) throw new Error("Missing token");

  const payload = verifyAccess(token);
  const user = await UserService.getUserById(payload.id);
  if (!user) throw new Error("Invalid user");

  return user;
}

/* =======================
   CONNECTION HANDLER
======================= */

async function handleConnection(ws: TrucklyWS, req: IncomingMessage) {
  const connId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  let user: LeanUser;

  try {
    await connectMongo();
    user = await authenticate(req);
    logWs("CONNECTED", connId, user.email);
  } catch (err) {
    ws.close(4003, "Unauthorized");
    return;
  }

  const hub = getStreamHub();
  ws.deviceImeis = new Set();
  ws.isAlive = true;

  hub.addClient(ws);
  await hub.ensureInitialized();

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.heartbeatInterval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;

    if (!ws.isAlive) {
      logWs("heartbeat timeout", connId);
      ws.terminate();
      return;
    }

    ws.isAlive = false;
    ws.ping();
  }, 25_000);

  ws.on("message", async (raw) => {
    try {
      ws.isAlive = true;
      const msg = JSON.parse(raw.toString());

      if (msg.action === "subscribe") {
        const allowed = new Set(
          await UserService.getUserVehicleImeis(user._id.toString())
        );

        const requested = Array.isArray(msg.deviceIds)
          ? msg.deviceIds
          : [];

        const finalImeis = requested.filter((id) => allowed.has(id));
        hub.updateSubscriptions(ws, finalImeis);
        await hub.sendInitialSnapshots(ws, finalImeis);

        logWs("SUBSCRIBED", connId, user.email, finalImeis);
      }
    } catch (err) {
      logWs("message error", connId, err);
    }
  });

  ws.on("close", () => {
    clearInterval(ws.heartbeatInterval!);
    hub.removeClient(ws);
    logWs("DISCONNECTED", connId, user.email);
  });

  ws.on("error", (err) => {
    logWs("WS error", connId, err);
  });
}

/* =======================
   API HANDLER
======================= */

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!res.socket) {
    res.status(500).end();
    return;
  }

  // INIT WSS ONCE
  if (!global._trucklyWSS) {
    global._trucklyWSS = new WebSocketServer({ noServer: true });
    global._trucklyWSS.on("connection", (ws, req) => {
      handleConnection(ws as TrucklyWS, req).catch((err) => {
        logWs("connection error", err);
        ws.close(1011, "Internal error");
      });
    });

    logWs("WebSocketServer singleton created");
  }

  // BIND UPGRADE ONCE
  if (!global._trucklyUpgradeBound) {
    global._trucklyUpgradeBound = true;

    res.socket.server.on(
      "upgrade",
      (request: IncomingMessage, socket: Socket, head: Buffer) => {
        if (!request.url?.startsWith("/api/stream")) return;

        global._trucklyWSS!.handleUpgrade(
          request,
          socket,
          head,
          (ws) => {
            global._trucklyWSS!.emit("connection", ws, request);
          }
        );
      }
    );

    logWs("upgrade handler bound");
  }

  // NORMAL HTTP RESPONSE
  res.status(200).json({ ok: true });
}

/* =======================
   CONFIG
======================= */

export const config = {
  api: {
    bodyParser: false,
  },
};
