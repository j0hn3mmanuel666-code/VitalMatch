import 'dotenv/config';
import { emailService } from './services/emailService.js';
const [command, recipient] = process.argv.slice(2);
if (command === 'test-send') {
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('Provide the intended test recipient');
  const result = await emailService.send(recipient,'VitalMatch SMTP delivery test',emailService.template('Operator','SMTP delivery test','This is an explicitly requested delivery test. No account or verification token was created.',`${emailService.baseUrl()}/login`,'Open VitalMatch'));
  console.log(result.success ? 'SMTP accepted the test message. Check the intended inbox and spam folder to confirm delivery.' : result.suppressed ? 'Sending was suppressed by the configured notification preferences.' : 'SMTP did not accept the test message. Check the configured provider.');
  if (!result.success) process.exitCode=1;
} else if (!command || command === 'verify') {
  console.log(`Transport: ${emailService.getStatus().mode}`);
  const verified = await emailService.testEmailConfiguration();
  console.log(verified ? 'SMTP connection and authentication verified; recipient delivery has not been tested.' : 'SMTP configuration is missing or the connection could not be verified.');
  if (!verified) process.exitCode=1;
} else { console.error('Usage: node testEmail.js [verify | test-send intended-recipient]');process.exitCode=1; }
