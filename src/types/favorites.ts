export interface UserFavorite {
  id: string;
  tenantId: string;
  userId: string;
  path: string;
  title: string;
  iconName?: string;
  groupTitle?: string;
  orderIndex: number;
  createdAt: string;
  updatedAt?: string;
}

export type ToggleFavoritePayload = Omit<UserFavorite, 'id' | 'createdAt' | 'orderIndex' | 'tenantId' | 'userId'> & {
  tenantId?: string;
  userId?: string;
};
