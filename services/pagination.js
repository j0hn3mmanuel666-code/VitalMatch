export function paginationFor(query = {}, total = 0, defaultLimit = 20) {
  const integer = (v, fallback) => /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : fallback;
  const limit = Math.min(integer(query.limit, defaultLimit), 100);
  const totalPages = Math.ceil(total / limit);
  const page = Math.min(integer(query.page, 1), Math.max(totalPages, 1));
  return { page, limit, total, totalPages, offset: (page - 1) * limit, hasNext: page < totalPages, hasPrev: page > 1 };
}
export function paginationLinks(pagination, pathname, query = {}, pageParam = 'page') {
  const url = page => {
    const params = new URLSearchParams(Object.entries(query).filter(([,v]) => typeof v === 'string'));
    params.set(pageParam, String(page)); params.set('limit', String(pagination.limit));
    return `${pathname}?${params}`;
  };
  return { ...pagination, pageParam, previousUrl: pagination.hasPrev ? url(pagination.page - 1) : null, nextUrl: pagination.hasNext ? url(pagination.page + 1) : null };
}
