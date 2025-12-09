import mongoose from "mongoose";

export function getModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema, name);
}

export function getRefuelingModel(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema, name);
}
