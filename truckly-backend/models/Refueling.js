import mongoose from "mongoose";

const refuelingSchema = new mongoose.Schema({
  from: String,
  to: String,
  liters: Number,
  timestamp: Date,
}, { timestamps: true });

const refuelEventsSchema = new mongoose.Schema({
  imei: String,
  events: [refuelingSchema],
}, { timestamps: true });

export { refuelingSchema, refuelEventsSchema };
