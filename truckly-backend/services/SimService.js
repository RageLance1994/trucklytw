import Sims from "../models/Sim.js";

export const SimService = {
  async list() {
    return Sims.find().lean();
  },

  async getById(id) {
    return Sims.findById(id).lean();
  }
};
