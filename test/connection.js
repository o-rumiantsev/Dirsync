'use strict';

const metatests = require('metatests');
const EventEmitter = require('events');
const Connection = require('../lib/connection');
const parser = require('../lib/parser');

const toPacket = (id, obj) => {
  const jsonStr = JSON.stringify(obj);
  const payload = Buffer.from(jsonStr);
  const length = payload.length;
  return parser.packet({ id, length, payload });
};

const split = (buffer, indexes) => {
  indexes.unshift(0);
  indexes.push(buffer.length);
  const parts = [];
  for (let i = 0; i < indexes.length - 1; ++i) {
    const curr = indexes[i];
    const next = indexes[i + 1];
    const size = next - curr;
    const part = Buffer.alloc(size);
    buffer.copy(part, 0, curr, next);
    parts.push(part);
  }
  return parts;
};

metatests.test('connection receive empty packet', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  connection.on('message', message => test.strictSame(message, {}));
  transport.emit('data', toPacket(1, {}));
  test.end();
});

metatests.test('connection receive one packet', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  connection.on('message', message =>
    test.strictSame(message, { data: '__DATA__' })
  );
  transport.emit('data', toPacket(1, { data: '__DATA__' }));
  test.end();
});

metatests.test('connection receive one packet split', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  connection.on('message', message =>
    test.strictSame(message, { data: '__DATA__' })
  );
  const packet = toPacket(1, { data: '__DATA__' });
  const [part1, part2, part3, part4] = split(packet, [2, 5, 8]);
  transport.emit('data', part1);
  transport.emit('data', part2);
  transport.emit('data', part3);
  transport.emit('data', part4);
  test.end();
});

metatests.test('connection receive multiple packets', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  const messages = [];
  connection.on('message', message => messages.push(message));
  const packet1 = toPacket(1, { data: 'PACKET1' });
  const packet2 = toPacket(2, { data: 'PACKET2' });
  const [part1, part2, part3] = split(packet2, [10, 20]);
  transport.emit('data', packet1);
  transport.emit('data', part1);
  transport.emit('data', part2);
  transport.emit('data', part3);
  test.strictSame(messages, [{ data: 'PACKET1' }, { data: 'PACKET2' }]);
  test.end();
});

metatests.test('connection send packets', test => {
  const tr1 = new EventEmitter();
  const tr2 = new EventEmitter();

  tr1.write = tr2.emit.bind(tr2, 'data');

  const conn1 = new Connection(tr1);
  const conn2 = new Connection(tr2);
  const messages = [];
  conn2.on('message', message => messages.push(message));

  conn1.send({ field: '1' });
  conn1.send({ field: '2' });
  conn1.send({ field: '3' });
  conn1.send({ field: '4' });
  conn1.send({ field: '5' });

  test.strictSame(messages, [
    { field: '1' },
    { field: '2' },
    { field: '3' },
    { field: '4' },
    { field: '5' },
  ]);

  test.end();
});

metatests.test('connection order packets', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  const messages = [];
  connection.on('message', message => messages.push(message));

  transport.emit('data', toPacket(3, { data: '3' }));
  transport.emit('data', toPacket(1, { data: '1' }));
  transport.emit('data', toPacket(4, { data: '4' }));
  transport.emit('data', toPacket(2, { data: '2' }));

  test.strictSame(messages, [
    { data: '1' },
    { data: '2' },
    { data: '3' },
    { data: '4' },
  ]);

  test.end();
});
