// Express 4 does not automatically forward a rejected async route promise.
export const asyncHandler = (handler) => function (req, res, next) {
  try { Promise.resolve(handler(req, res, next)).catch(next); }
  catch (error) { next(error); }
};
