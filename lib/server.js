'use strict';

const fs = require('fs');
const net = require('net');
const EventEmitter = require('events');
const Connection = require('./connection');
const Watcher = require('./watcher');
const { inspectDirectory } = require('./watcher/utils');
const { readFileSubsystem, readable } = require('./fs-interface');

const kNextConnectionId = Symbol('nextConnectionId');
const kConnections = Symbol('connections');

const emitRemoteEvent = Symbol('emitRemoteEvent');
const onInspect = Symbol('onInspect');
const onSync = Symbol('onSync');

const DEFAULT_OPTIONS = {
  dir: process.cwd(),
  host: 'localhost',
  port: 8080,
  ignore: null,
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
    this.ignore = ignore || DEFAULT_OPTIONS.ignore;
    this.server = new net.Server();
    this.watcher = new Watcher(this.dir, { ignore });
    this[kConnections] = new Map(); // connectionId => Connection
    this[kNextConnectionId] = 1;

    this.server.on('error', err => this.emit('error', err));
    this.server.on('connection', socket => {
      const connection = new Connection(socket);
      const connectionId = this[kNextConnectionId]++;

      connection.on('message', message => {
        if (message.event === 'sync') this[onSync](connection, message);
        if (message.event === 'inspect') this[onInspect](connection);
        this.emit(message.event, connection);
      });

      connection.on('error', err => this.emit('error', err));
      connection.on('close', () => this[kConnections].delete(connectionId));

      this[kConnections].set(connectionId, connection);
      this.emit('connection', connection);
    });

    this.watcher.on('update', (path, stream) =>
      this[emitRemoteEvent]('update', path, stream)
    );
    this.watcher.on('create', (dirent, stream) =>
      this[emitRemoteEvent]('create', dirent, stream)
    );
    this.watcher.on('remove', dirent =>
      this[emitRemoteEvent]('remove', dirent)
    );
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
  //   stream - <Buffer>, file stream
  [emitRemoteEvent](event, dirent, stream) {
    const info = { event };

    if (event === 'update') {
      info.type = 'file';
      info.path = dirent;
    } else {
      info.type = dirent.isFile() ? 'file' : 'dir';
      info.path = dirent.name;
    }

    const receivers = Array.from(this[kConnections].values())
      .filter(c => c.sync && info.path.includes(c.dir.replace(/^\.\//, '')));

    if (stream) {
      receivers.forEach(conn => conn.stream(stream, info));
    } else {
      receivers.forEach(conn => conn.send(info));
    }
  }

  // Handles sync request from connection,
  // by starting synchronizing remote directory
  // and sending local directory`s current file subsystem
  //   connection - <Connection>, connection, requested sync
  //   message - <Object>, sync request message
  [onSync](connection, message) {
    const { dir = this.dir } = message;

    if (!dir.startsWith(this.dir) || !fs.existsSync(dir)) {
      const payload = {
        event: 'error',
        data: `directory ${dir} does not exist`,
      };
      connection.send(payload);
      return;
    }

    const streamFiles = node => {
      node.files = node.files.map(p => {
        const stream = readable(p);
        return [p, connection.stream(stream, { preloading: true })];
      });
      node.children.forEach(streamFiles);
    };

    readFileSubsystem(dir, this.ignore, (err, fileSubsystem) => {
      if (err) {
        this.emit('error', err);
        return;
      }

      streamFiles(fileSubsystem);

      const payload = { event: 'sync', data: fileSubsystem };
      connection.sync = true;
      connection.dir = dir;
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
