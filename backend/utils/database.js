const mongoose = require('mongoose')
const MONGO_URL = `mongodb://${process.env.MONGO_ROOT_USER}:${process.env.MONGO_ROOT_PASSWORD}@${process.env.MONGO_HOSTS}/?authSource=admin`
const Models = require('../Models/Schemes')
const { AuthorizedIMEIS } = Models
const { encryptString, encryptJSON, decryptString, decryptJSON } = require('./encryption')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken');



async function startDatabases() {
    //CONNECT TO DB FIRST.
    try {
        var db = mongoose.connection
        db.on('connecting', () => {
            console.log(`||==|| --> DB Entered connecting state.`)
        })
        db.on('error', (err) => {
            console.log(`||==|| --> DB Encountered an error. Restarting.`)
            setTimeout(() => {
                mongoose.disconnect()
            }, 5000)
        })
        db.once('open', function () {
            console.log('||==|| --> MongoDB connection opened!');
        });
        db.on('reconnected', function () {
            console.log('||==|| --> MongoDB reconnected!');
        });
        db.on('disconnected', function () {
            console.log('||==|| --> MongoDB disconnected!');
            setTimeout(() => {
                mongoose.connect(MONGO_URL);

            }, 5000)
        });
        console.log(MONGO_URL)
        var mainConnection = await mongoose.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
        console.log(`||==|| --> Succesfully connected to ${mainConnection.connections[0].name}`)
        var maxTime = 15000;
        return (true)
    }
    catch (e) {
        console.log(e)
    }
}



class Organizations {
    constructor(parameters) {

    }
}

class Organization {
    constructor(parameters) {

    }
}

class Users {
    constructor() {
        this.model = Models.UserModel;
    }

    async list() {
        return await this.model.find({});
    }

    async new(
        firstName,
        lastName,
        phone,
        email,
        password,
        companyId,
        role = 1,
        status = 0,
        privilege = 2,
        allowedVehicleIds = [],
        allowedVehicleIdsMode = "include",
        allowedVehicleTags = [],
        allowedVehicleTagsMode = "include"
    ) {
        try {
            const passwordHash = await bcrypt.hash(password, 10);

            const user = {
                firstName,
                lastName,
                phoneEnc: encryptString(phone),
                email,
                passwordHash,
                companyId,
                vehicles: [],
                drivers: [],
                role,
                privilege,
                allowedVehicleIds,
                allowedVehicleIdsMode,
                allowedVehicleTags,
                allowedVehicleTagsMode,
                status,
                lastSession: {
                    ip: "127.0.0.1",
                    loginAt: new Date()
                }
            }

            return await this.model.create(user)
        } catch (err) {
            console.error("Errore creazione utente:", err);
            throw err;
        }
    }

    async get(filter) {
        // 1. Email

        if (typeof filter === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(filter)) {

            var result = await this.model.findOne({ email: filter.toLowerCase().trim() });
            if (!result) return (null);
            const user = new User(result._id)
            await user.init();
            return (user);
        }

        // 2. ObjectId
        if (mongoose.Types.ObjectId.isValid(filter)) {

            var result = await this.model.findById(filter);
            if (!result) return (null);
            const user = new User(result._id)
            await user.init();
            return (user);

        }

        // 3. JWT
        try {

            const decoded = jwt.verify(filter, process.env.JWT_SECRET);
            if (decoded && decoded.id) {
                var result = await this.model.findById(decoded.id);
                if (!result) return (null);
                const user = new User(result._id)
                await user.init();
                return (user);

            }
        } catch (err) {
            // se non è valido, ignora
            return null;
        }

        // nessuna corrispondenza
        return null;
    }

}
class User {
    constructor(id) {
        this.id = id;
        this.root = null;
        this.vehicles = null; // verrà montato in init()
    }

    async init() {
        this.root = await Models.UserModel.findById(this.id);
        Object.keys(this.root._doc).map((k) => {
            this[k] = this.root._doc[k];
        });

        // monta oggetto vehicles
        this.vehicles = {
            list: this.listVehicles.bind(this),
            get: this.getVehicle.bind(this),
            create: this.createVehicle.bind(this),
            delete: this.deleteVehicle.bind(this),
            watch: this.watchVehicles.bind(this)
        };
    }

    getPrivilegeLevel() {
        if (Number.isInteger(this.role)) return this.role;
        if (Number.isInteger(this.privilege)) return this.privilege;
        return 2;
    }

    canManageVehicles() {
        return this.getPrivilegeLevel() === 0;
    }

    // -------------------------------
    // Vehicles API
    async listVehicles() {
        const privilegeLevel = this.getPrivilegeLevel();
        const allowedIds = Array.isArray(this.allowedVehicleIds)
            ? this.allowedVehicleIds.map((id) => String(id).trim()).filter(Boolean)
            : [];
        const allowedIdsMode = this.allowedVehicleIdsMode === 'exclude' ? 'exclude' : 'include';
        const allowedTags = Array.isArray(this.allowedVehicleTags)
            ? this.allowedVehicleTags.map((tag) => String(tag).trim()).filter(Boolean)
            : [];
        const allowedMode = this.allowedVehicleTagsMode === 'exclude' ? 'exclude' : 'include';
        let res = [];

        if (privilegeLevel === 0) {
            res = await Models.Vehicles.find({}).lean();
        } else if (privilegeLevel >= 3) {
            if (!this.companyId) {
                return [];
            }
            const owners = await Models.UserModel.find({ companyId: this.companyId }, { _id: 1 }).lean();
            const ownerIds = owners.map((user) => user._id);
            if (allowedIds.length) {
                const normalizedIds = allowedIds
                    .filter((id) => mongoose.Types.ObjectId.isValid(id))
                    .map((id) => new mongoose.Types.ObjectId(id));
                if (!normalizedIds.length) {
                    return [];
                }
                if (allowedIdsMode === 'exclude') {
                    res = await Models.Vehicles.find({
                        owner: { $in: ownerIds },
                        _id: { $nin: normalizedIds }
                    }).lean();
                } else {
                    res = await Models.Vehicles.find({
                        owner: { $in: ownerIds },
                        _id: { $in: normalizedIds }
                    }).lean();
                }
            } else if (!allowedTags.length) {
                if (allowedMode === 'exclude') {
                    res = await Models.Vehicles.find({ owner: { $in: ownerIds } }).lean();
                } else {
                    return [];
                }
            } else if (allowedMode === 'exclude') {
                res = await Models.Vehicles.find({
                    owner: { $in: ownerIds },
                    tags: { $nin: allowedTags }
                }).lean();
            } else {
                res = await Models.Vehicles.find({
                    owner: { $in: ownerIds },
                    tags: { $in: allowedTags }
                }).lean();
            }
        } else if (this.companyId) {
            const owners = await Models.UserModel.find({ companyId: this.companyId }, { _id: 1 }).lean();
            const ownerIds = owners.map((user) => user._id);
            res = await Models.Vehicles.find({ owner: { $in: ownerIds } }).lean();
        } else {
            res = await Models.Vehicles.find({ owner: this.id }).lean();
        }
        res.forEach((v) => {
            Object.keys(v).filter(element => element.includes('Enc')).map((k) => {
                var newKey = k.split('Enc')[0]
                v[newKey] = decryptJSON(v[k]);
                delete v[k];

            })

        })

        return res;
    }

    async getVehicle(filter) {
        if (mongoose.Types.ObjectId.isValid(filter)) {
            return await Models.Vehicles.findOne({ _id: filter, owner: this.id });
        }
        // ricerca per campi testuali criptati
        return await Models.Vehicles.findOne({
            owner: this.id,
            $or: [
                { plateEnc: encryptString(filter) },
                { brandEnc: encryptString(filter) },
                { modelEnc: encryptString(filter) }
            ]
        });
    }

    async createVehicle({ nickname, plate, brand, model, imei, codec, deviceModel, tags = [], details = {}, ownerIds = [] }) {
        try {
            if (!this.canManageVehicles()) {
                const err = new Error('PERMISSION_DENIED');
                err.code = 'PERMISSION_DENIED';
                throw err;
            }

            const resolvedOwners = Array.isArray(ownerIds) && ownerIds.length
                ? ownerIds
                : [this.id];

            const info = {
                owner: resolvedOwners,
                nickname,
                imei,
                plateEnc: encryptString(plate),
                brandEnc: encryptString(brand),
                modelEnc: encryptString(model),
                detailsEnc: encryptJSON(details),
                deviceModel,
                codec,
                tags
            }
            console.log(info)
            const vehicle = await Models.Vehicles.create(info);

            // aggiorna lista veicoli degli owner
            await Models.UserModel.updateMany(
                { _id: { $in: resolvedOwners } },
                { $addToSet: { vehicles: vehicle._id } }
            );

            return vehicle;
        }
        catch (err) {
            if (err.code === 'PERMISSION_DENIED') {
                throw err;
            }
            setTimeout(() => {
                console.log(`[user.createVehicle] => Impossibile creare veicolo, veicolo già esistente.`, err)
            }, 1500)
            return (null);
        }
    }

    async deleteVehicle(id) {
        const deleted = await Models.Vehicles.findOneAndDelete({ _id: id, owner: this.id });
        if (deleted) {
            await Models.UserModel.findByIdAndUpdate(this.id, { $pull: { vehicles: id } });
        }
        return deleted;
    }

    async watchVehicles(callback = Function) {
        const watcher = Models.Vehicles.watch([{ $match: { "fullDocument.owner": this.id } }]);
        watcher.on("change", (change) => {
            callback(change.fullDocument);
        });
        return watcher;
    }

    async clearVehicles() {
        try {
            // prendi tutti i veicoli dell'utente
            const vehicles = await Models.Vehicles.find({ owner: this.id });

            // deauthorize tutti gli imei
            for (const v of vehicles) {
                if (v.imei) {
                    console.log(`[clearVehicles] => Removed vehicle with imei ${v.imei} `)
                    await _Devices.unauthorize(v.imei);
                    await Models.Vehicles.findOneAndDelete({ imei: v.imei })
                }
            }

            // elimina tutti i veicoli dal DB
            await Models.Vehicles.deleteMany({ owner: this.id });

            // svuota l’array vehicles sull’utente
            await Models.UserModel.findByIdAndUpdate(this.id, { $set: { vehicles: [] } });

            console.log(`[User ${this.id}] => Veicoli rimossi e IMEI deautorizzati.`);

            return true;
        } catch (err) {
            console.error(`[User.clearVehicles] => Errore:`, err);
            return false;
        }
    }


    // -------------------------------
    // Cookie helpers (rimangono)
    // -------------------------------
    // Cookie helpers (restore)
    cookie(res, req) {
        try {
            // genera JWT valido per 30 giorni
            const token = jwt.sign(
                { id: this.id, email: this.email },
                process.env.JWT_SECRET,
                { expiresIn: '30d' }
            );

            const host = req?.hostname || '';
            const isLocalhost = host === 'localhost' || host === '127.0.0.1';
            const isPrivateIp = /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
            const isHttps = !!(req?.secure || req?.headers?.['x-forwarded-proto'] === 'https');
            // Only mark Secure when request is actually HTTPS; allow plain HTTP for localhost/LAN dev
            const secure = isHttps;

            // imposta cookie sicuro e HTTP-only
            res.cookie('auth_token', token, {
                httpOnly: true,
                secure,
                sameSite: 'lax',
                path: '/',
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 giorni
            });

            console.log(`[User.cookie] => Cookie impostato per ${this.email}`);
            return token;
        } catch (err) {
            console.error('[User.cookie] => Errore impostazione cookie:', err);
            return null;
        }
    }

    uncookie(res, req) {
        try {
            const host = req?.hostname || '';
            const isHttps = !!(req?.secure || req?.headers?.['x-forwarded-proto'] === 'https');
            const secure = isHttps;

            res.clearCookie('auth_token', {
                httpOnly: true,
                secure,
                sameSite: 'lax',
                path: '/'
            });
            console.log(`[User.uncookie] => Cookie rimosso per ${this.email}`);
            return true;
        } catch (err) {
            console.error('[User.uncookie] => Errore rimozione cookie:', err);
            return false;
        }
    }

}



class Devices {
    constructor(parameters) {
    }

    async isAuthorized(imei) {

        return (
            await AuthorizedIMEIS.findOne({ imei })
        )
    }

    async authorize(imei, { label = null, deviceModel = "FMC150" } = {}) {
        const exists = await AuthorizedIMEIS.findOneAndUpdate(
            { imei },
            { imei, label, deviceModel },
            { upsert: true, new: true }
        );

        console.log(`[Devices -> ${imei}] => Device authorized with model ${exists.deviceModel}`);
        return exists;
    }

    async unauthorize(imei) {
        return await AuthorizedIMEIS.findOneAndDelete({ imei });
    }

    async unauthorize(imei) {
        let res = await AuthorizedIMEIS.findOneAndDelete({ imei });


    }
}


class Device {
    constructor(imei) {
        this.imei = imei
        this.mname = `${imei}_monitoring`
        this.model = Models.getModel(this.mname, Models.avlSchema, this.mname);
        this.watcher = null;
    }

    async listen(callback = Function) {
        this.watcher = this.model.watch()
        if (this.watcher) {
            console.log(`[${this.imei}] => Watcher opened at timestamp ${new Date().toISOString()}`)
            this.watcher.on('change', (change) => {
                callback(change.fullDocument);

            })
        }

    }


    async count(from, to) {

        const total = await this.model.countDocuments({
            timestamp: { $gt: new Date(from), $lte: new Date(to) }
        });
        return (total)
    }

    async history(from, to, BIN_SIZE = 60) {
        //  BIN_SIZE = seconds per bucket (60 = 1 min, 120 = 2 min)
        const pipeline = [
            {
                $match: { timestamp: { $gt: new Date(from), $lte: new Date(to) } }
            },
            {
                $group: {
                    _id: {
                        bucket: {
                            $dateTrunc: {
                                date: "$timestamp",
                                unit: "second",
                                binSize: BIN_SIZE
                            }
                        }
                    },
                    avgSpeed: { $avg: { $ifNull: ["$io.vehicleSpeed", "$gps.Speed"] } },
                    avgAnalog: { $avg: "$io.analogInput1" },
                    movement: { $last: "$io.movement" },
                    ignition: { $last: "$io.ignition" },
                    lastGPS: { $last: "$gps" },
                    lastTimestamp: { $last: "$timestamp" }
                }
            },
            { $sort: { timestamp: 1 } }
        ];

        const docs = await this.model.aggregate(pipeline).allowDiskUse(true);
        if (!Array.isArray(docs) || docs.length === 0) return [];

        const SPEED_THR = 5; // km/h threshold for moving
        const MOVING_INTERVAL_MS = 30 * 1000; // keep every 30s while moving
        const isStopped = (d) => {
            const v = Number(d?.gps?.Speed ?? d?.io?.speed ?? 0);
            const ig = Number(d?.io?.ignition ?? 0);
            const mv = Number(d?.io?.movement ?? 0);
            return v <= SPEED_THR && ig === 0 && mv === 0;
        };

        const out = [];
        let lastKeptTs = 0;
        let inStop = false;
        let stopStartIdx = -1;

        for (let i = 0; i < docs.length; i++) {
            const d = docs[i];
            const ts = new Date(d.timestamp).getTime();
            const stopped = isStopped(d);

            if (i === 0) {
                out.push(d);
                lastKeptTs = ts;
                inStop = stopped;
                if (stopped) stopStartIdx = i;
                continue;
            }

            const prev = docs[i - 1];
            const prevStopped = isStopped(prev);

            // stato cambiato → tieni boundary
            if (stopped !== prevStopped) {
                if (out[out.length - 1] !== prev) out.push(prev);
                out.push(d);
                lastKeptTs = ts;
                inStop = stopped;
                stopStartIdx = stopped ? i : -1;
                continue;
            }

            if (stopped) {
                out.push(d);
                lastKeptTs = ts;
            } else {
                if (ts - lastKeptTs >= MOVING_INTERVAL_MS) {
                    out.push(d);
                    lastKeptTs = ts;
                }
            }
        }

        const last = docs[docs.length - 1];
        if (out[out.length - 1]?.timestamp !== last?.timestamp) out.push(last);

        return out;
    }


    async mute() {
        this.watcher.close();
        console.log(`[${this.imei}] => Watcher closed at timestamp ${new Date().toISOString()}`)
    }

    async lastKnown() {
        return (
            await this.model.findOne({})
                .sort({ timestamp: -1 })
                .lean()
        )
    }
}

class Sims {
    constructor() {
        this.model = Models.Sims;
    }

    async new({ prefix, number, iccid, carrier = null }) {
        try {
            const sim = await this.model.create({ prefix, number, iccid, carrier });
            const simInstance = new Sim(sim._id);
            await simInstance.init();
            return simInstance;
        } catch (err) {
            console.error("[Sims.new] => Errore creazione SIM:", err);
            return null;
        }
    }

    async get(filter) {
        let simDoc = null;
        if (mongoose.Types.ObjectId.isValid(filter)) {
            simDoc = await this.model.findById(filter);
        } else {
            simDoc = await this.model.findOne({
                $or: [{ number: filter }, { iccid: filter }]
            });
        }
        if (!simDoc) return null;
        const simInstance = new Sim(simDoc._id);
        await simInstance.init();   // init qui 👍
        return simInstance;
    }

    async delete(id) {
        return await this.model.findByIdAndDelete(id);
    }
}

class Sim {
    constructor(id) {
        this.id = id;
        this.root = null;
    }

    async init() {
        this.root = await Models.Sims.findById(this.id);
    }

    async update(data) {
        this.root = await Models.Sims.findByIdAndUpdate(this.id, data, { new: true });
        return this.root;
    }

    async sendInfo(payload) {
        console.log(`[Sim ${this.id}] Sending info:`, payload);
        // eventuale logica API/queue
        return true;
    }

    async getInfo() {
        if (!this.root) await this.init();
        return this.root;
    }
}


class Vehicles {
    constructor() {

    }

    async get(imei) {
        var raw = await Models.Vehicles.findOne({ imei }).lean();



        var encObjects = Object.keys(raw).filter(element => element.includes('Enc'))
        encObjects.map((k) => {
            var newKey = k.split('Enc')[0];
            raw[newKey] = decryptJSON(raw[k]);
            delete raw[k];
        })

        return (raw)
    }
}

class Driver {
    constructor(id) {
        this.id = id;
        this.init;
        this.cname = `driver_${this.id}_history`
        this.model = Models.getModel(this.cname, Models.driverEventSchema, this.cname);

    }

    async history(from, to) {
        return (await this.model.find({ timestamp: { $gte: from, $lte: to } }))
    }

    getCurrentWeekStart(referenceTs) {
        const ref = Number.isFinite(referenceTs) ? new Date(referenceTs) : new Date();
        const day = ref.getDay();
        const diff = (day + 6) % 7; // lunedì=0
        const monday = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
        monday.setDate(monday.getDate() - diff);
        return monday.getTime();
    }

    async relevanthistory() {

        var a = this.getCurrentWeekStart(new Date().getTime() - this.week_ms);
        var b = new Date().getTime();


        var events = await this.model.find({ timestamp: { $gte: a, $lte: b } })
        return (events);


    }


}

class Drivers {
    constructor() {

    }

    get(id) {
        return (new Driver(id))
    }
}



const _Devices = new Devices();
const _Users = new Users();
const _Vehicles = new Vehicles();
const _Drivers = new Drivers();




// Temporary helper to seed tank information for a specific vehicle.
// Uncomment the invocation at the bottom of the block to run once, then remove.
async function __tmpSeedTankInfoFor864275071761426() {
    const targetImei = '864275071761426';
    try {
        const vehicle = await Models.Vehicles.findOne({ imei: targetImei });
        if (!vehicle) {
            console.warn(`[seedTankInfo] Vehicle with IMEI ${targetImei} not found.`);
            return;
        }

        let details = {};
        if (vehicle.detailsEnc) {
            try {
                details = decryptJSON(vehicle.detailsEnc) || {};
            } catch (err) {
                console.warn('[seedTankInfo] Failed to decrypt existing details, proceeding with fresh payload.', err);
                details = {};
            }
        }

        details.tanks = Object.assign({}, details.tanks, {
            primary: {
                capacity: 710,
                unit: 'litres'
            }
        });

        if (details.tanks?.secondary) {
            delete details.tanks.secondary;
        }

        await Models.Vehicles.findOneAndUpdate(
            { imei: targetImei },
            { $set: { detailsEnc: encryptJSON(details) } },
            { new: true }
        );

        console.log(`[seedTankInfo] Updated tank configuration for IMEI ${targetImei}.`);
    } catch (err) {
        console.error('[seedTankInfo] Unable to update tank info.', err);
    }
}
// __tmpSeedTankInfoFor864275071761426();

setTimeout(() => {
    Models.Vehicles.findOne({ imei: '867747077369724' }).then((data, err) => {
    
        console.log(data.detailsEnc);

    })
}, 2500)

module.exports = {
    startDatabases,
    _Devices, Device,
    _Users, User,
    _Vehicles,
    _Drivers, Driver,
}
