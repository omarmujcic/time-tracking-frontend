export interface AuthRequest {
  username: string;
  password: string;
}

export interface RegisterRequest extends AuthRequest {
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}
