'use strict';

const EventEmitter = require('events');
const { each } = require('metasync');
const parser = require('./parser');
const { readableStream } = require('./stream');

const kPacketId = Symbol('packetId');
const kStreamId = Symbol('streamId');
const kBuffer = Symbol('buffer');
const kPosition = Symbol('position');
const kBytesToRead = Symbol('bytesToRead');
const kNextId = Symbol('nextId');
const kPool = Symbol('pool');
const kStreamPools = Symbol('streamPools');
const kLongMessage = Symbol('longMessage');

const processData = Symbol('processData');
const processPacket = Symbol('processPacket');
const processLongMessage = Symbol('processLongMessage');
const processStream = Symbol('processStream');
const inspectPool = Symbol('inspectPool');
const inspectChunksPool = Symbol('inspectChunksPool');
const sendLongMessage = Symbol('sendLongMessage');

const INTERNAL_BUFFER_SIZE = 2 ** 16;
const MAX_MESSAGE_SIZE = 2 ** 14;
const LONG_MESSAGE_PART_SIZE = 2 ** 12;

const extractLength = buffer => parser.parse(buffer).length;

const toLongMessage = (string, size) => {
  const parts = [];
  const count = Math.ceil(string.length / size);
  let position = 0;
  for (let i = 0; i < count; ++i) {
    const data = string.substring(position, position + size);
    const part = {
      long: true,
      data
    };
    if (i === count - 1) part.last = true;
    parts.push(part);
    position += size;
  }
  return parts;
};

// Connection class for handling data transferring through the TCP
// connection between sockets. It is responsible for collecting chunks
// split by TCP into packets and for emitting packets in straight order.
class Connection extends EventEmitter {
  constructor(socket) {
    super();
    this.transport = socket;
    this.streams = new Map(); // streamId => stream

    this[kPacketId] = 1;
    this[kStreamId] = 1;
    this[kPosition] = 0;
    this[kBuffer] = Buffer.alloc(INTERNAL_BUFFER_SIZE);
    this[kBytesToRead] = parser.PACKET_HEADER_SIZE;

    this[kNextId] = 1;
    this[kLongMessage] = '';
    this[kPool] = new Map(); // packetId => packet
    this[kStreamPools] = new Map(); // streamId => { next, chunksPool }

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
      } else {
        this[kBytesToRead] =
          extractLength(this[kBuffer]) +
          parser.PACKET_HEADER_SIZE -
          this[kPosition];
      }

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
    this[kPool].delete(packet.id);
    ++this[kNextId];
    const data = packet.payload.toString() || '{}';
    const msg = JSON.parse(data);
    if (msg.streamId) {
      this[processStream](msg);
    } else if (msg.long) {
      this[processLongMessage](msg);
    } else {
      this.emit('message', msg);
    }
    this[inspectPool]();
  }

  // Process message which was parted because it is too long
  //   message - <Object>
  //     long - <boolean>, true
  //     data - <string>
  //     last - <boolean>, defines whether this is the last message
  [processLongMessage](message) {
    this[kLongMessage] += message.data;
    if (message.last) {
      const msg = JSON.parse(this[kLongMessage]);
      this.emit('message', msg);
      this[kLongMessage] = '';
    }
  }

  // Process message related to stream. Initialize new stream or
  // add new chunk to existing one.
  //   message - <Object>
  //     streamId - <number>
  //     open - <boolean>, optional, if it is an opening stream packet
  //     open - <boolean>, optional, if it is an closing stream packet
  //     order - <number>, optionsl, chunk order
  //     buffer - <Buffer>, optional, chunk buffer
  //     info - <Object>, additional info
  [processStream](message) {
    const { streamId, open, end, order, buffer, info } = message;
    if (open) {
      const stream = readableStream();
      this.streams.set(streamId, stream);
      const next = 1;
      const chunksPool = new Map(); // order => buffer;
      this[kStreamPools].set(streamId, { next, chunksPool });
      this.emit('stream', stream, info);
    } else if (end) {
      const stream = this.streams.get(streamId);
      stream.push(null);
    } else {
      const stream = this.streams.get(streamId);
      const pool = this[kStreamPools].get(streamId);
      const data = Buffer.from(buffer.data);
      this[inspectChunksPool](pool, stream, order, data);
    }
  }

  // Walk through the stream's chunks pool to find next expected chunk
  //   pool - <Object>
  //     next - <number>, order of next chunk
  //     chunksPool - <Map>, order => buffer
  //   stream - <Readable>
  //   order - <number>, order of current chunk
  //   buffer - <Buffer>, chunk's buffer
  [inspectChunksPool](pool, stream, order, buffer) {
    if (order !== pool.next) {
      pool.chunksPool.set(order, buffer);
      return;
    }

    stream.push(buffer);
    pool.chunksPool.delete(order);
    ++pool.next;
    const nextChunk = pool.chunksPool.get(pool.next);
    if (nextChunk) this[inspectChunksPool](pool, stream, pool.next, nextChunk);
  }

  // Walk through the pool of packets to find next expected packet
  [inspectPool]() {
    const packet = this[kPool].get(this[kNextId]);
    if (packet) this[processPacket](packet);
  }

  // Send payload which is too long for Connection internal buffer
  //   jsonData - <string>
  //   callback - <Function>
  [sendLongMessage](jsonData, callback = () => {}) {
    const parts = toLongMessage(jsonData, LONG_MESSAGE_PART_SIZE);
    each(parts, (part, cb) => this.send(part, cb), callback);
  }

  // Send data
  //   data - <Object>, data to send
  //   callback - <Function>, optional, executes, when data is sent
  send(data, callback) {
    const jsonData = JSON.stringify(data);
    if (jsonData.length >= MAX_MESSAGE_SIZE) {
      this[sendLongMessage](jsonData, callback);
      return;
    }
    const id = this[kPacketId]++;
    const payload = Buffer.from(jsonData);
    const length = payload.length;
    const packet = parser.packet({ id, length, payload });
    this.transport.write(packet, callback);
  }

  // Redirect readable stream through the network
  //   readable - <Readable>, source stream
  //   info - <Object>, additional info
  //   callback - <Function>, called when stream ended
  stream(readable, info, onEnd = () => {}) {
    if (typeof info === 'function') {
      onEnd = info;
      info = {};
    }
    const streamId = this[kStreamId]++;
    const streamOpening = { streamId, open: true, info };
    this.send(streamOpening);
    let order = 1;
    readable.on('data', buffer => {
      const streamChunk = { streamId, order: order++, buffer };
      this.send(streamChunk);
    });
    readable.on('end', () => {
      const streamClosing = { streamId, end: true };
      this.send(streamClosing, onEnd);
    });
    readable.on('error', onEnd);
    return streamId;
  };

  // Discover connection remote address.
  // Returns: <string>, host:port, remote address
  get address() {
    if (!this.transport || !this.transport.remoteAddress) return null;
    const remoteAddress = this.transport.remoteAddress;
    if (remoteAddress.includes(':')) return remoteAddress;
    const remotePort = this.transport.remotePort;
    return remoteAddress + ':' + remotePort;
  };

  // Close connection
  close() {
    this.transport.end();
  }
}

module.exports = Connection;
