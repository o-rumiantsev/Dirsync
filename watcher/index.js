'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const CreateWatcher = require('./create-watcher');

const EDIRNOTEXISTS = 'path does not exists not exists';

class WatchError extends Error {
  constructor(message, target) {
    super();
    this.name = 'WatchError';
    this.message = `${message}: ${target}`;
  }
}

class Watcher extends EventEmitter {
  static checkExists(path) {
    const exists = fs.existsSync(path);
    if (!exists) throw new WatchError(EDIRNOTEXISTS, path);
  }

  static watchFile(filename, onChange) {
    Watcher.checkExists(filename);
    const watcher = fs.watch(filename);
    let delayed = false;
    const delay = () => (delayed = true, setImmediate(() => (delayed = false)));
    const _onChange = event => {
      if (delayed) return;
      if (event !== 'change') return;
      onChange(filename);
      delay();
    };
    watcher.on('change', _onChange);
  }

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

  constructor(dir, options = {}) {
    Watcher.checkExists(dir);
    super();
    this.dir = dir;
    this.ignore = options.ignore || null;
  }

  watch() {
    this.watchingFiles = new Set();
    Watcher.inspectDirectory(this.dir).forEach(this.addFile.bind(this));

    this.createWatcher = new CreateWatcher(this.dir);
    this.createWatcher.watch();

    this.createWatcher.on('create', file => {
      if (this.ignored(file)) return;
      this.addFile(file);
      this.emit('create', file);
    });

    this.createWatcher.on('delete', file => {
      if (this.ignored(file)) return;
      this.watchingFiles.delete(file);
      this.emit('delete', file)
    });
  }

  addFile(file) {
    if (this.ignored(file)) return;
    this.watchingFiles.add(file);
    Watcher.watchFile(file, () => this.emit('change', file));
  }

  ignored(file) {
    return file.match(this.ignore);
  }
}

module.exports = Watcher;

