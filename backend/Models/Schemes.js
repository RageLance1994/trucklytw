const mongoose = require('mongoose')



const avlSchema = new mongoose.Schema({

}, { strict: false })

// Speed up history queries that filter/sort by timestamp.
avlSchema.index({ timestamp: 1 });



const getModel = (cname, schema) => {
  return (mongoose.models[cname] || mongoose.model(cname, schema, cname))
}




const VehicleSchema = new mongoose.Schema({
  nickname: { type: String, required: true, trim: true },
  imei: { type: String, required: true, unique: true },
  plateEnc: { type: String, required: true },
  brandEnc: { type: String, default: null },
  modelEnc: { type: String, default: null },
  detailsEnc: { type: String, default: null },
  tags: { type: [String], default: [] },
  owner: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    required: true,
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'At least one owner is required'
    }
  },
  status: { type: Number, enum: [0, 1, 2], default: 0 },
  codec: { type: String, default: null },
  deviceModel: { type: String, required: true }
}, { timestamps: true });



const DriverSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  surname: { type: String, required: true, trim: true },
  dateOfBirth: { type: Date, default: null },
  licenseIssuedAt: { type: Date, default: null },
  licenseExpiresAt: { type: Date, default: null },
  licenseNumber: { type: String, trim: true, default: null },
  tachoDriverId: { type: String, trim: true, default: null },
  tags: { type: [String], default: [] },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });


const SimSchema = new mongoose.Schema({
  prefix: { type: String, default: "+39" },
  number: { type: String, required: true, unique: true },
  iccid: { type: String, required: true, unique: true },
  carrier: { type: String, default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle", default: null },
  status: { type: Number, enum: [0,1,2], default: 0 }, // 0=active,1=suspended,2=archived
}, { timestamps: true });








const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  phoneEnc: { type: String, required: true },   // criptato
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  companyEnc: { type: String, default: null },    // criptato
  taxIdEnc: { type: String, required: true },   // criptato
  billingAddressEnc: { type: String, required: true }, // JSON criptato
  settingsEnc: { type: String, default: null },    // JSON criptato
  vehicles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" }],
  drivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Driver" }],
  role: { type: Number, enum: [0, 1, 2, 3], default: 1 },
  privilege: { type: Number, enum: [0, 1, 2], default: 2 }, // 0=admin,1=editor,2=readonly
  status: { type: Number, enum: [0, 1, 2], default: 0 },
  lastSessionEnc: { type: String, default: null },    // JSON criptato
}, { timestamps: true });


const fuelEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  imei: { type: String, required: true, index: true },
  type: { type: String, required: true },
  normalizedType: { type: String, required: true, index: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  startMs: { type: Number, required: true },
  endMs: { type: Number, required: true },
  startFuel: { type: Number, required: true },
  endFuel: { type: Number, required: true },
  delta: { type: Number, required: true },
  liters: { type: Number, required: true },
  durationMs: { type: Number, required: true },
  confidence: { type: Number, default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
  driverId: { type: String, default: null }
}, { timestamps: true });

fuelEventSchema.index({ startMs: 1 });
fuelEventSchema.index({ imei: 1, startMs: 1 });


const DRIVER_STATE_NAMES = ["driving", "working", "resting", "error", "unknown", "unlogged"];

const driverEventSchema = new mongoose.Schema({
  timestamp: { type: Date, required: true, index: true },
  from_state: { type: Number, required: true },
  to_state: { type: Number, required: true },
  from_state_name: { type: String, required: true, enum: DRIVER_STATE_NAMES },
  to_state_name: { type: String, required: true, enum: DRIVER_STATE_NAMES },
  eventflags: { type: [String], default: [] },
  elapsed: { type: Number, required: true },
}, { timestamps: false, versionKey: false });




const authorizedIMEISchema = new mongoose.Schema({
  imei: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  label: {
    type: String,
    default: null // nome veicolo, descrizione ecc.
  },
  deviceModel: {
    type: String,
    default: "FMC150" // modello di default
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});


const AuthorizedIMEIS = mongoose.model('AuthorizedIMEIS', authorizedIMEISchema, 'AuthorizedIMEIS');
const UserModel = mongoose.model('Users', UserSchema, 'Users');
const Vehicles = mongoose.model("Vehicle", VehicleSchema, "Vehicle");
const Drivers = mongoose.model("Drivers", DriverSchema, "Drivers");
const Sims = mongoose.model("Sims", SimSchema, "Sims");

const refuelingAttachmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  dataEnc: { type: String, required: true }
}, { _id: false });

const RefuelingSchema = new mongoose.Schema({
  imei: { type: String, required: true, index: true },
  eventId: { type: String, required: true },
  eventStart: { type: Date, required: true },
  eventEnd: { type: Date, required: true },
  liters: { type: Number, default: null },
  pricePerUnit: { type: Number, default: null },
  tankPrimary: { type: Number, default: null },
  tankSecondary: { type: Number, default: null },
  station: { type: String, default: null, trim: true },
  invoiceRef: { type: String, default: null, trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  attachments: { type: [refuelingAttachmentSchema], default: [] }
}, { timestamps: true });

RefuelingSchema.index({ imei: 1, eventId: 1 }, { unique: true });
RefuelingSchema.index({ imei: 1, eventStart: 1 });

const getRefuelingModel = (imei) => {
  if (!imei) throw new Error('IMEI richiesto per modello refueling');
  const collectionName = `${imei}_refuelings`;
  return getModel(collectionName, RefuelingSchema);
};

module.exports = {
  getModel,
  getRefuelingModel,
  avlSchema,
  AuthorizedIMEIS,
  Vehicles, VehicleSchema,
  Drivers, DriverSchema,
  Sims, SimSchema,
  UserModel,
  RefuelingSchema,
  driverEventSchema,fuelEventSchema
}
