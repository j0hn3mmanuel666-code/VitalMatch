import fs from 'fs';

const data = new URLSearchParams();
data.append('firstName', 'Testbot4');
data.append('lastName', 'Testing');
data.append('email', 'testbot400@example.com');
data.append('password', 'Password123!');
data.append('confirmPassword', 'Password123!');
data.append('phone', '09123456789');
data.append('address', '123 Test St Barangay');
data.append('dateOfBirth', '2000-01-01');
data.append('gender', 'Male');

fetch('http://localhost:3000/register', {
  method: 'POST',
  body: data,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  }
}).then(r => r.text()).then(t => {
  fs.writeFileSync('C:\\Users\\Lourena\\Desktop\\VitalMatch\\lastResponse.html', t, 'utf8');
  console.log('Saved response to lastResponse.html');
});
