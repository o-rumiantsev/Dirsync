'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const kInterval = Symbol('interval');

class CreateWatcher extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
  }

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
          this.emit('create', filepath);
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

  stop() {
    clearInterval(this[interval]);
    this[kInterval] = null;
  }
}

module.exports = CreateWatcher;

