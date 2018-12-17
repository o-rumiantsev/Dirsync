'use strcit';

const Client = require('./lib/client');
const Server = require('./lib/server');
const Watcher = require('./lib/watcher');

// Connect to server which is sharing its file system
//   url - <string>, server url address
//   cb - <Function>, callback
// Returns: <Client>
const connect = (url, cb) => {
  const client = new Client();
  client.connect(url);
  if (cb) client.on('connect', cb);
  return client;
};

// Create server to share local file system
//   options - <Object>, server options
//     port - <number>, listening port,
//         optional, default: 8080
//     host - <string>, listening host,
//         optional, default: 'localhost'
//     dir - <string>, path to directory to be synced,
//         optional, default: current working directory
//     ignore - <RegExp>, regexp for file names,
//         which should be ignored, optional
// Returns: <Server>
const share = options => new Server(options);

module.exports = {
  connect,
  share,
  Watcher,
};

