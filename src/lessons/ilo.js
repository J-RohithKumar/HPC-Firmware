(function () {
  const { B, F, L, N, I, hx } = FX;
  const sig = FX.sig;
  const C = '10.0.0.5', BM = '10.0.0.20';
  const hs = (s, d, sp, dp) => ({ src: s, dst: d, tcp: [sp, dp, 1, 1, 'PSH,ACK'] });
  const T = { Host: 'ilo-node01', 'X-Auth-Token': '4f1c0e...9a' };

  /* =============== iLO architecture =============== */
  LESSONS.push({
    id: 'ilo-architecture', cat: 'ilo', ord: 160, mins: 14,
    title: 'Inside iLO', subtitle: 'The management processor in your server',
    keywords: 'ilo architecture bmc arm soc standby power dedicated nic shared port chif virtual media kvm firmware components',
    tags: ['ilo', 'architecture', 'bmc', 'management-processor'],
    prereq: ['networking-101', 'power-on'],
    intro: '<b>iLO</b> (Integrated Lights-Out) is HPE\'s BMC: a dedicated ARM-based management processor on the server board with its own CPU, memory, flash, network and OS. This lesson maps what lives inside it and how it reaches everything else.',
    overview: [
      'iLO runs on <b>standby power (12VSB)</b> — it is alive whenever AC is connected, host on or off. It boots its own firmware from its own SPI flash in ~30–90 s and exposes Redfish on 443, SSH on 22, IPMI (optional) and the remote-console port.',
      '<b>Two network personalities</b>: the <b>dedicated iLO port</b> (separate RJ45, the HPC default) and the <b>shared network port</b> (rides the host NIC over NC-SI — see that lesson).',
      '<b>In-band channels</b>: the host OS reaches iLO without the network via the <b>CHIF</b> PCIe channel (iLOrest local mode, AMS) and the DMTF Redfish Host Interface.',
      '<b>iLO is also hardware</b>: it contains the server\'s video controller (Matrox-class VGA) and a virtual USB hub, which is how remote KVM and virtual media work — iLO literally sits in the data path of keyboard, mouse, video and removable media.',
      'Firmware is a <b>bundle</b>: iLO firmware, BIOS/System ROM, NIC, storage controller, CPLD, power management — each flashed separately through the same UpdateService.',
    ],
    facts: [['Runs on', '12 V standby (always on with AC)'], ['CPU', 'ARM SoC (HPE GXP/iLO ASIC family)'], ['Ports', '443 HTTPS · 22 SSH · 623 IPMI opt · 17990 console (defaults vary)'], ['In-band', 'CHIF PCIe channel, Redfish Host Interface'], ['Video/USB', 'Integrated VGA + virtual USB hub'], ['Firmware', 'Bundle: iLO, BIOS, NIC, storage, CPLD, power']],
    terms: [['iLO', 'Integrated Lights-Out: HPE\'s BMC product (iLO 4/5/6/7 generations).'], ['CHIF', 'HPE Channel Interface: host↔iLO PCIe mailbox.'], ['AMS', 'Agentless Management Service: OS info pushed to iLO.'], ['Virtual media', 'Remote ISO/USB image mounted as a virtual DVD/drive on the host.'], ['Redfish Host Interface', 'DMTF DSP0270: virtual USB NIC giving the OS access to iLO Redfish.']],
    atWork: 'On XD685-class systems the system BMC is iLO; the GPU baseboard has its own HMC. Your team\'s firmware spans both. Learn the boundary: what iLO owns (host power, BIOS, host sensors) vs what the HMC owns (GPUs, NVLink, baseboard power).',
    refs: [['HPE iLO documentation', 'https://www.hpe.com/support/ilo'], ['DMTF Redfish Host Interface DSP0270', 'https://www.dmtf.org/dsp/DSP0270'], ['iLOrest', 'https://github.com/HewlettPackard/python-redfish-utility']],
    zones: [{ x: 380, y: 20, w: 590, h: 530, label: 'Server motherboard' }],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: 'browser / iLOrest', x: 120, y: 140 },
      { id: 'msw', type: 'switch', label: 'Mgmt switch', sub: 'OOB network', x: 330, y: 300 },
      { id: 'ilo', type: 'bmc', label: 'iLO', sub: 'ARM SoC · own flash', x: 640, y: 300, tag: 'BMC' },
      { id: 'psu', type: 'psu', label: 'PSU', sub: '12V + 12VSB', x: 640, y: 90 },
      { id: 'nic', type: 'nic', label: 'Host NIC', sub: 'shared port', x: 640, y: 500 },
      { id: 'host', type: 'host', label: 'Host', sub: 'CPU + OS', x: 900, y: 200 },
      { id: 'usb', type: 'usb', label: 'Virtual USB', sub: 'kbd · mouse · media', x: 900, y: 420 },
    ],
    links: [
      { a: 'pc', b: 'msw', kind: 'lan' }, { a: 'msw', b: 'ilo', kind: 'lan', label: 'OOB :443' }, { a: 'psu', b: 'ilo', kind: 'power', label: '12VSB' },
      { a: 'ilo', b: 'nic', kind: 'ncsi', label: 'NC-SI (shared)' }, { a: 'ilo', b: 'host', kind: 'pcie', label: 'CHIF + VGA' }, { a: 'ilo', b: 'usb', kind: 'usb' }, { a: 'usb', b: 'host', kind: 'usb' },
    ],
    steps: [
      { title: 'Always on', sub: '12 V standby powers iLO', text: 'AC connected → 12VSB rail → iLO boots from its SPI flash. The host may be completely off; iLO is already serving Redfish. This is why you can power on a server remotely.' },
      { title: 'Out-of-band', sub: 'Dedicated port', text: 'The dedicated iLO port is a normal Ethernet interface on the management network. Admin HTTPS lands directly on the iLO SoC — no host involvement at all.' },
      { title: 'Shared port', sub: 'Same wire as host NIC', text: 'If configured for shared network port, iLO traffic enters via the host NIC and is forwarded over <b>NC-SI</b> sideband to iLO (see the NC-SI lesson for the control handshake).'},
      { title: 'In-band', sub: 'CHIF and host interface', text: 'Software on the host (iLOrest local mode, AMS, the Redfish Host Interface) reaches iLO over the PCIe host channel — same Redfish API, no network needed.' },
      { title: 'Console & media', sub: 'iLO sits in the I/O path', text: 'iLO owns the VGA controller and a virtual USB hub. Remote console streams the framebuffer; virtual media presents ISOs as virtual drives; keyboard/mouse are injected as USB HID — all encrypted over the management link.' },
      { title: 'Firmware bundle', sub: 'Many components, one page', text: 'iLO firmware, System ROM (BIOS), NIC, storage controller, CPLD, power management firmware: each is a separate updatable component under UpdateService/FirmwareInventory, often released together as a bundle.' },
    ],
    msgs: [
      { t: '0s', from: 'psu', to: 'ilo', proto: 'Power', step: 0, info: 'AC applied → 12VSB rail powers iLO SoC', short: '12VSB on', layers: sig('VCC_12VSB', '12.0 V', 'Standby rail: iLO, CPLD and NIC sideband logic are alive with host off.', [F('Host rails', 'OFF', null, 'Main 12 V stays off until power-on.')]) },
      { t: '30s', from: 'ilo', to: 'ilo', proto: 'Boot', step: 0, info: 'iLO firmware boots: flash → kernel → services (typical < 90 s)', short: 'iLO boot', layers: [L('iLO boot', [F('Flash', 'dedicated SPI NOR', null, 'Separate from BIOS flash.'), F('Services', 'web/REST, SSH, IPMI, sensors, power control', null, ''), F('Ready', 'Redfish on :443', null, '')])] },
      { t: '1m', from: 'pc', to: 'ilo', via: ['msw'], proto: 'Redfish', step: 1, info: 'GET /redfish/v1 via dedicated port', short: 'OOB GET', layers: N.https(hs(C, BM, 52100, 443), 'GET /redfish/v1 HTTP/1.1', { Host: 'ilo-node01' }) },
      { t: '2m', from: 'pc', to: 'ilo', via: ['msw', 'nic'], proto: 'Redfish', step: 2, info: 'Same GET via shared port: NIC → NC-SI → iLO', short: 'shared GET', layers: N.https(hs('10.0.0.5', '10.0.0.20', 52101, 443), 'GET /redfish/v1 HTTP/1.1', { Host: 'ilo-node01' }), note: 'Frames to iLO\'s MAC are forwarded by the NIC over the NC-SI sideband — see "Shared NIC: NC-SI".' },
      { t: '3m', from: 'host', to: 'ilo', proto: 'CHIF', step: 3, info: 'iLOrest local mode: Redfish over CHIF PCIe channel', short: 'in-band GET', layers: [L('CHIF request (conceptual)', [F('Transport', 'PCIe mailbox / shared memory', null, 'HPE-proprietary channel; details are internal.'), F('Payload', 'GET /redfish/v1/Systems/1', B.ascii('GET /redfish/v1/Systems/1'), 'Same REST call, carried without TCP/IP.'), F('Auth', 'host OS privilege + iLO host-auth policy', null, '')])] },
      { t: '4m', from: 'ilo', to: 'host', via: ['usb'], proto: 'USB HID', step: 4, info: 'Virtual media: host sees iLO-presented virtual DVD', short: 'vmedia mount', layers: [L('Virtual media', [F('Device', 'virtual DVD/USB key', null, 'iLO emulates a USB CD/DVD or flash drive.'), F('Backing', 'remote ISO/IMG file', null, 'Read over the management network on demand.'), F('Host view', '/dev/sr0 or /dev/sdX', null, 'Host OS cannot tell it from real media.')])] },
      { t: '5m', from: 'ilo', to: 'pc', via: ['msw'], proto: 'KVM', step: 4, info: 'Remote console: encrypted video stream + input events', short: 'KVM stream', layers: [L('Remote console', [F('Video', 'VGA framebuffer → compressed stream', null, 'iLO owns the graphics chip, so it sees exactly what a monitor would.'), F('Input', 'keyboard/mouse → USB HID', null, 'Injected into the host\'s virtual USB hub.'), F('Transport', 'TLS over :17990 or HTTPS', null, 'HTML5 console uses WebSocket inside TLS.')])] },
      { t: '6m', from: 'pc', to: 'ilo', via: ['msw'], proto: 'Redfish', step: 5, info: 'GET FirmwareInventory → [iLO, BIOS, NIC1, Storage, CPLD, Power]', short: 'inventory', layers: N.https(hs(C, BM, 52102, 443), 'GET /redfish/v1/UpdateService/FirmwareInventory HTTP/1.1', T) },
    ],
  });

  /* =============== iLO REST API specifics =============== */
  LESSONS.push({
    id: 'ilo-rest-api', cat: 'ilo', ord: 180, mins: 12,
    title: 'iLO REST API walk-through', subtitle: 'Managers, Systems, Tasks — the iLO way',
    keywords: 'ilo redfish managers systems tasks firmwareinventory sessionservice oem hpe ilorest',
    tags: ['ilo', 'redfish', 'rest', 'api', 'ilorest'],
    prereq: ['redfish', 'ilo-architecture'],
    intro: 'Generic Redfish was covered earlier. This lesson walks the <b>iLO-specific</b> resources you will actually script against daily: <code>Managers/1</code> is iLO itself, <code>Systems/1</code> is the host, and everything long-running is a <b>Task</b>.',
    overview: [
      '<b>Managers/1</b> represents iLO: firmware version, model, status, network, virtual media, security state. <b>Systems/1</b> is the host computer. <b>Chassis/1</b> has power/thermal. The mapping differs from OpenBMC (<code>/Managers/bmc</code>, <code>/Systems/system</code>) — always check the service root.',
      '<b>Sessions</b>: POST to SessionService/Sessions with iLO credentials → X-Auth-Token. iLO also supports basic auth per request (simpler, slower). Session slots are limited — DELETE when done.',
      '<b>Tasks</b>: firmware updates, virtual media ops and some actions return <b>202 + Task URI</b>. Poll <code>TaskService/Tasks/N</code> until TaskState=Completed. iLO tasks carry Messages with MessageIds like <code>iLO.2.36.UpdateSuccessful</code>.',
      '<b>Oem.Hpe</b>: iLO extensions live under <code>"Oem": {"Hpe": {...}}</code> — e.g. server power reg ExplicitPowerAction, ilo federation, smart storage. The public iLO Redfish API reference documents them; expect them to evolve between iLO generations.',
    ],
    facts: [['iLO IDs', '/Managers/1 (iLO), /Systems/1, /Chassis/1'], ['Auth', 'Session token or HTTP Basic'], ['Tasks', '202 + TaskService/Tasks/N'], ['OEM', 'Oem.Hpe namespace'], ['Tool', 'iLOrest wraps all of this']],
    terms: [['Manager resource', 'The BMC/iLO itself in Redfish terms.'], ['Task monitor', 'URI polled for long-operation status.'], ['Oem.Hpe', 'HPE-specific Redfish extensions.'], ['Session slot', 'Limited concurrent sessions per iLO.'], ['iLOrest', 'HPE python CLI/library for iLO Redfish.']],
    atWork: 'Daily-driver commands: <code>ilorest login</code>, <code>show /map1</code>, <code>view sel</code>, <code>load -f fw.fwpkg</code>. Firmware team tip: always GET the resource before PATCH — iLO rejects unknown properties and versions move fast.',
    refs: [['HPE iLO Redfish API reference', 'https://servermanagementportal.ext.hpe.com/docs/redfishservices/'], ['iLOrest GitHub', 'https://github.com/HewlettPackard/python-redfish-utility'], ['DMTF Redfish schemas', 'https://redfish.dmtf.org/schemas/']],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin / script', sub: 'curl · iLOrest', x: 140, y: 280 },
      { id: 'sw', type: 'switch', label: 'Mgmt switch', sub: 'OOB', x: 420, y: 280 },
      { id: 'ilo', type: 'bmc', label: 'iLO Redfish', sub: ':443', x: 720, y: 280 },
    ],
    links: [{ a: 'pc', b: 'sw', kind: 'lan' }, { a: 'sw', b: 'ilo', kind: 'lan', label: 'HTTPS' }],
    steps: [
      { title: 'Login', sub: 'Session token', text: 'POST credentials to <code>/redfish/v1/SessionService/Sessions</code>. iLO replies 201 with <b>X-Auth-Token</b> and a Location to DELETE later.' },
      { title: 'Discover iLO', sub: 'GET /Managers/1', text: 'The Manager resource is iLO itself: FirmwareVersion, Model, Status, network interfaces, virtual media, security dashboard links. This is where "what iLO version is this" is answered.' },
      { title: 'Read the host', sub: 'GET /Systems/1', text: 'PowerState, BiosVersion, processors, memory, health, boot sources, Oem.Hpe extensions (e.g. server power reg state). Links out to Processors, Memory, Storage, EthernetInterfaces.' },
      { title: 'Act', sub: 'Actions and PATCH', text: 'Power = POST <code>Systems/1/Actions/ComputerSystem.Reset</code>; settings = PATCH on the resource; virtual media = POST <code>VirtualMedia/&lt;id&gt;/Actions/VirtualMedia.InsertMedia</code>. Always read AllowableValues first.' },
      { title: 'Tasks', sub: 'Poll, don\'t guess', text: 'Long ops return 202 + a Task URI. Poll <code>TaskService/Tasks/N</code> until <code>TaskState</code> is Completed/Killed/Exception — iLO includes Messages with MessageIds explaining failures.' },
    ],
    msgs: [
      { t: '0.0s', from: 'pc', to: 'ilo', via: ['sw'], proto: 'HTTPS', step: 0, info: 'POST /redfish/v1/SessionService/Sessions', short: 'login', layers: N.https(hs(C, BM, 53000, 443), 'POST /redfish/v1/SessionService/Sessions HTTP/1.1', { Host: 'ilo-node01', 'Content-Type': 'application/json' }, { UserName: 'admin', Password: '********' }) },
      { t: '0.3s', from: 'ilo', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 0, info: '201 Created + X-Auth-Token', short: '201 + token', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 201 Created', { 'X-Auth-Token': '4f1c0e...9a', Location: '/redfish/v1/SessionService/Sessions/admin0000000064c8/' }, { UserName: 'admin' }) },
      { t: '0.5s', from: 'pc', to: 'ilo', via: ['sw'], proto: 'HTTPS', step: 1, info: 'GET /redfish/v1/Managers/1', short: 'GET Managers/1', layers: N.https(hs(C, BM, 53000, 443), 'GET /redfish/v1/Managers/1 HTTP/1.1', T) },
      { t: '0.6s', from: 'ilo', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 1, info: '200 OK: iLO 6 v2.10, Status OK, Model "iLO"', short: 'Manager info', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { Id: '1', Name: 'iLO', ManagerType: 'BMC', FirmwareVersion: 'iLO 6 v2.10', Model: 'iLO', Status: { Health: 'OK', State: 'Enabled' }, VirtualMedia: { '@odata.id': '/redfish/v1/Managers/1/VirtualMedia' }, SerialInterfaces: { '@odata.id': '/redfish/v1/Managers/1/SerialInterfaces' }, Oem: { Hpe: { '@odata.type': '#HpeManager.v2_0_0.HpeManager', HostPower: 'On', License: 'iLO Advanced' } } }), note: 'Oem.Hpe carries iLO-specific data: license, host power, federation.' },
      { t: '1.0s', from: 'pc', to: 'ilo', via: ['sw'], proto: 'HTTPS', step: 2, info: 'GET /redfish/v1/Systems/1?$expand=Processors,Memory', short: 'GET System', layers: N.https(hs(C, BM, 53000, 443), 'GET /redfish/v1/Systems/1?$expand=Processors,Memory HTTP/1.1', T) },
      { t: '1.2s', from: 'ilo', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 2, info: '200 OK ComputerSystem + Oem.Hpe.ServerPowerReg', short: 'System info', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { Id: '1', PowerState: 'On', BiosVersion: 'U54 v2.10', ProcessorSummary: { Count: 2, Model: 'AMD EPYC' }, MemorySummary: { TotalSystemMemoryGiB: 512 }, Boot: { BootSourceOverrideTarget: 'None' }, Oem: { Hpe: { '@odata.type': '#HpeComputerSystem.v2_10_0.HpeComputerSystem', ServerPowerReg: { 'State@Redfish.AllowableValues': ['On', 'Off', 'ColdOff', 'Reset'] }, PowerRegulator: { 'AveragePowerCap': 1000, 'MinimumCap': 250, 'MaximumCap': 2000 } } } }), note: 'PowerRegulator is an HPE OEM feature for rack power budgeting — directly relevant to HPC power capping.' },
      { t: '2.0s', from: 'pc', to: 'ilo', via: ['sw'], proto: 'HTTPS', step: 3, info: 'POST Systems/1/Actions/ComputerSystem.Reset {"ResetType":"ForceRestart"}', short: 'POST Reset', layers: N.https(hs(C, BM, 53000, 443), 'POST /redfish/v1/Systems/1/Actions/ComputerSystem.Reset HTTP/1.1', Object.assign({ 'Content-Type': 'application/json' }, T), { ResetType: 'ForceRestart' }) },
      { t: '2.1s', from: 'ilo', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 3, info: '200 OK @Message.ExtendedInfo', short: '200', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { error: { code: 'iLO.0.10.ExtendedInfo', '@Message.ExtendedInfo': [{ MessageId: 'Base.1.4.Success' }] } }) },
      { t: '3.0s', from: 'pc', to: 'ilo', via: ['sw'], proto: 'HTTPS', step: 4, info: 'GET /redfish/v1/TaskService/Tasks/12', short: 'poll task', layers: N.https(hs(C, BM, 53000, 443), 'GET /redfish/v1/TaskService/Tasks/12 HTTP/1.1', T) },
      { t: '3.0s', from: 'ilo', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 4, info: '200 OK TaskState Completed, PercentComplete 100', short: 'Completed', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { Id: '12', TaskState: 'Completed', TaskStatus: 'OK', PercentComplete: 100, Messages: [{ MessageId: 'iLO.2.36.UpdateSuccessful' }] }) },
      { t: '3.5s', from: 'pc', to: 'ilo', via: ['sw'], proto: 'HTTPS', step: 4, info: 'DELETE session', short: 'logout', layers: N.https(hs(C, BM, 53000, 443), 'DELETE /redfish/v1/SessionService/Sessions/admin0000000064c8/ HTTP/1.1', T) },
    ],
  });

  /* =============== iLO security =============== */
  LESSONS.push({
    id: 'ilo-security', cat: 'ilo', ord: 200, mins: 12,
    title: 'iLO security', subtitle: 'Auth, TLS, directory services and lockout',
    keywords: 'ilo security authentication directory ldap tls fips lockout privilege host authentication certificate',
    tags: ['ilo', 'security', 'tls', 'auth', 'fips'],
    prereq: ['ilo-architecture', 'redfish'],
    intro: 'iLO is a network-facing root of trust for the whole server: whoever controls iLO controls power, console, firmware and (via virtual media) the host. Its security model has several layers worth understanding as a firmware engineer.',
    overview: [
      '<b>Accounts</b>: local iLO accounts with privileges (<b>Operator</b> = read-only-ish, <b>Administrator</b> = full). Better: <b>directory integration</b> (LDAP/AD) so accounts and groups are managed centrally — critical at fleet scale.',
      '<b>Login security</b>: iLO supports <b>login lockout</b> after N failed attempts and configurable delays — brute-force protection. Combined with strong passwords or directory auth + MFA where supported.',
      '<b>TLS</b>: iLO serves HTTPS with certificates (self-signed by default; import CA-signed). <b>FIPS mode</b> restricts to FIPS-validated algorithms — required in many gov/regulated environments and changes available cipher suites.',
      '<b>Host authentication</b>: controls whether in-band tools (iLOrest local, AMS) need credentials. "local"/"directory"/"localdirectory" options trade convenience vs security — a common hardening knob.',
      '<b>Firmware integrity</b>: iLO firmware images are signed; iLO verifies before flashing and at boot (secure boot chain with the board\'s root of trust). Downgrade/rollback policy is a security decision, not just convenience.',
    ],
    facts: [['Privileges', 'Operator vs Administrator'], ['Directory', 'LDAP / Active Directory integration'], ['Lockout', 'N failures → temporary lock'], ['TLS', 'HTTPS only; FIPS mode option'], ['Host auth', 'local / directory / localdirectory'], ['Firmware', 'Signed images, verified at flash + boot']],
    terms: [['Directory integration', 'iLO auth against LDAP/AD instead of local accounts.'], ['Login lockout', 'Temporary account/IP lock after failed attempts.'], ['FIPS mode', 'Restricts crypto to FIPS 140-validated algorithms.'], ['Host authentication', 'Credential policy for in-band (CHIF/host-interface) access.'], ['Secure boot', 'Signed firmware verified by hardware root of trust at boot.']],
    atWork: 'HPC sites standardise: directory auth, FIPS where required, dedicated mgmt VLANs ACL\'d to jump hosts, IPMI/SSH often disabled leaving Redfish+HTTPS only. As firmware engineers you implement and test these paths — the auth code is as critical as the power code.',
    refs: [['HPE iLO security guidance', 'https://www.hpe.com/us/en/servers/security.html'], ['DMTF Redfish auth specs', 'https://www.dmtf.org/standards/redfish'], ['NIST SP 800-193 platform firmware resiliency', 'https://csrc.nist.gov/pubs/sp/800/193/final']],
    zones: [{ x: 380, y: 20, w: 590, h: 530, label: 'iLO security layers (conceptual)' }],
    nodes: [
      { id: 'adm', type: 'laptop', label: 'Admin / tool', sub: 'iLOrest · script', x: 120, y: 270 },
      { id: 'tls', type: 'svc', label: 'TLS endpoint', sub: 'HTTPS :443', x: 420, y: 120 },
      { id: 'auth', type: 'svc', label: 'Auth layer', sub: 'local / directory', x: 640, y: 270 },
      { id: 'ad', type: 'svc', label: 'Directory', sub: 'LDAP / AD', x: 900, y: 120 },
      { id: 'pol', type: 'cpld', label: 'Policy engine', sub: 'lockout · FIPS · host-auth', x: 900, y: 420 },
      { id: 'ilo', type: 'bmc', label: 'iLO core', sub: 'what auth protects', x: 640, y: 480 },
      { id: 'host', type: 'host', label: 'Host OS', sub: 'in-band caller', x: 150, y: 480 },
    ],
    links: [
      { a: 'adm', b: 'tls', kind: 'lan', label: 'TLS' }, { a: 'tls', b: 'auth', kind: 'sw' }, { a: 'auth', b: 'ad', kind: 'lan', label: 'LDAPS :636' },
      { a: 'auth', b: 'pol', kind: 'sw' }, { a: 'pol', b: 'ilo', kind: 'gpio', label: 'grant / deny' },
    ],
    steps: [
      { title: 'Who may connect', sub: 'Network + privilege', text: 'First gate is network reachability (dedicated VLAN, ACLs). Then the account\'s <b>privilege</b>: Operator can view; Administrator can change power, firmware, users. Least-privilege matters — an Operator credential cannot reflash iLO.' },
      { title: 'Authenticate', sub: 'Local or directory', text: 'iLO checks credentials against local accounts or a bound <b>directory (LDAP/AD)</b> over LDAPS. Directory integration means one password policy, group-based privileges and instant deprovisioning at fleet scale.' },
      { title: 'Lockout', sub: 'Slow the attackers', text: '<b>Login lockout</b> temporarily locks an account (or source) after repeated failures. Watch for it in the field: a monitoring system retrying with a stale password can lock itself out — a classic "why did monitoring lose iLO" bug.' },
      { title: 'Transport', sub: 'TLS + FIPS', text: 'All web/REST traffic is TLS. FIPS mode narrows cipher suites to validated ones — required in regulated environments. Certificate management (import CA-signed cert) removes browser warnings and enables proper PKI.' },
      { title: 'In-band & firmware', sub: 'The deeper gates', text: '<b>Host authentication</b> decides if CHIF/host-interface calls need credentials. And every iLO image is <b>signed</b>: the BMC verifies the signature at flash time and the boot chain verifies it again — firmware integrity is enforced in silicon, not just policy.' },
    ],
    msgs: [
      { t: '0s', from: 'adm', to: 'tls', proto: 'HTTPS', step: 0, info: 'TLS ClientHello → iLO cert presented', short: 'TLS handshake', layers: N.packet({ eth: ['02:00:0a:fe:00:01', '94:40:c9:aa:bb:cc'], src: '10.1.0.5', dst: '10.1.0.20', tcp: [52100, 443, 100, 0, 'PSH,ACK'], app: [N.tlsHdr(180), L('TLS 1.3 handshake', [F('Server cert', 'CN=ilo-node01, CA-signed', B.enc(60), 'iLO presents its certificate; client validates chain.', { enc: true })]), N.tlsTag()] }) },
      { t: '0.2s', from: 'tls', to: 'auth', proto: 'Auth', step: 1, info: 'Credentials: user "hpc-ops" → directory lookup', short: 'auth check', layers: [L('Authentication', [F('User', 'hpc-ops', B.ascii('hpc-ops'), ''), F('Source', 'LDAP bind to AD', null, 'LDAPS :636 with service account.'), F('Result', 'member of "iLO-Admins" → Administrator', null, 'Group membership maps to iLO privilege.')])] },
      { t: '0.3s', from: 'auth', to: 'ad', proto: 'LDAPS', step: 1, info: 'BIND + search memberOf for iLO-Admins', short: 'LDAP query', layers: [L('Directory query (conceptual)', [F('Bind DN', 'CN=iLO-svc,OU=svc,DC=hpe,DC=local', null, 'Service account iLO binds as.'), F('Filter', '(sAMAccountName=hpc-ops)', B.ascii('(sAMAccountName=hpc-ops)'), ''), F('Attrs', 'memberOf → CN=iLO-Admins', null, 'Maps to Administrator privilege.')])] },
      { t: '1.0s', from: 'adm', to: 'tls', proto: 'HTTPS', step: 2, info: '5 failed logins → lockout 30 min', short: 'LOCKOUT', layers: [L('Login lockout', [F('Threshold', '5 failures', null, 'iLO configurable: N attempts → lock.'), F('Effect', 'account/IP locked 30 min', null, 'Brute-force slows to a crawl.', { eg: true }), F('Gotcha', 'monitoring with stale creds locks itself', null, 'Use a dedicated read-only account for polling.')])] },
      { t: '2.0s', from: 'tls', to: 'pol', proto: 'Policy', step: 3, info: 'FIPS mode ON → only FIPS-validated ciphers', short: 'FIPS policy', layers: [L('FIPS mode', [F('State', 'Enabled', null, 'Requires iLO reset to change.'), F('Effect', 'TLS 1.2/1.3 FIPS cipher suites only', null, 'Some older clients may fail — test before enabling fleet-wide.'), F('Certs', 'must meet FIPS key requirements', null, '')])] },
      { t: '3.0s', from: 'host', to: 'pol', proto: 'CHIF', step: 4, info: 'iLOrest local call → host-auth policy check', short: 'host auth', layers: [L('Host authentication', [F('Setting', 'localdirectory', null, 'iLO accepts local or directory creds for in-band.'), F('Check', 'caller UID + iLO policy', null, 'Root/admin with proper iLO setting can manage without network creds.'), F('Risk', '"local" alone = any local admin is iLO admin', null, 'Review before enabling in shared environments.')])] },
      { t: '4.0s', from: 'pol', to: 'ilo', proto: 'Grant', step: 4, info: 'Signed firmware image → verify → flash', short: 'signed flash', layers: [L('Firmware integrity', [F('Image', '.fwpkg signed by HPE', null, ''), F('Verify', 'signature check at upload AND boot', null, 'Tampered or unsigned images rejected.'), F('Rollback', 'policy-controlled', null, 'Anti-rollback may block older-but-valid images.')])] },
    ],
  });

  /* =============== Virtual media & KVM =============== */
  LESSONS.push({
    id: 'ilo-vmedia-kvm', cat: 'ilo', ord: 220, mins: 12,
    title: 'Virtual media & KVM console', subtitle: 'Remote ISO mount and the HTML5 console',
    keywords: 'ilo virtual media iso kvm html5 console remote console hid keyboard mouse websocket',
    tags: ['ilo', 'virtual-media', 'kvm', 'remote-console', 'iso'],
    prereq: ['ilo-paths', 'redfish'],
    intro: 'Two killer iLO features for an HPC firmware team: <b>virtual media</b> (mount an ISO from your laptop as a virtual DVD on a remote server) and the <b>HTML5 KVM console</b> (BIOS setup, OS install, break-glass recovery — no monitor needed).',
    overview: [
      '<b>Virtual media</b>: iLO emulates USB CD/DVD (and USB key) devices on the host. You tell iLO a URL for the image (HTTP/HTTPS/NFS/SMB share — iLO fetches it), and the host sees a normal optical drive. Used for OS installs, firmware updates, diagnostics across hundreds of nodes.',
      '<b>Remote console (KVM)</b>: iLO owns the VGA controller and virtual USB. It captures the framebuffer, compresses it and streams it encrypted to your browser (HTML5 WebSocket console; legacy .NET IRC exists). Your keystrokes/mouse go back as <b>USB HID reports</b> — the host cannot distinguish them from real devices, so it works in BIOS and bootloaders.',
      '<b>Workflow</b>: POST to <code>VirtualMedia/&lt;id&gt;/Actions/VirtualMedia.InsertMedia</code> with Image URI + write-protect → host sees /dev/sr0 → boot from it. For KVM: open the console URL, authenticate, get video + input channel.',
      '<b>Caveats</b>: performance depends on management network bandwidth/latency (compressed video, not full motion); ISO images should be served over HTTP(S) reachable by iLO; always eject media when done — a mounted writable image can be modified by the host.',
    ],
    facts: [['Virtual media', 'USB CD/DVD + USB key emulation'], ['Image sources', 'HTTP/HTTPS, NFS, SMB/CIFS'], ['KVM', 'HTML5 WebSocket console (TLS)'], ['Input', 'USB HID keyboard/mouse reports'], ['Legacy', '.NET IRC remote console (older iLO)']],
    terms: [['InsertMedia', 'Redfish action mounting an image URI as virtual media.'], ['EjectMedia', 'Unmounting the virtual device.'], ['HID report', '8-byte USB keyboard packet injected as if from a real keyboard.'], ['Framebuffer', 'Raw VGA memory iLO reads to build the video stream.'], ['Write-protect', 'Mount option making the virtual media read-only.']],
    atWork: 'In HPC this is the break-glass path: when a node won\'t boot or needs BIOS config on 500 machines, virtual media + KVM is how firmware engineers reproduce and fix it remotely. Automation via Redfish makes it scriptable at scale.',
    refs: [['HPE iLO virtual media docs', 'https://www.hpe.com/support/ilo'], ['iLO remote console guide', 'https://www.hpe.com/us/en/servers/remote-console.html'], ['USB HID spec (usage tables)', 'https://www.usb.org/hid']],
    zones: [{ x: 330, y: 20, w: 640, h: 530, label: 'iLO in the I/O path' }],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: 'browser · ISO host', x: 120, y: 270 },
      { id: 'ilo', type: 'bmc', label: 'iLO', sub: 'media + console engine', x: 560, y: 270, tag: 'BMC' },
      { id: 'host', type: 'host', label: 'Host', sub: 'sees virtual DVD', x: 850, y: 130 },
      { id: 'vga', type: 'device', label: 'VGA fb', sub: 'framebuffer', x: 850, y: 420 },
    ],
    links: [
      { a: 'pc', b: 'ilo', kind: 'lan', label: 'HTTPS/ISO' }, { a: 'ilo', b: 'host', kind: 'usb', label: 'virtual DVD' },
      { a: 'ilo', b: 'vga', kind: 'pcie', label: 'read fb' }, { a: 'ilo', b: 'pc', kind: 'lan', label: 'KVM stream', t: .7 },
    ],
    steps: [
      { title: 'Insert media', sub: 'Redfish action', text: 'POST <code>VirtualMedia/1/Actions/VirtualMedia.InsertMedia</code> with <code>Image</code> (URL), <code>WriteProtected</code>, <code>Inserted</code>. iLO connects to the image source and begins emulating a USB optical drive.' },
      { title: 'Host sees a drive', sub: '/dev/sr0', text: 'The host OS enumerates a virtual CD/DVD. Mount or boot from it like real media — OS installers, diagnostics, firmware update ISOs all work.' },
      { title: 'KVM console', sub: 'HTML5 remote desktop', text: 'Open the iLO remote-console URL (port 17990 default or via HTTPS). iLO streams the VGA framebuffer over TLS WebSocket; your browser renders it.' },
      { title: 'Input injection', sub: 'You are a USB keyboard', text: 'Keystrokes become <b>USB HID reports</b> delivered to the host\'s virtual USB hub. Mouse moves become HID reports too. Works in BIOS/bootloader because it is real USB input, not OS software.' },
      { title: 'Cleanup', sub: 'Eject when done', text: 'POST <code>EjectMedia</code> (or unmount in UI). Leaving writable media mounted lets the host modify the backing image — always eject, especially shared images.' },
    ],
    msgs: [
      { t: '0s', from: 'pc', to: 'ilo', proto: 'Redfish', step: 0, info: 'POST VirtualMedia/1/Actions/VirtualMedia.InsertMedia', short: 'InsertMedia', layers: N.https(hs(C, BM, 54000, 443), 'POST /redfish/v1/Managers/1/VirtualMedia/1/Actions/VirtualMedia.InsertMedia HTTP/1.1', Object.assign({ 'Content-Type': 'application/json' }, T), { Image: 'https://10.0.0.5/images/proliant-diagnostics.iso', WriteProtected: true, Inserted: true }) },
      { t: '0.5s', from: 'ilo', to: 'pc', proto: 'Redfish', step: 0, info: '200 OK: VirtualMedia State=Inserted', short: 'Inserted', layers: N.https(hs(BM, C, 443, 54000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { Id: '1', Inserted: true, Image: 'https://10.0.0.5/images/proliant-diagnostics.iso', WriteProtected: true, MediaTypes: ['CD', 'DVD', 'USBStick'] }) },
      { t: '2s', from: 'ilo', to: 'host', proto: 'USB', step: 1, info: 'Host USB enumeration: virtual DVD appears', short: 'virtual DVD', layers: [L('USB device', [F('Class', 'Mass Storage / CD-ROM', null, 'Emulated device on iLO\'s virtual USB hub.'), F('Host sees', '/dev/sr0 (or /dev/sdX)', null, 'OS mounts it normally.'), F('Backing', 'remote ISO via HTTP', null, 'iLO reads sectors on demand over mgmt network.')])] },
      { t: '3s', from: 'pc', to: 'ilo', proto: 'KVM', step: 2, info: 'Open remote console → WebSocket over TLS', short: 'console open', layers: [L('Console session', [F('URL', 'https://ilo:17990 or /html5', null, 'HTML5 console; legacy .NET IRC on older iLO.'), F('Auth', 'iLO login required', null, 'Same accounts/privileges as Redfish.'), F('Channel', 'WSS (WebSocket over TLS)', null, 'Video down, input up.')])] },
      { t: '4s', from: 'ilo', to: 'pc', proto: 'KVM', step: 2, info: 'Video frame stream (compressed changed regions)', short: 'video', layers: [L('Video stream', [F('Source', 'VGA framebuffer @ iLO', null, 'iLO IS the graphics controller — sees BIOS, bootloader, OS.'), F('Encoding', 'compressed tiles, delta updates', null, 'Only changed screen regions sent; low bandwidth.'), F('Latency', 'network-dependent', null, 'Typing feels local on LAN; video is view-only quality.')])] },
      { t: '5s', from: 'pc', to: 'ilo', proto: 'KVM', step: 3, info: 'Key press "Del" → USB HID report to host', short: 'HID key', layers: [L('USB HID keyboard report · 8 bytes', [F('Modifiers', 'none', [0], 'Ctrl/Shift/Alt/GUI bits.'), F('Reserved', '', [0], ''), F('Key 1', '0x4F = Delete', [0x4f], 'HID usage ID.'), F('Keys 2–6', 'none', B.zeros(5), 'Up to 6 simultaneous.')], 'Injected into the host\'s virtual USB hub — indistinguishable from a physical keyboard, so it works in BIOS setup.')] },
      { t: '6s', from: 'pc', to: 'ilo', proto: 'Redfish', step: 4, info: 'POST VirtualMedia/1/Actions/VirtualMedia.EjectMedia', short: 'EjectMedia', layers: N.https(hs(C, BM, 54000, 443), 'POST /redfish/v1/Managers/1/VirtualMedia/1/Actions/VirtualMedia.EjectMedia HTTP/1.1', Object.assign({ 'Content-Type': 'application/json' }, T), { Image: '' }) },
    ],
  });
})();
