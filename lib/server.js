'use strict';

const net = require('net');
const EventEmitter = require('events');
const Connection = require('./connection');
const Watcher = require('./watcher');
const { inspectDirectory } = require('./watcher/utils');
const { readFileSubsystem } = require('./fs-interface');

const kNextConnectionId = Symbol('nextConnectionId');
const kConnections = Symbol('connections');

const emitRemoteEvent = Symbol('emitRemoteEvent');
const onInspect = Symbol('onInspect');
const onSync = Symbol('onSync');

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
    this.ignore = ignore;
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

    this.watcher.on('create', (dirent, data) =>
      this[emitRemoteEvent]('create', dirent, data)
    );
    this.watcher.on('remove', dirent =>
      this[emitRemoteEvent]('remove', dirent)
    );
    this.watcher.on('update', (path, data) =>
      this[emitRemoteEvent]('update', path, data)
    );

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
      this.watcher.unwatch();
      this.emit('stop');
      if (callback) callback(err);
    });
  }

  // Getter for all server connections
  // Returns: <Map>
  get connections() {
    return this[kConnections];
  }

  // Getter for server address
  // Returns: <String>
  get address() {
    const { address, port } = this.server.address();
    return `${address}:${port}`;
  }

  // Emit remote event to every connection,
  // which is synced to appropriate changes
  //   event - <string>, event type ('create', 'update', 'remove')
  //   dirent - <fs.Dirent> | <string>, directory or file dirent |
  //       path to updated file
  //   data - <Buffer>, file data
  [emitRemoteEvent](event, dirent, data) {
    const payload = { event, data };

    if (event === 'update') {
      payload.type = 'file';
      payload.path = dirent;
    } else {
      payload.type = dirent.isFile() ? 'file' : 'dir';
      payload.path = dirent.name;
    }

    this[kConnections].forEach(connection => {
      if (connection.sync) connection.send(payload);
    });
  }

  // Handles sync request from connection,
  // by starting synchronizing remote directory
  // and sending local directory`s current file subsystem
  //   connection - <Connection>, connection, requested sync
  [onSync](connection) {
    readFileSubsystem(this.dir, (err, fileSubsystem) => {
      if (err) {
        this.emit('error', err);
        return;
      }

      const payload = { event: 'sync', data: fileSubsystem };
      connection.sync = true;
      connection.send(payload);
    });
  }

  // Handles sync request from connection
  // by sending local directory structure
  //   connection - <Connection>, connection, requested inspect
  [onInspect](connection) {
    const files = inspectDirectory(this.dir, this.ignore);
    const payload = { event: 'inspect', data: files };
    connection.send(payload);
  }
}

module.exports = Server;
