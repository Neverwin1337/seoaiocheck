import { lookup } from 'node:dns';
import ipaddr from 'ipaddr.js';
import { Agent, setGlobalDispatcher } from 'undici';

function publicIp(address) {
  if (!ipaddr.isValid(address)) return false;
  const ip = ipaddr.parse(address);
  return ip.range() === 'unicast' && ip.kind() === 'ipv4';
}

function allowedOrigin(origin) {
  const url = new URL(origin);
  return ['http:', 'https:'].includes(url.protocol)
    && (!url.port || url.port === (url.protocol === 'https:' ? '443' : '80'))
    && !url.username && !url.password
    && !url.hostname.includes(':')
    && !url.hostname.endsWith('.local') && !url.hostname.endsWith('.localhost')
    && url.hostname !== 'localhost'
    && (!ipaddr.isValid(url.hostname) || publicIp(url.hostname));
}

class PublicHttpAgent extends Agent {
  dispatch(options, handler) {
    try {
      if (!allowedOrigin(options.origin)) {
        throw new Error('Blocked non-public audit destination');
      }
    } catch (error) {
      queueMicrotask(() => handler.onError(error));
      return true;
    }
    return super.dispatch(options, handler);
  }
}

setGlobalDispatcher(new PublicHttpAgent({
  connections: 4,
  headersTimeout: 15000,
  bodyTimeout: 15000,
  connect: {
    timeout: 10000,
    lookup(hostname, options, callback) {
      lookup(hostname, { all: true, family: 4 }, (error, addresses) => {
        if (error) return callback(error);
        if (!addresses.length || addresses.some(item => !publicIp(item.address))) {
          return callback(new Error('Blocked non-public audit destination'));
        }
        if (options.all) return callback(null, addresses);
        callback(null, addresses[0].address, 4);
      });
    },
  },
}));

export { allowedOrigin, publicIp };
