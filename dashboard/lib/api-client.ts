// Cliente HTTP para a API NestJS (localhost:3001/api por padrao).
// JWT em localStorage; redireciona pra /login em 401.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const TOKEN_KEY = 'orthodontic_token';
const USER_KEY = 'orthodontic_user';

export interface User {
  id: number;
  email: string;
  nome: string;
  role: 'admin' | 'gerente';
  unidadeId: number | null;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setUser(user: User | null) {
  if (typeof window === 'undefined') return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const r = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (r.status === 401) {
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(401, null, 'Sessao expirada');
  }

  let body: unknown = null;
  try {
    body = await r.json();
  } catch {
    /* sem body */
  }

  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    if (body && typeof body === 'object' && 'message' in body) {
      msg = String((body as { message: unknown }).message);
    }
    throw new ApiError(r.status, body, msg);
  }

  return body as T;
}

export async function login(email: string, senha: string): Promise<{ token: string; user: User }> {
  const r = await api<{ access_token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, senha }),
  });
  setToken(r.access_token);
  setUser(r.user);
  return { token: r.access_token, user: r.user };
}

export function logout() {
  setToken(null);
  setUser(null);
  if (typeof window !== 'undefined') window.location.href = '/login';
}
