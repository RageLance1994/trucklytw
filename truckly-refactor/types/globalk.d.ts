declare global {
  interface Window {
    initMap: (mapDiv: HTMLElement, vehicles: any[]) => void;
  }
}

export {};
