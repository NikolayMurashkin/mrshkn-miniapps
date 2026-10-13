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

/** Вымышленное меню кофейни из демо студии: копия на момент засева, дальше правится в админке. */
export const DEMO_MENU = [
  { name: 'Эспрессо', description: '60 мл, двойной', price: 160, category: 'coffee' },
  { name: 'Американо', description: '300 мл', price: 190, category: 'coffee' },
  { name: 'Капучино', description: '250 мл', price: 260, category: 'coffee' },
  { name: 'Флэт уайт', description: '200 мл, двойной эспрессо', price: 290, category: 'coffee' },
  { name: 'Латте на овсяном', description: 'овсяное молоко, 300 мл', price: 300, category: 'coffee' },
  { name: 'Раф ванильный', description: 'сливки и ванильный сахар, 300 мл', price: 330, category: 'coffee' },
  { name: 'Капучино без кофеина', description: '250 мл', price: 280, category: 'coffee' },
  { name: 'Сенча', description: 'зеленый чай, чайник 400 мл', price: 220, category: 'tea' },
  { name: 'Матча-латте на овсяном', description: 'овсяное молоко, 300 мл', price: 340, category: 'tea' },
  { name: 'Какао', description: 'молоко, 300 мл', price: 250, category: 'tea' },
  { name: 'Имбирный чай с облепихой', description: 'имбирь, облепиха, апельсин, 400 мл', price: 240, category: 'tea' },
  { name: 'Круассан', description: 'на сливочном масле', price: 190, category: 'bakery' },
  { name: 'Булочка с корицей', description: 'корица и сливочный крем', price: 230, category: 'bakery' },
  { name: 'Печенье с финиками', description: 'финики и овсяная мука', price: 160, category: 'bakery' },
  { name: 'Сырники со сметаной', description: 'три штуки, сметана и ягоды', price: 390, category: 'breakfast' },
  { name: 'Гранола с ягодами на овсяном', description: 'овсяный йогурт и ягоды', price: 360, category: 'breakfast' },
] as const;
