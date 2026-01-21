const axios = require('axios');

const DEFAULT_PAGE_SIZE = 100;

const normalizeCompanyList = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload?.items)) return payload.items;
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
    if (Array.isArray(company.childCompanies)) {
      company.childCompanies.forEach((child) => walk(child, depth + 1, company.id));
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

  async companies() {
    const res = await this._request('get', '/Companies');
    return normalizeCompanyList(res.data);
  }

  async companiesFlat() {
    const res = await this._request('get', '/Companies');
    return flattenCompanyTree(res.data);
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
    return this._request('get', `/DriverFiles/Download?${params.toString()}`, {
      responseType: 'arraybuffer',
    });
  }

  async downloadVehicleFiles(ids, fileFormat = 'DDD') {
    const params = new URLSearchParams();
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => params.append('Ids', id));
    if (fileFormat) params.append('FileFormat', fileFormat);
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
