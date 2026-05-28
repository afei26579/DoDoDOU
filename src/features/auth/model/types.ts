export type AuthUser = {
  id: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  name: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'disabled' | 'deleted';
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  user: AuthUser | null;
};

export type LoginInput = {
  account: string;
  password: string;
};

export type RegisterInput = LoginInput & {
  passwordConfirm: string;
  verificationCode?: string;
};

export type PasswordResetInput = {
  account: string;
  password: string;
  passwordConfirm: string;
  verificationCode: string;
};

export type SendRegisterCodeInput = {
  account: string;
};

export type SendPasswordResetCodeInput = {
  account: string;
};

export type SendRegisterCodeResponse = {
  ok: true;
  expiresInSeconds: number;
  retryAfterSeconds: number;
};

export type PasswordResetResponse = {
  ok: true;
};
