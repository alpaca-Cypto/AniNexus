import { request } from './client';

export const AUTH_CHANGED_EVENT = 'aninexus:auth-changed';

export interface AccountUser {
  id: number;
  username: string;
  created_at: string;
}

export interface CaptchaChallenge {
  captcha_id: string;
  image_data_url: string;
  expires_in: number;
}

export interface AuthResult {
  access_token: string;
  token_type: string;
  user: AccountUser;
}

export interface Credentials {
  username: string;
  password: string;
  captcha_id: string;
  captcha_code: string;
}

export const accountService = {
  captcha: () => request<CaptchaChallenge>('/auth/captcha', { method: 'POST' }),
  login: (credentials: Credentials) =>
    request<AuthResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  register: (credentials: Credentials) =>
    request<AuthResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),
  me: () => request<AccountUser>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
};
