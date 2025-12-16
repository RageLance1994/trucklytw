import {
  Schema,
  model,
  models,
  InferSchemaType,
  type Model,
} from "mongoose";

const AuthorizedSchema = new Schema(
  {
    imei: { type: String, unique: true },
    deviceModel: String,
    label: String,
  },
  { timestamps: true }
);

export type AuthorizedIMEIDocument = InferSchemaType<typeof AuthorizedSchema>;

export const AuthorizedIMEIS =
  (models.AuthorizedIMEIS as Model<AuthorizedIMEIDocument>) ||
  model<AuthorizedIMEIDocument>(
    "AuthorizedIMEIS",
    AuthorizedSchema,
    "AuthorizedIMEIS"
  );
