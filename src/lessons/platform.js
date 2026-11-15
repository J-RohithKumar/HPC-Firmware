(function () {
  const { B, F, L, N, I, hx } = FX;
  const sig = (name, level, meaning, extra) => [L('Signal', [
    F('Signal', name, null, 'Name of the wire/net on the schematic. A trailing # means active-low (asserted = 0 V).'),
    F('Level', level, null, 'Electrical state after this event.'),
    F('Meaning', meaning, null, ''),
    ...(extra || []),
  ])];
  const spi = (op, opName, addr, addrBytes, data, dataName, dataDesc, dummy) => {
    const f = [F('Opcode', opName + ' (' + hx(op) + ')', [op], 'First byte the controller clocks out on MOSI tells the flash chip what to do.')];
    if (addr != null) f.push(F('Address', '0x' + addr.toString(16).toUpperCase().padStart(addrBytes * 2, '0'), addrBytes === 4 ? B.u32be(addr) : B.u24be(addr), addrBytes + '-byte flash address (big-endian). Chips >16 MB need 4-byte addressing.'));
    if (dummy) f.push(F('Dummy cycles', '8 clocks', [0], 'Fast Read needs a dummy byte so the chip can prepare data at high clock rates.'));
    if (data) f.push(F(dataName || 'Data', data.v, data.b, dataDesc || '', { eg: data.eg }));
    return [L('SPI transaction', f, 'SPI is a simple 4-wire bus: chip-select, clock, MOSI (controller→flash) and MISO (flash→controller). There are no addresses on the bus itself; chip-select picks the chip.')];
  };
  window.FX.sig = sig; window.FX.spi = spi;

  /* ---------- D-Bus wire helper (simplified but structurally real) ---------- */
  function dbus({ type, serial, path, iface, member, dest, sender, sigStr, body, replySerial }) {
    const tn = { 1: 'METHOD_CALL', 2: 'METHOD_RETURN', 3: 'ERROR', 4: 'SIGNAL' }[type];
    const hf = [];
    const pad = (arr, a) => { while (arr.length % a) arr.push(0); return arr; };
    const strField = (code, ch, s) => pad([code, 1, ch.charCodeAt(0), 0, ...B.u32le(B.ascii(s).length), ...B.ascii(s), 0], 8);
    const fields = [];
    const add = (code, ch, name, s, d) => { if (s) fields.push(F('Header: ' + name, s, strField(code, ch, s), d)); };
    add(1, 'o', 'PATH', path, 'Object path: which object you are talking to (like a URL path).');
    add(2, 's', 'INTERFACE', iface, 'Interface: a named set of methods/properties/signals.');
    add(3, 's', 'MEMBER', member, 'Method or signal name.');
    if (replySerial) fields.push(F('Header: REPLY_SERIAL', replySerial, pad([5, 1, 117, 0, ...B.u32le(replySerial)], 8), 'Which call this reply answers.'));
    add(6, 's', 'DESTINATION', dest, 'Well-known bus name of the service that should receive it.');
    add(7, 's', 'SENDER', sender, 'Unique connection name of the sender, filled in by the broker.');
    if (sigStr) fields.push(F('Header: SIGNATURE', sigStr, pad([8, 1, 103, 0, sigStr.length, ...B.ascii(sigStr), 0], 8), 'Type signature of the body: s=string, v=variant, d=double, a{sv}=dictionary.'));
    const hfLen = fields.reduce((a, f) => a + f.b.length, 0);
    const bodyLen = (body || []).reduce((a, f) => a + (f.b || []).length, 0);
    return L('D-Bus message · ' + tn, [
      F('Endianness', "'l' little-endian", [0x6c], 'Every D-Bus message starts with l or B.'),
      F('Message type', tn + ' (' + type + ')', [type], '1 call, 2 return, 3 error, 4 signal.'),
      F('Flags', '0x00', [0], 'e.g. NO_REPLY_EXPECTED.'),
      F('Protocol version', 1, [1], ''),
      F('Body length', bodyLen, B.u32le(bodyLen), ''),
      F('Serial', serial, B.u32le(serial), 'Per-connection message number.'),
      F('Header fields length', hfLen, B.u32le(hfLen), ''),
      ...fields, ...(body || []),
    ], 'D-Bus is the software "bus" inside OpenBMC: every daemon exposes objects on it and talks to the others through the broker. Header fields are padded to 8 bytes.');
  }
  const dstr = (name, s) => F(name, '"' + s + '"', [...B.u32le(B.ascii(s).length), ...B.ascii(s), 0], 'D-Bus string: 4-byte length, UTF-8 bytes, NUL.');
  window.FX.dbus = dbus; window.FX.dstr = dstr;

  /* =============== Lesson: power-on =============== */
  LESSONS.push({
    id: "power-on", cat: "hardware", ord: 50, mins: 12, tags: ["power", "standby", "cpld", "sequencing", "post", "boot"], prereq: ["boot-fundamentals"], title: 'Server power-on', subtitle: 'From AC plug-in to OS boot',
    keywords: 'standby cpld pch bios post reset vector power sequencing',
    intro: 'Plug in the server and press the power button. Watch who wakes up first: the BMC lives on <b>standby power</b> and is already running long before the CPU does.',
    overview: [
      'A server has <b>two worlds</b>: the <b>management world</b> (BMC, CPLD, standby power) that runs whenever AC is connected, and the <b>host world</b> (CPU, memory, OS) that only runs after power-on.',
      'The <b>CPLD</b> is a small programmable logic chip that sequences power rails in the right order and with the right timing. Get the order wrong and the CPU can be damaged, which is why sequencing lives in hardware logic rather than software.',
      'When the CPU leaves reset it fetches its very first instruction from the <b>BIOS SPI flash</b>. Everything after that is UEFI firmware doing POST (Power-On Self-Test), then handing off to the OS boot loader.',
    ],
    facts: [['Runs on standby', 'BMC, CPLD, NIC sideband'], ['Power states', 'G3 (no AC) → S5 (soft-off) → S0 (on)'], ['First CPU fetch', 'Reset vector 0xFFFFFFF0 (x86)'], ['Typical BMC boot', '30 s – 2 min after AC']],
    terms: [['Standby / AUX power', 'Small always-on supply (e.g. 12V_STBY) that keeps management hardware alive while the server is "off".'], ['CPLD', 'Complex Programmable Logic Device. Handles power sequencing, reset logic, glue logic, and often exposes registers to the BMC.'], ['PCH', 'Platform Controller Hub: Intel\'s south-bridge chip. It owns the SPI flash controller, eSPI/LPC and the sleep-state signals.'], ['POST code', 'A one-byte progress code that BIOS writes to I/O port 0x80. The BMC snoops it, so you can see where boot got stuck.']],
    atWork: 'On HPE ProLiant the BMC is <b>iLO</b> (on HPE\'s GXP/iLO ASIC), and iLO shows POST codes and boot progress. AMD platforms replace the PCH/ME steps with the AMD PSP, but the overall shape (standby → BMC → sequencing → reset vector → POST) is the same.',
    refs: [['OpenBMC x86-power-control', 'https://github.com/openbmc/x86-power-control'], ['ACPI power states (S0–S5)', 'https://uefi.org/specs/ACPI/6.5/16_Waking_and_Sleeping.html']],
    zones: [{ x: 20, y: 30, w: 960, h: 510, label: 'Server motherboard' }],
    nodes: [
      { id: 'psu', type: 'psu', label: 'PSU', sub: '12V main + 12V standby', x: 120, y: 110 },
      { id: 'btn', type: 'button', label: 'Power button', sub: 'front panel', x: 120, y: 300 },
      { id: 'bmc', type: 'bmc', label: 'BMC', sub: 'iLO / OpenBMC SoC', x: 330, y: 420 },
      { id: 'bflash', type: 'flash', label: 'BMC flash', sub: 'U-Boot, kernel, rootfs', x: 120, y: 490 },
      { id: 'cpld', type: 'cpld', label: 'CPLD', sub: 'power sequencer', x: 330, y: 200 },
      { id: 'vr', type: 'vr', label: 'CPU VRs', sub: 'VCCIN, VDDQ...', x: 560, y: 90 },
      { id: 'pch', type: 'pch', label: 'PCH', sub: 'SPI + eSPI controller', x: 560, y: 320 },
      { id: 'cpu', type: 'cpu', label: 'CPU', sub: 'x86 host', x: 800, y: 200 },
      { id: 'bios', type: 'flash', label: 'BIOS flash', sub: 'UEFI firmware', x: 800, y: 470, tag: 'SPI FLASH' },
      { id: 'disk', type: 'disk', label: 'Boot drive', sub: 'NVMe: OS loader', x: 880, y: 330 },
    ],
    links: [
      { a: 'psu', b: 'bmc', kind: 'power', label: '12V standby', t: .35 }, { a: 'psu', b: 'cpld', kind: 'gpio', label: 'PS_ON# / PWROK' },
      { a: 'psu', b: 'vr', kind: 'power', label: '12V main' }, { a: 'btn', b: 'bmc', kind: 'gpio' },
      { a: 'bmc', b: 'bflash', kind: 'spi', label: 'SPI' }, { a: 'bmc', b: 'cpld', kind: 'i2c', label: 'I²C regs' },
      { a: 'bmc', b: 'pch', kind: 'espi', label: 'eSPI' }, { a: 'cpld', b: 'vr', kind: 'gpio', label: 'EN / PGOOD' },
      { a: 'cpld', b: 'pch', kind: 'gpio', label: 'SLP_S3# / PWROK' }, { a: 'pch', b: 'cpu', kind: 'pcie', label: 'DMI + PLTRST#' },
      { a: 'pch', b: 'bios', kind: 'spi', label: 'SPI' }, { a: 'vr', b: 'cpu', kind: 'power', label: 'Vcore' }, { a: 'cpu', b: 'disk', kind: 'pcie', label: 'PCIe' },
    ],
    steps: [
      { title: 'Standby power', sub: 'AC applied, host still off', text: 'AC is plugged in. The PSU brings up only its <b>standby</b> output. The BMC and CPLD wake up; the CPU stays completely unpowered. The server is now in <b>S5 / soft-off</b>.' },
      { title: 'BMC boots', sub: 'Its own flash, its own OS', text: 'The BMC is a complete ARM computer. It reads its boot loader (U-Boot) from its <b>own</b> SPI flash, boots Linux, and starts its management services. This is why you can reach iLO/Redfish while the server is "off".' },
      { title: 'Power button', sub: 'Request to leave S5', text: 'The front-panel button goes to the BMC, not straight to the CPU. The BMC forwards it to the PCH as a <b>PWRBTN#</b> pulse. This is also how a remote "Power On" from Redfish/IPMI works: the BMC presses a virtual button.' },
      { title: 'Power sequencing', sub: 'CPLD enables rails in order', text: 'The CPLD asserts <b>PS_ON#</b>, waits for the PSU\'s <b>PWROK</b>, then enables each voltage regulator in a defined order, waiting for each <b>Power-Good</b> before the next. Only when every rail is stable does it release reset.' },
      { title: 'Reset vector', sub: 'First instruction from BIOS flash', text: 'The PCH first checks the <b>flash descriptor</b> (signature 0x0FF0A55A) to learn the flash layout. When PLTRST# is released, the CPU fetches its first instruction from address <b>0xFFFFFFF0</b>, which the PCH maps to the top of the BIOS flash.' },
      { title: 'POST and handoff', sub: 'UEFI runs, then the OS boots', text: 'UEFI trains memory, enumerates PCIe and talks to the BMC (POST codes over eSPI port 80, IPMI over KCS for boot options). Finally it loads the OS boot loader from disk and the BMC marks the host as <b>Running</b>.' },
    ],
    msgs: [
      { t: '0.000s', from: 'psu', to: 'bmc', proto: 'Power', step: 0, info: 'AC applied: 12V standby rail up', short: '12V_STBY up', layers: sig('P12V_STBY', '12.0 V', 'Standby rail on; BMC and CPLD powered.', [F('Host rails', 'OFF', null, 'Main 12V is still off.')]) },
      { t: '0.020s', from: 'psu', to: 'cpld', proto: 'Power', step: 0, info: 'CPLD configures from internal flash, waits in S5', short: 'CPLD alive', layers: sig('PWRGD_STBY', 'HIGH', 'Standby power good; CPLD logic starts its state machine in S5 (off).') },
      { t: '0.150s', from: 'bmc', to: 'bflash', proto: 'SPI', step: 1, info: 'Read 0x03 @0x000000: fetch U-Boot', short: 'SPI READ U-Boot', layers: spi(0x03, 'READ', 0, 3, null), note: 'The BMC SoC\'s boot ROM reads from offset 0 of its SPI flash, where U-Boot lives.' },
      { t: '0.151s', from: 'bflash', to: 'bmc', proto: 'SPI', step: 1, info: 'Data: U-Boot image (first bytes = ARM reset vector)', short: 'U-Boot bytes', layers: spi(0x03, 'READ (response on MISO)', null, 0, { v: 'be 00 00 ea …', b: B.hex('be 00 00 ea 14 f0 9f e5 14 f0 9f e5 14 f0 9f e5'), eg: true }, 'Data (MISO)', 'ARM exception vector table: the first word is a branch to the reset handler.') },
      { t: '45.0s', from: 'bmc', to: 'bmc', proto: 'BMC', step: 1, info: 'U-Boot → Linux kernel → systemd → management services up', short: 'BMC OS up', layers: [L('BMC boot', [F('Boot loader', 'U-Boot', null, 'Initialises DRAM, loads the kernel from flash.'), F('Kernel', 'Linux (ARM)', null, 'Drivers for I²C, GPIO, SPI, eSPI, network.'), F('Init', 'systemd', null, 'Starts services: web server (Redfish), IPMI, sensors, power control.'), F('Ready', '~45 s', null, 'Varies a lot by platform.', { eg: true })])] },
      { t: '45.2s', from: 'bmc', to: 'cpld', proto: 'I²C', step: 1, info: 'Read CPLD version register', short: 'CPLD version', layers: [L('I²C transaction', [F('Address + W', '0x40 + write', [0x80], '7-bit address shifted left; LSB 0 = write.', { eg: true }), F('Register', '0x00 (version)', [0x00], 'Register pointer.', { eg: true }), F('Address + R', '0x40 + read', [0x81], 'Repeated START then read.'), F('Data', 'v1.3', [0x13], 'CPLD firmware version.', { eg: true })], 'Many BMCs read CPLD registers over I²C for board ID, version and power-state status.')] },
      { t: '120.0s', from: 'btn', to: 'bmc', proto: 'GPIO', step: 2, info: 'POWER_BUTTON# pressed (low)', short: 'button pressed', layers: sig('FP_PWR_BTN#', 'LOW (asserted)', 'User pressed the button. The BMC sees a GPIO edge interrupt.') },
      { t: '120.0s', from: 'bmc', to: 'pch', proto: 'GPIO', step: 2, info: 'BMC drives PWRBTN# pulse to PCH (~200 ms)', short: 'PWRBTN# pulse', layers: sig('PWR_BTN_OUT# → PCH PWRBTN#', 'LOW for 200 ms', 'BMC forwards the press. A remote Redfish "On" uses this same path.', [F('Who does it', 'x86-power-control (OpenBMC)', null, 'The daemon that owns power GPIOs.')]) },
      { t: '120.2s', from: 'pch', to: 'cpld', proto: 'GPIO', step: 2, info: 'SLP_S4# / SLP_S3# de-asserted: leave S5', short: 'SLP_S3# high', layers: sig('SLP_S3#, SLP_S4#', 'HIGH', 'PCH says "I want to go to S0 (on)".') },
      { t: '120.2s', from: 'cpld', to: 'psu', proto: 'GPIO', step: 3, info: 'PS_ON# asserted: turn on main 12V', short: 'PS_ON#', layers: sig('PS_ON#', 'LOW (asserted)', 'Turn on the main output.') },
      { t: '120.3s', from: 'psu', to: 'cpld', proto: 'GPIO', step: 3, info: 'PWROK: main 12V stable', short: 'PSU PWROK', layers: sig('PSU_PWROK', 'HIGH', 'Main output in regulation.') },
      { t: '120.3s', from: 'cpld', to: 'vr', proto: 'GPIO', step: 3, info: 'Enable VRs in order, waiting for each PGOOD', short: 'VR enables', layers: sig('VR_EN[n]', 'HIGH, one by one', 'Sequenced enables, e.g. VCCIO → VCCIN → VDDQ (order is platform specific).', [F('Timing', 'ms-level delays', null, 'Datasheets specify min/max delays between rails.', { eg: true })]) },
      { t: '120.4s', from: 'vr', to: 'cpld', proto: 'GPIO', step: 3, info: 'All VR_PGOOD high', short: 'VR PGOOD', layers: sig('VR_PGOOD[n]', 'HIGH', 'Each regulator reports stable output. If one fails, the CPLD powers down and logs a fault the BMC can read.') },
      { t: '120.4s', from: 'cpld', to: 'pch', proto: 'GPIO', step: 3, info: 'SYS_PWROK: platform power is good', short: 'SYS_PWROK', layers: sig('SYS_PWROK / PCH_PWROK', 'HIGH', 'Tells the PCH it can release platform reset.') },
      { t: '120.5s', from: 'pch', to: 'bios', proto: 'SPI', step: 4, info: 'Fast Read @0x000010: flash descriptor signature', short: 'descriptor check', layers: spi(0x0b, 'FAST READ', 0x10, 3, { v: '5A A5 F0 0F (valid descriptor)', b: B.hex('5a a5 f0 0f') }, 'Data (MISO)', 'Signature 0x0FF0A55A stored little-endian. It tells the PCH the flash has regions: descriptor, ME/CSME, BIOS, etc.', true) },
      { t: '120.6s', from: 'pch', to: 'cpu', proto: 'GPIO', step: 4, info: 'PLTRST# released: CPU leaves reset', short: 'PLTRST# high', layers: sig('PLTRST# / CPU_RESET#', 'HIGH (released)', 'CPU starts executing.') },
      { t: '120.6s', from: 'cpu', to: 'bios', via: ['pch'], proto: 'SPI', step: 4, info: 'Fetch reset vector 0xFFFFFFF0 → top of BIOS flash', short: 'reset vector fetch', layers: spi(0x0b, 'FAST READ', 0xfffff0, 3, { v: '90 90 e9 …  (jmp to SEC phase)', b: B.hex('90 90 e9 73 f5 00 00 00'), eg: true }, 'Data', 'The last 16 bytes of the BIOS region hold a jump into the UEFI SEC phase.', true), note: 'The CPU issues a memory read at 0xFFFFFFF0. The PCH turns it into an SPI read at the end of the BIOS region.' },
      { t: '124.0s', from: 'cpu', to: 'bmc', via: ['pch'], proto: 'eSPI', step: 5, info: 'POST code 0x19 written to I/O port 0x80', short: 'POST 0x19', layers: [L('eSPI peripheral channel · I/O write', [F('Cycle type', 'I/O write', [0x44], 'eSPI peripheral-channel I/O write (simplified).', { eg: true }), F('Port', '0x0080', B.u16be(0x80), 'Port 80 is the classic POST-code port.'), F('Data', '0x19', [0x19], 'Progress code. Its meaning depends on the BIOS vendor, e.g. "PCH init".', { eg: true })], 'The BMC snoops port 80 (OpenBMC: phosphor-host-postd) and shows the history in its web UI.')] },
      { t: '130.0s', from: 'cpu', to: 'bmc', via: ['pch'], proto: 'IPMI/KCS', step: 5, info: 'BIOS: Get System Boot Options (boot flags)', short: 'Get Boot Options', layers: [I.msg({ a1: 0x20, netFn: 0x00, a2: 0x81, cmd: 0x09, cmdName: 'Get System Boot Options', data: [F('Parameter selector', '5 (boot flags)', [0x05], 'Has someone asked for a one-time boot override, e.g. PXE or BIOS setup?'), F('Set selector', '0', [0], ''), F('Block selector', '0', [0], '')] })], note: 'BIOS asks the BMC whether an admin requested a one-time boot device. This is how "boot once from PXE" set via iLO/Redfish reaches the BIOS.' },
      { t: '150.0s', from: 'cpu', to: 'disk', proto: 'PCIe', step: 5, info: 'UEFI loads \\EFI\\BOOT\\BOOTX64.EFI from the ESP', short: 'load OS loader', layers: [L('Boot', [F('Device', 'NVMe namespace 1', null, ''), F('Partition', 'EFI System Partition (FAT32)', null, ''), F('File', '\\EFI\\<os>\\shimx64.efi', null, 'Boot loader path stored in a UEFI Boot#### variable.', { eg: true })])] },
      { t: '180.0s', from: 'bmc', to: 'bmc', proto: 'BMC', step: 5, info: 'BMC: host state = Running, OS booted', short: 'host Running', layers: [L('BMC state', [F('Host state', 'Running', null, 'Shown in Redfish as PowerState "On", BootProgress "OSRunning".'), F('Chassis power', 'On', null, '')])] },
    ],
  });

  /* =============== Lesson: OpenBMC internals =============== */
  const tok = 'X-Auth-Token';
  const hdrs = (extra) => Object.assign({ Host: 'bmc', [tok]: 'e3cR9...k2' }, extra);
  LESSONS.push({
    id: "openbmc", cat: "ilo", ord: 230, mins: 15, tags: ["openbmc", "dbus", "bmcweb", "ipmid", "linux", "daemons"], prereq: ["ilo-architecture", "embedded-linux"], title: 'Inside OpenBMC', subtitle: 'Redfish → D-Bus → kernel → hardware',
    keywords: 'dbus bmcweb ipmid entity-manager dbus-sensors phosphor systemd',
    intro: 'OpenBMC is a Linux distribution for BMCs. The key idea: <b>every daemon talks over D-Bus</b>. The Redfish server and the IPMI server are just two front doors to the same objects.',
    overview: [
      'OpenBMC (a Linux Foundation project, built with Yocto) runs on the BMC SoC. Small daemons each own one job: <b>bmcweb</b> serves Redfish/HTTPS, <b>ipmid</b> serves IPMI, <b>dbus-sensors</b> reads sensors, <b>entity-manager</b> describes the board, <b>phosphor-state-manager</b>/<b>x86-power-control</b> handle power.',
      'They never call each other directly. Instead they publish <b>objects</b> on <b>D-Bus</b> under paths like <code>/xyz/openbmc_project/sensors/temperature/CPU0_Temp</code>, with interfaces like <code>xyz.openbmc_project.Sensor.Value</code>.',
      'Learn the D-Bus tools early: <code>busctl tree</code>, <code>busctl introspect</code> and <code>busctl get-property</code> on a BMC let you see the whole system state.',
    ],
    facts: [['Build system', 'Yocto / BitBake'], ['IPC', 'D-Bus (sdbusplus C++ bindings)'], ['Redfish server', 'bmcweb'], ['Board config', 'entity-manager JSON'], ['Language', 'Mostly C++']],
    terms: [['D-Bus object path', 'Hierarchical name of an object, e.g. /xyz/openbmc_project/state/host0.'], ['Interface', 'Contract of methods, properties and signals, e.g. xyz.openbmc_project.State.Host.'], ['Signal', 'Broadcast notification, e.g. PropertiesChanged when a sensor value changes.'], ['busctl', 'CLI to browse and call D-Bus. Your best debugging friend.'], ['phosphor-*', 'Name prefix of the original OpenBMC daemons (phosphor-logging, phosphor-ipmi-host...).']],
    atWork: 'Try on any OpenBMC system (or the QEMU <code>romulus</code>/<code>ast2600-evb</code> images): <code>busctl tree xyz.openbmc_project.State.Host</code>, then <code>busctl get-property xyz.openbmc_project.State.Host /xyz/openbmc_project/state/host0 xyz.openbmc_project.State.Host CurrentHostState</code>.',
    refs: [['OpenBMC docs: architecture', 'https://github.com/openbmc/docs/tree/master/architecture'], ['phosphor-dbus-interfaces', 'https://github.com/openbmc/phosphor-dbus-interfaces'], ['bmcweb', 'https://github.com/openbmc/bmcweb'], ['OpenBMC development (QEMU)', 'https://github.com/openbmc/docs/blob/master/development/dev-environment.md']],
    zones: [{ x: 190, y: 30, w: 795, h: 515, label: 'BMC SoC running OpenBMC (Linux)' }],
    nodes: [
      { id: 'admin', type: 'laptop', label: 'Admin laptop', sub: 'curl / ipmitool', x: 90, y: 200 },
      { id: 'web', type: 'svc', label: 'bmcweb', sub: 'Redfish :443', x: 310, y: 120 },
      { id: 'ipmid', type: 'svc', label: 'ipmid', sub: 'IPMI :623', x: 310, y: 300 },
      { id: 'dbus', type: 'bus', label: 'D-Bus broker', sub: 'system bus', x: 540, y: 220 },
      { id: 'state', type: 'svc', label: 'state-manager', sub: 'host/chassis state', x: 860, y: 90 },
      { id: 'power', type: 'svc', label: 'power-control', sub: 'drives power GPIOs', x: 860, y: 225 },
      { id: 'sens', type: 'svc', label: 'dbus-sensors', sub: 'hwmontempsensor', x: 680, y: 360 },
      { id: 'em', type: 'svc', label: 'entity-manager', sub: 'board JSON + FRU', x: 420, y: 400 },
      { id: 'kern', type: 'kernel', label: 'Linux kernel', sub: 'hwmon · gpio · i2c', x: 800, y: 485 },
      { id: 'hw', type: 'sensor', label: 'Board hardware', sub: 'TMP75 · GPIOs', x: 90, y: 485 },
    ],
    links: [
      { a: 'admin', b: 'web', kind: 'lan', label: 'HTTPS' }, { a: 'admin', b: 'ipmid', kind: 'lan', label: 'RMCP+' },
      { a: 'web', b: 'dbus', kind: 'dbus' }, { a: 'ipmid', b: 'dbus', kind: 'dbus' }, { a: 'dbus', b: 'state', kind: 'dbus' },
      { a: 'dbus', b: 'power', kind: 'dbus' }, { a: 'dbus', b: 'sens', kind: 'dbus' }, { a: 'dbus', b: 'em', kind: 'dbus' },
      { a: 'sens', b: 'kern', kind: 'sw', label: 'sysfs' }, { a: 'power', b: 'kern', kind: 'sw', label: 'libgpiod' }, { a: 'em', b: 'kern', kind: 'sw', label: 'i2c-dev' },
      { a: 'kern', b: 'hw', kind: 'i2c', label: 'I²C + GPIO pins' },
    ],
    steps: [
      { title: 'Services start', sub: 'Objects appear on D-Bus', text: 'systemd starts the daemons. <b>entity-manager</b> reads JSON board configs and FRU EEPROMs to work out what hardware exists, and publishes it. <b>dbus-sensors</b> reads that config and creates one D-Bus object per sensor.' },
      { title: 'Read a sensor', sub: 'Redfish GET becomes D-Bus GetAll', text: 'bmcweb turns the Redfish URL into a D-Bus call on the sensor object. dbus-sensors keeps the value current by polling the kernel hwmon driver, which reads the chip over I²C.' },
      { title: 'Power on', sub: 'Redfish POST becomes a property write', text: 'A Redfish Reset action becomes a D-Bus property write: <code>RequestedHostTransition = On</code>. The power-control daemon toggles the power GPIO and then updates <code>CurrentHostState</code>. Anyone listening gets a PropertiesChanged signal.' },
      { title: 'Same object, IPMI', sub: 'Front-ends share the back-end', text: 'An <code>ipmitool sensor</code> request reaches ipmid, which reads <b>the same D-Bus object</b>. This is why Redfish and IPMI always agree: there is one source of truth.' },
    ],
    msgs: [
      { t: '0.0s', from: 'kern', to: 'kern', proto: 'Boot', step: 0, info: 'U-Boot → kernel → systemd starts OpenBMC services', short: 'systemd up', layers: [L('Boot', [F('Init', 'systemd', null, 'Each daemon is a systemd unit, e.g. xyz.openbmc_project.EntityManager.service.')])] },
      { t: '8.1s', from: 'em', to: 'dbus', proto: 'D-Bus', step: 0, info: 'SIGNAL InterfacesAdded: board config published', short: 'InterfacesAdded', layers: [dbus({ type: 4, serial: 12, path: '/xyz/openbmc_project/inventory/system/board/MyBoard', iface: 'org.freedesktop.DBus.ObjectManager', member: 'InterfacesAdded', sigStr: 'oa{sa{sv}}' })], note: 'entity-manager matched a JSON config (probe) against FRU data and exported the board plus its sensor definitions.' },
      { t: '9.4s', from: 'sens', to: 'dbus', proto: 'D-Bus', step: 0, info: 'dbus-sensors creates /xyz/openbmc_project/sensors/temperature/CPU0_Temp', short: 'sensor object', layers: [dbus({ type: 4, serial: 3, path: '/xyz/openbmc_project/sensors/temperature/CPU0_Temp', iface: 'org.freedesktop.DBus.ObjectManager', member: 'InterfacesAdded', sigStr: 'oa{sa{sv}}' })] },
      { t: '60.00s', from: 'admin', to: 'web', proto: 'Redfish', step: 1, info: 'GET /redfish/v1/Chassis/chassis/Sensors/CPU0_Temp', short: 'GET Sensor', layers: N.https({ src: '10.0.0.5', dst: '10.0.0.20', tcp: [51022, 443, 1001, 5001, 'PSH,ACK'] }, 'GET /redfish/v1/Chassis/chassis/Sensors/CPU0_Temp HTTP/1.1', hdrs()) },
      { t: '60.01s', from: 'web', to: 'sens', via: ['dbus'], proto: 'D-Bus', step: 1, info: 'CALL Properties.GetAll("xyz.openbmc_project.Sensor.Value")', short: 'GetAll', layers: [dbus({ type: 1, serial: 811, path: '/xyz/openbmc_project/sensors/temperature/CPU0_Temp', iface: 'org.freedesktop.DBus.Properties', member: 'GetAll', dest: 'xyz.openbmc_project.HwmonTempSensor', sigStr: 's', body: [dstr('Arg 0: interface', 'xyz.openbmc_project.Sensor.Value')] })] },
      { t: '—', from: 'sens', to: 'kern', proto: 'sysfs', step: 1, info: 'read /sys/class/hwmon/hwmon3/temp1_input (polled every ~1 s)', short: 'read hwmon', layers: [L('sysfs read', [F('File', '/sys/class/hwmon/hwmon3/temp1_input', null, 'Kernel hwmon drivers expose readings as text files.', { eg: true }), F('Content', '41500', B.ascii('41500\n'), 'Millidegrees Celsius → 41.5 °C.')])], note: 'dbus-sensors polls in the background. The Redfish request is answered from the cached D-Bus value.' },
      { t: '—', from: 'kern', to: 'hw', proto: 'I²C', step: 1, info: 'lm75 driver: read temperature register of TMP75 @0x48', short: 'I²C read 0x48', layers: [L('I²C transaction', [F('Address + W', '0x48 + write', [0x90], ''), F('Pointer', '0x00 temperature', [0], ''), F('Address + R', '0x48 + read', [0x91], ''), F('Data MSB/LSB', '0x29 0x80 = 41.5 °C', [0x29, 0x80], 'MSB is whole degrees (0x29 = 41), LSB bit 7 = 0.5 °C.')])] },
      { t: '60.02s', from: 'sens', to: 'web', via: ['dbus'], proto: 'D-Bus', step: 1, info: 'RETURN {Value: 41.5, Unit: DegreesC, ...}', short: 'GetAll reply', layers: [dbus({ type: 2, serial: 57, replySerial: 811, dest: ':1.40', sigStr: 'a{sv}', body: [F('Value (double)', '41.5', B.hex('00 00 00 00 00 c0 44 40'), 'IEEE-754 double, little-endian (dictionary framing omitted for brevity).'), F('Unit', 'xyz.openbmc_project.Sensor.Value.Unit.DegreesC', null, '')] })] },
      { t: '60.03s', from: 'web', to: 'admin', proto: 'Redfish', step: 1, info: '200 OK {"Reading": 41.5, "ReadingUnits": "Cel"}', short: '200 OK', layers: N.https({ src: '10.0.0.20', dst: '10.0.0.5', tcp: [443, 51022, 5001, 1200, 'PSH,ACK'] }, 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { '@odata.id': '/redfish/v1/Chassis/chassis/Sensors/CPU0_Temp', Name: 'CPU0 Temp', Reading: 41.5, ReadingUnits: 'Cel', Status: { Health: 'OK', State: 'Enabled' } }) },
      { t: '75.00s', from: 'admin', to: 'web', proto: 'Redfish', step: 2, info: 'POST .../Systems/system/Actions/ComputerSystem.Reset {"ResetType":"On"}', short: 'POST Reset On', layers: N.https({ src: '10.0.0.5', dst: '10.0.0.20', tcp: [51022, 443, 1300, 5800, 'PSH,ACK'] }, 'POST /redfish/v1/Systems/system/Actions/ComputerSystem.Reset HTTP/1.1', hdrs({ 'Content-Type': 'application/json' }), { ResetType: 'On' }) },
      { t: '75.01s', from: 'web', to: 'power', via: ['dbus'], proto: 'D-Bus', step: 2, info: 'Set RequestedHostTransition = ...Transition.On', short: 'Set property', layers: [dbus({ type: 1, serial: 830, path: '/xyz/openbmc_project/state/host0', iface: 'org.freedesktop.DBus.Properties', member: 'Set', dest: 'xyz.openbmc_project.State.Host', sigStr: 'ssv', body: [dstr('Arg 0: interface', 'xyz.openbmc_project.State.Host'), dstr('Arg 1: property', 'RequestedHostTransition'), dstr('Arg 2: value (variant s)', 'xyz.openbmc_project.State.Host.Transition.On')] })], note: 'On x86 boards x86-power-control owns the State.Host object. On others phosphor-state-manager owns it and starts systemd targets such as obmc-host-start@0.target.' },
      { t: '75.02s', from: 'power', to: 'hw', via: ['kern'], proto: 'GPIO', step: 2, info: 'gpiod: POWER_OUT low for 200 ms (virtual button press)', short: 'POWER_OUT pulse', layers: FX.sig('POWER_OUT', 'LOW 200 ms then HIGH', 'Same wire the physical button drives. See the "Server power-on" lesson.', [F('Line name', 'POWER_OUT', null, 'GPIO lines are found by name from the device tree (gpio-line-names).')]) },
      { t: '78.5s', from: 'power', to: 'dbus', proto: 'D-Bus', step: 2, info: 'SIGNAL PropertiesChanged CurrentHostState = Running', short: 'PropertiesChanged', layers: [dbus({ type: 4, serial: 91, path: '/xyz/openbmc_project/state/host0', iface: 'org.freedesktop.DBus.Properties', member: 'PropertiesChanged', sigStr: 'sa{sv}as', body: [dstr('Arg 0: interface', 'xyz.openbmc_project.State.Host')] })] },
      { t: '75.03s', from: 'web', to: 'admin', proto: 'Redfish', step: 2, info: '204 No Content (action accepted)', short: '204', layers: N.https({ src: '10.0.0.20', dst: '10.0.0.5', tcp: [443, 51022, 5800, 1420, 'PSH,ACK'] }, 'HTTP/1.1 204 No Content', {}) },
      { t: '90.0s', from: 'admin', to: 'ipmid', proto: 'IPMI', step: 3, info: 'ipmitool sdr get CPU0_Temp → Get Sensor Reading', short: 'Get Sensor Reading', layers: [I.msg({ a1: 0x20, netFn: 0x04, a2: 0x81, seq: 3, cmd: 0x2d, cmdName: 'Get Sensor Reading', data: [F('Sensor number', '0x01', [1], 'IPMI sensors are numbered. ipmid maps numbers to D-Bus paths.', { eg: true })] })], note: 'Shown without the RMCP+ session wrapper. See the "IPMI over LAN" lesson for the full packet.' },
      { t: '90.0s', from: 'ipmid', to: 'sens', via: ['dbus'], proto: 'D-Bus', step: 3, info: 'CALL Properties.Get(Sensor.Value, "Value"): same object as Redfish', short: 'Get Value', layers: [dbus({ type: 1, serial: 77, path: '/xyz/openbmc_project/sensors/temperature/CPU0_Temp', iface: 'org.freedesktop.DBus.Properties', member: 'Get', dest: 'xyz.openbmc_project.HwmonTempSensor', sigStr: 'ss', body: [dstr('Arg 0', 'xyz.openbmc_project.Sensor.Value'), dstr('Arg 1', 'Value')] })] },
    ],
  });

  /* =============== Lesson: chassis control backplane =============== */
  const dhcp = (op, yiaddr, msgType, mac) => {
    const opts = [53, 1, msgType, ...(op === 2 ? [54, 4, 10, 254, 0, 1, 51, 4, ...B.u32be(86400), 1, 4, 255, 255, 255, 0] : [55, 3, 1, 3, 6]), 255];
    return L('DHCP · ' + (msgType === 1 ? 'DISCOVER' : msgType === 2 ? 'OFFER' : msgType === 3 ? 'REQUEST' : 'ACK'), [
      F('Op', op === 1 ? 'BOOTREQUEST (1)' : 'BOOTREPLY (2)', [op], ''), F('HW type / len / hops', 'Ethernet / 6 / 0', [1, 6, 0], ''),
      F('Transaction ID', '0x3903f326', B.hex('39 03 f3 26'), 'Matches offers to requests.', { eg: true }), F('Secs / Flags', '0 / broadcast', [0, 0, 0x80, 0], ''),
      F('Client IP (ciaddr)', '0.0.0.0', [0, 0, 0, 0], ''), F('Your IP (yiaddr)', yiaddr, B.ip(yiaddr), 'The address being offered.'),
      F('Server / relay IP', '0.0.0.0 / 0.0.0.0', B.zeros(8), ''), F('Client MAC (chaddr)', mac, [...B.mac(mac), ...B.zeros(10)], 'The blade BMC\'s MAC. Many systems map MAC/slot → fixed IP.', { eg: true }),
      F('sname + file', '(empty)', B.zeros(192), 'Legacy BOOTP fields.'), F('Magic cookie', '63 82 53 63', B.hex('63 82 53 63'), 'Marks the start of DHCP options.'),
      F('Options', msgType === 1 ? '53=DISCOVER, 55=param list' : '53=OFFER, 54=server, 51=lease, 1=mask', opts, 'TLV options.'),
    ]);
  };
  window.FX.dhcp = dhcp;
  LESSONS.push({
    id: "backplane", cat: "hardware", ord: 60, mins: 12, tags: ["chassis", "backplane", "blade", "hot-swap", "fru", "ipmb"], prereq: ["power-on"], title: 'Chassis control backplane', subtitle: 'Chassis manager ↔ blade BMCs',
    keywords: 'chassis controller blade backplane presence hot swap power budget cray ex cc nc onboard administrator',
    intro: 'In a multi-node chassis no blade powers itself on alone. A <b>chassis manager</b> watches presence pins, checks the power budget, enables 12 V to the slot and controls the fans. All of this runs over the <b>control backplane</b>.',
    overview: [
      'A chassis (blade enclosure, HPC cabinet chassis, multi-node 2U) shares PSUs and fans between several nodes. Someone has to arbitrate: the <b>chassis manager / chassis controller</b>.',
      'The <b>backplane</b> is the board the blades plug into. Besides high-speed data it carries the <b>control plane</b>: presence-detect pins, power-enable lines, I²C/IPMB to each slot, and usually a small <b>management Ethernet switch</b> that connects every blade\'s BMC to the chassis manager.',
      'The flow on insertion is: detect presence → identify the blade (FRU) → check power budget → enable slot power → the blade BMC boots and gets an IP → it is monitored and controlled like any BMC.',
    ],
    facts: [['Presence', 'PRSNT# pin per slot (GPIO)'], ['Slot power', 'Hot-swap controller + PWR_EN'], ['Identity', 'FRU EEPROM over I²C'], ['Mgmt traffic', 'Backplane Ethernet (Redfish), sometimes IPMB']],
    terms: [['Hot-swap controller', 'Chip that limits inrush current when a blade gets 12 V, so inserting a blade does not glitch the shared bus.'], ['IPMB', 'IPMI over I²C between controllers (address 0x20 = BMC).'], ['Power budget', 'Total PSU capacity minus redundancy reserve minus what is already allocated.'], ['FRU', 'Field Replaceable Unit. Its EEPROM stores part number, serial and manufacturer.']],
    atWork: 'Generic model. For example, in <b>HPE Cray EX</b> each chassis has a Chassis Controller (cC), blades have Node Controllers (nC) and switches have Switch Controllers (sC); they expose Redfish over the hardware management network. Older HPE BladeSystem used an Onboard Administrator, and Synergy uses Frame Link Modules. Ask your team which applies to your product, and map the boxes here to the real names.',
    refs: [['IPMI 2.0 spec (IPMB)', 'https://www.intel.com/content/www/us/en/products/docs/servers/ipmi/ipmi-second-gen-interface-spec-v2-rev1-1.html'], ['DMTF Redfish Chassis schema', 'https://redfish.dmtf.org/schemas/v1/Chassis.v1_25_0.json']],
    zones: [{ x: 60, y: 300, w: 880, h: 160, label: 'Backplane slots' }],
    nodes: [
      { id: 'psu', type: 'psu', label: 'PSU bank', sub: '4 × 3 kW shared', x: 140, y: 100 },
      { id: 'cmc', type: 'chassis', label: 'Chassis manager', sub: 'chassis controller', x: 500, y: 90 },
      { id: 'fan', type: 'fan', label: 'Fan modules', sub: 'PWM + tach', x: 860, y: 100 },
      { id: 'sw', type: 'switch', label: 'Mgmt switch', sub: 'on backplane', x: 500, y: 225 },
      { id: 'up', type: 'console', label: 'System mgmt', sub: 'cluster manager', x: 860, y: 225 },
      { id: 'b1', type: 'blade', label: 'Blade 1 BMC', sub: '10.254.1.11', x: 190, y: 390 },
      { id: 'b2', type: 'blade', label: 'Blade 2 BMC', sub: '10.254.1.12', x: 500, y: 390 },
      { id: 'b3', type: 'blade', label: 'Blade 3 BMC', sub: 'just inserted', x: 810, y: 390 },
    ],
    links: [
      { a: 'cmc', b: 'psu', kind: 'i2c', label: 'PMBus' }, { a: 'cmc', b: 'fan', kind: 'gpio', label: 'PWM / tach' }, { a: 'cmc', b: 'sw', kind: 'lan' },
      { a: 'sw', b: 'up', kind: 'lan', label: 'uplink' }, { a: 'sw', b: 'b1', kind: 'lan', label: 'backplane Eth' }, { a: 'sw', b: 'b2', kind: 'lan' }, { a: 'sw', b: 'b3', kind: 'lan', label: 'backplane Eth' },
      { a: 'cmc', b: 'b3', kind: 'gpio', label: 'PRSNT# · PWR_EN · I²C', t: .62 }, { a: 'cmc', b: 'b1', kind: 'gpio', label: 'per-slot I²C/GPIO', t: .62 },
    ],
    steps: [
      { title: 'Blade inserted', sub: 'Presence + identity', text: 'Seating the blade grounds its <b>PRSNT#</b> pin. The chassis manager gets an interrupt and reads the blade\'s <b>FRU EEPROM</b> over the slot\'s standby-powered I²C to learn what it is and how much power it may draw.' },
      { title: 'Power budget', sub: 'Can we afford it?', text: 'The manager reads PSU output over <b>PMBus</b>, subtracts the redundancy reserve and existing allocations, and only then asserts <b>PWR_EN</b>. The blade\'s hot-swap controller ramps 12 V gently.' },
      { title: 'BMC joins network', sub: 'DHCP on the internal network', text: 'The blade BMC boots on standby power and sends <b>DHCP DISCOVER</b> on the backplane Ethernet. The chassis manager (or the system manager) answers, often with an IP derived from the <b>slot number</b>, so addresses are predictable.' },
      { title: 'Monitor + cool', sub: 'Telemetry drives fans', text: 'The manager polls each blade BMC (Redfish) for temperatures and sets the shared fans to satisfy the <b>hottest</b> blade.' },
      { title: 'Coordinated control', sub: 'Commands from above', text: 'Higher-level software (cluster manager) talks to the chassis manager, which applies the command to the blades, e.g. a <b>chassis power cap</b> split across nodes.' },
    ],
    msgs: [
      { t: '0.00s', from: 'b3', to: 'cmc', proto: 'GPIO', step: 0, info: 'PRSNT#_SLOT3 asserted: blade seated', short: 'PRSNT# low', layers: FX.sig('PRSNT#_SLOT3', 'LOW', 'Blade present. Presence pins are the shortest, so they make contact last and break first.') },
      { t: '0.05s', from: 'cmc', to: 'b3', proto: 'I²C', step: 0, info: 'Read blade FRU EEPROM @0x50 (product info area)', short: 'FRU read', layers: [L('I²C transaction', [F('Mux select', 'channel 3', null, 'Each slot is usually behind an I²C mux channel.'), F('Address + W', '0x50 + write', [0xa0], 'Standard FRU EEPROM address.', { eg: true }), F('Offset', '0x0000', [0, 0], '2-byte offset for larger EEPROMs.'), F('Address + R', '0x50 + read', [0xa1], '')])] },
      { t: '0.06s', from: 'b3', to: 'cmc', proto: 'I²C', step: 0, info: 'FRU: common header + product "Compute Blade XY", max 650 W', short: 'FRU data', layers: [L('IPMI FRU data', [F('Common header', 'ver 1, board @8, product @40', [0x01, 0x00, 0x00, 0x01, 0x05, 0x00, 0x00, 0xf9], 'Offsets in 8-byte units; last byte is a zero-sum checksum.', { eg: true }), F('Product name', 'Compute Blade XY', [0xd0, ...B.ascii('Compute Blade XY')], 'Type/length byte 0xD0 = 8-bit ASCII, 16 chars.', { eg: true }), F('OEM: power class', '650 W', null, 'Power needs are often in an OEM record or learned from the blade BMC.', { eg: true })])] },
      { t: '0.10s', from: 'cmc', to: 'psu', proto: 'PMBus', step: 1, info: 'READ_POUT (0x96) on each PSU', short: 'READ_POUT', layers: [L('PMBus', [F('Address + W', '0x58', [0xb0], '', { eg: true }), F('Command', 'READ_POUT (0x96)', [0x96], 'Output power, LINEAR11 format.'), F('Address + R', '0x58 + read', [0xb1], ''), F('Data', '1450 W total (example)', null, 'See the "Sensors: I²C & PMBus" lesson for LINEAR11 decoding.')])] },
      { t: '0.11s', from: 'cmc', to: 'cmc', proto: 'Logic', step: 1, info: 'Budget: 9000 W usable (N+1) − 1450 W used ≥ 650 W → allow', short: 'budget OK', layers: [L('Power budget', [F('Capacity', '4 × 3000 W', null, ''), F('Redundancy', 'N+1 → 9000 W usable', null, 'One PSU may fail without dropping load.'), F('Allocated', '1450 W', null, ''), F('Request', '650 W', null, ''), F('Decision', 'Grant', null, 'If denied, the slot stays off and an event is logged.')])] },
      { t: '0.12s', from: 'cmc', to: 'b3', proto: 'GPIO', step: 1, info: 'PWR_EN_SLOT3 asserted → hot-swap controller ramps 12 V', short: 'PWR_EN', layers: FX.sig('PWR_EN_SLOT3', 'HIGH', 'Slot standby → main power. Inrush is limited by the hot-swap controller.') },
      { t: '40.0s', from: 'b3', to: 'cmc', via: ['sw'], proto: 'DHCP', step: 2, info: 'DHCP DISCOVER from blade 3 BMC', short: 'DHCP DISCOVER', layers: N.packet({ eth: ['ff:ff:ff:ff:ff:ff', '02:00:0a:fe:01:0d'], src: '0.0.0.0', dst: '255.255.255.255', udp: [68, 67], app: [dhcp(1, '0.0.0.0', 1, '02:00:0a:fe:01:0d')] }) },
      { t: '40.1s', from: 'cmc', to: 'b3', via: ['sw'], proto: 'DHCP', step: 2, info: 'DHCP OFFER 10.254.1.13 (slot 3 → .13)', short: 'DHCP OFFER', layers: N.packet({ eth: ['02:00:0a:fe:01:0d', '02:00:0a:fe:00:01'], src: '10.254.0.1', dst: '10.254.1.13', udp: [67, 68], app: [dhcp(2, '10.254.1.13', 2, '02:00:0a:fe:01:0d')] }) },
      { t: '60.0s', from: 'cmc', to: 'b1', via: ['sw'], proto: 'Redfish', step: 3, info: 'GET /redfish/v1/Chassis/Blade/ThermalSubsystem/ThermalMetrics', short: 'GET thermal', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.11', tcp: [40100, 443, 1, 1, 'PSH,ACK'] }, 'GET /redfish/v1/Chassis/Blade/ThermalSubsystem/ThermalMetrics HTTP/1.1', { Host: '10.254.1.11', 'X-Auth-Token': '7Hc...' }) },
      { t: '60.1s', from: 'b1', to: 'cmc', via: ['sw'], proto: 'Redfish', step: 3, info: '200 OK CPU 78 °C (hottest in chassis)', short: '200 temps', layers: N.https({ src: '10.254.1.11', dst: '10.254.0.1', tcp: [443, 40100, 1, 200, 'PSH,ACK'] }, 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { TemperatureReadingsCelsius: [{ DeviceName: 'CPU0', Reading: 78 }, { DeviceName: 'Inlet', Reading: 24 }] }) },
      { t: '60.2s', from: 'cmc', to: 'fan', proto: 'PWM', step: 3, info: 'Fan duty 40% → 65% (PID on hottest margin)', short: 'fans 65%', layers: [L('Fan control', [F('PWM duty', '65 %', [166], '166/255 ≈ 65 %.', { eg: true }), F('Tach feedback', '9 800 RPM', null, 'Fans report speed with tach pulses; a missing tach = failed fan.', { eg: true })])] },
      { t: '120.0s', from: 'up', to: 'cmc', via: ['sw'], proto: 'Redfish', step: 4, info: 'PATCH chassis power limit 1800 W', short: 'PATCH power cap', layers: N.https({ src: '10.1.0.2', dst: '10.254.0.1', tcp: [50200, 443, 1, 1, 'PSH,ACK'] }, 'PATCH /redfish/v1/Chassis/Enclosure/Controls/PowerLimit HTTP/1.1', { Host: 'chassis', 'X-Auth-Token': 'a1b...', 'Content-Type': 'application/json' }, { SetPoint: 1800 }) },
      { t: '120.1s', from: 'cmc', to: 'b1', via: ['sw'], proto: 'Redfish', step: 4, info: 'PATCH node power limit 600 W', short: 'cap blade 1', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.11', tcp: [40101, 443, 1, 1, 'PSH,ACK'] }, 'PATCH /redfish/v1/Chassis/Blade/Controls/PowerLimit HTTP/1.1', { Host: '10.254.1.11', 'X-Auth-Token': '7Hc...', 'Content-Type': 'application/json' }, { SetPoint: 600 }) },
      { t: '120.1s', from: 'cmc', to: 'b2', via: ['sw'], proto: 'Redfish', step: 4, info: 'PATCH node power limit 600 W', short: 'cap blade 2', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.12', tcp: [40102, 443, 1, 1, 'PSH,ACK'] }, 'PATCH /redfish/v1/Chassis/Blade/Controls/PowerLimit HTTP/1.1', { Host: '10.254.1.12', 'X-Auth-Token': '9Qd...', 'Content-Type': 'application/json' }, { SetPoint: 600 }) },
    ],
  });
})();
