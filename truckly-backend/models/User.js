import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  emailEnc: String,
  phoneEnc: String,
  fullNameEnc: String,
  addressEnc: String,
  companyEnc: String,
  taxIdEnc: String,

  passwordHash: String,
  role: { type: String, default: "user" },

  vehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vehicles" }],
  drivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Drivers" }],
}, { timestamps: true });

export default mongoose.models.Users ||
  mongoose.model("Users", UserSchema, "Users");
