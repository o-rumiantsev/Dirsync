'use strict';

const fs = require('fs');
const path = require('path');
const metasync = require('metasync');

// Fetch stats
//   p - <string>, path
//   cb - <Function>, callback
// Returns: <fs.Stats> path stats
const stat = (p, cb) => fs.stat(p, cb);

// Identify whether path is directory
//   p - <string>, path
//   cb - <Function>, callback
// Returns: <boolean>
const isDir = (p, cb) => stat(p, (err, stat) => {
  if (err) {
    cb(err);
    return;
  }

  cb(null, stat.isDirectory());
});

// Identify whether path is file
//   p - <string>, path
//   cb - <Function>, callback
// Returns: <boolean>
const isFile = (p, cb) => stat(p, (err, stat) => {
  if (err) {
    cb(err);
    return;
  }

  cb(null, stat.isFile());
});

// Fetch directory content
//   p - <string>, path
//   cb - <Function>, callback
// Returns: <string[]> directory content
const readDir = (p, cb) => fs.readdir(p, (err, items) => {
  if (err) {
    cb(err);
    return;
  }

  const contents = items.map(s => path.join(p, s));
  cb(null, { contents });
});

// Remove file
//   p - <string>, path
//   cb - <Function>, callback
const removeFile = (p, cb) => fs.unlink(p, cb);

// Remove multiple files
//   contents - <string[]>, content of directory
//   cb - <Function>, callback
const removeFiles = (contents, cb) =>
  metasync.for(contents)
    .filter(isFile)
    .each(removeFile)
    .fetch(err => cb(err));

// Remove directory
//   p - <string>, path
//   cb - <Function>, callback
// Hint: remove only empty directory
const removeDir = (p, cb) => fs.rmdir(p, cb);

// Remove subdirectroies
//   contents - <string[]>, content of directory
//   cb - <Function>, callback
const removeSubdirectories = (contents, cb) =>
  metasync.for(contents)
    .filter(isDir)
    .each(removeDir.recursive)
    .fetch(err => cb(err));

// Remove directory recursively
//   p - <string>, path
//   cb - <Function>, callback
removeDir.recursive = (p, cb) =>
  metasync.sequential(
    [
      c => readDir(p, c),
      ({ contents }, c) => removeFiles(contents, c),
      ({ contents }, c) => removeSubdirectories(contents, c),
      c => removeDir(p, c),
    ],
    err => cb(err),
  );

const createDir = (p, cb) => fs.mkdir(p, { recursive: true }, cb);

const writable = p => fs.createWriteStream(p);
const readable = p => fs.createReadStream(p, { highWaterMark: 2 ** 14 });

// Read file subsystem
//   p - <string>, directory path
//   ignore - <RegExp>, regexp for ignored files
//   cb - <Function>, callback
// Returns: <Object>
//   path - <string>
//   files - <string[]>,
//   children - <Map>
const readFileSubsystem = (p, ignore, cb) =>
  fs.readdir(p, { withFileTypes: true }, (err, items) => {
    if (err) {
      cb(err);
      return;
    }

    items = items.filter(dirent => !dirent.name.match(ignore));

    const files =
      items
        .filter(de => de.isFile())
        .map(de => path.join(p, de.name));

    const directories =
      items
        .filter(de => de.isDirectory())
        .map(de => path.join(p, de.name));

    metasync.map(
      directories,
      (p, cb) => readFileSubsystem(p, ignore, cb),
      (err, children) => {
        if (err) {
          cb(err);
          return;
        }
        const node = {
          path: p,
          files,
          children,
        };
        cb(null, node);
      }
    );
  });

const replacePath = (p, targetSubpath, sourceSubpath) => {
  targetSubpath = targetSubpath.replace(/^\.\//, '');
  sourceSubpath = sourceSubpath.replace(/^\.\//, '');
  return path.join(targetSubpath, p.replace(new RegExp(sourceSubpath), ''));
};

const buildNode = (node, streams, targetPath, sourcePath, cb) => {
  const path = replacePath(node.path, targetPath, sourcePath);
  const files = node.files.map(([name, streamId]) => {
    const path = replacePath(name, targetPath, sourcePath);
    return [path, streamId];
  });

  const createFiles = cb =>
    metasync.each(
      files,
      ([path, streamId], cb) => {
        const readStream = streams.get(streamId);
        const writeStream = writable(path);
        readStream.pipe(writeStream);
        readStream.on('error', cb);
        readStream.on('end', cb);
      },
      cb
    );

  const createChildren = cb =>
    metasync.each(
      node.children,
      (node, cb) => buildNode(node, streams, targetPath, sourcePath, cb),
      cb
    );

  metasync.sequential([
    cb => createDir(path, cb),
    cb => createFiles(cb),
    cb => createChildren(cb),
  ], cb);
};

// Build file subsystem
//   tree - <Object>,
//     path - <string>
//     files - <string[]>
//     children - <Map>
//   targetPath - <string>
//   sourcePath - <string>
//   cb - <Function>, callback
const buildFileSubsystem = (tree, streams, targetPath, sourcePath, cb) => {
  const queue = [];
  const exists = fs.existsSync(targetPath);
  if (exists) queue.push(cb => removeDir.recursive(targetPath, cb));
  queue.push(cb => buildNode(tree, streams, targetPath, sourcePath, cb));
  metasync.sequential(queue, cb);
};

module.exports = {
  createDir,
  removeDir,
  removeFile,
  writable,
  readable,
  readFileSubsystem,
  buildFileSubsystem,
  replacePath,
};

