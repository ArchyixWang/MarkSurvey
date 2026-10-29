import { Descriptions, List, Tag, Typography } from 'antd';

import { questionTypeLabels } from '../../surveys/utils';
import type { LibraryQuestionContent } from '../types';
import styles from './QuestionContentPreview.module.css';

const { Text } = Typography;

export function QuestionContentPreview({ content }: { content: LibraryQuestionContent }) {
  return (
    <div className={styles.preview}>
      <div className={styles.heading}>
        <Tag variant="filled" color="blue">
          {questionTypeLabels[content.type]}
        </Tag>
        {content.required_by_default && (
          <Tag variant="filled" color="orange">
            默认必答
          </Tag>
        )}
      </div>
      <Text strong className={styles.title}>
        {content.title}
      </Text>
      {content.description && <Text type="secondary">{content.description}</Text>}

      {(content.type === 'single_choice' || content.type === 'multiple_choice') && (
        <List
          size="small"
          className={styles.options}
          dataSource={content.options}
          rowKey={(option) => option.id}
          renderItem={(option, index) => (
            <List.Item>
              <span className={styles.optionIndex}>{index + 1}</span>
              <Text>{option.label}</Text>
            </List.Item>
          )}
        />
      )}

      <Descriptions size="small" column={2} className={styles.constraints}>
        {content.type === 'multiple_choice' && (
          <>
            <Descriptions.Item label="最少选择">
              {content.min_selected ?? '不限'}
            </Descriptions.Item>
            <Descriptions.Item label="最多选择">
              {content.max_selected ?? '不限'}
            </Descriptions.Item>
          </>
        )}
        {content.type === 'text' && (
          <>
            <Descriptions.Item label="最少字数">
              {content.min_length ?? '不限'}
            </Descriptions.Item>
            <Descriptions.Item label="最多字数">
              {content.max_length ?? '不限'}
            </Descriptions.Item>
          </>
        )}
        {content.type === 'number' && (
          <>
            <Descriptions.Item label="最小值">
              {content.min_value ?? '不限'}
            </Descriptions.Item>
            <Descriptions.Item label="最大值">
              {content.max_value ?? '不限'}
            </Descriptions.Item>
            <Descriptions.Item label="整数">
              {content.integer_only ? '仅允许整数' : '允许小数'}
            </Descriptions.Item>
          </>
        )}
      </Descriptions>
    </div>
  );
}

