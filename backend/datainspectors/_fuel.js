const Models = require('../Models/Schemes')
const fs = require('fs')
const { getModel, avlSchema } = require('../Models/Schemes')
const { _Vehicles } = require('../utils/database')

var totalProcessed = 0; 

class FuelAnalyst {
    constructor() {

    }


}



const fa = new FuelAnalyst()
const stop = new Date().getTime();
const start = new Date(stop - (stop % 86400000) - 10 * 24 * 60 * 60 * 1000)


module.exports = {
    fa,
    FuelAnalyst
}
