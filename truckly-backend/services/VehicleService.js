import Vehicles from "../models/Vehicle.js";
import { decryptString } from "../utils/encryption.js";

export const VehicleService = {

  async listAll() {
    const rows = await Vehicles.find().lean();
    return rows.map(v => this._decorate(v));
  },

  async listByUser(userId) {
    const rows = await Vehicles.find({ owner: userId }).lean();
    return rows.map(v => this._decorate(v));
  },

  async getByImei(imei) {
    const v = await Vehicles.findOne({ imei }).lean();
    return v ? this._decorate(v) : null;
  },

  _decorate(v) {
    const safeDecrypt = (value) => value ? decryptString(value) : "";

    return {
      ...v,
      plate: safeDecrypt(v.plateEnc),
      brand: safeDecrypt(v.brandEnc),
      model: safeDecrypt(v.modelEnc),
      details: safeDecrypt(v.detailsEnc),
    };
  }
};
