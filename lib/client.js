'use strict';

const net = require('net');
const { parse } = require('url');
const EventEmitter = require('events');
const Connection = require('./connection');
const fs = require('./fs-interface');

const ERR_TARGET_DIR_IS_REQUIRED = 'Target directory is required';

const onMessage = Symbol('onMessage');
const onStream = Symbol('onStream');
const onSync = Symbol('onSync');

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
// *     data - <string[]>, remote directory structure
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
    this.connection.on('stream', this[onStream].bind(this));
    this.connection.transport.on('connect', () => this.emit('connect'));
    this.connection.transport.connect({ port, host });
  }

  // Close client connection
  close() {
    this.connection.close();
  }

  // Send inspect request
  //   callback - <Function>, accept data
  //     data - <string[]>, remote directory structure
  inspect(callback) {
    const inspectRequest = { event: 'inspect' };
    this.once('inspect', callback);
    this.connection.send(inspectRequest);
  }

  // Send sync request
  //   targetDir - <string>, path to local directory to be synced, required
  //   sourceDir - <string>, path to remote directory to be synced,
  //       optional, default: root of remote synced directory
  sync(targetDir, sourceDir) {
    if (!targetDir) {
      this.emit('error', ERR_TARGET_DIR_IS_REQUIRED);
      return;
    }

    const syncRequest = { event: 'sync', dir: sourceDir };
    this.targetDir = targetDir;
    this.connection.send(syncRequest);
  }

  // Handles server messages
  //   message - <Object>
  //     event - <string>, type of event
  //         e. g. 'sync', 'inspect' - Server events
  //               'create', 'delete', 'change' - Watcher events
  //     path - <string>, path to entity
  [onMessage](message) {
    const { event, type, path, data } = message;
    const callback = err => {
      if (err) this.emit('error', err);
    };
    const fullPath = path ?
      fs.replacePath(path, this.targetDir, this.sourceDir) : this.targetDir;

    if (event === 'error') callback(new Error(data));
    else if (event === 'sync') this[onSync](data);
    else if (event === 'inspect') this.emit('inspect', data);
    else if (event === 'create') fs.createDir(fullPath, callback);
    else if (event === 'remove')
      type === 'file' ?
        fs.removeFile(fullPath, callback) : fs.removeDir(fullPath, callback);
  }

  // Handles server streams
  //   stream - <Readable>
  //   info - <Object>, additional info
  //     path - <string>, file path
  [onStream](stream, info) {
    if (info.preloading) return;
    const { path } = info;
    const fullPath = path ?
      fs.replacePath(path, this.targetDir, this.sourceDir) : this.targetDir;
    const writable = fs.writable(fullPath);
    stream.pipe(writable);
  }

  // Builds remote synced directory`s file subsystem
  //   fileSubsystem - <Object>
  //     path - <string>
  //     files - <MapEntries[]>, [[filename <string>, file data <Buffer>], ...]
  //     children - <Object[]>, subdirectories, same structure as fileSubsystem
  [onSync](fileSubsystem) {
    this.sourceDir = fileSubsystem.path;
    const streams = this.connection.streams;
    fs.buildFileSubsystem(
      fileSubsystem,
      streams,
      this.targetDir,
      this.sourceDir,
      err => {
        if (err) {
          this.emit('error', err);
          return;
        }
        this.emit('sync');
      }
    );
  }
}

module.exports = Client;
