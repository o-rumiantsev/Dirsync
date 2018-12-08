'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const CreateWatcher = require('./create-watcher');
const log = require('../log');

const EDIRNOTEXISTS = 'path does not exists';

// WatchError class for custom errors
class WatchError extends Error {
  constructor(message, target) {
    super();
    this.name = 'WatchError';
    this.message = `${message}: ${target}`;
  }
}

// Watcher class to watch changes in file system
class Watcher extends EventEmitter {

  // Check whether path exists
  //   path - <string>
  // Trhows: <WatcherError>
  static checkExists(path) {
    const exists = fs.existsSync(path);
    if (!exists) throw new WatchError(EDIRNOTEXISTS, path);
  }

  // Start watching file
  //   filename - <string>, path to file
  //   onChange - <Function>, change listener
  // Throws: <WatchError>
  static watchFile(filename, onChange) {
    Watcher.checkExists(filename);
    const watcher = fs.watch(filename);
    let delayed = false;
    const delay = () => (delayed = true, setImmediate(() => (delayed = false)));
    const _onChange = event => {
      if (delayed) return;
      if (event !== 'change') return;
      fs.readFile(filename, (err, data) => {
        if (err) log.error(err.message);
        else onChange(data);
      });
      delay();
    };
    watcher.on('change', _onChange);
    return watcher;
  }

  // Inspect directory files recursively
  //   dirname - <string>, directory path
  // Throws: <WatchError>
  static inspectDirectory(dirname) {
    Watcher.checkExists(dirname);
    const inspected = fs.readdirSync(dirname, { withFileTypes: true });
    const files =
      inspected
        .filter(f => f.isFile())
        .map(f => path.join(dirname, f.name));
    const directories =
      inspected
        .filter(f => f.isDirectory())
        .map(f => path.join(dirname, f.name));
    directories.forEach(
      subdirPath =>
        Watcher
          .inspectDirectory(subdirPath)
          .forEach(f => files.push(f))
    );
    return files;
  }

  // Watcher constructor
  //  dir - <string>, directory to watch
  //  options - <Object>
  //    ignore - <RegExp>, regexp for file names
  //              which should be ignored
  constructor(dir, options = {}) {
    Watcher.checkExists(dir);
    super();
    this.dir = dir;
    this.ignore = options.ignore || null;
    this.watchers = [];
  }

  // Start watching file system
  watch() {
    this.watchingFiles = new Set();
    Watcher.inspectDirectory(this.dir).forEach(this.addFile.bind(this));

    this.createWatcher = new CreateWatcher(this.dir);
    this.createWatcher.watch();

    this.createWatcher.on('create', (file, data) => {
      if (this.ignored(file)) return;
      this.addFile(file);
      this.emit('create', file, data);
    });

    this.createWatcher.on('delete', file => {
      if (this.ignored(file)) return;
      this.watchingFiles.delete(file);
      this.emit('delete', file);
    });
  }

  // Add file and start watching it
  addFile(file) {
    if (this.ignored(file)) return;
    this.watchingFiles.add(file);
    const w = Watcher.watchFile(file, data => this.emit('change', file, data));
    this.watchers.push(w);
  }

  // Stop watcher
  stop() {
    this.createWatcher.stop();
    this.watchers.forEach(w => w.close());
  }

  // Check whether file matches ignored regexp
  //   file - <string>, path
  // Returns: <boolean>
  ignored(file) {
    return file.match(this.ignore);
  }
}

module.exports = Watcher;

