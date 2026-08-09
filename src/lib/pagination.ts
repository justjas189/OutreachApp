export const RECIPIENT_PAGE_SIZE = 50;

export type Pagination = {
  page: number;
  pageCount: number;
  from: number;
  to: number;
};

export function getPagination(
  requestedPage: string | string[] | undefined,
  totalItems: number,
  pageSize = RECIPIENT_PAGE_SIZE,
): Pagination {
  const rawPage = Array.isArray(requestedPage) ? requestedPage[0] : requestedPage;
  const parsedPage = Number.parseInt(rawPage ?? "1", 10);
  const validPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(validPage, pageCount);
  const from = (page - 1) * pageSize;

  return {
    page,
    pageCount,
    from,
    to: from + pageSize - 1,
  };
}
