'use strict';

const EventEmitter = require('events');

const StateWatcher = require('./state-watcher');
const LifetimeWatcher = require('./lifetime-watcher');
const { inspectDirectory } = require('./utils');

const addFile = Symbol('addFile');

// Watcher class to watch changes in file system
// * Events:
// *   create - file or directory created
// *     dirent - <fs.Dirent>, directory or file dirent
// *     data - <Buffer>, optional file data if dirent arg is file
// *   remove - file or directory removed
// *     dirent - <fs.Dirent>, directory or file dirent
// *   update - file updated
// *     path - <string>, path to updated file
// *     data - <Buffer>, file data
class Watcher extends EventEmitter {

  // Watcher constructor
  //  directory - <string>, directory to watch
  //  options - <Object>

  //    ignore - <RegExp>, regexp for file names which should be ignored
  //    stateWatchInterval - <number>, watch for update interval
  //    lifetimeWatchInterval - <number>, watch for create or remove interval
  constructor(directory, options = {}) {
    super();

    this.directory = directory;
    this.ignore = options.ignore;
    this.stateWatchInterval = options.stateWatchInterval;
    this.watchers = new Map();

    this.lifetimeWatcher = new LifetimeWatcher(directory, {
      ignore: options.ignore,
      interval: options.lifetimeWatchInterval
    });
  }

  // Start watching file system
  watch() {
    inspectDirectory(this.directory, this.ignore)
      .filter(de => de.isFile())
      .forEach(de => this[addFile](de));

    this.lifetimeWatcher.on('remove', dirent => this.emit('remove', dirent));
    this.lifetimeWatcher.on('create', (dirent, data) => {
      if (dirent.isFile()) this[addFile](dirent);
      this.emit('create', dirent, data);
    });
    this.lifetimeWatcher.watch();
  }

  // Stop watcher
  unwatch() {
    this.lifetimeWatcher.unwatch();
    this.watchers.forEach(watcher => watcher.unwatch());
    this.watchers.clear();
  }

  // Add file and start watching it
  //   dirent - <fs.Dirent>, file
  [addFile](dirent) {
    const filename = dirent.name;
    const sw = new StateWatcher(filename, this.stateWatchInterval);
    this.watchers.set(filename, sw);
    sw.on('update', data => this.emit('update', filename, data));
    sw.on('remove', () => this.watchers.delete(filename));
    sw.watch();
  }

}

module.exports = Watcher;
