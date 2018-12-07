'use strict';

const { join } = require('path');
const metatests = require('metatests');
const { sequential } = require('metasync');
const fs = require('../lib/fs-interface');
const Watcher = require('../lib/watcher');

const dir = join(__dirname, 'fixtures/watcher');
const DELAY_TIMEOUT = 250;
const delay = fn => setTimeout(fn, DELAY_TIMEOUT);

const watcherTest = metatests.test('Watcher tests');

watcherTest.test('Watcher handle file creation', test => {
  const events = [];
  const watcher = new Watcher(dir);
  watcher.watch();

  watcher.on('create', (filename, data) => {
    events.push([filename, data]);
  });

  const create = (path, cb) => delay(() =>
    fs.create.file(join(dir, path), '', cb)
  );

  sequential([
    cb => create('file1.ext', cb),
    cb => create('file2.ext', cb),
    cb => create('file3.ext', cb),
    cb => create('file4.ext', cb),
    cb => create('file5.ext', cb),

    delay,
  ], err => {
    if (err) {
      console.error(err);
      return;
    }

    test.strictSame(events, [
      [join(dir, 'file1.ext'), Buffer.from('')],
      [join(dir, 'file2.ext'), Buffer.from('')],
      [join(dir, 'file3.ext'), Buffer.from('')],
      [join(dir, 'file4.ext'), Buffer.from('')],
      [join(dir, 'file5.ext'), Buffer.from('')]
    ]);

    watcher.stop();
    test.end();
  });
});

watcherTest.test('Watcher handle file change', test => {
  const events = [];
  const watcher = new Watcher(dir);
  watcher.watch();

  watcher.on('change', (filename, data) => {
    events.push([filename, data]);
  });

  const update = (path, data, cb) => delay(() =>
    fs.append(join(dir, path), data, cb)
  );

  sequential([
    cb => update('file1.ext', '__FILE_1_DATA__', cb),
    cb => update('file2.ext', '__FILE_2_DATA__', cb),
    cb => update('file3.ext', '__FILE_3_DATA__', cb),
    cb => update('file4.ext', '__FILE_4_DATA__', cb),
    cb => update('file5.ext', '__FILE_5_DATA__', cb),

    delay,
  ], err => {
    if (err) {
      console.error(err);
      return;
    }

    test.strictSame(events, [
      [join(dir, 'file1.ext'), Buffer.from('__FILE_1_DATA__')],
      [join(dir, 'file2.ext'), Buffer.from('__FILE_2_DATA__')],
      [join(dir, 'file3.ext'), Buffer.from('__FILE_3_DATA__')],
      [join(dir, 'file4.ext'), Buffer.from('__FILE_4_DATA__')],
      [join(dir, 'file5.ext'), Buffer.from('__FILE_5_DATA__')],
    ]);

    watcher.stop();
    test.end();
  });
});

watcherTest.test('Watcher handle file deletion', test => {
  const events = [];
  const watcher = new Watcher(dir);
  watcher.watch();
  watcher.on('delete', filename => events.push(filename));

  const remove = (path, cb) => delay(() =>
    fs.remove.file(join(dir, path), cb)
  );

  sequential([
    cb => remove('file1.ext', cb),
    cb => remove('file2.ext', cb),
    cb => remove('file3.ext', cb),
    cb => remove('file4.ext', cb),
    cb => remove('file5.ext', cb),

    delay,
  ], err => {
    if (err) {
      console.error(err);
      return;
    }

    test.strictSame(events, [
      join(dir, 'file1.ext'),
      join(dir, 'file2.ext'),
      join(dir, 'file3.ext'),
      join(dir, 'file4.ext'),
      join(dir, 'file5.ext'),
    ]);

    watcher.stop();
    test.end();
  });
});

watcherTest.test('Watcher ignore files', test => {
  const events = [];
  const watcher = new Watcher(dir, { ignore: /.*\.ignore$/ });
  watcher.watch();
  watcher.on('create', filename => events.push(['create', filename]));
  watcher.on('delete', filename => events.push(['delete', filename]));

  const create = (path, cb) => delay(() =>
    fs.create.file(join(dir, path), '', cb)
  );

  const remove = (path, cb) => delay(() =>
    fs.remove.file(join(dir, path), cb)
  );

  sequential([
    cb => create('file.ext', cb),
    cb => create('file.ignore', cb),

    cb => remove('file.ext', cb),
    cb => remove('file.ignore', cb),

    delay,
  ], err => {
    if (err) {
      console.error(err);
      return;
    }

    test.strictSame(events, [
      ['create', join(dir, 'file.ext')],
      ['delete', join(dir, 'file.ext')],
    ]);

    watcher.stop();
    test.end();
  });
});

watcherTest.test('Watcher handle create file with initial data', test => {
  const events = [];
  const watcher = new Watcher(dir);
  watcher.watch();
  watcher.on('create', (filename, data) =>
    events.push(['create', filename, data])
  );

  const create = (path, data, cb) => delay(() =>
    fs.create.file(join(dir, path), data, cb)
  );

  const remove = (path, cb) => delay(() =>
    fs.remove.file(join(dir, path), cb)
  );

  sequential([
    cb => create('file1.ext', '__FILE_1_DATA__', cb),
    cb => create('file2.ext', '__FILE_2_DATA__', cb),
    cb => create('file3.ext', '__FILE_3_DATA__', cb),
    cb => create('file4.ext', '__FILE_4_DATA__', cb),

    cb => remove('file1.ext', cb),
    cb => remove('file2.ext', cb),
    cb => remove('file3.ext', cb),
    cb => remove('file4.ext', cb),

    delay,
  ], err => {
    if (err) {
      console.error(err);
      return;
    }

    test.strictSame(events, [
      ['create', join(dir, 'file1.ext'), Buffer.from('__FILE_1_DATA__')],
      ['create', join(dir, 'file2.ext'), Buffer.from('__FILE_2_DATA__')],
      ['create', join(dir, 'file3.ext'), Buffer.from('__FILE_3_DATA__')],
      ['create', join(dir, 'file4.ext'), Buffer.from('__FILE_4_DATA__')],
    ]);

    watcher.stop();
    test.end();
  });
});
