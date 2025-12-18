const axios = require('axios');


const TachoSync = new class {
    constructor() {
        this.baseurl = "https://api.tacho.teltonika.lt/v1"
    }

    test() {
        console.log(this.baseurl)
    }

    async drivers(companyId) {
        var res = await axios.get(`${this.baseurl}/Drivers?PageNumber=1&PageSize=100&CompanyId=${companyId}`, {
            headers: {
                "X-Api-Key": process.env.TACHO_APIKEY
            }
        })
        return (res.data.items);


    }

    async companies() {
        var res = await axios.get(`${this.baseurl}/Companies`, {
            headers: {
                "X-Api-Key": process.env.TACHO_APIKEY
            }
        })

        var companies = []
        console.clear()

        if (Array.isArray(res.data)) {
            res.data.forEach((company) => {
                companies.push(company);
                if (company.childCompanies.length) {
                    company.childCompanies.forEach((c) => { companies.push(c) })
                }
            });
        }
        else{
            companies.push(res.data); 
            if(res.data.childCompanies.length){
                res.data.childCompanies.forEach((c) => { companies.push(c) })
            }
        }


        return (companies);
    }

    async get(url, params) {
        await axios.get(url)
    }


    async getDriver(id){
        var cs = await this.companies(); 
        var drivers = await Promise.all(cs.map(async(c) => {
            console.log(c); 
        }))
    }
}


module.exports = {
    TachoSync
}
