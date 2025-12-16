import { NextRequest, NextResponse } from "next/server";
import { connectMongo } from "@/lib/server/mongo";
import { VehicleService } from "@/lib/server/services/VehicleService";
import { verifyAccess } from "@/lib/server/jwt";
import { getStreamHub } from "@/lib/server/ws/streamHub";

function getToken(req: NextRequest) {
  const auth = req.headers?.get?.("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = req.cookies?.get?.("accessToken")?.value;
  return cookie || null;
}

export async function GET(req: NextRequest) {
  await connectMongo();
  let userId: string | null = null;

  const token = getToken(req);

  if (token) {
    try {
      const payload = verifyAccess(token);
      userId = payload.id;
    } catch {
      // fall back to public list
    }
  }

  const data = userId
    ? await VehicleService.listByUser(userId)
    : await VehicleService.listAll();


  const hub = getStreamHub();
  await hub.ensureInitialized();

  await Promise.all(
    data.map(async (vehicle) => {
      if (!vehicle?.imei) {
        vehicle.lat = null;
        vehicle.lon = null;
        return;
      }
      const coords = await hub.getLastKnownCoordinates(vehicle.imei);
      vehicle.lat = coords.lat;
      vehicle.lon = coords.lon;
    })
  );

  return NextResponse.json({ vehicles: data });
}
