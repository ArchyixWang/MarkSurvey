import styles from './Brand.module.css';

interface BrandProps {
  compact?: boolean;
  subtitle?: string;
}

export function Brand({ compact = false, subtitle = '在线问卷系统' }: BrandProps) {
  return (
    <div className={styles.brand} data-compact={compact || undefined}>
      <span className={styles.mark} aria-hidden="true">
        M
      </span>
      <span className={styles.copy}>
        <span className={styles.name}>MarkSurvey</span>
        {!compact && <span className={styles.subtitle}>{subtitle}</span>}
      </span>
    </div>
  );
}
