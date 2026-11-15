(function () {
  const { B, F, L, N, I, M, hx } = FX;
  const sig = FX.sig;
  const C = '10.0.0.5', BM = '10.0.0.20', BI = '192.168.31.1', HI = '192.168.31.2';
  const hs = (s, d, sp, dp) => ({ src: s, dst: d, tcp: [sp, dp, 1, 1, 'PSH,ACK'] });
  const T = { Host: 'xd685-ilo', 'X-Auth-Token': '4f1c0e...9a' };
  const ipNote = 'Internal BMC↔HMC addresses are examples; real ones are fixed by platform design.';

  /* =============== XD685 system anatomy =============== */
  LESSONS.push({
    id: 'xd685-architecture', cat: 'xd685', ord: 280, mins: 15,
    title: 'XD685 system anatomy', subtitle: 'Host + HMC + GPU baseboard + Slingshot',
    keywords: 'xd685 cray hmc gpu baseboard hgx slingshot host node management network power',
    tags: ['xd685', 'cray', 'hmc', 'gpu', 'architecture', 'slingshot'],
    prereq: ['ilo-architecture', 'backplane'],
    intro: 'The <b>Cray XD685</b> is an HPE accelerated-computing server: host CPU node(s) plus a <b>GPU baseboard</b> carrying up to 8 GPUs, all managed through <b>two levels of BMC</b> — the system iLO and the baseboard\'s HMC — plus the <b>Slingshot</b> interconnect for the fabric.',
    overview: [
      '<b>Host side</b>: EPYC host(s) with their own iLO managing power, BIOS, fans at chassis level, and the host OS. Host↔GPU data flows over <b>PCIe</b> (and NVLink inside the baseboard for GPU↔GPU).',
      '<b>GPU baseboard</b>: an HGX-class board with 8 GPU modules, NVLink switches, PCIe retimers, its own CPLD/FPGA, power and thermal sensors, and a security chip (ERoT) per GPU. It gets its own controller — the <b>HMC</b>.',
      '<b>HMC</b> (Hardware/HGX Management Controller): a BMC-class SoC on the baseboard running OpenBMC-derived firmware. It owns GPU power, cooling, telemetry and firmware updates. It is <b>not</b> on the customer management network — the system BMC fronts it.',
      '<b>Slingshot</b>: HPE\'s high-speed interconnect (optical, rail-based Dragonfly topology) connecting nodes in the HPC fabric — separate from both the management network and PCIe.',
      '<b>Management</b>: admins reach the system iLO over the OOB management network; iLO aggregates the HMC\'s Redfish resources so one tree shows host + GPUs.',
    ],
    facts: [['Host mgmt', 'iLO (system BMC)'], ['GPU mgmt', 'HMC on baseboard'], ['Host↔GPU', 'PCIe + NVLink'], ['Fabric', 'HPE Slingshot (optical)'], ['Mgmt net', 'Dedicated OOB (Redfish/HTTPS)'], ['Scale', 'Per node; replicated per chassis/rack']],
    terms: [['HMC', 'Hardware Management Controller: the GPU baseboard\'s BMC.'], ['HGX', 'NVIDIA HGX baseboard platform (8-GPU SXM modules).'], ['ERoT', 'External Root of Trust per GPU/switch: verifies firmware signatures.'], ['Slingshot', 'HPE interconnect: electrical SerDes → optical, Dragonfly topology.'], ['Rail', 'A group of Slingshot switches forming an independent plane.']],
    atWork: 'On XD685 your team\'s firmware spans iLO (host side), HMC (GPU side) and the integration between them — Redfish aggregation, update orchestration, sensor naming, event forwarding. Bugs at that boundary are where most field issues live.',
    refs: [['HPE Cray XD systems', 'https://www.hpe.com/us/en/compute/hpc/cray-xd-systems.html'], ['NVIDIA DGX Redfish guide (HGX_ resources)', 'https://docs.nvidia.com/dgx/dgxh100-user-guide/redfish-api-supp.html'], ['HMC lesson: "HMC: GPU baseboard controller"', '#hmc-gpu']],
    zones: [{ x: 60, y: 30, w: 880, h: 510, label: 'XD685 node (conceptual)' }],
    nodes: [
      { id: 'adm', type: 'laptop', label: 'Admin / cluster mgr', sub: 'Redfish', x: 100, y: 120 },
      { id: 'msw', type: 'switch', label: 'Mgmt switch', sub: 'OOB VLAN', x: 100, y: 330 },
      { id: 'ilo', type: 'bmc', label: 'iLO', sub: 'system BMC', x: 300, y: 330, tag: 'BMC' },
      { id: 'cpu', type: 'cpu', label: 'Host CPUs', sub: 'EPYC + OS', x: 560, y: 130 },
      { id: 'psu', type: 'psu', label: 'PSU', sub: 'host + baseboard', x: 560, y: 420 },
      { id: 'sl', type: 'switch', label: 'Slingshot rail', sub: 'optical switches', x: 830, y: 90 },
      { id: 'hmc', type: 'bmc', label: 'HMC', sub: 'baseboard BMC', x: 830, y: 300, tag: 'HMC' },
      { id: 'gpu', type: 'device', label: 'GPU baseboard', sub: '8× SXM + ERoT', x: 830, y: 480 },
    ],
    links: [
      { a: 'adm', b: 'msw', kind: 'lan' }, { a: 'msw', b: 'ilo', kind: 'lan', label: 'OOB :443' },
      { a: 'ilo', b: 'cpu', kind: 'espi', label: 'host mgmt' }, { a: 'ilo', b: 'hmc', kind: 'usb', label: 'USB-Eth + I²C' },
      { a: 'ilo', b: 'psu', kind: 'gpio', label: 'power seq' }, { a: 'psu', b: 'gpu', kind: 'power', label: '12 V' },
      { a: 'cpu', b: 'gpu', kind: 'pcie', label: 'PCIe host link' }, { a: 'cpu', b: 'sl', kind: 'opt', label: 'Slingshot' }, { a: 'hmc', b: 'gpu', kind: 'mctp', label: 'I²C/MCTP' },
    ],
    steps: [
      { title: 'Two BMCs', sub: 'iLO fronts, HMC serves', text: 'The system iLO manages the host: power, BIOS, host sensors, fans at chassis level. The GPU baseboard has its own BMC — the <b>HMC</b> — which owns GPU power, cooling, telemetry and GPU firmware. Admins only ever talk to iLO.' },
      { title: 'Aggregation', sub: 'One Redfish tree', text: 'iLO discovers the HMC over the internal link and merges its resources into its own Redfish tree (HGX_Baseboard_0, GPU_SXM_1..8). To the admin and cluster manager it looks like one service — but two firmwares are answering.' },
      { title: 'Data vs management', sub: 'PCIe and Slingshot', text: '<b>PCIe</b> carries host↔GPU data. <b>NVLink</b> carries GPU↔GPU inside the baseboard. <b>Slingshot</b> is the fabric to other nodes — a completely separate optical network, managed by its own switches.' },
      { title: 'Power domains', sub: 'Staggered bring-up', text: 'Standby powers iLO and HMC first. Host power-on sequences CPU rails; baseboard power enables GPU rails in order — the CPLDs/HMC enforce timing because 8 GPUs pulling simultaneously would brown-out the supply.' },
      { title: 'Firmware domains', sub: 'Four updatable stacks', text: 'iLO firmware, host BIOS, HMC firmware, GPU/ERoT firmware — each has its own image, signature chain and activation policy. An XD685 firmware bundle coordinates versions across all of them.' },
    ],
    msgs: [
      { t: '0s', from: 'psu', to: 'ilo', proto: 'Power', step: 3, info: '12VSB powers iLO + HMC standby domains', short: 'standby up', layers: sig('12VSB → iLO, HMC', 'ON', 'Both management processors boot on standby while host and GPUs are off.') },
      { t: '30s', from: 'ilo', to: 'hmc', proto: 'GPIO', step: 0, info: 'iLO enables GPU baseboard standby rail', short: 'baseboard STBY', layers: sig('HGX_STBY_EN', 'asserted', 'iLO (via GPIO/CPLD) powers the baseboard standby domain; HMC begins booting.', [F('Path', 'iLO → board CPLD → baseboard', null, 'Exact signal names are platform-specific.')]) },
      { t: '60s', from: 'adm', to: 'ilo', proto: 'Redfish', step: 1, info: 'GET /redfish/v1/Systems → host + HGX_Baseboard_0', short: 'GET Systems', layers: N.https(hs(C, BM, 55000, 443), 'GET /redfish/v1/Systems HTTP/1.1', T), note: 'The BMC proxies the HMC\'s collection; admin sees one tree. ' + ipNote },
      { t: '61s', from: 'ilo', to: 'hmc', proto: 'Redfish', step: 1, info: 'Internal: GET HMC /redfish/v1/Systems', short: 'agg fetch', layers: N.https(hs(BI, HI, 40500, 443), 'GET /redfish/v1/Systems HTTP/1.1', { Host: HI }), note: ipNote },
      { t: '90s', from: 'adm', to: 'ilo', via: ['msw'], proto: 'Redfish', step: 4, info: 'GET FirmwareInventory → iLO, BIOS, HMC, GPU tray versions', short: 'inventory', layers: N.https(hs(C, BM, 55001, 443), 'GET /redfish/v1/UpdateService/FirmwareInventory HTTP/1.1', T) },
      { t: '120s', from: 'cpu', to: 'sl', proto: 'Slingshot', step: 2, info: 'Host NIC ↔ Slingshot switch: optical link up', short: 'link up', layers: [L('Slingshot link', [F('Physical', 'optical fiber', null, 'SerDes → optical transceiver.'), F('Speed', '200 Gbps per port (class)', null, 'Exact rate depends on generation.', { eg: true }), F('Topology', 'Dragonfly via rails', null, 'See the Slingshot lesson.')])] },
      { t: '130s', from: 'hmc', to: 'gpu', proto: 'PLDM', step: 4, info: 'HMC polls GPU telemetry over MCTP', short: 'poll GPUs', layers: [M.mctp(30, 10, 1, 0), M.pldm(true, 5, 2, 0x11, 'GetSensorReading', 0, [F('SensorID', 'GPU temp', B.u16le(0x10), '', { eg: true })])], note: 'HMC↔GPU telemetry uses I²C/SMBus and MCTP/PLDM depending on component.' },
    ],
  });

  /* =============== Slingshot interconnect =============== */
  LESSONS.push({
    id: 'slingshot', cat: 'xd685', ord: 290, mins: 12,
    title: 'HPE Slingshot interconnect', subtitle: 'The optical fabric inside Cray XD/EX',
    keywords: 'slingshot interconnect optical dragonfly rails hpe cray ex xd fabric switch',
    tags: ['slingshot', 'interconnect', 'optical', 'fabric', 'hpc'],
    prereq: ['xd685-architecture', 'networking-101'],
    intro: '<b>Slingshot</b> is HPE\'s high-performance interconnect for Cray EX and XD systems — the "InfiniBand/NDR-class" fabric that connects compute nodes at hundreds of Gbps. It is a physical and switching architecture you will see in rack diagrams and firmware contexts.',
    overview: [
      '<b>Physical layer</b>: each node has Slingshot NICs (on the host board or mezzanine) connected by <b>optical fiber</b> to Slingshot switches. Electrical SerDes on the ASIC is converted to optical for the cable run — that is why links are "optical" even though the chip is electrical.',
      '<b>Topology</b>: Slingshot uses a <b>Dragonfly</b>-class topology organized into <b>rails</b> — groups of switches forming independent planes. Rails give path diversity: a fault on one rail doesn\'t take down the fabric.',
      '<b>Routing</b>: adaptive routing picks least-congested paths; the fabric handles hot-spots and failures without host involvement. For firmware work this means switch/NIC firmware versions must be compatible across the whole fabric.',
      '<b>Management</b>: Slingshot switches are managed like other HPC components — they appear as managed devices (switch controllers) in the same management ecosystem as node BMCs.',
    ],
    facts: [['Type', 'HPE interconnect (optical fabric)'], ['Topology', 'Dragonfly-class, rail-based'], ['Speed', '200G+ per port class'], ['Managed by', 'switch controllers / fabric manager'], ['Used in', 'Cray EX, Cray XD systems']],
    terms: [['Rail', 'Independent switch plane; multiple rails = redundancy.'], ['Dragonfly', 'High-radix topology minimizing cable length at scale.'], ['Adaptive routing', 'Fabric picks paths based on congestion/faults.'], ['Transceiver', 'Optical module converting electrical↔optical (QSFP class).'], ['Fabric manager', 'Software managing the whole Slingshot fabric.']],
    atWork: 'XD685 nodes connect to Slingshot for the compute fabric — separate from the iLO management network. Firmware compatibility across NICs, switches and cables matters: a mismatched transceiver or old switch firmware shows up as link-down or degraded bandwidth.',
    refs: [['HPE Slingshot interconnect', 'https://www.hpe.com/us/en/hpc/slingshot.html'], ['HPE Cray EX docs', 'https://github.com/Cray-HPE/docs-ex'], ['Dragonfly topology overview', 'https://en.wikipedia.org/wiki/Dragonfly_topology']],
    zones: [{ x: 60, y: 40, w: 880, h: 480, label: 'Slingshot fabric (conceptual)' }],
    nodes: [
      { id: 'n1', type: 'host', label: 'Node 1 NIC', sub: 'Slingshot port', x: 160, y: 140 },
      { id: 'n2', type: 'host', label: 'Node 2 NIC', sub: 'Slingshot port', x: 160, y: 400 },
      { id: 'sw1', type: 'switch', label: 'Rail A switch', sub: 'Slingshot', x: 480, y: 140 },
      { id: 'sw2', type: 'switch', label: 'Rail B switch', sub: 'Slingshot', x: 480, y: 400 },
      { id: 'core', type: 'switch', label: 'Core/director', sub: 'Dragonfly group', x: 760, y: 270 },
      { id: 'n3', type: 'host', label: 'Node 3 NIC', sub: 'Slingshot port', x: 920, y: 270 },
    ],
    links: [
      { a: 'n1', b: 'sw1', kind: 'opt', label: 'fiber' }, { a: 'n2', b: 'sw2', kind: 'opt', label: 'fiber' },
      { a: 'n1', b: 'sw2', kind: 'opt', label: 'rail B', t: .7 }, { a: 'n2', b: 'sw1', kind: 'opt', label: 'rail A', t: .3 },
      { a: 'sw1', b: 'core', kind: 'opt', label: 'uplink' }, { a: 'sw2', b: 'core', kind: 'opt' }, { a: 'core', b: 'n3', kind: 'opt' },
    ],
    steps: [
      { title: 'NIC to fiber', sub: 'Electrical becomes optical', text: 'The Slingshot NIC (in the host) drives electrical SerDes; a <b>transceiver</b> converts to optical for the fiber run to the switch. Cable reach is tens of meters inside a rack row — that is why the fabric is optical even at "chip" speeds.' },
      { title: 'Rails', sub: 'Independent planes', text: 'Switches are grouped into <b>rails</b>: parallel switch planes. A node typically connects to multiple rails, so one switch or cable fault removes a path, not the node.' },
      { title: 'Dragonfly', sub: 'Short cables, many paths', text: 'The Dragonfly topology organises switches so most links are short (intra-rack) with a smaller set of longer links between groups — minimizing fiber count while keeping path diversity at scale.' },
      { title: 'Adaptive routing', sub: 'Fabric heals itself', text: 'The Slingshot switches route adaptively around congestion and faults. The host NICs and fabric manager handle link training, error recovery and firmware compatibility across the whole fabric.' },
      { title: 'Versions & boundaries', sub: 'Fabric is its own world', text: 'Slingshot carries <b>compute</b> traffic (MPI, GPUDirect-style flows) — a different physical and logical network from iLO management. Firmware compatibility across NICs, switches, cables and transceivers must be validated fabric-wide before deployment.' },
    ],
    msgs: [
      { t: '0s', from: 'n1', to: 'sw1', proto: 'Slingshot', step: 0, info: 'SerDes → optical transceiver → fiber link up', short: 'link up', layers: [L('Physical link', [F('Electrical', 'SerDes ~200G class', null, 'NIC SerDes lanes.'), F('Optical', 'QSFP-class transceiver', null, 'Electrical↔optical conversion.'), F('Fiber', 'single-mode, polarisation-maintaining', null, 'Slingshot uses PM fiber for stability.', { eg: true }), F('State', 'link up, BER ok', null, '')])] },
      { t: '1s', from: 'n1', to: 'n3', via: ['sw1', 'core'], proto: 'Slingshot', step: 1, info: 'MPI send → rail A → core → rail B → node 3', short: 'MPI packet', layers: [L('Fabric path', [F('Route', 'n1→sw1→core→sw2→n3', null, 'Adaptive routing chose least-congested path.'), F('Redundancy', 'rail B alternate available', null, 'If rail A congests/fails, traffic reroutes.'), F('Flow control', 'credit-based', null, 'End-to-end and hop-by-hop flow control prevent loss.')])] },
      { t: '1.5s', from: 'n1', to: 'n3', via: ['sw1', 'core'], proto: 'Slingshot', step: 2, info: 'Dragonfly path: mostly short intra-rack links, few long links', short: 'dragonfly', layers: [L('Dragonfly topology', [F('Local links', 'short, intra-rack', null, 'Most traffic stays inside the rack group.'), F('Global links', 'fewer, longer', null, 'Connect switch groups — cable count stays manageable at scale.'), F('Result', 'many equal-cost paths', null, 'Adaptive routing spreads load.')])] },
      { t: '2s', from: 'sw1', to: 'sw1', proto: 'Slingshot', step: 3, info: 'Switch detects cable fault on port 12 → reroute via rail B', short: 'fault reroute', layers: [L('Failure handling', [F('Event', 'port 12 LOS (loss of signal)', null, 'Optical link dropped.'), F('Action', 'traffic shifts to alternate rail/path', null, 'Fabric converges in ms–s; jobs continue on remaining paths.'), F('Notify', 'fabric manager logs event', null, 'Visible to cluster management.')])] },
      { t: '3s', from: 'n1', to: 'sw1', proto: 'Slingshot', step: 4, info: 'Firmware version check: NIC 2.1.0 vs switch 2.1.0 OK', short: 'fw compat', layers: [L('Compatibility', [F('NIC FW', '2.1.0', null, '', { eg: true }), F('Switch FW', '2.1.0', null, 'Must match supported matrix.'), F('Cable', 'PMF-1 polarity', null, 'Wrong fiber polarity = link down despite good light.')])] },
    ],
  });

  /* =============== HMC firmware lifecycle =============== */
  LESSONS.push({
    id: 'hmc-lifecycle', cat: 'xd685', ord: 310, mins: 15,
    title: 'HMC firmware: update & recovery', subtitle: 'How the GPU baseboard\'s BMC stays healthy',
    keywords: 'hmc firmware update dual bank watchdog recovery erotp signature activation baseboard',
    tags: ['hmc', 'firmware', 'update', 'recovery', 'watchdog'],
    prereq: ['hmc-gpu', 'bmc-update'],
    intro: 'The HMC is a BMC — so its firmware follows the same rules: signed images, safe staging, automatic recovery if the new image fails to boot. This lesson follows an HMC update end-to-end and shows what happens when it goes wrong.',
    overview: [
      '<b>Update path</b>: admin → system iLO Redfish → internal link → HMC UpdateService. The bundle targets the HMC\'s firmware inventory. iLO may orchestrate (push to HMC) or the HMC pulls — implementation detail, but the admin only sees iLO\'s task.',
      '<b>Verification</b>: the HMC checks the image signature against its trusted key before writing anything. GPU-tray images additionally pass through each GPU\'s <b>ERoT</b> which enforces its own signature policy.',
      '<b>Safe flash</b>: dual-bank or equivalent — write the inactive bank, verify, switch boot source, arm a <b>watchdog</b>. If the new firmware doesn\'t boot and report health in time, hardware falls back to the old image automatically.',
      '<b>Recovery</b>: if both banks are bad, the HMC has a recovery path (golden image or reflash via the system BMC). Because the HMC is unreachable from the customer network, recovery is always mediated by iLO — which is why iLO↔HMC link health matters.',
      '<b>Activation</b>: some components need a baseboard power cycle; others self-activate. The task/monitor tells you which — check release notes for the exact reset required.',
    ],
    facts: [['Update entry', 'iLO Redfish → internal → HMC'], ['Verify', 'signature + manifest'], ['Safety', 'dual bank / watchdog fallback'], ['Recovery', 'golden image via iLO'], ['Activation', 'power cycle often required for GPU tray']],
    terms: [['Dual bank', 'Two firmware copies; boot the new one, fall back if it fails.'], ['Watchdog', 'Hardware timer resetting the chip if firmware hangs.'], ['ERoT', 'Per-GPU root of trust verifying its own firmware.'], ['Golden image', 'Known-good recovery copy never field-overwritten.'], ['Activation', 'Making a staged image boot next time.']],
    atWork: 'HMC updates are usually bundled with iLO/BIOS in an XD685 firmware bundle so versions stay compatible. When an update fails mid-way, the watchdog saves you — the HMC comes back on the old image and reports the failure through iLO\'s task log.',
    refs: [['OpenBMC code-update design (dual bank, activation)', 'https://github.com/openbmc/docs/blob/master/architecture/code-update/code-update.md'], ['DMTF PLDM firmware update DSP0267', 'https://www.dmtf.org/standards/pmci'], ['NVIDIA ERoT/SPDM overview', 'https://docs.nvidia.com/']],
    zones: [{ x: 330, y: 20, w: 640, h: 530, label: 'HMC update path' }],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin', sub: 'Redfish via iLO', x: 110, y: 270 },
      { id: 'ilo', type: 'bmc', label: 'iLO', sub: 'front door', x: 330, y: 270 },
      { id: 'hmc', type: 'bmc', label: 'HMC', sub: 'OpenBMC-derived', x: 600, y: 270, tag: 'HMC' },
      { id: 'sw', type: 'svc', label: 'Update mgr', sub: 'verify·stage·act', x: 600, y: 110 },
      { id: 'f0', type: 'flash', label: 'HMC bank A', sub: 'running', x: 830, y: 120 },
      { id: 'f1', type: 'flash', label: 'HMC bank B', sub: 'target', x: 900, y: 300 },
      { id: 'wd', type: 'cpld', label: 'Watchdog', sub: 'boot guard', x: 830, y: 460 },
    ],
    links: [
      { a: 'pc', b: 'ilo', kind: 'lan', label: 'HTTPS' }, { a: 'ilo', b: 'hmc', kind: 'usb', label: 'internal' },
      { a: 'hmc', b: 'sw', kind: 'sw' }, { a: 'sw', b: 'f0', kind: 'spi', label: 'CS0' }, { a: 'sw', b: 'f1', kind: 'spi', label: 'CS1' },
      { a: 'wd', b: 'sw', kind: 'gpio', label: 'kick / reset' },
    ],
    steps: [
      { title: 'Upload via iLO', sub: 'Admin sees one task', text: 'The admin uploads the HMC-targeted bundle to iLO\'s UpdateService (or iLO pulls it). iLO hands it to the HMC over the internal link; the admin polls iLO\'s Task — they never talk to the HMC directly.' },
      { title: 'Verify', sub: 'Signature before write', text: 'The HMC\'s update manager checks the manifest (correct target: HMC, not host BIOS) and verifies signatures with its trusted public key. GPU-tray components get an additional ERoT check downstream.' },
      { title: 'Stage to bank B', sub: 'Old image keeps running', text: 'The new image is written to the inactive flash bank (erase/program/poll like the BMC update lesson). The running firmware on bank A is untouched — the HMC keeps serving telemetry the whole time.' },
      { title: 'Arm watchdog + reboot', sub: 'Safe activation', text: 'The boot source is switched to bank B and a watchdog is armed. HMC reboots; if the new firmware doesn\'t signal healthy in time, hardware flips back to bank A — automatic recovery, no brick.' },
      { title: 'Confirm / recover', sub: 'Task result', text: 'On success, iLO\'s task completes and FirmwareInventory shows the new version. On failure, the task reports the error and the HMC is back on the old image — then you debug and retry.' },
    ],
    msgs: [
      { t: '0s', from: 'pc', to: 'ilo', proto: 'Redfish', step: 0, info: 'POST UpdateService (HMC-targeted bundle)', short: 'upload', layers: N.https(hs(C, BM, 56000, 443), 'POST /redfish/v1/UpdateService/update HTTP/1.1', Object.assign({ 'Content-Type': 'multipart/form-data; boundary=x' }, T), '--x ... hmc_bundle.fwpkg ...'), note: 'Target = FirmwareInventory/HMC (name varies). iLO forwards internally.' },
      { t: '5s', from: 'ilo', to: 'hmc', proto: 'Redfish', step: 0, info: 'Push bundle to HMC UpdateService (internal link)', short: 'to HMC', layers: N.https(hs(BI, HI, 40600, 443), 'POST /redfish/v1/UpdateService/update HTTP/1.1', Object.assign({ 'Content-Type': 'multipart/form-data; boundary=y' }, { Host: HI }), '--y ... hmc_bundle.fwpkg ...'), note: ipNote },
      { t: '10s', from: 'hmc', to: 'sw', proto: 'Verify', step: 1, info: 'MANIFEST check + signature verify: OK', short: 'verify OK', layers: [L('Verification', [F('Manifest', 'purpose=HMC, MachineName match', null, 'Rejects images meant for other components.'), F('Signature', 'RSA-SHA512 verify OK', null, 'Trusted public key burned into HMC firmware/rootfs.'), F('Result', 'proceed to stage', null, '')])] },
      { t: '15s', from: 'sw', to: 'f1', via: [], proto: 'SPI', step: 2, info: 'WREN + BLOCK ERASE + PAGE PROGRAM → bank B', short: 'flash bank B', layers: [L('SPI update (conceptual)', [F('Bank', 'B (inactive)', null, 'Bank A keeps running.'), F('Ops', 'WREN → erase 64 KB → program 256 B pages → verify', null, 'Same SPI sequence as the BMC update lesson.'), F('Time', 'minutes', null, 'HMC images are smaller than host BIOS.')])] },
      { t: '4m', from: 'hmc', to: 'wd', proto: 'Control', step: 3, info: 'Set boot bank = B, arm watchdog 300 s', short: 'arm WD', layers: [L('Activation', [F('Boot select', 'bank B', null, 'Boot ROM/config register chooses flash bank.'), F('Watchdog', 'armed 300 s', null, 'HMC must report healthy before expiry.'), F('Fallback', 'auto → bank A', null, 'Hardware bank-mux returns to known-good.')])] },
      { t: '4m', from: 'wd', to: 'hmc', proto: 'Reset', step: 3, info: 'HMC reboot → boot ROM fetches bank B', short: 'reboot', layers: sig('HMC_RESET / boot-bank select', 'bank B', 'New firmware starts; iLO link re-establishes.') },
      { t: '7m', from: 'pc', to: 'ilo', proto: 'Redfish', step: 4, info: 'GET Task → Completed; HMC FirmwareVersion = 3.4.1', short: 'done', layers: N.https(hs(C, BM, 56001, 443), 'GET /redfish/v1/TaskService/Tasks/9 HTTP/1.1', T) },
      { t: '—', from: 'hmc', to: 'wd', proto: 'Fault', step: 4, info: 'If bank B fails: watchdog expires → auto-fallback to bank A', short: 'fallback', layers: [L('Recovery path', [F('Trigger', 'no healthy signal in 300 s', null, ''), F('Action', 'boot bank A', null, 'Old firmware restored; task reports failure.'), F('Worst case', 'both banks bad → golden/recovery via iLO', null, 'Last resort: reflash recovery image through the internal link.')])] },
    ],
  });
})();
