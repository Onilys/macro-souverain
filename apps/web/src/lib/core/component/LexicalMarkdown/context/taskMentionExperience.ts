import type { useItemPreviewData } from '@core/component/ItemPreview';
import type { DocumentMentionDecoratorProps } from '@macro-inc/lexical-core';
import type { LexicalEditor, NodeKey } from 'lexical';
import type { Accessor, Component, JSX } from 'solid-js';

/** Task-specific presentation supplied by the editor host, without rollout state. */
export type TaskMentionPreviewProps = {
  previewData: ReturnType<typeof useItemPreviewData>;
  documentId: string;
  documentName?: string;
  collapsed?: boolean;
  isRecentMention: Accessor<boolean>;
  editor?: LexicalEditor;
  nodeKey: NodeKey;
  accessories: JSX.Element;
};

export type TaskMentionStaticProps = DocumentMentionDecoratorProps & {
  accessories: JSX.Element;
};

export type TaskMentionTriggerProps = {
  children: JSX.Element;
  editor?: LexicalEditor;
  nodeKey: NodeKey;
  selected: Accessor<boolean>;
  onOpen: (event: MouseEvent | KeyboardEvent | null) => void;
};

/** Omission preserves the standard mention implementation and its commands. */
export type TaskMentionExperience = {
  Preview: Component<TaskMentionPreviewProps>;
  Static: Component<TaskMentionStaticProps>;
  Trigger: Component<TaskMentionTriggerProps>;
  triggerClass?: string;
  triggerTabIndex?: number;
  /** Preserve input focus when the shared shell refreshes a serialized name. */
  nameUpdateTag?: string;
};
