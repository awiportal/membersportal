// Server-only CloudConvert client.
//
// Converts an uploaded Word (.docx) file to an exact-layout PDF using
// CloudConvert's LibreOffice engine, so the converted PDF can be fed into the
// existing PDF field-placement + signing flow unchanged (Phase 5b).
//
// Implemented with the built-in `fetch` only — NO new npm dependency. This file
// reads process.env.CLOUDCONVERT_API_KEY and MUST never be imported by client
// code.

const CC_BASE = 'https://api.cloudconvert.com/v2';

// Minimal shapes of the parts of the CloudConvert job response we read. Kept
// local and permissive on purpose — we only touch a few known fields.
type CcUploadForm = {
  url: string;
  parameters: Record<string, string>;
};
type CcExportFile = { url?: string; filename?: string };
type CcTask = {
  name: string;
  operation: string;
  status: string;
  message?: string | null;
  result?: {
    form?: CcUploadForm;
    files?: CcExportFile[];
  } | null;
};
type CcJob = {
  id: string;
  status: string; // 'waiting' | 'processing' | 'finished' | 'error'
  tasks?: CcTask[];
};

/**
 * Convert docx bytes to PDF bytes via CloudConvert.
 *
 * @throws Error('CLOUDCONVERT_NOT_CONFIGURED') when the API key is missing/empty.
 * @throws Error(<message>) on any conversion / transport failure.
 */
export async function convertDocxToPdf(
  bytes: Uint8Array,
  filename: string
): Promise<Uint8Array> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    throw new Error('CLOUDCONVERT_NOT_CONFIGURED');
  }

  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  // 1) Create a job: import/upload -> convert (libreoffice) -> export/url.
  const jobRes = await fetch(`${CC_BASE}/jobs`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tasks: {
        'import-docx': { operation: 'import/upload' },
        'convert-docx': {
          operation: 'convert',
          input: 'import-docx',
          input_format: 'docx',
          output_format: 'pdf',
          engine: 'libreoffice',
        },
        'export-pdf': { operation: 'export/url', input: 'convert-docx' },
      },
    }),
  });
  if (!jobRes.ok) {
    const detail = await safeText(jobRes);
    throw new Error(`CloudConvert job create failed (${jobRes.status})${detail}`);
  }
  const jobBody = (await jobRes.json()) as { data?: CcJob };
  const job = jobBody?.data;
  if (!job?.id || !job.tasks) {
    throw new Error('CloudConvert returned an unexpected job response.');
  }

  // 2) Upload the docx to the presigned form of the import/upload task.
  const importTask = job.tasks.find((t) => t.name === 'import-docx');
  const form = importTask?.result?.form;
  if (!form?.url || !form.parameters) {
    throw new Error('CloudConvert did not return an upload form.');
  }
  const upload = new FormData();
  for (const [k, v] of Object.entries(form.parameters)) {
    upload.append(k, v);
  }
  // The presigned form requires the file field LAST. No Authorization header:
  // form.url is a presigned upload endpoint (e.g. S3), not the CloudConvert API.
  upload.append('file', new Blob([bytes]), filename);
  const uploadRes = await fetch(form.url, { method: 'POST', body: upload });
  if (!uploadRes.ok) {
    const detail = await safeText(uploadRes);
    throw new Error(`CloudConvert upload failed (${uploadRes.status})${detail}`);
  }

  // 3) Poll the job until it finishes (about once per second, up to ~45s).
  const deadline = Date.now() + 45_000;
  let finished: CcJob | null = null;
  while (Date.now() < deadline) {
    await sleep(1000);
    const statusRes = await fetch(`${CC_BASE}/jobs/${job.id}`, { headers: authHeaders });
    if (!statusRes.ok) {
      // Transient status read errors: keep polling until the deadline.
      continue;
    }
    const statusBody = (await statusRes.json()) as { data?: CcJob };
    const current = statusBody?.data;
    if (!current) continue;
    if (current.status === 'finished') {
      finished = current;
      break;
    }
    if (current.status === 'error') {
      const failed = (current.tasks || []).find((t) => t.status === 'error');
      throw new Error(
        `CloudConvert conversion failed: ${failed?.message || 'unknown error'}`
      );
    }
  }
  if (!finished) {
    throw new Error('CloudConvert conversion timed out.');
  }

  // 4) Read the export/url task and download the resulting PDF.
  const exportTask = (finished.tasks || []).find(
    (t) => t.operation === 'export/url' || t.name === 'export-pdf'
  );
  const fileUrl = exportTask?.result?.files?.[0]?.url;
  if (!fileUrl) {
    throw new Error('CloudConvert did not return a converted file URL.');
  }
  const pdfRes = await fetch(fileUrl);
  if (!pdfRes.ok) {
    const detail = await safeText(pdfRes);
    throw new Error(`CloudConvert download failed (${pdfRes.status})${detail}`);
  }
  return new Uint8Array(await pdfRes.arrayBuffer());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = (await res.text()).trim();
    return t ? `: ${t.slice(0, 300)}` : '';
  } catch {
    return '';
  }
}
