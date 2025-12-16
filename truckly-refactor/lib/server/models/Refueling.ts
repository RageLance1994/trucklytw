import { Schema } from "mongoose";

export const refuelingSchema = new Schema(
  {
    from: String,
    to: String,
    liters: Number,
    timestamp: Date,
  },
  { timestamps: true }
);

export const refuelEventsSchema = new Schema(
  {
    imei: String,
    events: [refuelingSchema],
  },
  { timestamps: true }
);
