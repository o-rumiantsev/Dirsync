'use strict';

const PACKET_HEADER_SIZE = 8;

// Parse buffer containing packet
//   buffer - <Buffer>
// Returns: <Object>
//   id - <number>, packet id
//   length - <number>, payload length
//   payload - <Buffer>, packet payload
const parse = buffer => {
  const id = buffer.readIntLE(0, 4);
  const length = buffer.readIntLE(4, 4);
  const payload = buffer.slice(PACKET_HEADER_SIZE, PACKET_HEADER_SIZE + length);
  return { id, length, payload };
};

// Convert packet object to a buffer
//   object - <Object>, packet
//     id - <number>, packet id
//     length - <number>, payload length
//     payload - <Buffer>, packet payload
// Returns: <Buffer>
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
