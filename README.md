# Firmware Explorer

Interactive, visual lessons on server management firmware: BMC/OpenBMC, iLO paths, IPMI, Redfish, I²C/PMBus, KCS, NC-SI, firmware flashing (BMC, BIOS, PLDM/MCTP), chassis backplanes and fleet management (HMC).

Each lesson = topology map with animated messages + sequence view + message table + byte-level inspector.

- Open `dist/firmware-explorer.html` directly in a browser (single self-contained file, works offline), or
- Develop: `cd src && python3 -m http.server 8080` then open http://localhost:8080
- Rebuild the single file: `python3 build.py`

## Adding a lesson
Lessons live in `src/lessons/*.js` and push objects onto `LESSONS` with `nodes`, `links`, `steps` and `msgs`.
Each message has `layers` built from field helpers in `src/lib.js` (`F(name, value, bytes, description, {eg})`), so the hex view and field decoding stay in sync.

Scenarios are simplified teaching models based on public specs (IPMI 2.0, DMTF Redfish/MCTP/PLDM/NC-SI, OpenBMC). Values marked E.G. are examples.
