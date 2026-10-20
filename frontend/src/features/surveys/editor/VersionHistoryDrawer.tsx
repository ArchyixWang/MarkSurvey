import { CopyOutlined, EyeOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  List,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';

import { copyVersionToDraft, getSurveyVersion, listSurveyVersions } from '../api';
import type { SurveyDetail, SurveyVersion, SurveyVersionSummary } from '../types';
import { errorMessage } from '../../auth/formErrors';
import { formatDateTime, questionTypeLabels } from '../utils';
import styles from './VersionHistoryDrawer.module.css';

const { Text } = Typography;

interface VersionHistoryDrawerProps {
  open: boolean;
  surveyId: string;
  onClose: () => void;
  onCopied: (detail: SurveyDetail) => void;
}

export function VersionHistoryDrawer({
  open,
  surveyId,
  onClose,
  onCopied,
}: VersionHistoryDrawerProps) {
  const { message, modal } = App.useApp();
  const [versions, setVersions] = useState<SurveyVersionSummary[]>([]);
  const [selected, setSelected] = useState<SurveyVersion | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    let active = true;
    setLoading(true);
    setSelected(null);
    listSurveyVersions(surveyId)
      .then((response) => {
        if (active) {
          setVersions(response);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          message.error(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [message, open, surveyId]);

  const inspectVersion = async (version: SurveyVersionSummary) => {
    setDetailLoadingId(version.id);
    try {
      setSelected(await getSurveyVersion(surveyId, version.id));
    } catch (requestError) {
      message.error(errorMessage(requestError));
    } finally {
      setDetailLoadingId(null);
    }
  };

  const copyVersion = (version: SurveyVersionSummary) => {
    modal.confirm({
      title: `复制 v${version.version_number} 到草稿？`,
      content: '当前草稿内容将被覆盖。',
      okText: '复制',
      cancelText: '取消',
      onOk: async () => {
        setCopying(true);
        try {
          const detail = await copyVersionToDraft(surveyId, version.id);
          onCopied(detail);
          message.success('版本已复制到草稿');
          onClose();
        } catch (requestError) {
          message.error(errorMessage(requestError));
        } finally {
          setCopying(false);
        }
      },
    });
  };

  return (
    <Drawer
      open={open}
      title="版本历史"
      size={620}
      onClose={onClose}
      className={styles.drawer}
      destroyOnHidden
    >
      {versions.length === 0 && !loading ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无版本" />
      ) : (
        <List
          loading={loading}
          dataSource={versions}
          rowKey="id"
          renderItem={(version) => (
            <List.Item
              actions={[
                <Button
                  key="inspect"
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  loading={detailLoadingId === version.id}
                  onClick={() => void inspectVersion(version)}
                >
                  查看
                </Button>,
                <Button
                  key="copy"
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  disabled={copying}
                  onClick={() => copyVersion(version)}
                >
                  复制为草稿
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8}>
                    <Text strong>v{version.version_number}</Text>
                    {version.active && (
                      <Tag variant="filled" color="green">
                        在线
                      </Tag>
                    )}
                  </Space>
                }
                description={formatDateTime(version.created_at)}
              />
            </List.Item>
          )}
        />
      )}

      {selected && (
        <section className={styles.snapshot}>
          <div className={styles.snapshotHeader}>
            <Text strong>v{selected.version_number} 快照</Text>
            <Button type="text" size="small" onClick={() => setSelected(null)}>
              收起
            </Button>
          </div>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="标题" span={2}>
              {selected.schema.title}
            </Descriptions.Item>
            <Descriptions.Item label="展示方式">
              {selected.schema.presentation.mode === 'paged' ? '分页' : '连续'}
            </Descriptions.Item>
            <Descriptions.Item label="题目数">
              {selected.schema.questions.length}
            </Descriptions.Item>
            <Descriptions.Item label="匿名" span={2}>
              {selected.schema.allow_anonymous ? '允许' : '不允许'}
            </Descriptions.Item>
          </Descriptions>
          <Collapse
            ghost
            items={selected.schema.questions.map((question, index) => ({
              key: question.id,
              label: `${index + 1}. ${question.title}`,
              children: (
                <Text type="secondary">
                  {questionTypeLabels[question.type]}
                  {question.required ? ' · 必答' : ''}
                </Text>
              ),
            }))}
          />
        </section>
      )}
    </Drawer>
  );
}
