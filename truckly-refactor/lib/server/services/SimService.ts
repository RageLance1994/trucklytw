import Sims from "../models/Sim";

export const SimService = {
  async list() {
    return Sims.find().lean();
  },

  async getById(id: string) {
    return Sims.findById(id).lean();
  },
};
