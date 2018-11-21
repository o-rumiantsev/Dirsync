'use strict';

const net = require('net');
const EventEmitter = require('events');
const parser = require('./parser');

const kBuffer = Symbol('buffer');
const kPosition = Symbol('position');
const kBytesToRead = Symbol('bytesToRead');
const kProcessData = Symbol('processData');

const INTERNAL_BUFFER_SIZE = 2 ** 16;

const extractLength = buffer => parser.parse(buffer).length;

class Connection extends EventEmitter {
  constructor(socket) {
    super();
    this.transport = socket;

    this[kPosition] = 0;
    this[kBuffer] = Buffer.alloc(INTERNAL_BUFFER_SIZE);
    this[kBytesToRead] = parser.PACKET_HEADER_SIZE;

    this.transport.on('data', this[kProcessData].bind(this));
  }

  [kProcessData](data) {
    if (data.length < this[kBytesToRead]) {
      this[kBytesToRead] -= data.length;
      this[kPosition] += data.copy(this[kBuffer], this[kPosition]);
    } else {
      this[kPosition] += data.copy(
        this[kBuffer], this[kPosition], 0, this[kBytesToRead]
      );

      const tail = data.slice(this[kBytesToRead]);
      const length = extractLength(this[kBuffer]);

      if (this[kPosition] === parser.PACKET_HEADER_SIZE + length) {
        this[kPosition] = 0;
        this[kBytesToRead] = parser.PACKET_HEADER_SIZE;
        const buffer =
          this[kBuffer].slice(0, parser.PACKET_HEADER_SIZE + length);
        const packet = parser.parse(buffer);
        this.emit('packet', packet);
      }

      this[kBytesToRead] =
        extractLength(this[kBuffer]) +
        parser.PACKET_HEADER_SIZE -
        this[kPosition];

      if (tail.length) this[kProcessData](tail);
    }
  }

  close() {
    this.transport.close();
  }
}

module.exports = Connection;
