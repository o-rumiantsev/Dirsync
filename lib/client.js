'use strict';

const net = require('net');
const { parse } = require('url');
const { join } = require('path');
const EventEmitter = require('events');
const Connection = require('./connection');
const fs = require('./fs-interface');

const DEFAULT_TARGET_DIR = process.cwd();
const onMessage = Symbol('onMessage');

// Client class used to synchronize local directory with remote one,
// by connecting to server and handling its remote events in accordance
// to remote file system changes
// * Events:
// *   connect - client connected
// *   close - client connection closed
// *   error - error occurred
// *     err - <Error>
// *   sync - client synced
// *   inspect - inspect response
// *     data - <Array>, remote directory structure
class Client extends EventEmitter {
  constructor() {
    super();
  }

  // Connect client by url
  //   url - <string>, e. g. 'tcp://localhost:8080', required
  connect(url) {
    const { port, hostname: host } = parse(url);
    const socket = new net.Socket();
    this.connection = new Connection(socket);

    this.connection.on('error', err => this.emit('error', err));
    this.connection.on('close', () => this.emit('close'));
    this.connection.on('message', this[onMessage].bind(this));
    this.connection.transport.on('connect', () => this.emit('connect'));
    this.connection.transport.connect({ port, host });
  }

  // Close client connection
  close() {
    this.connection.close();
  }

  // Send inspect request
  //   callback - <Function>, accept data
  //     data - <Array>, remote directory structure
  inspect(callback) {
    const inspectRequest = { event: 'inspect' };
    this.once('inspect', callback);
    this.connection.send(inspectRequest);
  }

  // Send sync request
  //   targetDir - <string>, path to local directory to be synced
  //       optional, default: current working directory
  sync(targetDir = DEFAULT_TARGET_DIR) {
    const syncRequest = { event: 'sync' };
    this.targetDir = targetDir;
    this.connection.send(syncRequest);
  }

  // Handles server messages
  //   message - <Object>
  //     event - <string>, type of event
  //         e. g. 'sync', 'inspect' - Server events
  //               'create', 'delete', 'change' - Watcher events
  //     type - <string>, type of entity: 'dir' or 'file'
  //     path - <string>, path to entity
  //     data - <Buffer> | <Array>, changed data | directory structure
  [onMessage](message) {
    const { event, type, path, data } = message;
    const callback = err => this.emit('error', err);
    const fullPath = path ? join(this.targetDir, path) : this.targetDir;

    if (event === 'sync') this.emit('sync');
    else if (event === 'inspect') this.emit('inspect', data);
    else if (event === 'create') fs.create[type](fullPath, data, callback);
    else if (event === 'delete') fs.remove[type](fullPath, callback);
    else if (event === 'change') fs.append(fullPath, data, callback);
  }
}

module.exports = Client;
