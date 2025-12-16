import Vehicles, { type VehicleDocument } from "../models/Vehicle";
import mongoose from "mongoose";
import { decryptString, decryptJSON } from "../crypto";

type VehicleRecord = VehicleDocument & {
  plateEnc?: string | null;
  brandEnc?: string | null;
  modelEnc?: string | null;
  detailsEnc?: string | null;
};

type DecoratedVehicle = VehicleRecord & {
  plate: string;
  brand: string;
  model: string;
  details: unknown;
};

export const VehicleService = {
  async listAll() {
    const rows = await Vehicles.find({}).lean<VehicleRecord[]>();
    return rows.map((v) => this.decorate(v));
  },

  async listByUser(userId: string) {
    const ownerValues: (string | mongoose.Types.ObjectId)[] = [userId];
    if (mongoose.Types.ObjectId.isValid(userId)) {
      ownerValues.push(new mongoose.Types.ObjectId(userId));
    }

    const rows = await Vehicles.find({
      owner: { $in: ownerValues },
    }).lean<VehicleRecord[]>();
    return rows.map((v) => this.decorate(v));
  },

  async getByImei(imei: string) {
    const vehicle = await Vehicles.findOne({ imei }).lean<VehicleRecord | null>();
    return vehicle ? this.decorate(vehicle) : null;
  },

  decorate(v: VehicleRecord): DecoratedVehicle {
    const safeDecrypt = (value?: string | null) => {
      if (!value) return "";
      try {
        return decryptString(value);
      } catch (err) {
        return "";
      }
    };

    const result: any = { ...v };

    Object.keys(result).forEach((key) => {
      if (!key.endsWith("Enc") || typeof result[key] !== "string") return;
      const base = key.slice(0, -3);
      const targetKey = base.charAt(0).toLowerCase() + base.slice(1);

      if (key === "detailsEnc") {
        try {
          result[targetKey] = decryptJSON(result[key]);
        } catch {
          result[targetKey] = {};
        }
      } else {
        result[targetKey] = safeDecrypt(result[key]);
      }
    });

    return result;
  },
};
