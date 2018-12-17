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
const update = (p, data, cb) => fs.writeFile(p, data, cb);

// Read file subsystem
//   p - <string>, directory path
//   cb - <Function>, callback
// Returns: <Object>
//   path - <string>
//   files - <string[]>,
//   children - <Map>
const readFileSubsystem = (p, cb) =>
  fs.readdir(p, { withFileTypes: true }, (err, items) => {
    const files =
      items
        .filter(de => de.isFile())
        .map(de => path.join(p, de.name));

    const directories =
      items
        .filter(de => de.isDirectory())
        .map(de => path.join(p, de.name));

    const fetchFilesData = cb =>
      metasync.map(
        files,
        (p, cb) => fs.readFile(p, (e, d) => cb(e, [p, d])),
        (err, filesdata) => {
          if (err) {
            cb(err);
            return;
          }
          cb(null, { files: filesdata });
        }
      );

    const fetchChildren = cb =>
      metasync.map(
        directories,
        readFileSubsystem,
        (err, nodes) => {
          if (err) {
            cb(err);
            return;
          }
          cb(null, { children: nodes });
        }
      );

    metasync.sequential([fetchFilesData, fetchChildren], { path: p }, cb);
  });

const replacePath = (p, targetSubpath, sourceSubpath) => {
  targetSubpath = targetSubpath.replace(/\.\//, '');
  sourceSubpath = sourceSubpath.replace(/\.\//, '');
  return p.replace(new RegExp(sourceSubpath), targetSubpath);
};

const buildNode = (node, targetPath, sourcePath, cb) => {
  const path = replacePath(node.path, targetPath, sourcePath);

  const files = node.files.map(([name, data]) => {
    const path = replacePath(name, targetPath, sourcePath);
    return [path, data];
  });

  const createFiles = cb =>
    metasync.each(
      files,
      ([path, data], cb) => create.file(path, data, cb),
      cb
    );

  const createChildren = cb =>
    metasync.each(
      node.children,
      (node, cb) => buildNode(node, targetPath, sourcePath, cb),
      cb
    );

  metasync.sequential([
    cb => create.dir(path, cb),
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
const buildFileSubsystem = (tree, targetPath, sourcePath, cb) => {
  const queue = [];
  const exists = fs.existsSync(targetPath);
  if (exists) queue.push(cb => remove.dir.recursive(targetPath, cb));
  queue.push(cb => buildNode(tree, targetPath, sourcePath, cb));
  metasync.sequential(queue, cb);
};

// Postprocess `JSON.parse`d buffer
//   obj - <Object>
//     type - <string>, 'Buffer'
//     data - <Uint8Array>
// Returns: <Buffer>
const postprocess = obj => Buffer.from(obj.data);

// Postrocess `JSON.parse`d tree
//   node - <Object>, tree root node
// Returns: <Object> processed tree
const postprocessTree = node => {
  node.files.forEach(file => file[1] = postprocess(file[1]));
  node.children.forEach(postprocessTree);
  return node;
};

module.exports = {
  create,
  update,
  remove,
  readFileSubsystem,
  buildFileSubsystem,
  postprocess,
  postprocessTree,
  replacePath,
};
