const express = require("express");
const { run, Agent, tool } = require("@openai/agents");
const { z } = require("zod");
const pdfParse = require("pdf-parse");
const mongoose = require("mongoose");
const { auth } = require("../utils/users");
const { UserChatsModel, Vehicles, UserModel, Companies, getModel, avlSchema } = require("../Models/Schemes");
const { _Users } = require("../utils/database");
const { decryptString, decryptJSON } = require("../utils/encryption");

const router = express.Router();

const getPrivilegeLevel = (user) => {
  if (!user) return 2;
  if (Number.isInteger(user.role)) return user.role;
  if (Number.isInteger(user.privilege)) return user.privilege;
  return 2;
};

const decorateVehicle = (raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const v = { ...raw };
  try {
    if (v.plateEnc) v.plate = decryptString(v.plateEnc);
    if (v.brandEnc) v.brand = decryptString(v.brandEnc);
    if (v.modelEnc) v.model = decryptString(v.modelEnc);
    if (v.detailsEnc) v.details = decryptJSON(v.detailsEnc);
  } catch (err) {
    console.warn("[agents] vehicle decrypt error:", err?.message || err);
  }
  if (v.plate && typeof v.plate === "object" && v.plate.v) {
    v.plate = v.plate.v;
  }
  return v;
};

const parseJson = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const createTools = (req) => {
  const privilege = getPrivilegeLevel(req.user);
  const userCompanyId = req.user?.companyId?.toString?.() || null;

  const dbFind = tool({
    name: "db_find",
    description: "Query allow-listed collections (Vehicles, Users, Company). Returns limited results.",
    parameters: z.object({
      collection: z.enum(["Vehicles", "Users", "Company"]),
      filterJson: z.string().nullable(),
      projectionJson: z.string().nullable(),
      limit: z.number().int().min(1).max(50).nullable()
    }),
    execute: async ({ collection, filterJson, projectionJson, limit }) => {
      const safeLimit = limit ?? 20;
      if (collection === "Vehicles") {
        if (privilege === 0) {
          const filter = parseJson(filterJson) || {};
          const projection = parseJson(projectionJson) || {};
          const textFilters = ["nickname", "plate", "model", "brand"];
          const hasTextFilter = textFilters.some((key) => filter[key]);
          const mongoFilter = { ...filter };
          if (hasTextFilter) {
            textFilters.forEach((key) => delete mongoFilter[key]);
          }
          const rows = await Vehicles.find(mongoFilter, projection)
            .limit(hasTextFilter ? 200 : safeLimit)
            .lean();
          return rows
            .map(decorateVehicle)
            .filter((row) => (hasTextFilter ? matchVehicle(row, filter) : true))
            .slice(0, safeLimit);
        }
        const list = await req.user.vehicles.list();
        const filter = parseJson(filterJson) || {};
        return list
          .map(decorateVehicle)
          .filter((vehicle) => matchVehicle(vehicle, filter))
          .slice(0, safeLimit);
      }

      if (collection === "Users") {
        if (privilege > 1) return [];
        const filter = parseJson(filterJson) || {};
        if (privilege === 1 && userCompanyId) {
          filter.companyId = new mongoose.Types.ObjectId(userCompanyId);
        }
        const projection = parseJson(projectionJson) || {
          firstName: 1,
          lastName: 1,
          email: 1,
          role: 1,
          privilege: 1,
          companyId: 1,
          status: 1,
          createdAt: 1
        };
        return await UserModel.find(filter, projection).limit(safeLimit).lean();
      }

      if (collection === "Company") {
        if (privilege > 1) return [];
        const filter = parseJson(filterJson) || {};
        const projection = parseJson(projectionJson) || { name: 1, status: 1, createdAt: 1 };
        return await Companies.find(filter, projection).limit(safeLimit).lean();
      }

      return [];
    }
  });

  const vehicleCreate = tool({
    name: "vehicle_create",
    description: "Create a vehicle for a company (super admin only).",
    parameters: z.object({
      companyId: z.string(),
      nickname: z.string(),
      plate: z.string(),
      brand: z.string(),
      model: z.string(),
      imei: z.string(),
      deviceModel: z.string().nullable(),
      codec: z.string().nullable(),
      tags: z.array(z.string()).nullable(),
      detailsJson: z.string().nullable()
    }),
    execute: async (payload) => {
      if (privilege !== 0) return "PERMISSION_DENIED";
      const companyId = payload.companyId?.trim();
      if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
        return "Invalid companyId.";
      }
      const owners = await UserModel.find({ companyId }, { _id: 1 }).lean();
      const ownerIds = owners.map((owner) => owner._id);
      if (!ownerIds.length) return "Company has no users.";
      const details = parseJson(payload.detailsJson) || {};
      const vehicle = await req.user.vehicles.create({
        nickname: payload.nickname,
        plate: payload.plate,
        brand: payload.brand,
        model: payload.model,
        imei: payload.imei,
        deviceModel: payload.deviceModel || "FMC150",
        codec: payload.codec || "8 Ext",
        tags: payload.tags || [],
        details,
        ownerIds
      });
      return {
        id: vehicle?._id?.toString?.() || vehicle?.id || null,
        imei: vehicle?.imei || null,
        nickname: vehicle?.nickname || null
      };
    }
  });

  const vehicleUpdate = tool({
    name: "vehicle_update",
    description: "Update vehicle metadata (super admin only).",
    parameters: z.object({
      vehicleId: z.string(),
      nickname: z.string().nullable(),
      tags: z.array(z.string()).nullable()
    }),
    execute: async ({ vehicleId, nickname, tags }) => {
      if (privilege !== 0) return "PERMISSION_DENIED";
      if (!mongoose.Types.ObjectId.isValid(vehicleId)) return "Invalid vehicleId.";
      const update = {};
      if (typeof nickname === "string" && nickname.trim()) update.nickname = nickname.trim();
      if (Array.isArray(tags)) update.tags = tags.map((t) => String(t).trim()).filter(Boolean);
      if (!Object.keys(update).length) return "Nothing to update.";
      await Vehicles.updateOne({ _id: vehicleId }, { $set: update });
      return "Vehicle updated.";
    }
  });

  const vehicleDelete = tool({
    name: "vehicle_delete",
    description: "Delete a vehicle (super admin only, requires confirm='DELETE').",
    parameters: z.object({
      vehicleId: z.string(),
      confirm: z.string()
    }),
    execute: async ({ vehicleId, confirm }) => {
      if (privilege !== 0) return "PERMISSION_DENIED";
      if (confirm !== "DELETE") return "Confirmation required.";
      if (!mongoose.Types.ObjectId.isValid(vehicleId)) return "Invalid vehicleId.";
      await Vehicles.deleteOne({ _id: vehicleId });
      return "Vehicle deleted.";
    }
  });

  const userCreate = tool({
    name: "user_create",
    description: "Create a user. Super admin can create any role; admin can only create readonly users for their company.",
    parameters: z.object({
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string(),
      email: z.string(),
      password: z.string(),
      role: z.number().int().nullable(),
      companyId: z.string().nullable()
    }),
    execute: async ({ firstName, lastName, phone, email, password, role, companyId }) => {
      if (privilege > 1) return "PERMISSION_DENIED";
      const resolvedRole = privilege === 0 && Number.isInteger(role) ? role : 3;
      const resolvedCompanyId = privilege === 0
        ? companyId
        : userCompanyId;
      if (!resolvedCompanyId) return "Missing companyId.";
      const user = await _Users.new(
        String(firstName),
        String(lastName),
        String(phone),
        String(email),
        String(password),
        resolvedCompanyId,
        resolvedRole,
        0,
        resolvedRole,
        [],
        "include",
        [],
        "include"
      );
      return {
        id: user?._id?.toString?.() || user?.id || null,
        email: user?.email || null,
        role: user?.role ?? null
      };
    }
  });

  const userUpdateRestrictions = tool({
    name: "user_update_restrictions",
    description: "Update vehicle visibility restrictions for readonly users.",
    parameters: z.object({
      userId: z.string(),
      allowedVehicleIds: z.array(z.string()).nullable(),
      allowedVehicleIdsMode: z.enum(["include", "exclude"]).nullable(),
      allowedVehicleTags: z.array(z.string()).nullable(),
      allowedVehicleTagsMode: z.enum(["include", "exclude"]).nullable()
    }),
    execute: async ({ userId, allowedVehicleIds, allowedVehicleIdsMode, allowedVehicleTags, allowedVehicleTagsMode }) => {
      if (privilege > 1) return "PERMISSION_DENIED";
      if (!mongoose.Types.ObjectId.isValid(userId)) return "Invalid userId.";
      const user = await UserModel.findById(userId);
      if (!user) return "User not found.";
      if (privilege === 1 && userCompanyId && String(user.companyId) !== userCompanyId) {
        return "FORBIDDEN";
      }
      if (Number(user.role) !== 3) return "Target user is not readonly.";
      const update = {
        allowedVehicleIds: Array.isArray(allowedVehicleIds) ? allowedVehicleIds : user.allowedVehicleIds,
        allowedVehicleIdsMode: allowedVehicleIdsMode || user.allowedVehicleIdsMode || "include",
        allowedVehicleTags: Array.isArray(allowedVehicleTags) ? allowedVehicleTags : user.allowedVehicleTags,
        allowedVehicleTagsMode: allowedVehicleTagsMode || user.allowedVehicleTagsMode || "include",
      };
      await UserModel.updateOne({ _id: userId }, { $set: update });
      return "Restrictions updated.";
    }
  });

  return [
    dbFind,
    vehicleCreate,
    vehicleUpdate,
    vehicleDelete,
    userCreate,
    userUpdateRestrictions
  ];
};

const normalizeVehicleList = (list = []) =>
  list.map((entry) => decorateVehicle(entry)).filter(Boolean);

const findVehiclesByQuery = (vehicles, query) => {
  if (!query) return [];
  if (typeof query === "object") {
    const imei = query?.imei || query?.vehicleId || query?.id || null;
    if (imei) {
      const exact = vehicles.filter((v) => String(v.imei || "") === String(imei));
      if (exact.length) return exact;
    }
  }
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const exact = vehicles.filter((v) => String(v.imei || "").toLowerCase() === q);
  if (exact.length) return exact;
  return vehicles.filter((v) => {
    const hay = `${v.nickname || ""} ${v.plate || ""} ${v.imei || ""}`.toLowerCase();
    return hay.includes(q);
  });
};

const resolveVehicleByQuery = async (req, query) => {
  const list = normalizeVehicleList(await req.user.vehicles.list());
  const matches = findVehiclesByQuery(list, query);
  return matches[0] || null;
};

const vehicleLocation = (req) =>
  tool({
    name: "vehicle_location",
    description: "Fetch latest monitoring GPS for a vehicle by imei, nickname, or plate.",
    parameters: z.object({
      query: z.string()
    }),
    execute: async ({ query }) => {
      const vehicle = await resolveVehicleByQuery(req, query);
      if (!vehicle?.imei) {
        return "Vehicle not found.";
      }
      const Model = getModel(`${vehicle.imei}_monitoring`, avlSchema);
      const latest = await Model.findOne().sort({ timestamp: -1 }).lean();
      if (!latest) return "No monitoring data available.";
      const gps = latest.gps || latest.data?.gps || latest;
      const toNumber = (val) => {
        const num = Number(val);
        return Number.isFinite(num) ? num : null;
      };
      const lat = toNumber(
        gps?.lat ||
        gps?.latitude ||
        gps?.Latitude ||
        gps?.position?.lat ||
        gps?.position?.Latitude
      );
      const lon = toNumber(
        gps?.lon ||
        gps?.lng ||
        gps?.longitude ||
        gps?.Longitude ||
        gps?.position?.lon ||
        gps?.position?.Longitude
      );
      return {
        imei: vehicle.imei,
        nickname: vehicle.nickname || null,
        plate: vehicle.plate || null,
        lat,
        lon,
        timestamp: latest.timestamp || latest.time || null
      };
    }
  });

const buildChatAgent = (req) =>
  Agent.create({
    name: "Truckly Assistant",
    apiKey: process.env.OPENAI_API_KEY,
    instructions: `
You are a helpful assistant for a fleet management platform.
Keep replies concise and in Italian.
You can use tools to query the database and manage vehicles/users only when permitted.
When the user asks about vehicles, plates, users, or companies you MUST use tools (db_find or specific tools) to answer.
Ask for missing information before running tools.
When the user asks to perform a map action (geofence, show alone, show group, show filtered, center/fly to, locate/find a vehicle),
include a single line that starts with "ACTION: " followed by a JSON object describing the action.
Example: ACTION: {"action":"geoFenceAlert","coordinatesCenter":{"lat":41.9028,"lng":12.4964},"coordinatesRadius":2000,"event":{"type":"vehicleIn","target":"AB123CD","triggerTimes":1}}
Examples:
- ACTION: {"action":"locateVehicle","query":"Stralis Landi"}
- ACTION: {"action":"showFiltered","filters":{"tags":["cold"],"company":"ACME"}}
If the user asks to locate a specific vehicle, use tools to resolve it and put the target identifier in "target" (imei or plate) and/or "query".
Keep the rest of the reply user-friendly; do not wrap the ACTION JSON in code fences.
Today's date is ${new Date().toISOString()}.
`,
    tools: [...createTools(req), vehicleLocation(req)],
  });

const topicAgent = Agent.create({
  name: "Topic Extractor",
  apiKey: process.env.OPENAI_API_KEY,
  instructions: `
Given a conversation, return a JSON array of up to 10 short keywords in Italian.
Return ONLY valid JSON (no prose).
`
});

const titleAgent = Agent.create({
  name: "Chat Title",
  apiKey: process.env.OPENAI_API_KEY,
  instructions: `
Create a short Italian chat title (2-5 words).
No numbers, no times, no punctuation.
If a vehicle name/plate is present, include it.
Examples:
- "Ricerca veicolo Stralis Landi"
- "Report consumi flotta"
Return ONLY the title string.
`
});

const intentAgent = Agent.create({
  name: "Action Intent Classifier",
  apiKey: process.env.OPENAI_API_KEY,
  instructions: `
Classify the user request into one of these actions:
- track_vehicles
- hide_show_vehicles
- report_fuel
- report_driver
- report_route
- geofence_alert
- activity_alert

Return ONLY valid JSON with this schema:
{"action":"<one_of_or_none>","targetQuery":"<string_or_null>","confidence":0-1}

Use "none" when no action matches. If a vehicle name/plate is mentioned, put it in targetQuery.
`
});

const buildHistory = (messages) => {
  return messages.map((msg) => {
    const role = msg.role === "assistant" ? "assistant" : msg.role;
    const type = role === "user" ? "input_text" : "output_text";
    return {
      role,
      content: [{ type, text: msg.content }]
    };
  });
};

const stopwords = new Set([
  "che",
  "targa",
  "ha",
  "il",
  "lo",
  "la",
  "le",
  "i",
  "gli",
  "del",
  "della",
  "dei",
  "delle",
  "di",
  "un",
  "una",
  "per",
  "su",
  "veicolo",
  "mezzo",
  "truck",
  "camion",
  "oggi",
  "ieri",
  "ora",
  "adesso"
]);

const extractQueryTokens = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòù\s]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !stopwords.has(t));

const matchVehicle = (vehicle, filter) => {
  const norm = (val) => String(val || "").toLowerCase();
  const matchesText = (val, target) =>
    !target ? true : norm(val).includes(norm(target));
  if (filter.imei && String(vehicle.imei || "") !== String(filter.imei)) return false;
  if (!matchesText(vehicle.nickname, filter.nickname)) return false;
  if (!matchesText(vehicle.plate, filter.plate)) return false;
  if (!matchesText(vehicle.model, filter.model)) return false;
  if (!matchesText(vehicle.brand, filter.brand)) return false;
  if (filter.tags && Array.isArray(vehicle.tags)) {
    const tagList = Array.isArray(filter.tags) ? filter.tags : [filter.tags];
    const hasTag = tagList.every((tag) =>
      vehicle.tags.map((t) => String(t).toLowerCase()).includes(String(tag).toLowerCase())
    );
    if (!hasTag) return false;
  }
  return true;
};

const prefetchVehicleContext = async (req, message) => {
  const text = String(message || "").toLowerCase();
  if (!text.includes("targa") && !text.includes("veicolo")) return null;
  const tokens = extractQueryTokens(message);
  const vehicles = await req.user.vehicles.list();
  const scored = vehicles
    .map((v) => {
      const haystack = `${v.nickname || ""} ${v.plate || ""} ${v.imei || ""}`.toLowerCase();
      const score = tokens.reduce((acc, t) => (haystack.includes(t) ? acc + 1 : acc), 0);
      return { score, v };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((entry) => ({
      nickname: entry.v.nickname || null,
      plate: entry.v.plate || null,
      imei: entry.v.imei || null
    }));
  if (!scored.length) return "Nessun veicolo trovato con i criteri forniti.";
  return `Veicoli trovati:\n${scored
    .map((v) => `- ${v.nickname || "Senza nome"} (targa: ${v.plate || "N/D"}, imei: ${v.imei || "N/D"})`)
    .join("\n")}`;
};

const extractTextFromFile = async (file) => {
  if (!file || !file.data) return null;
  const mime = file.mimetype || "";
  if (mime === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdfParse(file.data);
    return parsed?.text || "";
  }
  if (mime.startsWith("text/") || file.name?.match(/\.(txt|csv|md)$/i)) {
    return file.data.toString("utf8");
  }
  return null;
};

const isImageFile = (file) => {
  const mime = file?.mimetype || "";
  return mime.startsWith("image/");
};

const normalizeKeywords = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((k) => String(k).trim()).filter(Boolean).slice(0, 10);
    }
  } catch {}
  return value
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 10);
};

const normalizeActionPayload = (parsed) => {
  if (!parsed) return null;
  if (typeof parsed === "string") return { action: parsed };
  if (typeof parsed !== "object") return null;
  if (parsed.actionPerformative) return parsed.actionPerformative;
  if (parsed.action) return parsed;
  if (parsed.type) return { action: parsed.type };
  return null;
};

const extractActionPerformative = (raw) => {
  if (!raw || typeof raw !== "string") {
    return { action: null, cleaned: raw || "" };
  }
  const parseJsonSafe = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };
  let cleaned = raw;
  let action = null;

  const codeBlock = cleaned.match(/```action\s*([\s\S]*?)```/i);
  if (codeBlock) {
    const parsed = parseJsonSafe(codeBlock[1].trim());
    const normalized = normalizeActionPayload(parsed);
    if (normalized) {
      action = normalized;
      cleaned = cleaned.replace(codeBlock[0], "").trim();
    }
  }

  if (!action) {
    const lineMatch = cleaned.match(/^\s*ACTION:\s*({[\s\S]*})\s*$/im);
    if (lineMatch) {
      const parsed = parseJsonSafe(lineMatch[1].trim());
      const normalized = normalizeActionPayload(parsed);
      if (normalized) {
        action = normalized;
        cleaned = cleaned.replace(lineMatch[0], "").trim();
      }
    }
  }

  return { action, cleaned };
};

const looksLikeMapIntent = (text) => {
  if (!text) return false;
  return /mappa|map|visualizz|mostr|trova|localizz|centra|fly|veder/i.test(text);
};

const looksLikeNotFoundReply = (text) => {
  if (!text) return false;
  return /non\s+riesco\s+a\s+trovare|non\s+trovo|nessun\s+veicolo|veicolo\s+non\s+trovato/i.test(
    text,
  );
};

const looksLikeAlertRequest = (text) => {
  if (!text) return false;
  return /avvisa|notifica|alert|fammi\s+sapere|avvert|dimmi\s+quando/i.test(text);
};

const looksLikeArrivalDeparture = (text) => {
  if (!text) return false;
  return /arriv|entra|entrer|uscit|esce|uscir|lascia|lascer|part|raggiung/i.test(text);
};

const extractLocationHint = (text) => {
  if (!text) return null;
  const match = text.match(/\b(?:a|in|verso|entro|su)\s+([A-ZÀ-ÖØ-Ý][\wÀ-ÿ' -]{2,})/);
  if (match?.[1]) return match[1].trim();
  return null;
};

const extractVehicleHint = (text) => {
  if (!text) return null;
  const match = text.match(
    /\b(?:quando|se)\s+(.+?)\s+(arriva|arriv(a|i|o)|entra|entr(a|i|o)|esce|usc(i|e|o)|lascia|part(a|e|i)|raggiung)/i,
  );
  if (match?.[1]) return match[1].trim();
  return null;
};

const extractQuotedVehicleName = (text) => {
  if (!text) return null;
  const doubleQuoted = text.match(/"([^"]{2,})"/);
  if (doubleQuoted?.[1]) return doubleQuoted[1].trim();
  const singleQuoted = text.match(/'([^']{2,})'/);
  if (singleQuoted?.[1]) return singleQuoted[1].trim();
  return null;
};

const extractVehicleQueryFromHistory = (messages = []) => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (!msg?.content) continue;
    const quoted = extractQuotedVehicleName(String(msg.content));
    if (quoted) return quoted;
  }
  return null;
};

const collectTargetQueries = (payload = {}) => {
  const candidates = [
    payload?.targetImei,
    payload?.target,
    payload?.targetQuery,
    payload?.query,
    payload?.vehicle,
    payload?.imei,
    payload?.vehicleId,
    payload?.event?.target,
    payload?.event?.vehicleId,
    payload?.event?.imei,
  ];
  return candidates.filter((value) => value != null && value !== "");
};

const collectGroupQueries = (payload = {}) => {
  const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  return []
    .concat(toArray(payload.targets))
    .concat(toArray(payload.targetIds))
    .concat(toArray(payload.group))
    .concat(toArray(payload.groupImeis))
    .filter((value) => value != null && value !== "");
};

const formatVehicleOptions = (vehicles) =>
  vehicles
    .map((v) => `- ${v.nickname || "Senza nome"} (targa: ${v.plate || "N/D"}, imei: ${v.imei || "N/D"})`)
    .join("\n");

const resolveActionTargets = async (req, actionPerformative, userMessage) => {
  if (!actionPerformative?.action) {
    return { actionPerformative, reply: null };
  }

  const action = String(actionPerformative.action || "").toLowerCase();
  const vehicles = normalizeVehicleList(await req.user.vehicles.list());
  const knownImeis = new Set(vehicles.map((v) => String(v.imei || "")));
  const singleVehicle = vehicles.length === 1 ? vehicles[0] : null;

  const needsVehicle =
    action.includes("geofence") ||
    action.includes("track") ||
    action.includes("locate") ||
    action.includes("find") ||
    action.includes("showalone") ||
    action.includes("showonly") ||
    action.includes("report_fuel") ||
    action.includes("report_driver") ||
    action.includes("report_route") ||
    action.includes("hide_show") ||
    action.includes("showvehicle") ||
    action.includes("vehicle");

  const groupAction = action.includes("showgroup") || action.includes("group");

  if (groupAction) {
    const groupQueries = collectGroupQueries(actionPerformative);
    const resolvedImeis = [];
    for (const query of groupQueries) {
      if (knownImeis.has(String(query))) {
        resolvedImeis.push(String(query));
        continue;
      }
      const matches = findVehiclesByQuery(vehicles, query);
      if (matches.length === 1) {
        resolvedImeis.push(String(matches[0].imei));
      }
    }
    if (resolvedImeis.length) {
      return {
        actionPerformative: {
          ...actionPerformative,
          targetsImeis: Array.from(new Set(resolvedImeis)),
        },
        reply: null,
      };
    }
  }

  if (!needsVehicle) {
    return { actionPerformative, reply: null };
  }

  const targetQueries = collectTargetQueries(actionPerformative);
  let ambiguousMatches = [];
  for (const query of targetQueries) {
    if (knownImeis.has(String(query))) {
      const match = vehicles.find((v) => String(v.imei) === String(query));
      if (match) {
        return {
          actionPerformative: {
            ...actionPerformative,
            targetImei: String(match.imei),
            targetVehicle: { imei: match.imei, nickname: match.nickname || null, plate: match.plate || null },
          },
          reply: null,
        };
      }
    }
    const matches = findVehiclesByQuery(vehicles, query);
    if (matches.length === 1) {
      const match = matches[0];
      return {
        actionPerformative: {
          ...actionPerformative,
          targetImei: String(match.imei),
          targetVehicle: { imei: match.imei, nickname: match.nickname || null, plate: match.plate || null },
        },
        reply: null,
      };
    }
    if (matches.length > 1) {
      ambiguousMatches = matches;
      break;
    }
  }

  if (!targetQueries.length && singleVehicle) {
    return {
      actionPerformative: {
        ...actionPerformative,
        targetImei: String(singleVehicle.imei),
        targetVehicle: {
          imei: singleVehicle.imei,
          nickname: singleVehicle.nickname || null,
          plate: singleVehicle.plate || null,
        },
      },
      reply: null,
    };
  }

  if (!targetQueries.length) {
    return {
      actionPerformative: null,
      reply: "Quale veicolo intendi? Puoi indicare nome o targa?",
    };
  }

  if (ambiguousMatches.length) {
    return {
      actionPerformative: null,
      reply: `Ho trovato più veicoli con quel nome o targa. Quale intendi?\n${formatVehicleOptions(
        ambiguousMatches,
      )}`,
    };
  }

  if (needsVehicle && targetQueries.length) {
    const fallbackQuery = extractQuotedVehicleName(userMessage) || userMessage;
    if (vehicles.length && fallbackQuery) {
      const matches = findVehiclesByQuery(vehicles, fallbackQuery);
      if (matches.length === 1) {
        const match = matches[0];
        return {
          actionPerformative: {
            ...actionPerformative,
            targetImei: String(match.imei),
            targetVehicle: { imei: match.imei, nickname: match.nickname || null, plate: match.plate || null },
          },
          reply: null,
        };
      }
      if (matches.length > 1) {
        return {
          actionPerformative: null,
          reply: `Ho trovato più veicoli. Quale intendi?\n${formatVehicleOptions(matches)}`,
        };
      }
    }
    return {
      actionPerformative: null,
      reply: "Non trovo il veicolo richiesto. Puoi indicare targa o nome esatto?",
    };
  }

  return { actionPerformative, reply: null };
};

router.post("/chat", auth, async (req, res) => {
  try {
    console.log("[agents/chat] request start", {
      userId: req.user?.id || req.user?._id || null,
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      hasFiles: Boolean(req.files),
      ts: new Date().toISOString(),
    });
    const { chatId } = req.body || {};
    const rawMessage = req.body?.message || req.body?.content || "";
    const message = typeof rawMessage === "string" ? rawMessage : rawMessage?.content;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "BAD_REQUEST", message: "Missing message content" });
    }

    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    let chat = null;
    if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      chat = await UserChatsModel.findOne({ _id: chatId, userId }).lean();
    }

    if (!chat) {
      chat = await UserChatsModel.create({
        userId,
        companyId: req.user?.companyId || null,
        messages: []
      });
    }

    let attachmentsNote = "";
    let extractedText = "";
    const imageBlocks = [];
    if (req.files) {
      const files = Array.isArray(req.files.files)
        ? req.files.files
        : req.files.files
          ? [req.files.files]
          : [];
      if (files.length) {
        const names = files.map((file) => file.name).filter(Boolean);
        if (names.length) {
          attachmentsNote = `\n\n[Allegati: ${names.join(", ")}]`;
        }
        for (const file of files) {
          try {
            if (isImageFile(file)) {
              const mime = file.mimetype || "image/png";
              const base64 = Buffer.from(file.data).toString("base64");
              imageBlocks.push({
                type: "input_image",
                image_url: `data:${mime};base64,${base64}`,
              });
            } else {
              const text = await extractTextFromFile(file);
              if (text) {
                extractedText += `\n\n[File: ${file.name}]\n${text.slice(0, 6000)}`;
              }
            }
          } catch (err) {
            console.warn("[agents/chat] file parse error:", err?.message || err);
          }
        }
      }
    }

    await UserChatsModel.updateOne(
      { _id: chat._id },
      { $push: { messages: { role: "user", content: `${message}${attachmentsNote}` } } }
    );

    const refreshed = await UserChatsModel.findById(chat._id).lean();
    const history = buildHistory(refreshed.messages);
    const prefetched = await prefetchVehicleContext(req, message);
    if (prefetched) {
      history.push({
        role: "system",
        content: [{ type: "input_text", text: `Contesto veicoli:\n${prefetched}` }]
      });
    }
    const userContentBlocks = [
      {
        type: "input_text",
        text: `${message}${attachmentsNote}${extractedText}`,
      },
      ...imageBlocks,
    ];
    history.push({ role: "user", content: userContentBlocks });
    let intentPayload = null;
    try {
      const intentPrompt = `Utente: ${message}`;
      const intentResult = await run(intentAgent, [
        { role: "user", content: [{ type: "input_text", text: intentPrompt }] }
      ]);
      intentPayload = parseJson(intentResult?.finalOutput) || null;
      console.log("[agents/chat] intent result", intentPayload);
    } catch (err) {
      console.warn("[agents/chat] intent error", err?.message || err);
    }

    const chatAgent = buildChatAgent(req);
    console.log("[agents/chat] running agent", {
      chatId: chat?._id?.toString?.() || chat?.id || null,
      messagePreview: message.slice(0, 160),
    });
    const result = await run(chatAgent, history);
    console.log("[agents/chat] agent finished", {
      usage: result?.usage || null,
      hasOutput: Boolean(result?.finalOutput),
    });

    const assistantReply = result.finalOutput || "";
    const extracted = extractActionPerformative(assistantReply);
    let actionPerformative = extracted.action || null;
    let replyContent = extracted.cleaned || "";
    console.log("[agents/chat] action extraction", {
      hasAction: Boolean(actionPerformative?.action),
      action: actionPerformative?.action || null,
      rawAction: actionPerformative || null,
    });

    if (!actionPerformative?.action && intentPayload?.action && intentPayload.action !== "none") {
      actionPerformative = {
        action: intentPayload.action,
        targetQuery: intentPayload?.targetQuery || null,
      };
      console.log("[agents/chat] intent action applied", actionPerformative);
    }

    if (
      !actionPerformative?.action &&
      looksLikeAlertRequest(message) &&
      looksLikeArrivalDeparture(message)
    ) {
      const locationHint = extractLocationHint(message);
      const vehicleHint = extractVehicleHint(message);
      actionPerformative = {
        action: "geofence_alert",
        targetQuery: vehicleHint || null,
        locationQuery: locationHint || null,
      };
      console.log("[agents/chat] alert intent inferred", actionPerformative);
    }

    if (!actionPerformative && looksLikeMapIntent(message)) {
      console.log("[agents/chat] map-intent fallback", { messagePreview: message.slice(0, 160) });
      const queryFromMessage = extractQuotedVehicleName(message);
      const queryFromHistory = extractVehicleQueryFromHistory(refreshed?.messages || []);
      const vehicleQuery = queryFromMessage || queryFromHistory || message;
      try {
        const resolvedVehicle = await resolveVehicleByQuery(req, vehicleQuery);
        if (resolvedVehicle?.imei || resolvedVehicle?.plate || resolvedVehicle?.nickname) {
          actionPerformative = {
            action: "locateVehicle",
            target: resolvedVehicle?.imei || resolvedVehicle?.plate || null,
            query: resolvedVehicle?.nickname || resolvedVehicle?.plate || vehicleQuery
          };
          console.log("[agents/chat] fallback action created", {
            target: actionPerformative.target,
            query: actionPerformative.query,
          });
        }
      } catch {}
    }

    if (actionPerformative?.action) {
      const resolved = await resolveActionTargets(req, actionPerformative, message);
      actionPerformative = resolved.actionPerformative;
      if (resolved.reply) {
        replyContent = resolved.reply;
      } else if (actionPerformative?.targetVehicle && looksLikeNotFoundReply(replyContent)) {
        const displayName =
          actionPerformative.targetVehicle.nickname ||
          actionPerformative.targetVehicle.plate ||
          actionPerformative.targetVehicle.imei ||
          "il veicolo";
        replyContent = `Ho trovato ${displayName}. Ti mostro la posizione sulla mappa.`;
      }

      if (actionPerformative?.action?.toLowerCase().includes("geofence")) {
        const hasCenter =
          actionPerformative?.coordinatesCenter ||
          actionPerformative?.center ||
          actionPerformative?.coordinates?.center;
        if (!hasCenter) {
          const locationLabel =
            actionPerformative?.locationQuery || extractLocationHint(message) || null;
          if (locationLabel) {
            actionPerformative.locationLabel = locationLabel;
            if (!resolved.reply) {
              replyContent = `Ok. Imposto un alert geofence per ${locationLabel}. Seleziona l'area sulla mappa.`;
            }
          } else if (!resolved.reply) {
            replyContent =
              "Ok. Imposto un alert geofence. Seleziona l'area sulla mappa o dimmi la localita.";
          }
        }
      }
    }

    await UserChatsModel.updateOne(
      { _id: chat._id },
      { $push: { messages: { role: "assistant", content: replyContent } } }
    );

    const messageCount = refreshed.messages.length + 1;
    const shouldUpdateTopic =
      !Array.isArray(refreshed.topicKeywords) || refreshed.topicKeywords.length === 0 || messageCount % 6 === 0;

    if (shouldUpdateTopic) {
      const topicPrompt = `Conversation:\n${refreshed.messages
        .slice(-12)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n")}`;
      const topicResult = await run(topicAgent, [
        { role: "user", content: [{ type: "input_text", text: topicPrompt }] }
      ]);
      const keywords = normalizeKeywords(topicResult.finalOutput || "");
      let title = null;
      try {
        const titleResult = await run(titleAgent, [
          { role: "user", content: [{ type: "input_text", text: topicPrompt }] }
        ]);
        title = String(titleResult.finalOutput || "").trim() || null;
      } catch {}
      await UserChatsModel.updateOne(
        { _id: chat._id },
        { $set: { topicKeywords: keywords, topicUpdatedAt: new Date(), title } }
      );
    }

    return res.json({
      chatId: chat._id,
      reply: { role: "assistant", content: replyContent },
      actionPerformative
    });
  } catch (err) {
    console.error("[agents/chat] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

router.get("/chats", auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const chats = await UserChatsModel.find({ userId })
      .sort({ updatedAt: -1 })
      .select({ messages: { $slice: -1 }, topicKeywords: 1, title: 1, updatedAt: 1 })
      .lean();
    return res.json({ chats });
  } catch (err) {
    console.error("[agents/chats] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

router.get("/chats/:id", auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const chatId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }
    const chat = await UserChatsModel.findOne({ _id: chatId, userId }).lean();
    if (!chat) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ chat });
  } catch (err) {
    console.error("[agents/chat:get] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

router.delete("/chats/:id", auth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const chatId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "BAD_REQUEST" });
    }
    const result = await UserChatsModel.deleteOne({ _id: chatId, userId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[agents/chat:delete] error:", err);
    return res.status(500).json({ error: "AGENT_ERROR", detail: err.message });
  }
});

module.exports = router;
