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
};
