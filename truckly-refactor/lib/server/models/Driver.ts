import {
  Schema,
  model,
  models,
  InferSchemaType,
  type Model,
} from "mongoose";

const DriverSchema = new Schema({
  driverId: String,
  name: String,
  surname: String,
  cardNumber: String,
  associatedVehicles: [String],
  associatedUser: { type: Schema.Types.ObjectId, ref: "Users" },
});

export type DriverDocument = InferSchemaType<typeof DriverSchema>;

export default (models.Drivers as Model<DriverDocument>) ||
  model<DriverDocument>("Drivers", DriverSchema, "drivers");
