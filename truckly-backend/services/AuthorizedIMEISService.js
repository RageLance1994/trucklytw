import { AuthorizedIMEIS } from "../models/AuthorizedIMEIS.js";

export const AuthorizedIMEISService = {
  async list() {
    return AuthorizedIMEIS.find().lean();
  },

  async exists(imei) {
    return !!(await AuthorizedIMEIS.findOne({ imei }));
  }
};
