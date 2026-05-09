export interface AuthenticatedUser {
  authProviderId: string;
  email: string;
  displayName: string | null;
}
