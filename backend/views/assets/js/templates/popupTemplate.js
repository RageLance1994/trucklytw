export function createPopupSkeleton() {
  const container = document.createElement('div');
  container.className = 'wrapper-v nopadding truckinfo j-start a-start';
  container.innerHTML = `
    <div class="tiheader wrapper-h h-min-content nopadding j-sb">
      <div class="wrapper-h nopadding"><p class="imei-slot"></p></div>
      <div class="wrapper-h nopadding j-end">
        <div class="pulse-indicator"></div>
        <h6 class="pill stato-slot"></h6>
      </div>
    </div>
    <div class="divider-h"></div>
    <div class="wrapper-v rg-8p j-start nopadding" style="text-wrap:nowrap;">
      <div class="wrapper-h j-start nopadding cg-382">
        <i class="fa fa-clock-o"></i>
        <p>Ultimo aggiornamento:</p>
        <p class="last-update-slot"></p>
      </div>
      <div class="wrapper-h j-start nopadding cg-382 crosshair-slot"></div>
      <div class="wrapper-h j-start nopadding cg-382 speed-slot"></div>
    </div>
    <div class="divider-h"></div>
    <div class="wrapper-v j-start rg-8p nopadding">
      <div class="wrapper-h j-start nopadding cg-382 truck-type-slot"></div>
      <div class="wrapper-h j-sb nopadding cg-382">
        <div class="wrapper-h nopadding j-start a-center cg-382 driver-slot"></div>
      </div>
    </div>
  `;

  return {
    container,
    slots: {
      imei: container.querySelector('.imei-slot'),
      stato: container.querySelector('.stato-slot'),
      lastUpdate: container.querySelector('.last-update-slot'),
      crosshair: container.querySelector('.crosshair-slot'),
      speed: container.querySelector('.speed-slot'),
      truckType: container.querySelector('.truck-type-slot'),
      driver: container.querySelector('.driver-slot')
    }
  };
}
