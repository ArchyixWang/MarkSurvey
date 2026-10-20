export interface AuthUser {
  id: string;
  username: string;
  account: string;
  email: string;
  role: string;
}

export interface AuthTenant {
  id: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser;
  tenant: AuthTenant;
}

export type EmailPurpose = 'register' | 'email_login' | 'password_reset';

export interface CaptchaChallenge {
  challenge_id: string;
  background_image: string;
  piece_image: string;
  image_width: number;
  image_height: number;
  piece_size: number;
  expires_in: number;
}

export interface CaptchaVerification {
  captcha_token: string;
  expires_in: number;
}

export interface RegisterPayload {
  username: string;
  account: string;
  email: string;
  password: string;
  password_confirm: string;
  email_code: string;
}

export interface PasswordLoginPayload {
  identifier: string;
  password: string;
  captcha_token: string;
}

export interface EmailLoginPayload {
  email: string;
  email_code: string;
}

export interface PasswordResetPayload {
  email: string;
  email_code: string;
  new_password: string;
  password_confirm: string;
}

export interface EmailCodePayload {
  email: string;
  purpose: EmailPurpose;
  captcha_token: string;
}
