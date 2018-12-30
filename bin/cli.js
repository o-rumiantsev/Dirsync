'use strict';

const { parse } = require('url');
const { connect, share } = require('../');
const { drawTree } = require('../lib/utils');

const METHODS = ['inspect', 'sync', 'share'];
const keyMap = {
  '-i': 'ignore',
  '-d': 'dir',
  '-s': 'source',
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
    if (key.match(/-i|-d|-s/)) options[keyMap[key]] = argv[index + 1];
    return options;
  },
  {}
);

if (options.ignore) {
  let re = options.ignore;
  if (re.startsWith('/')) re = re.substring(1, re.length - 1);
  options.ignore = new RegExp(re);
}

if (method === 'sync') {
  const client = connect(url);
  client.on('error', err => console.error(err));
  client.on('connect', () => client.sync(options.dir, options.source));
  client.on('sync', () => console.log(`Synced to remote directory on ${url}`));
} else if (method === 'inspect') {
  const client = connect(url);
  client.on('error', err => console.error(err));
  client.on('connect', () => client.inspect(hierarchy => {
    const tree = drawTree(hierarchy);
    console.log(tree);
    client.close();
  }));
} else if (method === 'share') {
  const { port, hostname: host } = url ? parse(url) : {};
  const shareOptions = Object.assign(options, { port, host });
  const server = share(shareOptions);
  server.start(() => console.log(`Sync started on ${server.address}`));
  server.on('error', err => console.error(err));
  server.on('connection', connection => {
    console.log(`Client ${connection.address} connected`);
    connection.on('close', () =>
      console.log(`Client ${connection.address} disconnected`)
    );
    connection.on('message', ({ event }) =>
      console.log(`Client ${connection.address} requested ${event}`)
    );
  });
}

