import { VehicleMarker } from "/assets/js/vehicleMarker.js";

export class MarkerManager {
  constructor(mapInstance) {
    this.map = mapInstance;
    this.markers = new Map(); // imei → VehicleMarker
  }

  /**
   * Aggiunge un veicolo e crea il marker
   */
  addVehicle(vehicle) {
    if (!vehicle.dispositivo) return;
    const marker = new VehicleMarker(vehicle, this.map);
    this.markers.set(vehicle.dispositivo, marker);
    return marker;
  }

  /**
   * Aggiunge un batch di veicoli
   */
  addVehicles(vehicles) {
    vehicles.forEach(v => this.addVehicle(v));
  }

  /**
   * Ritorna un marker dato un imei
   */
  getByImei(imei) {
    return this.markers.get(imei);
  }

  /**
   * Ritorna un marker dato una targa
   */
  getByPlate(targa) {
    for (const marker of this.markers.values()) {
      if (marker.targa === targa) return marker;
    }
    return null;
  }

  /**
   * Aggiorna il marker associato a un imei
   */
  updateData(imei, data) {
    const marker = this.getByImei(imei);
    if (marker) marker.updateData(data);
  }

  /**
   * Aggiorna un batch di devices (dal WS)
   */
  updateBatch(devices) {
    devices.forEach(({ imei, data }) => {
      this.updateData(imei, data);
    });
  }
}
