import mongoose from "mongoose";

const DriverSchema = new mongoose.Schema({
  driverId: String,
  name: String,
  surname: String,
  cardNumber: String,
  associatedVehicles: [String],
});

export default mongoose.models.Drivers ||
  mongoose.model("Drivers", DriverSchema, "drivers");
