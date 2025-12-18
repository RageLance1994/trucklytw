import { ComboBox } from "/assets/js/comboBox.js";
import {Scrubber} from "/assets/js/scrubbers.js"
// const [_start, _stop] = container.querySelectorAll('input[type="datetime-local"]');
// const dayms = 86_400_000;
// [_start.value, _stop.value] = [new Date(Date.now() - (Date.now() % dayms) - (3 * dayms)), new Date()].map(d => d.toISOString().slice(0, 16));


let vehicleComboBox = null;

var mapFrame = document.querySelector('iframe').contentWindow;
mapFrame ? mapFrame.addEventListener('vrec', handleVrec) : null;
mapFrame ? mapFrame.addEventListener('vchange', handleVchange) : null;


window.RMScrubber = new Scrubber('#rewindScrubber');

function handleVrec(ev) {
    const vehicles =
        window.vehicles = Array.isArray(ev?.detail?.vehicles) ? ev.detail.vehicles : [];
    if (!vehicles.length) {
        console.warn('[bottom] Nessun veicolo disponibile per l\'inizializzazione.');
        return;
    }
    const searchInput = document.querySelector('input[data-role="vehicle-search-bar-bottom"]');
    if (searchInput) {
        const comboContainer = searchInput.parentNode;
        const options = vehicles.map((v) => ({ text: [v.nickname, v.plate.v, v.imei], value: v.imei }));
        if (!vehicleComboBox) {
            vehicleComboBox = new ComboBox(comboContainer, options, (selectedImei) => {
                if (!mapFrame) return;
                const targetVehicle = window.vehicles.find((vehicle) => vehicle.imei == selectedImei);
                if (targetVehicle) {
                    mapFrame.dispatchEvent(new CustomEvent('vchange', { detail: { vehicle: targetVehicle } }));
                }
            });
        } else {
            vehicleComboBox.setOptions(options);
        }
    }

    renderRightSection(ev, true);


}

function handleVchange(ev) {

}

async function renderRightSection(ev, firstRequest) {
}