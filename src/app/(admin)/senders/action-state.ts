export type InviteActionState = {
  error: string | null;
  inviteUrl: string | null;
  expiresAt: string | null;
};

export const initialInviteActionState: InviteActionState = {
  error: null,
  inviteUrl: null,
  expiresAt: null,
};
