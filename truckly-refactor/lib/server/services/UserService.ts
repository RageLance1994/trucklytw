import bcrypt from "bcryptjs";
import Users from "../models/User";
import Vehicles from "../models/Vehicle";
import mongoose from "mongoose";
import { serverEnv } from "../env";

const SALT_ROUNDS = serverEnv.bcryptRounds;

export const UserService = {
  async findByEmail(email: string) {
    return Users.findOne({ email }).lean();
  },

  async validatePassword(password: string, passwordHash?: string | null) {
    if (!password || !passwordHash) return false;
    try {
      return await bcrypt.compare(password, passwordHash);
    } catch (err) {
      console.error("Password comparison failed:", err);
      return false;
    }
  },

  async hashPassword(password: string) {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async getUserById(userId: string) {
    return Users.findById(userId).lean();
  },

  async getUserVehicles(userId: string) {
    const ownerValues: (string | mongoose.Types.ObjectId)[] = [userId];
    if (mongoose.Types.ObjectId.isValid(userId)) {
      ownerValues.push(new mongoose.Types.ObjectId(userId));
    }

    return Vehicles.find({
      owner: { $in: ownerValues },
    }).lean();
  },

  async getUserVehicleImeis(userId: string) {
    const ownerValues: (string | mongoose.Types.ObjectId)[] = [userId];
    if (mongoose.Types.ObjectId.isValid(userId)) {
      ownerValues.push(new mongoose.Types.ObjectId(userId));
    }

    const vehicles = await Vehicles.find({
      owner: { $in: ownerValues },
    }).lean();
    return vehicles.map((v) => v.imei);
  },

  async userOwnsVehicle(userId: string, imei: string) {
    const ownerValues: (string | mongoose.Types.ObjectId)[] = [userId];
    if (mongoose.Types.ObjectId.isValid(userId)) {
      ownerValues.push(new mongoose.Types.ObjectId(userId));
    }

    const vehicle = await Vehicles.findOne({
      imei,
      owner: { $in: ownerValues },
    }).lean();
    return !!vehicle;
  },
};
