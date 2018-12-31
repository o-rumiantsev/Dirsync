'use strict';

const fs = require('fs');
const EventEmitter = require('events');
const metasync = require('metasync');
const { inspectDirectory } = require('./utils');

const DEFAULT_WATCH_INTERVAL = 1000;

const kInterval = Symbol('interval');

const compareFiles = (prevFiles, curFiles) => {
  if (!prevFiles) return [];
  const prevIndex = new Map(prevFiles.map(dirent => [dirent.name, dirent]));
  const curIndex = new Map(curFiles.map(dirent => [dirent.name, dirent]));
  const created = curFiles.filter(dirent => !prevIndex.has(dirent.name));
  const removed = prevFiles.filter(dirent => !curIndex.has(dirent.name));
  return [
    {
      directories: created.filter(de => de.isDirectory()),
      files: created.filter(de => de.isFile()),
    },
    {
      directories: removed.filter(de => de.isDirectory()),
      files: removed.filter(de => de.isFile()),
    }
  ];
};

// LifetimeWatcher class to watch files creation and deletion.
// * Events:
// *   create - file or directory created
// *     dirent - <fs.Dirent>, directory or file dirent
// *     stream - <Readable>, optional file stream if dirent arg is file
// *   remove - file or directory removed
// *     dirent - <fs.Dirent>, directory or file dirent
class LifetimeWatcher extends EventEmitter {

  // CreateWatcher constructor
  //   dir - <string>, path to directory
  //   options - <Object>
  //     ignore - <RegExp>, regexp for file names which should be ignored
  //     interval - <number>, lookup interval in milliseconds
  constructor(dir, options) {
    super();
    this.dir = dir;
    this.prevFiles = null;
    this.ignore = options.ignore;
    this.interval = options.interval || DEFAULT_WATCH_INTERVAL;
    this[kInterval] = null;
  }

  // Start watching
  watch() {
    this.lookup();
    this.setInterval(this.interval);
  }

  // Stop watching
  unwatch() {
    this.stopInterval();
  }

  // Set watching interval
  //   milliseconds - <number>, watching interval
  setInterval(milliseconds) {
    this.interval = milliseconds;
    if (this[kInterval]) clearInterval(this[kInterval]);
    this[kInterval] = setInterval(
      () => this.lookup(),
      this.interval
    );
  }

  // Stop timer
  stopInterval() {
    clearInterval(this[kInterval]);
    this[kInterval] = null;
  }

  // Inspect file system to identify created and removed entities
  lookup() {
    const { prevFiles } = this;
    const curFiles = inspectDirectory(this.dir, this.ignore);
    const [created, removed] = compareFiles(prevFiles, curFiles);
    this.prevFiles = curFiles;

    if (!prevFiles) return;

    removed.files.forEach(de => this.emit('remove', de));
    removed.directories.reverse().forEach(de => this.emit('remove', de));

    created.directories.forEach(de => this.emit('create', de));

    created.files.forEach(de => {
      const stream = fs.createReadStream(de.name, { highWaterMark: 2 ** 14 });
      this.emit('create', de, stream);
    });
  }

}

module.exports = LifetimeWatcher;
