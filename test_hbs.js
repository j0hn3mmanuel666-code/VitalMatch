import fs from 'fs';
import Handlebars from 'handlebars';

try {
  const templateStr = fs.readFileSync('./views/admin-requests.xian', 'utf-8');
  Handlebars.registerHelper('eq', function(a, b) { return a === b; });
  Handlebars.registerPartial('admin-head', '');
  Handlebars.registerPartial('admin-sidebar', '');
  Handlebars.registerPartial('footer', '');
  const template = Handlebars.compile(templateStr);
  const data = {
    requests: [
      { id: 21, status: 'active', bloodType: 'AB-', unitsRequired: 1, hospitalName: 'Test', matchingDonors: [] }
    ]
  };
  const html = template(data);
  fs.writeFileSync('test_output.html', html);
  console.log("Template rendered successfully. Output length:", html.length);
  
  if (html.includes('schedule-modal-21')) {
    console.log('schedule-modal-21 exists!');
  } else {
    console.log('schedule-modal-21 NOT FOUND!');
  }
} catch (e) {
  console.error("Error:", e.message);
}
