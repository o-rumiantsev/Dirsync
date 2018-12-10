'use strict';

const EventEmitter = require('events');
const parser = require('./parser');

const kPacketId = Symbol('packetId');
const kBuffer = Symbol('buffer');
const kPosition = Symbol('position');
const kBytesToRead = Symbol('bytesToRead');
const kNextId = Symbol('nextId');
const kPool = Symbol('pool');

const processData = Symbol('processData');
const processPacket = Symbol('processPacket');
const inspectPool = Symbol('walkPool');

const INTERNAL_BUFFER_SIZE = 2 ** 16;

const extractLength = buffer => parser.parse(buffer).length;

// Connection class for handling data transferring through the TCP
// connection between sockets. It is responsible for collecting chunks
// split by TCP into packets and for emitting packets in straight order.
class Connection extends EventEmitter {
  constructor(socket) {
    super();
    this.transport = socket;

    this[kPacketId] = 1;
    this[kPosition] = 0;
    this[kBuffer] = Buffer.alloc(INTERNAL_BUFFER_SIZE);
    this[kBytesToRead] = parser.PACKET_HEADER_SIZE;

    this[kNextId] = 1;
    this[kPool] = new Map();

    this.transport.on('data', this[processData].bind(this));
    this.transport.on('end', () => this.emit('close'));
    this.transport.on('error', err => this.emit('error', err));
  }

  // Process data emitted by net.Socket
  //   data - <Buffer>, buffer containing packets
  [processData](data) {
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
        this[processPacket](packet);
      }

      this[kBytesToRead] =
        extractLength(this[kBuffer]) +
        parser.PACKET_HEADER_SIZE -
        this[kPosition];

      if (tail.length) this[processData](tail);
    }
  }

  // Process packet. Push it to a pool if its id isn't next expected
  //   packet - <Object>
  //     id - <number>, packet id
  //     length - <number>, payload length
  //     payload - <Buffer>, payload
  [processPacket](packet) {
    if (packet.id !== this[kNextId]) {
      this[kPool].set(packet.id, packet);
      return;
    }
    const data = packet.payload.toString() || '{}';
    const msg = JSON.parse(data);
    this.emit('message', msg);
    ++this[kNextId];
    this[inspectPool]();
  }

  // Walk through the pool of packets to find next expected packet
  [inspectPool]() {
    const packet = this[kPool].get(this[kNextId]);
    if (packet) this[processPacket](packet);
  }

  // Send data
  //   data - <Object>, data to send
  //   callback - <Function>, optional, executes, when data is sent
  send(data, callback) {
    const id = this[kPacketId]++;
    const jsonData = JSON.stringify(data);
    const payload = Buffer.from(jsonData);
    const length = payload.length;
    const packet = parser.packet({ id, length, payload });
    this.transport.write(packet, callback);
  }

  // Close connection
  close() {
    this.transport.end();
  }
}

module.exports = Connection;
