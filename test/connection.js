'use strict';

const metatests = require('metatests');
const EventEmitter = require('events');
const Connection = require('../lib/connection');

metatests.test('connection receive empty packet', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  connection.on('packet', packet =>
    test.strictSame(packet, { id: 1, length: 0, payload: Buffer.from([]) })
  );
  transport.emit('data', Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]));
  test.end();
});

metatests.test('connection receive one packet', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  connection.on('packet', packet =>
    test.strictSame(
      packet, { id: 1, length: 5, payload: Buffer.from([1, 2, 3, 4, 5]) }
    ),
  );
  transport.emit('data', Buffer.from([1, 0, 0, 0, 5, 0, 0, 0, 1, 2, 3, 4, 5]));
  test.end();
});

metatests.test('connection receive one packet split', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  connection.on('packet', packet =>
    test.strictSame(packet, {
      id: 1,
      length: 10,
      payload: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    }),
  );
  transport.emit('data', Buffer.from([1, 0, 0, 0, 10, 0, 0, 0]));
  transport.emit('data', Buffer.from([1, 2, 3, 4, 5]));
  transport.emit('data', Buffer.from([6, 7, 8, 9, 10]));
  test.end();
});

metatests.test('connection receive multiple packets', test => {
  const transport = new EventEmitter();
  const connection = new Connection(transport);
  const packets = [];
  connection.on('packet', packet => packets.push(packet));
  transport.emit('data', Buffer.from([1, 0, 0, 0, 0, 0, 0, 0]));
  transport.emit('data', Buffer.from([2, 0, 0, 0, 5]));
  transport.emit('data', Buffer.from([0, 0, 0, 1, 2, 3, 4, 5]));
  test.strictSame(packets, [
    { id: 1, length: 0, payload: Buffer.from([]) },
    { id: 2, length: 5, payload: Buffer.from([1, 2, 3, 4, 5]) },
  ]);
  test.end();
});

