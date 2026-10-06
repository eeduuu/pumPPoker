export function orderRoomListings<T extends { code: string }>(rooms: T[], inviteCode: string): T[] {
  const soughtCode = inviteCode.trim().toUpperCase();
  return [...rooms].sort((left, right) => Number(right.code === soughtCode) - Number(left.code === soughtCode));
}
