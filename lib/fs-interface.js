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
    .each(removeDir)
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

const remove = {
  file: removeFile,
  dir: removeDir,
};

// Create file
//   p - <string>, path
//   data - <Buffer>, initial data
//   cb - <Function>, callback
const createFile = (p, data, cb) => fs.writeFile(p, data, cb);

// Create directory
//   p - <string>, path
//   cb - <Function>, callback
const createDir = (p, cb) => fs.mkdir(p, { recursive: true }, cb);

const create = {
  file: createFile,
  dir: createDir,
};

// Update file
//   p - <string>, path
//   data - <Buffer>, new data
//   cb - <Function>, callback
const append = (p, data, cb) => fs.writeFile(p, data, { flag: 'a' }, cb);

module.exports = {
  create,
  append,
  remove,
  isDir,
  isFile,
};

