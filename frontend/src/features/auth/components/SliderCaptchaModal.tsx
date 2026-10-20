import { Modal } from 'antd';

import { SliderCaptcha } from './SliderCaptcha';
import styles from './SliderCaptchaModal.module.css';

interface SliderCaptchaModalProps {
  open: boolean;
  onCancel: () => void;
  onVerified: (token: string) => void;
  dismissible?: boolean;
}

export function SliderCaptchaModal({
  open,
  onCancel,
  onVerified,
  dismissible = true,
}: SliderCaptchaModalProps) {
  return (
    <Modal
      open={open}
      title="安全验证"
      footer={null}
      width={460}
      centered
      destroyOnHidden
      className={styles.modal}
      mask={{ closable: dismissible }}
      closable={dismissible}
      onCancel={onCancel}
    >
      <SliderCaptcha onVerified={onVerified} />
    </Modal>
  );
}
