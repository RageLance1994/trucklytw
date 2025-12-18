import { createPopupSkeleton } from "/assets/js/templates/popupTemplate.js";

export class VehicleMarker {
  constructor(vehicle, mapInstance) {
    this.vehicle = vehicle;
    this.imei = vehicle.dispositivo;
    this.targa = vehicle.targa;
    this.map = mapInstance;

    const { container, slots } = createPopupSkeleton();
    this.popupElement = container;
    this.popupSlots = slots;

    // resto identico...
  }

  updatePopupContent(data) {
    const gps = data.gps || {};
    const stato = this.getStato(data);
    const coloreClasse = this.getPillColor(stato);

    this.popupSlots.imei.textContent = this.imei;
    this.popupSlots.stato.textContent = this.formatStatusText(stato);
    this.popupSlots.stato.className = `pill ${coloreClasse}`;
    this.popupSlots.lastUpdate.textContent = new Date(data.timestamp).toLocaleString();
    this.popupSlots.crosshair.innerHTML = `<i class="fa fa-crosshairs"></i> Lat: ${gps.Latitude?.toFixed(5)}, Lon: ${gps.Longitude?.toFixed(5)}`;
    this.popupSlots.speed.innerHTML = `<i class="fa fa-tachometer"></i> ${gps.Speed || 0} km/h`;
    this.popupSlots.truckType.innerHTML = `<i class="fa fa-truck flipped"></i> ${this.vehicle.tipologia || "N/D"}`;
    this.popupSlots.driver.innerHTML = `<i class="fa fa-id-card"></i> ${this.vehicle.nickname || "N/A"}`;
  }
}
