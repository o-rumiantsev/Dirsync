'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const log = require('../log');

const kInterval = Symbol('interval');

// CreateWatcher class to watch files creation and deletion
class CreateWatcher extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
  }

  // Start watching file system
  watch() {
    const interval = msecs => fn => setInterval(fn, msecs);
    const everyMsec = interval(0);

    const compare = (prev, curr) => ({
      created: curr.filter(file => !prev.includes(file)),
      deleted: prev.filter(file => !curr.includes(file)),
    });

    this.files = fs.readdirSync(this.dir);
    this[kInterval] = everyMsec(() => {
      const currFiles = fs.readdirSync(this.dir);
      const stats = compare(this.files, currFiles);
      if (stats.created.length > 0) {
        stats.created.forEach(file => {
          const filepath = path.join(this.dir, file);
          fs.readFile(filepath, (err, data) => {
            if (err) {
              log.error(err.message);
              return;
            }
            this.emit('create', filepath, data);
          });
        });
      }
      if (stats.deleted.length > 0) {
        stats.deleted.forEach(file => {
          const filepath = path.join(this.dir, file);
          this.emit('delete', filepath);
        });
      }
      this.files = currFiles;
    });
  }

  // Stop watching
  stop() {
    clearInterval(this[kInterval]);
    this[kInterval] = null;
  }
}

module.exports = CreateWatcher;

