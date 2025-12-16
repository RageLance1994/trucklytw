import {
  Schema,
  model,
  models,
  InferSchemaType,
  type Model,
} from "mongoose";

const SimSchema = new Schema(
  {
    phoneNumber: String,
    iccid: String,
    provider: String,
    assignedTo: String,
  },
  { timestamps: true }
);

export type SimDocument = InferSchemaType<typeof SimSchema>;

export default (models.Sims as Model<SimDocument>) ||
  model<SimDocument>("Sims", SimSchema, "sims");
