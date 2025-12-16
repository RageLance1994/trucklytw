import mongoose, { Schema } from "mongoose";

export function getModel<T extends mongoose.Document>(
  name: string,
  schema: Schema
) {
  return (mongoose.models[name] as mongoose.Model<T>) || mongoose.model(name, schema, name);
}

export const getRefuelingModel = getModel;
