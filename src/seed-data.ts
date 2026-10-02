/** Вымышленный салон для демо: названия и имена выдуманы. */
export const DEMO_SERVICES = [
  { name: 'Женская стрижка', durationMin: 60 },
  { name: 'Мужская стрижка', durationMin: 30 },
  { name: 'Окрашивание', durationMin: 120 },
  { name: 'Маникюр', durationMin: 90 },
];

export const DEMO_MASTERS = [
  {
    name: 'Алина Ветрова',
    serviceNames: ['Женская стрижка', 'Мужская стрижка', 'Окрашивание'],
    workdays: [1, 2, 3, 4, 5, 6],
    start: '10:00',
    end: '19:00',
    lunch: { start: '13:00', end: '14:00' },
  },
  {
    name: 'Игорь Лесной',
    serviceNames: ['Мужская стрижка', 'Маникюр'],
    workdays: [0, 2, 3, 4, 5, 6],
    start: '11:00',
    end: '20:00',
    lunch: { start: '14:00', end: '15:00' },
  },
];
