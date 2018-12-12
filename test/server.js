'use strict';

const net = require('net');
const metatests = require('metatests');
const metasync = require('metasync');
const { join } = require('path');
const Server = require('../lib/server');
const Connection = require('../lib/connection');
const { inspectDirectory } = require('../lib/watcher/utils');
const { readFileSubsystem } = require('../lib/fs-interface');

const dir = join(__dirname, 'fixtures/watcher');
const connectionOptions = {
  port: 8080,
  host: 'localhost',
};

const serverTest = metatests.test('Server tests');

serverTest.test('Server starts and stops', test => {
  const events = [];
  const server = new Server({ dir });

  const startServer = cb => server.start(cb);
  const stopServer = cb => server.stop(cb);

  server.on('start', () => events.push('started'));
  server.on('stop', () => events.push('stopped'));

  metasync.sequential(
    [startServer, stopServer],
    err => {
      test.error(err);
      test.strictSame(events, ['started', 'stopped']);
      test.end();
    }
  );
});

serverTest.test('Server accepts connection', test => {
  const server = new Server({ dir });
  const socket1 = new net.Socket();
  const socket2 = new net.Socket();

  const startServer = cb => server.start(cb);
  const stopServer = cb => server.stop(cb);
  const end = (socket, cb) => socket.end(cb);
  const closeConnections = cb => metasync.each([socket1, socket2], end, cb);
  const connect = (socket, cb) =>
    socket.connect(connectionOptions, () => cb(null, socket));
  const createConnections = cb => metasync.map(
    [socket1, socket2],
    connect,
    (err, connections) => {
      test.strictSame(connections.length, server.connections.size);
      cb(err);
    }
  );

  metasync.sequential(
    [startServer, createConnections, closeConnections, stopServer],
    err => {
      test.error(err);
      test.end();
    }
  );
});

serverTest.test('Server on sync', test => {
  const serverEvents = [];
  const server = new Server({ dir });
  const socket = new net.Socket();
  const connection = new Connection(socket);

  const startServer = ({ server }, cb) => server.start(cb);
  const stopServer = ({ server }, cb) => server.stop(cb);
  const closeConnection = ({ connection }, cb) => connection.transport.end(cb);
  const createConnection = ({ connection }, cb) =>
    connection.transport.connect(connectionOptions, cb);
  const requestSync = ({ connection }, cb) =>
    connection.send({ event: 'sync' }, cb);
  const onSync = ({ connection }, cb) =>
    connection.on('message', message => cb(null, { syncMessage: message }));
  const readSubsystem = (context, cb) =>
    readFileSubsystem(dir, (err, fileSubsystem) => {
      if (err) {
        cb(err);
        return;
      }
      cb(null, { fileSubsystem });
    });

  server.on('connection', conn => serverEvents.push('connection'));
  server.on('sync', () => serverEvents.push('sync'));

  const series = metasync([
    startServer,
    createConnection,
    [[requestSync, onSync, readSubsystem]],
    closeConnection,
    stopServer,
  ]);

  series(
    { connection, server },
    (err, data) => {
      test.error(err);
      const { fileSubsystem } = data;
      test.strictSame(serverEvents, ['connection', 'sync']);
      test.strictSame(data.syncMessage, { event: 'sync', data: fileSubsystem });
      test.end();
    }
  );
});

serverTest.test('Server on inspect', test => {
  const serverEvents = [];
  const server = new Server({ dir });
  const socket = new net.Socket();
  const connection = new Connection(socket);

  const startServer = ({ server }, cb) => server.start(cb);
  const stopServer = ({ server }, cb) => server.stop(cb);
  const closeConnection = ({ connection }, cb) => connection.transport.end(cb);
  const createConnection = ({ connection }, cb) =>
    connection.transport.connect(connectionOptions, cb);
  const requestInspect = ({ connection }, cb) =>
    connection.send({ event: 'inspect' }, cb);
  const onInspect = ({ connection }, cb) =>
    connection.on('message', message => cb(null, { inspectMessage: message }));

  server.on('connection', conn => serverEvents.push('connection'));
  server.on('inspect', () => serverEvents.push('inspect'));

  const series = metasync([
    startServer,
    createConnection,
    [[requestInspect, onInspect]],
    closeConnection,
    stopServer,
  ]);

  series(
    { connection, server },
    (err, data) => {
      test.error(err);

      const files = inspectDirectory(dir);
      const expectedInspectMessage = { event: 'inspect', data: files };

      test.strictSame(serverEvents, ['connection', 'inspect']);
      test.strictSame(data.inspectMessage, expectedInspectMessage);
      test.end();
    }
  );
});
