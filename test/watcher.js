'use strict';

const { join } = require('path');
const metatests = require('metatests');
const { sequential } = require('metasync');
const fs = require('../lib/fs-interface');
const Watcher = require('../lib/watcher');

const dir = join(__dirname, 'fixtures/watcher');
const watcherTest = metatests.test('Watcher tests');

watcherTest.test('Watcher watch and unwatch', test => {
  const watcher = new Watcher(dir);
  watcher.watch();
  watcher.unwatch();
  test.end();
});

watcherTest.test('Watcher handle file create', test => {
  const events = [];
  const watcher = new Watcher(dir, { lifetimeWatchInterval: 10 });
  watcher.watch();

  watcher.on('create', (de, data) => {
    events.push([de.name, data]);
  });

  const create = (path, cb) => fs.create.file(join(dir, path), '', cb);

  sequential([
    cb => setTimeout(cb, 50),

    cb => create('file1.ext', cb),
    cb => create('file2.ext', cb),
    cb => create('file3.ext', cb),
    cb => create('file4.ext', cb),
    cb => create('file5.ext', cb),

    cb => setTimeout(cb, 50),
  ], err => {
    test.error(err);

    test.strictSame(events, [
      [join(dir, 'file1.ext'), Buffer.from('')],
      [join(dir, 'file2.ext'), Buffer.from('')],
      [join(dir, 'file3.ext'), Buffer.from('')],
      [join(dir, 'file4.ext'), Buffer.from('')],
      [join(dir, 'file5.ext'), Buffer.from('')]
    ]);

    watcher.unwatch();
    test.end();
  });
});

watcherTest.test('Watcher handle file update', test => {
  const events = [];
  const watcher = new Watcher(dir, { stateWatchInterval: 10 });
  watcher.watch();
  watcher.on('update', (filename, data) => events.push([filename, data]));

  const update = (path, data, cb) => fs.append(join(dir, path), data, cb);

  sequential([
    cb => setTimeout(cb, 50),

    cb => update('file1.ext', '__FILE_1_DATA__', cb),
    cb => update('file2.ext', '__FILE_2_DATA__', cb),
    cb => update('file3.ext', '__FILE_3_DATA__', cb),
    cb => update('file4.ext', '__FILE_4_DATA__', cb),
    cb => update('file5.ext', '__FILE_5_DATA__', cb),

    cb => setTimeout(cb, 50),
  ], err => {
    test.error(err);

    test.strictSame(events, [
      [join(dir, 'file1.ext'), Buffer.from('__FILE_1_DATA__')],
      [join(dir, 'file2.ext'), Buffer.from('__FILE_2_DATA__')],
      [join(dir, 'file3.ext'), Buffer.from('__FILE_3_DATA__')],
      [join(dir, 'file4.ext'), Buffer.from('__FILE_4_DATA__')],
      [join(dir, 'file5.ext'), Buffer.from('__FILE_5_DATA__')],
    ]);

    watcher.unwatch();
    test.end();
  });
});

watcherTest.test('Watcher handle file remove', test => {
  const events = [];
  const watcher = new Watcher(dir, { lifetimeWatchInterval: 10 });
  watcher.watch();
  watcher.on('remove', de => events.push(de.name));

  const remove = (path, cb) => fs.remove.file(join(dir, path), cb);

  sequential([
    cb => setTimeout(cb, 50),

    cb => remove('file1.ext', cb),
    cb => remove('file2.ext', cb),
    cb => remove('file3.ext', cb),
    cb => remove('file4.ext', cb),
    cb => remove('file5.ext', cb),

    cb => setTimeout(cb, 50),
  ], err => {
    test.error(err);

    test.strictSame(events, [
      join(dir, 'file1.ext'),
      join(dir, 'file2.ext'),
      join(dir, 'file3.ext'),
      join(dir, 'file4.ext'),
      join(dir, 'file5.ext'),
    ]);

    watcher.unwatch();
    test.end();
  });
});

watcherTest.test('Watcher ignore files', test => {
  const events = [];
  const watcher = new Watcher(dir, {
    ignore: /\.ignore$/,
    lifetimeWatchInterval: 1,
  });
  watcher.watch();
  watcher.on('create', de => events.push(['create', de.name]));
  watcher.on('remove', de => events.push(['remove', de.name]));

  const create = (path, cb) => fs.create.file(join(dir, path), '', cb);
  const remove = (path, cb) => fs.remove.file(join(dir, path), cb);

  sequential([
    cb => setTimeout(cb, 10),

    cb => create('file.ext', cb),
    cb => create('file.ignore', cb),

    cb => setTimeout(cb, 10),

    cb => remove('file.ext', cb),
    cb => remove('file.ignore', cb),

    cb => setTimeout(cb, 10),
  ], err => {
    test.error(err);

    test.strictSame(events, [
      ['create', join(dir, 'file.ext')],
      ['remove', join(dir, 'file.ext')],
    ]);

    watcher.unwatch();
    test.end();
  });
});

watcherTest.test('Watcher handle create file with initial data', test => {
  const events = [];
  const watcher = new Watcher(dir, { lifetimeWatchInterval: 1 });
  watcher.watch();
  watcher.on('create', (de, data) => events.push([de.name, data]));

  const create = (path, data, cb) => fs.create.file(join(dir, path), data, cb);
  const remove = (path, cb) => fs.remove.file(join(dir, path), cb);

  sequential([
    cb => setTimeout(cb, 10),

    cb => create('file1.ext', '__FILE_1_DATA__', cb),
    cb => create('file2.ext', '__FILE_2_DATA__', cb),
    cb => create('file3.ext', '__FILE_3_DATA__', cb),
    cb => create('file4.ext', '__FILE_4_DATA__', cb),

    cb => setTimeout(cb, 10),

    cb => remove('file1.ext', cb),
    cb => remove('file2.ext', cb),
    cb => remove('file3.ext', cb),
    cb => remove('file4.ext', cb),

    cb => setTimeout(cb, 10),
  ], err => {
    test.error(err);

    test.strictSame(events, [
      [join(dir, 'file1.ext'), Buffer.from('__FILE_1_DATA__')],
      [join(dir, 'file2.ext'), Buffer.from('__FILE_2_DATA__')],
      [join(dir, 'file3.ext'), Buffer.from('__FILE_3_DATA__')],
      [join(dir, 'file4.ext'), Buffer.from('__FILE_4_DATA__')],
    ]);

    watcher.unwatch();
    test.end();
  });
});

watcherTest.test('Watcher handle dir create', test => {
  const revents = [];
  const cevents = [];
  const watcher = new Watcher(dir, { lifetimeWatchInterval: 1 });
  watcher.watch();
  watcher.on('create', de => cevents.push(['create', de.name]));
  watcher.on('remove', de => revents.push(['remove', de.name]));

  const createDir = (path, cb) => fs.create.dir(join(dir, path), cb);
  const remove = (path, cb) => fs.remove.dir.recursive(join(dir, path), cb);

  sequential([
    cb => setTimeout(cb, 50),

    cb => createDir('subdir1', cb),
    cb => createDir('subdir2', cb),
    cb => createDir('subdir3', cb),

    cb => setTimeout(cb, 50),

    cb => remove('subdir1', cb),
    cb => remove('subdir2', cb),
    cb => remove('subdir3', cb),

    cb => setTimeout(cb, 50),
  ], err => {
    test.error(err);

    cevents.sort((e1, e2) => e2[1] > e1[1] ? -1 : 1);
    revents.sort((e1, e2) => e2[1] > e1[1] ? -1 : 1);

    const events = cevents.concat(revents);

    test.strictSame(events, [
      ['create', join(dir, 'subdir1')],
      ['create', join(dir, 'subdir2')],
      ['create', join(dir, 'subdir3')],
      ['remove', join(dir, 'subdir1')],
      ['remove', join(dir, 'subdir2')],
      ['remove', join(dir, 'subdir3')],
    ]);

    watcher.unwatch();
    test.end();
  });
});
