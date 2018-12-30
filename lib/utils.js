'use strict';

const path = require('path');

const buildHierarchy = (items, directory) => {
  const hierarchy = {};
  const directories = items.filter(de => de.isDirectory()).map(de => de.name);
  const files = items.filter(de => de.isFile()).map(de => de.name);

  if (directory === './') directory = '.';
  if (directory.startsWith('./')) directory = directory.replace(/^\.\//, '');

  directories.unshift(directory);

  for (const dir of directories)
    hierarchy[dir] =
      files
        .filter(f => path.dirname(f) === dir)
        .map(f => f.replace(new RegExp(dir + '/'), ''));

  const keys = Object.keys(hierarchy);

  for (const key of keys) {
    const parent = keys.find(dir => path.dirname(key) === dir) || key;
    const subdir = key.replace(new RegExp(parent + '/'), '');
    if (key !== parent) hierarchy[parent].push({ [subdir]: hierarchy[key] });
  }

  const [root] = keys;
  return { [root]: hierarchy[root] };
};

const drawItems = (dir, prepend = '') => {
  const [dirname] = Object.keys(dir);
  const { [dirname]: items } = dir;
  let treeSlice = '';

  items.forEach((item, i) => {
    if (typeof item === 'object') {
      const [dirname] = Object.keys(item);
      const offset = i === items.length - 1 ? '     ' : '    |';
      const subdir = drawItems(item, prepend + offset);
      treeSlice += `\
${prepend}    |
${prepend}    |-- ${dirname}
${subdir}`;
    } else {
      treeSlice += `\
${prepend}    |
${prepend}    |-- ${item}
`;
    }
  });

  return treeSlice;
};


const drawTree = (dir, hierarchy) => `\
-- ${dir}
${drawItems(hierarchy)}`;

module.exports = {
  buildHierarchy,
  drawTree,
};
