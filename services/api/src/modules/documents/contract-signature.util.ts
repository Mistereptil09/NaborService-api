import { Contract } from '../../database/mongo-schemas/schemas/contract.schema';

export type SignerRole = 'provider' | 'requester';

export type DocumentStatus =
  | 'pending_my_signature'
  | 'waiting_other_party'
  | 'fully_signed'
  | 'receipt';

export interface SignatureState {
  providerSignedAt: Date | null;
  requesterSignedAt: Date | null;
  fullySigned: boolean;
}

export function getSignatureState(contract: Contract): SignatureState {
  const provider = contract.signatures?.provider ?? null;
  const requester = contract.signatures?.requester ?? null;

  return {
    providerSignedAt: provider?.signed_at ?? null,
    requesterSignedAt: requester?.signed_at ?? null,
    fullySigned: !!(provider && requester),
  };
}

export function getUserRole(
  contract: Contract,
  userId: string,
): SignerRole | null {
  if (contract.parties?.provider?.pg_user_id === userId) return 'provider';
  if (contract.parties?.requester?.pg_user_id === userId) return 'requester';
  return null;
}

export function deriveStatus(
  contract: Contract,
  userId: string,
): DocumentStatus {
  if (contract.type === 'receipt') return 'receipt';

  const state = getSignatureState(contract);
  if (state.fullySigned) return 'fully_signed';

  const role = getUserRole(contract, userId);
  const mySignedAt =
    role === 'provider' ? state.providerSignedAt : state.requesterSignedAt;

  return mySignedAt ? 'waiting_other_party' : 'pending_my_signature';
}
