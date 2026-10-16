/** MIME type stored on new Desmos graph documents. */
export const DESMOS_MIME = 'application/x-macro-desmos';

export type Viewport = {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
};

export type Slider = {
  min: number;
  max: number;
  step: number | null;
};

export type Expression = {
  id: string;
  latex: string;
  color: string;
  hidden: boolean;
  slider?: Slider | null;
};

export type GraphDocument = {
  version: 1;
  viewport: Viewport;
  expressions: Expression[];
};

export type PlotItem =
  | { kind: 'polyline'; id: string; color: string; points: [number, number][] }
  | {
      kind: 'fill';
      id: string;
      color: string;
      rect: [number, number, number, number];
    }
  | { kind: 'point'; id: string; color: string; x: number; y: number }
  | { kind: 'error'; id: string; message: string };

export type PlotScene = {
  viewport: Viewport;
  items: PlotItem[];
  neededSliders: string[];
};

export const DESMOS_COLORS = [
  '#c74440',
  '#2d70b3',
  '#388c46',
  '#6042a6',
  '#fa7e19',
  '#000000',
] as const;

export function emptyDesmosDocument(): GraphDocument {
  return {
    version: 1,
    viewport: { xmin: -10, xmax: 10, ymin: -10, ymax: 10 },
    expressions: [
      {
        id: '1',
        latex: '',
        color: '#c74440',
        hidden: false,
      },
    ],
  };
}

export function serializeDesmosDocument(document: GraphDocument): string {
  return JSON.stringify(document);
}

export function parseDesmosDocument(source: string): GraphDocument | null {
  if (!source.trim()) return emptyDesmosDocument();
  try {
    const parsed = JSON.parse(source) as GraphDocument;
    if (parsed.version !== 1 || !Array.isArray(parsed.expressions)) return null;
    return parsed;
  } catch {
    return null;
  }
}
