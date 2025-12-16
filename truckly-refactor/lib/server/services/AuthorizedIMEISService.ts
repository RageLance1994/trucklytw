import { AuthorizedIMEIS } from "../models/AuthorizedIMEIS";

export const AuthorizedIMEISService = {
  async list() {
    return AuthorizedIMEIS.find().lean();
  },

  async exists(imei: string) {
    return !!(await AuthorizedIMEIS.findOne({ imei }));
  },
};
