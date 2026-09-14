// Client-only pdf.js loader for in-browser PDF rendering.
//
// IMPORTANT: never import this from a server component, server action, route
// handler or any other server module. It dynamically imports `pdfjs-dist`, which
// is browser-only, and configures the worker via `import.meta.url`. It is used
// exclusively by the "use client" components PdfFieldPlacer and PdfSignOverlay.
//
// The module surface is deliberately narrow and locally typed so the app does not
// depend on pdfjs-dist's exact declaration shape.

export type PdfViewport = { width: number; height: number };

export type PdfPageProxy = {
  getViewport(opts: { scale: number }): PdfViewport;
  render(opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }): { promise: Promise<void>; cancel?: () => void };
};

export type PdfDocProxy = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy?: () => Promise<void>;
};

type PdfjsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): { promise: Promise<PdfDocProxy> };
};

let cached: PdfjsModule | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (cached) return cached;
  const mod = (await import('pdfjs-dist')) as unknown as PdfjsModule;
  // Bundled worker: Next/webpack rewrites this `new URL(..., import.meta.url)`
  // into a same-origin asset URL (allowed by the app's `worker-src 'self'` CSP).
  mod.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  cached = mod;
  return mod;
}

// Load a PDF document from raw bytes. The buffer is copied first because pdf.js
// transfers (detaches) the ArrayBuffer it is given.
export async function loadPdfDocument(data: Uint8Array): Promise<PdfDocProxy> {
  const pdfjs = await loadPdfjs();
  const bytes = data.slice(0);
  return pdfjs.getDocument({ data: bytes }).promise;
}

// Render one page (1-based, as pdf.js numbers them) into a canvas at `scale`,
// sizing the canvas bitmap to the scaled viewport. CSS controls the display size.
export async function renderPdfPageToCanvas(
  doc: PdfDocProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number
): Promise<{ width: number; height: number }> {
  const page = await doc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: viewport.width, height: viewport.height };
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvasContext: ctx, viewport }).promise;
  return { width: viewport.width, height: viewport.height };
}
