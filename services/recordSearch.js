import { Op } from 'sequelize';
import { paginationFor, paginationLinks } from './pagination.js';

export function searchTerm(query = {}) {
  return typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
}

// Compose with existing ownership/status predicates, including their OR groups.
// LIKE metacharacters are literal input, never an invitation to match every row.
export function withTextSearch(scope, term, fields, idField = 'id') {
  if (!term) return scope;
  const pattern = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
  const alternatives = fields.map(field => ({ [field]: { [Op.like]: pattern } }));
  const id = Number(term.replace('#', ''));
  if (idField && /^#?\d+$/.test(term) && Number.isSafeInteger(id) && id > 0) alternatives.push({ [idField]: id });
  return { [Op.and]: [scope, { [Op.or]: alternatives }] };
}

export async function recordPage(model, options, query, pathname, pageParam = 'page', limit = 25) {
  const total = await model.count({ where: options.where, include: options.include, distinct: true });
  const pagination = paginationLinks(paginationFor({ ...query, page: query[pageParam], limit }, total, limit), pathname, query, pageParam);
  const rows = await model.findAll({ ...options, limit: pagination.limit, offset: pagination.offset });
  return { count: total, rows, pagination };
}
