// web/src/canvas/panels/registry.ts
import { createElement, type JSX } from 'react';
import type { Panel, PanelType } from '../canvasTypes';
import { ConnectPanel } from './ConnectPanel';
import { NotePanel } from './NotePanel';
import { IntegrationsPanel } from './IntegrationsPanel';
import './panels.css';

export interface PanelComponentProps {
  panel: Panel;
  token: string | null;
  onClose(): void;
}

export const PANELS: Record<PanelType, (props: PanelComponentProps) => JSX.Element> = {
  connect: (props) => createElement(ConnectPanel, {
    provider: String(props.panel.args?.provider ?? ''),
    reason: props.panel.args?.reason as string | undefined,
    token: props.token,
    onClose: props.onClose,
  }),
  note: (props) => createElement(NotePanel, props),
  integrations: (props) => createElement(IntegrationsPanel, props),
};
