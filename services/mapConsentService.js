// Omitted fields in older clients never grant or revoke existing consent.
export function mapConsentUpdates(body, donor) {
  if (body.shareOnMap === undefined && body.mapConsentSubmitted !== '1') return {};
  const value = body.shareOnMap === true ? 'on' : body.shareOnMap === false ? 'off' : body.shareOnMap ?? 'off';
  if (!['on', 'off'].includes(value)) {
    const error = new Error('Choose whether to show your blood type and approximate city on the Blood Map.');
    error.status = 400;
    throw error;
  }
  const shareOnMap = value === 'on';
  return { shareOnMap, mapConsentUpdatedAt: shareOnMap !== Boolean(donor?.shareOnMap) ? new Date() : donor?.mapConsentUpdatedAt || null };
}
