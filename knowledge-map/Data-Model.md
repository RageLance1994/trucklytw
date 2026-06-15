---
title: Data Model (Mongo)
tags: [backend, data]
---

# Data Model (Mongo)

File: `backend/Models/Schemes.js`. Connessione/CRUD in `utils/database.js`. Campi sensibili cifrati (`*Enc`) via `utils/encryption.js` (AES).

## Collezioni principali
- `Vehicle` — plate/brand/model + campi cifrati `*Enc`; `codec`, `imei`.
- `Drivers` — `tachoDriverId`, `name`, `surname`, `owner`. ⚠️ I nomi autisti **non** arrivano affidabili da Teltonika IO: risolvere cardId→nome dal DB `Drivers`.
- `Users`, `Company`.
- `AuthorizedIMEIS` — IMEI device registrati (`label`, `deviceModel`).

## Collezioni dinamiche (per veicolo/driver)
- `${imei}_monitoring` — AVL telemetria, schema flessibile `{strict:false}`, index su `timestamp`. Doc: `{ timestamp, gps{lat,lon,Speed}, io{ ignition, movement, vehicleSpeed, driver1Id, driver1WorkingState, driver1CardPresence, driver2*, tachoDriverIds[] , ... } }`. → [[Backend-Listeners]]
- `${imei}_refuelings` — eventi rifornimento (`eventId`, `start/end`, `liters`, tank, `driverId`, `attachments` cifrati max 8MB).
- `driver_${driverId}_history` — transizioni stato (`from_state`/`to_state` ∈ driving/working/resting/error/unknown/unlogged, `elapsed`).

## Scrittura
Le `*_monitoring` **non** sono scritte da questo backend (servizio esterno). Qui solo lettura + change stream.

Collegato a: [[Backend-Listeners]] · [[Map-Layer]] · [[Architecture]]
