import Drivers from "../models/Driver";

export const DriverService = {
  async listByUser(userId: string) {
    return Drivers.find({ associatedUser: userId }).lean();
  },

  async get(driverId: string) {
    return Drivers.findById(driverId).lean();
  },
};
