'use strict';

const net = require('net');
const EventEmitter = require('events');
const Connection = require('./connection');
const Watcher = require('./watcher');
const { isDir } = require('./fs-interface');

const kNextConnectionId = Symbol('nextConnectionId');
const kConnections = Symbol('connections');

const emitRemoteEvent = Symbol('emitRemoteEvent');
const onSync = Symbol('onSync');
const onInspect = Symbol('onInspect');

const DEFAULT_OPTIONS = {
  dir: process.cwd(),
  host: 'localhost',
  port: 8080,
};

// Server class used to synchronize local directory with remote ones,
// by watching it recursively, accepting new connections and emitting
// remote events to them in order to sync appropriate file system changes
// * Events:
// *   start - server started
// *   stop - server stopped
// *     err - <Error>, error on closing server if it wasn't started
// *   error - error occurred
// *     err - <Error>
// *   connection - server accepted new connection
// *     connection - <Connection>, connection accepted
// *   sync - sync request from connection
// *     connection - <Connection>, connection requested sync
// *   inspect - inspect request from connection
// *     connection - <Connection>, connection requested inspect
class Server extends EventEmitter {

  // Server constructor
  //   options - <Object>
  //     port - <number>, listening port,
  //         optional, default: 8080
  //     host - <string>, listening host,
  //         optional, default: 'localhost'
  //     dir - <string>, path to directory to be synced,
  //         optional, default: current working directory
  //     ignore - <RegExp>, regexp for file names,
  //         which should be ignored, optional
  constructor(options = DEFAULT_OPTIONS) {
    super();

    const { port, host, dir, ignore } = options;
    this.port = port || DEFAULT_OPTIONS.port;
    this.host = host || DEFAULT_OPTIONS.host;
    this.dir = dir || DEFAULT_OPTIONS.dir;
    this.server = new net.Server();
    this.watcher = new Watcher(this.dir, { ignore });
    this[kConnections] = new Map();
    this[kNextConnectionId] = 1;

    this.server.on('error', err => this.emit('error', err));
    this.server.on('connection', socket => {
      const connection = new Connection(socket);
      const connectionId = this[kNextConnectionId]++;

      connection.on('message', ({ event }) => this.emit(event, connection));
      connection.on('error', err => this.emit('error', err));
      connection.on('close', () => this[kConnections].delete(connectionId));

      this[kConnections].set(connectionId, connection);
      this.emit('connection', connection);
    });

    this.watcher.on('create', (path, data) =>
      this[emitRemoteEvent]('create', path, data)
    );
    this.watcher.on('change', (path, data) =>
      this[emitRemoteEvent]('change', path, data)
    );
    this.watcher.on('delete', path => this[emitRemoteEvent]('delete', path));

    this.on('sync', this[onSync]);
    this.on('inspect', this[onInspect]);
  }

  // Start server listening and watching directory
  //   callback - <Function>, called after server started, optional
  start(callback) {
    this.server.listen(this.port, this.host, () => {
      this.watcher.watch();
      this.emit('start');
      if (callback) callback();
    });
  }

  // Stop server listening and watching directory
  //   callback - <Function>, called after server stopped, optional
  stop(callback) {
    this.server.close(err => {
      this.watcher.stop();
      this.emit('stop');
      if (callback) callback(err);
    });
  }

  // Getter for all server connections
  // Returns: <Map>
  get connections() {
    return this[kConnections];
  }

  // Emit remote event to every connection,
  // which is synced to appropriate changes
  [emitRemoteEvent](event, path, data) {
    let type = 'file';

    isDir(path, (err, isDir) => {
      if (err) {
        this.emit('error', err);
        return;
      }
      if (isDir) type = 'dir';
    });

    const payload = { event, type, path, data };

    this[kConnections].forEach(connection => {
      if (connection.sync) connection.send(payload);
    });
  }

  // Handles sync request from connection
  [onSync](connection) {
    const payload = { event: 'sync' };
    connection.sync = true;
    connection.send(payload);
  }

  // Handles sync request from connection
  // by sending local directory structure
  [onInspect](connection) {
    const files = Watcher.inspectDirectory(this.dir);
    const payload = { event: 'inspect', data: files };
    connection.send(payload);
  }
}

module.exports = Server;
