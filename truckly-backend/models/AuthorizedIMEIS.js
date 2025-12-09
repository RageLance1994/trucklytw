import mongoose from "mongoose";

const authorizedSchema = new mongoose.Schema({
  imei: { type: String, unique: true },
  deviceModel: String,
  label: String,
}, { timestamps: true });

export const AuthorizedIMEIS =
  mongoose.models.AuthorizedIMEIS ||
  mongoose.model("AuthorizedIMEIS", authorizedSchema, "AuthorizedIMEIS");
