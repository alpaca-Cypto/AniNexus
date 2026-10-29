import { request } from './client';

export const AUTH_CHANGED_EVENT = 'aninexus:auth-changed';

export interface AccountUser {
  id: number;
  username: string;
  created_at: string;
  is_owner: boolean;
}

export interface CaptchaChallenge {
  captcha_id: string;
  image_data_url: string;
  expires_in: number;
}

export interface AuthResult {
  user: AccountUser;
}

export interface Credentials {
  username: string;
  password: string;
  captcha_id: string;
  captcha_code: string;
}

export interface RegisterCredentials extends Credentials {
  invite_code: string;
}

export interface CollectionExport {
  format: string;
  username: string;
  exported_at: string;
  collections: unknown[];
}

export interface GeneratedInvites {
  codes: string[];
  expires_at: string;
}

export const accountService = {
  createInvites: (count: number, days: number) => request<GeneratedInvites>('/auth/invite-codes', {
    method: 'POST',
    body: JSON.stringify({ count, days }),
  }),
  config: () => request<{ invite_required: boolean; bangumi_sync_enabled: boolean }>('/auth/config'),
  captcha: () => request<CaptchaChallenge>('/auth/captcha', { method: 'POST' }),
  login: (credentials: Credentials) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  register: (credentials: RegisterCredentials) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  me: () => request<AccountUser>('/auth/me'),
  exportCollections: () => request<CollectionExport>('/auth/export'),
  deleteAccount: (password: string) => request<void>('/auth/me', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
