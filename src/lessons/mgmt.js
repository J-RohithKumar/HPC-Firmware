(function () {
  const { B, F, L, N, I, hx } = FX;
  const C = '10.0.0.5', BM = '10.0.0.20';
  /* ---------- RMCP+ helpers ---------- */
  const sess15 = len => L('IPMI 1.5 session header (pre-session)', [F('Auth type', 'none (0x00)', [0], 'No session yet, so no authentication.'), F('Session sequence', '0', B.zeros(4), ''), F('Session ID', '0', B.zeros(4), ''), F('Message length', len, [len], '')]);
  const sess20 = (ptype, pname, sid, seq, len, enc) => L('RMCP+ session header (IPMI 2.0)', [
    F('Auth type', 'RMCP+ (0x06)', [6], 'Format code 6 = IPMI v2.0 RMCP+.'),
    F('Payload type', pname + (enc ? ' · encrypted + authenticated' : ''), [ptype], 'Bit 7 = encrypted, bit 6 = authenticated, low 6 bits = type (0x00 IPMI, 0x10/0x11 Open Session, 0x12–0x15 RAKP 1–4).'),
    F('Session ID', hx(sid >>> 0), B.u32le(sid), 'The receiver\'s session ID (0 before the session exists).'),
    F('Session sequence', seq, B.u32le(seq), 'Replay protection.'), F('Payload length', len, B.u16le(len), '')]);
  const lenOf = ly => FX.bytesOf(ly.fields).length;
  const udp = (src, dst, sp, dp, app) => N.packet({ src, dst, udp: [sp, dp], app: [I.rmcp(), ...app] });
  const algo = (t, a, an, d) => F(['Authentication', 'Integrity', 'Confidentiality'][t] + ' algorithm', an, [t, 0, 0, 8, a, 0, 0, 0], d);
  const algos = [algo(0, 1, 'RAKP-HMAC-SHA1', 'How the key exchange is authenticated.'), algo(1, 1, 'HMAC-SHA1-96', 'Per-packet integrity check (12-byte tag).'), algo(2, 1, 'AES-CBC-128', 'Payload encryption.')];
  const RC = 0xa0a2a3a4, MS = 0x02000a00;
  const gcac = I.msg({ a1: 0x20, netFn: 0x06, a2: 0x81, cmd: 0x38, cmdName: 'Get Channel Auth Capabilities', data: [F('Channel', '0x8E (current, v2.0 ext)', [0x8e], 'Bit 7: report IPMI 2.0 capabilities; 0xE = this channel.'), F('Max privilege', 'Administrator (4)', [0x04], '')] });
  const gcacR = I.msg({ a1: 0x81, netFn: 0x07, a2: 0x20, cmd: 0x38, cmdName: 'Get Channel Auth Capabilities', cc: 0, data: [F('Channel', '1', [1], 'LAN channel number.', { eg: true }), F('Auth support', '0x80 (IPMI 2.0 ext)', [0x80], 'Bit 7 = extended capabilities present.'), F('Auth status', '0x04', [0x04], 'e.g. non-null usernames enabled.', { eg: true }), F('Extended caps', 'IPMI 2.0 supported', [0x02], 'Bit 1 = RMCP+ supported.'), F('OEM ID / aux', '0', [0, 0, 0, 0], '')] });
  const osReq = L('Open Session Request · 32 bytes', [F('Message tag', '0', [0], ''), F('Requested max privilege', 'Administrator', [4], ''), F('Reserved', '', [0, 0], ''), F('Remote console session ID', hx(RC), B.u32le(RC), 'The console picks its ID; the BMC will use it when sending to us.', { eg: true }), ...algos]);
  const osRsp = L('Open Session Response · 36 bytes', [F('Message tag', '0', [0], ''), F('Status', 'No errors (0)', [0], ''), F('Max privilege', 'Administrator', [4], ''), F('Reserved', '', [0], ''), F('Remote console session ID', hx(RC), B.u32le(RC), ''), F('Managed system session ID', hx(MS), B.u32le(MS), 'The BMC\'s ID for this session.', { eg: true }), ...algos]);
  const rakp1 = L('RAKP Message 1', [F('Message tag', '0', [0], ''), F('Reserved', '', [0, 0, 0], ''), F('Managed system session ID', hx(MS), B.u32le(MS), ''), F('Console random number', '16 bytes', B.rnd(16, 3), 'Nonce Rc: proves freshness.'), F('Requested role', 'Admin, name-only lookup', [0x14], ''), F('Reserved', '', [0, 0], ''), F('Username length', 5, [5], ''), F('Username', 'admin', B.ascii('admin'), 'Sent in clear: the password itself is never sent.')]);
  const rakp2 = L('RAKP Message 2', [F('Message tag', '0', [0], ''), F('Status', 'No errors', [0], ''), F('Reserved', '', [0, 0], ''), F('Remote console session ID', hx(RC), B.u32le(RC), ''), F('BMC random number', '16 bytes', B.rnd(16, 9), 'Nonce Rm.'), F('BMC GUID', '16 bytes', B.rnd(16, 21), 'System GUID.', { eg: true }), F('Key exchange auth code', 'HMAC-SHA1, 20 bytes', B.enc(20), 'HMAC with the user\'s password (Kuid) over both IDs, nonces, GUID, role and username. Proves the BMC knows the password.', { enc: true })]);
  const rakp3 = L('RAKP Message 3', [F('Message tag', '0', [0], ''), F('Status', 'No errors', [0], ''), F('Reserved', '', [0, 0], ''), F('Managed system session ID', hx(MS), B.u32le(MS), ''), F('Key exchange auth code', '20 bytes', B.enc(20), 'Now the console proves it knows the password too. Both sides derive the Session Integrity Key (SIK).', { enc: true })]);
  const rakp4 = L('RAKP Message 4', [F('Message tag', '0', [0], ''), F('Status', 'No errors', [0], ''), F('Reserved', '', [0, 0], ''), F('Remote console session ID', hx(RC), B.u32le(RC), ''), F('Integrity check value', '12 bytes', B.enc(12), 'HMAC with SIK. Session is now active.', { enc: true })]);
  const encMsg = (m, seq, sid) => {
    const inner = lenOf(m), padN = (16 - ((inner + 1) % 16)) % 16;
    const conf = L('Confidentiality header', [F('IV', '16 random bytes', B.rnd(16, seq + 40), 'AES-CBC initialisation vector, new for every packet.')]);
    const tr = L('Confidentiality trailer', [F('Pad + pad length', padN + ' pad bytes', B.enc(padN + 1), 'Pads to the AES block size.', { enc: true })]);
    const integ = L('Integrity trailer', [F('Integrity pad / pad len / next header', '', [0xff, 0xff, 2, 7], 'Aligns to 4 bytes; next header is always 0x07.'), F('AuthCode', 'HMAC-SHA1-96', B.enc(12), 'Integrity tag using K1 derived from SIK.', { enc: true })]);
    m.note = 'On the wire this is AES-128 ciphertext (key K2 from SIK). Shown decrypted.';
    const plen = 16 + inner + padN + 1;
    return [sess20(0xc0, 'IPMI (0x00)', sid, seq, plen, true), conf, m, tr, integ];
  };

  LESSONS.push({
    id: 'ipmi-lan', cat: 'mgmt', title: 'IPMI over LAN (RMCP+)', subtitle: 'ipmitool -I lanplus chassis status',
    keywords: 'ipmi rmcp rakp udp 623 lanplus session ipmitool cipher suite 3',
    intro: 'IPMI is the older (1998+) management protocol that every BMC still speaks. Over the network it uses UDP port <b>623</b>, wrapped in <b>RMCP+</b>, with a 4-message <b>RAKP</b> handshake that authenticates without sending the password.',
    overview: [
      'IPMI messages are tiny binary commands: <b>NetFn</b> (group) + <b>command</b> + data, protected by simple checksums. The same message format is used over LAN, KCS and IPMB.',
      'IPMI 2.0 adds <b>RMCP+</b> sessions. The console picks a <b>cipher suite</b> (the common suite 3 = RAKP-HMAC-SHA1 / HMAC-SHA1-96 / AES-CBC-128), then RAKP 1–4 prove both sides know the user\'s password and derive session keys.',
      'Redfish is replacing IPMI because it is more secure, extensible and human-readable. But IPMI is still everywhere in scripts and HPC tooling (<code>ipmitool</code>, <code>ipmiutil</code>, FreeIPMI), so you will see it.',
    ],
    facts: [['Port', 'UDP 623'], ['Cipher suite 3', 'HMAC-SHA1 / SHA1-96 / AES-128'], ['BMC address', '0x20'], ['Spec', 'IPMI v2.0 rev 1.1 (Intel et al.)']],
    terms: [['NetFn', 'Command group: Chassis 0x00, Sensor 0x04, App 0x06, Storage 0x0A. Responses use NetFn+1.'], ['RAKP', 'Remote Authenticated Key-exchange Protocol.'], ['SIK', 'Session Integrity Key, derived from both nonces and the password.'], ['SEL / SDR', 'System Event Log / Sensor Data Records.']],
    atWork: 'Typical lines: <code>ipmitool -I lanplus -H &lt;bmc&gt; -U admin -P ... chassis power status</code> and <code>... sel list</code>. On iLO, IPMI-over-LAN is often <b>disabled by default</b> for security; Redfish is preferred. Known weakness: RAKP2 leaks a hash an attacker can brute-force offline, so use strong passwords and isolated management networks.',
    refs: [['IPMI 2.0 specification', 'https://www.intel.com/content/www/us/en/products/docs/servers/ipmi/ipmi-second-gen-interface-spec-v2-rev1-1.html'], ['ipmitool', 'https://github.com/ipmitool/ipmitool']],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: C + ' · ipmitool', x: 130, y: 280 },
      { id: 'sw', type: 'switch', label: 'Mgmt switch', sub: 'OOB network', x: 480, y: 280 },
      { id: 'bmc', type: 'bmc', label: 'BMC', sub: BM + ' · UDP 623', x: 840, y: 280 },
    ],
    links: [{ a: 'pc', b: 'sw', kind: 'lan' }, { a: 'sw', b: 'bmc', kind: 'lan', label: 'dedicated mgmt port' }],
    steps: [
      { title: 'Capabilities', sub: 'What do you support?', text: 'Before a session exists, the console sends <b>Get Channel Authentication Capabilities</b> in the old IPMI 1.5 format. The BMC replies that it supports IPMI 2.0 / RMCP+.' },
      { title: 'Open session', sub: 'Pick cipher suite', text: 'The console proposes authentication, integrity and confidentiality algorithms and its session ID. The BMC accepts and returns its own session ID.' },
      { title: 'RAKP handshake', sub: '4 messages, no password sent', text: 'RAKP1 sends a nonce and username. RAKP2: the BMC returns its nonce and an HMAC keyed by the password. RAKP3: the console proves the same. RAKP4: the BMC confirms with a check value. Both sides now hold the session keys.' },
      { title: 'Encrypted command', sub: 'Get Chassis Status', text: 'Each command is now <b>encrypted</b> (AES) and <b>authenticated</b> (HMAC). Inside is the plain IPMI message: NetFn Chassis, cmd 0x01. The reply says power is on.' },
      { title: 'Close session', sub: 'Free the BMC slot', text: 'BMCs support only a few concurrent sessions, so well-behaved tools close them.' },
    ],
    msgs: [
      { t: '0.000s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'IPMI', step: 0, info: 'Get Channel Authentication Capabilities (pre-session)', short: 'Get Chan Auth Caps', layers: udp(C, BM, 50623, 623, [sess15(lenOf(gcac)), gcac]) },
      { t: '0.002s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'IPMI', step: 0, info: 'Response: IPMI 2.0 / RMCP+ supported', short: 'caps reply', layers: udp(BM, C, 623, 50623, [sess15(lenOf(gcacR)), gcacR]) },
      { t: '0.003s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'RMCP+', step: 1, info: 'Open Session Request: cipher suite 3, console SID 0xA4A3A2A0', short: 'Open Session Req', layers: udp(C, BM, 50623, 623, [sess20(0x10, 'Open Session Request (0x10)', 0, 0, 32), osReq]) },
      { t: '0.005s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'RMCP+', step: 1, info: 'Open Session Response: BMC SID 0x02000A00', short: 'Open Session Rsp', layers: udp(BM, C, 623, 50623, [sess20(0x11, 'Open Session Response (0x11)', 0, 0, 36), osRsp]) },
      { t: '0.006s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'RMCP+', step: 2, info: 'RAKP 1: console nonce + username "admin"', short: 'RAKP 1', layers: udp(C, BM, 50623, 623, [sess20(0x12, 'RAKP 1 (0x12)', 0, 0, lenOf(rakp1)), rakp1]) },
      { t: '0.009s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'RMCP+', step: 2, info: 'RAKP 2: BMC nonce, GUID, HMAC(password)', short: 'RAKP 2', layers: udp(BM, C, 623, 50623, [sess20(0x13, 'RAKP 2 (0x13)', 0, 0, lenOf(rakp2)), rakp2]) },
      { t: '0.010s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'RMCP+', step: 2, info: 'RAKP 3: console proves password knowledge', short: 'RAKP 3', layers: udp(C, BM, 50623, 623, [sess20(0x14, 'RAKP 3 (0x14)', 0, 0, lenOf(rakp3)), rakp3]) },
      { t: '0.012s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'RMCP+', step: 2, info: 'RAKP 4: integrity check value, session active', short: 'RAKP 4', layers: udp(BM, C, 623, 50623, [sess20(0x15, 'RAKP 4 (0x15)', 0, 0, lenOf(rakp4)), rakp4]) },
      { t: '0.013s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'IPMI', step: 3, info: 'Get Chassis Status (NetFn 0x00 cmd 0x01), encrypted', short: 'Get Chassis Status', layers: udp(C, BM, 50623, 623, encMsg(I.msg({ a1: 0x20, netFn: 0, a2: 0x81, seq: 1, cmd: 0x01, cmdName: 'Get Chassis Status' }), 1, MS)) },
      { t: '0.015s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'IPMI', step: 3, info: 'Response: power on, no faults', short: 'power is on', layers: udp(BM, C, 623, 50623, encMsg(I.msg({ a1: 0x81, netFn: 1, a2: 0x20, seq: 1, cmd: 0x01, cmdName: 'Get Chassis Status', cc: 0, data: [F('Current power state', 'Power ON (bit 0)', [0x01], 'Bit 0 power on, bit 1 overload, bit 2 interlock, bit 3 power fault...'), F('Last power event', '0x00', [0], ''), F('Misc chassis state', '0x00', [0], 'Front-panel lockout, drive fault, fan fault, identify state.')] }), 1, RC)) },
      { t: '0.016s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'IPMI', step: 4, info: 'Close Session (NetFn App cmd 0x3C)', short: 'Close Session', layers: udp(C, BM, 50623, 623, encMsg(I.msg({ a1: 0x20, netFn: 6, a2: 0x81, seq: 2, cmd: 0x3c, cmdName: 'Close Session', data: [F('Session ID', hx(MS), B.u32le(MS), '')] }), 2, MS)) },
    ],
  });

  /* =============== Redfish =============== */
  const hs = (s, d, sp, dp) => ({ src: s, dst: d, tcp: [sp, dp, 1000, 2000, 'PSH,ACK'] });
  const R = (path) => 'GET ' + path + ' HTTP/1.1';
  const T = { Host: 'ilo-node01', 'X-Auth-Token': '4f1c0e...9a' };
  LESSONS.push({
    id: 'redfish', cat: 'mgmt', title: 'Redfish REST API', subtitle: 'Modern BMC management over HTTPS',
    keywords: 'redfish rest json https dmtf session token systems chassis managers odata',
    intro: 'Redfish is the DMTF standard that replaced IPMI: <b>HTTPS + JSON</b>, a tree of resources starting at <code>/redfish/v1</code>. If you can use <code>curl</code>, you can manage a server.',
    overview: [
      'Everything is a <b>resource</b> with an <code>@odata.id</code> URI. The service root links to collections: <b>Systems</b> (the host computer), <b>Chassis</b> (physical boxes, sensors, power, thermal), <b>Managers</b> (the BMC itself), plus services such as <b>SessionService</b>, <b>UpdateService</b>, <b>EventService</b> and <b>TaskService</b>.',
      'Verbs: GET reads, PATCH changes properties, POST creates or runs <b>Actions</b> (e.g. <code>ComputerSystem.Reset</code>), DELETE removes. Long jobs return <b>202 + a Task</b> that you poll.',
      'Authentication: HTTP Basic for one-off calls, or a <b>session</b>: POST credentials to SessionService and send the returned <code>X-Auth-Token</code> on later requests.',
    ],
    facts: [['Port', 'TCP 443 (HTTPS)'], ['Format', 'JSON, OData conventions'], ['Schema', 'DMTF CSDL / JSON Schema'], ['HPE OEM', '"Oem": {"Hpe": {...}} extensions'], ['iLO IDs', '/Systems/1, /Managers/1'], ['OpenBMC IDs', '/Systems/system, /Managers/bmc']],
    terms: [['Service root', '/redfish/v1: the entry point everything is linked from.'], ['Collection', 'A resource with "Members": [...] links.'], ['Action', 'POST target for operations that are not simple property changes.'], ['Task monitor', 'URI you poll for the status of a long operation.'], ['OEM extension', 'Vendor-specific properties under "Oem". HPE\'s are documented in the iLO Redfish reference.']],
    atWork: 'HPE\'s <b>iLOrest</b> CLI and the python-redfish-library wrap all of this. Try <code>curl -sk -u user:pass https://&lt;ilo&gt;/redfish/v1/Systems/1 | jq .</code>. The public HPE iLO Redfish API reference is the best place to learn the OEM parts.',
    refs: [['DMTF Redfish', 'https://www.dmtf.org/standards/redfish'], ['Redfish resource explorer', 'https://redfish.dmtf.org/redfish/schema_index'], ['HPE iLO Redfish API reference', 'https://servermanagementportal.ext.hpe.com/docs/redfishservices/'], ['DMTF Redfish mockup server', 'https://github.com/DMTF/Redfish-Mockup-Server']],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: 'curl / iLOrest', x: 140, y: 280 },
      { id: 'sw', type: 'switch', label: 'Mgmt switch', sub: 'OOB network', x: 460, y: 280 },
      { id: 'bmc', type: 'bmc', label: 'BMC Redfish service', sub: 'iLO / bmcweb :443', x: 800, y: 280 },
    ],
    links: [{ a: 'pc', b: 'sw', kind: 'lan' }, { a: 'sw', b: 'bmc', kind: 'lan', label: 'HTTPS' }],
    steps: [
      { title: 'Service root', sub: 'GET /redfish/v1', text: 'The only unauthenticated URI. It tells you the Redfish version and links to everything else. (In reality there is a TCP + TLS handshake first; see the HTTPS lesson in Protocol Explorer.)' },
      { title: 'Log in', sub: 'Create a session', text: 'POST username/password to <code>/redfish/v1/SessionService/Sessions</code>. The reply is <b>201 Created</b> with an <b>X-Auth-Token</b> header and a <b>Location</b> you DELETE to log out.' },
      { title: 'Read the system', sub: 'GET /Systems/1', text: 'The ComputerSystem resource has power state, BIOS version, CPU and memory summary, health and links to Processors, Memory, Storage and EthernetInterfaces.' },
      { title: 'Run an action', sub: 'ComputerSystem.Reset', text: 'Power control is an <b>Action</b>. AllowableValues tell you which ResetType values the BMC accepts (On, ForceOff, GracefulShutdown, ForceRestart, Nmi, PushPowerButton...).' },
      { title: 'Log out', sub: 'DELETE the session', text: 'Delete your session so you do not run out of session slots.' },
    ],
    msgs: [
      { t: '0.00s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'HTTPS', step: 0, info: 'GET /redfish/v1', short: 'GET /redfish/v1', layers: N.https(hs(C, BM, 52000, 443), R('/redfish/v1'), { Host: 'ilo-node01', Accept: 'application/json' }) },
      { t: '0.03s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 0, info: '200 OK ServiceRoot (RedfishVersion 1.x, links)', short: '200 ServiceRoot', layers: N.https(hs(BM, C, 443, 52000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json', 'OData-Version': '4.0' }, { '@odata.id': '/redfish/v1/', RedfishVersion: '1.13.0', Systems: { '@odata.id': '/redfish/v1/Systems' }, Chassis: { '@odata.id': '/redfish/v1/Chassis' }, Managers: { '@odata.id': '/redfish/v1/Managers' }, SessionService: { '@odata.id': '/redfish/v1/SessionService' }, UpdateService: { '@odata.id': '/redfish/v1/UpdateService' } }) },
      { t: '0.10s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'HTTPS', step: 1, info: 'POST /redfish/v1/SessionService/Sessions {UserName, Password}', short: 'POST Sessions', layers: N.https(hs(C, BM, 52000, 443), 'POST /redfish/v1/SessionService/Sessions HTTP/1.1', { Host: 'ilo-node01', 'Content-Type': 'application/json' }, { UserName: 'admin', Password: '********' }) },
      { t: '0.25s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 1, info: '201 Created, X-Auth-Token + Location', short: '201 + token', layers: N.https(hs(BM, C, 443, 52000), 'HTTP/1.1 201 Created', { 'X-Auth-Token': '4f1c0e...9a', Location: '/redfish/v1/SessionService/Sessions/admin0000000064c8/', 'Content-Type': 'application/json' }, { '@odata.id': '/redfish/v1/SessionService/Sessions/admin0000000064c8/', UserName: 'admin' }) },
      { t: '0.30s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'HTTPS', step: 2, info: 'GET /redfish/v1/Systems/1', short: 'GET Systems/1', layers: N.https(hs(C, BM, 52000, 443), R('/redfish/v1/Systems/1'), T) },
      { t: '0.40s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 2, info: '200 OK ComputerSystem: PowerState Off, BIOS U54 v2.10', short: '200 System', layers: N.https(hs(BM, C, 443, 52000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { '@odata.id': '/redfish/v1/Systems/1', Id: '1', PowerState: 'Off', BiosVersion: 'U54 v2.10', Model: 'ProLiant XL225n Gen10 Plus', Status: { Health: 'OK' }, ProcessorSummary: { Count: 2 }, MemorySummary: { TotalSystemMemoryGiB: 512 }, Actions: { '#ComputerSystem.Reset': { target: '/redfish/v1/Systems/1/Actions/ComputerSystem.Reset', 'ResetType@Redfish.AllowableValues': ['On', 'ForceOff', 'GracefulShutdown', 'ForceRestart', 'Nmi', 'PushPowerButton'] } }, Oem: { Hpe: { '…': 'HPE extensions' } } }), note: 'Model and BIOS values are examples. Real iLO responses are much longer.' },
      { t: '1.00s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'HTTPS', step: 3, info: 'POST Systems/1/Actions/ComputerSystem.Reset {"ResetType":"On"}', short: 'POST Reset', layers: N.https(hs(C, BM, 52000, 443), 'POST /redfish/v1/Systems/1/Actions/ComputerSystem.Reset HTTP/1.1', Object.assign({ 'Content-Type': 'application/json' }, T), { ResetType: 'On' }) },
      { t: '1.10s', from: 'bmc', to: 'pc', via: ['sw'], proto: 'HTTPS', step: 3, info: '200 OK with @Message.ExtendedInfo Success', short: '200 Success', layers: N.https(hs(BM, C, 443, 52000), 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { error: { code: 'iLO.0.10.ExtendedInfo', '@Message.ExtendedInfo': [{ MessageId: 'Base.1.4.Success' }] } }), note: 'iLO replies 200 with a message list; others may return 204 No Content. Both mean accepted.' },
      { t: '5.00s', from: 'pc', to: 'bmc', via: ['sw'], proto: 'HTTPS', step: 4, info: 'DELETE /redfish/v1/SessionService/Sessions/admin…', short: 'DELETE session', layers: N.https(hs(C, BM, 52000, 443), 'DELETE /redfish/v1/SessionService/Sessions/admin0000000064c8/ HTTP/1.1', T) },
    ],
  });

  /* =============== iLO communication paths =============== */
  LESSONS.push({
    id: 'ilo-paths', cat: 'mgmt', title: 'iLO communication paths', subtitle: 'Out-of-band, shared NIC, host channel, KVM',
    keywords: 'ilo out of band in-band chif ams virtual nic host interface remote console virtual media hid usb',
    intro: 'iLO (HPE\'s BMC) can be reached in several ways. Understanding <b>which path a command takes</b> is half of debugging management problems.',
    overview: [
      '<b>Out-of-band (OOB)</b>: dedicated iLO port → management network. Works with the host off or crashed. This is the default in HPC clusters.',
      '<b>Shared network port</b>: iLO traffic rides the host NIC via NC-SI (see "Shared NIC: NC-SI").',
      '<b>In-band / host channel</b>: software on the host OS talks to iLO over PCIe without the network. HPE uses its <b>CHIF</b> channel (iLOrest local mode, the Agentless Management Service) and also supports the DMTF <b>Redfish Host Interface</b> (virtual NIC). KCS IPMI also exists.',
      '<b>Remote console & virtual media</b>: iLO contains the server\'s video controller, so it can capture the screen and send it to your browser. It also presents virtual USB devices (keyboard, mouse, DVD) to the host.',
    ],
    facts: [['OOB ports', '443 HTTPS, 22 SSH, 623 IPMI (optional), 17990 remote console (default, configurable)'], ['In-band', 'CHIF (HPE), Redfish Host Interface, KCS'], ['Video', 'iLO-integrated VGA (Matrox G200 class)'], ['Virtual USB', 'Keyboard, mouse, CD/DVD/USB key']],
    terms: [['CHIF', 'HPE "Channel Interface": a PCIe mailbox between host drivers/tools and iLO.'], ['AMS', 'Agentless Management Service: host-side service feeding OS info (IPs, drivers) to iLO.'], ['Redfish Host Interface', 'DMTF DSP0270. A virtual USB NIC so host software reaches the BMC\'s Redfish service at a link-local address. Advertised in SMBIOS type 42.'], ['HID report', '8-byte USB keyboard packet: modifier byte, reserved, up to 6 key codes.']],
    atWork: 'Ports, defaults and feature names differ between iLO 5, iLO 6 and iLO 7; check the iLO user guide for your generation. Debugging tip: if Redfish works from the host (in-band) but not from your laptop, the problem is the network path, not iLO.',
    refs: [['HPE iLO 6 user guide', 'https://www.hpe.com/support/ilo6'], ['DMTF Redfish Host Interface DSP0270', 'https://www.dmtf.org/dsp/DSP0270'], ['iLOrest', 'https://github.com/HewlettPackard/python-redfish-utility']],
    zones: [{ x: 430, y: 150, w: 550, h: 390, label: 'Server' }],
    nodes: [
      { id: 'pc', type: 'laptop', label: 'Admin laptop', sub: 'browser / iLOrest', x: 110, y: 90 },
      { id: 'msw', type: 'switch', label: 'Mgmt switch', sub: 'OOB network', x: 330, y: 260 },
      { id: 'dsw', type: 'switch', label: 'Data switch', sub: 'production LAN', x: 330, y: 470 },
      { id: 'ilo', type: 'bmc', label: 'iLO', sub: 'dedicated port', x: 620, y: 260, tag: 'BMC · iLO' },
      { id: 'nic', type: 'nic', label: 'Host NIC', sub: 'LOM / OCP', x: 620, y: 470 },
      { id: 'host', type: 'host', label: 'Host OS', sub: 'AMS · iLOrest', x: 870, y: 260 },
      { id: 'usb', type: 'device', label: 'Virtual USB', sub: 'kbd · mouse · DVD', x: 870, y: 470, tag: 'iLO USB' },
    ],
    links: [
      { a: 'pc', b: 'msw', kind: 'lan' }, { a: 'pc', b: 'dsw', kind: 'lan', t: .7 }, { a: 'msw', b: 'ilo', kind: 'lan', label: 'OOB' }, { a: 'dsw', b: 'nic', kind: 'lan' },
      { a: 'nic', b: 'ilo', kind: 'ncsi', label: 'NC-SI' }, { a: 'ilo', b: 'host', kind: 'pcie', label: 'PCIe: CHIF, VGA' }, { a: 'ilo', b: 'usb', kind: 'usb', label: 'USB' }, { a: 'usb', b: 'host', kind: 'usb' }, { a: 'nic', b: 'host', kind: 'pcie' },
    ],
    steps: [
      { title: 'Out-of-band', sub: 'Dedicated port', text: 'The admin talks HTTPS to iLO on the isolated management network. Nothing touches the host, so this works even when the OS is hung.' },
      { title: 'Shared port', sub: 'Via host NIC + NC-SI', text: 'Same Redfish request, but it enters through the host NIC and is passed to iLO over NC-SI because the destination MAC is iLO\'s.' },
      { title: 'In-band from the OS', sub: 'CHIF / host interface', text: 'iLOrest running on the host in local mode, or AMS, talks to iLO over the PCIe host channel. No credentials are needed when running as root/admin with "host authentication" set to allow.' },
      { title: 'Remote console', sub: 'Video out, keys in', text: 'iLO reads the frame buffer of its built-in video controller, compresses it and streams it encrypted to your browser. Your key presses come back and are injected into the host as a <b>USB keyboard</b>.' },
    ],
    msgs: [
      { t: '0.00s', from: 'pc', to: 'ilo', via: ['msw'], proto: 'Redfish', step: 0, info: 'GET /redfish/v1/Systems/1 via dedicated iLO port', short: 'OOB GET', layers: N.https({ src: '10.1.0.5', dst: '10.1.0.20', tcp: [52100, 443, 1, 1, 'PSH,ACK'] }, 'GET /redfish/v1/Systems/1 HTTP/1.1', T) },
      { t: '0.05s', from: 'ilo', to: 'pc', via: ['msw'], proto: 'Redfish', step: 0, info: '200 OK PowerState "On"', short: '200', layers: N.https({ src: '10.1.0.20', dst: '10.1.0.5', tcp: [443, 52100, 1, 1, 'PSH,ACK'] }, 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { Id: '1', PowerState: 'On' }) },
      { t: '1.00s', from: 'pc', to: 'ilo', via: ['dsw', 'nic'], proto: 'Redfish', step: 1, info: 'Same GET via shared port → NIC → NC-SI → iLO', short: 'shared GET', layers: N.https({ src: '10.0.0.5', dst: '10.0.0.20', tcp: [52101, 443, 1, 1, 'PSH,ACK'] }, 'GET /redfish/v1/Systems/1 HTTP/1.1', T) },
      { t: '2.00s', from: 'host', to: 'ilo', proto: 'CHIF', step: 2, info: 'iLOrest (local mode): Redfish GET over the CHIF PCIe channel', short: 'in-band GET', layers: [L('Host channel (conceptual)', [F('Transport', 'PCIe mailbox / shared memory', null, 'HPE CHIF driver/library. Details are HPE-internal; treat as a black-box pipe.'), F('Payload', 'GET /redfish/v1/Systems/1', B.ascii('GET /redfish/v1/Systems/1'), 'The same Redfish request, carried without TCP/IP.'), F('Auth', 'Host OS privilege', null, 'Governed by iLO "host authentication" settings.')])] },
      { t: '2.10s', from: 'host', to: 'ilo', proto: 'CHIF', step: 2, info: 'AMS: push OS name, hostname, NIC IPs to iLO', short: 'AMS data', layers: [L('AMS update (conceptual)', [F('OS', 'RHEL 9.4', null, '', { eg: true }), F('Hostname', 'node01', null, '', { eg: true }), F('Why', 'Shown in iLO GUI / Redfish', null, 'Lets iLO report OS-level data without an agent on the network.')])] },
      { t: '3.00s', from: 'ilo', to: 'pc', via: ['msw'], proto: 'KVM', step: 3, info: 'Remote console: compressed, encrypted video frames', short: 'video stream', layers: [L('Remote console stream', [F('Source', 'iLO VGA frame buffer', null, 'iLO is the server\'s graphics controller, so it sees exactly what a monitor would.'), F('Encoding', 'compressed tiles, only changed regions', null, 'Proprietary encoding inside TLS (HTML5 console uses WebSocket).'), F('Frame data', 'encrypted', B.enc(32), '', { enc: true })])] },
      { t: '3.50s', from: 'pc', to: 'ilo', via: ['msw'], proto: 'KVM', step: 3, info: 'Key press "a" from browser', short: 'key "a"', layers: [L('Remote console input', [F('Event', 'keydown KeyA', null, 'Browser key event, encrypted on the wire.')])] },
      { t: '3.50s', from: 'ilo', to: 'host', via: ['usb'], proto: 'USB HID', step: 3, info: 'USB HID boot keyboard report: key 0x04 ("a")', short: 'HID report', layers: [L('USB HID keyboard report · 8 bytes', [F('Modifiers', 'none', [0], 'Bit mask: Ctrl, Shift, Alt, GUI (left/right).'), F('Reserved', '', [0], ''), F('Key 1', '0x04 = "a"', [0x04], 'HID usage ID. 0x04 = a, 0x28 = Enter.'), F('Keys 2–6', 'none', B.zeros(5), 'Up to 6 simultaneous keys.')], 'To the host OS this looks exactly like a real USB keyboard. That is why the remote console works in BIOS setup too.')] },
    ],
  });

  /* =============== HMC / fleet manager =============== */
  LESSONS.push({
    id: 'cluster', cat: 'mgmt', title: 'Cluster management', subtitle: 'One console, hundreds of BMCs',
    keywords: 'hardware management console cluster manager discovery inventory events subscription rolling update power capping hms csm',
    intro: 'In HPC you never click through 1 000 iLO web pages. A <b>cluster manager</b> / management console discovers every BMC, collects inventory, listens for events and pushes actions (power, firmware, capping) to all of them.',
    overview: [
      'A <b>cluster manager</b> (sometimes called a hardware management console) is software on the management network that aggregates many BMCs or chassis managers. Not to be confused with the <b>HMC (Hardware Management Controller)</b> inside a GPU server: see the "HMC: GPU baseboard controller" lesson. The jobs are:',
      '<b>1 Discovery</b>: find BMCs (DHCP leases, known MAC/slot maps, Redfish SSDP). <b>2 Inventory</b>: walk each BMC\'s Redfish tree into a database. <b>3 Events</b>: subscribe to each BMC\'s <b>EventService</b> so failures are <i>pushed</i> to the console rather than polled. <b>4 Orchestration</b>: power sequences, rolling firmware updates, power capping across racks.',
      'The console is the single place where admins and schedulers (e.g. Slurm) learn about hardware health, which is why it is critical in HPC.',
    ],
    facts: [['Talks to', 'BMCs / chassis controllers via Redfish (IPMI legacy)'], ['Events', 'Redfish EventService (push) or SSE'], ['Scale', 'Hundreds to tens of thousands of endpoints'], ['Network', 'Isolated management network / VLAN']],
    terms: [['Event subscription', 'POST to /redfish/v1/EventService/Subscriptions with a Destination URL; the BMC POSTs events there.'], ['Rolling update', 'Update firmware in batches so the cluster keeps running.'], ['Inventory', 'Serials, part numbers, firmware versions, locations: the "what do we have" database.'], ['Location / xname', 'Physical-location naming (e.g. cabinet-chassis-slot-node) used by HPC managers.']],
    atWork: 'For HPE Cray systems this role is played by cluster software such as HPE Performance Cluster Manager (HPCM) or Cray System Management (CSM). They talk Redfish to each node\'s BMC, which in turn fronts the GPU-baseboard HMC. Ask your team which one your XD685 customers use.',
    refs: [['Redfish EventService', 'https://www.dmtf.org/sites/default/files/standards/documents/DSP0266_1.20.0.html'], ['Cray System Management docs (public)', 'https://github.com/Cray-HPE/docs-csm']],
    nodes: [
      { id: 'hmc', type: 'console', label: 'Cluster manager', sub: 'console + DB', x: 140, y: 160 },
      { id: 'adm', type: 'laptop', label: 'Admin / scheduler', sub: 'GUI, CLI, Slurm', x: 140, y: 420 },
      { id: 'sw', type: 'switch', label: 'Mgmt network', sub: 'isolated VLAN', x: 430, y: 290 },
      { id: 'b1', type: 'bmc', label: 'Node 1 BMC', sub: '10.254.1.11', x: 800, y: 110 },
      { id: 'b2', type: 'bmc', label: 'Node 2 BMC', sub: '10.254.1.12', x: 800, y: 290 },
      { id: 'b3', type: 'bmc', label: 'Node 3 BMC', sub: '10.254.1.13', x: 800, y: 470 },
    ],
    links: [{ a: 'hmc', b: 'sw', kind: 'lan' }, { a: 'adm', b: 'hmc', kind: 'lan', label: 'API / GUI' }, { a: 'sw', b: 'b1', kind: 'lan' }, { a: 'sw', b: 'b2', kind: 'lan' }, { a: 'sw', b: 'b3', kind: 'lan' }],
    steps: [
      { title: 'Discovery', sub: 'Find every BMC', text: 'New BMCs ask DHCP for an address. The cluster manager (or its DHCP service) records the MAC → IP → physical location mapping, then probes <code>/redfish/v1</code> to confirm a Redfish service is there.' },
      { title: 'Inventory', sub: 'Walk the Redfish tree', text: 'The cluster manager reads Systems, Chassis, Managers and FirmwareInventory from each BMC and stores serials, models and firmware versions centrally.' },
      { title: 'Subscribe to events', sub: 'Push, don\'t poll', text: 'The cluster manager creates an <b>event subscription</b> on each BMC. From now on the BMC POSTs alerts to the cluster manager immediately.' },
      { title: 'Alert arrives', sub: 'Fault → manager → scheduler', text: 'Node 2 reports a correctable memory error crossing its threshold. The cluster manager marks the node degraded and tells the scheduler to drain it.' },
      { title: 'Orchestrate', sub: 'Act on many nodes', text: 'The admin asks for a rolling BIOS update on the rack. The cluster manager pushes the image to one batch of BMCs at a time and tracks each Task to completion.' },
    ],
    msgs: [
      { t: '0.0s', from: 'b3', to: 'hmc', via: ['sw'], proto: 'DHCP', step: 0, info: 'DHCP DISCOVER from new BMC (MAC 02:00:0a:fe:01:0d)', short: 'DHCP DISCOVER', layers: N.packet({ eth: ['ff:ff:ff:ff:ff:ff', '02:00:0a:fe:01:0d'], src: '0.0.0.0', dst: '255.255.255.255', udp: [68, 67], app: [FX.dhcp(1, '0.0.0.0', 1, '02:00:0a:fe:01:0d')] }) },
      { t: '0.1s', from: 'hmc', to: 'b3', via: ['sw'], proto: 'DHCP', step: 0, info: 'DHCP OFFER 10.254.1.13 (known MAC → rack 1, slot 3)', short: 'DHCP OFFER', layers: N.packet({ eth: ['02:00:0a:fe:01:0d', '02:00:0a:fe:00:01'], src: '10.254.0.1', dst: '10.254.1.13', udp: [67, 68], app: [FX.dhcp(2, '10.254.1.13', 2, '02:00:0a:fe:01:0d')] }) },
      { t: '30s', from: 'hmc', to: 'b3', via: ['sw'], proto: 'Redfish', step: 0, info: 'GET /redfish/v1 (probe for a Redfish service)', short: 'probe', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.13', tcp: [41000, 443, 1, 1, 'PSH,ACK'] }, 'GET /redfish/v1 HTTP/1.1', { Host: '10.254.1.13' }) },
      { t: '31s', from: 'hmc', to: 'b1', via: ['sw'], proto: 'Redfish', step: 1, info: 'GET /redfish/v1/UpdateService/FirmwareInventory?$expand=.', short: 'inventory', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.11', tcp: [41001, 443, 1, 1, 'PSH,ACK'] }, 'GET /redfish/v1/UpdateService/FirmwareInventory?$expand=. HTTP/1.1', { Host: '10.254.1.11', 'X-Auth-Token': 'n1...' }) },
      { t: '31.2s', from: 'b1', to: 'hmc', via: ['sw'], proto: 'Redfish', step: 1, info: '200 OK BMC 2.10, BIOS U54 v2.10, CPLD 0x13, NIC 22.31', short: 'fw versions', layers: N.https({ src: '10.254.1.11', dst: '10.254.0.1', tcp: [443, 41001, 1, 1, 'PSH,ACK'] }, 'HTTP/1.1 200 OK', { 'Content-Type': 'application/json' }, { Members: [{ Id: 'BMC', Version: '2.10' }, { Id: 'BIOS', Version: 'U54 v2.10' }, { Id: 'CPLD', Version: '0x13' }, { Id: 'NIC1', Version: '22.31' }] }) },
      { t: '32s', from: 'hmc', to: 'b2', via: ['sw'], proto: 'Redfish', step: 2, info: 'POST /redfish/v1/EventService/Subscriptions {Destination: https://hmc/events}', short: 'subscribe', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.12', tcp: [41002, 443, 1, 1, 'PSH,ACK'] }, 'POST /redfish/v1/EventService/Subscriptions HTTP/1.1', { Host: '10.254.1.12', 'X-Auth-Token': 'n2...', 'Content-Type': 'application/json' }, { Destination: 'https://10.254.0.1/events', Protocol: 'Redfish', Context: 'rack1-slot2', RegistryPrefixes: ['ResourceEvent', 'Base'] }) },
      { t: '32.1s', from: 'b2', to: 'hmc', via: ['sw'], proto: 'Redfish', step: 2, info: '201 Created /EventService/Subscriptions/1', short: '201', layers: N.https({ src: '10.254.1.12', dst: '10.254.0.1', tcp: [443, 41002, 1, 1, 'PSH,ACK'] }, 'HTTP/1.1 201 Created', { Location: '/redfish/v1/EventService/Subscriptions/1' }) },
      { t: '5h 12m', from: 'b2', to: 'hmc', via: ['sw'], proto: 'Redfish', step: 3, info: 'Event POST: memory correctable errors over threshold (DIMM A3)', short: 'EVENT', layers: N.https({ src: '10.254.1.12', dst: '10.254.0.1', tcp: [38000, 443, 1, 1, 'PSH,ACK'] }, 'POST /events HTTP/1.1', { Host: '10.254.0.1', 'Content-Type': 'application/json' }, { '@odata.type': '#Event.v1_7_0.Event', Context: 'rack1-slot2', Events: [{ EventType: 'Alert', Severity: 'Warning', MessageId: 'ResourceEvent.1.0.ResourceErrorThresholdExceeded', Message: 'The resource DIMM A3 has exceeded its error threshold of value 100.', OriginOfCondition: { '@odata.id': '/redfish/v1/Systems/1/Memory/proc1dimm3' } }] }), note: 'Direction is reversed: the BMC is the HTTP client here, the cluster manager is the server.' },
      { t: '5h 12m', from: 'hmc', to: 'adm', proto: 'API', step: 3, info: 'Mark node2 degraded → scheduler drains node2', short: 'drain node2', layers: [L('Console action', [F('Node', 'rack1-slot2', null, ''), F('State', 'Degraded', null, ''), F('Scheduler', 'scontrol update node=node2 state=drain', null, 'Example Slurm command run by an integration.', { eg: true })])] },
      { t: '6h', from: 'adm', to: 'hmc', proto: 'API', step: 4, info: 'Rolling BIOS update, batch size 1, rack 1', short: 'rolling update', layers: [L('Job request', [F('Target', 'rack 1 (3 nodes)', null, ''), F('Image', 'BIOS U54 v2.12', null, '', { eg: true }), F('Policy', 'batch = 1, drain first', null, '')])] },
      { t: '6h', from: 'hmc', to: 'b1', via: ['sw'], proto: 'Redfish', step: 4, info: 'POST UpdateService.SimpleUpdate {ImageURI: https://hmc/fw/U54_2.12.signed}', short: 'SimpleUpdate', layers: N.https({ src: '10.254.0.1', dst: '10.254.1.11', tcp: [41003, 443, 1, 1, 'PSH,ACK'] }, 'POST /redfish/v1/UpdateService/Actions/UpdateService.SimpleUpdate HTTP/1.1', { Host: '10.254.1.11', 'X-Auth-Token': 'n1...', 'Content-Type': 'application/json' }, { ImageURI: 'https://10.254.0.1/fw/U54_2.12.signed', TransferProtocol: 'HTTPS' }), note: 'The BMC downloads the image itself (pull model), which scales better than uploading to each one. See the "Flashing BMC firmware" lesson for what happens inside.' },
      { t: '6h', from: 'b1', to: 'hmc', via: ['sw'], proto: 'Redfish', step: 4, info: '202 Accepted, Location: /redfish/v1/TaskService/Tasks/7', short: '202 Task', layers: N.https({ src: '10.254.1.11', dst: '10.254.0.1', tcp: [443, 41003, 1, 1, 'PSH,ACK'] }, 'HTTP/1.1 202 Accepted', { Location: '/redfish/v1/TaskService/Tasks/7/Monitor' }) },
    ],
  });
})();
