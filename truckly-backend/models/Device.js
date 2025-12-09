import mongoose from "mongoose";

const DeviceSchema = new mongoose.Schema({
  imei: String,
  serial: String,
  config: Object,
  simNumber: String,
});

export default mongoose.models.Device || mongoose.model("Device", DeviceSchema);
