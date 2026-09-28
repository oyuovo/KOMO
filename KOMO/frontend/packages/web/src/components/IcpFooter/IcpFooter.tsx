import styles from './IcpFooter.module.css';

// 管局要求：网站首页底部展示备案号并链接到工信部。备案号需与备案系统完全一致。
const ICP_NUMBER = '粤ICP备2026145820号-1';

export default function IcpFooter() {
  return (
    <footer className={styles.icpFooter}>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
        className={styles.icpLink}
      >
        {ICP_NUMBER}
      </a>
    </footer>
  );
}
