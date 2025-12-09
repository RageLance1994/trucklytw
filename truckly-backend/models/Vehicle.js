import mongoose from "mongoose";

const VehicleSchema = new mongoose.Schema({
  imei: { type: String, required: true, unique: true },
  nickname: { type: String, required: true },
  plateEnc: String,
  brandEnc: String,
  modelEnc: String,
  detailsEnc: String,
  tags: { type: [String], default: [] },
  owner: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  codec: String,
  status: Number,
  deviceModel: String,
}, { timestamps: true });

export default mongoose.models.Vehicles ||
  mongoose.model("Vehicles", VehicleSchema, "vehicles");
