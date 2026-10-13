// Proves the NETCONF fixture is the fixture the provider's tests assume. It is not a provider
// test: it reads the server over ssh2, the library the provider itself dials with, and asserts
// what a silently broken fixture would get wrong.
//
// Three things are checked, and each one has been seen to fail in a way that compiles, builds and
// tags cleanly (measured 2026-10-13):
//   1. the container answers on the port at all (a missing /usr/local/sbin copy builds an image
//      whose server binary is absent),
//   2. a session opens and the server says hello (a half-applied ietf-netconf-server config
//      leaves accounts that cannot log in),
//   3. the read-only account is actually read-only (without the NACM rule-list the same account
//      keeps lock, unlock, discard-changes, validate and copy-config).
//
// Usage: node docker/netconf/verify.mjs <port> <private-key-file>
import { Client } from "ssh2";
import { readFileSync } from "node:fs";

const PORT = Number(process.argv[2] || 1830);
const KEY = process.argv[3];
const HOST = "127.0.0.1";
const USER = "ro-key";
const EOM = "]]>]]>";

const REFUSED = [
  ["lock", "<lock><target><running/></target></lock>"],
  ["unlock", "<unlock><target><running/></target></unlock>"],
  ["edit-config", "<edit-config><target><running/></target><config/></edit-config>"],
  ["copy-config", "<copy-config><target><startup/></target><source><running/></source></copy-config>"],
  ["delete-config", "<delete-config><target><startup/></target></delete-config>"],
  ["commit", "<commit/>"],
  ["validate", "<validate><source><running/></source></validate>"],
  ["discard-changes", "<discard-changes/>"],
  ["kill-session", "<kill-session><session-id>1</session-id></kill-session>"],
  ["create-subscription", '<create-subscription xmlns="urn:ietf:params:xml:ns:netconf:notification:1.0"/>'],
];
const PERMITTED = [
  ["get-config", "<get-config><source><running/></source></get-config>"],
  ["get-schema", '<get-schema xmlns="urn:ietf:params:xml:ns:yang:ietf-netconf-monitoring"><identifier>ietf-interfaces</identifier><format>yang</format></get-schema>'],
];

function session(requests) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const replies = [];
    let fingerprint = null;
    const timer = setTimeout(() => reject(new Error("the fixture did not answer within 30s")), 30000);
    client.on("ready", () => {
      client.subsys("netconf", (error, stream) => {
        if (error) return reject(error);
        let buffer = "";
        let sent = 0;
        const next = () => {
          if (sent >= requests.length) return stream.end();
          stream.write(`<rpc message-id="${sent + 1}" xmlns="urn:ietf:params:xml:ns:netconf:base:1.0">${requests[sent]}</rpc>${EOM}`);
        };
        stream.write(`<?xml version="1.0" encoding="UTF-8"?><hello xmlns="urn:ietf:params:xml:ns:netconf:base:1.0"><capabilities><capability>urn:ietf:params:netconf:base:1.0</capability></capabilities></hello>${EOM}`);
        stream.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          let at;
          while ((at = buffer.indexOf(EOM)) !== -1) {
            replies.push(buffer.slice(0, at));
            buffer = buffer.slice(at + EOM.length);
            if (replies.length > 1) sent += 1;
            next();
          }
        });
        stream.on("close", () => { clearTimeout(timer); client.end(); resolve({ fingerprint, replies }); });
      });
    });
    client.on("error", (error) => { clearTimeout(timer); reject(error); });
    client.connect({
      host: HOST, port: PORT, username: USER, privateKey: readFileSync(KEY), readyTimeout: 20000,
      hostVerifier: (key) => { fingerprint = key.length > 0; return true; },
    });
  });
}

const requests = [...REFUSED, ...PERMITTED].map(([, body]) => body);
const { replies } = await session(requests);
const hello = replies[0] ?? "";
const answers = replies.slice(1);

const failures = [];
if (!hello.includes("<session-id>")) failures.push("the hello carried no session-id");
if (answers.length !== requests.length) failures.push(`asked ${requests.length} operations, got ${answers.length} replies`);

REFUSED.forEach(([name], index) => {
  const reply = answers[index] ?? "";
  if (!reply.includes("<error-tag>access-denied</error-tag>")) {
    failures.push(`${name} was not refused with access-denied: ${reply.slice(0, 120)}`);
  }
});
PERMITTED.forEach(([name], index) => {
  const reply = answers[REFUSED.length + index] ?? "";
  if (reply.includes("<rpc-error>") || !reply.includes("<data")) {
    failures.push(`${name} did not return data: ${reply.slice(0, 120)}`);
  }
});

if (failures.length > 0) {
  console.error("NETCONF fixture check FAILED");
  for (const line of failures) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`NETCONF fixture check passed: hello ${hello.length} bytes, ${REFUSED.length} operations refused with access-denied, ${PERMITTED.length} reads answered`);
