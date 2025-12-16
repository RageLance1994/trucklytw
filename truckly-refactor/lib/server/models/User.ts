import {
  Schema,
  model,
  models,
  InferSchemaType,
  type Model,
} from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    emailEnc: String,
    phoneEnc: String,
    fullNameEnc: String,
    addressEnc: String,
    companyEnc: String,
    taxIdEnc: String,
    passwordHash: String,
    role: { type: String, default: "user" },
    vehicles: [{ type: Schema.Types.ObjectId, ref: "Vehicles" }],
    drivers: [{ type: Schema.Types.ObjectId, ref: "Drivers" }],
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof UserSchema>;

export default (models.Users as Model<UserDocument>) ||
  model<UserDocument>("Users", UserSchema, "Users");
