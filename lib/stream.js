'use strict';

const { Readable } = require('stream');

const partBuffer = (buffer, size = 2048) => {
  const parts = [];
  const count = Math.ceil(buffer.length / size);
  let position = 0;

  for (let i = 0; i < count; ++i) {
    const part = Buffer.from(buffer.slice(position, position + size));
    parts.push(part);
    position += size;
  }

  return parts;
};

const readableStream = buffer => {
  const stream = new Readable();
  stream._read = () => {};
  if (buffer) {
    partBuffer(buffer).forEach(part => stream.push(part));
    stream.push(null);
  }
  return stream;
};

module.exports = {
  readableStream,
};
