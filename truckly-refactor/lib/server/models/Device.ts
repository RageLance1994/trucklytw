import {
  Schema,
  model,
  models,
  InferSchemaType,
  type Model,
} from "mongoose";

const DeviceSchema = new Schema({
  imei: String,
  serial: String,
  config: Object,
  simNumber: String,
});

export type DeviceDocument = InferSchemaType<typeof DeviceSchema>;

export default (models.Device as Model<DeviceDocument>) ||
  model<DeviceDocument>("Device", DeviceSchema);
