import { Op, Sequelize } from 'sequelize';
import { canonicalRole } from '../services/accountPolicy.js';

const categories = new Set(['general', 'ease_of_use', 'accessibility', 'bug', 'feature']);
let feedbackModelPromise;
const getFeedbackModel = () => feedbackModelPromise ||= import('../models/userFeedbackModel.js').then(module => module.UserFeedback);
const feedbackUnavailableMessage = error => error?.parent?.code === 'ER_NO_SUCH_TABLE'
  ? 'Feedback is not enabled until the system feedback database migration is applied.'
  : 'Feedback is temporarily unavailable. Please retry.';

export async function feedbackPage(req, res) {
  try {
    const UserFeedback = await getFeedbackModel();
    const submissions = await UserFeedback.findAll({
      where: { userId: req.authAccount.id },
      attributes: ['id', 'rating', 'category', 'comment', 'status', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 5
    });
    res.set('Cache-Control', 'private, no-store');
    return res.render('feedback', { title: 'Share feedback - VitalMatch', submissions });
  } catch (error) {
    res.status(503).render('feedback', { title: 'Feedback unavailable - VitalMatch', submissions: [], error_msg: feedbackUnavailableMessage(error) });
  }
}

export async function submitFeedback(req, res) {
  const rating = Number(req.body.rating);
  const category = typeof req.body.category === 'string' ? req.body.category : 'general';
  const comment = typeof req.body.comment === 'string' ? req.body.comment.trim() : '';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    if (req.get?.('Accept')?.includes('application/json')) return res.status(400).json({ success: false, error: 'Choose a rating from 1 to 5 stars.' });
    req.flash('error_msg', 'Choose a rating from 1 to 5 stars.');
    return res.redirect('/feedback');
  }
  if (!categories.has(category) || comment.length > 2000) {
    if (req.get?.('Accept')?.includes('application/json')) return res.status(400).json({ success: false, error: 'Choose a valid category and keep comments under 2,000 characters.' });
    req.flash('error_msg', 'Choose a valid category and keep comments under 2,000 characters.');
    return res.redirect('/feedback');
  }

  try {
    const UserFeedback = await getFeedbackModel();
    await UserFeedback.create({
      userId: req.authAccount.id,
      role: canonicalRole(req.authAccount.role),
      rating,
      category,
      comment: comment || null
    });
    res.set('Cache-Control', 'private, no-store');
    if (req.get?.('Accept')?.includes('application/json')) return res.status(201).json({ success: true, message: 'Thanks for sharing your feedback.' });
    req.flash('success_msg', 'Thanks for sharing your feedback. The VitalMatch team can now review it.');
    return res.redirect('/feedback');
  } catch (error) {
    const message = error?.parent?.code === 'ER_NO_SUCH_TABLE'
      ? 'Feedback is not enabled until the system feedback database migration is applied.'
      : 'Feedback could not be saved. Please try again.';
    if (req.get?.('Accept')?.includes('application/json')) return res.status(503).json({ success: false, error: message });
    req.flash('error_msg', message);
    return res.redirect('/feedback');
  }
}

export async function adminFeedbackPage(req, res) {
  try {
    const UserFeedback = await getFeedbackModel();
    const [result, newCount, average] = await Promise.all([
      UserFeedback.findAndCountAll({
        include: [{ association: 'author', attributes: ['id', 'firstName', 'lastName', 'email', 'role'], required: true }],
        order: [['createdAt', 'DESC']],
        limit: 200
      }),
      UserFeedback.count({ where: { status: 'new' } }),
      UserFeedback.findOne({ attributes: [[Sequelize.fn('AVG', Sequelize.col('rating')), 'averageRating']], raw: true })
    ]);
    res.set('Cache-Control', 'private, no-store');
    res.render('admin-feedback', {
      layout: 'admin',
      title: 'System Feedback - VitalMatch Admin',
      isFeedback: true,
      feedbackEntries: result.rows.map(row => row.toJSON()),
      totalFeedback: result.count,
      newFeedback: newCount,
      averageRating: Number(average?.averageRating || 0).toFixed(1),
      hasMoreFeedback: result.count > result.rows.length
    });
  } catch (error) {
    res.status(503).render('admin-feedback', {
      layout: 'admin', title: 'Feedback unavailable', isFeedback: true,
      feedbackEntries: [], totalFeedback: 0, newFeedback: 0, averageRating: '0.0',
      error: feedbackUnavailableMessage(error)
    });
  }
}

export async function markFeedbackReviewed(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).redirect('/admin/feedback');
  try {
    const UserFeedback = await getFeedbackModel();
    const [updated] = await UserFeedback.update(
      { status: 'reviewed', reviewedAt: new Date(), reviewedBy: req.authAccount.id },
      { where: { id, status: { [Op.ne]: 'reviewed' } } }
    );
    if (!updated) req.flash('error_msg', 'That feedback was already reviewed or no longer exists.');
    else req.flash('success_msg', 'Feedback marked as reviewed.');
  } catch {
    req.flash('error_msg', 'Could not update the feedback status. Please retry.');
  }
  return res.redirect('/admin/feedback');
}
