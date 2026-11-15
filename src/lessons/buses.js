(function () {
  const { B, F, L, N, I, hx } = FX;
  const i2c = (addr, rw) => F('Address + ' + (rw ? 'R' : 'W'), hx(addr) + (rw ? ' read' : ' write'), [(addr << 1) | rw], '7-bit target address shifted left one bit; LSB is 0 for write, 1 for read. Every byte is followed by an ACK bit from the receiver.');
  const lin11 = w => { let e = w >> 11; if (e > 15) e -= 32; let m = w & 0x7ff; if (m > 1023) m -= 2048; return m * Math.pow(2, e); };

  /* =============== I2C / PMBus sensors =============== */
  const pout = 0xfabc, pec1 = B.crc8([0xb0, 0x96, 0xb1, pout & 255, pout >> 8]);
  const tmp = 0x1f << 11 | 0x40; // placeholder not used
  LESSONS.push({
    id: 'i2c-sensors', cat: 'buses', title: 'Sensors: I²C & PMBus', subtitle: 'How the BMC reads temps, power, FRU',
    keywords: 'i2c smbus pmbus linear11 mux pca9548 tmp75 fru eeprom fan pwm pec',
    intro: 'Almost every sensor in a server hangs off a slow two-wire bus: <b>I²C</b> (and its stricter cousins SMBus/PMBus). The BMC is the bus controller and reads each chip by its address.',
    overview: [
      '<b>I²C</b> has two wires: SDA (data) and SCL (clock). A transaction is: START, address byte (7-bit address + R/W bit), data bytes (each ACKed), STOP. A <b>repeated START</b> lets you write a register pointer and then read without releasing the bus.',
      'Servers have dozens of devices with clashing addresses, so they use <b>I²C muxes</b> (e.g. PCA9548 at 0x70). You write one byte to the mux to choose a downstream channel.',
      '<b>PMBus</b> is SMBus plus standard power commands (READ_VIN 0x88, READ_IOUT 0x8C, READ_TEMPERATURE_1 0x8D, READ_POUT 0x96, ...), used by PSUs and voltage regulators. Values use compact formats like <b>LINEAR11</b>. An optional <b>PEC</b> byte (CRC-8) protects against corruption.',
    ],
    facts: [['Speeds', '100 kHz / 400 kHz / 1 MHz'], ['Addressing', '7-bit (0x08–0x77)'], ['Common addrs', 'Mux 0x70, TMP75 0x48, FRU 0x50, PSU 0x58'], ['Linux tools', 'i2cdetect, i2cget, i2ctransfer']],
    terms: [['ACK/NACK', 'After each byte the receiver pulls SDA low (ACK). A NACK on the address byte means "nobody home".'], ['Repeated START', 'START without STOP: switch from write to read atomically.'], ['LINEAR11', '16-bit value: 5-bit signed exponent + 11-bit signed mantissa. Value = mantissa × 2^exponent.'], ['PEC', 'Packet Error Code: CRC-8 (poly 0x07) over every byte incl. address bytes.'], ['Bus hang', 'A device holding SDA low freezes the bus. BMCs recover with 9 clock pulses or by resetting the mux.']],
    atWork: 'On a BMC shell: <code>i2cdetect -y 3</code> scans bus 3; <code>i2ctransfer -y 3 w1@0x48 0x00 r2</code> does exactly message 3–4 below. In OpenBMC the kernel drivers (lm75, pmbus) do this for you, and the device tree or entity-manager says which chip is where.',
    refs: [['NXP I²C-bus specification (UM10204)', 'https://www.nxp.com/docs/en/user-guide/UM10204.pdf'], ['PMBus specifications', 'https://pmbusprophet.com/specifications'], ['IPMI Platform Management FRU spec', 'https://www.intel.com/content/dam/www/public/us/en/documents/specification-updates/ipmi-platform-mgt-fru-info-storage-def-v1-0-rev-1-3-spec-update.pdf']],
    nodes: [
      { id: 'bmc', type: 'bmc', label: 'BMC', sub: 'I²C controller, bus 3', x: 110, y: 280 },
      { id: 'mux', type: 'mux', label: 'I²C mux', sub: 'PCA9548 @0x70', x: 360, y: 280 },
      { id: 'tmp', type: 'sensor', label: 'Temp sensor', sub: 'TMP75 @0x48', x: 650, y: 90 },
      { id: 'fru', type: 'eeprom', label: 'FRU EEPROM', sub: 'AT24 @0x50', x: 650, y: 215 },
      { id: 'psu', type: 'psu', label: 'PSU 1', sub: 'PMBus @0x58', x: 650, y: 340 },
      { id: 'vr', type: 'vr', label: 'CPU VR', sub: 'PMBus @0x60', x: 650, y: 465 },
      { id: 'fan', type: 'fan', label: 'Fans', sub: 'PWM out / tach in', x: 110, y: 470 },
    ],
    links: [
      { a: 'bmc', b: 'mux', kind: 'i2c', label: 'bus 3' }, { a: 'mux', b: 'tmp', kind: 'i2c', label: 'ch0' }, { a: 'mux', b: 'fru', kind: 'i2c', label: 'ch1' },
      { a: 'mux', b: 'psu', kind: 'i2c', label: 'ch2' }, { a: 'mux', b: 'vr', kind: 'i2c', label: 'ch3' }, { a: 'bmc', b: 'fan', kind: 'gpio', label: 'PWM / tach' },
    ],
    steps: [
      { title: 'Select mux channel', sub: 'One byte to 0x70', text: 'Before talking to the sensor, the BMC writes a <b>bit mask</b> to the mux: bit 0 = channel 0. Now the TMP75 is electrically connected to the BMC\'s bus.' },
      { title: 'Read temperature', sub: 'Pointer write + repeated START read', text: 'Write the <b>register pointer</b> (0x00 = temperature), then repeated-START and read 2 bytes. 0x1A80 → 26.5 °C.' },
      { title: 'Read FRU', sub: 'Who am I? Serial, part number', text: 'The FRU EEPROM holds the board\'s identity in IPMI FRU format: a common header with offsets to the Chassis, Board and Product areas. This is where serial numbers in Redfish/iLO come from.' },
      { title: 'PMBus power', sub: 'READ_POUT with PEC', text: 'PMBus uses SMBus "Read Word": command byte, repeated START, two data bytes (little-endian) and a <b>PEC</b> byte. The value 0xFABC decodes as LINEAR11: exponent −1, mantissa 700 → <b>350 W</b>.' },
      { title: 'Fan control loop', sub: 'Sensors → PID → PWM', text: 'A control daemon (OpenBMC: phosphor-pid-control) feeds the readings into PID loops and writes PWM duty to the fans, watching tach feedback for failed fans.' },
    ],
    msgs: [
      { t: '0.000ms', from: 'bmc', to: 'mux', proto: 'I²C', step: 0, info: 'W 0x70: control = 0x01 (enable channel 0)', short: 'mux ch0', layers: [L('I²C write', [F('START', 'S', null, 'SDA falls while SCL is high.'), i2c(0x70, 0), F('Control register', '0x01 → channel 0', [0x01], 'Bit n enables channel n. Multiple bits = multiple channels.'), F('STOP', 'P', null, '')])] },
      { t: '0.110ms', from: 'bmc', to: 'tmp', via: ['mux'], proto: 'I²C', step: 1, info: 'W 0x48: pointer = 0x00 (temperature)', short: 'set pointer', layers: [L('I²C write', [F('START', 'S', null, ''), i2c(0x48, 0), F('Pointer register', '0x00 temperature', [0x00], 'TMP75 pointer: 0 temp, 1 config, 2 T_low, 3 T_high.')])] },
      { t: '0.180ms', from: 'tmp', to: 'bmc', via: ['mux'], proto: 'I²C', step: 1, info: 'Sr R 0x48: 0x1A 0x80 = 26.5 °C', short: '26.5 °C', layers: [L('I²C read', [F('Repeated START', 'Sr', null, 'No STOP: keep the bus.'), i2c(0x48, 1), F('MSB', '0x1A = 26', [0x1a], 'Integer °C, two\'s complement.'), F('LSB', '0x80 = 0.5', [0x80], 'Top 4 bits are fractional (12-bit mode: 0.0625 °C steps).'), F('NACK + STOP', 'controller done', null, 'Controller NACKs the last byte to end the read.')])] },
      { t: '1.000ms', from: 'bmc', to: 'mux', proto: 'I²C', step: 2, info: 'W 0x70: control = 0x02 (channel 1)', short: 'mux ch1', layers: [L('I²C write', [i2c(0x70, 0), F('Control', '0x02 → channel 1', [0x02], '')])] },
      { t: '1.100ms', from: 'bmc', to: 'fru', via: ['mux'], proto: 'I²C', step: 2, info: 'W 0x50 offset 0x00, Sr R 8 bytes', short: 'FRU read', layers: [L('I²C write+read', [i2c(0x50, 0), F('Offset', '0x00', [0], 'Byte address inside the EEPROM.'), i2c(0x50, 1)])] },
      { t: '1.900ms', from: 'fru', to: 'bmc', via: ['mux'], proto: 'FRU', step: 2, info: 'Common header: ver 1, chassis @8, board @40, product @88', short: 'FRU header', layers: [L('IPMI FRU common header · 8 bytes', [F('Format version', '1', [0x01], ''), F('Internal use offset', '0 (none)', [0], 'Offsets are in multiples of 8 bytes.'), F('Chassis info offset', '1 → byte 8', [0x01], '', { eg: true }), F('Board info offset', '5 → byte 40', [0x05], 'Board area: manufacturer, product name, serial, part number, mfg date.', { eg: true }), F('Product info offset', '11 → byte 88', [0x0b], '', { eg: true }), F('MultiRecord offset', '0', [0], 'Power supply / DC output records.'), F('Pad', '0', [0], ''), F('Checksum', '0xEE', [0xee], 'All 8 bytes sum to 0 mod 256: 1+1+5+11+0xEE = 0x100.')])] },
      { t: '3.000ms', from: 'bmc', to: 'psu', via: ['mux'], proto: 'PMBus', step: 3, info: 'W 0x58 cmd READ_POUT (0x96)', short: 'READ_POUT', layers: [L('SMBus Read Word (command phase)', [F('START', 'S', null, ''), i2c(0x58, 0), F('Command', 'READ_POUT (0x96)', [0x96], 'PMBus standard command: output power in watts.')])] },
      { t: '3.150ms', from: 'psu', to: 'bmc', via: ['mux'], proto: 'PMBus', step: 3, info: 'Sr R 0x58: 0xFABC (LINEAR11) = 350 W + PEC', short: '350 W', layers: [L('SMBus Read Word (data phase)', [F('Repeated START', 'Sr', null, ''), i2c(0x58, 1), F('Data low byte', '0xBC', [0xbc], 'Little-endian word.'), F('Data high byte', '0xFA', [0xfa], 'Word 0xFABC: exponent bits 11111 = −1, mantissa 0x2BC = 700.'), F('Decoded', lin11(pout) + ' W', null, '700 × 2^−1 = 350 W.'), F('PEC', hx(pec1[0]), pec1, 'CRC-8 over B0 96 B1 BC FA. If it does not match, the BMC discards the reading.')])] },
      { t: '1.000s', from: 'bmc', to: 'bmc', proto: 'PID', step: 4, info: 'Fan PID: CPU margin 18 °C → zone duty 45%', short: 'PID calc', layers: [L('Control loop', [F('Inputs', 'temps, margins', null, 'Thermal sensors, often expressed as margin to Tjmax.'), F('Algorithm', 'PID per zone', null, 'Fan zones take the max requested duty from all their sensors.'), F('Output', '45 %', null, '', { eg: true })])] },
      { t: '1.001s', from: 'bmc', to: 'fan', proto: 'PWM', step: 4, info: 'PWM duty 45%, tach reads 7 200 RPM', short: 'PWM 45%', layers: [L('PWM / tach', [F('PWM register', '115 / 255', [115], 'Written via the hwmon pwmN sysfs file.', { eg: true }), F('Tach', '7 200 RPM', null, 'Two pulses per revolution is typical. Below threshold = fan fault event.', { eg: true })])] },
    ],
  });

  /* =============== KCS in-band IPMI =============== */
  const kc = (reg, val, name, d) => F((reg === 'C' ? 'CMD 0xCA3 ← ' : 'DATA 0xCA2 ← ') + name, hx(val), [val], d);
  const kd = (val, name, d) => F('DATA 0xCA2 → ' + name, hx(val), [val], d);
  LESSONS.push({
    id: 'kcs', cat: 'buses', title: 'In-band IPMI (KCS)', subtitle: 'Host OS → BMC without a network',
    keywords: 'kcs lpc espi ipmi_si /dev/ipmi0 ipmitool get device id in-band host interface',
    intro: 'Run <code>ipmitool mc info</code> on the server itself and no network packet is sent. The request goes through I/O ports <b>0xCA2/0xCA3</b> straight into the BMC: the <b>KCS</b> interface.',
    overview: [
      '<b>KCS (Keyboard Controller Style)</b> is the most common host↔BMC IPMI channel. It is two byte-wide registers that the host CPU accesses with I/O instructions: a <b>data</b> register (0xCA2) and a <b>command/status</b> register (0xCA3). On modern platforms they travel over <b>eSPI</b> (older: LPC).',
      'The protocol is a small handshake: write WRITE_START (0x61) to the command register, push bytes to the data register, write WRITE_END (0x62) before the last byte, then read the response byte-by-byte, sending READ (0x68) for each.',
      'In Linux the <code>ipmi_si</code> driver does this and exposes <code>/dev/ipmi0</code>. On an OpenBMC BMC, the kernel KCS driver plus <code>kcsbridged</code> forward the message over D-Bus to <code>ipmid</code>. BIOS uses the same path during POST.',
    ],
    facts: [['I/O ports', '0xCA2 data, 0xCA3 cmd/status'], ['Transport', 'eSPI or LPC'], ['Host driver', 'Linux ipmi_si → /dev/ipmi0'], ['Alternatives', 'BT, SSIF (I²C), Redfish Host Interface']],
    terms: [['IBF / OBF', 'Status bits: Input Buffer Full (BMC has not read yet), Output Buffer Full (byte waiting for host).'], ['SMS_ATN', 'Status bit telling the host the BMC has a message waiting for it (e.g. an event).'], ['In-band', 'Management traffic through the host OS, not the management network.'], ['NetFn', 'Command group. App=0x06, Chassis=0x00, Storage=0x0A, Sensor/Event=0x04.']],
    atWork: 'HPE iLO also has its own host channel (CHIF, used by tools like iLOrest and the Agentless Management Service). The <b>Redfish Host Interface</b> (DMTF DSP0270, a virtual USB NIC) is the modern standard. KCS is still the simplest place to learn the host↔BMC idea.',
    refs: [['IPMI 2.0 spec: KCS chapter 9', 'https://www.intel.com/content/www/us/en/products/docs/servers/ipmi/ipmi-second-gen-interface-spec-v2-rev1-1.html'], ['OpenBMC kcsbridge', 'https://github.com/openbmc/kcsbridge'], ['Linux IPMI driver docs', 'https://www.kernel.org/doc/html/latest/driver-api/ipmi.html']],
    zones: [{ x: 20, y: 40, w: 420, h: 480, label: 'Host (x86 CPU + OS)' }, { x: 560, y: 40, w: 420, h: 480, label: 'BMC (OpenBMC)' }],
    nodes: [
      { id: 'app', type: 'host', label: 'ipmitool', sub: 'mc info', x: 230, y: 110 },
      { id: 'drv', type: 'kernel', label: 'ipmi_si driver', sub: '/dev/ipmi0', x: 230, y: 270 },
      { id: 'pch', type: 'pch', label: 'PCH eSPI', sub: 'I/O 0xCA2/0xCA3', x: 230, y: 430 },
      { id: 'kcs', type: 'bmc', label: 'BMC KCS HW', sub: 'kcs_bmc driver', x: 770, y: 430 },
      { id: 'bridge', type: 'svc', label: 'kcsbridged', sub: 'KCS ↔ D-Bus', x: 770, y: 270 },
      { id: 'ipmid', type: 'svc', label: 'ipmid', sub: 'command handlers', x: 770, y: 110 },
    ],
    links: [{ a: 'app', b: 'drv', kind: 'sw', label: 'ioctl' }, { a: 'drv', b: 'pch', kind: 'sw', label: 'inb/outb' }, { a: 'pch', b: 'kcs', kind: 'espi', label: 'eSPI I/O cycles' }, { a: 'kcs', b: 'bridge', kind: 'sw', label: '/dev/ipmi-kcs3' }, { a: 'bridge', b: 'ipmid', kind: 'dbus', label: 'D-Bus' }],
    steps: [
      { title: 'Application request', sub: 'ioctl on /dev/ipmi0', text: 'ipmitool builds "NetFn App (0x06), Get Device ID (0x01)" and hands it to the kernel with <code>IPMICTL_SEND_COMMAND</code>.' },
      { title: 'KCS write phase', sub: 'Bytes pushed through two ports', text: 'The driver waits for IBF=0 before each write. WRITE_START, NetFn/LUN, WRITE_END, then the final byte (the command).' },
      { title: 'BMC processes', sub: 'Kernel → kcsbridged → ipmid', text: 'The BMC kernel driver collects the bytes and hands a complete message to <b>kcsbridged</b>, which calls ipmid over D-Bus. The handler fills in the firmware version, IPMI version and manufacturer.' },
      { title: 'KCS read phase', sub: 'Host reads the response', text: 'The BMC places each response byte in the data register (OBF=1). The host reads it and writes READ (0x68) to ask for the next, until the BMC enters IDLE.' },
    ],
    msgs: [
      { t: '0.0µs', from: 'app', to: 'drv', proto: 'ioctl', step: 0, info: 'IPMICTL_SEND_COMMAND netfn=0x06 cmd=0x01', short: 'ioctl send', layers: [L('struct ipmi_req', [F('addr', 'IPMI_SYSTEM_INTERFACE_ADDR_TYPE (BMC)', null, ''), F('msg.netfn', '0x06 App', [0x06], ''), F('msg.cmd', '0x01 Get Device ID', [0x01], ''), F('msg.data_len', '0', null, 'No request data.')])] },
      { t: '2µs', from: 'drv', to: 'kcs', via: ['pch'], proto: 'KCS', step: 1, info: 'WRITE_START → 0x18 (NetFn/LUN) → WRITE_END → 0x01 (cmd)', short: 'KCS write', layers: [L('KCS write phase', [kc('C', 0x61, 'WRITE_START', 'Start of a new request. BMC state → WRITE.'), kc('D', 0x18, 'NetFn/LUN', 'NetFn 0x06 << 2 | LUN 0. Host polls IBF=0 between bytes.'), kc('C', 0x62, 'WRITE_END', 'Next data byte is the last one.'), kc('D', 0x01, 'Cmd', 'Get Device ID. BMC state → READ once it has a response.')], 'Over eSPI each register access is a peripheral-channel I/O cycle. Note that there are no addresses or checksums here, unlike IPMI over LAN.')] },
      { t: '40µs', from: 'kcs', to: 'bridge', proto: 'char dev', step: 2, info: 'read() on /dev/ipmi-kcs3 returns [0x18, 0x01]', short: 'kernel → bridge', layers: [L('Raw message', [F('NetFn/LUN', '0x18', [0x18], ''), F('Cmd', '0x01', [0x01], '')])] },
      { t: '60µs', from: 'bridge', to: 'ipmid', proto: 'D-Bus', step: 2, info: 'CALL xyz.openbmc_project.Ipmi.Server.execute(netfn 6, lun 0, cmd 1, data [])', short: 'execute()', layers: [FX.dbus({ type: 1, serial: 4401, path: '/xyz/openbmc_project/Ipmi', iface: 'xyz.openbmc_project.Ipmi.Server', member: 'execute', dest: 'xyz.openbmc_project.Ipmi.Host', sigStr: 'yyyaya{sv}', body: [F('netfn, lun, cmd', '6, 0, 1', [6, 0, 1], 'Bytes (y).')] })] },
      { t: '300µs', from: 'ipmid', to: 'bridge', proto: 'D-Bus', step: 2, info: 'RETURN cc=0x00, Device ID data (15 bytes)', short: 'execute() reply', layers: [L('Handler', [F('Handler', 'ipmiAppGetDeviceId', null, 'Built-in App handler; reads the version from /etc/os-release.')])] },
      { t: '320µs', from: 'kcs', to: 'drv', via: ['pch'], proto: 'KCS', step: 3, info: 'Read phase: 1C 01 00 20 81 02 10 02 BF 5C B8 00 …', short: 'KCS read', layers: [L('KCS read phase (each byte followed by host writing READ 0x68)', [kd(0x1c, 'NetFn/LUN', 'Response NetFn 0x07 (App+1) << 2.'), kd(0x01, 'Cmd', 'Echoes the command.'), kd(0x00, 'Completion code', 'Success.'), kd(0x20, 'Device ID', '', { eg: true }), kd(0x81, 'Device rev', 'Bit 7: device provides SDRs.'), kd(0x02, 'FW major', 'Firmware 2.10', { eg: true }), kd(0x10, 'FW minor (BCD)', ''), kd(0x02, 'IPMI version', '0x02 = IPMI 2.0 (BCD, nibbles reversed).'), kd(0xbf, 'Additional support', 'Bit mask: SDR repository, SEL, FRU, IPMB, chassis...'), F('Manufacturer ID', 'IANA 47196', [0x5c, 0xb8, 0x00], '3-byte IANA enterprise number, little-endian.', { eg: true }), F('Product ID', '0x0001', [0x01, 0x00], '', { eg: true })])] },
      { t: '400µs', from: 'drv', to: 'app', proto: 'ioctl', step: 3, info: 'IPMICTL_RECEIVE_MSG → "Firmware Revision: 2.10, IPMI Version: 2.0"', short: 'ipmitool output', layers: [L('ipmitool mc info', [F('Device ID', '32', null, ''), F('Firmware Revision', '2.10', null, ''), F('IPMI Version', '2.0', null, ''), F('Manufacturer ID', '47196', null, '', { eg: true })])] },
    ],
  });

  /* =============== NC-SI =============== */
  const ncsi = (type, name, iid, chan, payload, resp) => {
    const plen = B.sum ? payload.reduce((a, f) => a + (f.b || []).length, 0) : 0;
    const hdr = [0x00, 0x01, 0x00, iid, type, chan, ...B.u16be(plen), ...B.zeros(8)];
    const all = [...hdr, ...payload.flatMap(f => f.b || [])];
    let s = 0; for (let i = 0; i < all.length; i += 2) s = (s + ((all[i] << 8) | (all[i + 1] || 0))) >>> 0;
    const ck = B.u32be((~s + 1) >>> 0);
    return L('NC-SI control packet · ' + (resp ? 'response' : 'command'), [
      F('MC ID', '0x00', [0], 'Management controller ID.'), F('Header revision', '0x01', [1], ''), F('Reserved', '', [0], ''),
      F('Instance ID', iid, [iid], 'Pairs responses with commands; BMC increments it.'),
      F('Control packet type', name + ' (' + hx(type) + ')', [type], 'Commands have bit 7 clear; responses = command | 0x80.'),
      F('Channel ID', hx(chan) + ' (package 0, channel 0)', [chan], 'Upper 3 bits package, lower 5 bits channel (NIC port).'),
      F('Payload length', plen, B.u16be(plen), '12-bit length.'), F('Reserved', '8 bytes', B.zeros(8), ''),
      ...payload, F('Checksum', '0x' + B.toHex(ck, ''), ck, '32-bit two\'s-complement checksum of 16-bit words.'),
    ]);
  };
  LESSONS.push({
    id: 'ncsi', cat: 'buses', title: 'Shared NIC: NC-SI', subtitle: 'BMC traffic through the host\'s NIC',
    keywords: 'ncsi rbt rmii sideband shared lom ilo shared network port 88f8',
    intro: 'Many servers let the BMC use the <b>host\'s</b> network port instead of a dedicated one. The BMC and NIC talk over a sideband called <b>NC-SI</b>: the BMC configures the NIC, and the NIC forwards packets addressed to the BMC\'s MAC.',
    overview: [
      'NC-SI (DMTF DSP0222) defines a physical interface (<b>RBT</b>, RMII-Based Transport) between BMC and NIC plus a <b>control protocol</b> using EtherType <b>0x88F8</b>.',
      'The BMC first discovers and configures the NIC channel: select package, clear initial state, set its MAC filter, enable the channel and enable <b>pass-through</b>. After that, normal Ethernet frames for the BMC\'s MAC flow over the same wire.',
      'Trade-off: fewer cables, but management now shares fate with the host NIC (firmware, link). That is why HPC and secure environments often prefer a <b>dedicated</b> management port.',
    ],
    facts: [['Spec', 'DMTF DSP0222'], ['EtherType', '0x88F8 (control)'], ['Physical', 'RBT (RMII), or NC-SI over MCTP'], ['HPE term', 'iLO Shared Network Port']],
    terms: [['Pass-through', 'Normal Ethernet frames between the network and the BMC via the NIC.'], ['Package / channel', 'A package is a NIC chip; a channel is one of its ports.'], ['AEN', 'Asynchronous Event Notification: the NIC tells the BMC about link changes etc.']],
    atWork: 'In iLO settings this is "Shared Network Port" versus "Dedicated Network Port". On OpenBMC, look at the kernel <code>ftgmac100</code> driver with <code>use-ncsi</code> and the <code>ncsi-netlink</code> tool.',
    refs: [['DMTF NC-SI DSP0222', 'https://www.dmtf.org/standards/pmci']],
    nodes: [
      { id: 'adm', type: 'laptop', label: 'Admin laptop', sub: '10.0.0.5', x: 110, y: 120 },
      { id: 'sw', type: 'switch', label: 'Data switch', sub: 'production LAN', x: 380, y: 120 },
      { id: 'nic', type: 'nic', label: 'Host NIC (LOM)', sub: 'port 1', x: 650, y: 230 },
      { id: 'host', type: 'host', label: 'Host OS', sub: 'eth0 10.0.0.30', x: 880, y: 100 },
      { id: 'bmc', type: 'bmc', label: 'BMC', sub: 'iLO / OpenBMC 10.0.0.20', x: 650, y: 440 },
    ],
    links: [{ a: 'adm', b: 'sw', kind: 'lan' }, { a: 'sw', b: 'nic', kind: 'lan', label: 'one cable' }, { a: 'nic', b: 'host', kind: 'pcie', label: 'PCIe' }, { a: 'nic', b: 'bmc', kind: 'ncsi', label: 'NC-SI / RBT sideband' }],
    steps: [
      { title: 'Discover & configure', sub: 'BMC sets up the NIC channel', text: 'On standby power the BMC sends NC-SI <b>commands</b> (EtherType 0x88F8): select package, clear initial state, then <b>Set MAC Address</b> so the NIC knows which frames belong to the BMC.' },
      { title: 'Enable pass-through', sub: 'Channel on', text: '<b>Enable Channel</b> plus <b>Enable Channel Network TX</b> turn on pass-through. The BMC can poll <b>Get Link Status</b> or receive AENs.' },
      { title: 'Shared traffic', sub: 'Same cable, two MACs', text: 'A frame from the admin to the BMC\'s MAC enters the NIC, matches the BMC filter and is forwarded over the sideband. Host traffic goes over PCIe as usual.' },
    ],
    msgs: [
      { t: '0.00s', from: 'bmc', to: 'nic', proto: 'NC-SI', step: 0, info: 'Select Package (0x01), package 0', short: 'Select Package', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x01, 'Select Package', 1, 0x1f, [F('Hardware arbitration', 'disable', [0, 0, 0, 1], '')])] },
      { t: '0.01s', from: 'bmc', to: 'nic', proto: 'NC-SI', step: 0, info: 'Clear Initial State (0x00), channel 0', short: 'Clear Initial State', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x00, 'Clear Initial State', 2, 0x00, [])] },
      { t: '0.02s', from: 'nic', to: 'bmc', proto: 'NC-SI', step: 0, info: 'Response 0x80: success', short: 'response', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x80, 'Clear Initial State response', 2, 0x00, [F('Response code', 'Completed (0)', [0, 0], ''), F('Reason code', 'No error (0)', [0, 0], '')], true)] },
      { t: '0.03s', from: 'bmc', to: 'nic', proto: 'NC-SI', step: 0, info: 'Set MAC Address (0x0E) 94:40:c9:aa:bb:cc, filter 1', short: 'Set MAC Address', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x0e, 'Set MAC Address', 3, 0x00, [F('MAC address', '94:40:c9:aa:bb:cc', B.mac('94:40:c9:aa:bb:cc'), 'The BMC\'s own MAC. Frames to it go to the sideband.', { eg: true }), F('MAC number', '1', [1], ''), F('Type / enable', 'unicast, enabled', [0x01], '')])] },
      { t: '0.04s', from: 'bmc', to: 'nic', proto: 'NC-SI', step: 1, info: 'Enable Channel (0x03)', short: 'Enable Channel', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x03, 'Enable Channel', 4, 0x00, [])] },
      { t: '0.05s', from: 'bmc', to: 'nic', proto: 'NC-SI', step: 1, info: 'Enable Channel Network TX (0x06)', short: 'Enable TX', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x06, 'Enable Channel Network TX', 5, 0x00, [])] },
      { t: '0.06s', from: 'bmc', to: 'nic', proto: 'NC-SI', step: 1, info: 'Get Link Status (0x0A)', short: 'Get Link Status', layers: [N.eth('ff:ff:ff:ff:ff:ff', '00:00:00:00:00:00', 0x88f8, 'NC-SI'), ncsi(0x0a, 'Get Link Status', 6, 0x00, [])] },
      { t: '5.00s', from: 'adm', to: 'bmc', via: ['sw', 'nic'], proto: 'HTTPS', step: 2, info: 'TCP SYN to 10.0.0.20:443 (BMC MAC) → forwarded over sideband', short: 'admin → BMC', layers: [N.eth('94:40:c9:aa:bb:cc', '3c:52:82:11:22:33', 0x0800, 'IPv4'), ...N.packet({ src: '10.0.0.5', dst: '10.0.0.20', tcp: [50111, 443, 100, 0, 'SYN'], app: [] })], note: 'The NIC compares the destination MAC with its filters. This one matches the BMC\'s, so the frame goes over NC-SI instead of PCIe.' },
      { t: '5.10s', from: 'adm', to: 'host', via: ['sw', 'nic'], proto: 'SSH', step: 2, info: 'TCP SYN to 10.0.0.30:22 (host MAC) → PCIe to host OS', short: 'admin → host', layers: [N.eth('3c:fd:fe:01:02:03', '3c:52:82:11:22:33', 0x0800, 'IPv4'), ...N.packet({ src: '10.0.0.5', dst: '10.0.0.30', tcp: [50112, 22, 200, 0, 'SYN'], app: [] })] },
    ],
  });
})();
