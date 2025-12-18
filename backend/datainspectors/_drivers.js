const fs = require('fs');

require('dotenv').config()
const { getModel, avlSchema } = require('../Models/Schemes')

class DriverAnalyst {
    constructor() {

    }

    async buildHistory(imei, driverid, from, to) {
        const cname = `${imei}_monitoring`;
        const model = getModel(cname, avlSchema);

        const records = await model.find({
            timestamp: { $gte: from, $lte: to },
            $or: [
                { "io.driver1Id": driverid, "io.driver1WorkingState": { $nin: [null, 0] } },
                { "io.driver2Id": driverid, "io.driver2WorkingState": { $nin: [null, 0] } }
            ]
        })
            .sort({ timestamp: 1 })
            .select({
                timestamp: 1,
                "io.driver1WorkingState": 1,
                "io.driver2WorkingState": 1,
                "io.driver1CardPresence": 1,
                "io.driver2CardPresence": 1,
                "io.driver1Id": 1,
                "io.driver2Id": 1,
            })
            .lean();

        if (!records.length) return [];

        const states = [];
        let latest = records.at(-1);
        records.sort((a, b) => b.timestamp - a.timestamp);
        states.push(latest);

        let _hasMore = true;

        while (_hasMore) {
            const next = records.find(record => {
                if (record.timestamp >= latest.timestamp) return false;

                const isD1 = record.io.driver1Id === driverid;
                const current = isD1
                    ? record.io.driver1WorkingState
                    : record.io.driver2WorkingState;
                const previous = isD1
                    ? latest.io.driver1WorkingState
                    : latest.io.driver2WorkingState;


                const valid = current != previous && Math.abs(new Date(record.timestamp).getTime() - new Date(latest.timestamp).getTime() ) > 60 * 60 * 1000;  
                

                // accetta solo cambi puri 1↔3
                return valid;
            });

            if (!next) {
                _hasMore = false;
                break;
            }

            states.push(next);
            latest = next;
            _hasMore = new Date(latest.timestamp) > from;
        }

        return states;
    }






}

const da = new DriverAnalyst();
var stop = new Date();
var start = new Date(stop.getTime() - 15 * 24 * 60 * 60 * 1000);

da.buildHistory('864275071761426', 'I100000569493003', start, stop).then((data, err) => {
    if (!err) {
        fs.writeFileSync('states.json', JSON.stringify(data));
    }
})


module.exports = {
    da, DriverAnalyst
}