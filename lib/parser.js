'use strict';

const PACKET_HEADER_SIZE = 8;

const parse = buffer => {
  const id = buffer.readIntLE(0, 4);
  const length = buffer.readIntLE(4, 4);
  const payload = buffer.slice(PACKET_HEADER_SIZE, PACKET_HEADER_SIZE + length);
  return { id, length, payload };
};

const packet = object => {
  const size = PACKET_HEADER_SIZE + object.length;
  const buffer = Buffer.alloc(size);
  buffer.writeIntLE(object.id, 0, 4);
  buffer.writeIntLE(object.length, 4, 4);
  object.payload.copy(buffer, 8, 0, object.length);
  return buffer;
};

module.exports = {
  parse,
  packet,
  PACKET_HEADER_SIZE,
};
