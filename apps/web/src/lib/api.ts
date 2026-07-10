const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Company {
  id: string;
  name: string;
  inn?: string | null;
  role: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  companies: Company[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function formatApiDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const loc = "loc" in item && Array.isArray(item.loc) ? item.loc.join(".") : "";
          return loc ? `${loc}: ${item.msg}` : String(item.msg);
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "Ошибка запроса";
}

function formatHttpError(status: number, statusText: string, detail: unknown): string {
  const msg = formatApiDetail(detail);
  if (status === 404) {
    return `${msg || statusText}. Перезапустите backend: make api (нужна версия с модулем проверки договоров)`;
  }
  if (status === 0 || statusText === "Failed to fetch") {
    return "Не удалось подключиться к API. Запустите: make api";
  }
  return msg || statusText;
}

async function deleteRequest(path: string, token: string): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, formatHttpError(res.status, res.statusText, data.detail));
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, formatHttpError(res.status, res.statusText, data.detail));
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string, full_name: string) =>
    request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name }),
    }),

  me: (token: string) =>
    request<AuthResponse>("/api/v1/auth/me", {}, token),

  companies: (token: string) =>
    request<Company[]>("/api/v1/companies", {}, token),

  createCompany: (token: string, name: string, inn?: string) =>
    request<Company>("/api/v1/companies", {
      method: "POST",
      body: JSON.stringify({ name, inn }),
    }, token),
};

export interface UploadedDocument {
  id: string;
  title: string;
  mime_type: string;
  word_count?: number | null;
  parsed_preview?: string | null;
  created_at: string;
}

export interface Finding {
  clause_ref: string;
  original_text: string;
  issue_type: string;
  severity: string;
  suggested_revision?: string | null;
  rationale: string;
}

export interface ReviewResult {
  risk_score?: number | null;
  risk_rationale?: string | null;
  findings: Finding[];
  multi_agent?: boolean;
  agents?: { agent: string; risk_score: number; findings_count: number }[];
}

export interface ReviewListItem {
  id: string;
  document_id: string;
  document_title: string;
  status: "pending" | "processing" | "completed" | "failed";
  review_mode: string;
  industry: string;
  multi_agent?: boolean;
  review_position?: string | null;
  risk_score?: number | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ReviewTask {
  id: string;
  document_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  review_mode: string;
  industry: string;
  multi_agent?: boolean;
  review_position?: string | null;
  user_comment?: string | null;
  reference_document_id?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  result?: ReviewResult | null;
}

async function uploadFile<T>(
  path: string,
  formData: FormData,
  token: string,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, formatHttpError(res.status, res.statusText, data.detail));
  }
  return res.json();
}

export interface DocumentListItem {
  id: string;
  title: string;
  mime_type: string;
  word_count?: number | null;
  created_at: string;
  review_count: number;
  last_review_task_id?: string | null;
  last_review_status?: string | null;
  last_review_risk_score?: number | null;
}

export const documentApi = {
  list: (token: string, companyId: string) =>
    request<DocumentListItem[]>(`/api/v1/documents?company_id=${companyId}`, {}, token),

  get: (token: string, documentId: string, companyId: string) =>
    request<UploadedDocument>(`/api/v1/documents/${documentId}?company_id=${companyId}`, {}, token),

  download: async (token: string, documentId: string, companyId: string): Promise<Blob> => {
    const res = await fetch(
      `${API_URL}/api/v1/documents/${documentId}/download?company_id=${companyId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, formatHttpError(res.status, res.statusText, data.detail));
    }
    return res.blob();
  },

  remove: (token: string, documentId: string, companyId: string) =>
    deleteRequest(`/api/v1/documents/${documentId}?company_id=${companyId}`, token),

  ragIndex: (token: string, documentId: string, companyId: string) =>
    request<{ document_id: string; chunks_indexed: number }>(
      `/api/v1/documents/${documentId}/rag/index?company_id=${companyId}`,
      { method: "POST" },
      token,
    ),
};

export interface SearchHit {
  document_id: string;
  document_title: string;
  chunk_index: number;
  content: string;
  distance?: number | null;
  metadata?: Record<string, unknown>;
}

export const ragApi = {
  search: (token: string, companyId: string, q: string, limit = 8) => {
    const params = new URLSearchParams({ company_id: companyId, q, limit: String(limit) });
    return request<{ query: string; hits: SearchHit[] }>(`/api/v1/documents/rag/search?${params}`, {}, token);
  },

  reindexAll: (token: string, companyId: string) =>
    request<{ scheduled: number }>(`/api/v1/documents/rag/reindex-all?company_id=${companyId}`, { method: "POST" }, token),
};

export const contractApi = {
  generate: (
    token: string,
    body: {
      company_id: string;
      company_name?: string;
      contract_type: string;
      our_position?: string;
      title: string;
      fields: Record<string, string>;
    },
  ) =>
    request<{ document_id: string; markdown: string }>(
      "/api/v1/contracts/generate",
      { method: "POST", body: JSON.stringify(body) },
      token,
    ),
};

export interface LegalWorkItem {
  id: string;
  company_id: string;
  kind: string;
  title: string;
  status: "pending" | "processing" | "completed" | "failed";
  input_json: Record<string, unknown>;
  result_json?: Record<string, unknown> | null;
  document_id?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export const consultingApi = {
  createMemo: (
    token: string,
    body: {
      company_id: string;
      company_name?: string;
      title?: string;
      topic: string;
      question: string;
      audience?: string;
      facts: string;
      instructions?: string;
    },
  ) =>
    request<LegalWorkItem>("/api/v1/consulting/memos", { method: "POST", body: JSON.stringify(body) }, token),

  listMemos: (token: string, companyId: string, limit = 20) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    return request<LegalWorkItem[]>(`/api/v1/consulting/memos?${params}`, {}, token);
  },

  getMemo: (token: string, companyId: string, id: string) =>
    request<LegalWorkItem>(`/api/v1/consulting/memos/${id}?company_id=${companyId}`, {}, token),

  deleteMemo: (token: string, companyId: string, id: string) =>
    deleteRequest(`/api/v1/consulting/memos/${id}?company_id=${companyId}`, token),

  exportMemo: async (token: string, companyId: string, id: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/api/v1/consulting/memos/${id}/export?company_id=${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Не удалось экспортировать");
    return res.blob();
  },

  reviewDecision: (
    token: string,
    body: {
      company_id: string;
      company_name?: string;
      title?: string;
      document_type?: string;
      document_id?: string;
      text_content?: string;
      comment?: string;
    },
  ) =>
    request<LegalWorkItem>(
      "/api/v1/consulting/decisions/review",
      { method: "POST", body: JSON.stringify(body) },
      token,
    ),

  listDecisions: (token: string, companyId: string, limit = 20) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    return request<LegalWorkItem[]>(`/api/v1/consulting/decisions?${params}`, {}, token);
  },

  getDecision: (token: string, companyId: string, id: string) =>
    request<LegalWorkItem>(`/api/v1/consulting/decisions/${id}?company_id=${companyId}`, {}, token),

  deleteDecision: (token: string, companyId: string, id: string) =>
    deleteRequest(`/api/v1/consulting/decisions/${id}?company_id=${companyId}`, token),

  exportDecision: async (token: string, companyId: string, id: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/api/v1/consulting/decisions/${id}/export?company_id=${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Не удалось экспортировать");
    return res.blob();
  },
};

export const litigationApi = {
  createClaim: (
    token: string,
    body: {
      company_id: string;
      company_name?: string;
      title?: string;
      claim_type?: string;
      counterparty: string;
      facts: string;
      demands: string;
      amount?: string;
      evidence?: string;
      instructions?: string;
    },
  ) =>
    request<LegalWorkItem>("/api/v1/litigation/claims", { method: "POST", body: JSON.stringify(body) }, token),

  listClaims: (token: string, companyId: string, limit = 20) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    return request<LegalWorkItem[]>(`/api/v1/litigation/claims?${params}`, {}, token);
  },

  getClaim: (token: string, companyId: string, id: string) =>
    request<LegalWorkItem>(`/api/v1/litigation/claims/${id}?company_id=${companyId}`, {}, token),

  deleteClaim: (token: string, companyId: string, id: string) =>
    deleteRequest(`/api/v1/litigation/claims/${id}?company_id=${companyId}`, token),

  exportClaim: async (token: string, companyId: string, id: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/api/v1/litigation/claims/${id}/export?company_id=${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Не удалось экспортировать");
    return res.blob();
  },

  createObjection: (
    token: string,
    body: {
      company_id: string;
      company_name?: string;
      title?: string;
      objection_type?: string;
      case_context: string;
      opponent_position: string;
      our_position: string;
      counter_arguments: string;
      instructions?: string;
    },
  ) =>
    request<LegalWorkItem>(
      "/api/v1/litigation/objections",
      { method: "POST", body: JSON.stringify(body) },
      token,
    ),

  listObjections: (token: string, companyId: string, limit = 20) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    return request<LegalWorkItem[]>(`/api/v1/litigation/objections?${params}`, {}, token);
  },

  getObjection: (token: string, companyId: string, id: string) =>
    request<LegalWorkItem>(`/api/v1/litigation/objections/${id}?company_id=${companyId}`, {}, token),

  deleteObjection: (token: string, companyId: string, id: string) =>
    deleteRequest(`/api/v1/litigation/objections/${id}?company_id=${companyId}`, token),

  exportObjection: async (token: string, companyId: string, id: string): Promise<Blob> => {
    const res = await fetch(`${API_URL}/api/v1/litigation/objections/${id}/export?company_id=${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new ApiError(res.status, "Не удалось экспортировать");
    return res.blob();
  },
};

export interface ActivityItem {
  id: string;
  kind: string;
  title: string;
  status: string;
  href: string;
  meta: Record<string, unknown>;
  created_at: string;
  completed_at?: string | null;
}

export interface ActivitySummary {
  pending_count: number;
  processing_count: number;
  items: ActivityItem[];
}

export const activityApi = {
  list: (token: string, companyId: string, limit = 20) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    return request<ActivitySummary>(`/api/v1/activity?${params}`, {}, token);
  },
};

export interface CounterpartyCheck {
  id: string;
  company_id: string;
  inn: string;
  status: "pending" | "processing" | "completed" | "failed";
  error_message?: string | null;
  result?: Record<string, unknown> | null;
  created_at: string;
  completed_at?: string | null;
}

export const counterpartyApi = {
  create: (token: string, companyId: string, inn: string, context?: string) =>
    request<CounterpartyCheck>(
      "/api/v1/counterparty/check",
      { method: "POST", body: JSON.stringify({ company_id: companyId, inn, context }) },
      token,
    ),

  list: (token: string, companyId: string, limit = 20) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    return request<CounterpartyCheck[]>(`/api/v1/counterparty?${params}`, {}, token);
  },

  get: (token: string, companyId: string, id: string) =>
    request<CounterpartyCheck>(`/api/v1/counterparty/${id}?company_id=${companyId}`, {}, token),
};

export interface DeadlineItem {
  category: string;
  description: string;
  deadline_text: string;
  deadline_type: string;
  party: string;
  clause_ref: string;
  notes: string;
}

export interface DeadlineExtraction {
  id: string;
  document_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  error_message?: string | null;
  summary?: string | null;
  items: DeadlineItem[];
  created_at: string;
  completed_at?: string | null;
}

export const deadlineApi = {
  extract: (token: string, documentId: string, companyId: string) =>
    request<DeadlineExtraction>(
      `/api/v1/documents/${documentId}/deadlines/extract?company_id=${companyId}`,
      { method: "POST" },
      token,
    ),

  getLatest: (token: string, documentId: string, companyId: string) =>
    request<DeadlineExtraction | null>(
      `/api/v1/documents/${documentId}/deadlines?company_id=${companyId}`,
      {},
      token,
    ),

  get: (token: string, documentId: string, extractionId: string, companyId: string) =>
    request<DeadlineExtraction>(
      `/api/v1/documents/${documentId}/deadlines/${extractionId}?company_id=${companyId}`,
      {},
      token,
    ),
};

export type ReferenceCategory = "standard_contract" | "checklist" | "compliance";

export interface ReferenceDocumentItem {
  id: string;
  document_id: string;
  category: ReferenceCategory;
  title: string;
  description?: string | null;
  is_active: boolean;
  file_title: string;
  word_count?: number | null;
  created_at: string;
}

export const referenceApi = {
  list: (token: string, companyId: string, activeOnly = false) =>
    request<ReferenceDocumentItem[]>(
      `/api/v1/reference-documents?company_id=${companyId}${activeOnly ? "&active_only=true" : ""}`,
      {},
      token,
    ),

  upload: async (
    token: string,
    data: {
      companyId: string;
      file: File;
      category: ReferenceCategory;
      title: string;
      description?: string;
    },
  ): Promise<ReferenceDocumentItem> => {
    const fd = new FormData();
    fd.append("file", data.file);
    fd.append("company_id", data.companyId);
    fd.append("category", data.category);
    fd.append("title", data.title);
    if (data.description) fd.append("description", data.description);
    return uploadFile<ReferenceDocumentItem>("/api/v1/reference-documents/upload", fd, token);
  },

  update: (
    token: string,
    id: string,
    companyId: string,
    body: Partial<Pick<ReferenceDocumentItem, "title" | "description" | "category" | "is_active">>,
  ) =>
    request<ReferenceDocumentItem>(
      `/api/v1/reference-documents/${id}?company_id=${companyId}`,
      { method: "PATCH", body: JSON.stringify(body) },
      token,
    ),

  remove: async (token: string, id: string, companyId: string): Promise<void> => {
    await deleteRequest(`/api/v1/reference-documents/${id}?company_id=${companyId}`, token);
  },
};

export const reviewApi = {
  checkApiReady: async (): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) return { ok: false, message: "API недоступен" };
      const data = await res.json();
      if (!data.modules?.reviews) {
        const ver = data.version ? ` (версия ${data.version})` : "";
        return {
          ok: false,
          message: `Устаревший backend${ver}. Выполните: make api-stop && make api`,
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: "API не запущен. Выполните: make api" };
    }
  },

  uploadDocument: (token: string, companyId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company_id", companyId);
    return uploadFile<UploadedDocument>("/api/v1/documents/upload", fd, token);
  },

  startReview: (
    token: string,
    data: {
      document_id: string;
      company_id: string;
      review_mode: string;
      industry: string;
      multi_agent?: boolean;
      review_position?: string;
      user_comment?: string;
      reference_document_id?: string;
    },
  ) =>
    request<ReviewTask>("/api/v1/reviews", {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  getReview: (token: string, taskId: string, companyId: string) =>
    request<ReviewTask>(`/api/v1/reviews/${taskId}?company_id=${companyId}`, {}, token),

  list: (token: string, companyId: string, limit = 20, documentId?: string) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    if (documentId) params.set("document_id", documentId);
    return request<ReviewListItem[]>(`/api/v1/reviews?${params}`, {}, token);
  },

  exportReview: async (token: string, taskId: string, companyId: string): Promise<Blob> => {
    const res = await fetch(
      `${API_URL}/api/v1/reviews/${taskId}/export?company_id=${companyId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, formatHttpError(res.status, res.statusText, data.detail));
    }
    return res.blob();
  },

  remove: (token: string, taskId: string, companyId: string) =>
    deleteRequest(`/api/v1/reviews/${taskId}?company_id=${companyId}`, token),
};

export interface ComparisonChange {
  change_type: string;
  clause_ref: string;
  original_text: string;
  revised_text: string;
  impact: string;
  severity: string;
  rationale: string;
}

export interface ComparisonResult {
  risk_delta?: number | null;
  summary?: string | null;
  changes: ComparisonChange[];
}

export interface ComparisonListItem {
  id: string;
  base_document_id: string;
  revised_document_id: string;
  base_document_title: string;
  revised_document_title: string;
  status: "pending" | "processing" | "completed" | "failed";
  risk_delta?: number | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ComparisonTask {
  id: string;
  base_document_id: string;
  revised_document_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  user_comment?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  result?: ComparisonResult | null;
}

export const comparisonApi = {
  checkApiReady: async (): Promise<{ ok: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_URL}/health`);
      if (!res.ok) return { ok: false, message: "API недоступен" };
      const data = await res.json();
      if (!data.modules?.comparisons) {
        const ver = data.version ? ` (версия ${data.version})` : "";
        return {
          ok: false,
          message: `Устаревший backend${ver}. Выполните: make api-stop && make api`,
        };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: "API не запущен. Выполните: make api" };
    }
  },

  uploadDocument: (token: string, companyId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("company_id", companyId);
    return uploadFile<UploadedDocument>("/api/v1/documents/upload", fd, token);
  },

  startComparison: (
    token: string,
    data: {
      base_document_id: string;
      revised_document_id: string;
      company_id: string;
      user_comment?: string;
    },
  ) =>
    request<ComparisonTask>("/api/v1/comparisons", {
      method: "POST",
      body: JSON.stringify(data),
    }, token),

  getComparison: (token: string, taskId: string, companyId: string) =>
    request<ComparisonTask>(`/api/v1/comparisons/${taskId}?company_id=${companyId}`, {}, token),

  list: (token: string, companyId: string, limit = 20, documentId?: string) => {
    const params = new URLSearchParams({ company_id: companyId, limit: String(limit) });
    if (documentId) params.set("document_id", documentId);
    return request<ComparisonListItem[]>(`/api/v1/comparisons?${params}`, {}, token);
  },

  exportComparison: async (token: string, taskId: string, companyId: string): Promise<Blob> => {
    const res = await fetch(
      `${API_URL}/api/v1/comparisons/${taskId}/export?company_id=${companyId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, formatHttpError(res.status, res.statusText, data.detail));
    }
    return res.blob();
  },

  remove: (token: string, taskId: string, companyId: string) =>
    deleteRequest(`/api/v1/comparisons/${taskId}?company_id=${companyId}`, token),
};

export interface PromptItem {
  key: string;
  category: string;
  title: string;
  description: string;
  default_content: string;
  user_addendum: string;
  content: string;
  is_customized: boolean;
  updated_at?: string | null;
}

export const promptApi = {
  list: (token: string) => request<PromptItem[]>("/api/v1/prompts", {}, token),

  update: (token: string, key: string, content: string) =>
    request<PromptItem>(
      `/api/v1/prompts/${encodeURIComponent(key)}`,
      { method: "PUT", body: JSON.stringify({ content }) },
      token,
    ),

  reset: (token: string, key: string) =>
    request<PromptItem>(
      `/api/v1/prompts/${encodeURIComponent(key)}/reset`,
      { method: "POST" },
      token,
    ),
};
