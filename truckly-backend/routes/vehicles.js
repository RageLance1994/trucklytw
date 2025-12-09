import express from "express";
import { VehicleService } from "../services/VehicleService.js";
import { verifyAccess } from "../config/jwt.js";

const router = express.Router();

router.get("/", async (req, res) => {
  let userId = null;

  const header = req.headers.authorization;
  if (header) {
    try {
      const token = header.replace("Bearer ", "");
      const payload = verifyAccess(token);
      userId = payload.id;
    } catch (err) {
      // ignore and fallback to public list
    }
  }

  const data = userId
    ? await VehicleService.listByUser(userId)
    : await VehicleService.listAll();

  res.json({ vehicles: data });
});

export default router;
