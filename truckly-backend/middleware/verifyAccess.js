import { verifyAccess } from "../config/jwt.js";

export function verifyAccessMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Missing token" });

  try {
    const token = header.replace("Bearer ", "");
    req.user = verifyAccess(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
