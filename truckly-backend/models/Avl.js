import mongoose from "mongoose";

export const avlSchema = new mongoose.Schema({
  imei: String,
  type: String,
  timestamp: Date,
  eventId: Number,
  gps: {
    latitude: Number,
    longitude: Number,
    altitude: Number,
    angle: Number,
    satellites: Number,
    speed: Number,
  },
  io: {},
}, { strict: false });
