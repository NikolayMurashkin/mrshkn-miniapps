import * as migration_20261005_113624_initial from './20261005_113624_initial';

export const migrations = [
  {
    up: migration_20261005_113624_initial.up,
    down: migration_20261005_113624_initial.down,
    name: '20261005_113624_initial'
  },
];
