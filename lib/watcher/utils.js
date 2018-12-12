'use strict';

const fs = require('fs');
const { join } = require('path');

// Inspect directory recursively
//   directory - <string>, path to directory
//   ignore - <RegExp>, regexp for file names which should be ignored
//   entities - <fs.Dirent[]>, array of already inspected files and directories
// Returns: <fs.Dirent[]>, array of items inside directory
const inspectDirectory = (directory, ignore = null, entities = []) => {
  const items =
    fs
      .readdirSync(directory, { withFileTypes: true })
      .filter(dirent => !dirent.name.match(ignore));

  items
    .filter(item => item.isFile())
    .forEach(dirent => {
      dirent.name = join(directory, dirent.name);
      entities.push(dirent);
    });

  const directories = items.filter(item => item.isDirectory());
  if (!directories.length) return entities;

  directories.forEach(dirent => {
    dirent.name = join(directory, dirent.name);
    entities.push(dirent);
    inspectDirectory(dirent.name, ignore, entities);
  });

  return entities;
};

module.exports = {
  inspectDirectory,
};
