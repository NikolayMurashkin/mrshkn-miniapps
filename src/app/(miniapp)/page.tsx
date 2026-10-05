import styles from './page.module.scss';

const HomePage = () => (
  <main className={styles.root}>
    <h1 className={styles.title}>Онлайн-запись</h1>
    <p className={styles.text}>Запись открывается в&nbsp;Telegram или MAX&nbsp;— по&nbsp;кнопке в&nbsp;чате бота.</p>
  </main>
);

export default HomePage;
