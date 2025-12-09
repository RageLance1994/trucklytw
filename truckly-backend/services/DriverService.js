import Drivers from "../models/Driver.js";

export const DriverService = {

  async listByUser(userId) {
    return Drivers.find({ associatedUser: userId }).lean();
  },

  async get(driverId) {
    return Drivers.findById(driverId).lean();
  }
};
