import {
  CheckCircleFilled,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Button, Flex, Skeleton, Slider, Typography } from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createCaptchaChallenge, verifyCaptcha } from '../api';
import type { CaptchaChallenge } from '../types';
import { errorMessage } from '../formErrors';
import styles from './SliderCaptcha.module.css';

const { Text } = Typography;

type CaptchaStatus = 'loading' | 'ready' | 'verifying' | 'verified' | 'load-error';

interface SliderCaptchaProps {
  onVerified: (token: string) => void;
}

export function SliderCaptcha({ onVerified }: SliderCaptchaProps) {
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [status, setStatus] = useState<CaptchaStatus>('loading');
  const [value, setValue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadChallenge = useCallback(async (clearError = true) => {
    const requestId = ++requestIdRef.current;
    setStatus('loading');
    setChallenge(null);
    setValue(0);
    if (clearError) {
      setError(null);
    }
    try {
      const nextChallenge = await createCaptchaChallenge();
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setChallenge(nextChallenge);
      setStatus('ready');
    } catch (requestError) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }
      setStatus('load-error');
      setError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const handleVerification = async (nextValue: number) => {
    if (!challenge || status !== 'ready') {
      return;
    }
    setStatus('verifying');
    setError(null);
    try {
      const result = await verifyCaptcha(challenge.challenge_id, Math.round(nextValue));
      if (!mountedRef.current) {
        return;
      }
      setStatus('verified');
      onVerified(result.captcha_token);
    } catch (requestError) {
      if (!mountedRef.current) {
        return;
      }
      setError(errorMessage(requestError));
      await loadChallenge(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className={styles.loading} aria-label="正在加载滑块验证">
        <Skeleton.Image active className={styles.skeleton} />
        <Skeleton.Input active block size="small" />
      </div>
    );
  }

  if (status === 'load-error' || !challenge) {
    return (
      <Flex vertical gap={12}>
        <Alert type="error" showIcon message="安全验证加载失败" description={error} />
        <Button icon={<ReloadOutlined />} onClick={() => void loadChallenge()}>
          重新加载
        </Button>
      </Flex>
    );
  }

  const maxOffset = challenge.image_width - challenge.piece_size;
  const pieceWidth = `${(challenge.piece_size / challenge.image_width) * 100}%`;
  const pieceLeft = `${(value / challenge.image_width) * 100}%`;
  const pieceTop = `${
    ((challenge.image_height - challenge.piece_size) / 2 / challenge.image_height) * 100
  }%`;
  const disabled = status === 'verifying' || status === 'verified';

  return (
    <Flex vertical gap={14} className={styles.root}>
      <Flex align="center" justify="space-between" gap={12}>
        <Text className={styles.instruction}>
          <SafetyCertificateOutlined /> 拖动滑块，将拼图对齐缺口
        </Text>
        {status === 'verified' && (
          <Text className={styles.successText}>
            <CheckCircleFilled /> 验证通过
          </Text>
        )}
      </Flex>

      <div
        className={styles.stage}
        style={{ aspectRatio: `${challenge.image_width} / ${challenge.image_height}` }}
      >
        <img
          className={styles.background}
          src={challenge.background_image}
          alt="滑块验证背景"
          draggable={false}
        />
        <img
          className={styles.piece}
          src={challenge.piece_image}
          alt=""
          draggable={false}
          style={{ width: pieceWidth, left: pieceLeft, top: pieceTop }}
        />
        {status === 'verified' && <div className={styles.verifiedOverlay} />}
      </div>

      <Slider
        ariaLabelForHandle="滑块位置"
        min={0}
        max={maxOffset}
        value={value}
        disabled={disabled}
        tooltip={{ formatter: () => null }}
        onChange={(nextValue) => setValue(Number(nextValue))}
        onChangeComplete={(nextValue) => void handleVerification(Number(nextValue))}
        className={styles.slider}
      />

      {error && <Alert type="error" showIcon message={error} />}
    </Flex>
  );
}
