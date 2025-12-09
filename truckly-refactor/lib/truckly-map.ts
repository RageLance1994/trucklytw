"use client";

// Wrapper per evitare errori SSR
let TrucklyMapClass = null;

if (typeof window !== "undefined") {
  // Qui incolleremo la tua classe TrucklyMap
  TrucklyMapClass = class TrucklyMap {
    constructor() {
      console.warn("TrucklyMap: placeholder. Incolla qui la classe vera.");
    }
  };
}

// Export sempre disponibile
export const TrucklyMap = TrucklyMapClass ?? class {
  constructor() {
    console.warn("TrucklyMap initialized on server (SSR), doing nothing.");
  }
};
