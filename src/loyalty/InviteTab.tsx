import { useState } from 'react';
import styles from './Loyalty.module.scss';
import { TEXTS } from './consts';
import type { CopyStatus } from './types';

export type InviteTabProps = {
  link: string;
};

export const InviteTab = ({ link }: InviteTabProps) => {
  const [copy, setCopy] = useState<CopyStatus>('idle');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  };

  return (
    <>
      <h1 className={styles.title}>{TEXTS.inviteTitle}</h1>
      <p className={styles.lead}>{TEXTS.inviteHint}</p>
      <p className={styles.link}>{link}</p>
      <button
        type="button"
        className={styles.action}
        onClick={() => void copyLink()}
      >
        {TEXTS.copyLink}
      </button>
      <p
        className={styles.hint}
        role="status"
      >
        {copy === 'copied' && TEXTS.linkCopied}
        {copy === 'failed' && TEXTS.copyFailed}
      </p>
    </>
  );
};
