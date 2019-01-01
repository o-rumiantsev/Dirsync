'use strict';

const fs = require('fs');
const EventEmitter = require('events');

const DEFAULT_WATCH_INTERVAL = 1000;

const kInterval = Symbol('interval');

const compareStats = (prevStats, curStats) => {
  if (!prevStats) return false;
  const prevMTime = prevStats.mtimeMs;
  const curMTime = curStats.mtimeMs;
  return curMTime !== prevMTime;
};

// StateWatcher class to observe file modification
// * Events:
// *   update - file updated
// *     stream - <Readable>, file stream
// *   remove - file removed
class StateWatcher extends EventEmitter {

  // ChangeWatcher constructor
  //   filename - <string>, path
  //   interval - <number>, lookup interval in milliseconds
  constructor(filename, interval = DEFAULT_WATCH_INTERVAL) {
    super();
    this.filename = filename;
    this.prevStats = null;
    this.interval = interval;
    this[kInterval] = null;
  }

  // Start watching file
  watch() {
    this.lookup();
    this.setInterval(this.interval);
  }

  // Stop watching file
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

  // Fetch file stats and identify changes
  lookup() {
    if (!this.accessible()) {
      this.stopInterval();
      this.emit('unaccessible');
      return;
    }
    const exists = fs.existsSync(this.filename);
    if (!exists) {
      this.stopInterval();
      this.emit('remove');
      return;
    }
    const { prevStats } = this;
    const curStats = fs.statSync(this.filename, { bigint: true });
    const modified = compareStats(prevStats, curStats);
    this.prevStats = curStats;
    if (!modified) return;
    const stream = fs.createReadStream(
      this.filename, { highWaterMark: 2 ** 14 }
    );
    this.emit('update', stream);
  }

  // Check whether file is accessible
  // Returns: <boolean>
  accessible() {
    try {
      fs.accessSync(this.filename);
      return true;
    } catch (e) {
      return false;
    }
  }

}

module.exports = StateWatcher;
