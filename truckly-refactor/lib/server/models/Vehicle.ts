import {
  Schema,
  model,
  models,
  InferSchemaType,
  type Model,
} from "mongoose";

const VehicleSchema = new Schema(
  {
    imei: { type: String, required: true, unique: true },
    nickname: { type: String, required: true },
    plateEnc: String,
    brandEnc: String,
    modelEnc: String,
    detailsEnc: String,
    tags: { type: [String], default: [] },
    owner: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    codec: String,
    status: Number,
    deviceModel: String,
  },
  { timestamps: true }
);

export type VehicleDocument = InferSchemaType<typeof VehicleSchema>;

const MODEL_NAME = "Vehicle";
const COLLECTION_NAME = "Vehicle";

export default (models[MODEL_NAME] as Model<VehicleDocument>) ||
  model<VehicleDocument>(MODEL_NAME, VehicleSchema, COLLECTION_NAME);
