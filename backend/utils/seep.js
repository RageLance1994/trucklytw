const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
require("dotenv").config();

const BASE_URL = "https://app.seeptrucker.com";

class SeepTruckerClient {
  constructor({
    email = process.env.SEEP_EMAIL || "ats.truckly@gmail.com",
    password = process.env.SEEP_PASSWORD || "Luigi@antonio25",
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

  _authHeaders() {
    const token = this.tokenInfo?.access_token || this.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  _wrapAxiosError(error) {
    if (error.response) {
      const { status, data } = error.response;
      const details = typeof data === "string" ? data : JSON.stringify(data);
      return new Error(`SeepTrucker request failed (${status}): ${details}`);
    }
    if (error.request) {
      return new Error("No response received from SeepTrucker API.");
    }
    return error;
  }

  async auth() {
    try {
      const { data } = await this.client.post("/api/token", {
        user: { email: this.credentials.email, password: this.credentials.password },
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
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath}`);
    }

    const form = new FormData();
    // API docs mention "filename", but observed clients often use "file".
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

  extractDriverGraphs(analysis) {
    // Collect SVG graphs from the driver activity analysis response
    const weeks = analysis?.activityAnalysis?.weeks || [];
    const graphs = [];
    weeks.forEach((week) => {
      (week.days || []).forEach((day) => {
        if (day?.graph) {
          graphs.push({
            date: day.date,
            graph: day.graph,
            metrics: day.metrics,
            infringements: day.infringements,
          });
        }
      });
    });
    return graphs;
  }
}

const SeepTrucker = new SeepTruckerClient();

module.exports = { SeepTrucker, SeepTruckerClient };
