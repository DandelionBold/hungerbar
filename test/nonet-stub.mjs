// Preloaded with --import by nonet.test.ts: any network attempt throws and leaves a mark on stderr.
import dns from 'node:dns';
import net from 'node:net';

const trap = (what) => () => {
  process.stderr.write(`NETWORK: ${what}\n`);
  throw new Error(`network used: ${what}`);
};
globalThis.fetch = trap('fetch');
net.Socket.prototype.connect = trap('net.connect');
net.connect = net.createConnection = trap('net.connect');
dns.lookup = trap('dns.lookup');
