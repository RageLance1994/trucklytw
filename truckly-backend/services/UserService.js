import bcrypt from "bcryptjs";
import Users from "../models/User.js";
import Vehicles from "../models/Vehicle.js";

const SALT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

export const UserService = {

  async findByEmail(email) {
    return Users.findOne({ email }).lean();
  },

  async validatePassword(password, passwordHash) {
    if (!password || !passwordHash) return false;

    try {
      return await bcrypt.compare(password, passwordHash);
    } catch (err) {
      console.error("Password comparison failed:", err);
      return false;
    }
  },

  async hashPassword(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  },

  async getUserById(userId) {
    return Users.findById(userId).lean();
  },

  async getUserVehicles(userId) {
    return Vehicles.find({ owner: userId }).lean();
  },

  async getUserVehicleImeis(userId) {
    const vehicles = await Vehicles.find({ owner: userId }).lean();
    return vehicles.map((v) => v.imei);
  },

  async userOwnsVehicle(userId, imei) {
    const vehicle = await Vehicles.findOne({ imei, owner: userId }).lean();
    return !!vehicle;
  }
};
