// /middleware/wsAuth.js
import jwt from "jsonwebtoken";
import Users from "../models/User.js";

export async function wsAuth(info, callback) {
  try {
    console.log(info,callback)
    const url = new URL(info.req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      console.warn("[WS AUTH] Missing token");
      return callback(false, 401, "Missing token");
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user = await Users.findById(decoded.id).lean();

    if (!user) {
      console.warn("[WS AUTH] Invalid token user");
      return callback(false, 401, "Invalid token user");
    }

    // Inject user into WS request (magic trick)
    info.req.user = user;

    return callback(true);

  } catch (err) {
    console.error("[WS AUTH] Error verifying token", err?.message || err);
    return callback(false, 401, "Invalid token");
  }
}
