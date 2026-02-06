const axios = require('axios');
const fs = require('fs');
const path = require('path');

const DEFAULT_PAGE_SIZE = 100;

const normalizeCompanyList = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.companies)) return payload.companies;
  if (Array.isArray(payload)) return payload;
  return [payload];
};

const flattenCompanyTree = (payload) => {
  const roots = normalizeCompanyList(payload);
  const flattened = [];

  const walk = (company, depth = 0, parentId = null) => {
    if (!company) return;
    flattened.push({
      id: company.id,
      name: company.name,
      parentId,
      depth,
      raw: company,
    });
    const children = Array.isArray(company.childCompanies)
      ? company.childCompanies
      : Array.isArray(company.companies)
        ? company.companies
        : Array.isArray(company.children)
          ? company.children
          : [];
    if (children.length) {
      children.forEach((child) => walk(child, depth + 1, company.id));
    }
  };

  roots.forEach((company) => walk(company, 0, company?.parentCompanyId || null));
  return flattened;
};

const resolveApiKey = () => {
  const key = process.env.TACHO_APIKEY;
  if (!key) {
    throw new Error('TACHO_APIKEY missing from environment');
  }
  return key;
};

const TachoSync = new class {
  constructor() {
    this.baseurl = 'https://api.tacho.teltonika.lt/v1';
    this.timeoutMs = 15_000;
  }

  _headers() {
    return {
      'X-Api-Key': resolveApiKey(),
    };
  }

  async _request(method, path, options = {}) {
    const url = `${this.baseurl}${path}`;
    const res = await axios({
      method,
      url,
      timeout: this.timeoutMs,
      ...options,
      headers: {
        ...this._headers(),
        ...(options.headers || {}),
      },
    });
    return res;
  }

    async drivers(companyId) {
      const res = await this._request('get', '/Drivers', {
        params: {
          PageNumber: 1,
          PageSize: DEFAULT_PAGE_SIZE,
          CompanyId: companyId,
        },
      });
      return Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
    }

    async createDriver({ companyId, firstName, lastName, cardNumber, phone } = {}) {
      if (!companyId) throw new Error('companyId is required');
      if (!firstName || !lastName || !cardNumber) throw new Error('firstName, lastName, cardNumber are required');
      const res = await this._request('post', '/Drivers', {
        data: {
          companyId,
          firstName,
          lastName,
          cardNumber,
          phone: phone || null,
        },
      });
      return res.data;
    }

  async companies() {
    const res = await this._request('get', '/Companies');
    return normalizeCompanyList(res.data);
  }

  async companiesFlat() {
    const res = await this._request('get', '/Companies');
    const flattened = flattenCompanyTree(res.data);
    try {
      const dumpPath = path.join(process.cwd(), 'Tacho_companies.json');
      fs.writeFileSync(dumpPath, JSON.stringify({
        fetchedAt: new Date().toISOString(),
        raw: res.data,
        flattened,
      }, null, 2), 'utf8');
      console.log('[tacho] dumped companies to', dumpPath);
    } catch (err) {
      console.warn('[tacho] failed to dump companies', err?.message || err);
    }
    return flattened;
  }

  async listDriverFiles(options = {}) {
    const res = await this._request('get', '/DriverFiles', { params: options });
    return res.data;
  }

  async listVehicleFiles(options = {}) {
    const res = await this._request('get', '/VehicleFiles', { params: options });
    return res.data;
  }

  async createCompany({ name, parentCompanyId, comment } = {}) {
    if (!name) throw new Error('name is required');
    if (!parentCompanyId) throw new Error('parentCompanyId is required');
    const res = await this._request('post', '/Companies', {
      data: {
        name,
        parentCompanyId,
        comment: comment || null,
        automaticDriverRegistrationEnabled: false,
        autoAssignGlobalScheduleToVehicle: false,
        autoAssignGlobalScheduleToDriver: false,
        autoDriverFileDownload: false,
      },
    });
    const location = res?.headers?.location || '';
    const match = location.match(/[0-9a-fA-F-]{36}/);
    return { id: match ? match[0] : null };
  }

  async downloadDriverFiles(ids, fileFormat = 'DDD') {
    const params = new URLSearchParams();
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => params.append('Ids', id));
    if (fileFormat) params.append('FileFormat', fileFormat);
    try {
      const dumpPath = path.join(process.cwd(), 'Files_info.json');
      const payload = {
        fetchedAt: new Date().toISOString(),
        type: 'driver',
        ids: Array.isArray(ids) ? ids : [ids],
        fileFormat,
        url: `${this.baseurl}/DriverFiles/Download?${params.toString()}`,
      };
      fs.writeFileSync(dumpPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log('[tacho] dumped files info to', dumpPath);
    } catch (err) {
      console.warn('[tacho] failed to dump files info', err?.message || err);
    }
    return this._request('get', `/DriverFiles/Download?${params.toString()}`, {
      responseType: 'arraybuffer',
    });
  }

  async downloadVehicleFiles(ids, fileFormat = 'DDD') {
    const params = new URLSearchParams();
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => params.append('Ids', id));
    if (fileFormat) params.append('FileFormat', fileFormat);
    try {
      const dumpPath = path.join(process.cwd(), 'Files_info.json');
      const payload = {
        fetchedAt: new Date().toISOString(),
        type: 'vehicle',
        ids: Array.isArray(ids) ? ids : [ids],
        fileFormat,
        url: `${this.baseurl}/VehicleFiles/Download?${params.toString()}`,
      };
      fs.writeFileSync(dumpPath, JSON.stringify(payload, null, 2), 'utf8');
      console.log('[tacho] dumped files info to', dumpPath);
    } catch (err) {
      console.warn('[tacho] failed to dump files info', err?.message || err);
    }
    return this._request('get', `/VehicleFiles/Download?${params.toString()}`, {
      responseType: 'arraybuffer',
    });
  }
}();

module.exports = {
  TachoSync,
  normalizeCompanyList,
  flattenCompanyTree,
};
