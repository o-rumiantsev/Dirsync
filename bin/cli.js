'use strict';

const { parse } = require('url');
const { connect, share } = require('../');

const METHODS = ['inspect', 'sync', 'share'];
const keyMap = {
  '-i': 'ignore',
  '-d': 'dir'
};

const [method, ...argv] = process.argv.slice(2);

if (!METHODS.includes(method)) {
  console.error(`Unknown method ${method}`);
  return;
}

let url = argv.find(arg => arg.match(/^(tcp:\/\/)?[\w\-\.]+:\d+/));
if (url) url = url.match(/^tcp:\/\//) ? url : `tcp://${url}`;
const options = argv.reduce(
  (options, key, index) => {
    if (key.match(/-i|-d/)) options[keyMap[key]] = argv[index + 1];
    return options;
  },
  {}
);

if (method === 'sync') {
  const client = connect(url);
  client.on('error', err => console.error(err));
  client.on('connect', () => client.sync(options.dir));
  client.on('sync', () => console.log(`Synced to remote directory on ${url}`));
} else if (method === 'inspect') {
  const client = connect(url);
  client.on('error', err => console.error(err));
  client.on('connect', () => client.inspect(inspectedDir => {
    console.log(inspectedDir);
    client.close();
  }));
} else if (method === 'share') {
  const { port, hostname: host } = url ? parse(url) : {};
  const shareOptions = Object.assign(options, { port, host });
  const server = share(shareOptions);
  server.start(() => console.log('Sync started'));
  server.on('error', err => console.error(err));
  server.on('connection', (clientId, client) => {
    console.log(`Client ${clientId} connected`);
    client.on('close',
      () => console.log(`Client ${clientId} disconnected`));
    client.on('message',
      ({ event }) => console.log(`Client ${clientId} requested ${event}`));
  });
}

