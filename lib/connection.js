'use strict';

const net = require('net');
const EventEmitter = require('events');
const parser = require('./parser');

const kPacketId = Symbol('packetId');
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

    this[kPacketId] = 1;
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
        const size = parser.PACKET_HEADER_SIZE + length;
        const buffer = Buffer.alloc(size);
        this[kBuffer].copy(buffer, 0, 0, size);
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

  send(data) {
    const id = this[kPacketId]++;
    const jsonData = JSON.stringify(data);
    const payload = Buffer.from(jsonData);
    const length = payload.length;
    const packet = parser.packet({ id, length, payload });
    this.transport.write(packet);
  }

  close() {
    this.transport.close();
  }
}

module.exports = Connection;
