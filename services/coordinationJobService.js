import { Op } from 'sequelize';
import { CoordinationJob } from '../models/coordinationJobModel.js';
import { BloodRequest } from '../models/bloodRequestModel.js';

export async function queueCoordination(request, { transaction, mode = 'normal', excludedUserIds = [] } = {}) {
  if (request.status !== 'active' || request.hospitalStatus !== 'approved') return null;
  const [job] = await CoordinationJob.findOrCreate({ where: { dedupeKey: `${request.id}:${request.version}:${mode}` }, defaults: { requestId: request.id, mode, excludedUserIds }, transaction });
  return job;
}
export async function dispatchCoordinationJobs(limit = 5) {
  await CoordinationJob.update({ status: 'pending', lockedAt: null }, { where: { status: 'processing', lockedAt: { [Op.lt]: new Date(Date.now() - 10 * 60000) } } });
  const jobs = await CoordinationJob.findAll({ where: { status: 'pending', nextAttemptAt: { [Op.lte]: new Date() } }, order: [['id', 'ASC']], limit });
  const { notifyNearestDonors, broadcastEmergency } = await import('./matchingService.js');
  for (const job of jobs) {
    const [claimed] = await CoordinationJob.update({ status: 'processing', lockedAt: new Date(), attempts: job.attempts + 1 }, { where: { id: job.id, status: 'pending' } });
    if (!claimed) continue;
    try {
      const request = await BloodRequest.findByPk(job.requestId);
      if (request?.status === 'active' && request.hospitalStatus === 'approved' && !request.archivedAt) {
        if (job.mode === 'emergency' && request.isEmergency && request.emergencyExpiresAt > new Date()) await broadcastEmergency(request);
        else if (job.mode !== 'emergency') await notifyNearestDonors(request, { excludeUserIds: job.excludedUserIds });
      }
      await job.update({ status: 'completed', lockedAt: null, lastError: null });
    } catch {
      await job.update({ status: job.attempts + 1 >= 5 ? 'failed' : 'pending', lockedAt: null, nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60000), lastError: 'Coordination dispatch failed. A coordinator can retry the job.' });
    }
  }
  return jobs.length;
}
