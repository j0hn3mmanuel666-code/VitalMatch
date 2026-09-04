
const data = new URLSearchParams();
data.append('firstName', 'Testbot3');
data.append('lastName', 'Testing');
data.append('email', 'testbot300@example.com');
data.append('password', 'password123');
data.append('confirmPassword', 'password123');
data.append('phone', '09123456789');
data.append('address', '123 Test St');
data.append('dateOfBirth', '2000-01-01');
data.append('gender', 'Male');

fetch('http://localhost:3000/register', {
  method: 'POST',
  body: data,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
}).then(r => r.text()).then(t => {
  const errMatch = t.match(/<p class=["']font-medium["']>(.*?)<\/p>/);
  console.log('Error found in HTML:', errMatch ? errMatch[1] : 'No error matched');
  console.log('Is Register Success?', t.includes('Almost There'));
});

