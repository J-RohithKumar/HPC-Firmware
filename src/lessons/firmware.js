(function () {
  const { B, F, L, N, M, hx } = FX;
  const spi = FX.spi;
  const C = '10.0.0.5', BM = '10.0.0.20';
  const T = { Host: 'bmc', 'X-Auth-Token': '4f1c0e...9a' };
  const hs = (s, d, sp, dp) => ({ src: s, dst: d, tcp: [sp, dp, 1, 1, 'PSH,ACK'] });

  /* =============== BMC firmware update =============== */
  const multipart = (() => {
    const bnd = '------fwx7MA4YWxk';
    const f = [
      F('Request line', 'POST /redfish/v1/UpdateService/update HTTP/1.1', B.ascii('POST /redfish/v1/UpdateService/update HTTP/1.1\r\n'), 'OpenBMC\'s MultipartHttpPushUri (older OpenBMC also accepted a raw POST to /redfish/v1/UpdateService).'),
      F('Content-Type', 'multipart/form-data; boundary=' + bnd, B.ascii('Content-Type: multipart/form-data; boundary=' + bnd + '\r\n'), 'Multipart lets you send JSON parameters and the binary image in one request.'),
      F('X-Auth-Token', '4f1c0e...9a', B.ascii('X-Auth-Token: 4f1c0e...9a\r\n\r\n'), ''),
      F('Part 1: UpdateParameters', '{"Targets":["/redfish/v1/Managers/bmc"],"@Redfish.OperationApplyTime":"OnReset"}', B.ascii('--' + bnd + '\r\nContent-Disposition: form-data; name="UpdateParameters"\r\nContent-Type: application/json\r\n\r\n{"Targets":["/redfish/v1/Managers/bmc"],"@Redfish.OperationApplyTime":"OnReset"}\r\n'), 'Which component to update and when to apply it.'),
      F('Part 2: UpdateFile header', 'obmc-phosphor-image.static.mtd.tar', B.ascii('--' + bnd + '\r\nContent-Disposition: form-data; name="UpdateFile"; filename="obmc-phosphor-image.static.mtd.tar"\r\nContent-Type: application/octet-stream\r\n\r\n'), ''),
      F('Image bytes (first 32)', 'tar header: "MANIFEST"…', [...B.ascii('MANIFEST'), ...B.zeros(24)], 'An OpenBMC image is a tar file: MANIFEST, publickey, image-u-boot, image-kernel, image-rofs, image-rwfs, plus .sig files.'),
      F('…rest of image', '≈ 32 MB more', null, 'Not shown.'),
    ];
    return L('HTTP/1.1 multipart (decrypted view)', f);
  })();
  const sr = (st, d) => spi(0x05, 'READ STATUS REGISTER', null, 0, { v: st, b: [st === 'WIP=1' ? 0x03 : 0x00] }, 'Status (MISO)', d);
  LESSONS.push({
    id: "bmc-update", cat: "firmware", ord: 250, mins: 18, tags: ["firmware", "update", "redfish", "spi", "flash", "dual-bank", "signature"], prereq: ["redfish", "power-on"], title: 'Flashing BMC firmware', subtitle: 'Redfish UpdateService → signed image → SPI flash',
    keywords: 'firmware update redfish updateservice multipart signature verify spi flash erase program dual bank abr golden image reboot task',
    intro: 'Updating BMC firmware means: upload an image, <b>prove it is genuine</b>, write it to flash <b>without bricking the board</b>, and reboot into it. Watch each step down to the SPI erase/program commands.',
    overview: [
      'The image arrives over Redfish (<b>UpdateService</b>): either pushed by the client (HttpPushUri / MultipartHttpPushUri) or pulled by the BMC (<code>SimpleUpdate</code> with an ImageURI).',
      'The BMC <b>verifies</b> it: the manifest says what it is for (machine, purpose, version) and a <b>signature</b> made with the vendor\'s private key is checked against a public key the BMC trusts. On HPE servers the silicon root of trust and iLO also verify firmware at boot.',
      'Writing uses SPI NOR flash commands: <b>Write Enable</b> (0x06), <b>Erase</b> (whole 64 KB blocks, sets bits to 1), <b>Page Program</b> (up to 256 bytes, can only turn 1s into 0s), polling the <b>Status</b> register\'s WIP bit. Safe designs write to an <b>alternate bank</b> so the running image stays intact, then switch on reboot.',
    ],
    facts: [['Redfish', 'UpdateService, TaskService, FirmwareInventory'], ['SPI erase unit', '4 KB sector / 64 KB block'], ['SPI program unit', '256-byte page'], ['Typical flash', '32–128 MB SPI NOR'], ['Safety', 'Dual bank / golden image, signed images']],
    terms: [['Dual bank / ABR', 'Two copies of firmware. Write the inactive one; a watchdog falls back to the old one if the new one fails to boot.'], ['Golden image', 'Known-good recovery copy that is never overwritten in the field.'], ['WIP', 'Write-In-Progress bit (status bit 0). Erase/program are slow (ms to s), so you poll it.'], ['WEL', 'Write Enable Latch (status bit 1). Cleared after every erase/program, so 0x06 must be sent again.'], ['Activation', 'Making a staged image the one used at next boot.']],
    atWork: 'On iLO you would use the iLO GUI, iLOrest (<code>ilorest flashfwpkg</code>) or Redfish UpdateService; iLO also keeps a <b>recovery set</b> of firmware. In OpenBMC, <code>phosphor-bmc-code-mgmt</code> (software manager) does the verify/stage/activate steps and exposes each image under <code>/xyz/openbmc_project/software/&lt;id&gt;</code>.',
    refs: [['OpenBMC code update design', 'https://github.com/openbmc/docs/blob/master/architecture/code-update/code-update.md'], ['Redfish UpdateService', 'https://redfish.dmtf.org/schemas/v1/UpdateService.v1_14_0.json'], ['JEDEC SFDP / SPI NOR basics (Winbond W25Q datasheet)', 'https://www.winbond.com/hq/product/code-storage-flash-memory/serial-nor-flash/']],
    zones: [{ x: 300, y: 30, w: 680, h: 510, label: 'BMC' }],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: 'curl / iLOrest', x: 130, y: 120 },
      { id: 'web', type: 'svc', label: 'Redfish server', sub: 'bmcweb / iLO web', x: 450, y: 120 },
      { id: 'mgr', type: 'svc', label: 'Software manager', sub: 'verify · stage · activate', x: 450, y: 330 },
      { id: 'ctl', type: 'bmc', label: 'SPI controller', sub: 'in BMC SoC (FMC)', x: 780, y: 330 },
      { id: 'f0', type: 'flash', label: 'Flash bank A', sub: 'running v2.10', x: 640, y: 490 },
      { id: 'f1', type: 'flash', label: 'Flash bank B', sub: 'inactive → v2.12', x: 900, y: 490 },
      { id: 'wd', type: 'cpld', label: 'Boot watchdog', sub: 'ABR / bank select', x: 820, y: 120, tag: 'WDT' },
    ],
    links: [
      { a: 'pc', b: 'web', kind: 'lan', label: 'HTTPS' }, { a: 'web', b: 'mgr', kind: 'dbus', label: 'D-Bus / IPC' }, { a: 'mgr', b: 'ctl', kind: 'sw', label: 'mtd driver' },
      { a: 'ctl', b: 'f0', kind: 'spi', label: 'CS0' }, { a: 'ctl', b: 'f1', kind: 'spi', label: 'CS1' }, { a: 'mgr', b: 'wd', kind: 'sw', label: 'set boot bank' }, { a: 'wd', b: 'ctl', kind: 'gpio' },
    ],
    steps: [
      { title: 'Discover', sub: 'What does UpdateService accept?', text: 'GET UpdateService tells you the upload URI, supported protocols for pull mode, and links to FirmwareInventory (current versions).' },
      { title: 'Upload', sub: 'Multipart POST → 202 + Task', text: 'The image and its parameters are sent in one multipart request. Updates are slow, so the BMC replies <b>202 Accepted</b> with a <b>Task</b> to poll.' },
      { title: 'Verify', sub: 'Manifest + signature', text: 'The software manager unpacks the image, checks the MANIFEST (purpose = BMC, MachineName matches this board) and verifies each <b>.sig</b> file with the trusted public key. Any mismatch → reject, nothing is written.' },
      { title: 'Erase + program', sub: 'SPI commands on bank B', text: 'For each 64 KB block: <b>WREN</b>, <b>Block Erase</b>, poll <b>WIP</b>. Then for each 256-byte page: WREN, <b>Page Program</b>, poll. Finally read back and compare. Bank A (the running firmware) is never touched.' },
      { title: 'Activate + reboot', sub: 'Switch banks safely', text: 'The manager tells the boot watchdog to boot bank B next time and reboots the BMC. If bank B fails to boot before the watchdog expires, hardware switches back to bank A automatically.' },
      { title: 'Confirm', sub: 'Task completed', text: 'After reboot the BMC reports the new version in FirmwareInventory and the Task shows <b>Completed</b>. The <b>host keeps running</b> during a BMC update.' },
    ],
    msgs: [
      { t: '0.0s', from: 'pc', to: 'web', proto: 'Redfish', step: 0, info: 'GET /redfish/v1/UpdateService', short: 'GET UpdateService', layers: N.https(hs(C, BM, 53000, 443), 'GET /redfish/v1/UpdateService HTTP/1.1', T) },
      { t: '0.1s', from: 'web', to: 'pc', proto: 'Redfish', step: 0, info: '200 OK MultipartHttpPushUri, SimpleUpdate, FirmwareInventory', short: '200 UpdateService', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { '@odata.id': '/redfish/v1/UpdateService', ServiceEnabled: true, MultipartHttpPushUri: '/redfish/v1/UpdateService/update', FirmwareInventory: { '@odata.id': '/redfish/v1/UpdateService/FirmwareInventory' }, Actions: { '#UpdateService.SimpleUpdate': { target: '/redfish/v1/UpdateService/Actions/UpdateService.SimpleUpdate', 'TransferProtocol@Redfish.AllowableValues': ['HTTPS'] } } }) },
      { t: '2.0s', from: 'pc', to: 'web', proto: 'Redfish', step: 1, info: 'POST /redfish/v1/UpdateService/update (multipart, 32 MB image)', short: 'POST image', layers: (() => { const len = FX.bytesOf(multipart.fields).length; return N.packet({ src: C, dst: BM, tcp: [53000, 443, 1, 1, 'PSH,ACK'], app: [N.tlsHdr(len), multipart, N.tlsTag()] }); })(), note: 'Really thousands of TCP segments. Only the start of the request is shown.' },
      { t: '25s', from: 'web', to: 'pc', proto: 'Redfish', step: 1, info: '202 Accepted, Task /redfish/v1/TaskService/Tasks/0', short: '202 Task', layers: N.https(hs(BM, C, 443, 53000), 'HTTP/1.1 202 Accepted', { Location: '/redfish/v1/TaskService/Tasks/0/Monitor', 'Content-Type': 'application/json' }, { '@odata.id': '/redfish/v1/TaskService/Tasks/0', TaskState: 'Running', PercentComplete: 0 }) },
      { t: '25s', from: 'web', to: 'mgr', proto: 'D-Bus', step: 2, info: 'Image saved to /tmp/images; software manager notified', short: 'new image', layers: [L('Handoff', [F('File', '/tmp/images/obmc-phosphor-image.static.mtd.tar', null, 'OpenBMC watches this directory (inotify).'), F('D-Bus object', '/xyz/openbmc_project/software/5ab4f03e', null, 'Created for the new image; Activation = Ready.', { eg: true })])] },
      { t: '27s', from: 'mgr', to: 'mgr', proto: 'Verify', step: 2, info: 'MANIFEST + SHA-512 signature check with trusted public key: OK', short: 'verify OK', layers: [L('MANIFEST (text file in the tar)', [F('purpose', 'xyz.openbmc_project.Software.Version.VersionPurpose.BMC', B.ascii('purpose=xyz.openbmc_project.Software.Version.VersionPurpose.BMC\n'), 'Rejects a BIOS image sent to the BMC slot.'), F('version', '2.12.0', B.ascii('version=2.12.0\n'), '', { eg: true }), F('MachineName', 'myboard', B.ascii('MachineName=myboard\n'), 'Rejects images built for a different board.', { eg: true }), F('KeyType / HashType', 'OpenBMC / RSA-SHA512', B.ascii('KeyType=OpenBMC\nHashType=RSA-SHA512\n'), '')]), L('Signature check', [F('Files', 'image-*.sig, MANIFEST.sig, publickey.sig', null, 'Each file has a detached signature.'), F('Result', 'Verified', null, 'openssl dgst -sha512 -verify publickey -signature image-kernel.sig image-kernel (conceptually).')])] },
      { t: '28s', from: 'mgr', to: 'f1', via: ['ctl'], proto: 'SPI', step: 3, info: 'WRITE ENABLE (0x06)', short: 'WREN', layers: spi(0x06, 'WRITE ENABLE', null, 0, null), note: 'Sets the Write Enable Latch. Required before every erase or program.' },
      { t: '28s', from: 'mgr', to: 'f1', via: ['ctl'], proto: 'SPI', step: 3, info: '4B BLOCK ERASE 64KB (0xDC) @0x00000000', short: 'BLOCK ERASE', layers: spi(0xdc, '4-BYTE BLOCK ERASE 64 KB', 0x00000000, 4, null), note: 'Erase turns every bit in the 64 KB block to 1 (bytes read 0xFF). Takes ~150 ms–2 s.' },
      { t: '28.2s', from: 'f1', to: 'mgr', via: ['ctl'], proto: 'SPI', step: 3, info: 'RDSR (0x05) → 0x03: WIP=1 busy …', short: 'RDSR busy', layers: sr('WIP=1', 'Bit 0 WIP = 1 (busy), bit 1 WEL = 1. Keep polling.') },
      { t: '28.9s', from: 'f1', to: 'mgr', via: ['ctl'], proto: 'SPI', step: 3, info: 'RDSR (0x05) → 0x00: erase done', short: 'RDSR ready', layers: sr('WIP=0', 'Ready. WEL cleared automatically.') },
      { t: '29s', from: 'mgr', to: 'f1', via: ['ctl'], proto: 'SPI', step: 3, info: '4B PAGE PROGRAM (0x12) @0x00000000, 256 bytes (U-Boot start)', short: 'PAGE PROGRAM', layers: spi(0x12, '4-BYTE PAGE PROGRAM', 0, 4, { v: '256 bytes: be 00 00 ea …', b: [...B.hex('be 00 00 ea 14 f0 9f e5 14 f0 9f e5 14 f0 9f e5'), ...B.rnd(48, 5)], eg: true }, 'Data (first 64 of 256 bytes)', 'Programming only changes 1 → 0. That is why you erase first. Writes must not cross a 256-byte page boundary.'), note: 'Preceded by another WREN (not shown). Repeated ~131 000 times for 32 MB.' },
      { t: '3m 10s', from: 'mgr', to: 'f1', via: ['ctl'], proto: 'SPI', step: 3, info: 'Verify: 4B FAST READ (0x0C) and compare with image', short: 'read-back verify', layers: spi(0x0c, '4-BYTE FAST READ', 0, 4, { v: 'be 00 00 ea … (matches)', b: B.hex('be 00 00 ea 14 f0 9f e5'), eg: true }, 'Data', 'Byte-for-byte compare against the image.', true) },
      { t: '3m 12s', from: 'mgr', to: 'wd', proto: 'Control', step: 4, info: 'Set next boot = bank B, arm watchdog; Activation = Active', short: 'switch bank', layers: [L('Activation', [F('D-Bus property', 'Activation = ...Activation.Active', null, 'xyz.openbmc_project.Software.Activation on the image object.'), F('Boot select', 'bank B (CS1)', null, 'Platform specific: an SoC register, a U-Boot environment variable or a CPLD bit.'), F('Watchdog', 'armed, e.g. 5 min', null, 'If the new firmware never reports a healthy boot, the hardware falls back to bank A.', { eg: true })])] },
      { t: '3m 13s', from: 'wd', to: 'ctl', proto: 'Control', step: 4, info: 'BMC reboot → boot ROM fetches from bank B', short: 'reboot', layers: FX.sig('BMC_RESET / boot-source select', 'bank B', 'The host is not affected: the BMC reboot does not touch host power.') },
      { t: '4m 30s', from: 'pc', to: 'web', proto: 'Redfish', step: 5, info: 'GET /redfish/v1/TaskService/Tasks/0', short: 'poll task', layers: N.https(hs(C, BM, 53001, 443), 'GET /redfish/v1/TaskService/Tasks/0 HTTP/1.1', T) },
      { t: '4m 30s', from: 'web', to: 'pc', proto: 'Redfish', step: 5, info: '200 OK TaskState Completed; Manager FirmwareVersion 2.12.0', short: 'Completed', layers: N.https(hs(BM, C, 443, 53001), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { TaskState: 'Completed', TaskStatus: 'OK', PercentComplete: 100, Messages: [{ MessageId: 'Update.1.0.UpdateSuccessful' }] }) },
    ],
  });

  /* =============== BIOS flash via BMC =============== */
  LESSONS.push({
    id: "bios-update", cat: "firmware", ord: 260, mins: 15, tags: ["bios", "uefi", "flash", "spi", "mux", "capsule", "recovery"], prereq: ["bmc-update", "power-on"], title: 'Flashing BIOS via the BMC', subtitle: 'BMC takes over the host SPI flash',
    keywords: 'bios uefi flash spi mux ownership host off capsule rom update recovery',
    intro: 'The BIOS lives on a SPI flash normally owned by the PCH. To update it out-of-band, the BMC <b>takes the flash away from the host</b> through a mux, rewrites it and gives it back.',
    overview: [
      'Two common methods: <b>(1) BMC-direct</b>: the host is powered off (or held in reset), a <b>SPI mux</b> switches the BIOS flash to the BMC, and the BMC programs it. <b>(2) Host-assisted</b>: the image is staged and the BIOS itself applies it on the next boot (UEFI capsule).',
      'Regions matter: a BIOS flash usually contains a <b>flash descriptor</b>, <b>ME/CSME</b> (Intel) or PSP (AMD) firmware, and the <b>BIOS</b> region. An update may touch only the BIOS region and must preserve things like UEFI variables (NVRAM) and MAC/serial data unless told otherwise.',
      'Why the host must be off: if the CPU fetches code while the BMC is erasing, it crashes. Worse, two SPI controllers driving the bus at once can corrupt the flash. The mux makes ownership exclusive.',
    ],
    facts: [['Precondition', 'Host off / held in reset'], ['Ownership', 'GPIO-controlled SPI mux (or CPLD bit)'], ['Typical size', '32–64 MB'], ['Preserve', 'NVRAM vars, descriptor, ME region (policy)']],
    terms: [['SPI mux', 'Analog switch choosing which controller (PCH or BMC) is wired to the flash.'], ['Flash descriptor', 'Region table at the start of Intel flash; signature 0x0FF0A55A at offset 0x10.'], ['UEFI capsule', 'Firmware update package handed to the BIOS to apply itself.'], ['Recovery / backup BIOS', 'Second flash or region used if the primary is corrupt.']],
    atWork: 'HPE iLO can update the System ROM (BIOS) from its firmware page/Redfish. Many HPE platforms keep a redundant/backup ROM. Exactly how ownership is switched (mux GPIO, CPLD register, eSPI flash-sharing) is platform specific; your team\'s hardware spec will name the signal.',
    refs: [['Intel SPI flash descriptor (public overview)', 'https://www.intel.com/content/www/us/en/content-details/671131/intel-series-chipset-platform-controller-hub-pch-spi-programming-guide.html'], ['UEFI capsule update', 'https://uefi.org/specs/UEFI/2.10/23_Firmware_Update_and_Reporting.html']],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: 'Redfish client', x: 110, y: 100 },
      { id: 'bmc', type: 'bmc', label: 'BMC', sub: 'SPI master #2', x: 330, y: 260 },
      { id: 'cpld', type: 'cpld', label: 'CPLD', sub: 'host power state', x: 330, y: 470 },
      { id: 'mux', type: 'mux', label: 'SPI mux', sub: 'SEL: 0=PCH 1=BMC', x: 620, y: 260 },
      { id: 'flash', type: 'flash', label: 'BIOS flash', sub: '32 MB SPI NOR', x: 620, y: 470 },
      { id: 'pch', type: 'pch', label: 'PCH', sub: 'SPI master #1', x: 880, y: 260 },
      { id: 'cpu', type: 'cpu', label: 'CPU', sub: 'powered off', x: 880, y: 470 },
    ],
    links: [{ a: 'pc', b: 'bmc', kind: 'lan', label: 'HTTPS' }, { a: 'bmc', b: 'cpld', kind: 'gpio', label: 'power ctl' }, { a: 'bmc', b: 'mux', kind: 'spi', label: 'SPI + SEL GPIO' }, { a: 'pch', b: 'mux', kind: 'spi', label: 'SPI' }, { a: 'mux', b: 'flash', kind: 'spi', label: 'SPI' }, { a: 'pch', b: 'cpu', kind: 'pcie' }],
    steps: [
      { title: 'Request', sub: 'Upload BIOS image', text: 'The admin uploads a signed BIOS image targeting the BIOS inventory item. The BMC verifies the signature exactly like a BMC image.' },
      { title: 'Host off', sub: 'Guarantee nobody is using flash', text: 'The BMC checks host power. If on, it either refuses, or (if allowed) gracefully shuts down. It then holds the host off so a button press cannot start it mid-flash.' },
      { title: 'Take ownership', sub: 'Mux → BMC', text: 'The BMC sets the mux <b>SEL</b> GPIO so the flash is connected to the BMC\'s SPI controller, then reads the <b>JEDEC ID</b> to confirm it sees the expected chip.' },
      { title: 'Erase + program', sub: 'BIOS region only', text: 'The BMC parses the flash descriptor to find the BIOS region and erases/programs only that range. The ME region and descriptor stay unless the package says otherwise.' },
      { title: 'Release + boot', sub: 'Mux → PCH', text: 'The BMC verifies, switches the mux back to the PCH, releases the power hold, and the next boot runs the new BIOS (often with an extra reboot for training/ME sync).' },
    ],
    msgs: [
      { t: '0s', from: 'pc', to: 'bmc', proto: 'Redfish', step: 0, info: 'POST UpdateService (BIOS image, Targets: FirmwareInventory/BIOS)', short: 'upload BIOS', layers: N.https(hs(C, BM, 53100, 443), 'POST /redfish/v1/UpdateService/update HTTP/1.1', Object.assign({ 'Content-Type': 'multipart/form-data; boundary=x' }, T), '--x\r\nContent-Disposition: form-data; name="UpdateParameters"\r\n\r\n{"Targets":["/redfish/v1/UpdateService/FirmwareInventory/bios_active"]}\r\n--x ...(image)') },
      { t: '20s', from: 'bmc', to: 'pc', proto: 'Redfish', step: 0, info: '202 Accepted → Task', short: '202', layers: N.https(hs(BM, C, 443, 53100), 'HTTP/1.1 202 Accepted', { Location: '/redfish/v1/TaskService/Tasks/1/Monitor' }) },
      { t: '22s', from: 'bmc', to: 'cpld', proto: 'GPIO', step: 1, info: 'Check host power: OFF (S5). Assert power-hold', short: 'host off?', layers: FX.sig('PWR_GOOD / host state', 'OFF', 'Safe to proceed. BMC blocks power-on requests until done.') },
      { t: '22s', from: 'bmc', to: 'mux', proto: 'GPIO', step: 2, info: 'SPI_MUX_SEL = 1 (BMC owns BIOS flash)', short: 'mux → BMC', layers: FX.sig('BIOS_SPI_MUX_SEL', 'HIGH (BMC)', 'PCH is disconnected from the flash.') },
      { t: '22s', from: 'bmc', to: 'flash', via: ['mux'], proto: 'SPI', step: 2, info: 'READ JEDEC ID (0x9F) → EF 40 19 (Winbond W25Q256)', short: 'JEDEC ID', layers: spi(0x9f, 'READ JEDEC ID', null, 0, { v: 'EF 40 19 = Winbond, 256 Mbit', b: [0xef, 0x40, 0x19], eg: true }, 'ID (MISO)', 'Manufacturer, memory type, capacity code (0x19 = 2^25 bytes = 32 MB). Confirms the right chip is connected.') },
      { t: '23s', from: 'bmc', to: 'flash', via: ['mux'], proto: 'SPI', step: 3, info: 'FAST READ descriptor: FLMAP/FLREG → BIOS region 0x01000000–0x01FFFFFF', short: 'read descriptor', layers: spi(0x0b, 'FAST READ', 0x10, 3, { v: '5A A5 F0 0F + region table', b: [0x5a, 0xa5, 0xf0, 0x0f, ...B.rnd(12, 77)], eg: true }, 'Data', 'Descriptor signature then FLMAP registers pointing to the region table.', true) },
      { t: '24s', from: 'bmc', to: 'flash', via: ['mux'], proto: 'SPI', step: 3, info: 'WREN + 4B BLOCK ERASE (0xDC) @0x01000000 … ×256 blocks', short: 'erase BIOS region', layers: spi(0xdc, '4-BYTE BLOCK ERASE 64 KB', 0x01000000, 4, null), note: 'Only the BIOS region (16 MB here) is erased: 256 blocks × 64 KB.' },
      { t: '2m', from: 'bmc', to: 'flash', via: ['mux'], proto: 'SPI', step: 3, info: 'WREN + 4B PAGE PROGRAM (0x12) … ×65 536 pages', short: 'program BIOS', layers: spi(0x12, '4-BYTE PAGE PROGRAM', 0x01000000, 4, { v: '256 bytes of UEFI firmware volume', b: [...B.ascii('_FVH'), ...B.rnd(28, 12)], eg: true }, 'Data', 'UEFI firmware volumes start with a header containing the "_FVH" signature.') },
      { t: '4m', from: 'bmc', to: 'flash', via: ['mux'], proto: 'SPI', step: 4, info: 'Read-back verify: OK', short: 'verify', layers: spi(0x0c, '4-BYTE FAST READ', 0x01000000, 4, { v: 'matches image', b: B.ascii('_FVH'), eg: true }, 'Data', '', true) },
      { t: '4m', from: 'bmc', to: 'mux', proto: 'GPIO', step: 4, info: 'SPI_MUX_SEL = 0 (PCH owns flash again); release power hold', short: 'mux → PCH', layers: FX.sig('BIOS_SPI_MUX_SEL', 'LOW (PCH)', 'Host may boot again.') },
      { t: '5m', from: 'pch', to: 'flash', via: ['mux'], proto: 'SPI', step: 4, info: 'Next power-on: PCH reads descriptor, CPU runs new BIOS', short: 'boot new BIOS', layers: spi(0x0b, 'FAST READ', 0x10, 3, { v: '5A A5 F0 0F', b: B.hex('5a a5 f0 0f') }, 'Data', 'Same as the "Server power-on" lesson, step 5.', true) },
    ],
  });

  /* =============== PLDM firmware update over MCTP =============== */
  const P = (dst, src, req, iid, cmd, name, cc, data, to) => [M.mctp(dst, src, to == null ? (req ? 1 : 0) : to, 1), M.pldm(req, iid, 5, cmd, name, cc, data)];
  LESSONS.push({
    id: "pldm-fwup", cat: "firmware", ord: 270, mins: 15, tags: ["pldm", "mctp", "eid", "firmware-update", "nic", "gpu"], prereq: ["bmc-update", "i2c-sensors"], title: 'Device firmware: PLDM over MCTP', subtitle: 'BMC updates a NIC/GPU/drive in-band',
    keywords: 'pldm type 5 dsp0267 mctp dsp0236 eid request update pass component table request firmware data activate nic gpu',
    intro: 'How does the BMC update a NIC, GPU or drive? Through the DMTF standard pair <b>MCTP</b> (a tiny network inside the server) and <b>PLDM Type 5</b> (firmware update). Notice the twist: the <b>device pulls</b> the image from the BMC in chunks.',
    overview: [
      '<b>MCTP</b> (DSP0236) gives every management endpoint an <b>EID</b> and carries messages over SMBus/I²C, PCIe VDM or I3C. <b>PLDM</b> rides on MCTP (message type 0x01). PLDM Type 2 does sensors, Type 5 (DSP0267) does firmware update.',
      'The BMC is the <b>Update Agent (UA)</b>; the device is the <b>Firmware Device (FD)</b>. The UA starts the update and describes the components; then the FD <b>requests data</b> at offsets it chooses. That keeps devices simple: they ask for exactly what they can buffer.',
      'Packages use a standard format: a header with descriptors (PCI vendor/device IDs) so one file can target the right devices, followed by component images.',
    ],
    facts: [['Transport', 'MCTP over SMBus or PCIe VDM'], ['PLDM type', '5 = Firmware Update'], ['Roles', 'UA = BMC, FD = device'], ['OpenBMC', 'pldmd + mctpd']],
    terms: [['EID', 'MCTP Endpoint ID (8-bit). The BMC is often EID 8; devices get theirs from the bus owner.'], ['Tag / TO', 'Message tag and Tag Owner bit, used to match responses.'], ['Component', 'One updatable image inside a device (e.g. NIC firmware, option ROM).'], ['Self-contained activation', 'The device can activate new firmware without a host reset; otherwise a reset/power cycle is needed.']],
    atWork: 'This is exactly the kind of thing an HPC firmware team touches: accelerator, NIC and switch firmware updates driven by the BMC. On OpenBMC see <code>pldm</code> (pldmd, fw-update) and <code>mctpd</code>; try <code>pldmtool</code> on a BMC shell.',
    refs: [['DMTF PMCI (MCTP, PLDM specs)', 'https://www.dmtf.org/standards/pmci'], ['OpenBMC pldm', 'https://github.com/openbmc/pldm'], ['Linux MCTP kernel docs', 'https://docs.kernel.org/networking/mctp.html']],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin', sub: 'Redfish', x: 120, y: 120 },
      { id: 'pldm', type: 'svc', label: 'pldmd (UA)', sub: 'BMC, EID 8', x: 420, y: 120 },
      { id: 'mctp', type: 'kernel', label: 'MCTP stack', sub: 'AF_MCTP sockets', x: 420, y: 330 },
      { id: 'nic', type: 'nic', label: 'NIC (FD)', sub: 'EID 20', x: 780, y: 230 },
      { id: 'gpu', type: 'device', label: 'GPU (FD)', sub: 'EID 21', x: 780, y: 440 },
    ],
    links: [{ a: 'pc', b: 'pldm', kind: 'lan', label: 'HTTPS' }, { a: 'pldm', b: 'mctp', kind: 'sw', label: 'socket' }, { a: 'mctp', b: 'nic', kind: 'mctp', label: 'MCTP / SMBus' }, { a: 'mctp', b: 'gpu', kind: 'mctp', label: 'MCTP / PCIe VDM' }],
    steps: [
      { title: 'Start', sub: 'Package uploaded', text: 'The admin uploads a PLDM package via Redfish. pldmd matches the package descriptors (PCI IDs) against devices it discovered and finds the NIC at EID 20.' },
      { title: 'RequestUpdate', sub: 'Enter update mode', text: 'The UA tells the FD how big transfer chunks may be and how many components follow. The FD answers with its preferred settings and enters update mode.' },
      { title: 'Describe components', sub: 'PassComponentTable + UpdateComponent', text: 'For each component: its classification, identifier, version string and size. The FD says whether it can accept it (e.g. rejects downgrades if policy forbids them).' },
      { title: 'FD pulls data', sub: 'RequestFirmwareData loops', text: 'Now the <b>device</b> sends requests: "give me 1024 bytes at offset X". The UA answers with the bytes. Roles flip: the FD is the requester.' },
      { title: 'Verify, apply, activate', sub: 'FD reports, UA activates', text: 'The FD reports TransferComplete, VerifyComplete and ApplyComplete. Then the UA sends ActivateFirmware. The new firmware runs after the device or host reset (or immediately if self-contained activation is supported).' },
    ],
    msgs: [
      { t: '0s', from: 'pc', to: 'pldm', proto: 'Redfish', step: 0, info: 'POST UpdateService (PLDM package nic_fw_22.41.pldm)', short: 'upload package', layers: N.https(hs(C, BM, 53200, 443), 'POST /redfish/v1/UpdateService/update HTTP/1.1', Object.assign({ 'Content-Type': 'multipart/form-data; boundary=x' }, T), '--x ... nic_fw_22.41.pldm ...') },
      { t: '1s', from: 'pldm', to: 'nic', via: ['mctp'], proto: 'PLDM', step: 1, info: 'RequestUpdate (0x10): MaxTransferSize 1024, 1 component', short: 'RequestUpdate', layers: P(20, 8, true, 1, 0x10, 'RequestUpdate', 0, [F('MaximumTransferSize', 1024, B.u32le(1024), 'Largest chunk the UA will send per RequestFirmwareData.'), F('NumberOfComponents', 1, B.u16le(1), ''), F('MaxOutstandingTransferReq', 1, [1], ''), F('PackageDataLength', 0, B.u16le(0), ''), F('Version string type / len', 'ASCII / 5', [1, 5], ''), F('ComponentImageSetVersion', '22.41', B.ascii('22.41'), '', { eg: true })]) },
      { t: '1s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 1, info: 'Response: SUCCESS, FD will send GetPackageData: no', short: 'RU response', layers: P(8, 20, false, 1, 0x10, 'RequestUpdate', 0, [F('FDMetaDataLength', 0, B.u16le(0), ''), F('FDWillSendGetPackageDataCommand', 'No', [0], '')]) },
      { t: '1.1s', from: 'pldm', to: 'nic', via: ['mctp'], proto: 'PLDM', step: 2, info: 'PassComponentTable (0x13): firmware, id 0x0001, "22.41"', short: 'PassComponentTable', layers: P(20, 8, true, 2, 0x13, 'PassComponentTable', 0, [F('TransferFlag', 'Start and End', [0x05], 'Single-part table.'), F('ComponentClassification', 'Firmware (0x000A)', B.u16le(0x0a), ''), F('ComponentIdentifier', '0x0001', B.u16le(1), '', { eg: true }), F('ComponentClassificationIndex', 0, [0], ''), F('ComponentComparisonStamp', '0x00002241', B.u32le(0x2241), 'Lets the FD compare versions numerically.', { eg: true }), F('Version string type / len', 'ASCII / 5', [1, 5], ''), F('ComponentVersionString', '22.41', B.ascii('22.41'), '')]) },
      { t: '1.2s', from: 'pldm', to: 'nic', via: ['mctp'], proto: 'PLDM', step: 2, info: 'UpdateComponent (0x14): size 1 572 864 bytes', short: 'UpdateComponent', layers: P(20, 8, true, 3, 0x14, 'UpdateComponent', 0, [F('ComponentClassification', 'Firmware', B.u16le(0x0a), ''), F('ComponentIdentifier', '0x0001', B.u16le(1), ''), F('ClassificationIndex', 0, [0], ''), F('ComparisonStamp', '0x00002241', B.u32le(0x2241), ''), F('ComponentImageSize', '1 572 864', B.u32le(1572864), '1.5 MB.', { eg: true }), F('UpdateOptionFlags', 'none', B.u32le(0), 'Bit 0 = force update.'), F('Version type / len / string', 'ASCII / 5 / 22.41', [1, 5, ...B.ascii('22.41')], '')]) },
      { t: '1.3s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 3, info: 'RequestFirmwareData (0x15) offset 0, length 1024 (FD → UA)', short: 'ReqFwData @0', layers: P(8, 20, true, 9, 0x15, 'RequestFirmwareData', 0, [F('Offset', 0, B.u32le(0), 'The FD decides where to read.'), F('Length', 1024, B.u32le(1024), '')], 1), note: 'Roles flipped: the device is now the requester (Tag Owner = device).' },
      { t: '1.3s', from: 'pldm', to: 'nic', via: ['mctp'], proto: 'PLDM', step: 3, info: 'Response: 1024 bytes of image', short: 'data', layers: P(20, 8, false, 9, 0x15, 'RequestFirmwareData', 0, [F('ImageData (first 32 of 1024)', 'component bytes', B.rnd(32, 99), 'Over SMBus this response is split into many 64-byte MCTP packets (SOM … EOM).', { eg: true })], 0) },
      { t: '1.4s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 3, info: 'RequestFirmwareData offset 1024 … (×1536 total)', short: 'ReqFwData @1024', layers: P(8, 20, true, 10, 0x15, 'RequestFirmwareData', 0, [F('Offset', 1024, B.u32le(1024), ''), F('Length', 1024, B.u32le(1024), '')], 1) },
      { t: '48s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 4, info: 'TransferComplete (0x16): success', short: 'TransferComplete', layers: P(8, 20, true, 11, 0x16, 'TransferComplete', 0, [F('TransferResult', 'Success (0x00)', [0], '')], 1) },
      { t: '50s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 4, info: 'VerifyComplete (0x17): signature OK', short: 'VerifyComplete', layers: P(8, 20, true, 12, 0x17, 'VerifyComplete', 0, [F('VerifyResult', 'Success (0x00)', [0], 'The device checks the image with its own keys. The BMC cannot bypass this.')], 1) },
      { t: '55s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 4, info: 'ApplyComplete (0x18): written to device flash', short: 'ApplyComplete', layers: P(8, 20, true, 13, 0x18, 'ApplyComplete', 0, [F('ApplyResult', 'Success (0x00)', [0], ''), F('ComponentActivationMethodsModification', 'none', B.u16le(0), '')], 1) },
      { t: '56s', from: 'pldm', to: 'nic', via: ['mctp'], proto: 'PLDM', step: 4, info: 'ActivateFirmware (0x1A): self-contained activation = yes', short: 'ActivateFirmware', layers: P(20, 8, true, 4, 0x1a, 'ActivateFirmware', 0, [F('SelfContainedActivationRequest', 'True', [1], 'Ask the device to activate on its own if it can.')]) },
      { t: '56s', from: 'nic', to: 'pldm', via: ['mctp'], proto: 'PLDM', step: 4, info: 'Response: estimated activation time 10 s', short: 'activating', layers: P(8, 20, false, 4, 0x1a, 'ActivateFirmware', 0, [F('EstimatedTimeForSelfContainedActivation', '10 s', B.u16le(10), '')]) },
    ],
  });
})();
