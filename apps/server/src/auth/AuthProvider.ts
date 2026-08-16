export interface VerifiedIdentity {
  authUserId: string;
  displayName: string;
}

export interface AuthProvider {
  verifyToken(token: string): Promise<VerifiedIdentity | null>;
}
