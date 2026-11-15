/* Byte + field helpers used by lesson definitions */
(function () {
  const enc = new TextEncoder();
  const B = {
    u8: v => [v & 255],
    u16be: v => [(v >> 8) & 255, v & 255],
    u16le: v => [v & 255, (v >> 8) & 255],
    u24be: v => [(v >> 16) & 255, (v >> 8) & 255, v & 255],
    u32be: v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255],
    u32le: v => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255],
    ascii: s => Array.from(enc.encode(s)),
    hex: s => s.trim().split(/\s+/).filter(Boolean).map(h => parseInt(h, 16)),
    ip: s => s.split('.').map(Number),
    mac: s => s.split(':').map(h => parseInt(h, 16)),
    zeros: n => Array(n).fill(0),
    enc: n => Array(n).fill(-1),
    rnd(n, seed) {
      let x = seed || 7; const out = [];
      for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; out.push((x >> 16) & 255); }
      return out;
    },
    sum: arr => arr.reduce((a, b) => a + (b < 0 ? 0 : b), 0),
    ipmiChk: arr => [(-B.sum(arr)) & 255],
    crc8(arr) {
      let c = 0;
      for (const b of arr) { c ^= b; for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; }
      return [c];
    },
    ipChecksum(arr) {
      let s = 0;
      for (let i = 0; i < arr.length; i += 2) s += (arr[i] << 8) + (arr[i + 1] || 0);
      while (s >> 16) s = (s & 0xffff) + (s >> 16);
      return B.u16be(~s & 0xffff);
    },
    toHex: (arr, sep = ' ') => arr.map(b => b < 0 ? '--' : b.toString(16).padStart(2, '0')).join(sep),
  };

  /* Field: name, display value, bytes (array|null), description, options {eg, enc} */
  const F = (n, v, b, d, o) => Object.assign({ n, v: String(v), b: b || null, d: d || '' }, o || {});
  const L = (name, fields, note) => ({ name, fields, note });
  const bytesOf = fields => fields.flatMap(f => f.b || []);
  const hx = v => '0x' + v.toString(16).toUpperCase().padStart(2, '0');

  /* ---------- Network layers ---------- */
  const N = {
    eth(dst, src, type, typeName) {
      return L('Ethernet II', [
        F('Destination MAC', dst, B.mac(dst), 'Hardware address of the next hop on this wire.', { eg: true }),
        F('Source MAC', src, B.mac(src), 'Hardware address of the sender\'s network interface.', { eg: true }),
        F('EtherType', hx(type >> 8) + (type & 255).toString(16).padStart(2, '0') + ' (' + typeName + ')', B.u16be(type), 'Which protocol is inside this frame.'),
      ]);
    },
    ipv4(src, dst, proto, payloadLen, id = 0x1c46) {
      const hdr = [0x45, 0x00, ...B.u16be(20 + payloadLen), ...B.u16be(id), 0x40, 0x00, 64, proto, 0, 0, ...B.ip(src), ...B.ip(dst)];
      const ck = B.ipChecksum(hdr);
      const pn = { 6: 'TCP', 17: 'UDP' }[proto] || proto;
      return L('IPv4 · 20 bytes', [
        F('Version / IHL', '4 / 20 bytes', [0x45], 'IPv4, header length 5 x 32-bit words.'),
        F('DSCP / ECN', '0x00', [0], 'Quality-of-service marking (none).'),
        F('Total length', 20 + payloadLen, B.u16be(20 + payloadLen), 'IP header plus everything inside it.'),
        F('Identification', hx(id >> 8) + (id & 255).toString(16).padStart(2, '0'), B.u16be(id), 'Used to reassemble fragments.', { eg: true }),
        F('Flags / Fragment', "Don't fragment", [0x40, 0], 'DF bit set: routers must not split this packet.'),
        F('TTL', 64, [64], 'Hop limit; each router decrements it.'),
        F('Protocol', pn + ' (' + proto + ')', [proto], 'Transport protocol carried inside.'),
        F('Header checksum', '0x' + B.toHex(ck, ''), ck, 'One\'s-complement checksum of the IP header.'),
        F('Source IP', src, B.ip(src), 'Who sent the packet.'),
        F('Destination IP', dst, B.ip(dst), 'Who should receive it.'),
      ]);
    },
    tcp(sp, dp, seq, ack, flags) {
      const fm = { FIN: 1, SYN: 2, RST: 4, PSH: 8, ACK: 16 };
      const fb = flags.split(',').reduce((a, f) => a | (fm[f.trim()] || 0), 0);
      return L('TCP · 20 bytes', [
        F('Source port', sp, B.u16be(sp), 'Sender\'s port (ephemeral for clients).'),
        F('Destination port', dp, B.u16be(dp), 'Service port on the receiver (443 = HTTPS).'),
        F('Sequence number', seq, B.u32be(seq), 'Byte position of this segment in the sender\'s stream.', { eg: true }),
        F('Acknowledgment', ack, B.u32be(ack), 'Next byte expected from the other side.', { eg: true }),
        F('Header length / Flags', '20 bytes / ' + flags, [0x50, fb], 'TCP flags control the connection state.'),
        F('Window', 64240, B.u16be(64240), 'How many bytes the sender can accept.', { eg: true }),
        F('Checksum', '0x3a1f', [0x3a, 0x1f], 'Covers header, payload and a pseudo-header.', { eg: true }),
        F('Urgent pointer', 0, [0, 0], 'Unused.'),
      ]);
    },
    udp(sp, dp, payloadLen) {
      return L('UDP · 8 bytes', [
        F('Source port', sp, B.u16be(sp), 'Sender\'s port.'),
        F('Destination port', dp, B.u16be(dp), 'Receiver\'s service port.'),
        F('Length', 8 + payloadLen, B.u16be(8 + payloadLen), 'UDP header plus payload.'),
        F('Checksum', '0x0000', [0, 0], 'Optional in IPv4.', { eg: true }),
      ]);
    },
    /* Build eth+ip+tcp/udp+app layers with computed lengths */
    packet({ eth, src, dst, tcp, udp, app }) {
      const appLen = app.reduce((a, l) => a + bytesOf(l.fields).length, 0);
      const out = [];
      if (eth) out.push(N.eth(eth[0], eth[1], 0x0800, 'IPv4'));
      if (tcp) { out.push(N.ipv4(src, dst, 6, 20 + appLen)); out.push(N.tcp(...tcp)); }
      if (udp) { out.push(N.ipv4(src, dst, 17, 8 + appLen)); out.push(N.udp(udp[0], udp[1], appLen)); }
      return out.concat(app);
    },
    tlsHdr(innerLen) {
      return L('TLS 1.3 record · 5 bytes', [
        F('Content type', 'Application data (23)', [0x17], 'Encrypted application data follows.'),
        F('Legacy version', 'TLS 1.2 (0x0303)', [3, 3], 'Always 0x0303 in TLS 1.3 for compatibility.'),
        F('Length', innerLen + 17, B.u16be(innerLen + 17), 'Encrypted payload + 1-byte inner type + 16-byte AEAD tag.'),
      ], 'On the wire everything after this header is ciphertext. Below it is shown decrypted so you can read it.');
    },
    tlsTag() { return L('TLS AEAD tag · 17 bytes', [F('Inner type + auth tag', 'encrypted', B.enc(17), 'Integrity tag: any tampering is detected and the record is rejected.', { enc: true })]); },
    http(start, headers, body, name) {
      const f = [F(start.startsWith('HTTP') ? 'Status line' : 'Request line', start, B.ascii(start + '\r\n'), start.startsWith('HTTP') ? 'Protocol version, status code and reason.' : 'Method, path and protocol version.')];
      const bodyStr = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body, null, 1));
      const H = Object.assign({}, headers);
      if (bodyStr && !H['Content-Length']) H['Content-Length'] = String(B.ascii(bodyStr).length);
      for (const [k, v] of Object.entries(H)) f.push(F(k, v, B.ascii(k + ': ' + v + '\r\n'), HDR_DOC[k] || 'HTTP header.'));
      f.push(F('End of headers', 'CRLF', [13, 10], 'Blank line separates headers from body.'));
      if (bodyStr) f.push(F('Body (JSON)', bodyStr.length > 70 ? bodyStr.replace(/\s+/g, ' ').slice(0, 70) + '…' : bodyStr, B.ascii(bodyStr), 'Redfish bodies are JSON documents described by DMTF schemas.', { json: bodyStr }));
      return L(name || 'HTTP/1.1 (decrypted view)', f);
    },
    https(o, start, headers, body) {
      const h = N.http(start, headers, body);
      const len = bytesOf(h.fields).length;
      return N.packet(Object.assign({}, o, { app: [N.tlsHdr(len), h, N.tlsTag()] }));
    },
  };
  const HDR_DOC = {
    Host: 'Which server name the client is talking to.',
    'X-Auth-Token': 'Redfish session token returned at login. Proves who you are on every request.',
    'Content-Type': 'Format of the body.',
    'Content-Length': 'Body size in bytes.',
    Location: 'URI of the newly created resource.',
    'OData-Version': 'Redfish is built on OData conventions.',
    Authorization: 'HTTP Basic credentials (base64 of user:password).',
    Accept: 'Formats the client can read.',
  };

  /* ---------- IPMI ---------- */
  const I = {
    rmcp() {
      return L('RMCP · 4 bytes', [
        F('Version', 'RMCP 1.0 (0x06)', [6], 'ASF Remote Management Control Protocol version.'),
        F('Reserved', '0x00', [0], ''),
        F('Sequence', '0xFF (no ACK)', [0xff], '0xFF means the receiver must not send an RMCP ACK.'),
        F('Class', 'IPMI (0x07)', [7], 'Message class 7 = IPMI. (6 would be ASF ping/pong.)'),
      ]);
    },
    /* IPMI message: request if cc undefined */
    msg({ a1 = 0x20, netFn, lun = 0, a2 = 0x81, seq = 0, cmd, cmdName, cc, data = [] }) {
      const isResp = cc !== undefined;
      const h1 = [a1, (netFn << 2) | lun];
      const c1 = B.ipmiChk(h1);
      const h2 = [a2, (seq << 2) | 0, cmd];
      const ccF = isResp ? [F('Completion code', cc === 0 ? 'Success (0x00)' : hx(cc), [cc], '0x00 = success. Non-zero codes report errors (e.g. 0xC1 invalid command).')] : [];
      const all = [...h2, ...(isResp ? [cc] : []), ...bytesOf(data)];
      const c2 = B.ipmiChk(all);
      const nf = { 0: 'Chassis', 1: 'Chassis resp', 4: 'Sensor/Event', 5: 'Sensor/Event resp', 6: 'App', 7: 'App resp', 0xa: 'Storage', 0xb: 'Storage resp' }[netFn] || hx(netFn);
      return L('IPMI message · ' + (isResp ? 'response' : 'request'), [
        F(isResp ? 'Requester address' : 'Responder address', hx(a1) + (a1 === 0x20 ? ' (BMC)' : a1 === 0x81 ? ' (remote console)' : ''), [a1], 'IPMB-style slave address. 0x20 is always the BMC.'),
        F('NetFn / LUN', nf + ' ' + hx(netFn) + ' / ' + lun, [(netFn << 2) | lun], 'Network Function groups commands (App, Chassis, Storage...). Responses use NetFn+1.'),
        F('Header checksum', hx(c1[0]), c1, 'Two\'s complement: bytes sum to 0 mod 256.'),
        F(isResp ? 'Responder address' : 'Requester address', hx(a2), [a2], 'Who sent it / who answers.'),
        F('Seq / LUN', seq + ' / 0', [(seq << 2)], 'Sequence number matches responses to requests.'),
        F('Command', (cmdName || '') + ' (' + hx(cmd) + ')', [cmd], 'Command number inside the NetFn.'),
        ...ccF, ...data,
        F('Data checksum', hx(c2[0]), c2, 'Checksum over everything after the header checksum.'),
      ]);
    },
  };

  /* ---------- MCTP / PLDM ---------- */
  const M = {
    mctp(dst, src, tagOwner = 1, tag = 0) {
      const flags = 0xc0 | (0 << 4) | (tagOwner << 3) | tag;
      return L('MCTP transport · 5 bytes', [
        F('Header version', '1', [0x01], 'MCTP base spec DSP0236.'),
        F('Destination EID', dst, [dst], 'Endpoint ID: like an IP address inside the server.'),
        F('Source EID', src, [src], 'Endpoint ID of the sender.'),
        F('SOM/EOM/Seq/TO/Tag', 'SOM EOM TO=' + tagOwner + ' tag=' + tag, [flags], 'Start/End-of-message bits allow large messages to be split into packets.'),
        F('Message type', 'PLDM (0x01)', [0x01], '0x00 = MCTP control, 0x01 = PLDM, 0x02 = NC-SI, 0x04 = NVMe-MI, 0x7E = vendor PCI.'),
      ]);
    },
    pldm(req, iid, type, cmd, cmdName, cc, data = []) {
      const f = [
        F('Rq / D / Instance ID', (req ? 'Request' : 'Response') + ', IID ' + iid, [(req ? 0x80 : 0) | iid], 'Request bit plus an instance ID that pairs request/response.'),
        F('Hdr ver / PLDM type', 'Type ' + type + (type === 5 ? ' (Firmware Update)' : type === 2 ? ' (Platform Monitoring)' : ''), [type], 'PLDM Type 5 = Firmware Update (DSP0267).'),
        F('Command', cmdName + ' (' + hx(cmd) + ')', [cmd], 'PLDM command code.'),
      ];
      if (!req) f.push(F('Completion code', cc === 0 ? 'SUCCESS (0x00)' : hx(cc), [cc], 'PLDM completion code.'));
      return L('PLDM · ' + (req ? 'request' : 'response'), f.concat(data));
    },
  };

  window.FX = { B, F, L, N, I, M, hx, bytesOf };
  window.LESSONS = [];
})();
