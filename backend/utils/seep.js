const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
require("dotenv").config();

const BASE_URL = "https://app.seeptrucker.com";

const toStringSafe = (value) => String(value || "").trim();
const normalizeToken = (value) => toStringSafe(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

const buildNotImplemented = (message = "LUL API not implemented") => {
  const err = new Error(message);
  err.code = "NOT_IMPLEMENTED";
  err.statusCode = 501;
  return err;
};

class SeepTruckerClient {
  constructor({
    email = process.env.SEEP_EMAIL,
    password = process.env.SEEP_PASSWORD,
    baseURL = BASE_URL,
  } = {}) {
    this.credentials = { email, password };
    this.baseURL = baseURL;
    this.tokenInfo = null;
    this.token = null;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  }

  _requireCredentials() {
    const email = toStringSafe(this.credentials?.email);
    const password = toStringSafe(this.credentials?.password);
    if (!email || !password) {
      const err = new Error("SEEP_EMAIL and SEEP_PASSWORD are required.");
      err.code = "SEEP_CREDENTIALS_MISSING";
      err.statusCode = 500;
      throw err;
    }
  }

  _authHeaders() {
    const token = this.tokenInfo?.access_token || this.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  _wrapAxiosError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const details = typeof data === "string" ? data : JSON.stringify(data);
      const wrapped = new Error(`SeepTrucker request failed (${status}): ${details}`);
      wrapped.statusCode = status;
      return wrapped;
    }
    if (error.request) {
      const wrapped = new Error("No response received from SeepTrucker API.");
      wrapped.statusCode = 502;
      return wrapped;
    }
    return error;
  }

  _normalizeDriverList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.drivers)) return payload.drivers;
    return [];
  }

  async auth() {
    this._requireCredentials();
    try {
      const { data } = await this.client.post("/api/token", {
        user: {
          email: this.credentials.email,
          password: this.credentials.password,
        },
      });
      this.tokenInfo = data;
      this.token = data?.access_token;
      return data;
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async drivers({ onlyActives } = {}) {
    try {
      const { data } = await this.client.get("/api/drivers", {
        params: { only_actives: onlyActives },
        headers: this._authHeaders(),
      });
      return data;
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async vehicles() {
    try {
      const { data } = await this.client.get("/api/vehicles", {
        headers: this._authHeaders(),
      });
      return data;
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async uploadFile(filePath) {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const form = new FormData();
    form.append("filename", fs.createReadStream(resolvedPath));

    try {
      const { data } = await this.client.post("/api/files", form, {
        headers: {
          ...this._authHeaders(),
          ...form.getHeaders(),
        },
      });
      return data;
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async driverActivity({
    driverId,
    startDate,
    endDate,
    regulation = 0,
    penalty = 0,
    onlyInfringementsGraphs = false,
    ignoreCountrySelectedInfringements = false,
    timezone = "UTC",
  }) {
    try {
      const { data } = await this.client.post(
        "/api/activity-analysis/driver-activity",
        {
          driverId,
          startDate,
          endDate,
          regulation,
          penalty,
          onlyInfringementsGraphs,
          ignoreCountrySelectedInfringements,
          timezone,
        },
        { headers: this._authHeaders() },
      );
      return data;
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async vehicleActivity({
    vehicleId,
    startDate,
    endDate,
    regulation = 0,
    penalty = 0,
    onlyInfringementsGraphs = false,
    ignoreCountrySelectedInfringements = false,
    timezone = "UTC",
  }) {
    try {
      const { data } = await this.client.post(
        "/api/activity-analysis/vehicle-activity",
        {
          vehicleId,
          startDate,
          endDate,
          regulation,
          penalty,
          onlyInfringementsGraphs,
          ignoreCountrySelectedInfringements,
          timezone,
        },
        { headers: this._authHeaders() },
      );
      return data;
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async driverPdfReport({
    driverId,
    reportType = "activity_times",
    startDate,
    endDate,
    timezone = "Europe/Rome",
    regulation = 0,
    penalty = 0,
    onlyInfringementsGraphs = false,
    ignoreCountrySelectedInfringements = false,
    activitiesGraphs = false,
    activitiesTables = true,
    infringementsLists = false,
  } = {}) {
    try {
      const { data, headers } = await this.client.post(
        "/api/pdf-reports/driver",
        {
          driverId,
          reportType,
          startDate,
          endDate,
          onlyInfringementsGraphs,
          regulation,
          penalty,
          ignoreCountrySelectedInfringements,
          activitiesGraphs,
          activitiesTables,
          infringementsLists,
          timezone,
        },
        {
          headers: {
            ...this._authHeaders(),
            Accept: "application/pdf",
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        },
      );
      return {
        buffer: Buffer.from(data),
        contentType: headers?.["content-type"] || "application/pdf",
      };
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  async driverXlsxReport({
    driverId,
    reportType = "activity_times",
    startDate,
    endDate,
    timezone = "Europe/Rome",
    regulation = 0,
    penalty = 0,
    onlyInfringementsGraphs = false,
    ignoreCountrySelectedInfringements = false,
    activitiesGraphs = false,
    activitiesTables = true,
    infringementsLists = false,
  } = {}) {
    try {
      const { data, headers } = await this.client.post(
        "/api/xlsx-reports/driver",
        {
          driverId,
          reportType,
          startDate,
          endDate,
          onlyInfringementsGraphs,
          regulation,
          penalty,
          ignoreCountrySelectedInfringements,
          activitiesGraphs,
          activitiesTables,
          infringementsLists,
          timezone,
        },
        {
          headers: {
            ...this._authHeaders(),
            Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        },
      );
      return {
        buffer: Buffer.from(data),
        contentType: headers?.["content-type"] || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } catch (error) {
      throw this._wrapAxiosError(error);
    }
  }

  extractDriverGraphs(analysis) {
    const weeks = analysis?.activityAnalysis?.weeks || [];
    const graphs = [];
    weeks.forEach((week) => {
      (week.days || []).forEach((day) => {
        if (day?.graph) {
          graphs.push({
            date: day.date,
            graph: day.graph,
            metrics: day.metrics,
            activities: day.activities,
            infringements: day.infringements,
          });
        }
      });
    });
    return graphs;
  }

  async resolveDriverId({ localDriverId, tachoDriverId, seepDriverId, localDriverName, localDriverSurname } = {}) {
    if (toStringSafe(seepDriverId)) {
      return {
        driverId: toStringSafe(seepDriverId),
        strategy: "seepDriverId",
        match: null,
      };
    }

    await this.auth();
    const payload = await this.drivers({ onlyActives: false });
    const drivers = this._normalizeDriverList(payload);

    const identifiers = [
      toStringSafe(tachoDriverId),
      toStringSafe(localDriverId),
    ].filter(Boolean);

    const pickByIdentifier = (candidate, needle) => {
      const values = [
        candidate?.id,
        candidate?.cardNumber,
        candidate?.driverCardId,
        candidate?.cardId,
        candidate?.licenceNumber,
        candidate?.licenceId,
      ].map((v) => toStringSafe(v));
      return values.includes(needle);
    };

    const pickByIdentifierNormalized = (candidate, needle) => {
      const target = normalizeToken(needle);
      if (!target) return false;
      const values = [
        candidate?.id,
        candidate?.cardNumber,
        candidate?.driverCardId,
        candidate?.cardId,
        candidate?.licenceNumber,
        candidate?.licenceId,
      ].map((v) => normalizeToken(v)).filter(Boolean);
      if (values.includes(target)) return true;
      // frequent mismatch: same card with prefixes/formatting, match by tail
      const tail = target.slice(-8);
      if (!tail) return false;
      return values.some((v) => v.endsWith(tail));
    };

    let match = null;
    let strategy = null;

    for (const identifier of identifiers) {
      match = drivers.find((candidate) => pickByIdentifier(candidate, identifier));
      if (match) {
        strategy = identifier === toStringSafe(tachoDriverId) ? "tachoDriverId" : "localDriverId";
        break;
      }
    }

    if (!match) {
      for (const identifier of identifiers) {
        const normalizedCandidates = drivers.filter((candidate) =>
          pickByIdentifierNormalized(candidate, identifier)
        );
        if (normalizedCandidates.length === 1) {
          match = normalizedCandidates[0];
          strategy = "normalizedId";
          break;
        }
      }
    }

    if (!match) {
      const name = toStringSafe(localDriverName).toLowerCase();
      const surname = toStringSafe(localDriverSurname).toLowerCase();
      if (name || surname) {
        const localFull = `${name} ${surname}`.trim().replace(/\s+/g, " ");
        const byName = drivers.filter((candidate) => {
          const candidateNameRaw = toStringSafe(candidate?.name).toLowerCase().replace(/\s+/g, " ");
          const candidateSurnameRaw = toStringSafe(candidate?.surname).toLowerCase().replace(/\s+/g, " ");
          const candidateFull = `${candidateNameRaw} ${candidateSurnameRaw}`.trim().replace(/\s+/g, " ");
          const candidateCardName = toStringSafe(candidate?.cardName).toLowerCase();
          if (name && surname) {
            return (
              candidateFull.includes(localFull) ||
              localFull.includes(candidateFull) ||
              (candidateNameRaw.includes(name) && (candidateSurnameRaw.includes(surname) || candidateNameRaw.includes(surname))) ||
              candidateCardName.includes(`${name} ${surname}`) ||
              candidateCardName.includes(`${surname} ${name}`)
            );
          }
          const single = name || surname;
          return (
            candidateFull.includes(single) ||
            candidateNameRaw.includes(single) ||
            candidateCardName.includes(single)
          );
        });
        if (byName.length === 1) {
          match = byName[0];
          strategy = "nameFallback";
        }
      }
    }

    if (!match) {
      const err = new Error("Driver non trovato su SeepTrucker.");
      err.code = "SEEP_DRIVER_NOT_FOUND";
      err.statusCode = 404;
      throw err;
    }

    return {
      driverId: toStringSafe(match?.id),
      strategy: strategy || "lookup",
      match,
    };
  }

  async driverGraphs({
    localDriverId,
    tachoDriverId,
    seepDriverId,
    localDriverName,
    localDriverSurname,
    startDate,
    endDate,
    timezone = "UTC",
    regulation = 0,
    penalty = 0,
    onlyInfringementsGraphs = false,
    ignoreCountrySelectedInfringements = false,
  } = {}) {
    const resolved = await this.resolveDriverId({
      localDriverId,
      tachoDriverId,
      seepDriverId,
      localDriverName,
      localDriverSurname,
    });
    const analysis = await this.driverActivity({
      driverId: resolved.driverId,
      startDate,
      endDate,
      timezone,
      regulation,
      penalty,
      onlyInfringementsGraphs,
      ignoreCountrySelectedInfringements,
    });

    const days = this.extractDriverGraphs(analysis);

    return {
      source: "seep",
      driver: {
        requested: {
          localDriverId: toStringSafe(localDriverId) || null,
          tachoDriverId: toStringSafe(tachoDriverId) || null,
          seepDriverId: toStringSafe(seepDriverId) || null,
        },
        resolvedSeepDriverId: resolved.driverId,
        strategy: resolved.strategy,
        match: resolved.match || null,
      },
      days,
      analysis,
    };
  }

  lulEnabled() {
    return String(process.env.SEEP_LUL_ENABLED || "false").toLowerCase() === "true";
  }

  async createLul(_payload = {}) {
    if (!this.lulEnabled()) {
      const err = new Error("LUL disabilitato: SEEP_LUL_ENABLED=false");
      err.code = "FEATURE_DISABLED";
      err.statusCode = 503;
      throw err;
    }
    throw buildNotImplemented("SeepTrucker LUL endpoint non disponibile");
  }

  async brandLul(_payload = {}) {
    if (!this.lulEnabled()) {
      const err = new Error("Branding LUL disabilitato: SEEP_LUL_ENABLED=false");
      err.code = "FEATURE_DISABLED";
      err.statusCode = 503;
      throw err;
    }
    throw buildNotImplemented("SeepTrucker LUL branding endpoint non disponibile");
  }
}

const SeepTrucker = new SeepTruckerClient();

module.exports = { SeepTrucker, SeepTruckerClient };
