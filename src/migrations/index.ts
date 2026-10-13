import * as migration_20261005_113624_initial from './20261005_113624_initial';
import * as migration_20261012_081435_loyalty_menu from './20261012_081435_loyalty_menu';

export const migrations = [
  {
    up: migration_20261005_113624_initial.up,
    down: migration_20261005_113624_initial.down,
    name: '20261005_113624_initial',
  },
  {
    up: migration_20261012_081435_loyalty_menu.up,
    down: migration_20261012_081435_loyalty_menu.down,
    name: '20261012_081435_loyalty_menu'
  },
];
