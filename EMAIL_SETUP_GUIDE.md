# Email Configuration Setup Guide

## Current Status
✅ Email verification system is implemented and working
✅ Test email service is configured (emails go to fake inbox)
❌ Real email delivery is not configured yet

## Why emails aren't being received
The system is currently using **Ethereal Email** (a test service) which creates fake emails that don't get delivered to real email addresses. To receive actual emails, you need to configure a real SMTP service.

## Setup Real Email Delivery

### Option 1: Gmail (Recommended)

1. **Enable 2-Step Verification** on your Gmail account:
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable "2-Step Verification"

2. **Generate App Password**:
   - Go to Google Account > Security > 2-Step Verification
   - Scroll down to "App passwords"
   - Select "Mail" and generate a password
   - Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

3. **Update .env file**:
   ```env
   EMAIL_USER=your-actual-email@gmail.com
   EMAIL_PASS=your-16-character-app-password
   EMAIL_FROM=VitalMatch <noreply@vitalmatch.com>
   BASE_URL=http://localhost:3000
   NODE_ENV=development
   ```

4. **Test the configuration**:
   ```bash
   node testEmail.js
   ```

5. **Send a test email**:
   ```bash
   node testEmail.js test-send your-email@example.com
   ```

### Option 2: Other Email Services

Update the email service configuration in `services/emailService.js`:

**For Outlook/Hotmail:**
```javascript
this.transporter = nodemailer.createTransporter({
  service: 'hotmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
```

**For Yahoo:**
```javascript
this.transporter = nodemailer.createTransporter({
  service: 'yahoo',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
```

**For Custom SMTP:**
```javascript
this.transporter = nodemailer.createTransporter({
  host: 'your-smtp-server.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
```

## Testing Email Functionality

1. **Check configuration**:
   ```bash
   node testEmail.js
   ```

2. **Send test email**:
   ```bash
   node testEmail.js test-send your-email@example.com
   ```

3. **Test registration flow**:
   - Start the server: `npm run xian`
   - Go to http://localhost:3000/register
   - Register with a real email address
   - Check your inbox for verification email

## Troubleshooting

### "Less secure app access" error (Gmail)
- Use App Password instead of regular password
- Make sure 2-Step Verification is enabled

### "Authentication failed" error
- Double-check email and password in .env
- Make sure there are no extra spaces
- For Gmail, use App Password, not regular password

### Emails going to spam
- Add your domain to email whitelist
- Use a proper "From" address
- Consider using a dedicated email service like SendGrid

### Still using test emails
- Make sure .env file has real credentials (not placeholder values)
- Restart the server after updating .env
- Check that EMAIL_USER is not "your-email@gmail.com"

## Current Email Templates

The system includes professional email templates for:
- ✅ Email verification
- ✅ Welcome email after verification
- ✅ Responsive HTML design
- ✅ VitalMatch branding

## Next Steps

1. Update .env with real Gmail credentials
2. Test email configuration
3. Test registration flow
4. Consider upgrading to dedicated email service for production