'use strict';

const metatests = require('metatests');
const metasync = require('metasync');
const { join } = require('path');
const Server = require('../lib/server');
const Client = require('../lib/client');
const { inspectDirectory } = require('../lib/watcher/utils');

const url = 'tcp://localhost:9001';
const dir = join(__dirname, 'fixtures/watcher');
const clientTest = metatests.test('Client tests');

clientTest.test('Client connect and stop', test => {
  const expectedEvents = ['started', 'connected', 'disconnected', 'stopped'];
  const events = [];
  const client = new Client();
  const server = new Server({ port: 9001, dir });

  const startServer = cb => server.start(cb);
  const stopServer = cb => server.stop(cb);
  const clientConnect = cb => {
    client.on('connect', () => {
      events.push('connected');
      cb();
    });
    client.connect(url);
  };
  const clientStop = cb => {
    client.on('close', () => {
      events.push('disconnected');
      cb();
    });
    client.close();
  };

  server.on('start', () => events.push('started'));
  server.on('stop', () => events.push('stopped'));

  metasync.sequential(
    [startServer, clientConnect, clientStop, stopServer],
    err => {
      test.error(err);
      test.strictSame(events, expectedEvents);
      test.end();
    }
  );
});

clientTest.test('Client request sync', test => {
  const expectedEvents =
    ['started', 'connected', 'sync', 'disconnected', 'stopped'];
  const events = [];
  const client = new Client();
  const server = new Server({ port: 9001, dir });

  const startServer = cb => server.start(cb);
  const stopServer = cb => server.stop(cb);
  const clientConnect = cb => {
    client.on('connect', () => {
      events.push('connected');
      cb();
    });
    client.connect(url);
  };
  const clientStop = cb => {
    client.on('close', () => {
      events.push('disconnected');
      cb();
    });
    client.close();
  };
  const requestSync = cb => {
    client.on('sync', () => {
      events.push('sync');
      cb();
    });
    client.sync('./fixtures/sync', dir);
  };

  server.on('start', () => events.push('started'));
  server.on('stop', () => events.push('stopped'));

  metasync.sequential(
    [startServer, clientConnect, requestSync, clientStop, stopServer],
    err => {
      test.error(err);
      test.strictSame(events, expectedEvents);
      test.end();
    }
  );
});

clientTest.test('Client request inspect', test => {
  const expectedEvents =
    ['started', 'connected', 'inspect', 'disconnected', 'stopped'];
  const events = [];
  const client = new Client();
  const server = new Server({ port: 9001, dir });

  const startServer = cb => server.start(cb);
  const stopServer = cb => server.stop(cb);
  const clientConnect = cb => {
    client.on('connect', () => {
      events.push('connected');
      cb();
    });
    client.connect(url);
  };
  const clientStop = cb => {
    client.on('close', () => {
      events.push('disconnected');
      cb();
    });
    client.close();
  };
  const requestInspect = cb => {
    client.inspect(data => {
      events.push('inspect');
      cb(null, { data });
    });
  };

  server.on('start', () => events.push('started'));
  server.on('stop', () => events.push('stopped'));

  metasync.sequential(
    [startServer, clientConnect, requestInspect, clientStop, stopServer],
    (err, context) => {
      test.error(err);

      const expectedData = inspectDirectory(dir);

      test.strictSame(events, expectedEvents);
      test.strictSame(context.data, expectedData);
      test.end();
    }
  );
});

