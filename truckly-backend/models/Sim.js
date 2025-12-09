import mongoose from "mongoose";

const SimSchema = new mongoose.Schema({
  phoneNumber: String,
  iccid: String,
  provider: String,
  assignedTo: String,
}, { timestamps: true });

export default mongoose.models.Sims ||
  mongoose.model("Sims", SimSchema, "sims");
